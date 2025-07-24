#!/usr/bin/env node
import "./patch-axios.cjs"; // Ensure axios interceptors are set up before any requests
import { input, password } from "@inquirer/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { registerCommands } from "./commands/index.ts";
import { CONFIG_FILE, getSettings, saveSettings } from "./utils/settings.ts";

async function initializeSnaptrade(): Promise<Snaptrade> {
  // Load client ID and consumer key from settings
  const settings = getSettings();

  if (settings.clientId && settings.consumerKey) {
    // TODO may want to validate these credentials and reprompt if invalid
    return new Snaptrade({
      clientId: settings.clientId,
      consumerKey: settings.consumerKey,
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
    saveSettings({
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

const program = new Command();
const snaptrade = await initializeSnaptrade();

program
  .name("snaptrade")
  .description("CLI tool to interact with SnapTrade API")
  .version("0.1.0")
  .option(
    "--useLastAccount",
    "Use the last selected account for account specific commands",
    false
  )
  .option("--verbose", "Enable verbose output", false);

registerCommands(program, snaptrade);

program.parse(process.argv);
