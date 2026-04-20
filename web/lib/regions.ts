export type StallionRegion = 'na' | 'eu' | 'fr'

// Only exceptions — all others default to 'na'.
const REGION_OVERRIDES: Record<string, StallionRegion> = {
  'Lope de Vega': 'eu',
  'Hello Youmzain': 'fr',
}

export function getStallionRegion(stallionName: string | null | undefined): StallionRegion {
  if (!stallionName) return 'na'
  return REGION_OVERRIDES[stallionName] ?? 'na'
}
