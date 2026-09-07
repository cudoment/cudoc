import React from "react"
import Link from "@docusaurus/Link"
import Layout from "@theme/Layout"

export default function Home() {
  return (
    <Layout title="cudoc on Docusaurus">
      <main
        style={{ margin: "0 auto", maxWidth: "48rem", padding: "3rem 1.5rem" }}
      >
        <h1>cudoc on Docusaurus</h1>
        <p>
          <Link to="/docs/showcase">Open the showcase document</Link>
        </p>
      </main>
    </Layout>
  )
}
