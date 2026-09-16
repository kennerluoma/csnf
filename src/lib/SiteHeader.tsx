import { Brand } from './Brand'
import { Container, NavLink, Section } from '#/ui'
import type { SiteSettings } from '#/sanity/types'

export function SiteHeader({ settings }: { settings: SiteSettings | null }) {
  return (
    <Section as="header" tone="alt" spacing="bar">
      <Container className="flex items-center justify-between gap-6">
        <Brand settings={settings} />
        {!!settings?.nav?.length && (
          <nav className="flex items-center gap-5">
            {settings.nav.map((item) => (
              <NavLink key={item.href} href={item.href}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </Container>
    </Section>
  )
}
