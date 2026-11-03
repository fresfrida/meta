import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// BACKEND_URL is read by the dev server only (no VITE_ prefix, never sent to the browser).
const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000'
// DEV_HTTPS=0 serves plain HTTP: only for desktop testing on localhost (the phone needs HTTPS).

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '')
  const backendUrl = env.BACKEND_URL || DEFAULT_BACKEND_URL
  const https = env.DEV_HTTPS !== '0'
  // ws: true also proxies the /api/listen WebSocket (microphone audio for "Hey Eyes").
  const proxy = { '/api': { target: backendUrl, changeOrigin: true, ws: true } }

  return {
    plugins: [
      react(),
      ...(https ? [basicSsl()] : []),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['apple-touch-icon.png'],
        manifest: {
          name: 'Second Eyes',
          short_name: 'Second Eyes',
          description: 'Research prototype: spoken obstacle warnings from the phone camera.',
          theme_color: '#0a0a0b',
          background_color: '#0a0a0b',
          display: 'standalone',
          orientation: 'portrait',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
        workbox: {
          // Never serve /api from the service worker cache.
          navigateFallbackDenylist: [/^\/api\//],
          // The face-detector runtime (onnxruntime wasm, ~15 MB) is too big to precache; it loads on first Start.
          globIgnores: ['**/ort-wasm-*.wasm'],
        },
      }),
    ],
    server: { host: '0.0.0.0', port: 5173, strictPort: true, proxy },
    preview: { host: '0.0.0.0', port: 4173, strictPort: true, proxy },
  }
})
