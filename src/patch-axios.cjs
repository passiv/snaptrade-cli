(async () => {
  const chalk = (await import("chalk")).default;
  const axios = require("axios"); // Use require to ensure it's the same instance as the one used in the SDK
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const { OAUTH_CLIENT_ID } = require("./utils/oauthConstants.cjs");
  const isVerbose = process.argv.includes("--verbose");
  const CONFIG_ROOT =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  const CONFIG_FILE = path.join(CONFIG_ROOT, "snaptrade", "settings.json");
  const OAUTH_EXPIRY_SKEW_MS = 60_000;

  function readSettings() {
    try {
      if (!fs.existsSync(CONFIG_FILE)) return {};
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    } catch {
      return {};
    }
  }

  function writeSettings(settings) {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(settings, null, 2));
  }

  function getActiveProfile(settings = readSettings()) {
    const profileName = settings.activeProfile || "default";
    return {
      settings,
      profileName,
      profile: (settings.profiles && settings.profiles[profileName]) || {},
    };
  }

  function oauthIssuerFromBasePath(basePath) {
    if (!basePath) return "https://api.snaptrade.com";
    const url = new URL(basePath);
    url.pathname = url.pathname.replace(/\/api\/v1\/?$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  }

  async function getOAuthMetadata(profile) {
    const issuer = oauthIssuerFromBasePath(profile.basePath);
    const response = await fetch(
      `${issuer}/.well-known/oauth-authorization-server`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) {
      throw new Error(
        `Failed to fetch SnapTrade OAuth metadata: ${response.status} ${await response.text()}`,
      );
    }
    return response.json();
  }

  function expiresAt(expiresIn) {
    return new Date(Date.now() + (expiresIn ?? 36_000) * 1000).toISOString();
  }

  function hasUsableAccessToken(profile) {
    if (!profile.oauthAccessToken) return false;
    if (!profile.oauthExpiresAt) return true;
    return (
      new Date(profile.oauthExpiresAt).getTime() >
      Date.now() + OAUTH_EXPIRY_SKEW_MS
    );
  }

  async function refreshOAuthToken(force = false) {
    const { settings, profileName, profile } = getActiveProfile();
    if (profile.authMode !== "oauth") return null;

    const expires = profile.oauthExpiresAt
      ? new Date(profile.oauthExpiresAt).getTime()
      : 0;
    if (
      !force &&
      profile.oauthAccessToken &&
      expires > Date.now() + OAUTH_EXPIRY_SKEW_MS
    ) {
      return profile.oauthAccessToken;
    }

    if (!profile.oauthRefreshToken) {
      return hasUsableAccessToken(profile) ? profile.oauthAccessToken : null;
    }

    const metadata = await getOAuthMetadata(profile);
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: profile.oauthRefreshToken,
      client_id: OAUTH_CLIENT_ID,
    });
    const response = await fetch(metadata.token_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });
    if (!response.ok) {
      throw new Error(
        `SnapTrade OAuth token refresh failed: ${response.status} ${await response.text()}`,
      );
    }
    const token = await response.json();
    const profiles = { ...(settings.profiles || {}) };
    profiles[profileName] = {
      ...profile,
      authMode: "oauth",
      oauthAccessToken: token.access_token,
      oauthRefreshToken: token.refresh_token || profile.oauthRefreshToken,
      oauthExpiresAt: expiresAt(token.expires_in),
      oauthScope: token.scope,
    };
    writeSettings({ ...settings, profiles });
    return token.access_token;
  }

  axios.interceptors.request.use(async (config) => {
    config.metadata = { startTime: Date.now() };
    const token = await refreshOAuthToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  axios.interceptors.response.use(
    (response) => {
      if (!isVerbose) return response;

      const duration = Date.now() - response.config.metadata.startTime;
      console.log(
        chalk.gray(
          "------------------------------------------------------------------------------",
        ),
      );
      console.log(chalk.gray("Request URL:"), response.config.url);
      console.log(chalk.gray("Request ID:"), response.headers["x-request-id"]);
      console.log(chalk.gray("Response Status:"), response.status);
      console.log(
        chalk.gray("Ratelimit Total:"),
        response.headers["x-ratelimit-limit"],
      );
      console.log(
        chalk.gray("Ratelimit Remaining:"),
        response.headers["x-ratelimit-remaining"],
      );
      console.log(
        chalk.gray("Ratelimit Reset:"),
        response.headers["x-ratelimit-reset"],
      );
      if (response.headers["x-ratelimit-account-limit"]) {
        console.log(
          chalk.gray("Account Ratelimit Total:"),
          response.headers["x-ratelimit-account-limit"],
        );
      }
      if (response.headers["x-ratelimit-account-remaining"]) {
        console.log(
          chalk.gray("Account Ratelimit Remaining:"),
          response.headers["x-ratelimit-account-remaining"],
        );
      }
      if (response.headers["x-ratelimit-account-reset"]) {
        console.log(
          chalk.gray("Account Ratelimit Reset:"),
          response.headers["x-ratelimit-account-reset"],
        );
      }
      console.log(chalk.gray("Latency:"), duration, "ms");
      console.log(
        chalk.gray(
          "------------------------------------------------------------------------------",
        ),
      );
      return response;
    },
    async (error) => {
      const config = error.config;
      if (
        error.response &&
        error.response.status === 401 &&
        config &&
        !config.__snaptradeOAuthRetried
      ) {
        const token = await refreshOAuthToken(true);
        if (token) {
          config.__snaptradeOAuthRetried = true;
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${token}`;
          return axios(config);
        }
      }
      return Promise.reject(error);
    },
  );
})();
