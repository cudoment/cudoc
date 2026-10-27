import "@cudoment/cudoc/styles.css"
import { Footer, Layout, Navbar } from "nextra-theme-docs"
import { Banner, Head } from "nextra/components"
import { getPageMap } from "nextra/page-map"
import "nextra-theme-docs/style.css"
import "./cudoc.css"

/** Which release drew this page, and where its sources and guide are. */
const demo = JSON.parse(process.env.CUDOC_DEMO)

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
          banner={
            <Banner dismissible={false}>
              {demo.notice}:{" "}
              {demo.links.map((link, index) => (
                <span key={link.url}>
                  {index ? " · " : null}
                  <a href={link.url}>{link.text}</a>
                </span>
              ))}
            </Banner>
          }
          docsRepositoryBase="https://github.com/cudoment/cudoc"
          // The pages are copies of shared fixtures, which no page here can
          // edit, and questions belong in the repository's issue forms.
          editLink={null}
          feedback={{ content: null }}
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
