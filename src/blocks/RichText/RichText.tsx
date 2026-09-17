import { Container, Heading, RichText as Prose, Section, Stack } from '#/ui'
import type { BlockOf } from '#/sanity/types'

export type RichTextBlockProps = BlockOf<'richTextBlock'>

export function RichTextBlock({ heading, content }: RichTextBlockProps) {
  return (
    <Section>
      <Container className="max-w-3xl">
        <Stack gap="md">
          {heading && <Heading level={2}>{heading}</Heading>}
          <Prose value={content} />
        </Stack>
      </Container>
    </Section>
  )
}
