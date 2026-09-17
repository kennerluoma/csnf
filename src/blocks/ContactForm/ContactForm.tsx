import {
  Container,
  Eyebrow,
  Field,
  Heading,
  RichText,
  Section,
  Stack,
  SubmitButton,
  Text,
} from '#/ui'
import type { RichTextValue } from '#/sanity/types'

export type ContactFormProps = {
  eyebrow?: string
  heading?: string
  intro?: string
  showSubject?: boolean
  buttonLabel?: string
  successMessage?: string
  aside?: RichTextValue
  /* resolved */
  sent?: boolean
  error?: string
  path?: string
  turnstileSiteKey?: string
}

export function ContactForm({
  eyebrow,
  heading,
  intro,
  showSubject = true,
  buttonLabel = 'Send message',
  successMessage = 'Thanks, your message has been sent.',
  aside,
  sent,
  error,
  path = '/',
  turnstileSiteKey,
}: ContactFormProps) {
  return (
    <Section id="contact">
      <Container className="grid gap-12 lg:grid-cols-2">
        <Stack gap="md">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          {heading && <Heading level={2}>{heading}</Heading>}
          {intro && <Text muted>{intro}</Text>}
          <RichText value={aside} />
        </Stack>
        {sent ? (
          <Text className="self-start rounded-md bg-surface-alt p-6">
            {successMessage}
          </Text>
        ) : (
          <form
            method="post"
            action="/api/contact"
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="page" value={path} />
            {/* honeypot: real people never fill this */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              className="hidden"
            />
            <Field label="Name" name="name" required autoComplete="name" />
            <Field
              label="Email"
              name="email"
              type="email"
              required
              autoComplete="email"
            />
            {showSubject && <Field label="Subject" name="subject" />}
            <Field label="Message" name="message" rows={6} required />
            {turnstileSiteKey && (
              <>
                <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
                <script
                  src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                  async
                  defer
                />
              </>
            )}
            {error && (
              <Text size="small" className="text-red-700">
                {error}
              </Text>
            )}
            <SubmitButton>{buttonLabel}</SubmitButton>
          </form>
        )}
      </Container>
    </Section>
  )
}
