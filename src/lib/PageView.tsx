import { RenderBlocks } from '#/blocks/RenderBlocks'
import { Container, Heading, Section, Text } from '#/ui'
import type { ResolvedPage } from '#/lib/page'

export function PageView({ page }: { page: ResolvedPage | null }) {
  if (!page) {
    return (
      <Section>
        <Container>
          <Heading level={1}>No content yet</Heading>
          <Text muted>
            Create a <code>page</code> document with slug <code>home</code> in
            the Sanity studio (<code>pnpm dev:studio</code>), or run{' '}
            <code>pnpm seed</code>.
          </Text>
        </Container>
      </Section>
    )
  }
  return (
    <main>
      <RenderBlocks blocks={page.blocks} />
    </main>
  )
}
