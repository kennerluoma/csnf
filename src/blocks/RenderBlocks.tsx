import { renderBlock } from './registry'
import type { ResolvedBlock } from './resolvers'

/* `data-block` lets `pnpm visual` check that a page rendered the blocks the design mapped to it.
   The wrapper is `contents`, so it has no box and changes no layout. */
export function RenderBlocks({ blocks }: { blocks: Array<ResolvedBlock> }) {
  return (
    <>
      {blocks.map((block) => (
        <div className="contents" data-block={block._type} key={block._key}>
          {renderBlock(block)}
        </div>
      ))}
    </>
  )
}
