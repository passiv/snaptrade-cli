import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { statusCommand } from "./status.ts";
import { tradeCommand } from "./trade/index.ts";
import { connectionsCommand } from "./connections.ts";
import { cancelOrderCommand } from "./cancelOrder.ts";
import { connectCommand } from "./connect.ts";
import { disconnectCommand } from "./disconnect.ts";

export function registerCommands(program: Command, snaptrade: Snaptrade): void {
  program.addCommand(statusCommand(snaptrade));
  program.addCommand(connectCommand(snaptrade));
  program.addCommand(disconnectCommand(snaptrade));
  program.addCommand(connectionsCommand(snaptrade));
  program.addCommand(tradeCommand(snaptrade));
  program.addCommand(cancelOrderCommand(snaptrade));
}
