import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// منشور على GitHub Pages تحت raheeqalbalad.github.io/raheeq-pos/
export default defineConfig({
  base: '/raheeq-pos/',
  // صفحتين: التطبيق، ومنيو الزباين العام (/raheeq-pos/menu/)
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        menu: 'menu/index.html',
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // التحديث ما بيقاطع الشغل: بيستنى، وUpdateManager بيثبّته على شاشة الرمز أو بكبسة «حدّث هلق»
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'رحيق البلد POS',
        short_name: 'رحيق البلد',
        description: 'نظام البيع لكافيه رحيق البلد',
        lang: 'ar',
        dir: 'rtl',
        theme_color: '#233D34',
        background_color: '#F6EBDD',
        // من الأيقونة: شاشة كاملة بدون شريط الحالة، وبالعرض
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        // بالنسبة لمكان الـ manifest، فبيمشي مع /raheeq-pos/
        start_url: './',
        scope: './',
        id: './',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // صفحة المنيو العامة مش جزء من التطبيق: ما نرجّعها لشاشة التطبيق
        navigateFallbackDenylist: [/\/menu\//],
      },
    }),
  ],
})
