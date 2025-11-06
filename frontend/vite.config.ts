import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'vite.svg'],
      manifest: {
        name: 'Shoehaven POS',
        short_name: 'Shoehaven POS',
        description: 'Modern point-of-sale and inventory suite for Shoehaven retailers.',
        theme_color: '#8a1c24',
        background_color: '#fff7ed',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        icons: [
          {
            src: '/vite.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/vite.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,txt,webmanifest}'],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    target: 'es2018',
    manifest: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    port: 4173,
  },
})
