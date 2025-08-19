import Table from "cli-table3";
import { Command } from "commander";
import type { Ora } from "ora";
import ora from "ora";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { selectAccount } from "../utils/selectAccount.ts";
import { loadOrRegisterUser } from "../utils/user.ts";
import { getYahooQuotesForSymbols } from "../utils/quotes.ts";
import chalk from "chalk";

type AssetClass = "equity" | "option";

type Position = {
  symbol: string;
  quantity: number;
  costBasis?: number;
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
export function positionsCommand(snaptrade: Snaptrade): Command {
  return new Command("positions")
    .description("List all positions for a given account")
    .option(
      "--all",
      "List positions for all accounts. This could be slow if you have many accounts connected."
    )
    .action(async (opts, command) => {
      const user = await loadOrRegisterUser(snaptrade);

      let spinner: Ora | undefined = undefined;
      const accounts = await (async () => {
        if (opts.all) {
          return (await snaptrade.accountInformation.listUserAccounts(user))
            .data;
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
          `Loading all positions... 0/${accounts.length} accounts`
        ).start();
      }

      let completed = 0;
      const results = await Promise.all(
        accounts.map(async (account) => {
          const result = await Promise.all([
            snaptrade.accountInformation.getUserAccountPositions({
              ...user,
              accountId: account.id,
            }),
            snaptrade.options.listOptionHoldings({
              ...user,
              accountId: account.id,
            }),
          ]);
          completed++;
          if (spinner) {
            spinner.text = `Loading all positions ... ${completed}/${accounts.length} accounts`;
          }
          return result;
        })
      );

      if (spinner) {
        spinner.stop();
      }

      const combinedPositions: Position[] = [];
      for (const [positions, optionPositions] of results) {
        for (const position of positions.data) {
          combinedPositions.push({
            symbol: position.symbol?.symbol?.symbol || "Unknown",
            quantity: position.units || 0,
            costBasis: position.average_purchase_price ?? undefined,
            currency: position.symbol?.symbol?.currency.code || "USD",
            assetClass: "equity",
          });
        }

        for (const optionPosition of optionPositions.data) {
          combinedPositions.push({
            symbol: optionPosition.symbol?.option_symbol?.ticker || "Unknown",
            quantity: optionPosition.units || 0,
            // option cost basis is per contract, but we want to show it per share
            costBasis: optionPosition.average_purchase_price
              ? optionPosition.average_purchase_price! / 100
              : undefined,

            currency:
              optionPosition.symbol?.option_symbol?.underlying_symbol.currency
                ?.code || "USD",
            assetClass: "option",
          });
        }
      }

      const aggregatedPositions = aggregatePositions(combinedPositions).sort(
        (a, b) => a.symbol.localeCompare(b.symbol)
      );

      const symbols = aggregatedPositions.map((p) => p.symbol);
      const quotes = await getYahooQuotesForSymbols(symbols, [
        "regularMarketPrice",
        "currency",
      ]);

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
        const marketValue = quote?.regularMarketPrice
          ? quote?.regularMarketPrice *
            position.totalQuantity *
            (position.assetClass === "option" ? 100 : 1)
          : undefined;
        const pnl =
          marketValue && position.avgCostBasis
            ? marketValue -
              position.avgCostBasis *
                position.totalQuantity *
                (position.assetClass === "option" ? 100 : 1)
            : undefined;
        table.push([
          position.symbol,
          position.totalQuantity,
          quote?.regularMarketPrice?.toLocaleString("en-US", {
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
            : pnl > 0
              ? (chalk.green(
                  pnl.toLocaleString("en-US", {
                    style: "currency",
                    currency: quote?.currency,
                  })
                ) ?? "N/A")
              : chalk.red(
                  pnl.toLocaleString("en-US", {
                    style: "currency",
                    currency: quote?.currency,
                  })
                ),
        ]);
      }

      console.log(table.toString());
    });
}
