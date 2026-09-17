import { Brand } from './Brand'
import { Container, NavLink, Section, Text } from '#/ui'
import { hasHref } from '#/sanity/guards'
import type { SiteSettings } from '#/sanity/types'

export function SiteFooter({ settings }: { settings: SiteSettings | null }) {
  return (
    <Section as="footer" tone="ink">
      <Container className="flex flex-col items-center justify-center gap-12">
        <Brand settings={settings} direction="column" />
        {!!settings?.social?.length && (
          <nav className="flex flex-wrap items-center justify-center gap-5">
            {settings.social.filter(hasHref).map((l) => (
              <NavLink key={l.href} href={l.href}>
                {l.label}
              </NavLink>
            ))}
          </nav>
        )}
        {settings?.footerText && (
          <Text size="small">{settings.footerText}</Text>
        )}
      </Container>
    </Section>
  )
}
