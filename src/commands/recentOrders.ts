import Table from "cli-table3";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { selectAccount } from "../utils/selectAccount.ts";
import { loadOrRegisterUser } from "../utils/user.ts";

export function recentOrdersCommand(snaptrade: Snaptrade): Command {
  return new Command("recent-orders")
    .description("List all recent orders for a given account")
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

      const table = new Table({
        head: [
          "Order ID",
          "Time Placed",
          "Symbol",
          "Status",
          "Action",
          "Quantity",
          "Filled Qty",
          "Type",
          "Filled Price",
        ],
      });

      if (
        recentOrders.data.orders == null ||
        recentOrders.data.orders.length === 0
      ) {
        console.log("No recent orders found.");
        return;
      }

      for (const order of recentOrders.data.orders) {
        table.push([
          order.brokerage_order_id,
          order.time_placed,
          order.option_symbol?.ticker ?? order.universal_symbol?.symbol,
          order.status,
          order.action,
          order.total_quantity,
          order.filled_quantity,
          order.order_type,
          // FIXME wrong typing here. string over the wire but number in SDK
          Number(order.execution_price).toLocaleString("en-US", {
            style: "currency",
            currency:
              order.option_symbol?.underlying_symbol.currency?.code ??
              order.universal_symbol?.currency?.code,
          }),
        ]);
      }

      console.log(table.toString());
    });
}
