import { PassThrough } from 'node:stream'
import PDFDocument from 'pdfkit'

type ColumnAccessor<T> = (row: T, index: number) => string | number

export interface ExportColumn<T> {
  key: string
  header: string
  accessor: ColumnAccessor<T>
  widthRatio?: number
}

const idrFormatter = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' })

export const formatIdr = (valueInCents: number): string => idrFormatter.format(valueInCents / 100)

const escapeCsvValue = (value: string | number): string => {
  const stringValue = String(value ?? '')
  if (stringValue.includes('"') || stringValue.includes(',') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }
  return stringValue
}

export const buildCsv = <T>(columns: Array<ExportColumn<T>>, rows: readonly T[]): string => {
  const header = columns.map((column) => escapeCsvValue(column.header)).join(',')
  const body = rows
    .map((row, rowIndex) =>
      columns
        .map((column) => escapeCsvValue(column.accessor(row, rowIndex)))
        .join(','),
    )
    .join('\n')

  return [header, body].filter(Boolean).join('\n')
}

const computeColumnWidths = <T>(doc: PDFDocument, columns: Array<ExportColumn<T>>) => {
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const totalRatio = columns.reduce((total, column) => total + (column.widthRatio ?? 1), 0)
  const widths = columns.map((column) => (contentWidth * (column.widthRatio ?? 1)) / totalRatio)
  const offsets = widths.map((_, index) => widths.slice(0, index).reduce((sum, width) => sum + width, 0))
  return { widths, offsets }
}

export const createPdfStream = <T>(
  title: string,
  subtitle: string | null,
  columns: Array<ExportColumn<T>>,
  rows: readonly T[],
): PassThrough => {
  const doc = new PDFDocument({ margin: 36, size: 'A4' })
  const stream = new PassThrough()
  doc.pipe(stream)

  doc.font('Helvetica-Bold').fontSize(18).fillColor('#111827').text(title)

  if (subtitle) {
    doc.moveDown(0.3)
    doc.font('Helvetica').fontSize(10).fillColor('#4B5563').text(subtitle)
  }

  doc.moveDown()

  if (rows.length === 0) {
    doc.font('Helvetica').fontSize(12).fillColor('#374151').text('No data available for the selected range.')
    doc.end()
    return stream
  }

  const { widths, offsets } = computeColumnWidths(doc, columns)

  const drawRow = (values: Array<string | number>, bold = false) => {
    const font = bold ? 'Helvetica-Bold' : 'Helvetica'
    doc.font(font).fontSize(10).fillColor('#111827')

    values.forEach((value, columnIndex) => {
      const xPosition = doc.page.margins.left + offsets[columnIndex]
      const width = widths[columnIndex]
      const textValue = String(value ?? '')
      doc.text(textValue, xPosition, doc.y, {
        width,
        continued: columnIndex < values.length - 1,
      })
    })

    doc.text('\n')
  }

  drawRow(columns.map((column) => column.header), true)

  rows.forEach((row, rowIndex) => {
    const values = columns.map((column) => column.accessor(row, rowIndex))
    drawRow(values)
  })

  doc.end()
  return stream
}

export const describeRange = (start?: Date, end?: Date) => {
  if (!start && !end) {
    return null
  }

  const formatter = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
  })

  if (start && end) {
    return `Periode ${formatter.format(start)} - ${formatter.format(end)}`
  }

  if (start) {
    return `Mulai ${formatter.format(start)}`
  }

  return `Sampai ${formatter.format(end!)}`
}

export const buildFileName = (base: string, extension: string, start?: Date, end?: Date) => {
  const formatPart = (value?: Date) => value?.toISOString().slice(0, 10) ?? 'latest'
  const parts = [base, formatPart(start)]
  if (end) {
    parts.push(formatPart(end))
  }
  return `${parts.join('-')}.${extension}`
}
