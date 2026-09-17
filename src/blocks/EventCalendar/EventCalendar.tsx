import { fmtEventTime, fmtMonth, fmtTime, weekdays } from '#/lib/dates'
import type { MonthCell } from '#/lib/dates'
import {
  Button,
  Calendar,
  Card,
  Container,
  Eyebrow,
  FilterBar,
  Grid,
  Heading,
  NavLink,
  Section,
  Stack,
  Text,
} from '#/ui'
import type { EventCard, Link } from '#/sanity/types'

export type EventCalendarProps = {
  eyebrow?: string
  heading?: string
  view?: 'list' | 'month' | 'both'
  limit?: number
  showFilters?: boolean
  cta?: Link
  /* resolved */
  month?: {
    year: number
    month: number
    key: string
    prev: string
    next: string
    weeks: Array<Array<MonthCell>>
  }
  inMonth?: Array<EventCard>
  upcoming?: Array<EventCard>
  series?: Array<{ slug: string; title: string }>
  values?: Record<string, string | undefined>
  path?: string
}

export function EventCalendar({
  eyebrow,
  heading,
  view = 'both',
  showFilters = true,
  cta,
  month,
  inMonth = [],
  upcoming = [],
  series = [],
  values = {},
  path = '/events',
}: EventCalendarProps) {
  const qs = (m: string) =>
    `${path}?month=${m}${values.series ? `&series=${values.series}` : ''}`
  const days: Record<
    string,
    Array<{ href: string; title: string; time?: string }>
  > = {}
  for (const e of inMonth) {
    const iso = e.start.slice(0, 10)
    ;(days[iso] ??= []).push({
      href: `/events/${e.slug}`,
      title: e.title,
      time: e.allDay ? undefined : fmtTime(e.start),
    })
  }
  return (
    <Section>
      <Container>
        <Stack gap="lg">
          {(eyebrow || heading) && (
            <Stack gap="sm" className="max-w-2xl">
              {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
              {heading && <Heading level={2}>{heading}</Heading>}
            </Stack>
          )}
          {showFilters && series.length > 0 && (
            <FilterBar
              action={path}
              values={{ series: values.series }}
              filters={[
                {
                  name: 'series',
                  label: 'Series',
                  options: series.map((s) => ({
                    value: s.slug,
                    label: s.title,
                  })),
                },
              ]}
            />
          )}
          {view !== 'list' && month && (
            <Stack gap="sm">
              <div className="flex items-center justify-between">
                <NavLink href={qs(month.prev)}>← Previous</NavLink>
                <Heading level={3}>{fmtMonth(month.year, month.month)}</Heading>
                <NavLink href={qs(month.next)}>Next →</NavLink>
              </div>
              <Calendar weeks={month.weeks} weekdays={weekdays} days={days} />
            </Stack>
          )}
          {view !== 'month' && (
            <Stack gap="md">
              {view === 'both' && <Heading level={3}>Upcoming</Heading>}
              {upcoming.length ? (
                <Grid columns={3}>
                  {upcoming.map((e) => (
                    <Card
                      key={e._id}
                      href={`/events/${e.slug}`}
                      title={e.title}
                      image={e.image}
                      badge={e.series?.title}
                      meta={fmtEventTime(e.start, e.end, e.allDay)}
                      excerpt={[e.location, e.price]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  ))}
                </Grid>
              ) : (
                <Text muted>No upcoming events.</Text>
              )}
            </Stack>
          )}
          <div className="flex flex-wrap gap-4">
            {cta && (
              <Button href={cta.href} variant="secondary">
                {cta.label}
              </Button>
            )}
            <NavLink
              href={`/ics/events${values.series ? `?series=${values.series}` : ''}`}
              className="py-3"
            >
              Subscribe (iCal)
            </NavLink>
          </div>
        </Stack>
      </Container>
    </Section>
  )
}
