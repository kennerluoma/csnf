import { createFileRoute, notFound } from '@tanstack/react-router'
import { fmtRange } from '#/lib/dates'
import { getExhibition } from '#/lib/page'
import { seoMeta } from '#/lib/seo'
import {
  Card,
  Container,
  Eyebrow,
  Grid,
  Heading,
  Image,
  NavLink,
  RichText,
  Section,
  Stack,
  Text,
} from '#/ui'

export const Route = createFileRoute('/exhibitions/$slug')({
  loader: async ({ params }) => {
    const r = await getExhibition({ data: params.slug })
    if (!r.found) throw notFound()
    return r
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
  component: ExhibitionPage,
})

function ExhibitionPage() {
  const { doc } = Route.useLoaderData()
  return (
    <main>
      <Section>
        <Container>
          <Stack gap="lg">
            <Stack gap="sm" className="max-w-3xl">
              <Eyebrow>
                {[fmtRange(doc.start, doc.end), doc.venue]
                  .filter(Boolean)
                  .join(' · ')}
              </Eyebrow>
              <Heading level={1}>{doc.title}</Heading>
              {doc.artists?.length ? (
                <Text muted>
                  {doc.artists.map((a, i) => (
                    <span key={a._id}>
                      {i > 0 && ', '}
                      <a href={`/artists/${a.slug}`}>{a.name}</a>
                    </span>
                  ))}
                </Text>
              ) : null}
            </Stack>
            <Image image={doc.image} width={1600} className="aspect-[16/9]" />
            <div className="max-w-3xl">
              <RichText value={doc.body} />
            </div>
            {doc.images?.length ? (
              <Grid columns={2}>
                {doc.images.map((img, i) => (
                  <Image key={i} image={img} width={1000} />
                ))}
              </Grid>
            ) : null}
            {doc.pressLinks?.length ? (
              <Stack gap="sm">
                <Text size="small" muted>
                  Press
                </Text>
                {doc.pressLinks.map((l) => (
                  <NavLink key={l.href} href={l.href}>
                    {l.label}
                  </NavLink>
                ))}
              </Stack>
            ) : null}
          </Stack>
        </Container>
      </Section>
      {doc.artworks?.length ? (
        <Section tone="alt">
          <Container>
            <Stack gap="lg">
              <Heading level={2}>Works in the exhibition</Heading>
              <Grid columns={3}>
                {doc.artworks.map((a) => (
                  <Card
                    key={a._id}
                    href={`/work/${a.slug}`}
                    title={a.title}
                    image={a.image}
                    meta={[a.artist?.name, a.year].filter(Boolean).join(' · ')}
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
