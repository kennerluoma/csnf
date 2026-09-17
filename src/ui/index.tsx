/* Primitives. The ONLY place raw Tailwind utilities live. Blocks compose these. */
import { Fragment } from 'react'
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react'
import { Link as RouterLink, defaultParseSearch } from '@tanstack/react-router'
import { PortableText } from '@portabletext/react'
import type { PortableTextBlock } from '@portabletext/react'
import { urlFor } from '#/sanity/image'
import type { AnyBlock, SanityImage } from '#/sanity/types'

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

/* Internal paths navigate client-side (router Link, preloaded on hover); everything else is a
   plain anchor. Feeds, API routes and files are not app routes. */
const isInternal = (href: string) =>
  href.startsWith('/') &&
  !/^\/(api|ics)\//.test(href) &&
  !/\.[a-z0-9]{2,4}(\?|#|$)/i.test(href)

/* `to` does not parse a query string, so the href is split first; `?event=…` selection links stay
   router links. Active (aria-current) only on an exact path + search match, never a prefix.
   `resetScroll={false}` keeps the scroll position when selecting an item in place. */
export function A({
  href,
  className,
  children,
  resetScroll,
  ...rest
}: ComponentPropsWithoutRef<'a'> & { href: string; resetScroll?: boolean }) {
  if (isInternal(href)) {
    const url = new URL(href, 'http://local')
    return (
      <RouterLink
        to={url.pathname}
        search={defaultParseSearch(url.search)}
        hash={url.hash.slice(1) || undefined}
        activeOptions={{ exact: true, includeSearch: true }}
        resetScroll={resetScroll}
        className={className}
        {...(rest as object)}
      >
        {children}
      </RouterLink>
    )
  }
  const external = /^https?:\/\//.test(href)
  return (
    <a
      href={href}
      className={className}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      {...rest}
    >
      {children}
    </a>
  )
}

export function Section({
  as: Tag = 'section',
  tone = 'default',
  spacing = 'section',
  className,
  ...rest
}: ComponentPropsWithoutRef<'section'> & {
  as?: 'section' | 'header' | 'footer'
  tone?: 'default' | 'alt' | 'ink'
  spacing?: 'section' | 'gutter' | 'bar'
}) {
  return (
    <Tag
      className={cx(
        { section: 'py-section', gutter: 'py-gutter', bar: 'py-bar' }[spacing],
        tone === 'alt' && 'bg-surface-alt',
        tone === 'ink' && 'bg-ink text-surface',
        className,
      )}
      {...rest}
    />
  )
}

export function Panel({
  tone = 'alt',
  className,
  ...rest
}: ComponentPropsWithoutRef<'div'> & { tone?: 'alt' | 'ink' }) {
  return (
    <div
      className={cx(
        'rounded-md',
        tone === 'alt' && 'bg-surface-alt',
        tone === 'ink' && 'bg-ink text-surface',
        className,
      )}
      {...rest}
    />
  )
}

export function Container({
  className,
  ...rest
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cx('mx-auto w-full max-w-content px-gutter', className)}
      {...rest}
    />
  )
}

export function Stack({
  gap = 'md',
  className,
  ...rest
}: ComponentPropsWithoutRef<'div'> & { gap?: 'sm' | 'md' | 'lg' }) {
  return (
    <div
      className={cx(
        'flex flex-col',
        { sm: 'gap-3', md: 'gap-6', lg: 'gap-10' }[gap],
        className,
      )}
      {...rest}
    />
  )
}

export function Grid({
  columns = 3,
  className,
  ...rest
}: ComponentPropsWithoutRef<'div'> & { columns?: 2 | 3 | 4 }) {
  return (
    <div
      className={cx(
        'grid gap-8',
        {
          2: 'sm:grid-cols-2',
          3: 'sm:grid-cols-2 lg:grid-cols-3',
          4: 'sm:grid-cols-2 lg:grid-cols-4',
        }[columns],
        className,
      )}
      {...rest}
    />
  )
}

export function Heading({
  level = 2,
  size,
  className,
  ...rest
}: ComponentPropsWithoutRef<'h2'> & {
  level?: 1 | 2 | 3
  size?: 'display' | 'h2' | 'h3'
}) {
  const Tag = `h${level}` as ElementType
  const s = size ?? ({ 1: 'display', 2: 'h2', 3: 'h3' } as const)[level]
  return (
    <Tag
      className={cx(
        'font-display text-balance',
        { display: 'text-display', h2: 'text-h2', h3: 'text-h3' }[s],
        className,
      )}
      {...rest}
    />
  )
}

export function Eyebrow({ className, ...rest }: ComponentPropsWithoutRef<'p'>) {
  return (
    <p
      className={cx(
        'text-small font-medium uppercase tracking-widest text-ink-muted',
        className,
      )}
      {...rest}
    />
  )
}

export function Text({
  as: Tag = 'p',
  muted,
  size = 'body',
  weight = 'regular',
  className,
  ...rest
}: ComponentPropsWithoutRef<'p'> & {
  as?: 'p' | 'span'
  muted?: boolean
  size?: 'body' | 'small'
  weight?: 'regular' | 'medium'
}) {
  return (
    <Tag
      className={cx(
        { body: 'text-body', small: 'text-small' }[size],
        weight === 'medium' && 'font-medium',
        muted && 'text-ink-muted',
        className,
      )}
      {...rest}
    />
  )
}

export function NavLink({
  className,
  href = '#',
  ...rest
}: ComponentPropsWithoutRef<'a'>) {
  return (
    <A
      href={href}
      className={cx(
        'text-small text-inherit underline-offset-4 hover:underline',
        className,
      )}
      {...rest}
    />
  )
}

/* The ring mark from the design: a pill with a transparent centre, in currentColor. */
export function Logomark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        'inline-block size-7 shrink-0 rounded-pill border-6 border-current',
        className,
      )}
    />
  )
}

export function Button({
  href,
  variant = 'primary',
  className,
  children,
}: {
  href: string
  variant?: 'primary' | 'secondary'
  className?: string
  children: ReactNode
}) {
  return (
    <A
      href={href}
      className={cx(
        'inline-flex items-center justify-center rounded-md px-5 py-3 text-body font-medium transition-colors',
        variant === 'primary' && 'bg-ink text-surface hover:bg-ink/90',
        variant === 'secondary' &&
          'border border-line bg-surface text-ink hover:bg-surface-alt',
        className,
      )}
    >
      {children}
    </A>
  )
}

export function Image({
  image,
  width = 1600,
  quality = 75,
  className,
  sizes,
  loading = 'lazy',
  onClick,
}: {
  image: SanityImage | null | undefined
  width?: number
  quality?: number
  className?: string
  sizes?: string
  loading?: 'lazy' | 'eager'
  onClick?: () => void
}) {
  if (!image?.asset) return null
  const url = (w: number) =>
    urlFor(image).width(Math.round(w)).quality(quality).auto('format').url()
  const meta = image.meta
  // blur-up: the asset's lqip as background until the real image paints (needs the `img()` projection)
  const style = meta?.lqip
    ? { backgroundImage: `url(${meta.lqip})`, backgroundSize: 'cover' }
    : undefined
  return (
    <img
      src={url(width)}
      srcSet={[width / 2, width, width * 1.5]
        .filter((w) => !meta?.width || w <= meta.width * 1.5)
        .map((w) => `${url(w)} ${Math.round(w)}w`)
        .join(', ')}
      sizes={sizes ?? `(min-width: 1024px) ${Math.min(width, 1600)}px, 100vw`}
      width={meta?.width}
      height={meta?.height}
      alt={image.alt ?? ''}
      loading={loading}
      decoding="async"
      onClick={onClick}
      style={style}
      className={cx('h-auto w-full rounded-lg object-cover', className)}
    />
  )
}

export function RichText({
  value,
  className,
}: {
  value: Array<AnyBlock> | null | undefined
  className?: string
}) {
  if (!value?.length) return null
  return (
    <div className={cx('prose prose-neutral max-w-none text-body', className)}>
      <PortableText value={value as unknown as Array<PortableTextBlock>} />
    </div>
  )
}

/* ---- Template v2 primitives: cards, filters, calendar, forms. One card + one list layout per
   content type lives here so blocks compose them instead of forking. ---- */

export function Badge({
  className,
  ...rest
}: ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-pill border border-line px-2.5 py-0.5 text-small text-ink-muted',
        className,
      )}
      {...rest}
    />
  )
}

/* Image on top, title, meta line, optional excerpt. Used by every index block. */
export function Card({
  href,
  title,
  meta,
  excerpt,
  image,
  aspect = '4/3',
  badge,
}: {
  href: string
  title: string
  meta?: string
  excerpt?: string
  image?: SanityImage
  aspect?: '4/3' | '1/1' | '3/4' | '16/9'
  badge?: string
}) {
  return (
    <A href={href} className="group flex flex-col gap-3 no-underline">
      {image?.asset ? (
        <Image
          image={image}
          width={800}
          className={cx(
            {
              '4/3': 'aspect-[4/3]',
              '1/1': 'aspect-square',
              '3/4': 'aspect-[3/4]',
              '16/9': 'aspect-video',
            }[aspect],
          )}
        />
      ) : (
        <div className="aspect-[4/3] w-full rounded-lg bg-surface-alt" />
      )}
      <Stack gap="sm" className="gap-1">
        {badge && <Badge className="self-start">{badge}</Badge>}
        <Heading level={3} className="group-hover:underline">
          {title}
        </Heading>
        {meta && (
          <Text size="small" muted>
            {meta}
          </Text>
        )}
        {excerpt && <Text muted>{excerpt}</Text>}
      </Stack>
    </A>
  )
}

/* Server-rendered filters: a row of <select>s that submit as GET search params. */
export function FilterBar({
  action,
  filters,
  values,
}: {
  action: string
  filters: Array<{
    name: string
    label: string
    options: Array<{ value: string; label: string }>
  }>
  values: Record<string, string | undefined>
}) {
  const active = filters.filter((f) => f.options.length)
  if (!active.length) return null
  return (
    <form
      method="get"
      action={action}
      className="flex flex-wrap items-end gap-3"
    >
      {active.map((f) => (
        <label
          key={f.name}
          className="flex flex-col gap-1 text-small text-ink-muted"
        >
          {f.label}
          <select
            name={f.name}
            defaultValue={values[f.name] ?? ''}
            className={inputCls}
          >
            <option value="">All</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button
        type="submit"
        className={cx(buttonCls, 'bg-ink text-surface hover:bg-ink/90')}
      >
        Filter
      </button>
      {Object.values(values).some(Boolean) && (
        <NavLink href={action} className="py-3">
          Clear
        </NavLink>
      )}
    </form>
  )
}

const inputCls =
  'w-full rounded-md border border-line bg-surface px-3 py-2.5 text-body text-ink outline-none focus:border-ink'
const buttonCls =
  'inline-flex items-center justify-center rounded-md px-5 py-3 text-body font-medium transition-colors'

export function Field({
  label,
  name,
  type = 'text',
  required,
  rows,
  autoComplete,
}: {
  label: string
  name: string
  type?: 'text' | 'email' | 'tel'
  required?: boolean
  rows?: number
  autoComplete?: string
}) {
  const id = `f-${name}`
  return (
    <label
      htmlFor={id}
      className="flex flex-col gap-1 text-small text-ink-muted"
    >
      {label}
      {required && <span className="sr-only"> (required)</span>}
      {rows ? (
        <textarea
          id={id}
          name={name}
          rows={rows}
          required={required}
          className={inputCls}
        />
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          required={required}
          autoComplete={autoComplete}
          className={inputCls}
        />
      )}
    </label>
  )
}

export function SubmitButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className={cx(
        buttonCls,
        'self-start bg-ink text-surface hover:bg-ink/90',
      )}
    >
      {children}
    </button>
  )
}

/* Month grid. `days` maps ISO date → items to list in that cell. */
export function Calendar({
  weeks,
  weekdays: names,
  days,
}: {
  weeks: Array<
    Array<{ iso: string; day: number; outside: boolean; today: boolean }>
  >
  weekdays: Array<string>
  days: Record<string, Array<{ href: string; title: string; time?: string }>>
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-small">
        <thead>
          <tr>
            {names.map((d) => (
              <th key={d} className="pb-2 text-left font-medium text-ink-muted">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((row, i) => (
            <tr key={i}>
              {row.map((cell) => (
                <td
                  key={cell.iso}
                  className={cx(
                    'h-24 border border-line p-1.5 align-top',
                    cell.outside && 'text-ink-muted/60',
                    cell.today && 'bg-surface-alt',
                  )}
                >
                  <div className={cx('mb-1', cell.today && 'font-medium')}>
                    {cell.day}
                  </div>
                  {(days[cell.iso] ?? []).map((e) => (
                    <A
                      key={e.href}
                      href={e.href}
                      className="block truncate rounded-sm bg-ink px-1.5 py-0.5 text-surface no-underline hover:bg-ink/90"
                      title={e.title}
                    >
                      {e.time && <span className="opacity-70">{e.time} </span>}
                      {e.title}
                    </A>
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* Meta list for detail pages: "Year 2024 · Medium Oil on canvas". */
export function Meta({
  items,
}: {
  items: Array<[string, string | undefined]>
}) {
  const rows = items.filter((i): i is [string, string] => !!i[1])
  if (!rows.length) return null
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-small">
      {rows.map(([k, v]) => (
        <Fragment key={k}>
          <dt className="text-ink-muted">{k}</dt>
          <dd>{v}</dd>
        </Fragment>
      ))}
    </dl>
  )
}
