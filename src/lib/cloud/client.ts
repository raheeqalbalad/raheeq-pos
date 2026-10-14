import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CLOUD_KEY, CLOUD_URL, cloudConfigured } from './config'

let client: SupabaseClient | null = null

/** عميل Supabase (واحد للتطبيق كله). بيتعمل بس إذا السحابة مظبوطة. */
export function cloud(): SupabaseClient {
  // للتجربة وقت التطوير بس: سحابة وهمية بالذاكرة (ما بتدخل بنسخة النشر)
  if (import.meta.env.DEV) {
    const fake = (window as { __fakeCloud?: SupabaseClient }).__fakeCloud
    if (fake) return fake
  }
  if (!cloudConfigured) throw new Error('السحابة مش مظبوطة بهالنسخة')
  client ??= createClient(CLOUD_URL, CLOUD_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'raheeq-cloud-auth', detectSessionInUrl: false },
  })
  return client
}

export type CloudRole = 'cafe' | 'owner' | 'partner'

/** دور الحساب الداخل (من جدول members). */
export async function myRole(): Promise<CloudRole | null> {
  const { data: auth } = await cloud().auth.getUser()
  if (!auth.user) return null
  const { data, error } = await cloud().from('members').select('role').eq('user_id', auth.user.id).maybeSingle()
  if (error) throw new Error(cloudError(error.message))
  return (data?.role as CloudRole | undefined) ?? null
}

/** رسالة خطأ مفهومة بالعربي */
export function cloudError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'الإيميل أو كلمة السر غلط'
  if (/email not confirmed/i.test(message)) return 'الإيميل مش مأكّد بـ Supabase'
  if (/failed to fetch|network|load failed|fetch/i.test(message)) return 'ما في اتصال بالسحابة (النت أو الرابط محجوب)'
  if (/could not find the table|schema cache/i.test(message)) return 'جداول السحابة لسا مش معمولة (لازم ينلصق ملف الـ SQL بـ Supabase)'
  if (/row-level security|permission denied/i.test(message)) return 'هاد الحساب ما إله صلاحية على هالإشي'
  if (/jwt|not signed in|auth session missing/i.test(message)) return 'انتهى الدخول، اطلع وادخل من جديد'
  return message
}
