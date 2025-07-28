import Table from "cli-table3";
import type { AccountOrderRecord } from "snaptrade-typescript-sdk";

export function displayOrders(orders: AccountOrderRecord[] | undefined) {
  if (orders == null || orders.length === 0) {
    console.log("⚠️ No orders found.");
    return;
  }

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

  // sort by time placed, most recent first
  orders.sort((a, b) => {
    if (!a.time_placed || !b.time_placed) {
      return 0;
    }
    // This assumes time_placed is in ISO 8601 format, which is lexicographically sortable
    return b.time_placed.localeCompare(a.time_placed);
  });

  for (const order of orders) {
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
}
