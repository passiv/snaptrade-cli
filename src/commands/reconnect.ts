import { select } from "@inquirer/prompts";
import chalk from "chalk";
import { Command } from "commander";
import type { SnaptradeClient } from "../utils/snaptradeClient.ts";
import { handleConnect } from "../utils/connect.ts";
import { loadOrRegisterUser } from "../utils/user.ts";

const CONNECTION_TYPES = ["read", "trade"] as const;
type ConnectionType = (typeof CONNECTION_TYPES)[number];

export function reconnectCommand(snaptrade: SnaptradeClient): Command {
  return new Command("reconnect")
    .description(
      "Re-establish a disabled connection, or change an existing connection's access level",
    )
    .argument("[connectionId]", "Connection ID to reconnect")
    .option(
      "--connection-type <type>",
      `Access level to reconnect with (${CONNECTION_TYPES.join(", ")}). Defaults to keeping the current level.`,
      (value: string) => {
        if (!CONNECTION_TYPES.includes(value as ConnectionType)) {
          console.error(
            `Invalid connection type. Allowed values are: ${CONNECTION_TYPES.join(", ")}`,
          );
          process.exit(1);
        }
        return value as ConnectionType;
      },
    )
    .action(async (connectionId: string | undefined, opts) => {
      const user = await loadOrRegisterUser(snaptrade);
      const connectionType = opts.connectionType as ConnectionType | undefined;

      // Prompt for connection ID if not provided
      const existingConnectionId = await (async () => {
        if (connectionId) {
          // The API rejects connectionType=trade for brokerages with no trade
          // auth type, and there's no global handler to turn that into
          // something readable, so check before launching the portal.
          if (connectionType === "trade") {
            const connection = (
              await snaptrade.connections.detailBrokerageAuthorization({
                ...user,
                authorizationId: connectionId,
              })
            ).data;
            if (connection?.brokerage?.allows_trading === false) {
              console.error(
                `${connection.brokerage.display_name} does not support trading through SnapTrade.`,
              );
              process.exit(1);
            }
          }
          return connectionId;
        }
        const connections = (
          await snaptrade.connections.listBrokerageAuthorizations(user)
        ).data;

        // Disabled connections always need repair. Healthy ones are only worth
        // offering when the requested access level differs from what they
        // already have — and an upgrade additionally needs a brokerage that can
        // actually trade.
        const candidates = connections.filter((conn) => {
          if (conn.disabled) {
            return (
              connectionType !== "trade" ||
              conn.brokerage?.allows_trading !== false
            );
          }
          if (!connectionType || conn.type === connectionType) {
            return false;
          }
          return (
            connectionType !== "trade" ||
            conn.brokerage?.allows_trading !== false
          );
        });

        if (candidates.length === 0) {
          return null;
        }

        if (candidates.length === 1) {
          return candidates[0].id;
        }

        return select({
          message:
            connectionType === "trade"
              ? "Select a connection to upgrade to trading"
              : connectionType === "read"
                ? "Select a connection to make read-only"
                : "Select a connection to reconnect",
          choices: candidates.map((conn) => ({
            name: `${conn.brokerage?.display_name}${conn.disabled ? " (disabled)" : conn.type === "read" ? " (read-only)" : " (trade)"}`,
            value: conn.id,
          })),
        });
      })();

      if (!existingConnectionId) {
        console.log(
          connectionType === "trade"
            ? "No connections found that need upgrading to trading."
            : connectionType === "read"
              ? "No connections found that need changing to read-only."
              : `No disabled connections found, therefore there's no need to reconnect. To give an existing connection trading access, run ${chalk.green("snaptrade reconnect --connection-type trade")}.`,
        );
        return;
      }

      handleConnect({
        snaptrade,
        user,
        existingConnectionId,
        connectionType,
      });
    });
}
