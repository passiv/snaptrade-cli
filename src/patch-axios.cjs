(async () => {
  const chalk = (await import("chalk")).default;
  const axios = require("axios"); // Use require to ensure it's the same instance as the one used in the SDK
  const isVerbose = process.argv.includes("--verbose");

  axios.interceptors.request.use((config) => {
    config.metadata = { startTime: Date.now() };
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
    (error) => {
      return Promise.reject(error);
    },
  );
})();
