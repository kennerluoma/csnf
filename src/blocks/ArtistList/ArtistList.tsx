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
import type { ArtistRef, SanityImage } from '#/sanity/types'

export type ArtistListProps = {
  eyebrow?: string
  heading?: string
  columns?: 2 | 3 | 4
  /* resolved */
  items?: Array<ArtistRef & { portrait?: SanityImage }>
}

export function ArtistList({
  eyebrow,
  heading,
  columns = 4,
  items = [],
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
            <Grid columns={columns}>
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
