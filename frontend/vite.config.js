import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createApiHandler } from '../server/handlers.js'
import { nodeHandler } from '../server/node.js'

export default defineConfig(({ mode }) => ({
  plugins: [vue(), {
    name: 'researcher-account-api',
    configureServer(server) {
      // Only server configuration reads these values; Vite never exposes them to the client.
      const root = fileURLToPath(new URL('../', import.meta.url))
      const handler = nodeHandler(createApiHandler({ env: { ...process.env, ...loadEnv(mode, root, '') } }))
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/api/')) return handler(req, res)
        next()
      })
    },
  }],
}))
