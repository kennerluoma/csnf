import {
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

export type ArtistListProps = Resolved<'artistList'>

export function ArtistList({
  eyebrow,
  heading,
  columns,
  data: { items },
}: ArtistListProps) {
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
          {items.length ? (
            <Grid columns={columns ?? 4}>
              {items.map((a) => (
                <Card
                  key={a._id}
                  href={`/artists/${a.slug}`}
                  title={a.name}
                  image={a.portrait}
                  aspect="3/4"
                />
              ))}
            </Grid>
          ) : (
            <Text muted>No artists yet.</Text>
          )}
        </Stack>
      </Container>
    </Section>
  )
}
