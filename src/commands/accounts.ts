import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import Table from "cli-table3";
import { loadOrRegisterUser } from "../utils/user.ts";
import chalk from "chalk";

export function accountsCommand(snaptrade: Snaptrade): Command {
  return new Command("accounts")
    .description("List all connected accounts")
    .action(async () => {
      const user = await loadOrRegisterUser(snaptrade);
      const accounts = (
        await snaptrade.accountInformation.listUserAccounts(user)
      ).data;

      if (accounts.length === 0) {
        console.log(
          `No accounts found. Connect an account with ${chalk.green(`snaptrade connect`)}.`
        );
        return;
      }

      accounts.sort((a, b) => {
        return (b.balance.total?.amount ?? 0) - (a.balance.total?.amount ?? 0);
      });

      const table = new Table({
        head: ["ID", "Broker", "Name", "Account #", "Total Value"],
      });

      for (const account of accounts) {
        table.push([
          account.id,
          account.institution_name,
          account.number,
          account.name,
          account.balance.total?.amount?.toLocaleString("en-US", {
            style: "currency",
            currency: account.balance.total.currency,
          }),
        ]);
      }

      console.log(table.toString());
    });
}
