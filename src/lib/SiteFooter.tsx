import { Brand } from './Brand'
import { Container, Section, Text } from '#/ui'
import type { SiteSettings } from '#/sanity/types'

export function SiteFooter({ settings }: { settings: SiteSettings | null }) {
  return (
    <Section as="footer" tone="ink">
      <Container className="flex flex-col items-center justify-center gap-12">
        <Brand settings={settings} direction="column" />
        {settings?.footerText && (
          <Text size="small">{settings.footerText}</Text>
        )}
      </Container>
    </Section>
  )
}
