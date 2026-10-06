import { confirm } from "@inquirer/prompts";
import { Command } from "commander";
import type { CryptoOrderForm } from "snaptrade-typescript-sdk";
import type { SnaptradeClient } from "../../utils/snaptradeClient.ts";
import { printCryptoTradePreview } from "../../utils/preview.ts";
import { selectAccount } from "../../utils/selectAccount.ts";
import { handlePostTrade } from "../../utils/trading.ts";
import { loadOrRegisterUser } from "../../utils/user.ts";
import { withDebouncedSpinner } from "../../utils/withDebouncedSpinner.ts";

const cryptoOrderTypes = {
  Market: "MARKET",
  Limit: "LIMIT",
  Stop: "STOP_LOSS_MARKET",
  StopLimit: "STOP_LOSS_LIMIT",
} as const;

function positiveDecimal(value: string | undefined): boolean {
  return (
    value != null &&
    /^\d+(?:\.\d+)?$/.test(value) &&
    Number.isFinite(Number(value)) &&
    Number(value) > 0
  );
}

export function cryptoCommand(snaptrade: SnaptradeClient): Command {
  return new Command("crypto")
    .description(
      "Preview and place a crypto trade in base currency units (GTC)",
    )
    .requiredOption(
      "--amount <number>",
      "Amount of the base currency to buy or sell (fractional units supported)",
    )
    .option(
      "--postOnly",
      "Reject a limit order if it would fill immediately (not supported by Robinhood)",
      false,
    )
    .action(async (opts, command) => {
      const { ticker, orderType, limitPrice, stopPrice, action, tif, replace } =
        command.parent.opts();
      const { amount, postOnly } = opts;
      const timeInForce =
        command.parent.getOptionValueSource("tif") === "default" ? "GTC" : tif;
      const needsLimit = orderType === "Limit" || orderType === "StopLimit";
      const needsStop = orderType === "Stop" || orderType === "StopLimit";
      if (replace)
        throw new Error(
          "Replace order is not supported for crypto trades yet.",
        );
      if (action !== "BUY" && action !== "SELL")
        throw new Error("Crypto action must be BUY or SELL.");
      if (!positiveDecimal(amount))
        throw new Error(
          "--amount must be a positive decimal in base currency units.",
        );
      if (timeInForce !== "GTC")
        throw new Error("Crypto trades support --tif GTC only.");
      if (needsLimit && !positiveDecimal(limitPrice))
        throw new Error("This order requires a positive --limitPrice.");
      if (needsStop && !positiveDecimal(stopPrice))
        throw new Error("This order requires a positive --stopPrice.");
      if (!needsLimit && limitPrice != null)
        throw new Error(
          "--limitPrice is only valid for Limit or StopLimit orders.",
        );
      if (!needsStop && stopPrice != null)
        throw new Error(
          "--stopPrice is only valid for Stop or StopLimit orders.",
        );
      if (postOnly && orderType !== "Limit")
        throw new Error("--postOnly is only valid for Limit orders.");

      const user = await loadOrRegisterUser(snaptrade, "trade");
      const account = await selectAccount({
        snaptrade,
        useLastAccount: command.parent.parent.opts().useLastAccount,
        context: "crypto_trade",
      });
      const instruments =
        await snaptrade.trading.searchCryptocurrencyPairInstruments({
          ...user,
          accountId: account.id,
        });
      const pair = instruments.data.items.find(
        (item) => item.symbol?.toUpperCase() === ticker.toUpperCase(),
      );
      if (!pair?.symbol)
        throw new Error(
          "Crypto pair not found. Use snaptrade quote --crypto to find an available pair.",
        );
      const order: CryptoOrderForm = {
        instrument: { symbol: pair.symbol, type: "CRYPTOCURRENCY_PAIR" },
        side: action,
        type: cryptoOrderTypes[orderType as keyof typeof cryptoOrderTypes],
        time_in_force: "GTC",
        amount,
        ...(needsLimit ? { limit_price: limitPrice } : {}),
        ...(needsStop ? { stop_price: stopPrice } : {}),
        ...(orderType === "Limit" ? { post_only: postOnly } : {}),
      };
      const request = { ...user, accountId: account.id, ...order };
      const { preview, quote } = await withDebouncedSpinner(
        "Generating trade preview, please wait...",
        async () => {
          const preview = await snaptrade.trading.previewCryptoOrder(request);
          // A missing quote must not turn into a zero estimate. Broker preview failures abort the trade.
          const quote = await snaptrade.trading
            .getCryptocurrencyPairQuote({
              ...user,
              accountId: account.id,
              instrumentSymbol: pair.symbol!,
            })
            .then((response) => response.data)
            .catch(() => undefined);
          return { preview: preview.data, quote };
        },
      );
      printCryptoTradePreview({
        account,
        pair,
        order,
        orderType,
        preview,
        quote,
      });
      const result = await confirm({
        message: "Are you sure you want to place this trade?",
        default: false,
      });
      if (!result) {
        console.log("❌ Trade cancelled by user.");
        return;
      }
      // Submit once. An uncertain placement failure must never be retried automatically.
      const response = await snaptrade.trading.placeCryptoOrder(request);
      console.log("✅ Order submitted!");
      await handlePostTrade(snaptrade, response, account, user, "trade");
    });
}
