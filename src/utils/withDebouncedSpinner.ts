import ora from "ora";
import type { Ora } from "ora";

export async function withDebouncedSpinner<T>(
  message: string,
  task: () => Promise<T>,
  delay = 200 // ms before showing spinner
): Promise<T> {
  let spinner: Ora | undefined;

  const spinnerTimeout = setTimeout(() => {
    spinner = ora(message).start();
  }, delay);

  try {
    const result = await task();
    clearTimeout(spinnerTimeout);
    spinner?.stop();
    return result;
  } catch (error) {
    clearTimeout(spinnerTimeout);
    spinner?.fail("Operation failed.");
    throw error;
  }
}
