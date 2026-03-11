import chalk from "chalk";
import { Command } from "commander";
import type { MlegActionStrict, MlegInstrumentType, TimeInForceStrict } from "snaptrade-typescript-sdk";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { generateOccSymbol } from "../utils/generateOccSymbol.ts";
import { selectAccount } from "../utils/selectAccount.ts";
import { loadOrRegisterUser } from "../utils/user.ts";
import { withDebouncedSpinner } from "../utils/withDebouncedSpinner.ts";

export function optionImpactCommand(snaptrade: Snaptrade): Command {
  return new Command("option-impact")
    .description(
      "Simulate an option trade and see estimated cash change and fees"
    )
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
    .requiredOption("--action <type>", "BUY or SELL", (input) => {
      const normalized = input.toUpperCase();
      if (normalized !== "BUY" && normalized !== "SELL") {
        console.error('Invalid action. Must be "BUY" or "SELL".');
        process.exit(1);
      }
      return normalized;
    })
    .option("--contracts <number>", "Number of contracts", "1")
    .option(
      "--orderType <type>",
      "Order type: Market, Limit, Stop, StopLimit",
      "Market"
    )
    .option("--limitPrice <number>", "Limit price (required for Limit orders)")
    .option("--tif <type>", "Time in force: Day or GTC", "Day")
    .action(async (opts, command) => {
      const user = await loadOrRegisterUser(snaptrade);
      const account = await selectAccount({
        snaptrade,
        useLastAccount: command.parent.opts().useLastAccount,
        context: "option_trade",
      });

      const { ticker, exp, strike, type, action, contracts, orderType, limitPrice, tif } =
        opts as {
          ticker: string;
          exp: string;
          strike: string;
          type: "call" | "put";
          action: "BUY" | "SELL";
          contracts: string;
          orderType: string;
          limitPrice?: string;
          tif: string;
        };

      const optionType = type === "call" ? "CALL" : "PUT";
      const symbol = generateOccSymbol(ticker, exp, Number(strike), optionType);
      const units = parseInt(contracts);

      const orderTypeInput = (() => {
        switch (orderType) {
          case "Market":
            return "MARKET";
          case "Limit":
            return "LIMIT";
          case "Stop":
            return "STOP_LOSS_MARKET";
          case "StopLimit":
            return "STOP_LOSS_LIMIT";
          default:
            console.error(
              `Invalid order type "${orderType}". Allowed: Market, Limit, Stop, StopLimit`
            );
            process.exit(1);
        }
      })();

      const response = await withDebouncedSpinner(
        "Fetching option impact estimate...",
        async () =>
          snaptrade.trading.getOptionImpact({
            ...user,
            accountId: account.id,
            order_type: orderTypeInput,
            time_in_force: tif as TimeInForceStrict,
            limit_price: limitPrice,
            price_effect: action === "BUY" ? "DEBIT" : "CREDIT",
            legs: [
              {
                instrument: {
                  instrument_type: "OPTION" as MlegInstrumentType,
                  symbol,
                },
                action: `${action}_TO_OPEN` as MlegActionStrict,
                units,
              },
            ],
          })
      );

      const impact = response.data;

      console.log(chalk.bold("\n📊 Option Impact Estimate\n"));
      console.log(`  Symbol:         ${symbol}`);
      console.log(`  Action:         ${action === "BUY" ? chalk.green(action) : chalk.red(action)}`);
      console.log(`  Contracts:      ${units}`);
      console.log(`  Order Type:     ${orderType}`);
      if (limitPrice) {
        console.log(`  Limit Price:    $${limitPrice}`);
      }
      console.log();

      const directionLabel =
        impact.cash_change_direction === "CREDIT"
          ? chalk.green("CREDIT")
          : impact.cash_change_direction === "DEBIT"
            ? chalk.red("DEBIT")
            : impact.cash_change_direction ?? "UNKNOWN";

      console.log(
        `  Cash Change:    $${Number(impact.estimated_cash_change).toFixed(2)} ${directionLabel}`
      );
      console.log(
        `  Est. Fees:      $${Number(impact.estimated_fee_total).toFixed(2)}`
      );
      console.log();
    });
}
