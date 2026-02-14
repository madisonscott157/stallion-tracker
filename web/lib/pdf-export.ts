/**
 * PDF Export — builds clean HTML from data (no DOM cloning).
 * html2canvas can't reliably render flex layouts, so we build
 * simple table-based HTML that renders pixel-perfect.
 */

import type { Result, Entry } from './supabase'
import { formatDate, formatDistance, formatOrdinal, formatTrack, cleanRaceName } from './utils'

export type ExportType = 'all' | 'entries' | 'results' | 'stakes'

export interface ExportOptions {
  type: ExportType
  dateRange?: {
    start: string | null
    end: string | null
  }
  silksUrl?: string | null
}

export interface OrgWithSilks {
  name: string
  silks_url: string | null
}

export interface ExportData {
  stallionName: string
  results: Result[]
  entries: Entry[]
  filename?: string
  options?: ExportOptions
  orgsWithSilks?: OrgWithSilks[]
  isAdmin?: boolean
  userOrgName?: string
  userOrgSilksUrl?: string | null
}

function formatHorseDesc(sex: string | null, yob: number | null): string {
  const age = yob ? new Date().getFullYear() - yob : null
  return [sex?.toLowerCase(), age].filter(Boolean).join(', ')
}

function badge(text: string, color: string): string {
  return `<span style="color:${color};font-size:12px;font-weight:700;margin-right:4px;">${text}</span>`
}

function pipe(): string {
  return `<span style="color:#cbd5e1;margin:0 4px;">|</span>`
}

function getSilksForOwner(
  owner: string | null | undefined,
  orgsWithSilks: OrgWithSilks[],
  isAdmin?: boolean,
  userOrgName?: string,
  userOrgSilksUrl?: string | null
): string[] {
  if (!owner) return []

  // For admins: return ALL matching org silks
  if (isAdmin && orgsWithSilks.length > 0) {
    const matchingSilks: string[] = []
    for (const org of orgsWithSilks) {
      if (org.name && org.silks_url && owner.includes(org.name)) {
        matchingSilks.push(org.silks_url)
      }
    }
    return matchingSilks
  }

  // For regular users: only return their org's silks if they're one of the owners
  if (userOrgName && userOrgSilksUrl && owner.includes(userOrgName)) {
    return [userOrgSilksUrl]
  }

  return []
}

function silksImg(silksUrl: string): string {
  return `<img src="${silksUrl}" style="height:14px;width:auto;object-fit:contain;margin-left:4px;display:inline-block;vertical-align:baseline;position:relative;top:9px;" crossorigin="anonymous" />`
}

function silksImgs(silksUrls: string[]): string {
  return silksUrls.map(url => silksImg(url)).join('')
}

interface BuildRowOptions {
  orgsWithSilks?: OrgWithSilks[]
  isAdmin?: boolean
  userOrgName?: string
  userOrgSilksUrl?: string | null
}

function buildResultRow(r: Result, options: BuildRowOptions = {}): string {
  const { orgsWithSilks = [], isAdmin, userOrgName, userOrgSilksUrl } = options
  const isWin = r.finish_position === 1
  const is2nd = r.finish_position === 2
  const isG1 = r.stakes_grade === 'G1'
  const isG2 = r.stakes_grade === 'G2'
  const isStakes = r.is_stakes

  // Border color
  let borderColor = 'transparent'
  if (isWin || isG1) borderColor = '#b8860b'
  else if (is2nd || isG2) borderColor = '#94a3b8'
  else if (r.stakes_grade) borderColor = '#b45309'
  else if (isStakes) borderColor = '#0f172a'

  // Position badge
  let pos = ''
  if (isWin) pos = badge('WIN', '#b8860b')
  else if (is2nd) pos = badge('2nd', '#94a3b8')
  else pos = `<span style="color:#64748b;font-size:13px;">${formatOrdinal(r.finish_position)}</span> `

  const nameText = r.horse_name || 'Unknown'
  const name = r.horse_profile_url
    ? `<a href="${r.horse_profile_url}" style="color:#0f172a;text-decoration:none;">${nameText}</a>`
    : nameText
  const desc = formatHorseDesc(r.horse_sex || null, r.horse_yob || null)
  const ownerSilks = getSilksForOwner(r.owner, orgsWithSilks, isAdmin, userOrgName, userOrgSilksUrl)
  const raceInfo = [r.race_type, r.purse ? `$${r.purse.toLocaleString()}` : null, formatDistance(r.distance || null) || null].filter(Boolean).join(' | ')

  const track = formatTrack(r.track)
  const dateStr = formatDate(r.race_date)

  // Right side items (without date)
  const rightParts = [`${track} R${r.race_number}`]
  if (r.chart_url) rightParts.push(`<a href="${r.chart_url}" style="color:#0f172a;">Chart</a>`)
  if (r.replay_url) rightParts.push(`<a href="${r.replay_url}" style="color:#0f172a;">Replay</a>`)

  // Stakes row
  let stakesRow = ''
  const stakesName = isStakes && r.race_name ? cleanRaceName(r.race_name.replace(/^STAKES\s*/i, '').trim()) : null
  if (r.stakes_grade || stakesName) {
    let gradeBadge = ''
    if (r.stakes_grade) {
      const gc = isG1 ? '#b8860b' : isG2 ? '#94a3b8' : '#b45309'
      gradeBadge = badge(r.stakes_grade, gc)
    }
    const nameColor = isG1 ? '#b8860b' : isG2 ? '#94a3b8' : r.stakes_grade ? '#b45309' : '#0f172a'
    const nameWeight = isWin && isStakes ? 'font-weight:700;' : 'font-weight:500;'
    const sn = stakesName ? `<span style="color:${nameColor};${nameWeight}">${stakesName}</span>` : ''
    const margin = isWin && r.win_margin ? `${pipe()}<span style="color:#15803d;font-weight:500;">Won by ${r.win_margin}</span>` : ''
    stakesRow = `<div style="margin-top:2px;font-size:13px;margin-left:52px;">${gradeBadge}${sn}${margin}</div>`
  }

  // Win margin for non-stakes
  let winRow = ''
  if (isWin && r.win_margin && !isStakes) {
    winRow = `<div style="margin-top:2px;font-size:13px;color:#15803d;font-weight:500;margin-left:52px;">Won by ${r.win_margin}</div>`
  }

  const raceInfoStyle = isWin && isStakes ? 'font-weight:600;color:#334155;' : 'color:#64748b;'

  return `
    <div style="border:1px solid #e2e8f0;border-left:4px solid ${borderColor};border-radius:6px;padding:6px 10px;margin-bottom:4px;font-size:13px;line-height:1.6;">
      <table style="width:100%;border-collapse:collapse;"><tr>
        <td style="vertical-align:baseline;width:48px;padding-right:8px;white-space:nowrap;">
          <span style="font-size:12px;font-weight:600;color:#64748b;">${dateStr}</span>
        </td>
        <td style="vertical-align:baseline;">
          ${pos}<span style="font-size:14px;font-weight:600;color:#0f172a;">${name}</span>
          ${desc ? `<span style="color:#94a3b8;margin-left:4px;">${desc}</span>` : ''}${ownerSilks.length > 0 ? silksImgs(ownerSilks) : ''}
          ${raceInfo ? `${pipe()}<span style="${raceInfoStyle}font-size:13px;">${raceInfo}</span>` : ''}
        </td>
        <td style="vertical-align:baseline;text-align:right;white-space:nowrap;color:#475569;font-size:13px;">
          ${rightParts.join(`${pipe()}`)}
        </td>
      </tr></table>
      ${stakesRow}${winRow}
    </div>`
}

function buildEntryRow(e: Entry, options: BuildRowOptions = {}): string {
  if (e.scratched) return '' // skip scratched

  const { orgsWithSilks = [], isAdmin, userOrgName, userOrgSilksUrl } = options

  let borderColor = 'transparent'
  if (e.stakes_grade) borderColor = '#b45309'
  else if (e.is_stakes) borderColor = '#0f172a'

  const nameText = e.horse_name || `${e.horse_yob || ''} ${e.horse_dam || 'Unknown'}`.trim()
  const name = e.horse_profile_url
    ? `<a href="${e.horse_profile_url}" style="color:#0f172a;text-decoration:none;">${nameText}</a>`
    : nameText
  const desc = formatHorseDesc(e.horse_sex || null, e.horse_yob || null)
  const ownerSilks = getSilksForOwner(e.owner, orgsWithSilks, isAdmin, userOrgName, userOrgSilksUrl)
  const track = formatTrack(e.track)
  const dateStr = formatDate(e.race_date)
  const distDisplay = formatDistance(e.distance || null)

  const raceDetails = [e.race_type, e.purse ? `$${e.purse.toLocaleString()}` : null, distDisplay || null, e.surface].filter(Boolean).join(' | ')

  // Right side items (without date)
  const rightParts = [`${track} R${e.race_number}`]
  if (e.post_time) rightParts.push(`${e.post_time} ${e.timezone}`)
  if (e.entries_url) rightParts.push(`<a href="${e.entries_url}" style="color:#0f172a;">Entries</a>`)

  const stakesName = e.is_stakes && e.race_name ? cleanRaceName(e.race_name.replace(/^STAKES\s*/i, '').trim()) : null
  let stakesRow = ''
  if (e.stakes_grade || stakesName) {
    let gradeBadge = ''
    if (e.stakes_grade) gradeBadge = badge(e.stakes_grade, '#b45309')
    const sn = stakesName ? `<span style="font-weight:500;">${stakesName}</span>` : ''
    stakesRow = `<div style="margin-top:1px;font-size:13px;margin-left:52px;">${gradeBadge}${sn}${raceDetails ? `${pipe()}${raceDetails}` : ''}</div>`
  }

  const row2 = !stakesRow && raceDetails ? `<div style="margin-top:1px;font-size:13px;color:#64748b;margin-left:52px;">${raceDetails}</div>` : ''

  // Trainer/Jockey row
  const connections: string[] = []
  if (e.trainer) connections.push(`T: ${e.trainer}`)
  if (e.jockey) connections.push(`J: ${e.jockey}`)
  const connectionsRow = connections.length > 0
    ? `<div style="margin-top:1px;font-size:12px;color:#64748b;margin-left:52px;">${connections.join(`${pipe()}`)}</div>`
    : ''

  return `
    <div style="border:1px solid #e2e8f0;border-left:4px solid ${borderColor};border-radius:6px;padding:6px 10px;margin-bottom:4px;font-size:13px;line-height:1.6;">
      <table style="width:100%;border-collapse:collapse;"><tr>
        <td style="vertical-align:baseline;width:48px;padding-right:8px;white-space:nowrap;">
          <span style="font-size:12px;font-weight:600;color:#64748b;">${dateStr}</span>
        </td>
        <td style="vertical-align:baseline;">
          <span style="font-size:14px;font-weight:600;color:#0f172a;">${name}</span>
          ${desc ? `<span style="color:#94a3b8;margin-left:4px;">${desc}</span>` : ''}${ownerSilks.length > 0 ? silksImgs(ownerSilks) : ''}
        </td>
        <td style="vertical-align:baseline;text-align:right;white-space:nowrap;color:#475569;font-size:13px;">
          ${rightParts.join(`${pipe()}`)}
        </td>
      </tr></table>
      ${stakesRow}${row2}${connectionsRow}
    </div>`
}

function sectionHeader(text: string): string {
  return `<div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin:12px 0 4px 0;">${text}</div>`
}

function filterByDateRange<T extends { race_date?: string; workout_date?: string }>(
  items: T[],
  dateRange?: { start: string | null; end: string | null }
): T[] {
  if (!dateRange || (!dateRange.start && !dateRange.end)) return items

  const startDate = dateRange.start ? new Date(dateRange.start + 'T00:00:00') : null
  const endDate = dateRange.end ? new Date(dateRange.end + 'T23:59:59') : null

  return items.filter(item => {
    const itemDateStr = item.race_date || item.workout_date
    if (!itemDateStr) return true

    const itemDate = new Date(itemDateStr)
    if (isNaN(itemDate.getTime())) return true

    if (startDate && itemDate < startDate) return false
    if (endDate && itemDate > endDate) return false
    return true
  })
}

export async function exportDashboardToPDF(data: ExportData): Promise<void> {
  const html2canvas = (await import('html2canvas')).default
  const { jsPDF } = await import('jspdf')

  const options = data.options || { type: 'all' }
  const exportType = options.type

  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  // Filter entries and results based on export type and date range
  let filteredEntries = data.entries.filter(e => !e.scratched)
  let filteredResults = [...data.results]

  // Apply date range filter
  filteredEntries = filterByDateRange(filteredEntries, options.dateRange)
  filteredResults = filterByDateRange(filteredResults, options.dateRange)

  // Apply export type filter
  if (exportType === 'entries') {
    filteredResults = []
  } else if (exportType === 'results') {
    filteredEntries = []
  } else if (exportType === 'stakes') {
    filteredEntries = filteredEntries.filter(e => e.is_stakes === true || e.stakes_grade)
    filteredResults = filteredResults.filter(r => r.is_stakes === true || r.stakes_grade)
  }

  // Build subtitle based on export type
  let subtitle = date
  if (exportType === 'entries') subtitle += ' | Entries Only'
  else if (exportType === 'results') subtitle += ' | Results Only'
  else if (exportType === 'stakes') subtitle += ' | Stakes Only'

  if (options.dateRange?.start && options.dateRange?.end) {
    const start = formatDate(options.dateRange.start)
    const end = formatDate(options.dateRange.end)
    subtitle += ` | ${start} - ${end}`
  } else if (options.dateRange?.start) {
    subtitle += ` | From ${formatDate(options.dateRange.start)}`
  } else if (options.dateRange?.end) {
    subtitle += ` | Through ${formatDate(options.dateRange.end)}`
  }

  let html = ''

  // Header with optional silks
  const silksHtml = options.silksUrl
    ? `<td style="vertical-align:top;text-align:right;width:60px;"><img src="${options.silksUrl}" style="height:50px;width:auto;object-fit:contain;" crossorigin="anonymous" /></td>`
    : ''

  html += `
    <div style="border-bottom:2px solid #0f172a;padding-bottom:8px;margin-bottom:14px;">
      <table style="width:100%;border-collapse:collapse;"><tr>
        <td style="vertical-align:top;">
          <div style="font-size:20px;font-weight:600;color:#0f172a;line-height:1.3;">${data.stallionName.toUpperCase()} PROGENY REPORT</div>
          <div style="font-size:11px;color:#64748b;margin-top:3px;">${subtitle}</div>
        </td>
        ${silksHtml}
      </tr></table>
    </div>`

  // Build options for row rendering
  const rowOptions: BuildRowOptions = {
    orgsWithSilks: data.orgsWithSilks || [],
    isAdmin: data.isAdmin,
    userOrgName: data.userOrgName,
    userOrgSilksUrl: data.userOrgSilksUrl,
  }

  // Entries
  if (filteredEntries.length > 0) {
    html += sectionHeader('Upcoming Entries')
    filteredEntries.forEach(e => { html += buildEntryRow(e, rowOptions) })
  }

  // Results
  if (filteredResults.length > 0) {
    html += sectionHeader('Recent Results')
    filteredResults.forEach(r => { html += buildResultRow(r, rowOptions) })
  }

  const wrapper = document.createElement('div')
  wrapper.style.cssText = `
    position:absolute;left:-9999px;top:0;width:800px;background:#fff;
    padding:20px 28px 20px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;
  `
  wrapper.innerHTML = html
  document.body.appendChild(wrapper)

  try {
    // Collect link positions
    interface LinkInfo { url: string; x: number; y: number; width: number; height: number }
    const links: LinkInfo[] = []
    const wrapperRect = wrapper.getBoundingClientRect()
    wrapper.querySelectorAll('a[href]').forEach(anchor => {
      const a = anchor as HTMLAnchorElement
      const href = a.getAttribute('href')
      if (href?.startsWith('http')) {
        const rect = a.getBoundingClientRect()
        links.push({ url: href, x: rect.left - wrapperRect.left, y: rect.top - wrapperRect.top, width: rect.width, height: rect.height })
      }
    })

    const canvas = await html2canvas(wrapper, {
      scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', width: 800, windowWidth: 800,
    })

    const pageWidth = 210
    const pageHeight = 297
    const leftMargin = 4 // 4mm left margin to prevent border clipping
    const usableWidth = pageWidth - leftMargin - 3 // 3mm right margin too
    const imgHeight = (canvas.height * usableWidth) / canvas.width
    const scaleFactor = usableWidth / 800

    const pdf = new jsPDF('p', 'mm', 'a4')
    const imgData = canvas.toDataURL('image/png')

    let heightLeft = imgHeight
    let position = 0
    pdf.addImage(imgData, 'PNG', leftMargin, position, usableWidth, imgHeight)
    heightLeft -= pageHeight

    while (heightLeft > 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', leftMargin, position, usableWidth, imgHeight)
      heightLeft -= pageHeight
    }

    const totalPages = pdf.getNumberOfPages()
    links.forEach(link => {
      const linkYInPdf = link.y * scaleFactor
      const linkPage = Math.floor(linkYInPdf / pageHeight) + 1
      const linkYOnPage = linkYInPdf - (linkPage - 1) * pageHeight
      if (linkPage >= 1 && linkPage <= totalPages) {
        pdf.setPage(linkPage)
        pdf.link(leftMargin + link.x * scaleFactor, linkYOnPage, link.width * scaleFactor, link.height * scaleFactor, { url: link.url })
      }
    })

    const safeStallionName = data.stallionName.toLowerCase().replace(/\s+/g, '-')
    const dateStr = new Date().toISOString().split('T')[0]
    pdf.save(data.filename || `${safeStallionName}-report-${dateStr}.pdf`)
  } finally {
    document.body.removeChild(wrapper)
  }
}
