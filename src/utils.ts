// src/utils.ts

/**
 * Simple console-based logger with timestamps (no external dependencies).
 */
function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  info: (msg: string) => console.log(`${timestamp()} [INFO]  ${msg}`),
  warn: (msg: string) => console.warn(`${timestamp()} [WARN]  ${msg}`),
  error: (msg: string) => console.error(`${timestamp()} [ERROR] ${msg}`),
  debug: (msg: string) => console.debug(`${timestamp()} [DEBUG] ${msg}`),
};

/**
 * Async retry wrapper with exponential back-off.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1_000
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e) {
      attempt++;
      if (attempt > retries) throw e;
      logger.warn(`Retry ${attempt}/${retries} after error: ${e}`);
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
}

/**
 * Sleep helper.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
