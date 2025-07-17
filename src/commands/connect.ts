import chalk from "chalk";
import { Command } from "commander";
import open from "open";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { loadOrRegisterUser } from "../utils/user.ts";

export function connectCommand(snaptrade: Snaptrade): Command {
  return new Command("connect")
    .description("Connect a brokerage account")
    .action(async () => {
      const user = await loadOrRegisterUser(snaptrade);

      const loginResponse = await snaptrade.authentication.loginSnapTradeUser({
        ...user,
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
        // Find the connection that's newer than when we started
        const newConnection = connections.data.find(
          (conn) => new Date(conn.created_date!) > startTime
        );
        if (newConnection) {
          clearInterval(interval);
          console.log(
            chalk.green(`✅ Connected to ${newConnection.brokerage?.name}`)
          );
        }
      }, 5000);
    });
}
