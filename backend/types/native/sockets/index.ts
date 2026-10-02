import type { Server, Socket } from "socket.io";
import type { SocketAck } from "@lpl-hacks/shared/src/types/native/sockets/index.js";

type SocketEventsMap = Record<string, (...args: unknown[]) => void>;

export type SocketData = Record<string, never>;

export type AppServer = Server<SocketEventsMap, SocketEventsMap, SocketEventsMap, SocketData>;

export type AppSocket = Socket<SocketEventsMap, SocketEventsMap, SocketEventsMap, SocketData>;

export type SocketEventConfig = {
  rateLimitPoints?: number;
};

export type SocketEventHandler = (payload: unknown, ctx: { socket: AppSocket }) => Promise<SocketAck>;

export type SocketEventModule = {
  config: SocketEventConfig;
  handler: SocketEventHandler;
};
