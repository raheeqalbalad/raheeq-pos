/** دينار → fils. يقبل رقم أو نص مثل "2.50". */
export function toFils(jod: number | string): number {
  return Math.round(Number(jod) * 1000)
}

/** fils → "2.50" (رقمين بعد الفاصلة، أرقام إنجليزية). */
export function formatJod(fils: number): string {
  return (fils / 1000).toFixed(2)
}
