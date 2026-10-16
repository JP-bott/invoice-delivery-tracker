import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In `npm run dev`, serve /api from the same function Vercel runs, so only `vite` is needed.
const devApi = (mode) => ({
  name: 'dev-api',
  apply: 'serve',
  async configureServer(server) {
    const env = loadEnv(mode, path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), '');
    for (const k of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN']) if (env[k] && !process.env[k]) process.env[k] = env[k];
    const { nodeHandler } = await import('../server/node-adapter.js');
    server.middlewares.use((req, res, next) => (req.url.startsWith('/api') ? nodeHandler(req, res) : next()));
  },
});

export default defineConfig(({ mode }) => ({ plugins: [react(), tailwindcss(), devApi(mode)] }));
