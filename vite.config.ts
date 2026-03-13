import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg'],
        manifest: false, // Usamos o manifest.json em public/
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,svg,zip,wasm}'],
          globIgnores: ['**/node_modules/**/*'],
          maximumFileSizeToCacheInBytes: 40000000, // max 40MB para permitir o cache do modelo Vosk
          // Estratégias de cache para recursos externos
          runtimeCaching: [
            {
              // Cache de imagens do i.ibb.co / i.ibb.co
              urlPattern: /^https:\/\/i\.ibb\.co\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'ibb-images-cache',
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 dias
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              // Cache do Google Fonts CSS
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-stylesheets',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 ano
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              // Cache dos arquivos de fonte do Google Fonts
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 ano
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              // Cache do Tailwind CDN
              urlPattern: /^https:\/\/cdn\.tailwindcss\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'tailwind-cdn-cache',
                expiration: {
                  maxEntries: 5,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 dias
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            }
          ],
        },
      }),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 2000
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
