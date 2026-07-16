import express from "express";
import cors from "cors";
import { config, assertProductionSecret } from "./config.js";
import { accountsRouter } from "./routes/accounts.js";
import { messagesRouter } from "./routes/messages.js";

assertProductionSecret();

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "nexus-mail-backend" });
});

app.use("/api/accounts", accountsRouter);
// Message routes are nested under an account id: /api/accounts/:id/messages...
app.use("/api/accounts", messagesRouter);

app.listen(config.port, () => {
  console.log(`Nexus Mail backend listening on :${config.port}`);
});
