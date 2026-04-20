const EUR_STALLION_NAMES = new Set<string>([
  'Lope de Vega',
  'Hello Youmzain',
])

export function formatStudFee(
  amount: number | string | null | undefined,
  stallionName: string,
): string | null {
  if (amount == null || amount === '') return null
  const n = typeof amount === 'number' ? amount : Number(String(amount).replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return null
  const symbol = EUR_STALLION_NAMES.has(stallionName) ? '€' : '$'
  return `${symbol}${n.toLocaleString('en-US')}`
}
