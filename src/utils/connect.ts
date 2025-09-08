import chalk from "chalk";
import open from "open";
import { Snaptrade } from "snaptrade-typescript-sdk";
import type { User } from "./user";

export async function handleConnect({
  snaptrade,
  user,
  existingConnectionId,
  brokerSlug,
  connectionType = "trade-if-available", // default to trade-if-available if not specified
}: {
  snaptrade: Snaptrade;
  user: User;
  existingConnectionId?: string;
  brokerSlug?: string;
  connectionType?: "read" | "trade" | "trade-if-available";
}) {
  const loginResponse = await snaptrade.authentication.loginSnapTradeUser({
    ...user,
    reconnect: existingConnectionId,
    broker: brokerSlug,
    // Don't modify connection type if reconnecting
    connectionType: existingConnectionId ? undefined : connectionType,
  });
  if (
    !("redirectURI" in loginResponse.data) ||
    !loginResponse.data.redirectURI
  ) {
    console.error("Failed to get redirect URI for authentication.");
    process.exit(1);
  }
  const redirectURI = loginResponse.data.redirectURI;
  console.log(
    chalk.cyan(
      "\n🌐 Opening the SnapTrade connection portal in your browser...\n"
    )
  );

  open(redirectURI);

  const startTime = new Date();
  // Poll connections every 5 seconds until we find the new connection
  const interval = setInterval(async () => {
    const connections =
      await snaptrade.connections.listBrokerageAuthorizations(user);
    // Find the connection that's more recently updated than when we started
    const newOrUpdated = connections.data.find(
      (conn) => new Date(conn.updated_date!) > startTime
    );
    if (newOrUpdated) {
      clearInterval(interval);
      console.log(
        chalk.green(
          `✅ ${existingConnectionId ? "Reconnected" : "Connected"} to ${newOrUpdated.brokerage?.name}`
        )
      );

      console.log(
        `To see your connections, run ${chalk.green("snaptrade connections")}.`
      );

      console.log(
        `To disconnect, run ${chalk.green(`snaptrade disconnect ${newOrUpdated.id}`)}.`
      );
    }
  }, 5000);
}
