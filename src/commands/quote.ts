import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { selectAccount } from "../utils/selectAccount.ts";
import { loadOrRegisterUser } from "../utils/user.ts";
import Table from "cli-table3";

export function quoteCommand(snaptrade: Snaptrade): Command {
  return new Command("quote")
    .description(
      "Get the current quote for a given symbol or a comma-separated list of symbols"
    )
    .argument(
      "<symbols>",
      "The symbol to get the quote for. Can be a single symbol or a comma-separated list of symbols"
    )
    .action(async (symbol, opts, command) => {
      const user = await loadOrRegisterUser(snaptrade);
      const account = await selectAccount({
        snaptrade,
        useLastAccount: command.parent.opts().useLastAccount,
      });

      const response = await snaptrade.trading.getUserAccountQuotes({
        ...user,
        accountId: account.id,
        symbols: symbol,
        useTicker: true,
      });
      console.log(`Request ID: ${response.headers["x-request-id"]}`);
      // console.dir(response.data, { depth: null, colors: true });

      const table = new Table({
        head: ["Symbol", "Bid", "Ask", "Last"],
      });

      for (const quote of response.data) {
        table.push([
          quote.symbol?.symbol,
          `${quote.bid_price?.toLocaleString("en-US", {
            style: "currency",
            currency: quote.symbol?.currency.code,
          })} x${quote.bid_size}`,
          `${quote.ask_price?.toLocaleString("en-US", {
            style: "currency",
            currency: quote.symbol?.currency.code,
          })} x${quote.ask_size}`,
          quote.last_trade_price?.toLocaleString("en-US", {
            style: "currency",
            currency: quote.symbol?.currency.code,
          }),
        ]);
      }

      console.log(table.toString());
    });
}
