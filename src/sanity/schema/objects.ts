import { defineField, defineType } from '@sanity/types'

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

export const richText = defineType({
  name: 'richText',
  title: 'Rich text',
  type: 'array',
  of: [{ type: 'block' }],
})

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
