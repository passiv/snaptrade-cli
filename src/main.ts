#!/usr/bin/env node
import "./patch-axios.cjs"; // Ensure axios interceptors are set up before any requests
import { input, password } from "@inquirer/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { fileURLToPath } from "url";
import { registerCommands } from "./commands/index.ts";
import { CONFIG_FILE, getProfile, saveProfile } from "./utils/settings.ts";

async function initializeSnaptrade(version: string): Promise<Snaptrade> {
  // Load client ID and consumer key from the active profile
  const profile = getProfile();

  if (profile.clientId && profile.consumerKey) {
    // TODO may want to validate these credentials and reprompt if invalid
    return new Snaptrade({
      clientId: profile.clientId,
      consumerKey: profile.consumerKey,
      userAgent: `snaptrade-cli/${version}`,
    });
  }

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
`)
  );

  console.log(
    chalk.cyan(`To use the SnapTrade CLI, you'll need your SnapTrade API credentials.

You can get started for free at https://dashboard.snaptrade.com/signup.

Your client ID and consumer key will be provided after you create an account. Enter them below to continue.

These will be saved securely in your local config file (${CONFIG_FILE}).
`)
  );

  // Prompt the user to enter their SnapTrade client ID and consumer key with inquirer
  const clientId = await input({
    message: "Please enter your SnapTrade client ID:",
    required: true,
  });
  const consumerKey = await password({
    message: "Please enter your SnapTrade consumer key:",
    mask: true,
    validate: async (input) => {
      return input.trim() !== "";
    },
  });

  const snaptrade = new Snaptrade({
    consumerKey,
    clientId,
  });
  try {
    await snaptrade.referenceData.getPartnerInfo();
    // This indicates the credentials are valid
    saveProfile({
      clientId,
      consumerKey,
    });

    console.log(
      chalk.green("✅ Your SnapTrade credentials have been saved.\n")
    );
    return snaptrade;
  } catch (error) {
    console.error(
      "❌ The client ID or consumer key you provided doesn't seem to be valid. Please try again."
    );
    process.exit(1);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8")
);
const program = new Command();
const snaptrade = await initializeSnaptrade(packageJson.version);

program
  .name("snaptrade")
  .description("CLI tool to interact with SnapTrade API")
  .version(packageJson.version)
  .option(
    "--useLastAccount",
    "Use the last selected account for account specific commands",
    false
  )
  .option("--verbose", "Enable verbose output", false);

registerCommands(program, snaptrade);

program.parse(process.argv);

process.on("uncaughtException", (error) => {
  if (error instanceof Error && error.name === "ExitPromptError") {
    console.log("👋 until next time!");
  } else {
    // Rethrow unknown errors
    throw error;
  }
});
