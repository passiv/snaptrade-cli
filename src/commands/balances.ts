import Table from "cli-table3";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { selectAccount } from "../utils/selectAccount.ts";
import { loadOrRegisterUser } from "../utils/user.ts";

type Balance = {
  currency: string;
  cash: string;
  buyingPower: string;
};

export function balancesCommand(snaptrade: Snaptrade): Command {
  return new Command("balances")
    .description("List all balances for a given account")
    .action(async (opts, command) => {
      const user = await loadOrRegisterUser(snaptrade);
      const account = await selectAccount({
        snaptrade,
        context: "balances",
        useLastAccount: command.parent.opts().useLastAccount,
      });

      const balances = await snaptrade.accountInformation.getUserAccountBalance({
        ...user,
        accountId: account.id,
      });

      const formattedBalances: Balance[] = [];
      for (const balance of balances.data) {
        const currencyCode = balance.currency?.code || "USD";
        formattedBalances.push({
          currency: currencyCode,
          cash: balance.cash?.toLocaleString("en-US", {
            style: "currency",
            currency: currencyCode,
          }) || "N/A",
          buyingPower: balance.buying_power?.toLocaleString("en-US", {
            style: "currency",
            currency: currencyCode,
          }) || "N/A",
        });
      }

      // sort by currency code
      formattedBalances.sort((a, b) => a.currency.localeCompare(b.currency));

      const table = new Table({
        head: ["Currency", "Cash", "Buying Power"],
      });

      for (const balance of formattedBalances) {
        table.push([balance.currency, balance.cash, balance.buyingPower]);
      }

      console.log(table.toString());
    });
}
