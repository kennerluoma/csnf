import { Image, Logomark, Text } from '#/ui'
import type { SiteSettings } from '#/sanity/types'

/* Logo + wordmark. Uses the uploaded logo when set, otherwise the ring mark from the design. */
export function Brand({
  settings,
  direction = 'row',
}: {
  settings: SiteSettings | null
  direction?: 'row' | 'column'
}) {
  const name = settings?.siteName
  return (
    <a
      href="/"
      className={
        direction === 'row'
          ? 'flex items-center gap-3'
          : 'flex flex-col items-center gap-1'
      }
    >
      {settings?.logo?.asset ? (
        <Image image={settings.logo} width={56} className="size-7" />
      ) : (
        <Logomark />
      )}
      {name && (
        <Text as="span" size="small" weight="medium">
          {name}
        </Text>
      )}
    </a>
  )
}
