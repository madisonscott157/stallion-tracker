/**
 * PDF Export — builds clean HTML from data (no DOM cloning).
 * html2canvas can't reliably render flex layouts, so we build
 * simple table-based HTML that renders pixel-perfect.
 */

import type { Result, Entry } from './supabase'
import { formatDate, formatDistance, formatHorseDescription, formatOrdinal, formatTrack, cleanRaceName } from './utils'

export type ExportType = 'all' | 'entries' | 'results' | 'stakes'

export interface ExportOptions {
  type: ExportType
  silksUrl?: string | null
  orgName?: string | null
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

function badge(text: string, bgColor: string): string {
  return `<span style="background:${bgColor};color:#fff;font-size:10px;font-weight:600;padding:1px 5px;border-radius:3px;margin-right:6px;letter-spacing:0.02em;display:inline-block;vertical-align:baseline;position:relative;top:-1px;">${text}</span>`
}

function pipe(): string {
  return `<span style="color:#cbd5e1;margin:0 6px;">|</span>`
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
  const is3rd = r.finish_position === 3
  const isG1 = r.stakes_grade === 'G1'
  const isG2 = r.stakes_grade === 'G2'
  const isStakes = r.is_stakes

  // Border color
  let borderColor = 'transparent'
  if (isWin || isG1) borderColor = '#b8860b'
  else if (is2nd || isG2) borderColor = '#94a3b8'
  else if (is3rd) borderColor = '#a0622a'
  else if (r.stakes_grade) borderColor = '#b45309'
  else if (isStakes) borderColor = '#0f172a'

  // Row background tint
  let rowBg = '#ffffff'
  let rowBorder = '#e2e8f0'
  if (isWin) { rowBg = 'rgba(255,251,235,0.6)'; rowBorder = 'rgba(212,175,55,0.3)' }
  else if (is2nd) { rowBg = 'rgba(248,250,252,0.6)'; rowBorder = 'rgba(168,169,173,0.3)' }
  else if (is3rd) { rowBg = 'rgba(255,247,237,0.4)'; rowBorder = 'rgba(205,127,50,0.3)' }

  // Position badge
  let pos = ''
  if (isWin) pos = badge('WIN', '#d4af37')
  else if (is2nd) pos = badge('2nd', '#a8a9ad')
  else if (is3rd) pos = badge('3rd', '#cd7f32')
  else pos = `<span style="color:#64748b;font-size:13px;">${formatOrdinal(r.finish_position)}</span> `

  const nameText = r.horse_name || 'Unknown'
  const name = r.horse_profile_url
    ? `<a href="${r.horse_profile_url}" style="color:#0f172a;text-decoration:none;">${nameText}</a>`
    : nameText
  const desc = formatHorseDescription(r.horse_sex || null, r.horse_yob || null)
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
      const gc = isG1 ? '#d4af37' : isG2 ? '#a8a9ad' : '#b45309'
      gradeBadge = badge(r.stakes_grade, gc)
    }
    const nameColor = isG1 ? '#b8860b' : isG2 ? '#94a3b8' : r.stakes_grade ? '#b45309' : '#0f172a'
    const nameWeight = isWin && isStakes ? 'font-weight:700;' : 'font-weight:500;'
    const sn = stakesName ? `<span style="color:${nameColor};${nameWeight}">${stakesName}</span>` : ''
    const margin = isWin && r.win_margin ? `${pipe()}<span style="color:#15803d;font-weight:500;">Won by ${r.win_margin}</span>` : ''
    stakesRow = `<div style="margin-top:2px;font-size:13px;margin-left:68px;">${gradeBadge}${sn}${margin}</div>`
  }

  // Win margin for non-stakes
  let winRow = ''
  if (isWin && r.win_margin && !isStakes) {
    winRow = `<div style="margin-top:2px;font-size:13px;color:#15803d;font-weight:500;margin-left:68px;">Won by ${r.win_margin}</div>`
  }

  const raceInfoStyle = isWin && isStakes ? 'font-weight:600;color:#334155;' : 'color:#64748b;'

  return `
    <div style="border:1px solid ${rowBorder};border-left:4px solid ${borderColor};border-radius:6px;padding:7px 12px;margin-bottom:5px;font-size:13px;line-height:1.5;background:${rowBg};">
      <table style="width:100%;border-collapse:collapse;"><tr>
        <td style="vertical-align:baseline;width:56px;padding-right:12px;white-space:nowrap;">
          <span style="font-size:12px;font-weight:600;color:#475569;">${dateStr}</span>
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
  const desc = formatHorseDescription(e.horse_sex || null, e.horse_yob || null)
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
    stakesRow = `<div style="margin-top:1px;font-size:13px;margin-left:68px;">${gradeBadge}${sn}${raceDetails ? `${pipe()}${raceDetails}` : ''}</div>`
  }

  const row2 = !stakesRow && raceDetails ? `<div style="margin-top:1px;font-size:13px;color:#64748b;margin-left:68px;">${raceDetails}</div>` : ''

  // Trainer/Jockey row
  const connections: string[] = []
  if (e.trainer) connections.push(`T: ${e.trainer}`)
  if (e.jockey) connections.push(`J: ${e.jockey}`)
  const connectionsRow = connections.length > 0
    ? `<div style="margin-top:1px;font-size:12px;color:#64748b;margin-left:68px;">${connections.join(`${pipe()}`)}</div>`
    : ''

  return `
    <div style="border:1px solid #e2e8f0;border-left:4px solid ${borderColor};border-radius:6px;padding:7px 12px;margin-bottom:5px;font-size:13px;line-height:1.5;">
      <table style="width:100%;border-collapse:collapse;"><tr>
        <td style="vertical-align:baseline;width:56px;padding-right:12px;white-space:nowrap;">
          <span style="font-size:12px;font-weight:600;color:#475569;">${dateStr}</span>
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
  return `<div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.06em;margin:20px 0 6px 0;padding-top:10px;border-top:1px solid #e2e8f0;">${text}</div>`
}

function buildSummarySection(results: Result[], entries: Entry[]): string {
  const totalResults = results.length
  const winners = results.filter(r => r.finish_position === 1).length
  const winPct = totalResults > 0 ? ((winners / totalResults) * 100).toFixed(1) : '0.0'
  const stakesWinners = results.filter(r => r.finish_position === 1 && r.is_stakes).length
  const gradedStakesWinners = results.filter(r => r.finish_position === 1 && r.stakes_grade).length
  const totalPurses = results.reduce((sum, r) => sum + (r.purse || 0), 0)
  const totalEntries = entries.length

  const cell = (label: string, value: string) =>
    `<td style="padding:4px 12px 4px 0;vertical-align:top;">
      <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">${label}</div>
      <div style="font-size:15px;font-weight:700;color:#0f172a;">${value}</div>
    </td>`

  return `
    <div style="margin-bottom:14px;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
      <table style="border-collapse:collapse;width:100%;"><tr>
        ${cell('Results', String(totalResults))}
        ${cell('Winners', String(winners))}
        ${cell('Win %', `${winPct}%`)}
        ${cell('SW', String(stakesWinners))}
        ${cell('GSW', String(gradedStakesWinners))}
        ${cell('Purses', `$${totalPurses.toLocaleString()}`)}
        ${cell('Entries', String(totalEntries))}
      </tr></table>
    </div>`
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
  if (exportType === 'entries') subtitle += ' | Entries Only'
  else if (exportType === 'results') subtitle += ' | Results Only'
  else if (exportType === 'stakes') subtitle += ' | Stakes Only'

  // Build HTML blocks as individual elements for per-page layout
  const blocks: string[] = []

  // Header block
  const silksHtml = options.silksUrl
    ? `<td style="vertical-align:top;text-align:right;width:60px;"><img src="${options.silksUrl}" style="height:50px;width:auto;object-fit:contain;" crossorigin="anonymous" /></td>`
    : ''

  const orgLine = options.orgName
    ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">Prepared for ${options.orgName}</div>`
    : ''

  blocks.push(`
    <div style="border-bottom:2px solid #0f172a;padding-bottom:8px;margin-bottom:10px;">
      <table style="width:100%;border-collapse:collapse;"><tr>
        <td style="vertical-align:top;">
          <div style="font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;letter-spacing:0.01em;">${data.stallionName.toUpperCase()} PROGENY REPORT</div>
          <div style="font-size:11px;color:#64748b;margin-top:3px;">${subtitle}</div>
          ${orgLine}
        </td>
        ${silksHtml}
      </tr></table>
    </div>`)

  // Summary stats block
  blocks.push(buildSummarySection(filteredResults, filteredEntries))

  // Build row options
  const rowOptions: BuildRowOptions = {
    orgsWithSilks: data.orgsWithSilks || [],
    isAdmin: data.isAdmin,
    userOrgName: data.userOrgName,
    userOrgSilksUrl: data.userOrgSilksUrl,
  }

  // Entries section
  if (filteredEntries.length > 0) {
    blocks.push(sectionHeader('Upcoming Entries'))
    filteredEntries.forEach(e => {
      const row = buildEntryRow(e, rowOptions)
      if (row) blocks.push(row)
    })
  }

  // Results section
  if (filteredResults.length > 0) {
    blocks.push(sectionHeader('Recent Results'))
    filteredResults.forEach(r => { blocks.push(buildResultRow(r, rowOptions)) })
  }

  // Measure each block's height by rendering them individually
  const measureWrapper = document.createElement('div')
  measureWrapper.style.cssText = `
    position:absolute;left:-9999px;top:0;width:800px;background:#fff;
    padding:0 28px 0 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;
  `
  document.body.appendChild(measureWrapper)

  const blockHeights: number[] = []
  for (const block of blocks) {
    const el = document.createElement('div')
    el.innerHTML = block
    measureWrapper.appendChild(el)
    blockHeights.push(el.offsetHeight)
    measureWrapper.removeChild(el)
  }
  document.body.removeChild(measureWrapper)

  // Group blocks into pages
  const pageWidth = 210
  const pageHeight = 297
  const leftMargin = 4
  const rightMargin = 3
  const topPadding = 20
  const bottomMargin = 12 // space for page numbers
  const usableWidth = pageWidth - leftMargin - rightMargin
  const scaleFactor = usableWidth / 800
  const usableHeightPx = (pageHeight - topPadding * scaleFactor - bottomMargin) / scaleFactor

  const pages: number[][] = [] // each page is array of block indices
  let currentPage: number[] = []
  let currentHeightPx = 0

  for (let i = 0; i < blocks.length; i++) {
    const blockH = blockHeights[i]
    const isHeader = blocks[i].includes('text-transform:uppercase;letter-spacing')

    // Check if adding this block exceeds page height
    if (currentPage.length > 0 && currentHeightPx + blockH > usableHeightPx) {
      pages.push(currentPage)
      currentPage = []
      currentHeightPx = 0
    }

    // Prevent orphaned section headers: if this is a section header and
    // adding it + the next block won't fit, push both to next page
    if (isHeader && i + 1 < blocks.length) {
      const nextH = blockHeights[i + 1]
      if (currentPage.length > 0 && currentHeightPx + blockH + nextH > usableHeightPx) {
        pages.push(currentPage)
        currentPage = []
        currentHeightPx = 0
      }
    }

    currentPage.push(i)
    currentHeightPx += blockH
  }
  if (currentPage.length > 0) pages.push(currentPage)

  // Render each page separately
  const pdf = new jsPDF('p', 'mm', 'a4')
  interface LinkInfo { url: string; x: number; y: number; width: number; height: number; page: number }
  const allLinks: LinkInfo[] = []

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    if (pageIdx > 0) pdf.addPage()

    const pageBlocks = pages[pageIdx]
    const pageWrapper = document.createElement('div')
    pageWrapper.style.cssText = `
      position:absolute;left:-9999px;top:0;width:800px;background:#fff;
      padding:20px 28px 20px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;
    `
    pageWrapper.innerHTML = pageBlocks.map(bi => blocks[bi]).join('')
    document.body.appendChild(pageWrapper)

    // Collect link positions for this page
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
    pdf.setTextColor(148, 163, 184) // slate-400
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
