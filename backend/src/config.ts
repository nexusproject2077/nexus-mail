import "dotenv/config";

/** Runtime configuration, read once from the environment. */
export const config = {
  port: Number(process.env.PORT ?? 4000),
  /**
   * Secret used to derive the AES key that encrypts stored IMAP/SMTP
   * credentials at rest. MUST be set to a strong random value in production.
   */
  appSecret: process.env.APP_SECRET ?? "dev-insecure-change-me",
  /** SQLite database file path. */
  dbPath: process.env.DB_PATH ?? "./data/nexus.db",
  /** Allowed CORS origin for the frontend. `*` allows any (dev only). */
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
};

export function assertProductionSecret() {
  if (
    process.env.NODE_ENV === "production" &&
    config.appSecret === "dev-insecure-change-me"
  ) {
    throw new Error(
      "APP_SECRET must be set to a strong random value in production.",
    );
  }
}
