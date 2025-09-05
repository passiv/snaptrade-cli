import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { selectAccount } from "../utils/selectAccount.ts";
import { loadOrRegisterUser } from "../utils/user.ts";
import Table from "cli-table3";
import { search } from "@inquirer/prompts";
import assert from "assert";
import ora from "ora";
import { withDebouncedSpinner } from "../utils/withDebouncedSpinner.ts";

const CRYPTO_BROKERS = ["Coinbase", "Binance", "Kraken"];

export function quoteCommand(snaptrade: Snaptrade): Command {
  return new Command("quote")
    .description("Get the latest market quote")
    .argument(
      "[symbols]",
      "The symbol to get the quote for. Can be a single symbol or a comma-separated list of symbols"
    )
    .action(async (symbolsArgs: string, opts, command) => {
      const user = await loadOrRegisterUser(snaptrade);
      const account = await selectAccount({
        snaptrade,
        useLastAccount: command.parent.opts().useLastAccount,
      });

      // Quote endpoints are different for crypto and non-crypto accounts
      if (CRYPTO_BROKERS.includes(account.institution_name)) {
        const symbols = await (async () => {
          if (symbolsArgs) {
            return symbolsArgs.split(",").map((s) => s.trim());
          }
          const response =
            await snaptrade.trading.searchCryptocurrencyPairInstruments({
              ...user,
              accountId: account.id,
            });
          const answer = await search({
            message: "Search for an instrument",
            source: async (input, { signal }) => {
              return response.data.items
                .filter((instrument) =>
                  instrument.symbol
                    ?.toLowerCase()
                    .includes(input?.toLowerCase() ?? "")
                )
                .map((instrument) => ({
                  name: instrument.symbol,
                  value: instrument.symbol,
                }));
            },
          });
          assert(answer, "No instrument selected");
          return [answer];
        })();

        const quotes = await Promise.all(
          symbols.map(async (symbol) => ({
            symbol,
            quote: await snaptrade.trading.getCryptocurrencyPairQuote({
              ...user,
              accountId: account.id,
              instrumentSymbol: symbol,
            }),
          }))
        );
        const table = new Table({
          head: ["Symbol", "Bid", "Ask", "Mid"],
        });

        quotes.forEach((quote) => {
          table.push([
            quote.symbol,
            quote.quote.data.bid,
            quote.quote.data.ask,
            quote.quote.data.mid,
          ]);
        });

        console.log(table.toString());
      } else {
        const symbols = await (async () => {
          if (symbolsArgs) {
            return symbolsArgs;
          }

          const conn = await snaptrade.connections.detailBrokerageAuthorization(
            {
              ...user,
              authorizationId: account.brokerage_authorization,
            }
          );

          const instruments = await withDebouncedSpinner(
            `Loading all available instruments for ${conn.data.brokerage?.display_name}, this could take a little while...`,
            async () => {
              const instrumentsResponse =
                await snaptrade.referenceData.listAllBrokerageInstruments({
                  slug: conn.data.brokerage?.slug!,
                });
              return instrumentsResponse.data.instruments;
            }
          );
          if (instruments == null || instruments.length === 0) {
            return undefined;
          }
          instruments.sort((a, b) => a.symbol!.localeCompare(b.symbol!));

          const answer = await search({
            message: "Search for an instrument",
            source: async (input, { signal }) => {
              return instruments
                .filter((instrument) =>
                  instrument.symbol
                    ?.toLowerCase()
                    .includes(input?.toLowerCase() ?? "")
                )
                .map((instrument) => ({
                  name: instrument.symbol,
                  value: instrument.symbol,
                }));
            },
          });
          return answer;
        })();

        if (!symbols) {
          console.error(
            "No instruments found. See https://snaptrade.notion.site/66793431ad0b416489eaabaf248d0afb?v=241feaa69a1c80a6b2f9000cdee4883b&source=copy_link for brokers with available instruments."
          );
          return;
        }

        const response = await snaptrade.trading.getUserAccountQuotes({
          ...user,
          accountId: account.id,
          symbols,
          useTicker: true,
        });

        const table = new Table({
          head: ["Symbol", "Bid", "Ask", "Last"],
        });

        for (const quote of response.data) {
          table.push([
            quote.symbol?.symbol,
            `${quote.bid_price?.toLocaleString("en-US", {
              style: "currency",
              currency: quote.symbol?.currency.code,
            })} x${quote.bid_size}`,
            `${quote.ask_price?.toLocaleString("en-US", {
              style: "currency",
              currency: quote.symbol?.currency.code,
            })} x${quote.ask_size}`,
            quote.last_trade_price?.toLocaleString("en-US", {
              style: "currency",
              currency: quote.symbol?.currency.code,
            }),
          ]);
        }

        console.log(table.toString());
      }
    });
}
