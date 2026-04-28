/**
 * PDF Export — builds clean HTML from data (no DOM cloning).
 * html2canvas can't reliably render flex layouts, so we build
 * simple table-based HTML that renders pixel-perfect.
 */

import type { Result, Entry } from './supabase'
import { formatDate, formatDistance, formatHorseDescription, formatOrdinal, formatTrack, cleanRaceName } from './utils'
import { formatPurse } from './currency'

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

  if (isAdmin && orgsWithSilks.length > 0) {
    const matchingSilks: string[] = []
    for (const org of orgsWithSilks) {
      if (org.name && org.silks_url && owner.includes(org.name)) {
        matchingSilks.push(org.silks_url)
      }
    }
    return matchingSilks
  }

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

// Shared table row cell styles
const cellDate = `vertical-align:top;width:52px;padding:6px 8px 6px 0;white-space:nowrap;font-size:12px;font-weight:600;color:#475569;`
const cellPos = `vertical-align:top;width:32px;padding:6px 4px 6px 0;white-space:nowrap;font-size:12px;text-align:center;`
const cellMain = `vertical-align:top;padding:6px 4px;`
const cellRight = `vertical-align:top;text-align:right;white-space:nowrap;padding:6px 0 6px 8px;font-size:12px;color:#475569;`

function buildResultRow(r: Result, options: BuildRowOptions = {}): string {
  const { orgsWithSilks = [], isAdmin, userOrgName, userOrgSilksUrl } = options
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
  const ownerSilks = getSilksForOwner(r.owner, orgsWithSilks, isAdmin, userOrgName, userOrgSilksUrl)
  const track = formatTrack(r.track)
  const dateStr = formatDate(r.race_date)

  // Race details
  const raceParts = [r.race_type, formatPurse(r.purse, r.purse_currency), formatDistance(r.distance || null) || null].filter(Boolean).join(` ${pipe()} `)
  const nameWeight = isWin ? 'font-weight:700;' : 'font-weight:600;'

  // Sub-details
  let subLine = ''
  const stakesName = isStakes && r.race_name ? cleanRaceName(r.race_name.replace(/^STAKES\s*/i, '').trim()) : null
  if (r.stakes_grade || stakesName) {
    const parts: string[] = []
    if (r.stakes_grade) parts.push(`<span style="font-weight:700;color:#475569;">${r.stakes_grade}</span>`)
    if (stakesName) parts.push(`<span style="font-weight:500;color:#334155;">${stakesName}</span>`)
    if (isWin && r.win_margin) parts.push(`<span style="color:#15803d;font-weight:500;">Won by ${r.win_margin}</span>`)
    subLine = `<div style="font-size:11px;margin-top:1px;color:#64748b;">${parts.join(' — ')}</div>`
  } else if (isWin && r.win_margin) {
    subLine = `<div style="font-size:11px;margin-top:1px;color:#15803d;font-weight:500;">Won by ${r.win_margin}</div>`
  }

  return `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="${cellDate}">${dateStr}</td>
      <td style="${cellPos}"><span style="${posStyle}font-size:12px;">${posText}</span></td>
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

  const { orgsWithSilks = [], isAdmin, userOrgName, userOrgSilksUrl } = options

  const nameText = e.horse_name || `${e.horse_yob || ''} ${e.horse_dam || 'Unknown'}`.trim()
  const name = e.horse_profile_url
    ? `<a href="${e.horse_profile_url}" style="color:#0f172a;text-decoration:none;">${nameText}</a>`
    : nameText
  const desc = formatHorseDescription(e.horse_sex || null, e.horse_yob || null)
  const ownerSilks = getSilksForOwner(e.owner, orgsWithSilks, isAdmin, userOrgName, userOrgSilksUrl)
  const track = formatTrack(e.track)
  const dateStr = formatDate(e.race_date)
  const distDisplay = formatDistance(e.distance || null)

  const raceParts = [e.race_type, formatPurse(e.purse, e.purse_currency), distDisplay || null].filter(Boolean).join(` ${pipe()} `)

  // Time + track info
  const rightParts = [`${track} R${e.race_number}`]
  if (e.post_time) rightParts.push(`${e.post_time}`)

  // Stakes sub-line
  const stakesName = e.is_stakes && e.race_name ? cleanRaceName(e.race_name.replace(/^STAKES\s*/i, '').trim()) : null
  let subLine = ''
  if (e.stakes_grade || stakesName) {
    const parts: string[] = []
    if (e.stakes_grade) parts.push(`<span style="font-weight:700;color:#475569;">${e.stakes_grade}</span>`)
    if (stakesName) parts.push(`<span style="font-weight:500;color:#334155;">${stakesName}</span>`)
    subLine = `<div style="font-size:11px;margin-top:1px;color:#64748b;">${parts.join(' — ')}</div>`
  }

  // Trainer/Jockey
  const connections: string[] = []
  if (e.trainer) connections.push(`T: ${e.trainer}`)
  if (e.jockey) connections.push(`J: ${e.jockey}`)
  const connectionsLine = connections.length > 0
    ? `<div style="font-size:11px;margin-top:1px;color:#94a3b8;">${connections.join(`${pipe()}`)}</div>`
    : ''

  return `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="${cellDate}">${dateStr}</td>
      <td style="${cellMain}" colspan="2">
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

function buildSummarySection(results: Result[], entries: Entry[]): string {
  const totalResults = results.length
  const winners = results.filter(r => r.finish_position === 1).length
  const winPct = totalResults > 0 ? ((winners / totalResults) * 100).toFixed(1) : '0.0'
  const stakesWinners = results.filter(r => r.finish_position === 1 && r.is_stakes).length
  const gradedStakesWinners = results.filter(r => r.finish_position === 1 && r.stakes_grade).length
  const totalPurses = results.reduce((sum, r) => sum + (r.purse || 0), 0)
  const totalEntries = entries.length

  const cell = (label: string, value: string) =>
    `<td style="padding:6px 14px 6px 0;vertical-align:top;">
      <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:1px;">${label}</div>
      <div style="font-size:16px;font-weight:700;color:#0f172a;">${value}</div>
    </td>`

  return `
    <tr><td colspan="4" style="padding:0 0 12px 0;">
      <div style="padding:8px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;">
        <table style="border-collapse:collapse;width:100%;"><tr>
          ${cell('Results', String(totalResults))}
          ${cell('Winners', String(winners))}
          ${cell('Win %', `${winPct}%`)}
          ${cell('SW', String(stakesWinners))}
          ${cell('GSW', String(gradedStakesWinners))}
          ${cell('Purses', `$${totalPurses.toLocaleString('en-US')}`)}
          ${cell('Entries', String(totalEntries))}
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

  // Summary stats (wrapped in table row)
  const summaryHtml = buildSummarySection(filteredResults, filteredEntries)

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
