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
  `

  // Clone the content
  const clone = contentElement.cloneNode(true) as HTMLElement

  // Remove buttons, nav, and workouts section from clone
  clone.querySelectorAll('nav, button').forEach(el => el.remove())

  // Remove the workouts section (identified by "Recent Workouts" header)
  clone.querySelectorAll('section').forEach(section => {
    const header = section.querySelector('h2')
    if (header && header.textContent?.includes('Workouts')) {
      section.remove()
    }
  })

  // Reduce spacing in sections
  clone.querySelectorAll('section').forEach(section => {
    (section as HTMLElement).style.marginBottom = '16px'
  })

  // Reduce spacing in card stacks
  clone.querySelectorAll('.card-stack').forEach(stack => {
    (stack as HTMLElement).style.gap = '6px'
  })

  // Reduce section header margins
  clone.querySelectorAll('.section-header').forEach(header => {
    (header as HTMLElement).style.marginBottom = '8px'
  })

  // Ensure badges don't get clipped - check all badge color classes
  clone.querySelectorAll('span').forEach(span => {
    const el = span as HTMLElement
    if (
      el.classList.contains('bg-accent') ||
      el.classList.contains('bg-green-700') ||
      el.classList.contains('bg-gold') ||
      el.classList.contains('bg-silver')
    ) {
      el.style.overflow = 'visible'
      el.style.display = 'inline-block'
      el.style.position = 'static'
      el.style.marginRight = '4px'
      el.style.verticalAlign = 'middle'
    }
  })

  // Ensure parent containers don't clip badges and fix flex alignment
  clone.querySelectorAll('div').forEach(div => {
    const el = div as HTMLElement
    el.style.overflow = 'visible'
    // Fix flex containers that use items-baseline - change to items-center
    if (el.classList.contains('items-baseline')) {
      el.style.alignItems = 'center'
      el.style.paddingTop = '2px'
    }
  })

  // Add header
  const header = document.createElement('div')
  header.innerHTML = `
    <div style="border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 16px;">
      <h1 style="font-size: 22px; font-weight: 600; color: #0f172a; margin: 0;">
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
