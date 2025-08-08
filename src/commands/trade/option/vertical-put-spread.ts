import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { placeTrade, processCommonOptionArgs } from "./index.ts";
import type { Leg } from "./index.ts";

export function verticalPutSpreadCommand(snaptrade: Snaptrade): Command {
  return new Command("vertical-put-spread")
    .description("Place a vertical put spread order")
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
          strike: Number(high),
          expiration: exp,
          quantity: trade.quantity,
        },
        {
          type: "PUT",
          action: trade.action === "BUY" ? "SELL" : "BUY",
          strike: Number(low),
          expiration: exp,
          quantity: trade.quantity,
        },
      ];

      await placeTrade(snaptrade, legs, trade);
    });
}
