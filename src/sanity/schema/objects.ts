import { defineField, defineType } from '@sanity/types'
import type { ConditionalPropertyCallback } from '@sanity/types'

export const link = defineType({
  name: 'link',
  title: 'Link',
  type: 'object',
  fields: [
    defineField({
      name: 'label',
      type: 'string',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'href',
      type: 'string',
      validation: (r) => r.required(),
    }),
  ],
})

export const imageWithAlt = defineType({
  name: 'imageWithAlt',
  title: 'Image',
  type: 'image',
  options: { hotspot: true },
  fields: [
    defineField({ name: 'alt', type: 'string', title: 'Alt text' }),
    defineField({
      name: 'caption',
      type: 'array',
      of: [{ type: 'block', styles: [], lists: [] }],
      description: 'Optional per-image caption (galleries, lightboxes).',
    }),
  ],
})

/* A video, map or post from another site, kept as its URL (content imports write these for
   iframes and WordPress embed blocks; the site shows a link). */
export const embed = defineType({
  name: 'embed',
  title: 'Embed',
  type: 'object',
  fields: [
    defineField({
      name: 'url',
      type: 'url',
      validation: (r) => r.required().uri({ scheme: ['http', 'https'] }),
    }),
  ],
  preview: { select: { title: 'url' } },
})

export const richText = defineType({
  name: 'richText',
  title: 'Rich text',
  type: 'array',
  of: [{ type: 'block' }, { type: 'imageWithAlt' }, { type: 'embed' }],
})

/* Written by `pnpm run import` (scripts/import.ts) on every document it creates: where the content
   came from, so a re-import updates it and nothing the old site said is lost. Read-only, and
   hidden on documents that were not imported. */
const importedOnly: ConditionalPropertyCallback = ({ document }) =>
  !document?.sourceUrl
export const importedFields = [
  defineField({
    name: 'sourceUrl',
    title: 'Imported from',
    type: 'url',
    readOnly: true,
    hidden: importedOnly,
    fieldset: 'imported',
  }),
  defineField({
    name: 'sourceId',
    type: 'string',
    readOnly: true,
    hidden: importedOnly,
    fieldset: 'imported',
  }),
  defineField({
    name: 'importedAt',
    type: 'datetime',
    readOnly: true,
    hidden: importedOnly,
    fieldset: 'imported',
  }),
  defineField({
    name: 'sourceMeta',
    title: 'Everything else the old site had (JSON)',
    type: 'text',
    rows: 4,
    readOnly: true,
    hidden: importedOnly,
    fieldset: 'imported',
  }),
]
export const importedFieldset = {
  name: 'imported',
  title: 'Imported',
  options: { collapsible: true, collapsed: true },
}

/* Per-document SEO overrides. Every field is optional; src/lib/seo.ts falls back to the
   document's own title/description/image, then to siteSettings.seo. */
export const seo = defineType({
  name: 'seo',
  title: 'SEO',
  type: 'object',
  options: { collapsible: true, collapsed: true },
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      description:
        'Overrides the page title in the browser tab and search results.',
    }),
    defineField({ name: 'description', type: 'text', rows: 2 }),
    defineField({
      name: 'image',
      type: 'imageWithAlt',
      description: 'Social share image (1200×630 works best).',
    }),
    defineField({
      name: 'noIndex',
      type: 'boolean',
      description: 'Ask search engines not to list this page.',
      initialValue: false,
    }),
  ],
})
