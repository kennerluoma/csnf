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
  fields: [defineField({ name: 'alt', type: 'string', title: 'Alt text' })],
})

export const richText = defineType({
  name: 'richText',
  title: 'Rich text',
  type: 'array',
  of: [{ type: 'block' }],
})
