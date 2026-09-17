import { defineField, defineType } from '@sanity/types'

export const newsletterSignupSchema = defineType({
  name: 'newsletterSignup',
  title: 'Newsletter signup',
  type: 'object',
  description:
    'Email field posting straight to the client\'s provider (siteSettings.newsletter: Mailchimp, Buttondown, ConvertKit, Klaviyo). Use for any "Subscribe" / "Stay in touch" section with a single email input.',
  fields: [
    defineField({ name: 'eyebrow', type: 'string' }),
    defineField({ name: 'heading', type: 'string' }),
    defineField({ name: 'body', type: 'text', rows: 2 }),
    defineField({
      name: 'buttonLabel',
      type: 'string',
      initialValue: 'Subscribe',
    }),
    defineField({
      name: 'tone',
      type: 'string',
      options: { list: ['default', 'alt', 'ink'], layout: 'radio' },
      initialValue: 'alt',
    }),
  ],
  preview: {
    select: { title: 'heading' },
    prepare: ({ title }) => ({
      title: title ?? 'Newsletter',
      subtitle: 'Newsletter signup',
    }),
  },
})

export const newsletterSignupProjection = /* groq */ `_type == "newsletterSignup" => { eyebrow, heading, body, buttonLabel, tone }`
