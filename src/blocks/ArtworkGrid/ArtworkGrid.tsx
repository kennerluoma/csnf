import {
  Button,
  Card,
  Container,
  Eyebrow,
  FilterBar,
  Grid,
  Heading,
  Section,
  Stack,
  Text,
} from '#/ui'
import type { ArtworkCard, Link } from '#/sanity/types'

export type ArtworkGridProps = {
  eyebrow?: string
  heading?: string
  intro?: string
  columns?: 2 | 3 | 4
  limit?: number
  featuredOnly?: boolean
  collection?: string
  showFilters?: boolean
  cta?: Link
  /* resolved server-side (src/blocks/resolvers.ts) */
  items?: Array<ArtworkCard>
  filters?: {
    artists: Array<{ slug: string; name: string }>
    years: Array<number>
    media: Array<string>
    collections: Array<string>
    tags: Array<string>
  }
  values?: Record<string, string | undefined>
  path?: string
}

export function ArtworkGrid({
  eyebrow,
  heading,
  intro,
  columns = 3,
  showFilters = true,
  cta,
  items = [],
  filters,
  values = {},
  path = '/work',
}: ArtworkGridProps) {
  return (
    <Section>
      <Container>
        <Stack gap="lg">
          {(eyebrow || heading || intro) && (
            <Stack gap="sm" className="max-w-2xl">
              {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
              {heading && <Heading level={2}>{heading}</Heading>}
              {intro && <Text muted>{intro}</Text>}
            </Stack>
          )}
          {showFilters && filters && (
            <FilterBar
              action={path}
              values={values}
              filters={[
                {
                  name: 'artist',
                  label: 'Artist',
                  options: filters.artists.map((a) => ({
                    value: a.slug,
                    label: a.name,
                  })),
                },
                {
                  name: 'year',
                  label: 'Year',
                  options: filters.years.map((y) => ({
                    value: String(y),
                    label: String(y),
                  })),
                },
                {
                  name: 'collection',
                  label: 'Collection',
                  options: filters.collections.map((c) => ({
                    value: c,
                    label: c,
                  })),
                },
                {
                  name: 'medium',
                  label: 'Medium',
                  options: filters.media.map((m) => ({ value: m, label: m })),
                },
                {
                  name: 'tag',
                  label: 'Tag',
                  options: filters.tags.map((t) => ({ value: t, label: t })),
                },
              ]}
            />
          )}
          {items.length ? (
            <Grid columns={columns}>
              {items.map((a) => (
                <Card
                  key={a._id}
                  href={`/work/${a.slug}`}
                  title={a.title}
                  image={a.image}
                  meta={[a.artist?.name, a.year, a.medium]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ))}
            </Grid>
          ) : (
            <Text muted>No artworks yet.</Text>
          )}
          {cta && (
            <Button href={cta.href} variant="secondary" className="self-start">
              {cta.label}
            </Button>
          )}
        </Stack>
      </Container>
    </Section>
  )
}
