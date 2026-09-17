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
import type { Resolved } from '#/blocks/resolvers'

export type ArtworkGridProps = Resolved<'artworkGrid'>

export function ArtworkGrid({
  eyebrow,
  heading,
  intro,
  columns,
  showFilters,
  cta,
  data: { items, filters, values, path },
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
          {showFilters !== false && filters && (
            <FilterBar
              action={path}
              values={values}
              filters={[
                {
                  name: 'artist',
                  label: 'Artist',
                  options: filters.artists.map((a) => ({
                    value: a.slug,
                    label: a.name ?? a.slug,
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
            <Grid columns={columns ?? 3}>
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
