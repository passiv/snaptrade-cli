import { confirm } from "@inquirer/prompts";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { selectAccount } from "../../utils/selectAccount.ts";
import { handlePostTrade } from "../../utils/trading.ts";
import { loadOrRegisterUser } from "../../utils/user.ts";
import { ORDER_TYPES } from "./index.ts";

export function cryptoCommand(snaptrade: Snaptrade): Command {
  return new Command("crypto")
    .description("Place a simple crypto trade with one leg")
    .requiredOption(
      "--amount <number>",
      "The amount of the base currency to buy or sell."
    )
    .action(async (opts, command) => {
      const user = await loadOrRegisterUser(snaptrade);

      const { ticker, orderType, limitPrice, action, tif, replace } =
        command.parent.opts();

      const { amount } = opts;

      const account = await selectAccount({
        snaptrade,
        useLastAccount: command.parent.parent.opts().useLastAccount,
        context: "crypto_trade",
      });

      const trade = {
        accountId: account.id,
        account: `${account.name} - ${account.balance.total?.amount?.toLocaleString(
          "en-US",
          {
            style: "currency",
            currency: account.balance.total.currency,
          }
        )}`,
        ticker,
        action,
        amount: amount,
        orderType,
        limitPrice,
        timeInForce: tif,
      };

      console.log(trade);

      const result = await confirm({
        message: "Are you sure you want to place this trade?",
      });

      if (!result) {
        console.log("❌ Trade cancelled by user.");
        return;
      }

      if (replace) {
        console.error("Replace order is not supported for crypto trades yet.");
        return;
      }

      const orderTypeInput = (() => {
        switch (orderType as (typeof ORDER_TYPES)[number]) {
          case "Market":
            return "MARKET";
          case "Limit":
            return "LIMIT";
          case "Stop":
            return "STOP_LOSS_MARKET";
          case "StopLimit":
            return "STOP_LOSS_LIMIT";
          default:
            throw new Error(`Unsupported order type: ${orderType}`);
        }
      })();

      const response = await snaptrade.trading.placeSimpleOrder({
        ...user,
        accountId: account.id,
        instrument: {
          symbol: ticker,
          type: "CRYPTOCURRENCY_PAIR",
        },
        side: action,
        type: orderTypeInput,
        limit_price: limitPrice,
        time_in_force: tif,
        amount,
        post_only: true,
      });

      console.log("✅ Order submitted!");
      handlePostTrade(snaptrade, response, account, user, "trade");
    });
}
