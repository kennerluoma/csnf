/* One place for date logic so event and exhibition views agree. All formatting is en-GB style
   ("12 Sep 2026"); change `locale` to localise the whole site. Times render in `timeZone`. */
export const locale = 'en-GB'
export const timeZone = 'Europe/London'

const day = new Intl.DateTimeFormat(locale, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone,
})
const dayNoYear = new Intl.DateTimeFormat(locale, {
  day: 'numeric',
  month: 'short',
  timeZone,
})
const time = new Intl.DateTimeFormat(locale, {
  hour: '2-digit',
  minute: '2-digit',
  timeZone,
})
const monthYear = new Intl.DateTimeFormat(locale, {
  month: 'long',
  year: 'numeric',
  timeZone,
})
const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone })

export const fmtDate = (iso: string) => day.format(new Date(iso))
export const fmtTime = (iso: string) => time.format(new Date(iso))
export const fmtMonth = (year: number, month: number) =>
  monthYear.format(new Date(Date.UTC(year, month - 1, 15)))

/* "12 – 20 Sep 2026", "28 Sep – 3 Oct 2026", "12 Sep 2026" */
export function fmtRange(start: string, end?: string | null) {
  if (!end || end.slice(0, 10) === start.slice(0, 10)) return fmtDate(start)
  const a = new Date(start)
  const b = new Date(end)
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear()
  const sameMonth = sameYear && a.getUTCMonth() === b.getUTCMonth()
  if (sameMonth) return `${a.getUTCDate()} – ${day.format(b)}`
  return `${sameYear ? dayNoYear.format(a) : day.format(a)} – ${day.format(b)}`
}

/* "Sat 12 Sep 2026, 19:00 – 21:00" for events. */
export function fmtEventTime(
  start: string,
  end?: string | null,
  allDay?: boolean | null,
) {
  const d = `${weekday.format(new Date(start))} ${fmtDate(start)}`
  if (allDay)
    return end && end.slice(0, 10) !== start.slice(0, 10)
      ? fmtRange(start, end)
      : d
  const t = fmtTime(start)
  if (!end) return `${d}, ${t}`
  const sameDay = end.slice(0, 10) === start.slice(0, 10)
  return sameDay
    ? `${d}, ${t} – ${fmtTime(end)}`
    : `${d}, ${t} – ${fmtDate(end)} ${fmtTime(end)}`
}

/* Live state for events and broadcasts: `now` is passed in so server and client agree. */
export const isLive = (
  start: string,
  end: string | null | undefined,
  now: number,
) =>
  Date.parse(start) <= now &&
  (end ? Date.parse(end) > now : now - Date.parse(start) < 3 * 3_600_000)
export const nextUpcoming = <T extends { start: string }>(
  items: Array<T>,
  now: number,
) =>
  items
    .filter((i) => Date.parse(i.start) > now)
    .sort((a, b) => a.start.localeCompare(b.start))[0]

export const todayIso = () => new Date().toISOString().slice(0, 10)

/* Month grid: 6 rows × 7 columns starting on Monday, with ISO date strings. Cells outside the
   month carry `outside: true`. `month` is 1-based. */
export type MonthCell = {
  iso: string
  day: number
  outside: boolean
  today: boolean
}
export function monthGrid(
  year: number,
  month: number,
): Array<Array<MonthCell>> {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const offset = (first.getUTCDay() + 6) % 7 // Monday = 0
  const start = new Date(Date.UTC(year, month - 1, 1 - offset))
  const today = todayIso()
  const rows: Array<Array<MonthCell>> = []
  for (let r = 0; r < 6; r++) {
    const row: Array<MonthCell> = []
    for (let c = 0; c < 7; c++) {
      const d = new Date(start.getTime() + (r * 7 + c) * 86_400_000)
      const iso = d.toISOString().slice(0, 10)
      row.push({
        iso,
        day: d.getUTCDate(),
        outside: d.getUTCMonth() !== month - 1,
        today: iso === today,
      })
    }
    rows.push(row)
    // stop after the month ends on a row boundary
    if (row[6]?.outside && r >= 3) break
  }
  return rows
}
export const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/* "2026-09" → { year, month, from, to } where [from, to) covers the month in UTC. */
export function parseMonth(value?: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? '')
  const now = new Date()
  const year = m ? Number(m[1]) : now.getUTCFullYear()
  const month = m ? Number(m[2]) : now.getUTCMonth() + 1
  const from = new Date(Date.UTC(year, month - 1, 1)).toISOString()
  const to = new Date(Date.UTC(year, month, 1)).toISOString()
  const key = (y: number, mo: number) => `${y}-${String(mo).padStart(2, '0')}`
  return {
    year,
    month,
    from,
    to,
    key: key(year, month),
    prev: month === 1 ? key(year - 1, 12) : key(year, month - 1),
    next: month === 12 ? key(year + 1, 1) : key(year, month + 1),
  }
}

/* iCalendar export. One VEVENT per event; all-day events use DATE values. */
export function toIcs(
  events: Array<{
    slug: string
    title: string | null
    start: string
    end?: string | null
    allDay?: boolean | null
    location?: string | null
    description?: string
  }>,
  opts: { name: string; origin: string },
) {
  const esc = (s: string) =>
    s
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n')
  const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const dateOnly = (iso: string) => iso.slice(0, 10).replace(/-/g, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${esc(opts.name)}//events//EN`,
    `X-WR-CALNAME:${esc(opts.name)}`,
  ]
  for (const e of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${e.slug}@${new URL(opts.origin).host}`)
    lines.push(`DTSTAMP:${stamp(new Date().toISOString())}`)
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(e.start)}`)
      const end = e.end ? new Date(e.end) : new Date(e.start)
      end.setUTCDate(end.getUTCDate() + 1) // DTEND is exclusive
      lines.push(`DTEND;VALUE=DATE:${dateOnly(end.toISOString())}`)
    } else {
      lines.push(`DTSTART:${stamp(new Date(e.start).toISOString())}`)
      if (e.end) lines.push(`DTEND:${stamp(new Date(e.end).toISOString())}`)
    }
    lines.push(`SUMMARY:${esc(e.title ?? '')}`)
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`)
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`)
    lines.push(`URL:${opts.origin}/events/${e.slug}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  // fold lines longer than 75 octets per RFC 5545
  return (
    lines.map((l) => l.replace(/(.{74})(?=.)/g, '$1\r\n ')).join('\r\n') +
    '\r\n'
  )
}
