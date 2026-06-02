import chalk from "chalk";
import Table from "cli-table3";
import { Command } from "commander";
import type { Ora } from "ora";
import ora from "ora";
import type { AccountPosition } from "snaptrade-typescript-sdk";
import { listAccountsByConnection } from "../utils/accounts.ts";
import { getLastQuotes } from "../utils/quotes.ts";
import { selectAccount } from "../utils/selectAccount.ts";
import type { SnaptradeClient } from "../utils/snaptradeClient.ts";
import { loadOrRegisterUser } from "../utils/user.ts";

type AssetClass = "equity" | "option";

type Position = {
  symbol: string;
  quantity: number;
  costBasis?: number;
  brokeragePrice?: number;
  currency: string;
  assetClass: AssetClass;
};

type AggregatedPosition = {
  symbol: string;
  totalQuantity: number;
  totalCostBasis: number | undefined;
  avgCostBasis: number | undefined;
  currency: string;
  assetClass: AssetClass;
};

function parseNumber(value: string | number | null | undefined) {
  if (value == null) return undefined;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizePosition(position: AccountPosition): Position {
  const { instrument } = position;
  const isOption = instrument.kind === "option";
  const symbol = isOption
    ? instrument.underlying.raw_symbol || instrument.underlying.symbol
    : instrument.raw_symbol || instrument.symbol;

  return {
    symbol: symbol || "Unknown",
    quantity: parseNumber(position.units) ?? 0,
    costBasis: parseNumber(position.cost_basis),
    brokeragePrice: parseNumber(position.price),
    currency: position.currency || instrument.currency || "USD",
    assetClass: isOption ? "option" : "equity",
  };
}

function aggregatePositions(positions: Position[]): AggregatedPosition[] {
  const map = new Map<
    string,
    { totalQuantity: number; totalCostBasis?: number; assetClass: AssetClass }
  >();

  for (const pos of positions) {
    const key = `${pos.symbol}|${pos.currency}`;
    const existing = map.get(key);
    if (existing) {
      existing.totalQuantity += pos.quantity;
      // If a cost basis is missing for the position, we can't compute a total cost basis
      if (pos.costBasis != null && existing.totalCostBasis != null) {
        existing.totalCostBasis += pos.quantity * pos.costBasis;
      }
    } else {
      map.set(key, {
        totalQuantity: pos.quantity,
        totalCostBasis:
          pos.costBasis == null ? undefined : pos.quantity * pos.costBasis,
        assetClass: pos.assetClass,
      });
    }
  }

  // Convert map to array and compute average cost basis
  const result: AggregatedPosition[] = [];
  for (const [
    key,
    { totalQuantity, totalCostBasis, assetClass },
  ] of map.entries()) {
    const [symbol, currency] = key.split("|");
    result.push({
      symbol,
      totalQuantity,
      totalCostBasis,
      avgCostBasis:
        totalQuantity === 0
          ? 0
          : totalCostBasis != null
            ? totalCostBasis / totalQuantity
            : undefined,
      currency,
      assetClass,
    });
  }

  return result;
}
export function positionsCommand(snaptrade: SnaptradeClient): Command {
  return new Command("positions")
    .description("List all positions for a given account")
    .option(
      "--all",
      "List positions for all accounts. This could be slow if you have many accounts connected.",
    )
    .action(async (opts, command) => {
      const user = await loadOrRegisterUser(snaptrade);

      let spinner: Ora | undefined = undefined;
      const accounts = await (async () => {
        if (opts.all) {
          return (await listAccountsByConnection(snaptrade, user)).flatMap(
            ({ accounts }) => accounts,
          );
        }
        return [
          await selectAccount({
            snaptrade,
            useLastAccount: command.parent.opts().useLastAccount,
          }),
        ];
      })();

      if (opts.all) {
        spinner = ora(
          `Loading all positions... 0/${accounts.length} accounts`,
        ).start();
      }

      let completed = 0;
      const results = await Promise.all(
        accounts.map(async (account) => {
          const result =
            await snaptrade.accountInformation.getAllAccountPositions({
              ...user,
              accountId: account.id,
            });
          completed++;
          if (spinner) {
            spinner.text = `Loading all positions ... ${completed}/${accounts.length} accounts`;
          }
          return result;
        }),
      );

      if (spinner) {
        spinner.stop();
      }

      const combinedPositions: Position[] = [];
      for (const positions of results) {
        combinedPositions.push(
          ...positions.data.results.map(normalizePosition),
        );
      }

      const aggregatedPositions = aggregatePositions(combinedPositions).sort(
        (a, b) => a.symbol.localeCompare(b.symbol),
      );

      const symbols = aggregatedPositions.map((p) => p.symbol);
      const quotes = await getLastQuotes(symbols);
      for (const position of combinedPositions) {
        if (
          quotes[position.symbol]?.last == null &&
          position.brokeragePrice != null
        ) {
          quotes[position.symbol] = {
            last: position.brokeragePrice,
            currency: position.currency,
          };
        }
      }

      const table = new Table({
        head: [
          "Symbol",
          "Quantity",
          "Market Price",
          "Cost Basis",
          "Market Value",
          "PnL",
        ],
        colAligns: ["left", "right", "right", "right", "right", "right"],
      });

      for (const position of aggregatedPositions) {
        const currency = position.currency;
        const quote = quotes[position.symbol];
        const marketValue =
          quote?.last != null
            ? quote.last *
              position.totalQuantity *
              (position.assetClass === "option" ? 100 : 1)
            : undefined;
        const pnl =
          marketValue != null && position.avgCostBasis != null
            ? marketValue -
              position.avgCostBasis *
                position.totalQuantity *
                (position.assetClass === "option" ? 100 : 1)
            : undefined;
        table.push([
          position.symbol,
          position.totalQuantity,
          quote?.last?.toLocaleString("en-US", {
            style: "currency",
            currency: quote?.currency,
          }) || "N/A",
          position.avgCostBasis?.toLocaleString("en-US", {
            style: "currency",
            currency,
          }) || "N/A",
          marketValue?.toLocaleString("en-US", {
            style: "currency",
            currency: quote?.currency,
          }) ?? "N/A",

          pnl == null
            ? "N/A"
            : (() => {
                const formatted = pnl.toLocaleString("en-US", {
                  style: "currency",
                  currency: quote?.currency,
                });
                return pnl > 0
                  ? chalk.green(formatted)
                  : pnl < 0
                    ? chalk.red(formatted)
                    : formatted;
              })(),
        ]);
      }

      console.log(table.toString());
    });
}
