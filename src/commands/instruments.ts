import { search } from "@inquirer/prompts";
import chalk from "chalk";
import Table from "cli-table3";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { loadOrRegisterUser } from "../utils/user.ts";
import { withDebouncedSpinner } from "../utils/withDebouncedSpinner.ts";

export function instrumentsCommand(snaptrade: Snaptrade): Command {
  return new Command("instruments")
    .description("Get a list of available instruments from a broker")
    .action(async () => {
      const user = await loadOrRegisterUser(snaptrade);

      const response = await snaptrade.referenceData.getPartnerInfo();
      // Sort brokers by slug
      response.data.allowed_brokerages?.sort((a, b) =>
        a.slug!.localeCompare(b.slug!)
      );

      const broker = await search({
        message: "Search for a broker",
        source: async (input, { signal }) => {
          return (
            response.data.allowed_brokerages
              ?.filter((broker) =>
                broker.display_name
                  ?.toLowerCase()
                  .includes(input?.toLowerCase() ?? "")
              )
              .map((broker) => ({
                name: broker.display_name,
                value: broker,
              })) ?? []
          );
        },
      });

      if (!broker) {
        console.log(chalk.red("No broker selected. Exiting."));
        return;
      }

      const instruments = await withDebouncedSpinner(
        `Loading all available instruments for ${broker.display_name}, this could take a little while...`,
        async () => {
          const instrumentsResponse =
            await snaptrade.referenceData.listAllBrokerageInstruments({
              brokerageId: broker.id!,
            });
          return instrumentsResponse.data.instruments;
        }
      );

      if (instruments == null || instruments.length === 0) {
        console.log(
          "No instruments found. See https://snaptrade.notion.site/66793431ad0b416489eaabaf248d0afb?v=241feaa69a1c80a6b2f9000cdee4883b&source=copy_link for brokers with available instruments."
        );
        return;
      }

      const table = new Table({
        head: ["Symbol", "Exchange", "Tradable", "Fractionable"],
      });

      instruments.forEach((instrument) => {
        table.push([
          instrument.symbol,
          instrument.exchange_mic,
          instrument.tradeable ? "✅" : "❌",
          instrument.fractionable ? "✅" : "❌",
        ]);
      });
      console.table(table.toString());
    });
}
