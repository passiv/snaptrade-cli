import { select } from "@inquirer/prompts";
import chalk from "chalk";
import { CONFIG_FILE } from "./settings.ts";

export type AuthChoice = {
  accountType: "personal" | "commercial";
  authMode: "oauth" | "apiKey";
};

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

Personal users can sign in with SnapTrade OAuth in the browser or use their SnapTrade client ID and consumer key.

Commercial users can use their SnapTrade client ID and consumer key.

Credentials will be saved in your local config file (${CONFIG_FILE}).
`),
  );
}

export async function promptAuthMode(): Promise<AuthChoice> {
  const accountType = await select({
    message: "What kind of SnapTrade account do you want to use?",
    choices: [
      {
        name: "Personal SnapTrade account",
        value: "personal" as const,
        description: "Use OAuth or a client ID and consumer key.",
      },
      {
        name: "Commercial SnapTrade account",
        value: "commercial" as const,
        description: "Use a client ID and consumer key.",
      },
    ],
  });

  if (accountType === "commercial") {
    return {
      accountType: "commercial",
      authMode: "apiKey",
    };
  }

  const authMode = await select({
    message: "How do you want to authenticate your Personal account?",
    choices: [
      {
        name: "OAuth",
        value: "oauth" as const,
        description: "Sign in with your browser using SnapTrade OAuth.",
      },
      {
        name: "Client ID and consumer key",
        value: "apiKey" as const,
        description: "Use your Personal SnapTrade credentials.",
      },
    ],
  });

  return {
    accountType: "personal",
    authMode,
  };
}
