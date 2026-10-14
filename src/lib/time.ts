/** "21:34" — 24 ساعة، أرقام إنجليزية. */
export const timeLabelOf = (ts: number) =>
  new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
