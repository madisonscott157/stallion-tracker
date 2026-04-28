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

// ISO 4217 → display symbol. Fallback to the ISO code itself (e.g. "QAR")
// when no symbol is defined.
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', GBP: '£', EUR: '€', JPY: '¥',
  AUD: 'A$', NZD: 'NZ$', CAD: 'C$', HKD: 'HK$', SGD: 'S$',
}

/**
 * Format a race purse or earnings amount with its native-currency symbol.
 * Falls back to `$` when `iso` is null — matches legacy US VS rows which
 * have no purse_currency column populated.
 */
export function formatPurse(
  amount: number | null | undefined,
  iso: string | null | undefined,
): string | null {
  if (amount == null) return null
  const code = (iso || 'USD').toUpperCase()
  const sym = CURRENCY_SYMBOLS[code]
  const formatted = amount.toLocaleString('en-US')
  return sym ? `${sym}${formatted}` : `${code} ${formatted}`
}
