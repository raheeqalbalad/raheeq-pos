import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// منشور على GitHub Pages تحت raheeqalbalad.github.io/raheeq-pos/
// رقم النسخة = وقت البناء بتوقيت عمّان (بيبيّن على شاشة الرمز والإعدادات)
const version = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Amman', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default defineConfig({
  base: '/raheeq-pos/',
  define: { __APP_VERSION__: JSON.stringify(version) },
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
    // صفحة المنيو العامة مش التطبيق: ما بتربط الـ manifest (عشان الزبون ما ينعرض عليه يثبّت نظام البيع)
    {
      name: 'menu-without-manifest',
      enforce: 'post',
      generateBundle(_, bundle) {
        const page = bundle['menu/index.html']
        if (page?.type === 'asset' && typeof page.source === 'string')
          page.source = page.source.replace(/\s*<link rel="manifest"[^>]*>/, '')
      },
    },
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
        // من الأيقونة: تطبيق لحاله مع شريط أندرويد فوق (البطارية والساعة)، وبالعرض.
        // (الشاشة الكاملة كانت تطلّع شاشة بيضا بعد قفل التابلت وهو مثبّت)
        display: 'standalone',
        orientation: 'landscape',
        // مسارات كاملة وصريحة (نفس هوية التطبيق المثبّت قبل: https://raheeqalbalad.github.io/raheeq-pos/)
        id: '/raheeq-pos/',
        start_url: '/raheeq-pos/',
        scope: '/raheeq-pos/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png', purpose: 'any' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
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
