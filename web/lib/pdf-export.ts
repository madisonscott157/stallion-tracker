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
  // Dynamic imports - only loaded when function is called (client-side only)
  const html2canvas = (await import('html2canvas')).default
  const { jsPDF } = await import('jspdf')

  const { stallionName, filename } = options
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // Create a wrapper for PDF content
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

  // Clone the content
  const clone = contentElement.cloneNode(true) as HTMLElement

  // Remove buttons, nav, and workouts section from clone
  clone.querySelectorAll('nav, button').forEach(el => el.remove())

  // Remove the workouts section (identified by "Workouts" header)
  clone.querySelectorAll('section').forEach(section => {
    const header = section.querySelector('h2')
    if (header && header.textContent?.includes('Workouts')) {
      section.remove()
    }
  })

  // Remove silks images (don't render well in PDF)
  clone.querySelectorAll('img[alt="Silks"]').forEach(el => el.remove())

  // ── Global fixes for html2canvas ──

  // Prevent all overflow clipping
  clone.querySelectorAll('*').forEach(node => {
    const el = node as HTMLElement
    if (el.style) {
      el.style.overflow = 'visible'
    }
  })

  // ── Fix all badge spans (WIN, 2nd, G1, G2, G3, etc.) ──
  clone.querySelectorAll('span').forEach(span => {
    const el = span as HTMLElement
    const isBadge =
      el.classList.contains('bg-gold') ||
      el.classList.contains('bg-silver') ||
      el.classList.contains('bg-accent')
    if (isBadge) {
      // Reset flex and use simple inline-block with explicit sizing
      el.style.display = 'inline-block'
      el.style.verticalAlign = 'middle'
      el.style.lineHeight = '20px'
      el.style.height = '20px'
      el.style.minWidth = ''
      el.style.padding = '0 6px'
      el.style.fontSize = '11px'
      el.style.fontWeight = '600'
      el.style.borderRadius = '3px'
      el.style.textAlign = 'center'
      el.style.position = 'static'
      el.style.marginRight = '2px'
    }
  })

  // ── Fix flex row alignment in all cards ──
  clone.querySelectorAll('.rounded-lg.border').forEach(card => {
    const cardEl = card as HTMLElement
    cardEl.style.padding = '8px 12px'
    cardEl.style.marginBottom = '4px'

    // Fix all flex containers inside cards
    cardEl.querySelectorAll('.flex').forEach(flexContainer => {
      const row = flexContainer as HTMLElement

      // Change baseline alignment to center for consistent rendering
      if (row.classList.contains('items-baseline')) {
        row.style.alignItems = 'center'
      }

      // For justify-between rows, keep flex but fix gaps
      if (row.classList.contains('justify-between')) {
        row.style.display = 'flex'
        row.style.alignItems = 'center'
        row.style.gap = '8px'
      }

      // Make all direct children vertically aligned
      row.querySelectorAll(':scope > *').forEach(child => {
        const childEl = child as HTMLElement
        childEl.style.verticalAlign = 'middle'
      })
    })
  })

  // ── Remove trailing pipe separators ──
  // Find pipe separators that are the last visible element before a closing container
  clone.querySelectorAll('span').forEach(span => {
    const el = span as HTMLElement
    if (el.textContent?.trim() === '|' && el.classList.contains('text-slate-300')) {
      // Check if next sibling exists and is visible
      const next = el.nextElementSibling
      if (!next || (next as HTMLElement).offsetParent === null) {
        el.style.display = 'none'
      }
    }
  })

  // ── Tighten section spacing ──
  clone.querySelectorAll('section').forEach(section => {
    (section as HTMLElement).style.marginBottom = '12px'
  })

  clone.querySelectorAll('.card-stack').forEach(stack => {
    const el = stack as HTMLElement
    el.style.gap = '4px'
    // Also handle margin-based spacing
    el.querySelectorAll(':scope > *').forEach((child, i) => {
      if (i > 0) (child as HTMLElement).style.marginTop = '4px'
    })
  })

  clone.querySelectorAll('.section-header').forEach(header => {
    (header as HTMLElement).style.marginBottom = '6px'
  })

  // ── Fix StatsBar alignment ──
  clone.querySelectorAll('.bg-slate-50').forEach(bar => {
    const el = bar as HTMLElement
    el.style.padding = '6px 12px'
  })

  // ── Ensure consistent font sizes for text elements ──
  clone.querySelectorAll('.text-sm').forEach(el => {
    (el as HTMLElement).style.fontSize = '13px'
  })
  clone.querySelectorAll('.text-xs').forEach(el => {
    (el as HTMLElement).style.fontSize = '11px'
  })
  clone.querySelectorAll('.font-medium').forEach(el => {
    (el as HTMLElement).style.fontWeight = '500'
  })

  // Add PDF header
  const header = document.createElement('div')
  header.innerHTML = `
    <div style="border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 16px;">
      <h1 style="font-size: 22px; font-weight: 600; color: #0f172a; margin: 0; line-height: 1.3;">
        ${stallionName.toUpperCase()} PROGENY REPORT
      </h1>
      <p style="font-size: 12px; color: #64748b; margin: 4px 0 0 0;">${date}</p>
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

    const imgWidth = 210 // A4 width in mm
    const pageHeight = 297 // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    // Scale factor: wrapper pixels to PDF mm
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
