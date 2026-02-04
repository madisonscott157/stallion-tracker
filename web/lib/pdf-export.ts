/**
 * PDF Export utility for the Stallion Tracker dashboard
 * Uses dynamic imports to avoid SSR issues with browser-only libraries
 */

interface ExportOptions {
  stallionName: string
  filename?: string
}

export async function exportDashboardToPDF(
  contentElement: HTMLElement,
  options: ExportOptions
): Promise<void> {
  const html2canvas = (await import('html2canvas')).default
  const { jsPDF } = await import('jspdf')

  const { stallionName, filename } = options
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const wrapper = document.createElement('div')
  wrapper.style.cssText = `
    position: absolute;
    left: -9999px;
    top: 0;
    width: 800px;
    background: #ffffff;
    padding: 20px 24px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #0f172a;
  `

  const clone = contentElement.cloneNode(true) as HTMLElement

  // ── Remove elements not needed in PDF ──
  clone.querySelectorAll('nav, button').forEach(el => el.remove())
  clone.querySelectorAll('img[alt="Silks"]').forEach(el => el.remove())

  // Remove workouts section
  clone.querySelectorAll('section').forEach(section => {
    const h = section.querySelector('h2')
    if (h && h.textContent?.includes('Workouts')) section.remove()
  })

  // Remove empty state sections ("No upcoming entries", etc.)
  clone.querySelectorAll('.empty-state').forEach(el => {
    const section = el.closest('section')
    if (section) section.remove()
    else el.remove()
  })

  // ── Uniform row height: 24px line-height for everything in cards ──
  const ROW_H = '24px'
  const FONT_SM = '13px'
  const FONT_BASE = '14px'
  const BADGE_H = '18px'

  // Prevent all overflow clipping
  clone.querySelectorAll('*').forEach(node => {
    const el = node as HTMLElement
    if (el.style) el.style.overflow = 'visible'
  })

  // ── Process each card ──
  clone.querySelectorAll('.rounded-lg.border').forEach(card => {
    const cardEl = card as HTMLElement
    cardEl.style.padding = '6px 10px'
    cardEl.style.marginBottom = '3px'

    // Force every flex row to use consistent alignment
    cardEl.querySelectorAll('.flex').forEach(flexContainer => {
      const row = flexContainer as HTMLElement
      row.style.display = 'flex'
      row.style.alignItems = 'center'
      row.style.lineHeight = ROW_H
      row.style.gap = '6px'
      row.style.flexWrap = 'nowrap'

      // Normalize ALL text inside the row to the same size
      row.querySelectorAll('*').forEach(child => {
        const el = child as HTMLElement
        el.style.lineHeight = ROW_H
        el.style.verticalAlign = 'middle'

        // Check if it's a badge
        const isBadge =
          el.classList.contains('bg-gold') ||
          el.classList.contains('bg-silver') ||
          el.classList.contains('bg-accent')

        if (isBadge) {
          el.style.display = 'inline-block'
          el.style.height = BADGE_H
          el.style.lineHeight = BADGE_H
          el.style.padding = '0 5px'
          el.style.fontSize = '10px'
          el.style.fontWeight = '600'
          el.style.borderRadius = '3px'
          el.style.textAlign = 'center'
          el.style.position = 'static'
          el.style.minWidth = ''
          el.style.marginRight = '0'
        } else {
          // Normalize text size - horse name gets slightly larger
          const isFontMedium = el.classList.contains('font-medium') && !el.classList.contains('text-sm')
          el.style.fontSize = isFontMedium ? FONT_BASE : FONT_SM
        }
      })
    })
  })

  // ── Remove trailing pipe separators ──
  clone.querySelectorAll('span').forEach(span => {
    const el = span as HTMLElement
    if (el.textContent?.trim() === '|' && el.classList.contains('text-slate-300')) {
      const next = el.nextElementSibling
      if (!next) el.style.display = 'none'
    }
  })

  // ── Tighten section spacing ──
  clone.querySelectorAll('section').forEach(section => {
    (section as HTMLElement).style.marginBottom = '10px'
  })

  clone.querySelectorAll('.card-stack').forEach(stack => {
    const el = stack as HTMLElement
    el.style.gap = '3px'
    el.querySelectorAll(':scope > *').forEach((child, i) => {
      if (i > 0) (child as HTMLElement).style.marginTop = '3px'
    })
  })

  clone.querySelectorAll('.section-header').forEach(header => {
    (header as HTMLElement).style.marginBottom = '4px'
    ;(header as HTMLElement).style.marginTop = '0'
  })

  // Fix StatsBar
  clone.querySelectorAll('.bg-slate-50').forEach(bar => {
    (bar as HTMLElement).style.padding = '4px 10px'
  })

  // Add PDF header
  const header = document.createElement('div')
  header.innerHTML = `
    <div style="border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px;">
      <h1 style="font-size: 20px; font-weight: 600; color: #0f172a; margin: 0; line-height: 1.3;">
        ${stallionName.toUpperCase()} PROGENY REPORT
      </h1>
      <p style="font-size: 11px; color: #64748b; margin: 3px 0 0 0;">${date}</p>
    </div>
  `
  wrapper.appendChild(header)
  wrapper.appendChild(clone)
  document.body.appendChild(wrapper)

  try {
    // Collect link positions before rendering
    interface LinkInfo {
      url: string
      x: number
      y: number
      width: number
      height: number
    }
    const links: LinkInfo[] = []
    const wrapperRect = wrapper.getBoundingClientRect()

    wrapper.querySelectorAll('a[href]').forEach(anchor => {
      const a = anchor as HTMLAnchorElement
      const href = a.getAttribute('href')
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        const rect = a.getBoundingClientRect()
        links.push({
          url: href,
          x: rect.left - wrapperRect.left,
          y: rect.top - wrapperRect.top,
          width: rect.width,
          height: rect.height,
        })
      }
    })

    const canvas = await html2canvas(wrapper, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: 800,
      windowWidth: 800,
    })

    const imgWidth = 210
    const pageHeight = 297
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    const scaleFactor = imgWidth / 800

    const pdf = new jsPDF('p', 'mm', 'a4')
    const imgData = canvas.toDataURL('image/png')

    let heightLeft = imgHeight
    let position = 0

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight

    while (heightLeft > 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
    }

    // Add clickable link annotations
    const totalPages = pdf.getNumberOfPages()
    links.forEach(link => {
      const linkYInPdf = link.y * scaleFactor
      const linkPage = Math.floor(linkYInPdf / pageHeight) + 1
      const linkYOnPage = linkYInPdf - (linkPage - 1) * pageHeight

      if (linkPage >= 1 && linkPage <= totalPages) {
        pdf.setPage(linkPage)
        pdf.link(
          link.x * scaleFactor,
          linkYOnPage,
          link.width * scaleFactor,
          link.height * scaleFactor,
          { url: link.url }
        )
      }
    })

    const safeStallionName = stallionName.toLowerCase().replace(/\s+/g, '-')
    const dateStr = new Date().toISOString().split('T')[0]
    pdf.save(filename || `${safeStallionName}-report-${dateStr}.pdf`)
  } finally {
    document.body.removeChild(wrapper)
  }
}
