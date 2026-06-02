import { writeFileSync } from "fs";
import { join } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureConsole,
  createMockSnaptrade,
  parseCommand,
  stripAnsi,
  useIsolatedConfigHome,
} from "./helpers/cli.ts";

function writeSettings(configHome: string, settings: unknown) {
  const settingsDir = join(configHome, "snaptrade");
  writeFileSync(
    join(settingsDir, "settings.json"),
    JSON.stringify(settings, null, 2),
  );
}

describe("settings and profile commands", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("isolates profile reads and writes under XDG_CONFIG_HOME", async () => {
    const configHome = useIsolatedConfigHome();
    const { mkdirSync } = await import("fs");
    mkdirSync(join(configHome, "snaptrade"), { recursive: true });

    const settings = await import("../src/utils/settings.ts");
    settings.saveProfile({
      authMode: "apiKey",
      accountType: "personal",
      clientId: "client",
      consumerKey: "key",
    });

    expect(settings.getProfile()).toMatchObject({
      authMode: "apiKey",
      accountType: "personal",
      clientId: "client",
      consumerKey: "key",
    });
  });

  it("lists profiles with the active marker and auth mode labels", async () => {
    const configHome = useIsolatedConfigHome();
    const { mkdirSync } = await import("fs");
    mkdirSync(join(configHome, "snaptrade"), { recursive: true });
    writeSettings(configHome, {
      activeProfile: "work",
      profiles: {
        work: {
          authMode: "apiKey",
          accountType: "commercial",
          clientId: "work-client",
          consumerKey: "work-key",
        },
        personal: {
          authMode: "apiKey",
          accountType: "personal",
          clientId: "personal-client",
          consumerKey: "personal-key",
        },
        oauth: {
          authMode: "oauth",
          oauthEmail: "person@example.com",
        },
      },
    });

    const { profilesCommand } = await import("../src/commands/profiles.ts");
    const consoleOutput = captureConsole();

    await parseCommand(profilesCommand(), ["profiles", "list"]);

    const output = stripAnsi(consoleOutput.log.join("\n"));
    expect(output).toContain("* work (commercial apiKey)");
    expect(output).toContain("personal (personal apiKey)");
    expect(output).toContain("oauth (personal oauth)");
  });

  it("switches active profile and prints confirmation", async () => {
    const configHome = useIsolatedConfigHome();
    const { mkdirSync } = await import("fs");
    mkdirSync(join(configHome, "snaptrade"), { recursive: true });

    const { profilesCommand } = await import("../src/commands/profiles.ts");
    const { getActiveProfileName, getProfile } = await import(
      "../src/utils/settings.ts"
    );
    const consoleOutput = captureConsole();

    await parseCommand(profilesCommand(), ["profiles", "use", "sandbox"]);

    expect(getActiveProfileName()).toBe("sandbox");
    expect(getProfile("sandbox")).toEqual({});
    expect(stripAnsi(consoleOutput.log.join("\n"))).toContain(
      "Active profile set to sandbox",
    );
  });
});

describe("status command output", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("prints personal API key auth copy", async () => {
    const configHome = useIsolatedConfigHome();
    const { mkdirSync } = await import("fs");
    mkdirSync(join(configHome, "snaptrade"), { recursive: true });
    writeSettings(configHome, {
      profiles: {
        default: {
          authMode: "apiKey",
          accountType: "personal",
          clientId: "client",
          consumerKey: "key",
        },
      },
    });

    const snaptrade = createMockSnaptrade();
    vi.mocked(snaptrade.referenceData.getPartnerInfo).mockResolvedValue({
      data: { slug: "partner" },
    });
    const { statusCommand } = await import("../src/commands/status.ts");
    const consoleOutput = captureConsole();

    await parseCommand(statusCommand(snaptrade), ["status"]);

    const output = stripAnsi(consoleOutput.log.join("\n"));
    expect(output).toContain(
      "Authentication: Personal SnapTrade client ID and consumer key",
    );
    expect(output).toContain("Client ID: partner");
    expect(output).toContain("API credentials");
  });

  it("prints OAuth status and email without partner lookup", async () => {
    const configHome = useIsolatedConfigHome();
    const { mkdirSync } = await import("fs");
    mkdirSync(join(configHome, "snaptrade"), { recursive: true });
    writeSettings(configHome, {
      profiles: {
        default: {
          authMode: "oauth",
          oauthEmail: "person@example.com",
        },
      },
    });
    vi.doMock("../src/utils/oauth.ts", () => ({
      ensureOAuthLogin: vi.fn().mockResolvedValue(undefined),
    }));

    const snaptrade = createMockSnaptrade();
    const { statusCommand } = await import("../src/commands/status.ts");
    const consoleOutput = captureConsole();

    await parseCommand(statusCommand(snaptrade), ["status"]);

    const output = stripAnsi(consoleOutput.log.join("\n"));
    expect(output).toContain("Authentication: Personal SnapTrade OAuth");
    expect(output).toContain("SnapTrade email: person@example.com");
    expect(snaptrade.referenceData.getPartnerInfo).not.toHaveBeenCalled();
  });

  it("prints commercial status details", async () => {
    const configHome = useIsolatedConfigHome();
    const { mkdirSync } = await import("fs");
    mkdirSync(join(configHome, "snaptrade"), { recursive: true });
    writeSettings(configHome, {
      profiles: {
        default: {
          authMode: "apiKey",
          accountType: "commercial",
          clientId: "client",
          consumerKey: "key",
          userId: "cli-user",
          userSecret: "secret",
        },
      },
    });

    const snaptrade = createMockSnaptrade();
    vi.mocked(snaptrade.referenceData.getPartnerInfo).mockResolvedValue({
      data: { slug: "partner", can_access_trades: false },
    });
    const { statusCommand } = await import("../src/commands/status.ts");
    const consoleOutput = captureConsole();

    await parseCommand(statusCommand(snaptrade), ["status"]);

    const output = stripAnsi(consoleOutput.log.join("\n"));
    expect(output).toContain("Logged in as cli-user");
    expect(output).toContain("Client ID: partner");
    expect(output).toContain("API credentials");
    expect(output).toContain("Trading access");
  });
});
