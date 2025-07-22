import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { selectAccount } from "../utils/selectAccount.ts";
import { loadOrRegisterUser } from "../utils/user.ts";

export function quoteCommand(snaptrade: Snaptrade): Command {
  return new Command("quote")
    .description("Get the current quote for a given symbol")
    .argument("<symbol>", "The symbol to get the quote for")
    .action(async (symbol, opts, command) => {
      const user = await loadOrRegisterUser(snaptrade);
      const account = await selectAccount({
        snaptrade,
        useLastAccount: command.parent.opts().useLastAccount,
      });

      const response = await snaptrade.trading.getUserAccountQuotes({
        ...user,
        accountId: account.id,
        symbols: symbol,
        useTicker: true,
      });
      console.dir(response.data, { depth: null, colors: true });
    });
}
