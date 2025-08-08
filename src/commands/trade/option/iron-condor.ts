import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { placeTrade, processCommonOptionArgs } from "./index.ts";
import type { Leg } from "./index.ts";

export function ironCondorCommand(snaptrade: Snaptrade): Command {
  return new Command("iron-condor")
    .description("Place an iron condor order")
    .requiredOption("--exp <date>", "Expiration date (YYYY-MM-DD)")
    .requiredOption("--putLow <number>", "Lower put strike")
    .requiredOption("--putHigh <number>", "Higher put strike")
    .requiredOption("--callLow <number>", "Lower call strike")
    .requiredOption("--callHigh <number>", "Higher call strike")
    .action(async (opts, command) => {
      const trade = await processCommonOptionArgs(snaptrade, command);

      const { exp, putLow, putHigh, callLow, callHigh } = opts as Record<
        string,
        string
      >;

      const legs: Leg[] = [
        {
          type: "PUT",
          action: trade.action === "SELL" ? "BUY" : "SELL",
          strike: Number(putLow),
          expiration: exp,
          quantity: trade.quantity,
        },
        {
          type: "PUT",
          action: trade.action === "SELL" ? "SELL" : "BUY",
          strike: Number(putHigh),
          expiration: exp,
          quantity: trade.quantity,
        },
        {
          type: "CALL",
          action: trade.action === "SELL" ? "SELL" : "BUY",
          strike: Number(callLow),
          expiration: exp,
          quantity: trade.quantity,
        },
        {
          type: "CALL",
          action: trade.action === "SELL" ? "BUY" : "SELL",
          strike: Number(callHigh),
          expiration: exp,
          quantity: trade.quantity,
        },
      ];

      await placeTrade(snaptrade, legs, trade);
    });
}
