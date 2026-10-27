import express from "express";
import { startQueueWorker } from "./outgoing-queue.js";
import { expireSnoozedMessages } from "./db.js";
import cors from "cors";
import { config, assertProductionSecret } from "./config.js";
import { accountsRouter } from "./routes/accounts.js";
import { messagesRouter } from "./routes/messages.js";
import { authRouter } from "./routes/auth.js";
import { googleOAuthRouter } from "./routes/google-oauth.js";

assertProductionSecret();

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: config.corsOrigin, credentials: true, methods: ["GET", "POST", "PATCH", "DELETE"], allowedHeaders: ["Content-Type", "X-CSRF-Token"] }));
app.use(express.json({ limit: "15mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "nexus-mail-backend" });
});

app.use("/api/auth", authRouter);
app.use("/api/oauth", googleOAuthRouter);
app.use("/api/accounts", accountsRouter);
// Message routes are nested under an account id: /api/accounts/:id/messages...
app.use("/api/accounts", messagesRouter);

app.listen(config.port, config.host, () => {
  startQueueWorker();
  // Expiry is durable and does not depend on an open browser tab.
  expireSnoozedMessages();
  const snoozeTimer = setInterval(expireSnoozedMessages, 30_000);
  snoozeTimer.unref();
  console.log(`Nexus Mail backend listening on ${config.host}:${config.port}`);
});
