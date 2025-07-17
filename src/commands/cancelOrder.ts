import { confirm } from "@inquirer/prompts";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { USER } from "../user.ts";
import { selectAccount } from "../utils/selectAccount.ts";

export function cancelOrderCommand(snaptrade: Snaptrade): Command {
  return new Command("cancel-order")
    .description("Cancel an existing order")
    .requiredOption("--orderId <id>", "Order ID to cancel")
    .action(async (opts, command) => {
      const { orderId } = opts;

      const selectedAccount = await selectAccount({
        snaptrade,
        context: "equity_trade",
        useLastAccount: command.parent.opts().useLastAccount,
      });

      const result = await confirm({
        message: "Are you sure you want to cancel this order?",
      });

      if (!result) {
        console.log("❌ Order cancellation aborted by user.");
        return;
      }

      const response = await snaptrade.trading.cancelUserAccountOrder({
        ...USER,
        accountId: selectedAccount.id,
        brokerage_order_id: orderId,
      });
      console.log("Request ID: ", response.headers["x-request-id"]);
      console.log("Cancel order response", response.data);
    });
}
