import type { AxiosResponse } from "axios";
import chalk from "chalk";
import type { Account } from "snaptrade-typescript-sdk";
import { Snaptrade } from "snaptrade-typescript-sdk";
import type { User } from "./user.ts";

export async function handlePostTrade(
  snaptrade: Snaptrade,
  response: AxiosResponse,
  account: Account,
  user: User,
  context: "trade" | "cancel" | "replace"
) {
  console.log(`SnapTrade Request ID: ${response.headers["x-request-id"]}`);
  console.log(
    `${account.institution_name} Order ID: ${response.data.brokerage_order_id}`
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
    `Please check with ${account.institution_name} to ensure the order was ${verb} as expected.`
  );
  console.log(
    `You can also use ${chalk.green("snaptrade recent-orders")} to view recent orders.`
  );

  // Force an account refresh to get the latest account data after a trade execution or cancellation
  await snaptrade.connections.refreshBrokerageAuthorization({
    ...user,
    authorizationId: account.brokerage_authorization,
  });
}
