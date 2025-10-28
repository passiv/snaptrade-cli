import { confirm } from "@inquirer/prompts";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { printTradePreview } from "../../utils/preview.ts";
import { getFullQuote } from "../../utils/quotes.ts";
import { selectAccount } from "../../utils/selectAccount.ts";
import { handlePostTrade } from "../../utils/trading.ts";
import { loadOrRegisterUser } from "../../utils/user.ts";
import { withDebouncedSpinner } from "../../utils/withDebouncedSpinner.ts";
import { TRADING_SESSIONS } from "./index.ts";

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

      const {
        ticker,
        orderType,
        limitPrice,
        stopPrice,
        action,
        tif,
        tradingSession,
        replace,
      } = command.parent.opts();

      const tradingSessionValue: (typeof TRADING_SESSIONS)[number] =
        tradingSession;

      const { shares, notional } = opts;

      if (!shares && !notional) {
        console.error("You must provide either --shares or --notional.");
        return;
      }
      const sharesParsed = parseFloat(shares) || undefined;
      const notionalParsed = parseFloat(notional) || undefined;
      const limitPriceParsed = parseFloat(limitPrice) || undefined;
      const stopPriceParsed = parseFloat(stopPrice) || undefined;

      const account = await selectAccount({
        snaptrade,
        useLastAccount: command.parent.parent.opts().useLastAccount,
        context: "equity_trade",
      });

      const [quote, balanceResponse] = await withDebouncedSpinner(
        "Generating trade preview, please wait...",
        async () =>
          Promise.all([
            getFullQuote(ticker),
            snaptrade.accountInformation.getUserAccountBalance({
              ...user,
              accountId: account.id,
            }),
          ])
      );

      const trade = {
        account,
        accountName: `${account.name} - ${account.balance.total?.amount?.toLocaleString(
          "en-US",
          {
            style: "currency",
            currency: account.balance.total.currency,
          }
        )}`,
        ticker,
        quote,
        balance: balanceResponse.data[0], // TODO handle multiple currencies
        action,
        quantity: sharesParsed,
        notional: notionalParsed,
        orderType,
        limitPrice: limitPriceParsed,
        stopPrice: stopPriceParsed,
        timeInForce: tif,
        tradingSession: tradingSessionValue,
        replace,
      };

      printTradePreview(trade);

      const result = await confirm({
        message: "Are you sure you want to place this trade?",
      });

      if (!result) {
        console.log("❌ Trade cancelled by user.");
        return;
      }

      if (!replace) {
        const response = await snaptrade.trading.placeForceOrder({
          ...user,
          account_id: account.id,
          symbol: ticker,
          action,
          order_type: orderType,
          price: limitPrice,
          stop: stopPriceParsed,
          time_in_force: tif,
          units: sharesParsed,
          notional_value: notional,
          ...(tradingSessionValue
            ? { trading_session: tradingSessionValue }
            : {}),
        });

        console.log("✅ Order submitted!");
        handlePostTrade(snaptrade, response, account, user, "trade");
      } else {
        const response = await snaptrade.trading.replaceOrder({
          ...user,
          accountId: account.id,
          brokerage_order_id: replace,
          symbol: ticker,
          action,
          order_type: orderType,
          price: limitPrice,
          stop: stopPriceParsed,
          time_in_force: tif,
          units: sharesParsed,
          // FIXME This is missing notional value
        });

        console.log("✅ Order replacement submitted!");
        handlePostTrade(snaptrade, response, account, user, "replace");
      }
    });
}
