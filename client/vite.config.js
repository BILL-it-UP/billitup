import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Invoice data must never be served stale from a cache — every /api
      // call always goes to the network. Only the static app shell (JS/CSS/
      // icons) is precached, so the app can still open (and show a login
      // screen, or already-loaded data) when the connection drops.
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: 'BillItUp — Invoicing for Corporates & Agencies',
        short_name: 'BillItUp',
        description: 'Free, open-source invoicing and billing for corporates, agencies, and consultants.',
        theme_color: '#1a7f5a',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/logo-icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/logo-icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/logo-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
