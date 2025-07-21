import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { statusCommand } from "./status.ts";
import { tradeCommand } from "./trade/index.ts";
import { connectionsCommand } from "./connections.ts";
import { cancelOrderCommand } from "./cancelOrder.ts";
import { connectCommand } from "./connect.ts";
import { disconnectCommand } from "./disconnect.ts";
import { positionsCommand } from "./positions.ts";
import { balancesCommand } from "./balances.ts";
import { holdingsCommand } from "./holdings.ts";
import { activitiesCommand } from "./activities.ts";
import { recentOrdersCommand } from "./recentOrders.ts";
import { accountsCommand } from "./accounts.ts";

export function registerCommands(program: Command, snaptrade: Snaptrade): void {
  program.addCommand(statusCommand(snaptrade));
  program.addCommand(connectCommand(snaptrade));
  program.addCommand(disconnectCommand(snaptrade));
  program.addCommand(connectionsCommand(snaptrade));
  program.addCommand(accountsCommand(snaptrade));
  program.addCommand(balancesCommand(snaptrade));
  program.addCommand(holdingsCommand(snaptrade));
  program.addCommand(activitiesCommand(snaptrade));
  program.addCommand(positionsCommand(snaptrade));
  program.addCommand(recentOrdersCommand(snaptrade));
  program.addCommand(tradeCommand(snaptrade));
  program.addCommand(cancelOrderCommand(snaptrade));
}
