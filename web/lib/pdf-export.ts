/**
 * PDF Export — builds clean HTML from data (no DOM cloning).
 * html2canvas can't reliably render flex layouts, so we build
 * simple table-based HTML that renders pixel-perfect.
 */

import type { Result, Entry } from './supabase'
import { formatDate, formatDistance, formatHorseDescription, formatOrdinal, formatTrack, cleanRaceName, shouldShowSilks } from './utils'
import { convertPostTimeToET } from './timezones'
import { formatPurse, formatMoneyCompact, currencyForRegion } from './currency'

export type ExportType = 'all' | 'entries' | 'results' | 'stakes'

export interface ExportOptions {
  type: ExportType
  silksUrl?: string | null
  orgName?: string | null
}

export interface OrgWithSilks {
  name: string
  silks_url: string | null
  owner_match_patterns?: string[] | null
}

export interface ExportData {
  stallionName: string
  results: Result[]
  entries: Entry[]
  // Overall year-to-date stats for the stallion. The summary bar at the top
  // of the PDF always shows these regardless of any filter the user picked,
  // matching the StatsBar in the live header.
  stats?: { year: number; starters: number; winners: number; earnings: number; region?: string | null } | null
  filename?: string
  options?: ExportOptions
  orgsWithSilks?: OrgWithSilks[]
  isAdmin?: boolean
  userOrgName?: string
  userOrgSilksUrl?: string | null
  userOrgPatterns?: string[] | null
}

function pipe(): string {
  return `<span style="color:#cbd5e1;margin:0 4px;">|</span>`
}

function getSilksForOwner(
  owner: string | null | undefined,
  orgsWithSilks: OrgWithSilks[],
  isAdmin?: boolean,
  userOrgName?: string,
  userOrgSilksUrl?: string | null,
  userOrgPatterns?: string[] | null
): string[] {
  const userOrg = userOrgName
    ? { name: userOrgName, silks_url: userOrgSilksUrl ?? null, owner_match_patterns: userOrgPatterns ?? null }
    : undefined
  const { silksUrls } = shouldShowSilks(userOrg, owner, orgsWithSilks, isAdmin)
  return silksUrls
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
  userOrgPatterns?: string[] | null
}

// Stakes-grade pill matching the in-app badge: gold for G1, silver for G2,
// orange (accent) for G3 / other graded. ('Listed' is filtered out by
// callers, so we only handle G1/G2/G3 here — fallback colour kept for
// safety.)
//
// Third attempt: render as inline SVG. Prior attempts using
//   1. inline-block + height + line-height — text vertically clipped.
//   2. <table style="display:inline-table"> + <td> — coloured box rendered
//      but the "G1"/"G2"/"G3" text inside disappeared entirely.
// Both failure modes trace back to html2canvas's unreliable handling of
// inline-block / table-cell text positioning when rasterizing into an
// offscreen canvas.
//
// html2canvas walks SVG <rect> and <text> nodes through its dedicated SVG
// rendering path (see niklasvh/html2canvas issues #95, #267, #1709), which
// honours explicit x/y, text-anchor, and width/height attributes
// faithfully. Caveat from issue #1709: SVG <text> ignores @font-face
// stylesheets — so we must use a baseline system font family (Arial) here
// rather than the page's Inter.
function stakesPill(grade: string): string {
  const bg = grade === 'G1' ? '#d4af37' : grade === 'G2' ? '#a8a9ad' : '#b45309'
  // Alignment: badge is sized to fit within the 11px line (line-height ≈13.2px)
  // and `vertical-align:middle` centres it against the line's middle. The 2px
  // `translateY` drops the box so its cap-line sits on the race-name baseline
  // — without it the badge floats slightly above the surrounding text.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12" viewBox="0 0 24 12" style="display:inline-block;vertical-align:middle;margin-right:4px;transform:translateY(2px);"><rect x="0" y="0" width="24" height="12" rx="3" fill="${bg}"/><text x="12" y="9" text-anchor="middle" font-size="9" font-weight="600" fill="#fff" font-family="Arial, sans-serif">${grade}</text></svg>`
}

// Shared table row cell styles
const cellDate = `vertical-align:top;width:52px;padding:6px 8px 6px 0;white-space:nowrap;font-size:12px;font-weight:600;color:#475569;`
// Position cell uses font-size:13px to match the horse-name span in the
// adjacent main cell. Both cells use vertical-align:top + identical
// padding-top, so matching the font-size makes the first-line glyph
// baselines coincide without any hardcoded line-height tweak.
const cellPos = `vertical-align:top;width:32px;padding:6px 4px 6px 0;white-space:nowrap;font-size:13px;text-align:center;`
const cellMain = `vertical-align:top;padding:6px 4px;`
const cellRight = `vertical-align:top;text-align:right;white-space:nowrap;padding:6px 0 6px 8px;font-size:12px;color:#475569;`

function buildResultRow(r: Result, options: BuildRowOptions = {}): string {
  const { orgsWithSilks = [], isAdmin, userOrgName, userOrgSilksUrl, userOrgPatterns } = options
  const isWin = r.finish_position === 1
  const isStakes = r.is_stakes

  // Position text
  let posText: string
  let posStyle = 'color:#64748b;font-weight:500;'
  if (isWin) { posText = '1st'; posStyle = 'color:#b8860b;font-weight:700;' }
  else if (r.finish_position === 2) { posText = '2nd'; posStyle = 'color:#64748b;font-weight:600;' }
  else if (r.finish_position === 3) { posText = '3rd'; posStyle = 'color:#a0622a;font-weight:600;' }
  else if (r.finish_position != null) { posText = formatOrdinal(r.finish_position); posStyle = 'color:#94a3b8;' }
  else { posText = r.finish_status || '-'; posStyle = 'color:#94a3b8;' }

  const nameText = r.horse_name || 'Unknown'
  const name = r.horse_profile_url
    ? `<a href="${r.horse_profile_url}" style="color:#0f172a;text-decoration:none;">${nameText}</a>`
    : nameText
  const desc = formatHorseDescription(r.horse_sex || null, r.horse_yob || null)
  const ownerSilks = getSilksForOwner(r.owner, orgsWithSilks, isAdmin, userOrgName, userOrgSilksUrl, userOrgPatterns)
  const track = formatTrack(r.track)
  const dateStr = formatDate(r.race_date)

  // Race details. Prefer per-horse earnings (filled in for European rows by
  // Arion) over the total race purse — matches the live ResultCard. US/CA
  // rows have earnings=null because the chart-scraper writes per-horse
  // earnings into purse, so the fallback covers them.
  const earnAmt = r.earnings ?? r.purse
  const earnCcy = r.earnings != null ? r.earnings_currency : r.purse_currency
  const raceParts = [r.race_type, formatPurse(earnAmt, earnCcy), formatDistance(r.distance || null) || null].filter(Boolean).join(` ${pipe()} `)
  const nameWeight = isWin ? 'font-weight:700;' : 'font-weight:600;'

  // Sub-details
  let subLine = ''
  const stakesName = isStakes && r.race_name ? cleanRaceName(r.race_name.replace(/^STAKES\s*/i, '').trim()) : null
  if (r.stakes_grade || stakesName) {
    // Build pill (no separator after — its own margin-right handles spacing)
    // and join the remaining text parts with a slate-grey bullet so a
    // clipped/missing pill can never look like a stray leading em-dash.
    const pillHtml = (r.stakes_grade && r.stakes_grade !== 'Listed') ? stakesPill(r.stakes_grade) : ''
    const textParts: string[] = []
    if (stakesName) textParts.push(`<span style="font-weight:500;color:#334155;">${stakesName}</span>`)
    if (isWin && r.win_margin) textParts.push(`<span style="color:#15803d;font-weight:500;">Won by ${r.win_margin}</span>`)
    const sep = `<span style="color:#cbd5e1;margin:0 6px;">·</span>`
    subLine = `<div style="font-size:11px;margin-top:1px;color:#64748b;">${pillHtml}${textParts.join(sep)}</div>`
  } else if (isWin && r.win_margin) {
    subLine = `<div style="font-size:11px;margin-top:1px;color:#15803d;font-weight:500;">Won by ${r.win_margin}</div>`
  }

  return `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="${cellDate}">${dateStr}</td>
      <td style="${cellPos}"><span style="${posStyle}font-size:13px;">${posText}</span></td>
      <td style="${cellMain}">
        <span style="font-size:13px;${nameWeight}color:#0f172a;">${name}</span>${desc ? `<span style="color:#94a3b8;font-size:12px;margin-left:4px;">${desc}</span>` : ''}${ownerSilks.length > 0 ? silksImgs(ownerSilks) : ''}
        ${raceParts ? `<span style="font-size:12px;color:#64748b;margin-left:6px;">${raceParts}</span>` : ''}
        ${subLine}
      </td>
      <td style="${cellRight}">${track} R${r.race_number}</td>
    </tr>`
}

function buildEntryRow(e: Entry, options: BuildRowOptions = {}): string {
  if (e.scratched) return ''

  const { orgsWithSilks = [], isAdmin, userOrgName, userOrgSilksUrl, userOrgPatterns } = options

  const nameText = e.horse_name || `${e.horse_yob || ''} ${e.horse_dam || 'Unknown'}`.trim()
  const name = e.horse_profile_url
    ? `<a href="${e.horse_profile_url}" style="color:#0f172a;text-decoration:none;">${nameText}</a>`
    : nameText
  const desc = formatHorseDescription(e.horse_sex || null, e.horse_yob || null)
  const ownerSilks = getSilksForOwner(e.owner, orgsWithSilks, isAdmin, userOrgName, userOrgSilksUrl, userOrgPatterns)
  const track = formatTrack(e.track)
  const distDisplay = formatDistance(e.distance || null)

  // Convert post time to ET, and use the converted ET date for the date
  // column so east-of-ET races (Tokyo, Hong Kong, Gulf) don't show a
  // contradictory date + ET time pair (e.g. "Nov 23 | 9:00 PM ET" for what
  // is actually Nov 22 in ET).
  const etConverted = e.post_time
    ? convertPostTimeToET(e.post_time, e.race_date, e.race_country, e.timezone)
    : null
  const dateStr = formatDate(etConverted?.etDate ?? e.race_date)

  const raceParts = [e.race_type, formatPurse(e.purse, e.purse_currency), distDisplay || null].filter(Boolean).join(` ${pipe()} `)

  // Time + track info
  const rightParts = [`${track} R${e.race_number}`]
  if (e.post_time) {
    rightParts.push(etConverted?.time ?? `${e.post_time} ${e.timezone ?? ''}`.trim())
  }

  // Stakes sub-line
  const stakesName = e.is_stakes && e.race_name ? cleanRaceName(e.race_name.replace(/^STAKES\s*/i, '').trim()) : null
  let subLine = ''
  if (e.stakes_grade || stakesName) {
    // Pill carries its own right-margin; render race name immediately after
    // it (no em-dash separator) to mirror the live EntryCard layout and
    // avoid a stray leading dash if html2canvas clips the badge.
    const pillHtml = (e.stakes_grade && e.stakes_grade !== 'Listed') ? stakesPill(e.stakes_grade) : ''
    const nameHtml = stakesName ? `<span style="font-weight:500;color:#334155;">${stakesName}</span>` : ''
    subLine = `<div style="font-size:11px;margin-top:1px;color:#64748b;">${pillHtml}${nameHtml}</div>`
  }

  // Trainer/Jockey
  const connections: string[] = []
  if (e.trainer) connections.push(`T: ${e.trainer}`)
  if (e.jockey) connections.push(`J: ${e.jockey}`)
  const connectionsLine = connections.length > 0
    ? `<div style="font-size:11px;margin-top:1px;color:#94a3b8;">${connections.join(`${pipe()}`)}</div>`
    : ''

  // Entries have no finish position — emit an empty fixed-width cell where
  // the position would go so the main column aligns column-for-column with
  // result rows in the same table. (Previously this row used colspan=2,
  // which made the entry's main column start ~32px to the left of every
  // result's main column, causing the visible column-width drift.)
  return `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="${cellDate}">${dateStr}</td>
      <td style="${cellPos}"></td>
      <td style="${cellMain}">
        <span style="font-size:13px;font-weight:600;color:#0f172a;">${name}</span>${desc ? `<span style="color:#94a3b8;font-size:12px;margin-left:4px;">${desc}</span>` : ''}${ownerSilks.length > 0 ? silksImgs(ownerSilks) : ''}
        ${raceParts ? `<span style="font-size:12px;color:#64748b;margin-left:6px;">${raceParts}</span>` : ''}
        ${subLine}${connectionsLine}
      </td>
      <td style="${cellRight}">${rightParts.join(` ${pipe()} `)}</td>
    </tr>`
}

function sectionHeader(text: string): string {
  return `<tr><td colspan="4" style="padding:16px 0 6px 0;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid #334155;">${text}</td></tr>`
}

function buildSummarySection(stats: NonNullable<ExportData['stats']> | null | undefined): string {
  // Mirror the live StatsBar component: year | starters | winners | earnings.
  // Always show the stallion's overall season stats regardless of any filter
  // the export modal applied to entries / results.
  if (!stats) return ''
  const ccy = currencyForRegion(stats.region)
  const earnings = formatMoneyCompact(stats.earnings ?? 0, ccy)

  const cell = (label: string, value: string) =>
    `<td style="padding:6px 14px 6px 0;vertical-align:top;">
      <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:1px;">${label}</div>
      <div style="font-size:16px;font-weight:700;color:#0f172a;">${value}</div>
    </td>`

  return `
    <tr><td colspan="4" style="padding:0 0 12px 0;">
      <div style="padding:8px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;">
        <table style="border-collapse:collapse;width:100%;"><tr>
          ${cell('Year', String(stats.year))}
          ${cell('Starters', String(stats.starters))}
          ${cell('Winners', String(stats.winners))}
          ${cell('Earnings', earnings)}
        </tr></table>
      </div>
    </td></tr>`
}

export async function exportDashboardToPDF(data: ExportData): Promise<void> {
  const html2canvas = (await import('html2canvas')).default
  const { jsPDF } = await import('jspdf')

  const options = data.options || { type: 'all' }
  const exportType = options.type

  const now = new Date()
  const date = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  // Filter entries and results based on export type
  let filteredEntries = data.entries.filter(e => !e.scratched)
  let filteredResults = [...data.results]

  if (exportType === 'entries') {
    filteredResults = []
  } else if (exportType === 'results') {
    filteredEntries = []
  } else if (exportType === 'stakes') {
    filteredEntries = filteredEntries.filter(e => e.is_stakes === true || e.stakes_grade)
    filteredResults = filteredResults.filter(r => r.is_stakes === true || r.stakes_grade)
  }

  // Build subtitle
  let subtitle = `${date} at ${time}`
  if (exportType === 'entries') subtitle += ' — Entries Only'
  else if (exportType === 'results') subtitle += ' — Results Only'
  else if (exportType === 'stakes') subtitle += ' — Stakes Only'

  // Build row options
  const rowOptions: BuildRowOptions = {
    orgsWithSilks: data.orgsWithSilks || [],
    isAdmin: data.isAdmin,
    userOrgName: data.userOrgName,
    userOrgSilksUrl: data.userOrgSilksUrl,
    userOrgPatterns: data.userOrgPatterns,
  }

  // Build all rows as table rows in a single table
  const silksHtml = options.silksUrl
    ? `<td style="vertical-align:top;text-align:right;width:60px;"><img src="${options.silksUrl}" style="height:50px;width:auto;object-fit:contain;" crossorigin="anonymous" /></td>`
    : ''

  // Build the blocks array — each block is a <tr> or a header row
  const blocks: string[] = []

  // Header block (outside the table)
  blocks.push(`
    <div style="border-bottom:2px solid #0f172a;padding-bottom:8px;margin-bottom:6px;">
      <table style="width:100%;border-collapse:collapse;"><tr>
        <td style="vertical-align:top;">
          <div style="font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;letter-spacing:0.01em;">${data.stallionName.toUpperCase()} PROGENY REPORT</div>
          <div style="font-size:11px;color:#64748b;margin-top:3px;">${subtitle}</div>
        </td>
        ${silksHtml}
      </tr></table>
    </div>`)

  // We'll wrap everything in a table, but we need to handle blocks individually for pagination
  // So we build an array of "row groups" that can be measured individually

  // Summary stats (wrapped in table row). Always reflects the stallion's
  // overall season — never the filtered subset.
  const summaryHtml = buildSummarySection(data.stats)

  // Build all content as individual blocks for pagination
  // Block type: 'header-div' for the header, 'table-row' for table rows
  const tableRows: string[] = []
  tableRows.push(summaryHtml)

  if (filteredEntries.length > 0) {
    tableRows.push(sectionHeader('Upcoming Entries'))
    filteredEntries.forEach(e => {
      const row = buildEntryRow(e, rowOptions)
      if (row) tableRows.push(row)
    })
  }

  if (filteredResults.length > 0) {
    tableRows.push(sectionHeader('Recent Results'))
    filteredResults.forEach(r => { tableRows.push(buildResultRow(r, rowOptions)) })
  }

  // Measure each block's height
  const measureWrapper = document.createElement('div')
  measureWrapper.style.cssText = `
    position:absolute;left:-9999px;top:0;width:800px;background:#fff;
    padding:0 28px 0 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;
  `
  document.body.appendChild(measureWrapper)

  // Measure header block
  const headerEl = document.createElement('div')
  headerEl.innerHTML = blocks[0]
  measureWrapper.appendChild(headerEl)
  const headerHeight = headerEl.offsetHeight
  measureWrapper.removeChild(headerEl)

  // Measure each table row by wrapping it in a table
  const rowHeights: number[] = []
  for (const row of tableRows) {
    const el = document.createElement('div')
    el.innerHTML = `<table style="width:100%;border-collapse:collapse;">${row}</table>`
    measureWrapper.appendChild(el)
    rowHeights.push(el.offsetHeight)
    measureWrapper.removeChild(el)
  }
  document.body.removeChild(measureWrapper)

  // Group into pages
  const pageWidth = 210
  const pageHeight = 297
  const leftMargin = 4
  const rightMargin = 3
  const topPadding = 20
  const bottomMargin = 12
  const usableWidth = pageWidth - leftMargin - rightMargin
  const scaleFactor = usableWidth / 800
  const usableHeightPx = (pageHeight - topPadding * scaleFactor - bottomMargin) / scaleFactor

  // Page structure: first page has header + rows, subsequent pages have only rows
  interface PageContent { headerHtml?: string; rowIndices: number[] }
  const pages: PageContent[] = []
  let currentPage: PageContent = { headerHtml: blocks[0], rowIndices: [] }
  let currentHeightPx = headerHeight

  for (let i = 0; i < tableRows.length; i++) {
    const rowH = rowHeights[i]
    const isSection = tableRows[i].includes('text-transform:uppercase;letter-spacing')

    if (currentPage.rowIndices.length > 0 && currentHeightPx + rowH > usableHeightPx) {
      pages.push(currentPage)
      currentPage = { rowIndices: [] }
      currentHeightPx = 0
    }

    // Anti-orphan: section header + next row must fit together
    if (isSection && i + 1 < tableRows.length) {
      const nextH = rowHeights[i + 1]
      if (currentPage.rowIndices.length > 0 && currentHeightPx + rowH + nextH > usableHeightPx) {
        pages.push(currentPage)
        currentPage = { rowIndices: [] }
        currentHeightPx = 0
      }
    }

    currentPage.rowIndices.push(i)
    currentHeightPx += rowH
  }
  if (currentPage.rowIndices.length > 0) pages.push(currentPage)

  // Render each page
  const pdf = new jsPDF('p', 'mm', 'a4')
  interface LinkInfo { url: string; x: number; y: number; width: number; height: number; page: number }
  const allLinks: LinkInfo[] = []

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    if (pageIdx > 0) pdf.addPage()

    const page = pages[pageIdx]
    const pageWrapper = document.createElement('div')
    pageWrapper.style.cssText = `
      position:absolute;left:-9999px;top:0;width:800px;background:#fff;
      padding:20px 28px 20px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;
    `

    let html = ''
    if (page.headerHtml) html += page.headerHtml
    if (page.rowIndices.length > 0) {
      html += `<table style="width:100%;border-collapse:collapse;">`
      html += page.rowIndices.map(ri => tableRows[ri]).join('')
      html += `</table>`
    }
    pageWrapper.innerHTML = html
    document.body.appendChild(pageWrapper)

    // Collect link positions
    const wrapperRect = pageWrapper.getBoundingClientRect()
    pageWrapper.querySelectorAll('a[href]').forEach(anchor => {
      const a = anchor as HTMLAnchorElement
      const href = a.getAttribute('href')
      if (href?.startsWith('http')) {
        const rect = a.getBoundingClientRect()
        allLinks.push({
          url: href,
          x: rect.left - wrapperRect.left,
          y: rect.top - wrapperRect.top,
          width: rect.width,
          height: rect.height,
          page: pageIdx + 1,
        })
      }
    })

    const canvas = await html2canvas(pageWrapper, {
      scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', width: 800, windowWidth: 800,
    })

    const imgHeight = (canvas.height * usableWidth) / canvas.width
    const imgData = canvas.toDataURL('image/png')
    pdf.addImage(imgData, 'PNG', leftMargin, 0, usableWidth, imgHeight)

    document.body.removeChild(pageWrapper)
  }

  // Add page numbers
  const totalPages = pdf.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i)
    pdf.setFontSize(8)
    pdf.setTextColor(148, 163, 184)
    pdf.text(`Page ${i} of ${totalPages}`, pageWidth - rightMargin - 2, pageHeight - 5, { align: 'right' })
  }

  // Add clickable links
  allLinks.forEach(link => {
    if (link.page >= 1 && link.page <= totalPages) {
      pdf.setPage(link.page)
      pdf.link(
        leftMargin + link.x * scaleFactor,
        link.y * scaleFactor,
        link.width * scaleFactor,
        link.height * scaleFactor,
        { url: link.url }
      )
    }
  })

  const safeStallionName = data.stallionName.toLowerCase().replace(/\s+/g, '-')
  const dateStr = new Date().toISOString().split('T')[0]
  pdf.save(data.filename || `${safeStallionName}-report-${dateStr}.pdf`)
}
