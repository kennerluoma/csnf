/* POST /api/contact — stores a `submission` document and emails siteSettings.contactEmail.
   Plain HTML form target (no JS needed); redirects back to the page with ?sent=1 or ?error=…
   Worker secrets: SANITY_WRITE_TOKEN (required to store), RESEND_API_KEY (optional, email),
   TURNSTILE_SECRET_KEY (optional, spam check; pair with TURNSTILE_SITE_KEY as a plain var). */
import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@sanity/client'
import { apiVersion, dataset, projectId } from '#/sanity/env'
import { client } from '#/sanity/client'
import { siteSettingsQuery } from '#/sanity/queries'
import type { SiteSettings } from '#/sanity/types'

const redirect = (page: string, q: string) =>
  new Response(null, {
    status: 303,
    headers: {
      location: `${page}${page.includes('?') ? '&' : '?'}${q}#contact`,
    },
  })

export const Route = createFileRoute('/api/contact')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData()
        const f = (k: string) => {
          const v = form.get(k)
          return typeof v === 'string' ? v.trim() : ''
        }
        const page = f('page').startsWith('/') ? f('page') : '/'
        if (f('website')) return redirect(page, 'sent=1') // honeypot: pretend success
        const name = f('name')
        const email = f('email')
        const subject = f('subject')
        const message = f('message')
        if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !message)
          return redirect(page, 'error=invalid')

        const turnstileSecret = process.env.TURNSTILE_SECRET_KEY
        if (turnstileSecret) {
          const res = await fetch(
            'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                secret: turnstileSecret,
                response: f('cf-turnstile-response'),
              }),
            },
          )
          const j = (await res.json()) as { success?: boolean }
          if (!j.success) return redirect(page, 'error=invalid')
        }

        try {
          const token = process.env.SANITY_WRITE_TOKEN
          if (token) {
            const write = createClient({
              projectId,
              dataset,
              apiVersion,
              token,
              useCdn: false,
            })
            await write.create({
              _type: 'submission',
              name,
              email,
              subject,
              message,
              page,
              receivedAt: new Date().toISOString(),
            })
          } else
            console.warn(
              'contact: SANITY_WRITE_TOKEN not set; submission not stored',
            )

          const settings = await client.fetch<SiteSettings | null>(
            siteSettingsQuery,
          )
          const to = settings?.contactEmail
          const key = process.env.RESEND_API_KEY
          if (to && key) {
            const res = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                authorization: `Bearer ${key}`,
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                from: process.env.CONTACT_FROM || 'onboarding@resend.dev',
                to: [to],
                reply_to: email,
                subject: `[${settings.siteName ?? 'Site'}] ${subject || 'Contact form'} — ${name}`,
                text: `${message}\n\n— ${name} <${email}>\nSent from ${page}`,
              }),
            })
            if (!res.ok)
              console.error(
                'contact: resend failed',
                res.status,
                await res.text(),
              )
          } else if (!key)
            console.warn('contact: RESEND_API_KEY not set; email skipped')
          return redirect(page, 'sent=1')
        } catch (e) {
          console.error('contact: failed', e)
          return redirect(page, 'error=failed')
        }
      },
    },
  },
})
