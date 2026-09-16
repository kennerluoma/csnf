/* Primitives. The ONLY place raw Tailwind utilities live. Blocks compose these. */
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react'
import { PortableText } from '@portabletext/react'
import type { PortableTextBlock } from '@portabletext/react'
import { urlFor } from '#/sanity/image'
import type { SanityImage } from '#/sanity/types'

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function Section({
  tone = 'default',
  className,
  ...rest
}: ComponentPropsWithoutRef<'section'> & { tone?: 'default' | 'alt' | 'ink' }) {
  return (
    <section
      className={cx(
        'py-section',
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
      className={cx('mx-auto w-full max-w-content px-6', className)}
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
        'font-display font-semibold tracking-tight text-balance',
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
  muted,
  className,
  ...rest
}: ComponentPropsWithoutRef<'p'> & { muted?: boolean }) {
  return (
    <p
      className={cx('text-body', muted && 'text-ink-muted', className)}
      {...rest}
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
    <a
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
    </a>
  )
}

export function Image({
  image,
  width = 1600,
  className,
  sizes,
}: {
  image: SanityImage | null | undefined
  width?: number
  className?: string
  sizes?: string
}) {
  if (!image?.asset) return null
  return (
    <img
      src={urlFor(image).width(width).auto('format').url()}
      alt={image.alt ?? ''}
      sizes={sizes}
      loading="lazy"
      className={cx('h-auto w-full rounded-lg object-cover', className)}
    />
  )
}

export function RichText({
  value,
  className,
}: {
  value: Array<PortableTextBlock> | null | undefined
  className?: string
}) {
  if (!value) return null
  return (
    <div className={cx('prose prose-neutral max-w-none text-body', className)}>
      <PortableText value={value} />
    </div>
  )
}
