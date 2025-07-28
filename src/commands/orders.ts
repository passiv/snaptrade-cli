import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { displayOrders } from "../utils/displayOrders.ts";
import { selectAccount } from "../utils/selectAccount.ts";
import { loadOrRegisterUser } from "../utils/user.ts";

export function ordersCommand(snaptrade: Snaptrade): Command {
  return new Command("orders")
    .description("List all orders for a given account")
    .action(async (opts, command) => {
      const user = await loadOrRegisterUser(snaptrade);
      const account = await selectAccount({
        snaptrade,
        useLastAccount: command.parent.opts().useLastAccount,
      });

      const orders = await snaptrade.accountInformation.getUserAccountOrders({
        ...user,
        accountId: account.id,
        state: "all",
        days: 30,
      });

      displayOrders(orders.data);
    });
}
