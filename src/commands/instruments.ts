import chalk from "chalk";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { loadOrRegisterUser } from "../utils/user.ts";
import { search, select } from "@inquirer/prompts";
import ora from "ora";
import Table from "cli-table3";

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

      const spinner = ora(
        `Loading all available instruments for ${broker.display_name}, this could take a little while...`
      ).start();
      const instruments =
        await snaptrade.referenceData.listAllBrokerageInstruments({
          brokerageId: broker.id!,
        });
      spinner.stop();

      if (instruments.data.instruments?.length === 0) {
        console.log("No instruments found for the selected broker.");
        return;
      }

      const table = new Table({
        head: ["Symbol", "Exchange", "Tradable", "Fractionable"],
      });

      instruments.data.instruments?.forEach((instrument) => {
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
