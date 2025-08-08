import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { statusCommand } from "./status.ts";
import { tradeCommand } from "./trade/index.ts";
import { connectionsCommand } from "./connections.ts";
import { cancelOrderCommand } from "./cancelOrder.ts";
import { connectCommand } from "./connect.ts";
import { disconnectCommand } from "./disconnect.ts";
import { positionsCommand } from "./positions.ts";
import { recentOrdersCommand } from "./recentOrders.ts";
import { accountsCommand } from "./accounts.ts";
import { quoteCommand } from "./quote.ts";
import { reconnectCommand } from "./reconnect.ts";
import { brokersCommand } from "./brokers.ts";
import { ordersCommand } from "./orders.ts";
import { instrumentsCommand } from "./instruments.ts";
import { profilesCommand } from "./profiles.ts";

export function registerCommands(program: Command, snaptrade: Snaptrade): void {
  program.addCommand(statusCommand(snaptrade));
  program.addCommand(brokersCommand(snaptrade));
  program.addCommand(connectCommand(snaptrade));
  program.addCommand(reconnectCommand(snaptrade));
  program.addCommand(disconnectCommand(snaptrade));
  program.addCommand(connectionsCommand(snaptrade));
  program.addCommand(accountsCommand(snaptrade));
  program.addCommand(positionsCommand(snaptrade));
  program.addCommand(recentOrdersCommand(snaptrade));
  program.addCommand(ordersCommand(snaptrade));
  program.addCommand(instrumentsCommand(snaptrade));
  program.addCommand(quoteCommand(snaptrade));
  program.addCommand(tradeCommand(snaptrade));
  program.addCommand(cancelOrderCommand(snaptrade));
  program.addCommand(profilesCommand(snaptrade));
}
