import chalk from "chalk";
import Table from "cli-table3";
import { Command } from "commander";
import ora from "ora";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { computeChandelierStop } from "../utils/atr.ts";
import { getLastQuotes } from "../utils/quotes.ts";
import { loadOrRegisterUser } from "../utils/user.ts";

type StopStatus = "MISSING" | "ADJUST" | "OK";

function isStopOrder(orderType?: string | null): boolean {
  if (!orderType) return false;
  const t = orderType.toLowerCase();
  // Covers "Stop", "StopLimit", "TrailingStop", IBKR's "STP", "STP LMT", "TRAIL"
  return t.includes("stop") || t === "stp" || t.startsWith("stp ") || t.includes("trail");
}

function isSellAction(action?: string | null): boolean {
  if (!action) return false;
  return action.toUpperCase().startsWith("SELL");
}

const LIVE_STATUSES = new Set([
  "NONE",
  "PENDING",
  "ACCEPTED",
  "QUEUED",
  "TRIGGERED",
  "ACTIVATED",
  "PARTIAL",
  "REPLACE_PENDING",
  "REPLACED",
  "CANCEL_PENDING",
]);

function isLiveStop(status?: string | null): boolean {
  if (!status) return true; // no status = assume live
  return LIVE_STATUSES.has(status.toUpperCase());
}

function formatAccountLabel(account: {
  name?: string | null;
  number: string;
  institution_name?: string | null;
}): string {
  const base = `${account.name || "Account"} (${account.number})`;
  return account.institution_name ? `${base} · ${account.institution_name}` : base;
}

export function auditStopCommand(snaptrade: Snaptrade): Command {
  return new Command("audit-stop")
    .description(
      "Audit equity holdings against an ATR-based chandelier stop formula"
    )
    .option("--atr-period <n>", "ATR period (default 14)", "14")
    .option(
      "--lookback <n>",
      "Highest-close lookback window in trading days (default 22)",
      "22"
    )
    .option("--multiplier <n>", "ATR multiplier (default 3)", "3")
    .option(
      "--tolerance <pct>",
      "Pct drift that flags ADJUST rather than OK (default 5)",
      "5"
    )
    .option("--debug", "Print per-account position/order counts and dropped rows")
    .option(
      "--dump-orders",
      "Dump raw stop-like orders to stdout (useful for broker-specific debugging)"
    )
    .action(async (opts) => {
      const atrPeriod = parseInt(opts.atrPeriod, 10);
      const lookback = parseInt(opts.lookback, 10);
      const multiplier = parseFloat(opts.multiplier);
      const tolerance = parseFloat(opts.tolerance) / 100;

      const user = await loadOrRegisterUser(snaptrade);

      const accounts = (
        await snaptrade.accountInformation.listUserAccounts(user)
      ).data;

      if (accounts.length === 0) {
        console.log("⚠️ No accounts connected.");
        return;
      }

      const spinner = ora(
        `Loading positions and orders... 0/${accounts.length} accounts`
      ).start();

      let completed = 0;
      const perAccount = await Promise.all(
        accounts.map(async (account) => {
          const [positions, orders] = await Promise.all([
            snaptrade.accountInformation.getUserAccountPositions({
              ...user,
              accountId: account.id,
            }),
            snaptrade.accountInformation.getUserAccountOrders({
              ...user,
              accountId: account.id,
              state: "open",
            }),
          ]);
          completed++;
          spinner.text = `Loading positions and orders... ${completed}/${accounts.length} accounts`;
          return { account, positions: positions.data, orders: orders.data };
        })
      );

      spinner.text = "Computing ATR stops...";

      type Row = {
        accountLabel: string;
        symbol: string;
        quantity: number;
        currency: string;
      };

      const rows: Row[] = [];
      const symbolSet = new Set<string>();
      const debug: string[] = [];
      for (const { account, positions, orders } of perAccount) {
        const accountLabel = formatAccountLabel(account);
        const stopOrderCount = (orders || []).filter((o) =>
          isStopOrder(o.order_type)
        ).length;
        debug.push(
          `${accountLabel}: ${positions.length} positions, ${(orders || []).length} open orders (${stopOrderCount} stop)`
        );
        const typeCounts = new Map<string, number>();
        const actionCounts = new Map<string, number>();
        const statusCounts = new Map<string, number>();
        let withStopPrice = 0;
        let withLimitPrice = 0;
        let withPrice = 0;
        for (const o of orders || []) {
          const ot = String(o.order_type ?? "<null>");
          typeCounts.set(ot, (typeCounts.get(ot) || 0) + 1);
          const act = String(o.action ?? "<null>");
          actionCounts.set(act, (actionCounts.get(act) || 0) + 1);
          const st = String(o.status ?? "<null>");
          statusCounts.set(st, (statusCounts.get(st) || 0) + 1);
          if (o.stop_price != null) withStopPrice++;
          if ((o as { limit_price?: unknown }).limit_price != null)
            withLimitPrice++;
          if ((o as { price?: unknown }).price != null) withPrice++;
        }
        const fmtCounts = (m: Map<string, number>) =>
          [...m.entries()].map(([k, v]) => `${k}×${v}`).join(", ");
        if (typeCounts.size > 0) {
          debug.push(`  order_type: ${fmtCounts(typeCounts)}`);
          debug.push(`  action: ${fmtCounts(actionCounts)}`);
          debug.push(`  status: ${fmtCounts(statusCounts)}`);
          debug.push(
            `  populated: stop_price=${withStopPrice}, limit_price=${withLimitPrice}, price=${withPrice}`
          );
        }
        for (const p of positions) {
          const symbol = p.symbol?.symbol?.symbol;
          const qty = p.units || 0;
          if (!symbol) {
            debug.push(`  SKIP: position with no symbol (units=${qty})`);
            continue;
          }
          if (qty <= 0) {
            debug.push(`  SKIP ${symbol}: qty=${qty} (short or zero)`);
            continue;
          }
          symbolSet.add(symbol);
          rows.push({
            accountLabel,
            symbol,
            quantity: qty,
            currency: p.symbol?.symbol?.currency.code || "USD",
          });
        }
      }

      const symbols = [...symbolSet];
      const [quotes, stopResults] = await Promise.all([
        getLastQuotes(symbols),
        Promise.all(
          symbols.map(async (s) => [
            s,
            await computeChandelierStop({
              symbol: s,
              atrPeriod,
              lookback,
              multiplier,
            }),
          ] as const)
        ),
      ]);
      const stopsBySymbol = Object.fromEntries(stopResults);

      spinner.stop();

      const existingStopBy = new Map<string, number>();
      const dumpedOrders: unknown[] = [];
      for (const { account, orders } of perAccount) {
        if (!orders) continue;
        for (const order of orders) {
          if (opts.dumpOrders) dumpedOrders.push(order);
          const stopLike = isStopOrder(order.order_type);
          if (!stopLike) continue;
          if (!isLiveStop(order.status)) {
            debug.push(
              `  Skip stop in ${account.number}: status=${order.status} type=${order.order_type}`
            );
            continue;
          }
          if (!isSellAction(order.action)) {
            debug.push(
              `  Skip stop in ${account.number}: action=${order.action} type=${order.order_type}`
            );
            continue;
          }
          const symbol = order.universal_symbol?.symbol;
          const stopPrice = order.stop_price;
          if (!symbol || stopPrice == null) {
            debug.push(
              `  Skip stop in ${account.number}: symbol=${symbol} stop=${stopPrice} type=${order.order_type}`
            );
            continue;
          }
          const key = `${account.id}|${symbol}`;
          const prev = existingStopBy.get(key);
          if (prev == null || stopPrice < prev) {
            existingStopBy.set(key, stopPrice);
          }
        }
      }

      if (opts.dumpOrders) {
        console.log(chalk.dim("\n--- raw stop-like orders ---"));
        console.log(JSON.stringify(dumpedOrders, null, 2));
      }

      const accountIdByLabel = new Map<string, string>();
      const zeroOrderAccounts = new Set<string>();
      for (const { account, orders } of perAccount) {
        const label = formatAccountLabel(account);
        accountIdByLabel.set(label, account.id);
        if (!orders || orders.length === 0) {
          zeroOrderAccounts.add(label);
        }
      }

      rows.sort(
        (a, b) =>
          a.accountLabel.localeCompare(b.accountLabel) ||
          a.symbol.localeCompare(b.symbol)
      );

      const fmt = (value: number | undefined, currency: string) =>
        value == null
          ? "N/A"
          : value.toLocaleString("en-US", { style: "currency", currency });

      const rowsByAccount = new Map<string, Row[]>();
      for (const row of rows) {
        const bucket = rowsByAccount.get(row.accountLabel);
        if (bucket) bucket.push(row);
        else rowsByAccount.set(row.accountLabel, [row]);
      }

      let firstTable = true;
      for (const [accountLabel, accountRows] of rowsByAccount) {
        const accountId = accountIdByLabel.get(accountLabel)!;
        const table = new Table({
          head: [
            "Symbol",
            "Qty",
            "Price",
            "Target Stop",
            "Current Stop",
            "Drift",
            "Status",
          ],
          colAligns: [
            "left",
            "right",
            "right",
            "right",
            "right",
            "right",
            "left",
          ],
        });

        for (const row of accountRows) {
          const target = stopsBySymbol[row.symbol];
          const existing = existingStopBy.get(`${accountId}|${row.symbol}`);
          const quote = quotes[row.symbol];

          let status: StopStatus;
          let driftLabel = "-";
          if (existing == null) {
            status = "MISSING";
          } else if (target == null) {
            status = "OK";
            driftLabel = "no target";
          } else {
            const drift = (existing - target.price) / target.price;
            driftLabel = `${(drift * 100).toFixed(1)}%`;
            status = Math.abs(drift) <= tolerance ? "OK" : "ADJUST";
          }

          const statusCell =
            status === "OK"
              ? chalk.green(status)
              : status === "ADJUST"
                ? chalk.yellow(status)
                : chalk.red(status);

          table.push([
            row.symbol,
            row.quantity,
            fmt(quote?.last, quote?.currency || row.currency),
            fmt(target?.price, row.currency),
            fmt(existing, row.currency),
            driftLabel,
            statusCell,
          ]);
        }

        if (!firstTable) console.log();
        firstTable = false;
        console.log(chalk.bold(accountLabel));
        if (zeroOrderAccounts.has(accountLabel)) {
          console.log(
            chalk.yellow(
              "  ⚠ SnapTrade returned no open orders for this account — \"Current Stop\" cannot be determined. Verify at your broker directly."
            )
          );
        }
        console.log(table.toString());
      }
      console.log(
        chalk.dim(
          `\nFormula: highest_close(${lookback}) − ${multiplier} × ATR(${atrPeriod}). Tolerance: ±${(tolerance * 100).toFixed(0)}%.`
        )
      );

      if (opts.debug) {
        console.log(chalk.dim("\n--- debug ---"));
        for (const line of debug) console.log(chalk.dim(line));
        console.log(
          chalk.dim(
            `rows=${rows.length} symbols=${symbols.length} stops_indexed=${existingStopBy.size}`
          )
        );
      }
    });
}
