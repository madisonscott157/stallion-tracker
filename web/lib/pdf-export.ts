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

  // Ensure badges don't get clipped
  clone.querySelectorAll('span').forEach(span => {
    const el = span as HTMLElement
    if (el.classList.contains('bg-accent') || el.classList.contains('bg-green-700')) {
      el.style.overflow = 'visible'
      el.style.display = 'inline-block'
      el.style.position = 'relative'
      el.style.top = '0'
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

    const safeStallionName = stallionName.toLowerCase().replace(/\s+/g, '-')
    const dateStr = new Date().toISOString().split('T')[0]
    pdf.save(filename || `${safeStallionName}-report-${dateStr}.pdf`)
  } finally {
    document.body.removeChild(wrapper)
  }
}
