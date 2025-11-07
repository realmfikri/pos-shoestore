const idrFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

export const formatToIDR = (valueInCents: number) => idrFormatter.format(valueInCents / 100)

const shortDateFormatter = new Intl.DateTimeFormat('id-ID', {
  month: 'short',
  day: 'numeric',
})

export const formatShortDate = (input: string | Date) => {
  const date = typeof input === 'string' ? new Date(input) : input
  return shortDateFormatter.format(date)
}

const mediumDateFormatter = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' })

export const formatMediumDate = (input: string | Date) => {
  const date = typeof input === 'string' ? new Date(input) : input
  return mediumDateFormatter.format(date)
}

const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export const formatDateTime = (input: string | Date | null | undefined) => {
  if (!input) {
    return '—'
  }
  const date = typeof input === 'string' ? new Date(input) : input
  return dateTimeFormatter.format(date)
}
