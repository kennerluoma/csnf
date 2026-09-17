import { createFileRoute, notFound } from '@tanstack/react-router'
import { fmtDate } from '#/lib/dates'
import { getPost } from '#/lib/page'
import { seoMeta } from '#/lib/seo'
import {
  A,
  Badge,
  Container,
  Eyebrow,
  Heading,
  Image,
  NavLink,
  RichText,
  Section,
  Stack,
} from '#/ui'

export const Route = createFileRoute('/news/$slug')({
  loader: async ({ params }) => {
    const r = await getPost({ data: params.slug })
    if (!r.doc) throw notFound()
    return { doc: r.doc, settings: r.settings }
  },
  head: ({ loaderData }) =>
    loaderData
      ? {
          meta: seoMeta(
            {
              title: loaderData.doc.title,
              description: loaderData.doc.excerpt,
              image: loaderData.doc.image,
              seo: loaderData.doc.seo,
              type: 'article',
            },
            loaderData.settings,
          ),
        }
      : {},
  component: PostPage,
})

function PostPage() {
  const { doc } = Route.useLoaderData()
  return (
    <main>
      <Section>
        <Container className="max-w-3xl">
          <Stack gap="md">
            <NavLink href="/news">← News</NavLink>
            {doc.date && <Eyebrow>{fmtDate(doc.date)}</Eyebrow>}
            <Heading level={1}>{doc.title}</Heading>
            <Image image={doc.image} width={1400} className="aspect-[16/9]" />
            <RichText value={doc.body} />
            {doc.tags?.length ? (
              <div className="flex flex-wrap gap-2">
                {doc.tags.map((t) => (
                  <A
                    key={t}
                    href={`/news?tag=${encodeURIComponent(t)}`}
                    className="no-underline"
                  >
                    <Badge>{t}</Badge>
                  </A>
                ))}
              </div>
            ) : null}
          </Stack>
        </Container>
      </Section>
    </main>
  )
}
