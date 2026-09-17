import { createFileRoute, notFound } from '@tanstack/react-router'
import { fmtEventTime } from '#/lib/dates'
import { getEvent } from '#/lib/page'
import { seoMeta } from '#/lib/seo'
import {
  Button,
  Container,
  Eyebrow,
  Heading,
  Image,
  Meta,
  NavLink,
  RichText,
  Section,
  Stack,
} from '#/ui'

export const Route = createFileRoute('/events/$slug')({
  loader: async ({ params }) => {
    const r = await getEvent({ data: params.slug })
    if (!r.doc) throw notFound()
    return { doc: r.doc, settings: r.settings }
  },
  head: ({ loaderData }) =>
    loaderData
      ? {
          meta: seoMeta(
            {
              title: loaderData.doc.title,
              image: loaderData.doc.image,
              seo: loaderData.doc.seo,
              type: 'article',
            },
            loaderData.settings,
          ),
        }
      : {},
  component: EventPage,
})

function EventPage() {
  const { doc } = Route.useLoaderData()
  return (
    <main>
      <Section>
        <Container className="grid gap-12 lg:grid-cols-[2fr_3fr]">
          <Stack gap="md">
            <Image image={doc.image} width={1000} />
            <Meta
              items={[
                ['When', fmtEventTime(doc.start, doc.end, doc.allDay)],
                [
                  'Where',
                  doc.venue
                    ? `${doc.venue.name}${doc.location ? `, ${doc.location}` : ''}`
                    : doc.location,
                ],
                ['Price', doc.price],
                ['Series', doc.series?.title],
              ]}
            />
            <div className="flex flex-wrap gap-4">
              {doc.ticketUrl && <Button href={doc.ticketUrl}>Tickets</Button>}
              <NavLink href={`/ics/event/${doc.slug}`} className="py-3">
                Add to calendar
              </NavLink>
            </div>
          </Stack>
          <Stack gap="md">
            <NavLink href="/events">← Events</NavLink>
            {doc.series && <Eyebrow>{doc.series.title}</Eyebrow>}
            <Heading level={1} size="h2">
              {doc.title}
            </Heading>
            <RichText value={doc.body} />
          </Stack>
        </Container>
      </Section>
    </main>
  )
}
