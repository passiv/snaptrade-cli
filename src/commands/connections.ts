import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import Table from "cli-table3";
import { loadOrRegisterUser } from "../utils/user.ts";
import chalk from "chalk";

export function connectionsCommand(snaptrade: Snaptrade): Command {
  return new Command("connections")
    .description("List all broker connections")
    .action(async () => {
      const user = await loadOrRegisterUser(snaptrade);
      const connections = (
        await snaptrade.connections.listBrokerageAuthorizations(user)
      ).data;

      if (connections.length === 0) {
        console.log(
          `No connections found. Connect an account with ${chalk.green(`snaptrade connect`)}.`
        );
        return;
      }

      const table = new Table({
        head: ["ID", "Broker", "Status", "Type", "Connected on", "Disabled on"],
      });

      for (const conn of connections) {
        table.push([
          conn.id,
          conn.brokerage!.name,
          conn.disabled ? "❌ Disabled" : "✅ Active",
          conn.type === "read" ? "read-only" : "trade",
          new Date(conn.created_date!).toLocaleDateString(),
          conn.disabled_date
            ? new Date(conn.disabled_date).toLocaleDateString()
            : "N/A",
        ]);
      }

      console.log(table.toString());
    });
}
