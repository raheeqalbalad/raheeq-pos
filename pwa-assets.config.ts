import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    // maskable بقياسين (192 و512) عشان تثبيت أندرويد (WebAPK)
    maskable: { ...minimal2023Preset.maskable, sizes: [192, 512], resizeOptions: { background: '#233D34' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#233D34' } },
  },
  images: ['public/icon.svg'],
})
