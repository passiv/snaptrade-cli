import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import Table from "cli-table3";
import { generateOccSymbol } from "../utils/generateOccSymbol.ts";
import { selectAccount } from "../utils/selectAccount.ts";
import { loadOrRegisterUser } from "../utils/user.ts";
import { withDebouncedSpinner } from "../utils/withDebouncedSpinner.ts";

export function optionQuoteCommand(snaptrade: Snaptrade): Command {
  return new Command("option-quote")
    .description("Get a real-time quote for an option contract")
    .requiredOption("--ticker <symbol>", "Underlying asset symbol")
    .requiredOption("--exp <date>", "Expiration date (YYYY-MM-DD)")
    .requiredOption("--strike <number>", "Strike price")
    .requiredOption("--type <type>", "Option type: call or put", (input) => {
      const normalized = input.toLowerCase();
      if (normalized !== "call" && normalized !== "put") {
        console.error('Invalid option type. Must be "call" or "put".');
        process.exit(1);
      }
      return normalized;
    })
    .action(async (opts, command) => {
      const user = await loadOrRegisterUser(snaptrade);
      const account = await selectAccount({
        snaptrade,
        useLastAccount: command.parent.opts().useLastAccount,
        context: "option_trade",
      });

      const { ticker, exp, strike, type } = opts as {
        ticker: string;
        exp: string;
        strike: string;
        type: "call" | "put";
      };

      const optionType = type === "call" ? "CALL" : "PUT";
      const symbol = generateOccSymbol(ticker, exp, Number(strike), optionType);

      const response = await withDebouncedSpinner(
        "Fetching option quote...",
        async () =>
          snaptrade.options.getOptionQuote({
            ...user,
            accountId: account.id,
            symbol,
          })
      );

      const q = response.data;

      const table = new Table({
        head: ["Field", "Value"],
      });

      table.push(
        ["Symbol", q.symbol ?? symbol],
        [
          "Bid",
          q.bid_price != null
            ? `$${q.bid_price.toFixed(2)} x${q.bid_size ?? "—"}`
            : "N/A",
        ],
        [
          "Ask",
          q.ask_price != null
            ? `$${q.ask_price.toFixed(2)} x${q.ask_size ?? "—"}`
            : "N/A",
        ],
        [
          "Last",
          q.last_price != null
            ? `$${q.last_price.toFixed(2)} x${q.last_size ?? "—"}`
            : "N/A",
        ],
        [
          "Open Interest",
          q.open_interest != null
            ? q.open_interest.toLocaleString("en-US")
            : "N/A",
        ],
        [
          "Volume",
          q.volume != null ? q.volume.toLocaleString("en-US") : "N/A",
        ],
        [
          "Implied Volatility",
          q.implied_volatility != null
            ? `${(q.implied_volatility * 100).toFixed(2)}%`
            : "N/A",
        ],
        [
          "Underlying Price",
          q.underlying_price != null
            ? `$${q.underlying_price.toFixed(2)}`
            : "N/A",
        ],
        ["Timestamp", q.timestamp ?? "N/A"]
      );

      console.log(table.toString());
    });
}
