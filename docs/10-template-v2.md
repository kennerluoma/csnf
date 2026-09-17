# 10 · Template v2: the content model most clients need

Today the starter has `page` (blocks), `siteSettings`, three example blocks, and nothing else. Most clients are galleries, studios, theatres, small cultural orgs. The next template version ships the content types they nearly all need, so the agent maps design sections onto them instead of inventing schema.

## Content types

| Type                 | Fields                                                                                                         | Routes                                | Notes                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `page`               | title, slug, blocks[], seo                                                                                     | `/<slug>`                             | as today                                                                                     |
| `artwork` (art post) | title, slug, artist (ref), year, medium, dimensions, images[], description, exhibitions (refs), tags, featured | `/work`, `/work/<slug>`               | index with filters: artist, year, medium, tag                                                |
| `artist`             | name, slug, bio, portrait, links                                                                               | `/artists`, `/artists/<slug>`         | optional for single-artist sites                                                             |
| `exhibition`         | title, slug, start, end, venue, artists (refs), artworks (refs), body, images, pressLinks                      | `/exhibitions`, `/exhibitions/<slug>` | index split into current / upcoming / past, computed from dates                              |
| `event`              | title, slug, start, end, allDay, location, price, ticketUrl, body, image, series (ref), recurrence             | `/events`, `/events/<slug>`           | calendar (month grid + list), filters by series/month; ICS export per event and per calendar |
| `post` (news)        | title, slug, date, body, image, tags                                                                           | `/news`, `/news/<slug>`               | optional                                                                                     |
| `siteSettings`       | + social links, default seo, analyticsId, newsletter { provider, actionUrl }, contactEmail                     |                                       |                                                                                              |

All indexes are blocks too (`artworkGrid`, `exhibitionList`, `eventCalendar`, `postList`) with filter options as fields, so a designer's "Exhibitions" section on the home page maps to a block with `mode: current`.

## Forms

- **Contact form**: a `contactForm` block posting to a Worker route in the same site (`/api/contact`) that emails via Resend or Cloudflare Email Routing and stores the submission in Sanity (`submission` docs, hidden from the client's studio view). Spam: Turnstile.
- **Newsletter signup**: a `newsletterSignup` block that posts to the provider the client already uses. Supported by config in `siteSettings.newsletter`: Mailchimp (form action URL), Buttondown, ConvertKit, Klaviyo. No provider integration on our side beyond the action URL and the field names; it's a form.

## Rendering conventions

- Every list type has one card component and one detail layout in `src/ui`; blocks compose them. The agent restyles cards via tokens and props, never by forking.
- Dates and calendars come from one helper (`src/lib/dates.ts`) and one `Calendar` primitive so event and exhibition views agree.
- Filters are URL search params (`?artist=…&year=…`), server-rendered, so links are shareable.

## Studio

- Desk structure grouped: Content (pages, news), Collection (artists, artworks), Programme (exhibitions, events), Site (settings, submissions).
- Preview URLs per type; Presentation tool wired for click-to-edit.
- Seed content per type so a fresh site isn't empty.

## Migration

Existing client repos generated from v1 keep working; v2 is a new template repo (`agency-starter-v2`) selected at provisioning (`TEMPLATE_REPO`). The extractor and prompt are shared; only `AGENTS.md`'s block inventory grows.

## Not in v2

Webshop (Shopify later, via Storefront API blocks), members/auth, multi-language.
