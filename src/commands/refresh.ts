import { select } from "@inquirer/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { loadOrRegisterUser } from "../utils/user.ts";

export function refreshCommand(snaptrade: Snaptrade): Command {
  return new Command("refresh")
    .description("Trigger a data refresh for a broker connection")
    .argument("[connectionId]", "Connection ID to refresh")
    .action(async (connectionId: string | undefined) => {
      const user = await loadOrRegisterUser(snaptrade);

      const authorizationId = await (async () => {
        if (connectionId) {
          return connectionId;
        }
        const connections = (
          await snaptrade.connections.listBrokerageAuthorizations(user)
        ).data;

        if (connections.length === 0) {
          return null;
        }

        if (connections.length === 1) {
          return connections[0].id;
        }

        return select({
          message: "Select a connection to refresh",
          choices: connections.map((conn) => ({
            name: `${conn.brokerage?.display_name}${conn.disabled ? " (disabled)" : ""}`,
            value: conn.id,
          })),
        });
      })();

      if (!authorizationId) {
        console.log("No connections found. Use `snaptrade connect` to add one.");
        return;
      }

      const response =
        await snaptrade.connections.refreshBrokerageAuthorization({
          ...user,
          authorizationId,
        });

      const detail = (response.data as any)?.detail;
      console.log(
        chalk.green("Refresh triggered successfully.") +
          (detail ? ` ${detail}` : "")
      );
    });
}
