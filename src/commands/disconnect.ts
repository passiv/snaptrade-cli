import chalk from "chalk";
import { Command } from "commander";
import open from "open";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { loadOrRegisterUser } from "../utils/user.ts";

export function disconnectCommand(snaptrade: Snaptrade): Command {
  return new Command("disconnect")
    .description("Remove an existing broker connection")
    .argument("<connectionId>", "Connection ID to remove")
    .action(async (connectionId) => {
      const user = await loadOrRegisterUser(snaptrade);

      await snaptrade.connections.removeBrokerageAuthorization({
        ...user,
        authorizationId: connectionId,
      });

      console.log(
        chalk.green(`✅ Successfully deleted connection ${connectionId}.`)
      );
    });
}
