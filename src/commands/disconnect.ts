import { checkbox } from "@inquirer/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { loadOrRegisterUser } from "../utils/user.ts";

export function disconnectCommand(snaptrade: Snaptrade): Command {
  return new Command("disconnect")
    .description("Remove an existing broker connection")
    .argument("[connectionId]", "Connection ID to remove")
    .action(async (connectionId: string | undefined) => {
      const user = await loadOrRegisterUser(snaptrade);

      // Prompt for connection IDs if not provided
      const connectionIds = await (async () => {
        if (connectionId) {
          return [connectionId];
        }
        const connections = (
          await snaptrade.connections.listBrokerageAuthorizations(user)
        ).data;

        return checkbox({
          message: "Select connections to remove",
          loop: false,
          pageSize: 20,
          choices: connections.map((conn) => ({
            name: `${conn.brokerage?.display_name?.padEnd(15)} ${conn.disabled ? "❌ Disabled" : "✅ Active"}`,
            value: conn.id,
            short: conn.brokerage?.display_name,
          })),
        });
      })();

      await Promise.all(
        connectionIds
          .filter((id) => id != null)
          .map(async (id) => {
            return snaptrade.connections.removeBrokerageAuthorization({
              ...user,
              authorizationId: id,
            });
          })
      );

      if (connectionIds.length === 1) {
        console.log(
          chalk.green(`✅ Successfully deleted connection ${connectionIds[0]}.`)
        );
      } else {
        console.log(
          chalk.green(
            `✅ Successfully deleted the following connections:\n${connectionIds.join("\n")}`
          )
        );
      }
    });
}
