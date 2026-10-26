import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = `http://localhost:${env.PORT || 3000}`;

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/uploads': { target: apiTarget, changeOrigin: true },
        '/socket.io': {
          target: apiTarget,
          ws: true,
          changeOrigin: true,
        },
      },
    },
  };
});