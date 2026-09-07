/**
 * Default implementations of the elements cudoc emits.
 *
 * MDX destructures every capitalized element from the provided components and
 * throws at render time when one is missing, so every name a configured feature
 * can produce needs an implementation somewhere. These are that somewhere:
 * plain markup with class names to hook styles onto, meant to be restyled or
 * replaced rather than used as they are.
 *
 * Only two, because only two are genuinely new. A table laid out by a
 * `tableColumnLayout` rule is rebuilt as `table`/`td` and friends, which every
 * host already maps, so it needs nothing from here. A rule that names
 * capitalized components instead is naming ones the site already has.
 *
 * They live next to the plugin that emits the elements so that the hosts do not
 * each carry a copy and drift apart, and they are compiled to plain JavaScript
 * rather than shipped as JSX because not every host transpiles inside
 * `node_modules` — Docusaurus, for one, does not.
 *
 * `Anchor` renders only the badge. Its id belongs on the heading, put there by
 * `cudoc-remark/heading-ids`: two elements sharing one id make a deep link
 * ambiguous, and most hosts draw their own heading link. A site that does not
 * promote heading ids has to supply an `Anchor` that renders the id itself.
 */

import type { ReactNode } from "react"

export function Badge({ children }: { children?: ReactNode }) {
  return <span className="cudoc-badge">{children}</span>
}

export function Anchor({ badge }: { badge?: string }) {
  return badge ? <Badge>{badge}</Badge> : null
}

/** Every element a configured cudoc feature can emit, ready to spread. */
export const cudocComponents = {
  Anchor,
  Badge,
}
