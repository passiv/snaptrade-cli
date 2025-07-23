import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { handleConnect } from "../utils/connect.ts";
import { loadOrRegisterUser } from "../utils/user.ts";

export function reconnectCommand(snaptrade: Snaptrade): Command {
  return new Command("reconnect")
    .description("Re-establish an existing disabled connection")
    .argument("<connectionId>", "Connection ID to reconnect")
    .action(async (connectionId) => {
      const user = await loadOrRegisterUser(snaptrade);
      handleConnect({
        snaptrade,
        user,
        existingConnectionId: connectionId,
      });
    });
}
