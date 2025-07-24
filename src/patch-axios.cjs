(async () => {
  const chalk = (await import("chalk")).default;
  const axios = require("axios"); // Use require to ensure it's the same instance as the one used in the SDK
  const isVerbose = process.argv.includes("--verbose");

  axios.interceptors.response.use(
    (response) => {
      if (!isVerbose) return response;

      console.log(
        chalk.gray(
          "------------------------------------------------------------------------------"
        )
      );
      console.log(chalk.gray("Request URL:"), response.config.url);
      console.log(chalk.gray("Request ID:"), response.headers["x-request-id"]);
      console.log(chalk.gray("Response Status:"), response.status);
      console.log(
        chalk.gray(
          "------------------------------------------------------------------------------"
        )
      );
      return response;
    },
    (error) => {
      return Promise.reject(error);
    }
  );
})();
