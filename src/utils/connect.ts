import chalk from "chalk";
import open from "open";
import { Snaptrade } from "snaptrade-typescript-sdk";
import type { User } from "./user";

export async function handleConnect(
  snaptrade: Snaptrade,
  user: User,
  existingConnectionId?: string
) {
  const loginResponse = await snaptrade.authentication.loginSnapTradeUser({
    ...user,
    reconnect: existingConnectionId,
    connectionType: "trade",
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
        `To disconnect, run ${chalk.green(
          `snaptrade disconnect --connectionId ${newOrUpdated.id}`
        )}.`
      );
    }
  }, 5000);
}
