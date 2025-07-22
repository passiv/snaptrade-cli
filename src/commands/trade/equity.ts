import { confirm } from "@inquirer/prompts";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { selectAccount } from "../../utils/selectAccount.ts";
import { handlePostTrade } from "../../utils/trading.ts";
import { loadOrRegisterUser } from "../../utils/user.ts";

export function equityCommand(snaptrade: Snaptrade): Command {
  return new Command("equity")
    .description("Place a simple equity trade with one leg")
    .option(
      "--shares <number>",
      "Number of shares. Either shares or notional must be provided."
    )
    .option(
      "--notional <number>",
      "Notional amount. Either shares or notional must be provided."
    )
    .action(async (opts, command) => {
      const user = await loadOrRegisterUser(snaptrade);

      const { ticker, orderType, limitPrice, action, tif, replace } =
        command.parent.opts();

      const { shares, notional } = opts;

      if (!shares && !notional) {
        console.error("You must provide either --shares or --notional.");
        return;
      }
      const sharesParsed = parseFloat(shares);
      //   TODO Figure out a better solution for fetching quotes
      //   const priceResult = await fetch(
      //     `https://api.twelvedata.com/price?symbol=${ticker}&apikey=${process.env.TWELVEDATA_API_KEY}`
      //   );
      //   const quote = await priceResult.json();
      const account = await selectAccount({
        snaptrade,
        useLastAccount: command.parent.parent.opts().useLastAccount,
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
        // quote: `$${quote.price}`,
        action,
        quantity: sharesParsed,
        notional,
        orderType,
        limitPrice,
        timeInForce: tif,
        replace,
      };

      console.log(trade);

      const result = await confirm({
        message: "Are you sure you want to place this trade?",
      });

      if (!result) {
        console.log("❌ Trade cancelled by user.");
        return;
      }

      // TODO Switch to placeSimpleOrder once it's ready

      if (!replace) {
        const response = await snaptrade.trading.placeForceOrder({
          ...user,
          account_id: account.id,
          symbol: ticker,
          action,
          order_type: orderType,
          price: limitPrice,
          time_in_force: tif,
          units: sharesParsed,
          notional_value: notional,
        });

        console.log("✅ Order submitted!");
        handlePostTrade(snaptrade, response, account, user, "trade");
      } else {
        const response = await snaptrade.trading.replaceOrder({
          ...user,
          accountId: account.id,
          brokerageOrderId: replace,
          symbol: ticker,
          action,
          order_type: orderType,
          price: limitPrice,
          time_in_force: tif,
          units: sharesParsed,
          // FIXME This is missing notional value
        });

        console.log("✅ Order replacement submitted!");
        handlePostTrade(snaptrade, response, account, user, "replace");
      }
    });
}
