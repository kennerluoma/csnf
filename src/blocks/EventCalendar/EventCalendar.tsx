import { fmtEventTime, fmtMonth, fmtTime, weekdays } from '#/lib/dates'
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
import type { Resolved } from '#/blocks/resolvers'

export type EventCalendarProps = Resolved<'eventCalendar'>

export function EventCalendar({
  eyebrow,
  heading,
  view: viewProp,
  showFilters,
  cta,
  data: { month, inMonth, upcoming, series, values, path },
}: EventCalendarProps) {
  const view = viewProp ?? 'both'
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
      title: e.title ?? '',
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
          {showFilters !== false && series.length > 0 && (
            <FilterBar
              action={path}
              values={{ series: values.series }}
              filters={[
                {
                  name: 'series',
                  label: 'Series',
                  options: series.map((s) => ({
                    value: s.slug,
                    label: s.title ?? s.slug,
                  })),
                },
              ]}
            />
          )}
          {view !== 'list' && (
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
            {cta?.href && (
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
