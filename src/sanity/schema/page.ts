import { defineField, defineType } from '@sanity/types'
import { blockSchemaNames } from '../../blocks/schemas'

export const page = defineType({
  name: 'page',
  title: 'Page',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      description: 'Use "home" for the front page.',
      options: { source: 'title' },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'blocks',
      title: 'Sections',
      type: 'array',
      of: blockSchemaNames.map((name) => ({ type: name })),
    }),
  ],
  preview: { select: { title: 'title', subtitle: 'slug.current' } },
})
