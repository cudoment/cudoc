import { useMDXComponents as getThemeComponents } from "nextra-theme-docs"
import { cudocComponents } from "cudoc-nextra/components"

const themeComponents = getThemeComponents()

export function useMDXComponents(components) {
  return {
    ...themeComponents,
    ...cudocComponents,
    ...components,
  }
}
