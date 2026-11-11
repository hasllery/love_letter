import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  envDir: '../..',
  base: loadEnv(mode, '../..', '').VITE_BASE_PATH || '/',
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    allowedHosts: true,
    proxy: {
      '/socket.io': {
        target: 'http://127.0.0.1:3001',
        ws: true,
      },
      '/health': 'http://127.0.0.1:3001',
      '/api': 'http://127.0.0.1:3001',
    },
  },
}));
