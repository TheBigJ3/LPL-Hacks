import path from "path";
import type http from "http";
import { fileURLToPath, pathToFileURL } from "url";
import { Server, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { SocketAck } from "@lpl-hacks/shared/src/types/native/sockets/index.js";
import { redis_client } from "./redisLoader.js";
import { AppError } from "../modules/AppError.js";
import { ServerError } from "../modules/ServerError.js";
import { GENERAL_ERRORS } from "../types/native/errors.js";
import { moduleFiles } from "../modules/moduleFiles.js";
import { rateLimitConsume } from "../services/rateLimit/rateLimitMethods.js";
import type { AppServer, AppSocket, SocketEventConfig, SocketEventModule } from "../types/native/sockets/index.js";

const SOCKETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../sockets");

const subscriber = redis_client.duplicate();
subscriber.on("error", (error) => console.error("[socketLoader] Redis subscriber error", error));

// Every instance publishes through Redis, so an emit from any server or worker reaches the socket wherever it is connected.
export const io: AppServer = new Server({ adapter: createAdapter(redis_client, subscriber) });

export async function loadSockets(server: http.Server, allowedOrigins: string[]): Promise<void> {
  const events = await socketLoadEvents();
  const middleware = await socketLoadMiddleware();

  io.attach(server, { cors: { origin: allowedOrigins, credentials: true }, transports: ["websocket"] });

  for (const use of middleware) io.use(use);

  io.on("connection", (socket) => {
    for (const [name, module] of events) {
      socketRegister(socket, name, module.config, module.handler);
    }
  });

  for (const name of events.keys()) console.log(`Loaded socket event: ${name}`);
}

function socketRegister(socket: AppSocket, name: string, config: SocketEventConfig, handler: SocketEventModule["handler"]): void {
  (socket as unknown as Socket).on(name, async (payload: unknown, ack?: (result: SocketAck) => void) => {
    const result = await socketDispatch(socket, config, handler, payload);

    if (typeof ack === "function") ack(result);
  });
}

async function socketDispatch(
  socket: AppSocket,
  config: SocketEventConfig,
  handler: SocketEventModule["handler"],
  payload: unknown,
): Promise<SocketAck> {
  try {
    if (config.rateLimitPoints) {
      const limit = await rateLimitConsume(undefined, socket.handshake.address, config.rateLimitPoints);

      if (!limit.allowed) throw new AppError(GENERAL_ERRORS.TOO_MANY_REQUESTS);
    }

    return await handler(payload, { socket });
  } catch (error) {
    return socketErrorAck(error);
  }
}

function socketErrorAck(error: unknown): SocketAck {
  if (error instanceof AppError) return { success: false, status: error._status, message: error.message };

  if (error instanceof ServerError) {
    console.error(error._servermessage, error.stack);
    return { success: false, message: error._message ?? "INTERNAL ERROR" };
  }

  console.error(error);
  return { success: false, message: "INTERNAL ERROR" };
}

async function socketLoadEvents(): Promise<Map<string, SocketEventModule>> {
  const dir = path.join(SOCKETS_DIR, "events");

  const modules = await Promise.all(moduleFiles(dir).map(async (file) => {
    const module: { default: SocketEventModule } = await import(pathToFileURL(file).href);
    return [socketNameOf(dir, file), module.default] as const;
  }));

  return new Map(modules);
}

type SocketMiddleware = (socket: AppSocket, next: (error?: Error) => void) => void | Promise<void>;

async function socketLoadMiddleware(): Promise<SocketMiddleware[]> {
  const dir = path.join(SOCKETS_DIR, "middleware");

  return Promise.all(moduleFiles(dir).sort().map(async (file) => {
    const module: { default: SocketMiddleware } = await import(pathToFileURL(file).href);

    if (typeof module.default !== "function") {
      throw new ServerError(undefined, `[socketLoader] ${file} must default-export a middleware function`);
    }

    return module.default;
  }));
}

function socketNameOf(dir: string, file: string): string {
  return path.relative(dir, file).replace(/\.ts$/, "").split(path.sep).join(":");
}
