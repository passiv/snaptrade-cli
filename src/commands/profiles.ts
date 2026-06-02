import { select } from "@inquirer/prompts";
import chalk from "chalk";
import { Command } from "commander";
import {
  deleteProfile,
  getActiveProfileName,
  getProfile,
  listProfiles,
  setActiveProfile,
} from "../utils/settings.ts";
import { revokeOAuthTokensForProfile } from "../utils/oauth.ts";

export function profilesCommand(): Command {
  const cmd = new Command("profiles").description(
    "Manage SnapTrade CLI profiles",
  );

  cmd
    .command("list")
    .description("List available profiles")
    .action(() => {
      const active = getActiveProfileName();
      const names = listProfiles();
      if (names.length === 0) {
        console.log("No profiles found.");
        return;
      }
      for (const name of names) {
        const mark = name === active ? chalk.green("*") : " ";
        const profile = getProfile(name);
        const authMode = (() => {
          if (profile.authMode === "oauth") return "personal oauth";
          if (
            profile.authMode === "apiKey" &&
            profile.accountType === "personal"
          ) {
            return "personal apiKey";
          }
          if (profile.authMode === "apiKey") return "commercial apiKey";
          return profile.clientId && profile.consumerKey ? "apiKey" : "unset";
        })();
        console.log(`${mark} ${name} ${chalk.gray(`(${authMode})`)}`);
      }
    });

  cmd
    .command("use [name]")
    .description("Switch active profile (creates it if it doesn't exist)")
    .action(async (name: string | undefined, _opts: { register?: boolean }) => {
      const profile = await (async () => {
        if (name) {
          return name;
        }

        const profiles = listProfiles();
        const profile = await select({
          message: "Select a profile to use:",
          choices: profiles.map((profile) => ({
            name: profile,
            value: profile,
          })),
          loop: false,
        });
        return profile;
      })();
      setActiveProfile(profile);
      console.log(`Active profile set to ${chalk.green(profile)}`);
    });

  cmd
    .command("delete <name>")
    .description("Delete a profile locally")
    .action(async (name: string) => {
      const profile = getProfile(name);
      if (profile.authMode === "oauth") {
        try {
          await revokeOAuthTokensForProfile(profile);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          console.warn(
            chalk.yellow(
              `Could not revoke OAuth tokens before deleting profile: ${message}`,
            ),
          );
        }
      }

      deleteProfile(name);
      const nextActive = getActiveProfileName();
      console.log(
        `Deleted profile ${chalk.red(name)}. Active profile: ${chalk.green(nextActive)}.`,
      );
    });

  return cmd;
}
