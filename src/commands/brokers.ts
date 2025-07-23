import Table from "cli-table3";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";

export function brokersCommand(snaptrade: Snaptrade): Command {
  return new Command("brokers")
    .description("List all brokers available to connect")
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
