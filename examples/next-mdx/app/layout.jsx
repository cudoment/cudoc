import "@cudoment/cudoc/styles.css"
import "./globals.css"

export const metadata = {
  title: "cudoc on Next.js",
  description: "The cudoc showcase document rendered through @next/mdx.",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
