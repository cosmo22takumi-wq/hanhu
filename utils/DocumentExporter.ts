import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
  type IParagraphOptions,
} from 'docx'

interface ExportOptions {
  title: string
  content: string
  author: string
}

function markdownToDocxParagraphs(markdown: string): Paragraph[] {
  const lines = markdown.split('\n')
  const paragraphs: Paragraph[] = []

  for (const line of lines) {
    if (line.startsWith('# ')) {
      paragraphs.push(
        new Paragraph({
          text: line.slice(2).trim(),
          heading: HeadingLevel.HEADING_1,
        })
      )
    } else if (line.startsWith('## ')) {
      paragraphs.push(
        new Paragraph({
          text: line.slice(3).trim(),
          heading: HeadingLevel.HEADING_2,
        })
      )
    } else if (line.startsWith('### ')) {
      paragraphs.push(
        new Paragraph({
          text: line.slice(4).trim(),
          heading: HeadingLevel.HEADING_3,
        })
      )
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      paragraphs.push(
        new Paragraph({
          text: line.slice(2).trim(),
          bullet: { level: 0 },
        })
      )
    } else if (line.trim() === '') {
      paragraphs.push(new Paragraph({ text: '' }))
    } else {
      const opts: IParagraphOptions = {
        alignment: AlignmentType.JUSTIFIED,
        children: parseInlineMarkdown(line),
        spacing: { line: 360 },
      }
      paragraphs.push(new Paragraph(opts))
    }
  }

  return paragraphs
}

function parseInlineMarkdown(text: string): TextRun[] {
  const runs: TextRun[] = []
  const boldRegex = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index) }))
    }
    runs.push(new TextRun({ text: match[1], bold: true }))
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex) }))
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text }))
  }

  return runs
}

export async function exportDocx(options: ExportOptions): Promise<void> {
  const { title, content, author } = options

  const titleParagraph = new Paragraph({
    children: [new TextRun({ text: title, bold: true, size: 32 })],
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  })

  const metaParagraph = new Paragraph({
    children: [new TextRun({ text: author, size: 20, color: '555555' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 800 },
  })

  const bodyParagraphs = markdownToDocxParagraphs(content)

  const doc = new Document({
    creator: author,
    title,
    sections: [
      {
        properties: {},
        children: [titleParagraph, metaParagraph, ...bodyParagraphs],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  triggerDownload(blob, `${sanitizeFilename(title)}.docx`)
}

export async function exportPdf(options: ExportOptions): Promise<void> {
  const { title, content } = options

  const html2pdf = (await import('html2pdf.js' as string)).default as (
    element: HTMLElement,
    options: Record<string, unknown>
  ) => { save: () => void }

  const container = document.createElement('div')
  container.style.cssText =
    'font-family: "Noto Sans JP", sans-serif; font-size: 11pt; line-height: 1.8; padding: 20mm; color: #111;'

  const titleEl = document.createElement('h1')
  titleEl.textContent = title
  titleEl.style.cssText = 'font-size: 16pt; text-align: center; margin-bottom: 24pt;'
  container.appendChild(titleEl)

  const mdLines = content.split('\n')
  for (const line of mdLines) {
    let el: HTMLElement
    if (line.startsWith('# ')) {
      el = document.createElement('h1')
      el.textContent = line.slice(2).trim()
      el.style.fontSize = '14pt'
    } else if (line.startsWith('## ')) {
      el = document.createElement('h2')
      el.textContent = line.slice(3).trim()
      el.style.fontSize = '13pt'
    } else if (line.startsWith('### ')) {
      el = document.createElement('h3')
      el.textContent = line.slice(4).trim()
      el.style.fontSize = '12pt'
    } else if (line.trim() === '') {
      el = document.createElement('br')
    } else {
      el = document.createElement('p')
      el.innerHTML = line
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
      el.style.margin = '6pt 0'
    }
    container.appendChild(el)
  }

  document.body.appendChild(container)

  html2pdf(container, {
    margin: [15, 15, 15, 15],
    filename: `${sanitizeFilename(title)}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  }).save()

  document.body.removeChild(container)
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 80) || 'report'
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
