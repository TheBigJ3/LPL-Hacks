import type { AnySocketEvent, SocketPayloadOf } from "@lpl-hacks/shared/src/types/native/sockets/defineSocketEvent.js";
import { io } from "../../loaders/socketLoader.js";

export function realtimeNotifyRooms<E extends AnySocketEvent>(rooms: string[], event: E, payload: SocketPayloadOf<E>): void {
  const unique = [...new Set(rooms)];

  if (unique.length === 0) return;

  try {
    io.to(unique).emit(event.name, payload);
  } catch (error) {
    console.error(`[realtimeMethods] Could not send ${event.name}`, error);
  }
}

export function realtimeNotifyAll<E extends AnySocketEvent>(event: E, payload: SocketPayloadOf<E>): void {
  try {
    io.emit(event.name, payload);
  } catch (error) {
    console.error(`[realtimeMethods] Could not send ${event.name}`, error);
  }
}
