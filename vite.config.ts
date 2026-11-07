import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  // No GitHub Pages o app fica em /materia-seca-FVP/ (definido pelo workflow); em dev, na raiz.
  base,
  // Porta fixa e exclusiva (a 5173 é usada por outro sistema).
  // HTTPS + host: o GPS do celular só funciona em página segura; acesse pelo IP da rede (https://10.0.3.117:5180).
  server: { port: 5180, strictPort: true, host: true },
  preview: { port: 5181, strictPort: true, host: true },
  plugins: [
    basicSsl(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'talhoes-fazenda.kml'],
      workbox: {
        // Guarda as imagens de satélite já vistas para uso offline no campo
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/server\.arcgisonline\.com\/.*\/tile\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'satelite',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        id: base,
        start_url: base,
        scope: base,
        name: 'Silagem MS — Amostragem de Capim',
        short_name: 'Silagem MS',
        description: 'Coleta de amostras de capim, teor de matéria seca e estimativa de produção por talhão',
        lang: 'pt-BR',
        theme_color: '#2f6b3a',
        background_color: '#f4f7f2',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
});
