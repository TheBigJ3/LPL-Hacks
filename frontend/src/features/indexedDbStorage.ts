import { del, get, keys, set } from 'idb-keyval'
import type { PersistStorage, StorageValue } from 'zustand/middleware'

type IndexedDbFileRef = { indexedDbFile: string }

const INDEXED_DB_FILE_IDS = new WeakMap<Blob, string>()

function indexedDbFilePrefix(name: string): string {
  return `${name}:file:`
}

function indexedDbFileId(file: Blob): string {
  const existing = INDEXED_DB_FILE_IDS.get(file)
  if (existing) return existing
  const id = crypto.randomUUID()
  INDEXED_DB_FILE_IDS.set(file, id)
  return id
}

function indexedDbIsFileRef(value: unknown): value is IndexedDbFileRef {
  return typeof value === 'object' && value !== null && 'indexedDbFile' in value
}

function indexedDbIsPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

function indexedDbDehydrate(value: unknown, files: Map<string, Blob>): unknown {
  if (value instanceof Blob) {
    const id = indexedDbFileId(value)
    files.set(id, value)
    return { indexedDbFile: id }
  }
  if (Array.isArray(value)) return value.map((item) => indexedDbDehydrate(item, files))
  if (indexedDbIsPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, indexedDbDehydrate(item, files)]))
  }
  return value
}

async function indexedDbHydrate(value: unknown, prefix: string, ids: Set<string>): Promise<unknown> {
  if (indexedDbIsFileRef(value)) {
    const file = await get<Blob>(prefix + value.indexedDbFile)
    if (!file) return null
    INDEXED_DB_FILE_IDS.set(file, value.indexedDbFile)
    ids.add(value.indexedDbFile)
    return file
  }
  if (Array.isArray(value)) {
    const items = await Promise.all(value.map((item) => indexedDbHydrate(item, prefix, ids)))
    return items.filter((item, index) => item !== null || !indexedDbIsFileRef(value[index]))
  }
  if (indexedDbIsPlainObject(value)) {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, item]) => [key, await indexedDbHydrate(item, prefix, ids)] as const),
    )
    return Object.fromEntries(entries)
  }
  return value
}

async function indexedDbDeleteFiles(name: string, keep: Set<string>): Promise<void> {
  const prefix = indexedDbFilePrefix(name)
  const stale = (await keys()).filter(
    (key) => typeof key === 'string' && key.startsWith(prefix) && !keep.has(key.slice(prefix.length)),
  )
  await Promise.all(stale.map((key) => del(key)))
}

export function indexedDbStorageCreate<S>(): PersistStorage<S> {
  const writtenFiles = new Set<string>()
  let queued: { name: string; value: StorageValue<S> } | null = null
  let writing: Promise<void> = Promise.resolve()

  const write = async (name: string, value: StorageValue<S>) => {
    const prefix = indexedDbFilePrefix(name)
    const files = new Map<string, Blob>()
    const record = indexedDbDehydrate(value, files)

    for (const [id, file] of files) {
      if (writtenFiles.has(id)) continue
      await set(prefix + id, file)
      writtenFiles.add(id)
    }
    await set(name, record)

    for (const id of [...writtenFiles]) {
      if (files.has(id)) continue
      await del(prefix + id)
      writtenFiles.delete(id)
    }
  }

  const enqueue = (task: () => Promise<void>) => {
    writing = writing.then(task).catch(() => undefined)
    return writing
  }

  return {
    getItem: async (name) => {
      try {
        const record = await get(name)
        const ids = new Set<string>()
        const value = record ? await indexedDbHydrate(record, indexedDbFilePrefix(name), ids) : null
        ids.forEach((id) => writtenFiles.add(id))
        void enqueue(() => indexedDbDeleteFiles(name, writtenFiles))
        return value as StorageValue<S> | null
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      const scheduled = queued !== null
      queued = { name, value }
      if (scheduled) return writing
      return enqueue(async () => {
        const next = queued
        queued = null
        if (next) await write(next.name, next.value)
      })
    },
    removeItem: (name) => {
      queued = null
      return enqueue(async () => {
        await del(name)
        await indexedDbDeleteFiles(name, new Set())
        writtenFiles.clear()
      })
    },
  }
}
