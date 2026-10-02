import "dotenv/config";
import http from "http";
import { fileURLToPath } from "url";
import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import requireEnv from "./modules/requireEnv.js";
import "./loaders/postgresLoader.js";
import "./loaders/redisLoader.js";
import { loadRoutes } from "./loaders/routeLoader.js";
import { loadSockets } from "./loaders/socketLoader.js";
import { startWorkers } from "./mq/workers.js";

export const app = express();

export const server = http.createServer(app);

// How many proxy hops (LB / CDN) sit in front of us, or a CIDR to trust. This
// makes req.ip the real client address for rate limiting. A numeric string is
// the hop count; anything else is passed through (e.g. a CIDR). Never "true".
const RATE_LIMIT_TRUST_PROXY = requireEnv("RATE_LIMIT_TRUST_PROXY");
app.set(
  "trust proxy",
  /^\d+$/.test(RATE_LIMIT_TRUST_PROXY) ? Number(RATE_LIMIT_TRUST_PROXY) : RATE_LIMIT_TRUST_PROXY,
);

const COOKIE_SECRET = requireEnv("COOKIE_SECRET");

const port = process.env.PORT ?? 3001;
const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(",");

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser(COOKIE_SECRET));

app.get("/", (_req, res) => {
  const body = { status: "ok", timestamp: new Date().toISOString() };
  res.json(body);
});

export const appReady = (async () => {
  await loadRoutes(app);
  await loadSockets(server, allowedOrigins);
  await startWorkers();
})();

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  appReady.then(() => {
    server.listen(port, () => {
      console.log(`Backend listening on http://localhost:${port}`);
    });
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
