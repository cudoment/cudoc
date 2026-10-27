import "@cudoment/cudoc/styles.css"
import "./globals.css"
import Link from "next/link"

export const metadata = {
  title: "cudoc on Next.js",
  description: "The cudoc showcase document rendered through @next/mdx.",
}

/** Which release drew this page, and where its sources and guide are. */
const demo = JSON.parse(process.env.CUDOC_DEMO)

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="demo">
          <Link href="/">{demo.title}</Link>
          <nav>
            <Link href="/portable">Portable documents</Link>
            <Link href="/reference">Reference</Link>
            {demo.links.map((link) => (
              <a href={link.url} key={link.url}>
                {link.text}
              </a>
            ))}
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
