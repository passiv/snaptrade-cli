import { confirm } from "@inquirer/prompts";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { printOrderDetail } from "../utils/preview.ts";
import { selectAccount } from "../utils/selectAccount.ts";
import { handlePostTrade } from "../utils/trading.ts";
import { loadOrRegisterUser } from "../utils/user.ts";

export function cancelOrderCommand(snaptrade: Snaptrade): Command {
  return new Command("cancel-order")
    .description("Cancel an existing order")
    .requiredOption("--orderId <id>", "Order ID to cancel")
    .action(async (opts, command) => {
      const user = await loadOrRegisterUser(snaptrade);

      const { orderId } = opts;

      const account = await selectAccount({
        snaptrade,
        useLastAccount: command.parent.opts().useLastAccount,
      });

      const order =
        await snaptrade.accountInformation.getUserAccountOrderDetail({
          ...user,
          accountId: account.id,
          brokerage_order_id: orderId,
        });

      printOrderDetail(order.data);

      const result = await confirm({
        message: "Are you sure you want to cancel this order?",
      });

      if (!result) {
        console.log("❌ Order cancellation aborted by user.");
        return;
      }

      const response = await snaptrade.trading.cancelOrder({
        ...user,
        accountId: account.id,
        brokerage_order_id: orderId,
      });

      console.log("✅ Order cancellation submitted!");
      handlePostTrade(snaptrade, response, account, user, "cancel");
    });
}
