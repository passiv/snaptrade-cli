import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { placeTrade, processCommonOptionArgs } from "./index.ts";
import type { Leg } from "./index.ts";

export function putCommand(snaptrade: Snaptrade): Command {
  return new Command("put")
    .description("Place a put order")
    .requiredOption("--exp <date>", "Expiration date (YYYY-MM-DD)")
    .requiredOption("--strike <number>", "Strike price")
    .action(async (opts, command) => {
      const trade = await processCommonOptionArgs(snaptrade, command);

      const { exp, strike } = opts as Record<string, string>;

      const legs: Leg[] = [
        {
          type: "PUT",
          action: trade.action,
          strike: Number(strike),
          expiration: exp,
          quantity: trade.quantity,
        },
      ];

      await placeTrade(snaptrade, legs, trade);
    });
}
