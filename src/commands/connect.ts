import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { handleConnect } from "../utils/connect.ts";
import { loadOrRegisterUser } from "../utils/user.ts";

export function connectCommand(snaptrade: Snaptrade): Command {
  return new Command("connect")
    .description("Connect a brokerage account")
    .option("--broker <slug>", "Brokerage slug to connect")
    .action(async (opts) => {
      const user = await loadOrRegisterUser(snaptrade);
      const slug = opts.broker;

      if (slug) {
        const response = await snaptrade.referenceData.getPartnerInfo();
        const available = response.data.allowed_brokerages;

        const broker = response.data.allowed_brokerages?.find(
          (b) => b.slug === slug
        );
        if (!broker) {
          console.error(
            `${slug} is not a valid broker slug. Available brokers: ${available?.map((b) => b.slug).join(", ")}`
          );
          return;
        }
        await handleConnect({
          snaptrade,
          user,
          brokerSlug: slug,
          connectionType: broker.allows_trading ? "trade" : "read",
        });
      } else {
        await handleConnect({
          snaptrade,
          user,
        });
      }
    });
}
