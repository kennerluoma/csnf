import { defineField, defineType } from '@sanity/types'

export const richTextBlockSchema = defineType({
  name: 'richTextBlock',
  title: 'Rich text',
  type: 'object',
  fields: [
    defineField({ name: 'heading', type: 'string' }),
    defineField({ name: 'content', type: 'richText' }),
  ],
  preview: {
    select: { title: 'heading' },
    prepare: ({ title }) => ({
      title: title ?? 'Rich text',
      subtitle: 'Rich text',
    }),
  },
})

export const richTextBlockProjection = /* groq */ `_type == "richTextBlock" => { heading, content }`
