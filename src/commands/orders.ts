import Table from "cli-table3";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { selectAccount } from "../utils/selectAccount.ts";
import { loadOrRegisterUser } from "../utils/user.ts";

export function ordersCommand(snaptrade: Snaptrade): Command {
    return new Command("orders")
        .description("List all orders for a given account")
        .action(async (opts, command) => {
            const user = await loadOrRegisterUser(snaptrade);
            const account = await selectAccount({
                snaptrade,
                context: "orders",
                useLastAccount: command.parent.opts().useLastAccount,
            });

            const orders = await snaptrade.accountInformation.getUserAccountOrders({
                ...user,
                accountId: account.id,
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
                orders.data == null ||
                orders.data.length === 0
            ) {
                console.log("No orders found.");
                return;
            }

            for (const order of orders.data) {
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