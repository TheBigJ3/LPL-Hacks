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

// https://vite.dev/config/
export default defineConfig({
  plugins: [dotfileTypeScript, react(), tailwindcss()],

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

  server: {
    allowedHosts: [
      'thumb-cheek-another.ngrok-free.dev',
      'flavorful-waltz-magenta.ngrok-free.dev',
      'payments-serve-lang-boats.trycloudflare.com',
      'dvrucdzrftfur.cloudfront.net'
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
