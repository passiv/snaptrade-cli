import Table from "cli-table3";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { selectAccount } from "../utils/selectAccount.ts";
import { loadOrRegisterUser } from "../utils/user.ts";
import { generateOccSymbol } from "../utils/generateOccSymbol.ts";

type Position = {
  symbol: string;
  quantity: number;
  costBasis: string;
};
export function positionsCommand(snaptrade: Snaptrade): Command {
  return new Command("positions")
    .description("List all positions for a given account")
    .action(async (opts, command) => {
      const user = await loadOrRegisterUser(snaptrade);
      const account = await selectAccount({
        snaptrade,
        context: "positions",
        useLastAccount: command.parent.opts().useLastAccount,
      });

      const [positions, optionPositions] = await Promise.all([
        snaptrade.accountInformation.getUserAccountPositions({
          ...user,
          accountId: account.id,
        }),
        snaptrade.options.listOptionHoldings({
          ...user,
          accountId: account.id,
        }),
      ]);

      const combinedPositions: Position[] = [];
      for (const position of positions.data) {
        combinedPositions.push({
          symbol: position.symbol?.symbol?.symbol || "Unknown",
          quantity: position.units || 0,
          costBasis:
            position.average_purchase_price?.toLocaleString("en-US", {
              style: "currency",
              currency: position.symbol?.symbol?.currency.code,
            }) || "N/A",
        });
      }

      for (const optionPosition of optionPositions.data) {
        combinedPositions.push({
          symbol: optionPosition.symbol?.option_symbol?.ticker || "Unknown",
          quantity: optionPosition.units || 0,
          // option cost basis is per contract, but we want to show it per share
          costBasis: (
            optionPosition.average_purchase_price! / 100
          ).toLocaleString("en-US", {
            style: "currency",
            currency:
              optionPosition.symbol?.option_symbol?.underlying_symbol.currency
                ?.code,
          }),
        });
      }

      // sort by symbol
      combinedPositions.sort((a, b) => a.symbol.localeCompare(b.symbol));

      const table = new Table({
        head: ["Symbol", "Quantity", "Cost Basis"],
      });

      for (const position of combinedPositions) {
        table.push([position.symbol, position.quantity, position.costBasis]);
      }

      console.log(table.toString());
    });
}
