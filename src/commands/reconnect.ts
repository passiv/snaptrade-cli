import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { handleConnect } from "../utils/connect.ts";
import { loadOrRegisterUser } from "../utils/user.ts";

export function reconnectCommand(snaptrade: Snaptrade): Command {
  return new Command("reconnect")
    .description("Reestablish an existing disabled connection")
    .requiredOption("--connectionId <id>", "Connection ID to reconnect")
    .action(async (opts) => {
      const user = await loadOrRegisterUser(snaptrade);
      handleConnect(snaptrade, user, opts.connectionId);
    });
}
