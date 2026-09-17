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
import type { Resolved } from '#/blocks/resolvers'

export type PostListProps = Resolved<'postList'>

export function PostList({
  eyebrow,
  heading,
  columns,
  cta,
  data: { items },
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
            <Grid columns={columns ?? 3}>
              {items.map((p) => (
                <Card
                  key={p._id}
                  href={`/news/${p.slug}`}
                  title={p.title}
                  image={p.image}
                  aspect="16/9"
                  meta={p.date ? fmtDate(p.date) : undefined}
                  excerpt={p.excerpt}
                />
              ))}
            </Grid>
          ) : (
            <Text muted>No posts yet.</Text>
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
