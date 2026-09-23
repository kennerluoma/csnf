import { defineField, defineType } from '@sanity/types'
import { rich } from '../../sanity/img'

export const richTextBlockSchema = defineType({
  name: 'richTextBlock',
  title: 'Rich text',
  type: 'object',
  description:
    'Portable Text with an optional heading. Use for prose sections: about text, statements, long copy.',
  fields: [
    defineField({ name: 'heading', type: 'string' }),
    defineField({ name: 'content', type: 'richText' }),
  ],
  preview: {
    select: { title: 'heading' },
    prepare: ({ title }: { title?: string }) => ({
      title: title ?? 'Rich text',
      subtitle: 'Rich text',
    }),
  },
})

export const richTextBlockProjection = /* groq */ `_type == "richTextBlock" => { heading, ${rich('content')} }`
