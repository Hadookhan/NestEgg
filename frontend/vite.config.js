import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { hostInfoPlugin } from './scripts/hostinfo.mjs';

// The frontend proxies /api to the FastAPI backend, so the phone only needs
// to reach this dev server (on your LAN IP) and never the backend directly.
export default defineConfig({
  plugins: [react(), hostInfoPlugin()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: { '/api': 'http://localhost:8000' },
  },
});
