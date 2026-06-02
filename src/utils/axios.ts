import axios, {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import chalk from "chalk";
import { refreshOAuthToken } from "./oauth.ts";

type RequestConfigWithMetadata = InternalAxiosRequestConfig & {
  metadata?: {
    startTime: number;
  };
  __snaptradeOAuthRetried?: boolean;
};

let installed = false;
const REDACTED_HEADER_NAMES = new Set(["signature", "x-api-key", "api-key"]);

function redactUrl(url: string | undefined): string | undefined {
  if (!url) return url;

  try {
    const parsed = new URL(url, "https://api.snaptrade.com");
    for (const key of ["userSecret", "clientSecret", "signature"]) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, "REDACTED");
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function redactHeaders(
  headers: InternalAxiosRequestConfig["headers"] | undefined,
) {
  if (!headers) return {};

  const headerRecord =
    typeof headers.toJSON === "function" ? headers.toJSON() : headers;

  return Object.fromEntries(
    Object.entries(headerRecord).map(([key, value]) => [
      key,
      REDACTED_HEADER_NAMES.has(key.toLowerCase()) ? "REDACTED" : value,
    ]),
  );
}

function duration(responseOrConfig: AxiosResponse | RequestConfigWithMetadata) {
  const config = (
    "config" in responseOrConfig ? responseOrConfig.config : responseOrConfig
  ) as RequestConfigWithMetadata;
  return config.metadata ? Date.now() - config.metadata.startTime : undefined;
}

function logResponse(response: AxiosResponse) {
  if (!process.argv.includes("--verbose")) return;

  console.log(
    chalk.gray(
      "------------------------------------------------------------------------------",
    ),
  );
  console.log(chalk.gray("Request URL:"), redactUrl(response.config.url));
  console.log(
    chalk.gray("Request Headers:"),
    redactHeaders(response.config.headers),
  );
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
  const elapsed = duration(response);
  if (elapsed != null) {
    console.log(chalk.gray("Latency:"), elapsed, "ms");
  }
  console.log(
    chalk.gray(
      "------------------------------------------------------------------------------",
    ),
  );
}

function logError(error: AxiosError) {
  if (!process.argv.includes("--verbose")) return;

  const config = error.config as RequestConfigWithMetadata | undefined;
  console.log(
    chalk.gray(
      "------------------------------------------------------------------------------",
    ),
  );
  console.log(chalk.gray("Request URL:"), redactUrl(config?.url));
  console.log(chalk.gray("Request Headers:"), redactHeaders(config?.headers));
  console.log(
    chalk.gray("Request ID:"),
    error.response?.headers["x-request-id"],
  );
  console.log(chalk.gray("Response Status:"), error.response?.status);
  const elapsed = config ? duration(config) : undefined;
  if (elapsed != null) {
    console.log(chalk.gray("Latency:"), elapsed, "ms");
  }
  console.log(chalk.gray("Response Body:"), error.response?.data);
  console.log(
    chalk.gray(
      "------------------------------------------------------------------------------",
    ),
  );
}

export function installAxiosPatch() {
  if (installed) return;
  installed = true;

  axios.interceptors.request.use(async (config) => {
    const configWithMetadata = config as RequestConfigWithMetadata;
    configWithMetadata.metadata = { startTime: Date.now() };

    const token = await refreshOAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  });

  axios.interceptors.response.use(
    (response) => {
      logResponse(response);
      return response;
    },
    async (error: AxiosError) => {
      const config = error.config as RequestConfigWithMetadata | undefined;
      if (
        error.response?.status === 401 &&
        config &&
        !config.__snaptradeOAuthRetried
      ) {
        const token = await refreshOAuthToken(true);
        if (token) {
          config.__snaptradeOAuthRetried = true;
          config.headers.Authorization = `Bearer ${token}`;
          return axios(config);
        }
      }

      logError(error);
      return Promise.reject(error);
    },
  );
}
