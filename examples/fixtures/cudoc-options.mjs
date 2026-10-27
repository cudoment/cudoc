/**
 * The cudoc configuration shared by every example site.
 *
 * The hosts have to be given the same options for their output to be
 * comparable, and every value here is plain JSON so it survives a bundler
 * handing the config to a worker.
 *
 * There is deliberately no default export. Docusaurus loads its config through
 * jiti, which collapses a module that exports the same object twice into one
 * that holds a reference to itself, and the options then fail to serialize.
 */

/**
 * The document options that change what a page says: table notes, the
 * values `(=name)` stands for and the link labels every page shares. Each
 * site and its collector are given the same ones, so a section embedded or
 * exported reads as the page does.
 */
export const portableOptions = {
  syntax: { tableNote: "cudoc" },
  variables: { "sdk.version": "2.8.3" },
  linkReferences: { limits: "reference.md#limits" },
}

export const cudocOptions = {
  ...portableOptions,
  headingMetadata: {
    depths: [2, 3, 4, 5],
    idDelimiters: ["(#", ")"],
    badgeDelimiters: ["(@", ")"],
    anchor: {
      name: "Anchor",
      idAttribute: "id",
      levelAttribute: "headerLevel",
      levelPrefix: "h",
      badgeAttribute: "badge",
    },
  },
  badge: {
    name: "Badge",
    delimiters: ["(@", ")"],
  },
  tableCellList: true,
  tableColumnLayout: [
    {
      section: { depth: 5, titles: ["Requirements"] },
      columnHeaders: ["Prerequisites"],
      split: { minItems: 4, columns: 2 },
    },
  ],
}
