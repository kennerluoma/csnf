/* Image with the asset's lqip + size for blur-up and aspect (src/ui Image). Use for any image field,
   in queries and block projections: the explicit projection also keeps the result serialisable
   (the raw schema type carries `media?: unknown`). Lives apart from queries.ts so block schemas can
   import it without an import cycle. */
export const img = (field: string, alias = field) =>
  `"${alias}": ${field}{ _type, asset, alt, caption, hotspot, crop, "meta": asset->metadata{ lqip, "width": dimensions.width, "height": dimensions.height } }`
/* Rich text with its image and embed blocks projected explicitly, like `img()`: the raw image type
   carries `media?: unknown`, which a server function cannot promise to serialise. */
export const rich = (field: string, alias = field) =>
  `"${alias}": ${field}[]{ _type == "block" => { ... }, _type == "imageWithAlt" => { _type, _key, asset, alt }, _type == "embed" => { _type, _key, url } }`
