import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import ts from 'typescript'

const srcPath = (folder: string) => fileURLToPath(new URL(`./src/${folder}`, import.meta.url))

// Vite sees a literal `.ts` basename as extensionless, so compile page logic
// dotfiles before the normal transform pipeline.
const dotfileTypeScript = {
  name: 'dotfile-typescript',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    const filePath = id.split('?', 1)[0]
    if (!filePath.endsWith('/.ts')) return null

    const result = ts.transpileModule(code, {
      fileName: filePath,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ESNext,
      },
    })

    return { code: result.outputText, map: null }
  },
}

const BACKEND_TARGET = 'http://localhost:3001'
const APPLE_CALLBACK_PATH = '/v1/authentication/signup/apple/callback'

// Apple's Sign in with Apple redirect uses response_mode=form_post: it POSTs the
// result to the OAuth redirect URI (the SPA /auth-redirect route). The dev
// server would 404 that POST (SPA fallback only serves GET), so intercept it
// and forward the raw body to the backend callback, then relay the backend's
// 302 (back to /auth-redirect on a GET) to the browser. Keeps the registered
// redirect URI on /auth-redirect rather than pointing Apple at the backend.
const appleFormPostRedirect = {
  name: 'apple-form-post-redirect',
  configureServer(server: import('vite').ViteDevServer) {
    server.middlewares.use('/auth-redirect', (req, res, next) => {
      if (req.method !== 'POST') return next()

      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(chunk as Buffer))
      req.on('end', async () => {
        try {
          const body = Buffer.concat(chunks).toString('utf8')
          const upstream = await fetch(BACKEND_TARGET + APPLE_CALLBACK_PATH, {
            method: 'POST',
            headers: {
              'content-type':
                req.headers['content-type'] ?? 'application/x-www-form-urlencoded',
              // Preserve the public host so the callback redirects back to the
              // same origin the browser used (where the oauth sessionStorage lives).
              'x-forwarded-host': (req.headers['x-forwarded-host'] as string) ?? (req.headers.host ?? ''),
              'x-forwarded-proto': (req.headers['x-forwarded-proto'] as string) ?? 'https',
            },
            body,
            redirect: 'manual',
          })

          const location = upstream.headers.get('location')
          if (location) {
            res.statusCode = 302
            res.setHeader('location', location)
            res.end()
            return
          }
          res.statusCode = upstream.status
          res.end(await upstream.text())
        } catch (error) {
          res.statusCode = 502
          res.end('Apple callback proxy failed')
        }
      })
      req.on('error', () => {
        res.statusCode = 400
        res.end('Bad request')
      })
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [dotfileTypeScript, appleFormPostRedirect, react(), tailwindcss()],

  resolve: {
    alias: {
      '@api': srcPath('api'),
      '@assets': srcPath('assets'),
      '@components': srcPath('components'),
      '@features': srcPath('features'),
      '@hooks': srcPath('hooks'),
      '@stores': srcPath('stores'),
      '@typings': srcPath('types'),
    },
  },

  // maplibre-gl ships its own web worker that the dep optimizer can't pre-bundle.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },

  server: {
    allowedHosts: [
      'thumb-cheek-another.ngrok-free.dev',
      'flavorful-waltz-magenta.ngrok-free.dev',
      'payments-serve-lang-boats.trycloudflare.com'
    ],
    proxy: {
      '/v1': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  }
})
