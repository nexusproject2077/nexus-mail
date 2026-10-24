import "dotenv/config";

/** Runtime configuration, read once from the environment. */
export const config = {
  port: Number(process.env.PORT ?? 4000),
  /** Bind to loopback by default; Apache is the only public entry point. */
  host: process.env.HOST ?? "127.0.0.1",
  /**
   * Secret used to derive the AES key that encrypts stored IMAP/SMTP
   * credentials at rest. MUST be set to a strong random value in production.
   */
  appSecret: process.env.APP_SECRET ?? "dev-insecure-change-me",
  /** SQLite database file path. */
  dbPath: process.env.DB_PATH ?? "./data/nexus.db",
  /** Allowed CORS origin for the frontend. `*` allows any (dev only). */
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  /** Single-owner login for a self-hosted instance. Never expose this value to the frontend. */
  authUsername: process.env.AUTH_USERNAME ?? "",
  authPasswordHash: process.env.AUTH_PASSWORD_HASH ?? "",
  authUserId: process.env.AUTH_USER_ID ?? "owner",
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 168),
  cookieSecure: process.env.COOKIE_SECURE !== "false",
  cookiePath: process.env.COOKIE_PATH ?? "/mail",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
  oauthSuccessRedirect: process.env.OAUTH_SUCCESS_REDIRECT ?? "",
};

export function assertProductionSecret() {
  if (
    process.env.NODE_ENV === "production" &&
    (config.appSecret === "dev-insecure-change-me" ||
      !config.authUsername ||
      !config.authPasswordHash ||
      config.corsOrigin === "*" ||
      (config.googleClientId && (!config.googleClientSecret || !config.googleRedirectUri || !config.oauthSuccessRedirect)))
  ) {
    throw new Error(
      "APP_SECRET, AUTH_USERNAME, AUTH_PASSWORD_HASH and an exact CORS_ORIGIN are required in production.",
    );
  }
}
