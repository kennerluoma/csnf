import { createFileRoute, notFound } from '@tanstack/react-router'
import { getArtist } from '#/lib/page'
import { hasHref } from '#/sanity/guards'
import { seoMeta } from '#/lib/seo'
import {
  Card,
  Container,
  Grid,
  Heading,
  Image,
  NavLink,
  RichText,
  Section,
  Stack,
} from '#/ui'

export const Route = createFileRoute('/artists/$slug')({
  loader: async ({ params }) => {
    const r = await getArtist({ data: params.slug })
    if (!r.doc) throw notFound()
    return { doc: r.doc, settings: r.settings }
  },
  head: ({ loaderData }) =>
    loaderData
      ? {
          meta: seoMeta(
            {
              title: loaderData.doc.name,
              image: loaderData.doc.portrait,
              seo: loaderData.doc.seo,
            },
            loaderData.settings,
          ),
        }
      : {},
  component: ArtistPage,
})

function ArtistPage() {
  const { doc } = Route.useLoaderData()
  return (
    <main>
      <Section>
        <Container className="grid gap-12 lg:grid-cols-[1fr_2fr]">
          <Stack gap="md">
            <Image image={doc.portrait} width={800} className="aspect-[3/4]" />
            {doc.links?.filter(hasHref).map((l) => (
              <NavLink key={l.href} href={l.href}>
                {l.label}
              </NavLink>
            ))}
          </Stack>
          <Stack gap="md">
            <Heading level={1} size="h2">
              {doc.name}
            </Heading>
            <RichText value={doc.bio} />
          </Stack>
        </Container>
      </Section>
      {doc.artworks.length ? (
        <Section tone="alt">
          <Container>
            <Stack gap="lg">
              <Heading level={2}>Work</Heading>
              <Grid columns={3}>
                {doc.artworks.map((a) => (
                  <Card
                    key={a._id}
                    href={`/work/${a.slug}`}
                    title={a.title}
                    image={a.image}
                    meta={[a.year, a.medium].filter(Boolean).join(' · ')}
                  />
                ))}
              </Grid>
            </Stack>
          </Container>
        </Section>
      ) : null}
    </main>
  )
}
