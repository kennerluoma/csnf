import {
  A,
  Container,
  Eyebrow,
  Grid,
  Heading,
  Image,
  Section,
  Stack,
  Text,
} from '#/ui'
import type { Link, SanityImage } from '#/sanity/types'

export type CardGridProps = {
  eyebrow?: string
  heading?: string
  columns?: 2 | 3 | 4
  cards?: Array<{
    _key: string
    title: string
    body?: string
    image?: SanityImage
    link?: Link
  }>
}

export function CardGrid({
  eyebrow,
  heading,
  columns = 3,
  cards = [],
}: CardGridProps) {
  return (
    <Section tone="alt">
      <Container>
        <Stack gap="lg">
          {(eyebrow || heading) && (
            <Stack gap="sm" className="max-w-2xl">
              {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
              {heading && <Heading level={2}>{heading}</Heading>}
            </Stack>
          )}
          <Grid columns={columns}>
            {cards.map((card) => (
              <Stack key={card._key} gap="sm">
                <Image
                  image={card.image}
                  width={800}
                  className="aspect-[4/3]"
                />
                <Heading level={3}>
                  {card.link ? (
                    <A href={card.link.href}>{card.title}</A>
                  ) : (
                    card.title
                  )}
                </Heading>
                {card.body && <Text muted>{card.body}</Text>}
              </Stack>
            ))}
          </Grid>
        </Stack>
      </Container>
    </Section>
  )
}
