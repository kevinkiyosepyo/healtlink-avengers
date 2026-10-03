import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { createApiHandler } from '../server/handlers.js'
import { nodeHandler } from '../server/node.js'

export default defineConfig(({ mode }) => ({
  plugins: [vue(), tailwindcss(), {
    name: 'researcher-account-api',
    configureServer(server) {
      const root = fileURLToPath(new URL('../', import.meta.url))
      const handler = nodeHandler(createApiHandler({ env: { ...process.env, ...loadEnv(mode, root, '') } }))
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] === '/api/health') {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
          return
        }
        if (req.url?.startsWith('/api/')) return handler(req, res)
        next()
      })
    },
  }],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    rollupOptions: {
      input: {
        workspace: fileURLToPath(new URL('./index.html', import.meta.url)),
        researcher: fileURLToPath(new URL('./researcher.html', import.meta.url)),
      },
    },
  },
}))
