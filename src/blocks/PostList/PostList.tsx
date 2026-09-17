import { fmtDate } from '#/lib/dates'
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
import type { Link, PostCard } from '#/sanity/types'

export type PostListProps = {
  eyebrow?: string
  heading?: string
  limit?: number
  columns?: 2 | 3
  cta?: Link
  /* resolved */
  items?: Array<PostCard>
}

export function PostList({
  eyebrow,
  heading,
  columns = 3,
  cta,
  items = [],
}: PostListProps) {
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
              {items.map((p) => (
                <Card
                  key={p._id}
                  href={`/news/${p.slug}`}
                  title={p.title}
                  image={p.image}
                  aspect="16/9"
                  meta={fmtDate(p.date)}
                  excerpt={p.excerpt}
                />
              ))}
            </Grid>
          ) : (
            <Text muted>No posts yet.</Text>
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
