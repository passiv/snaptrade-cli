#!/usr/bin/env node
import { input, password } from "@inquirer/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { fileURLToPath } from "url";
import { registerCommands } from "./commands/index.ts";
import {
  clearProfileFields,
  getProfile,
  saveProfile,
} from "./utils/settings.ts";
import { createLazySnapTrade } from "./utils/lazySnapTrade.ts";
import {
  ensureOAuthLogin,
  OAUTH_SDK_PLACEHOLDER_CREDENTIAL,
} from "./utils/oauth.ts";
import { printSetupIntro, promptAuthMode } from "./utils/authPrompt.ts";
import { installAxiosPatch } from "./utils/axios.ts";

installAxiosPatch();

async function initializeSnaptrade(version: string): Promise<Snaptrade> {
  // Load client ID and consumer key from the active profile
  const profile = getProfile();

  if (profile.authMode === "oauth") {
    await ensureOAuthLogin();
    return new Snaptrade({
      clientId: OAUTH_SDK_PLACEHOLDER_CREDENTIAL,
      consumerKey: OAUTH_SDK_PLACEHOLDER_CREDENTIAL,
      userAgent: `snaptrade-cli/${version}`,
      basePath: profile.basePath,
    });
  }

  if (profile.clientId && profile.consumerKey) {
    if (
      profile.authMode === "apiKey" &&
      profile.accountType === "personal" &&
      (profile.userId || profile.userSecret)
    ) {
      clearProfileFields(["userId", "userSecret"]);
    }
    // TODO may want to validate these credentials and reprompt if invalid
    return new Snaptrade({
      clientId: profile.clientId,
      consumerKey: profile.consumerKey,
      userAgent: `snaptrade-cli/${version}`,
      basePath: profile.basePath,
    });
  }

  printSetupIntro();

  const authChoice =
    profile.authMode === "apiKey"
      ? {
          accountType: profile.accountType ?? "commercial",
          authMode: "apiKey" as const,
        }
      : await promptAuthMode();

  if (authChoice.authMode === "oauth") {
    saveProfile({ accountType: "personal", authMode: "oauth" });
    clearProfileFields(["clientId", "consumerKey", "userId", "userSecret"]);
    await ensureOAuthLogin();
    return new Snaptrade({
      clientId: OAUTH_SDK_PLACEHOLDER_CREDENTIAL,
      consumerKey: OAUTH_SDK_PLACEHOLDER_CREDENTIAL,
      userAgent: `snaptrade-cli/${version}`,
      basePath: profile.basePath,
    });
  }

  const accountType = authChoice.accountType;

  // Prompt the user to enter their SnapTrade client ID and consumer key with inquirer
  const clientId = await input({
    message: `Please enter your ${accountType === "personal" ? "Personal" : "Commercial"} SnapTrade client ID:`,
    required: true,
  });
  const consumerKey = await password({
    message: `Please enter your ${accountType === "personal" ? "Personal" : "Commercial"} SnapTrade consumer key:`,
    mask: true,
    validate: async (input) => {
      return input.trim() !== "";
    },
  });

  const snaptrade = new Snaptrade({
    consumerKey,
    clientId,
    userAgent: `snaptrade-cli/${version}`,
    basePath: profile.basePath,
  });
  try {
    await snaptrade.referenceData.getPartnerInfo();
    // This indicates the credentials are valid
    saveProfile({
      accountType,
      authMode: "apiKey",
      clientId,
      consumerKey,
    });
    if (accountType === "personal") {
      clearProfileFields(["userId", "userSecret"]);
    }

    console.log(
      chalk.green("✅ Your SnapTrade credentials have been saved.\n"),
    );
    return snaptrade;
  } catch (error) {
    console.error(
      "❌ The client ID or consumer key you provided doesn't seem to be valid. Please try again.",
    );
    process.exit(1);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
);
const program = new Command();

const snaptrade = createLazySnapTrade(() =>
  initializeSnaptrade(packageJson.version),
);

program
  .name("snaptrade")
  .description("CLI tool to interact with SnapTrade API")
  .version(packageJson.version)
  .option(
    "--useLastAccount",
    "Use the last selected account for account specific commands",
    false,
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
