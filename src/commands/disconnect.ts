import chalk from "chalk";
import { Command } from "commander";
import open from "open";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { loadOrRegisterUser } from "../utils/user.ts";

export function disconnectCommand(snaptrade: Snaptrade): Command {
  return new Command("disconnect")
    .description("Remove a brokerage connection")
    .requiredOption("--connectionId <id>", "Connection ID to remove")
    .action(async (opts) => {
      const user = await loadOrRegisterUser(snaptrade);

      const response = await snaptrade.connections.removeBrokerageAuthorization(
        {
          ...user,
          authorizationId: opts.connectionId,
        }
      );

      console.log(
        chalk.green(`✅ Successfully deleted connection ${opts.connectionId}.`)
      );
    });
}
