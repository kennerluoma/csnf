import {
  Container,
  Eyebrow,
  Field,
  Heading,
  Section,
  Stack,
  SubmitButton,
  Text,
} from '#/ui'
import type { Newsletter } from '#/sanity/types'

/* Field name each provider expects for the email address. */
const EMAIL_FIELD: Record<NonNullable<Newsletter['provider']>, string> = {
  mailchimp: 'EMAIL',
  buttondown: 'email',
  convertkit: 'email_address',
  klaviyo: 'email',
  generic: 'email',
}

export type NewsletterSignupProps = {
  eyebrow?: string
  heading?: string
  body?: string
  buttonLabel?: string
  tone?: 'default' | 'alt' | 'ink'
  /* resolved from siteSettings */
  newsletter?: Newsletter
}

export function NewsletterSignup({
  eyebrow,
  heading,
  body,
  buttonLabel = 'Subscribe',
  tone = 'alt',
  newsletter,
}: NewsletterSignupProps) {
  const action = newsletter?.actionUrl
  const field = EMAIL_FIELD[newsletter?.provider ?? 'generic']
  return (
    <Section tone={tone} spacing="section">
      <Container className="grid items-center gap-8 lg:grid-cols-2">
        <Stack gap="sm">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          {heading && <Heading level={2}>{heading}</Heading>}
          {body && <Text muted={tone !== 'ink'}>{body}</Text>}
        </Stack>
        {action ? (
          <form
            method="post"
            action={action}
            target="_blank"
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <Field
                label="Email"
                name={field}
                type="email"
                required
                autoComplete="email"
              />
            </div>
            {newsletter.provider === 'mailchimp' && (
              <input
                type="text"
                name="b_honeypot"
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
              />
            )}
            <SubmitButton>{buttonLabel}</SubmitButton>
          </form>
        ) : (
          <Text size="small" muted={tone !== 'ink'}>
            Set the newsletter provider and form URL in Site settings to enable
            this form.
          </Text>
        )}
      </Container>
    </Section>
  )
}
