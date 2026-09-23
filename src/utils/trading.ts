import type { AxiosResponse } from "axios";
import chalk from "chalk";
import type { Account } from "snaptrade-typescript-sdk";
import type { SnaptradeClient } from "./snaptradeClient.ts";
import type { User } from "./user.ts";

export async function handlePostTrade(
  snaptrade: SnaptradeClient,
  response: AxiosResponse,
  account: Account,
  user: User,
  context: "trade" | "cancel" | "replace",
) {
  console.log(`SnapTrade Request ID: ${response.headers["x-request-id"]}`);
  console.log(
    `${account.institution_name} Order ID: ${response.data.brokerage_order_id}`,
  );
  const verb = (() => {
    switch (context) {
      case "trade":
        return "executed";
      case "cancel":
        return "canceled";
      case "replace":
        return "replaced";
      default:
        return "processed";
    }
  })();
  console.log(
    `Please check with ${account.institution_name} to ensure the order was ${verb} as expected.`,
  );
  console.log(
    `You can also use ${chalk.green("snaptrade recent-orders")} to view recent orders.`,
  );

  // Read the specific order directly. Trading connections provide live data;
  // manual connection refresh is neither needed nor available on real-time plans.
  const orderId = response.data.brokerage_order_id;
  if (!orderId) return;

  try {
    const order = await snaptrade.accountInformation.getUserAccountOrderDetail({
      ...user,
      accountId: account.id,
      brokerage_order_id: orderId,
    });
    console.log(`Current order status: ${order.data.status ?? "unknown"}`);
  } catch (error) {
    const status = (error as { status?: unknown })?.status;
    const statusLabel = typeof status === "number" ? ` (HTTP ${status})` : "";
    console.warn(
      `⚠️ Order status lookup failed${statusLabel}. The order request was accepted; check ${chalk.green("snaptrade recent-orders")} for its latest status.`,
    );
  }
}
