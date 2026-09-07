import Link from "next/link"

export default function Home() {
  return (
    <>
      <h1>cudoc on Next.js</h1>
      <p>
        <Link href="/showcase">Open the showcase document</Link>
      </p>
      <p>
        <Link href="/embed">
          See a piece of it embedded from the exported AST
        </Link>
      </p>
    </>
  )
}
