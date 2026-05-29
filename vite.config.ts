import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    esbuild: {
      supported: {
        'class-static-field': true,
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      tailwindcss(),
      react(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg'],
        manifest: false, // Usamos o manifest.json em public/
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,svg,wasm}'],
          globIgnores: [],
          maximumFileSizeToCacheInBytes: 100000000, // 100MB para garantir cache do modelo Whisper
          runtimeCaching: [
            {
              // Cache de modelos da IA (Whisper) do HuggingFace - Metadados/Config
              // Importante: Manter status [0, 200] para lidar com requisições opaque da Google/HF
              urlPattern: /^https:\/\/huggingface\.co\/Xenova\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'whisper-model-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 dias
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              // Cache de modelos ONNX do Whisper - CDN LFS (onde os binários realmente são baixados)
              urlPattern: /^https:\/\/cdn-lfs\.huggingface\.co\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'whisper-model-onnx-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 dias
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
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
      chunkSizeWarningLimit: 2000,
      minify: 'terser',
      terserOptions: {
        keep_classnames: true,
        keep_fnames: true,
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
