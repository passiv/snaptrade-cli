import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { placeTrade, processCommonOptionArgs } from "./index.ts";
import type { Leg } from "./index.ts";

export function straddleCommand(snaptrade: Snaptrade): Command {
  return new Command("straddle")
    .description("Place a straddle order")
    .requiredOption("--exp <date>", "Expiration date (YYYY-MM-DD)")
    .requiredOption("--strike <number>", "Strike price")
    .action(async (opts, command) => {
      const trade = await processCommonOptionArgs(snaptrade, command);

      const { exp, strike } = opts as Record<string, string>;

      const legs: Leg[] = [
        {
          type: "P",
          action: trade.action,
          strike,
          expiration: exp,
          quantity: trade.quantity,
        },
        {
          type: "C",
          action: trade.action,
          strike,
          expiration: exp,
          quantity: trade.quantity,
        },
      ];

      await placeTrade(snaptrade, legs, trade);
    });
}
