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
export function quoteCommand(snaptrade: Snaptrade): Command {
  return new Command("quote")
    .description("Get the current quote for a given symbol")
    .argument("<symbol>", "The symbol to get the quote for")
    .action(async (symbol, command) => {
      const user = await loadOrRegisterUser(snaptrade);
      const account = await selectAccount({
        snaptrade,
        useLastAccount: command.parent.opts().useLastAccount,
      });

      const response = await snaptrade.trading.getUserAccountQuotes({
        ...user,
        accountId: account.id,
        symbols: symbol,
      });
      console.log("response", response.data);
      //   const table = new Table({
      //     head: ["Symbol", "Last Price", "Bid", "Ask", "Volume"],
      //   });

      //   if (response.data.quotes.length === 0) {
      //     console.log("No quotes found for the given symbol.");
      //     return;
      //   }

      //   for (const quote of response.data.quotes) {
      //     table.push([
      //       quote.symbol,
      //       quote.last_price?.toLocaleString("en-US", {
      //         style: "currency",
      //         currency: quote.currency,
      //       }),
      //       quote.bid?.toLocaleString("en-US", {
      //         style: "currency",
      //         currency: quote.currency,
      //       }),
      //       quote.ask?.toLocaleString("en-US", {
      //         style: "currency",
      //         currency: quote.currency,
      //       }),
      //       quote.volume,
      //     ]);
      //   }

      //   console.log(table.toString());
      // }).catch((error) => {
      //   console.error("Error fetching quotes:", error);
      // });
    });
}
