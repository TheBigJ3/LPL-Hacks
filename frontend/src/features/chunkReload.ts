const CHUNK_RELOAD_KEY = 'chunk-reload-at'

const CHUNK_RELOAD_COOLDOWN_MS = 10_000

function chunkReloadRecentlyTried(): boolean {
  const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY))
  return Date.now() - last < CHUNK_RELOAD_COOLDOWN_MS
}

export function chunkReloadOnStaleBuild(): void {
  window.addEventListener('vite:preloadError', (event) => {
    if (chunkReloadRecentlyTried()) return

    event.preventDefault()
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
    window.location.reload()
  })
}
