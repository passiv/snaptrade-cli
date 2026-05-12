import { select } from "@inquirer/prompts";
import chalk from "chalk";
import { CONFIG_FILE } from "./settings.ts";

export function printSetupIntro(): void {
  console.log(
    chalk.yellow(`
┌───────────────────────────────────────────────────────────────────────────────────┐
│                                                                                   │
│                                                                                   │
│    ███████╗███╗   ██╗ █████╗ ██████╗ ████████╗██████╗  █████╗ ██████╗ ███████╗    │
│    ██╔════╝████╗  ██║██╔══██╗██╔══██╗╚══██╔══╝██╔══██╗██╔══██╗██╔══██╗██╔════╝    │
│    ███████╗██╔██╗ ██║███████║██████╔╝   ██║   ██████╔╝███████║██║  ██║█████╗      │
│    ╚════██║██║╚██╗██║██╔══██║██╔═══╝    ██║   ██╔══██╗██╔══██║██║  ██║██╔══╝      │
│    ███████║██║ ╚████║██║  ██║██║        ██║   ██║  ██║██║  ██║██████╔╝███████╗    │
│                                                                                   │
│                    SnapTrade CLI ─ Connect • Trade • Automate                     │
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘
`),
  );

  console.log(
    chalk.cyan(`To use the SnapTrade CLI, choose how you want to authenticate.

If you don't have a SnapTrade account yet, create one at https://dashboard.snaptrade.com/signup.

Personal users can sign in with SnapTrade OAuth in the browser.

Commercial users can use their SnapTrade client ID and consumer key.

Credentials will be saved in your local config file (${CONFIG_FILE}).
`),
  );
}

export async function promptAuthMode(): Promise<"oauth" | "apiKey"> {
  return select({
    message: "What kind of SnapTrade account do you want to use?",
    choices: [
      {
        name: "Personal SnapTrade account",
        value: "oauth" as const,
        description: "Sign in with your browser using SnapTrade OAuth.",
      },
      {
        name: "Commercial SnapTrade API credentials",
        value: "apiKey" as const,
        description: "Use a client ID and consumer key.",
      },
    ],
  });
}
