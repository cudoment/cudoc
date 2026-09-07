import { Footer, Layout, Navbar } from "nextra-theme-docs"
import { Head } from "nextra/components"
import { getPageMap } from "nextra/page-map"
import "nextra-theme-docs/style.css"
import "./cudoc.css"

export const metadata = {
  title: "cudoc on Nextra",
  description: "The cudoc showcase document rendered by Nextra.",
}

export default async function RootLayout({ children }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          docsRepositoryBase="https://github.com/cudoment/cudoc"
          footer={<Footer>cudoc example</Footer>}
          navbar={<Navbar logo={<b>cudoc on Nextra</b>} />}
          pageMap={await getPageMap()}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
