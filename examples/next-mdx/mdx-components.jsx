import { Badge, cudocComponents } from "cudoc-remark/components"

/**
 * A heading permalink, which Next.js has no equivalent of.
 *
 * The default `Anchor` renders only the badge, because Docusaurus and Nextra
 * draw their own heading links. `@next/mdx` draws none, so this one adds it.
 * The id is not rendered here: `cudoc-remark/heading-ids` has already put it on
 * the heading, and two elements sharing one id make a deep link ambiguous.
 */
function Anchor({ id, headerLevel, badge }) {
  return (
    <>
      {badge ? <Badge>{badge}</Badge> : null}
      <a
        aria-label="Permalink to this section"
        className="cudoc-anchor"
        data-header-level={headerLevel}
        href={`#${id}`}
      >
        #
      </a>
    </>
  )
}

/**
 * cudoc emits capitalized elements, and MDX throws at render time when one is
 * missing, so every name a configured feature can produce has to resolve here.
 *
 * The defaults come from cudoc-remark, the same set the Docusaurus and Nextra
 * adapters use, so all three examples render the same markup. Anything after
 * the spread replaces one of them.
 */
export function useMDXComponents(components) {
  return {
    ...components,
    ...cudocComponents,
    Anchor,
  }
}
