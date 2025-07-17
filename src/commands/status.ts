import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";

export function statusCommand(snaptrade: Snaptrade): Command {
  return new Command("status")
    .description("Check SnapTrade API status")
    .action(async () => {
      const status = await snaptrade.apiStatus.check();
      console.log(status.data);
    });
}
