import { defineField, defineType } from '@sanity/types'

export const postListSchema = defineType({
  name: 'postList',
  title: 'News list',
  type: 'object',
  description:
    'Index of news post documents, newest first, optionally filtered by tag (?tag=). Use for "News", "Journal" or "Blog" sections.',
  fields: [
    defineField({ name: 'eyebrow', type: 'string' }),
    defineField({ name: 'heading', type: 'string' }),
    defineField({ name: 'limit', type: 'number', initialValue: 6 }),
    defineField({
      name: 'columns',
      type: 'number',
      options: { list: [2, 3] },
      initialValue: 3,
    }),
    defineField({ name: 'cta', type: 'link' }),
  ],
  preview: {
    select: { title: 'heading' },
    prepare: ({ title }: { title?: string }) => ({
      title: title ?? 'News',
      subtitle: 'News list',
    }),
  },
})

export const postListProjection = /* groq */ `_type == "postList" => { eyebrow, heading, limit, columns, cta }`
