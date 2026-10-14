// رابط Supabase ومفتاحه العام بيجوا من متغيّرات البناء (مش مكتوبين بالكود).
// إذا Supabase انحجب، بنحط رابط بديل (بروكسي) بنفس المتغيّر وبنعيد النشر، بدون أي تغيير بالكود:
// المزامنة بتستعمل بس طلبات HTTP عادية (auth + rest)، ما في websocket.

export const CLOUD_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '') ?? ''
export const CLOUD_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? ''

/** النسخة مبنية ومعها إعدادات السحابة؟ (بدونها كل إشي محلي زي ما هو) */
export const cloudConfigured = !!(CLOUD_URL && CLOUD_KEY)
