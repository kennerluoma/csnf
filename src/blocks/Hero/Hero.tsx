import {
  Button,
  Container,
  Eyebrow,
  Heading,
  Image,
  Section,
  Stack,
  Text,
} from '#/ui'
import type { Link, SanityImage } from '#/sanity/types'

export type HeroProps = {
  eyebrow?: string
  heading: string
  body?: string
  cta?: Link
  image?: SanityImage
}

export function Hero({ eyebrow, heading, body, cta, image }: HeroProps) {
  return (
    <Section>
      <Container className="grid items-center gap-12 lg:grid-cols-2">
        <Stack gap="md">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <Heading level={1}>{heading}</Heading>
          {body && <Text muted>{body}</Text>}
          {cta && <Button href={cta.href}>{cta.label}</Button>}
        </Stack>
        <Image image={image} width={1200} />
      </Container>
    </Section>
  )
}
