import fs from "fs";
import { join } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useIsolatedConfigHome } from "./helpers/cli.ts";

const mode = (file: string) => fs.statSync(file).mode & 0o777;

describe.skipIf(process.platform === "win32")(
  "credential file permissions",
  () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it.each([0o022, 0o000, 0o777])(
      "creates owner-only settings with umask %s",
      async (umask) => {
        const root = useIsolatedConfigHome();
        const rootMode = mode(root);
        const settings = await import("../src/utils/settings.ts");
        const originalUmask = process.umask(umask);
        try {
          settings.saveProfile({
            authMode: "oauth",
            oauthAccessToken: "test-access-token",
            oauthRefreshToken: "test-refresh-token",
          });
        } finally {
          process.umask(originalUmask);
        }

        expect(mode(join(root, "snaptrade"))).toBe(0o700);
        expect(mode(settings.CONFIG_FILE)).toBe(0o600);
        expect(mode(root)).toBe(rootMode);
        expect(settings.getProfile().oauthRefreshToken).toBe(
          "test-refresh-token",
        );
      },
    );

    it("repairs permissive existing settings and preserves profiles across saves", async () => {
      const root = useIsolatedConfigHome();
      const dir = join(root, "snaptrade");
      const file = join(dir, "settings.json");
      fs.mkdirSync(dir);
      fs.chmodSync(dir, 0o777);
      fs.writeFileSync(
        file,
        JSON.stringify({
          activeProfile: "work",
          profiles: {
            work: {
              consumerKey: "test-consumer-key",
              userSecret: "test-user-secret",
            },
            personal: { oauthRefreshToken: "test-refresh-token" },
          },
        }),
      );
      fs.chmodSync(file, 0o666);
      const settings = await import("../src/utils/settings.ts");

      settings.saveProfile({ lastAccountId: "test-account" });

      expect(mode(dir)).toBe(0o700);
      expect(mode(file)).toBe(0o600);
      expect(settings.getActiveProfileName()).toBe("work");
      expect(settings.getProfile()).toMatchObject({
        consumerKey: "test-consumer-key",
        userSecret: "test-user-secret",
        lastAccountId: "test-account",
      });
      expect(settings.getProfile("personal").oauthRefreshToken).toBe(
        "test-refresh-token",
      );

      // A shorter subsequent save must not leave stale JSON or relax permissions.
      settings.clearProfileFields(["consumerKey", "userSecret"]);
      expect(settings.getProfile()).toEqual({ lastAccountId: "test-account" });
      expect(mode(file)).toBe(0o600);
    });

    it("does not truncate or write credentials if securing the file fails", async () => {
      const root = useIsolatedConfigHome();
      const dir = join(root, "snaptrade");
      const file = join(dir, "settings.json");
      fs.mkdirSync(dir);
      const original = JSON.stringify({
        profiles: { default: { consumerKey: "existing-key" } },
      });
      fs.writeFileSync(file, original);
      const settings = await import("../src/utils/settings.ts");
      vi.spyOn(fs, "fchmodSync").mockImplementation(() => {
        throw new Error("Cannot restrict credential permissions");
      });

      expect(() =>
        settings.saveProfile({ consumerKey: "replacement-key" }),
      ).toThrow("Cannot restrict credential permissions");
      expect(fs.readFileSync(file, "utf8")).toBe(original);
    });
  },
);
