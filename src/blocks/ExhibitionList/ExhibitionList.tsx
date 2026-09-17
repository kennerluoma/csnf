import { fmtRange } from '#/lib/dates'
import {
  Button,
  Card,
  Container,
  Eyebrow,
  Grid,
  Heading,
  Section,
  Stack,
  Text,
} from '#/ui'
import type { Resolved } from '#/blocks/resolvers'
import type { ExhibitionCard } from '#/sanity/types'

export type ExhibitionListProps = Resolved<'exhibitionList'>

function Group({
  title,
  items,
  badge,
}: {
  title: string
  items: Array<ExhibitionCard>
  badge?: string
}) {
  if (!items.length) return null
  return (
    <Stack gap="md">
      <Heading level={3}>{title}</Heading>
      <Grid columns={3}>
        {items.map((e) => (
          <Card
            key={e._id}
            href={`/exhibitions/${e.slug}`}
            title={e.title}
            image={e.image}
            badge={badge}
            meta={[fmtRange(e.start, e.end), e.venue]
              .filter(Boolean)
              .join(' · ')}
            excerpt={e.artists?.map((a) => a.name).join(', ')}
          />
        ))}
      </Grid>
    </Stack>
  )
}

export function ExhibitionList({
  eyebrow,
  heading,
  mode: modeProp,
  cta,
  data: { groups },
}: ExhibitionListProps) {
  const mode = modeProp ?? 'all'
  const show = {
    current: mode !== 'past',
    upcoming: mode === 'currentUpcoming' || mode === 'all',
    past: mode === 'all' || mode === 'past',
  }
  const empty =
    (!show.current || !groups.current.length) &&
    (!show.upcoming || !groups.upcoming.length) &&
    (!show.past || !groups.past.length)
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
          {show.current && (
            <Group title="Current" items={groups.current} badge="On now" />
          )}
          {show.upcoming && <Group title="Upcoming" items={groups.upcoming} />}
          {show.past && <Group title="Past" items={groups.past} />}
          {empty && <Text muted>No exhibitions to show.</Text>}
          {cta?.href && (
            <Button href={cta.href} variant="secondary" className="self-start">
              {cta.label}
            </Button>
          )}
        </Stack>
      </Container>
    </Section>
  )
}
