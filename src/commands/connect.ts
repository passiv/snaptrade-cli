import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { handleConnect } from "../utils/connect.ts";
import { loadOrRegisterUser } from "../utils/user.ts";

export function connectCommand(snaptrade: Snaptrade): Command {
  return new Command("connect")
    .description("Connect a brokerage account")
    .action(async () => {
      const user = await loadOrRegisterUser(snaptrade);
      await handleConnect(snaptrade, user);
    });
}
