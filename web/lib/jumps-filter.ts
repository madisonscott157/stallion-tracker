// Shared filter to exclude jumps/hurdle/steeplechase races from results and entries.
// Jumps-only tracks are blocklisted. For mixed tracks, we filter on the distance
// string which the chart parser annotates with "On The Hurdle" / "Steeplechase".

export const JUMPS_TRACKS = ['GREAT MEADOW']

export function applyExcludeJumps<T extends {
  not: (column: string, op: string, value: string) => T
  or: (filters: string) => T
}>(query: T): T {
  for (const track of JUMPS_TRACKS) {
    query = query.not('track', 'eq', track)
  }
  query = query.or('distance.is.null,distance.not.ilike.*hurdle*')
  query = query.or('distance.is.null,distance.not.ilike.*steeplechase*')
  return query
}
