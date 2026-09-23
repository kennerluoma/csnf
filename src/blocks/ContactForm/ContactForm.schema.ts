import { defineField, defineType } from '@sanity/types'
import { rich } from '../../sanity/img'

export const contactFormSchema = defineType({
  name: 'contactForm',
  title: 'Contact form',
  type: 'object',
  description:
    'Name / email / subject / message form posting to /api/contact (stored in Sanity as `submission`, emailed to siteSettings.contactEmail). Use for any "Contact", "Get in touch" or "Enquire" section that has inputs.',
  fields: [
    defineField({ name: 'eyebrow', type: 'string' }),
    defineField({ name: 'heading', type: 'string' }),
    defineField({ name: 'intro', type: 'text', rows: 3 }),
    defineField({ name: 'showSubject', type: 'boolean', initialValue: true }),
    defineField({
      name: 'buttonLabel',
      type: 'string',
      initialValue: 'Send message',
    }),
    defineField({
      name: 'successMessage',
      type: 'string',
      initialValue: 'Thanks, your message has been sent.',
    }),
    defineField({
      name: 'aside',
      title: 'Details beside the form',
      type: 'richText',
      description:
        'Address, opening hours, phone — anything shown next to the form.',
    }),
  ],
  preview: {
    select: { title: 'heading' },
    prepare: ({ title }: { title?: string }) => ({
      title: title ?? 'Contact form',
      subtitle: 'Contact form',
    }),
  },
})

export const contactFormProjection = /* groq */ `_type == "contactForm" => { eyebrow, heading, intro, showSubject, buttonLabel, successMessage, ${rich('aside')} }`
