// Per-context filter toggles (CLM, Stakes Only) stored in localStorage.
// Keyed by stallion id on stallion pages, or "_dashboard" on the cross-stallion
// dashboard. Returns false on the server and when the stored value is missing —
// new toggles default to off.

const PREFIX = 'st-toggle:'

function key(name: 'clm' | 'stakes', context: string): string {
  return `${PREFIX}${name}:${context}`
}

export function readToggle(name: 'clm' | 'stakes', context: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(key(name, context)) === '1'
  } catch {
    return false
  }
}

export function writeToggle(name: 'clm' | 'stakes', context: string, value: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (value) {
      window.localStorage.setItem(key(name, context), '1')
    } else {
      window.localStorage.removeItem(key(name, context))
    }
  } catch {
    // localStorage can throw in private mode / when full — best effort.
  }
}
