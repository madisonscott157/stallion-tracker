// ISO 4217 → display symbol. Fallback to the ISO code itself (e.g. "QAR")
// when no symbol is defined.
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', GBP: '£', EUR: '€', JPY: '¥',
  AUD: 'A$', NZD: 'NZ$', CAD: 'C$', HKD: 'HK$', SGD: 'S$',
}

/**
 * Map a stallion's tdn_region to the ISO currency its TDN/sales/stud-fee
 * figures are denominated in. Single source of truth — used anywhere the
 * UI needs to render a stallion-scoped amount with the right symbol.
 *
 *   na → USD   eu → EUR   fr → EUR
 */
export function currencyForRegion(region: string | null | undefined): string {
  if (region === 'eu' || region === 'fr') return 'EUR'
  return 'USD'
}

export function symbolForCurrency(iso: string | null | undefined): string {
  return CURRENCY_SYMBOLS[(iso || 'USD').toUpperCase()] || (iso || '$')
}

export function formatStudFee(
  amount: number | string | null | undefined,
  stallionNameOrRegion: string,
  region?: string | null,
): string | null {
  if (amount == null || amount === '') return null
  const n = typeof amount === 'number' ? amount : Number(String(amount).replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return null
  // Backwards-compat: pre-existing callers pass (amount, stallionName)
  // without region. Fall back to a name allowlist for those two stallions
  // until every call site has been updated to pass region.
  const sym =
    region != null
      ? symbolForCurrency(currencyForRegion(region))
      : (stallionNameOrRegion === 'Lope de Vega' || stallionNameOrRegion === 'Hello Youmzain')
        ? '€'
        : '$'
  return `${sym}${n.toLocaleString('en-US')}`
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
  const sym = symbolForCurrency(iso)
  const formatted = amount.toLocaleString('en-US')
  // Three-letter ISO with no symbol (QAR, BHD, ...) — render as "QAR 50,000".
  return sym.length === 3 ? `${sym} ${formatted}` : `${sym}${formatted}`
}

/**
 * Compact money for dashboard summary tiles: "$2.8M", "€512K", "$340".
 * Uses currency symbol prefix; does not insert a thousands separator.
 */
export function formatMoneyCompact(
  amount: number | null | undefined,
  iso: string | null | undefined,
): string {
  if (amount == null) return '-'
  const sym = symbolForCurrency(iso)
  const prefix = sym.length === 3 ? `${sym} ` : sym
  if (amount >= 1_000_000) return `${prefix}${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `${prefix}${Math.round(amount / 1_000)}K`
  return `${prefix}${amount.toLocaleString('en-US')}`
}
