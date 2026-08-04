import chalk from "chalk";
import open from "open";
import type { SnaptradeClient } from "./snaptradeClient.ts";
import type { User } from "./user";

export async function handleConnect({
  snaptrade,
  user,
  existingConnectionId,
  brokerSlug,
  connectionType,
}: {
  snaptrade: SnaptradeClient;
  user: User;
  existingConnectionId?: string;
  brokerSlug?: string;
  connectionType?: "read" | "trade-if-available" | "trade";
}) {
  // On a reconnect an unspecified type means "keep what the connection already
  // has" — the API preserves it — so only default for brand new connections.
  const requestedConnectionType =
    connectionType ?? (existingConnectionId ? undefined : "trade-if-available");

  const loginResponse = await snaptrade.authentication.loginSnapTradeUser({
    ...user,
    reconnect: existingConnectionId,
    broker: brokerSlug,
    connectionType: requestedConnectionType,
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
      "\n🌐 Opening the SnapTrade connection portal in your browser...\n",
    ),
  );

  // Add darkMode=true to the URL to enable dark mode in the portal
  const url = new URL(redirectURI);
  url.searchParams.set("darkMode", "true");
  open(url.toString());

  const startTime = new Date();
  // Poll connections every 5 seconds until we find the new connection
  const interval = setInterval(async () => {
    const connections =
      await snaptrade.connections.listBrokerageAuthorizations(user);
    // Find the connection that's more recently updated than when we started
    const newOrUpdated = connections.data.find(
      (conn) => new Date(conn.updated_date!) > startTime,
    );
    if (newOrUpdated) {
      clearInterval(interval);
      console.log(
        chalk.green(
          `✅ ${existingConnectionId ? "Reconnected" : "Connected"} to ${newOrUpdated.brokerage?.name}`,
        ),
      );

      console.log(
        `To see your connections, run ${chalk.green("snaptrade connections")}.`,
      );

      console.log(
        `To disconnect, run ${chalk.green(`snaptrade disconnect ${newOrUpdated.id}`)}.`,
      );
    }
  }, 5000);
}
