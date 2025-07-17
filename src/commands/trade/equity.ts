import { confirm } from "@inquirer/prompts";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { USER } from "../../user.ts";
import { selectAccount } from "../../utils/selectAccount.ts";

export function equityCommand(snaptrade: Snaptrade): Command {
  return new Command("equity")
    .description("Place a simple equity trade with one leg")
    .action(async (opts, command) => {
      const { ticker, orderType, limitPrice, action, qty, tif } =
        command.parent.opts();

      const quantity = parseFloat(qty);
      const priceResult = await fetch(
        `https://api.twelvedata.com/price?symbol=${ticker}&apikey=${process.env.TWELVEDATA_API_KEY}`
      );
      const quote = await priceResult.json();
      const selectedAccount = await selectAccount({
        snaptrade,
        context: "equity_trade",
        useLastAccount: command.parent.parent.opts().useLastAccount,
      });

      const trade = {
        accountId: selectedAccount.id,
        account: `${selectedAccount.name} - ${selectedAccount.balance.total?.amount?.toLocaleString(
          "en-US",
          {
            style: "currency",
            currency: selectedAccount.balance.total.currency,
          }
        )}`,
        ticker,
        quote: `$${quote.price}`,
        action,
        quantity,
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

      const response = await snaptrade.trading.placeForceOrder({
        ...USER,
        account_id: selectedAccount.id,
        symbol: ticker,
        action,
        order_type: orderType,
        price: limitPrice,
        time_in_force: tif,
        units: quantity,
      });
      console.log("Request ID: ", response.headers["x-request-id"]);
      console.log("Place order response", response.data);
    });
}
