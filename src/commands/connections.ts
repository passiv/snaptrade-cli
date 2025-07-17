import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import Table from "cli-table3";
import { USER } from "../user.ts";

export function connectionsCommand(snaptrade: Snaptrade): Command {
  return new Command("connections")
    .description("List all broker connections")
    .action(async () => {
      const connections = (
        await snaptrade.connections.listBrokerageAuthorizations(USER)
      ).data;

      const table = new Table({
        head: ["ID", "Broker", "Status", "Type", "Connected On"],
        colWidths: [38, 25, 15, 18, 15],
      });

      for (const conn of connections) {
        table.push([
          conn.id,
          conn.brokerage!.name,
          conn.disabled ? "❌ Disabled" : "✅ Active",
          conn.type === "read" ? "read-only" : "trade",
          new Date(conn.created_date!).toLocaleDateString(),
        ]);
      }

      console.log(table.toString());
    });
}
