import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: Vite (5173) проксіює REST і WebSocket на Node-сервер (3000),
// тож для браузера все виглядає як один origin — без CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
