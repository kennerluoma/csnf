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
import type { BlockOf } from '#/sanity/types'

export type CardGridProps = BlockOf<'cardGrid'>

export function CardGrid({ eyebrow, heading, columns, cards }: CardGridProps) {
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
          <Grid columns={columns ?? 3}>
            {(cards ?? []).map((card) => (
              <Stack key={card._key} gap="sm">
                <Image
                  image={card.image}
                  width={800}
                  className="aspect-[4/3]"
                />
                <Heading level={3}>
                  {card.link?.href ? (
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
