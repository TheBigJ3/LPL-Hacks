import { useEffect, useRef, useSyncExternalStore } from "react"
import { io, type Socket } from "socket.io-client"
import type { AnySocketEvent, SocketPayloadOf } from "@lpl-hacks/shared/src/types/native/sockets/defineSocketEvent.js"
import type { SocketAck } from "@lpl-hacks/shared/src/types/native/sockets/index.js"
import { BASE_URL } from "@features/apiLayer"
import { queryClient } from "@features/queryClient"

export type SocketStatus = "disconnected" | "connecting" | "connected"

export type SocketListener<E extends AnySocketEvent> = (payload: SocketPayloadOf<E>) => void

export type SocketAwaitOptions = {
  timeoutMs: number
  signal?: AbortSignal
}

type StatusListener = () => void

type AnyListener = (payload: unknown) => void

type SocketWatch = {
  name: string
  payload: unknown
}

const SOCKET_ACK_TIMEOUT_MS = 5_000

class SocketLayer {
  private socket: Socket | null = null
  private status: SocketStatus = "disconnected"
  private statusListeners = new Set<StatusListener>()
  private eventListeners = new Map<string, Set<AnyListener>>()
  private watches = new Set<SocketWatch>()
  private hasConnected = false

  init(): void {
    if (this.socket) return

    // An empty base means the API is served from this origin (the dev proxy), which io() only understands as no URL at all.
    const socket = io(BASE_URL || undefined, {
      autoConnect: false,
      transports: ["websocket"],
      withCredentials: true,
    })

    socket.on("connect", () => this.handleConnect())
    socket.on("disconnect", () => this.setStatus(socket.active ? "connecting" : "disconnected"))
    socket.onAny((name: string, payload: unknown) => this.dispatch(name, payload))

    this.socket = socket
    this.setStatus("connecting")
    socket.connect()
  }

  on<E extends AnySocketEvent>(event: E, listener: SocketListener<E>): () => void {
    const listeners = this.eventListeners.get(event.name) ?? new Set<AnyListener>()
    const wrapped = listener as AnyListener

    listeners.add(wrapped)
    this.eventListeners.set(event.name, listeners)

    return () => {
      listeners.delete(wrapped)
    }
  }

  watch<E extends AnySocketEvent>(event: E, payload: SocketPayloadOf<E>): () => void {
    const watch: SocketWatch = { name: event.name, payload }

    this.watches.add(watch)
    if (this.status === "connected") void this.emit(watch)

    return () => {
      this.watches.delete(watch)
    }
  }

  getSnapshot = (): SocketStatus => this.status

  subscribe = (listener: StatusListener): (() => void) => {
    this.statusListeners.add(listener)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  private async emit({ name, payload }: SocketWatch): Promise<SocketAck | null> {
    try {
      return await this.socket!.timeout(SOCKET_ACK_TIMEOUT_MS).emitWithAck(name, payload)
    } catch {
      return null
    }
  }

  private handleConnect(): void {
    this.setStatus("connected")

    // The server forgets a socket's rooms when it drops, so every room still being watched is joined again.
    this.watches.forEach((watch) => void this.emit(watch))

    // Whatever was pushed while the socket was down is gone, so what's on screen is refetched once it's back.
    if (this.hasConnected) void queryClient.invalidateQueries()

    this.hasConnected = true
  }

  private dispatch(name: string, payload: unknown): void {
    this.eventListeners.get(name)?.forEach((listener) => listener(payload))
  }

  private setStatus(next: SocketStatus): void {
    if (this.status === next) return

    this.status = next
    this.statusListeners.forEach((listener) => listener())
  }
}

export const socketLayer = new SocketLayer()

export function socketOn<E extends AnySocketEvent>(event: E, listener: SocketListener<E>): () => void {
  return socketLayer.on(event, listener)
}

export function socketWatch<E extends AnySocketEvent>(event: E, payload: SocketPayloadOf<E>): () => void {
  return socketLayer.watch(event, payload)
}

export function socketAwait<E extends AnySocketEvent>(
  event: E,
  match: (payload: SocketPayloadOf<E>) => boolean,
  { timeoutMs, signal }: SocketAwaitOptions,
): Promise<SocketPayloadOf<E> | null> {
  return new Promise((resolve) => {
    let unsubscribe = () => {}

    const finish = (payload: SocketPayloadOf<E> | null) => {
      window.clearTimeout(timer)
      unsubscribe()
      signal?.removeEventListener("abort", abandon)
      resolve(payload)
    }

    const abandon = () => finish(null)
    const timer = window.setTimeout(abandon, timeoutMs)

    if (signal?.aborted) return abandon()

    signal?.addEventListener("abort", abandon, { once: true })
    unsubscribe = socketLayer.on(event, (payload) => {
      if (match(payload)) finish(payload)
    })
  })
}

export function useSocketStatus(): SocketStatus {
  return useSyncExternalStore(socketLayer.subscribe, socketLayer.getSnapshot)
}

export function useSocketEvent<E extends AnySocketEvent>(event: E, listener: SocketListener<E>): void {
  const latest = useRef(listener)

  useEffect(() => {
    latest.current = listener
  })

  useEffect(() => socketLayer.on(event, (payload) => latest.current(payload)), [event])
}
