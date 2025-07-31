import { select } from "@inquirer/prompts";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { handleConnect } from "../utils/connect.ts";
import { loadOrRegisterUser } from "../utils/user.ts";

export function reconnectCommand(snaptrade: Snaptrade): Command {
  return new Command("reconnect")
    .description("Re-establish an existing disabled connection")
    .argument("[connectionId]", "Connection ID to reconnect")
    .action(async (connectionId) => {
      const user = await loadOrRegisterUser(snaptrade);

      // Prompt for connection ID if not provided
      const existingConnectionId = await (async () => {
        if (connectionId) {
          return connectionId;
        }
        if (!connectionId) {
          const connections = (
            await snaptrade.connections.listBrokerageAuthorizations(user)
          ).data;

          const disabled = connections.filter((conn) => conn.disabled);

          if (disabled.length === 0) {
            return null;
          }

          if (disabled.length === 1) {
            return disabled[0].id;
          }

          return select({
            message: "Select a connection to reconnect",
            choices: disabled.map((conn) => ({
              name: `${conn.brokerage?.display_name}`,
              value: conn.id,
            })),
          });
        }
      })();

      if (!existingConnectionId) {
        console.log("No disabled connections found.");
        return;
      }

      handleConnect({
        snaptrade,
        user,
        existingConnectionId,
      });
    });
}
