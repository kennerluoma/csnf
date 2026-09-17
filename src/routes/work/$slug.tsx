import { createFileRoute, notFound } from '@tanstack/react-router'
import { getArtwork } from '#/lib/page'
import { seoMeta } from '#/lib/seo'
import {
  A,
  Card,
  Container,
  Grid,
  Heading,
  Image,
  Meta,
  NavLink,
  RichText,
  Section,
  Stack,
  Text,
} from '#/ui'

export const Route = createFileRoute('/work/$slug')({
  loader: async ({ params }) => {
    const r = await getArtwork({ data: params.slug })
    if (!r.found) throw notFound()
    return r
  },
  head: ({ loaderData }) =>
    loaderData
      ? {
          meta: seoMeta(
            {
              title: loaderData.doc.title,
              image: loaderData.doc.images?.[0],
              seo: loaderData.doc.seo,
              type: 'article',
            },
            loaderData.settings,
          ),
        }
      : {},
  component: ArtworkPage,
})

function ArtworkPage() {
  const { doc } = Route.useLoaderData()
  const [first, ...rest] = doc.images ?? []
  return (
    <main>
      <Section>
        <Container className="grid gap-12 lg:grid-cols-[3fr_2fr]">
          <Stack gap="md">
            <Image image={first} width={1600} />
            {rest.length > 0 && (
              <Grid columns={2}>
                {rest.map((img, i) => (
                  <Image key={i} image={img} width={800} />
                ))}
              </Grid>
            )}
          </Stack>
          <Stack gap="md">
            <NavLink href="/work">← Work</NavLink>
            <Heading level={1} size="h2">
              {doc.title}
            </Heading>
            {doc.artist && (
              <Text muted>
                <A href={`/artists/${doc.artist.slug}`}>{doc.artist.name}</A>
              </Text>
            )}
            <Meta
              items={[
                ['Year', doc.year ? String(doc.year) : undefined],
                ['Medium', doc.medium],
                ['Dimensions', doc.dimensions],
              ]}
            />
            <RichText value={doc.description} />
            {doc.exhibitions?.length ? (
              <Stack gap="sm">
                <Text size="small" muted>
                  Shown in
                </Text>
                {doc.exhibitions.map((e) => (
                  <NavLink key={e._id} href={`/exhibitions/${e.slug}`}>
                    {e.title}
                  </NavLink>
                ))}
              </Stack>
            ) : null}
          </Stack>
        </Container>
      </Section>
    </main>
  )
}

// keep Card imported for related-works variants the agent may add
void Card
