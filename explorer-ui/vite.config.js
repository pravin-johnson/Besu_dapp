import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Custom plugin to serve clean URLs without .html in dev mode
const cleanUrlsPlugin = () => ({
  name: 'clean-urls',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = req.url.split('?')[0];
      const searchParams = req.url.split('?')[1] || '';
      const suffix = searchParams ? `?${searchParams}` : '';

      if (url === '/admin') {
        req.url = `/admin.html${suffix}`;
      } else if (url === '/ico') {
        req.url = `/ico.html${suffix}`;
      } else if (url === '/faucet') {
        req.url = `/faucet.html${suffix}`;
      }
      next();
    });
  }
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cleanUrlsPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        faucet: resolve(__dirname, 'faucet.html'),
        ico: resolve(__dirname, 'ico.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
})
