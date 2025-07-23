import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { loadOrRegisterUser } from "../utils/user.ts";
import chalk from "chalk";
import Table from "cli-table3";

export function brokersCommand(snaptrade: Snaptrade): Command {
  return new Command("brokers")
    .description("Get the list of brokers available to your SnapTrade account")
    .action(async () => {
      const response = await snaptrade.referenceData.getPartnerInfo();
      const table = new Table({
        head: ["Slug", "Name", "URL", "Allows Trading"],
      });
      // Sort brokers by slug
      response.data.allowed_brokerages?.sort((a, b) =>
        a.slug!.localeCompare(b.slug!)
      );
      response.data.allowed_brokerages?.forEach((broker) => {
        table.push([
          broker.slug,
          broker.display_name,
          broker.url,
          broker.allows_trading ? "✅" : "❌",
        ]);
      });
      console.log(table.toString());
    });
}
