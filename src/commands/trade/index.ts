import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { cryptoCommand } from "./crypto.ts";
import { equityCommand } from "./equity.ts";
import { optionCommand } from "./option/index.ts";

export const ORDER_TYPES = ["Market", "Limit", "Stop", "StopLimit"] as const;
export const TIME_IN_FORCE = ["Day", "GTC"] as const;

export function tradeCommand(snaptrade: Snaptrade): Command {
  const cmd = new Command("trade")
    .description("Execute different types of trades (equity, options, crypto)")
    .requiredOption("--ticker <symbol>", "Underlying asset symbol (e.g., AAPL)")
    .option(
      "--orderType <type>",
      "Order type: Market or Limit",
      (input) => {
        if (!ORDER_TYPES.includes(input as (typeof ORDER_TYPES)[number])) {
          console.error(
            `Invalid order type. Allowed values are: ${ORDER_TYPES.join(", ")}`
          );
          process.exit(1);
        }
        return input;
      },
      "Market"
    )
    .option("--limitPrice <number>", "Limit price")
    .requiredOption("--action <type>", "Action type: BUY or SELL")
    .option(
      "--tif <type>",
      "Time in force: Day or GTC",
      (input) => {
        if (!TIME_IN_FORCE.includes(input as (typeof TIME_IN_FORCE)[number])) {
          console.error(
            `Invalid time in force. Allowed values are: ${TIME_IN_FORCE.join(", ")}`
          );
          process.exit(1);
        }
        return input;
      },
      "Day"
    )
    .option(
      "--replace <string>",
      "Replace an existing order. Provide the broker order ID to replace."
    );

  cmd.addCommand(equityCommand(snaptrade));
  cmd.addCommand(optionCommand(snaptrade));
  cmd.addCommand(cryptoCommand(snaptrade));

  return cmd;
}
