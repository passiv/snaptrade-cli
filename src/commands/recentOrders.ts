import { Command } from "commander";
import type { SnaptradeClient } from "../utils/snaptradeClient.ts";
import { displayOrders } from "../utils/displayOrders.ts";
import { selectAccount } from "../utils/selectAccount.ts";
import { loadOrRegisterUser } from "../utils/user.ts";

export function recentOrdersCommand(snaptrade: SnaptradeClient): Command {
  return new Command("recent-orders")
    .description(
      "List the most recent orders (within last 24 hours) for a given account",
    )
    .action(async (opts, command) => {
      const user = await loadOrRegisterUser(snaptrade);
      const account = await selectAccount({
        snaptrade,
        useLastAccount: command.parent.opts().useLastAccount,
      });

      const recentOrders =
        await snaptrade.accountInformation.getUserAccountRecentOrders({
          ...user,
          accountId: account.id,
          onlyExecuted: false,
        });

      displayOrders(recentOrders.data.orders);
    });
}
