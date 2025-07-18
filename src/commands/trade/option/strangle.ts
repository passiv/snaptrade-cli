import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { placeTrade, processCommonOptionArgs } from "./index.ts";
import type { Leg } from "./index.ts";

export function strangleCommand(snaptrade: Snaptrade): Command {
  return new Command("strangle")
    .description("Place a strangle order")
    .requiredOption("--exp <date>", "Expiration date (YYYY-MM-DD)")
    .requiredOption("--low <number>", "Lower strike price")
    .requiredOption("--high <number>", "Higher strike price")
    .action(async (opts, command) => {
      const trade = await processCommonOptionArgs(snaptrade, command);

      const { exp, low, high } = opts as Record<string, string>;

      const legs: Leg[] = [
        {
          type: "PUT",
          action: trade.action,
          strike: low,
          expiration: exp,
          quantity: trade.quantity,
        },
        {
          type: "CALL",
          action: trade.action,
          strike: high,
          expiration: exp,
          quantity: trade.quantity,
        },
      ];

      await placeTrade(snaptrade, legs, trade);
    });
}
