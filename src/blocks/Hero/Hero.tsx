import {
  Button,
  Container,
  Eyebrow,
  Heading,
  Image,
  Panel,
  Section,
  Stack,
  Text,
} from '#/ui'
import type { BlockOf } from '#/sanity/types'

export type HeroProps = BlockOf<'hero'>

export function Hero({
  layout,
  eyebrow,
  heading,
  body,
  cta,
  image,
}: HeroProps) {
  if (layout === 'panel') {
    return (
      <Section spacing="gutter">
        <Container>
          <Panel className="flex min-h-hero flex-col items-center justify-center gap-6 p-section text-center">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <Heading level={1}>{heading}</Heading>
            {body && <Text muted>{body}</Text>}
            {cta?.href && <Button href={cta.href}>{cta.label}</Button>}
            <Image image={image} width={1200} className="max-w-2xl" />
          </Panel>
        </Container>
      </Section>
    )
  }
  return (
    <Section>
      <Container className="grid items-center gap-12 lg:grid-cols-2">
        <Stack gap="md">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <Heading level={1}>{heading}</Heading>
          {body && <Text muted>{body}</Text>}
          {cta?.href && <Button href={cta.href}>{cta.label}</Button>}
        </Stack>
        <Image image={image} width={1200} />
      </Container>
    </Section>
  )
}
