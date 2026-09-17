/* The Worker a project serves until its design is built and merged (design/mapping.json on main).
   Deployed under the SITE's Worker name by .github/workflows/deploy.yml, so the Worker exists from
   provisioning onwards and PR previews (`wrangler versions upload`) always have something to
   attach to — without ever showing a visitor the unbuilt template.

   Kept out of src/ on purpose: it is never bundled into the site. */
export default {
  fetch() {
    return new Response('This site is being built.\n', {
      status: 503,
      headers: {
        'Retry-After': '3600',
        'X-Robots-Tag': 'noindex, nofollow',
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  },
}
