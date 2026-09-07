# Nextra에서 cudoc 사용하기

[English](./nextra.md) | **한국어**

`cudoc-nextra` 어댑터를 써서, 빈 프로젝트부터 사이트가 빌드될 때까지 cudoc을 설정하는 과정입니다.

어댑터는 Nextra가 헤딩 ID를 부여하기 전에 cudoc 앵커를 반영하고, cudoc이 만드는 컴포넌트를 제공합니다. Nextra 4는 App Router 구조도 특정 형태를 요구하는데, cudoc을 그 구조에 연결해야 하므로 이 가이드에 함께 담았습니다.

아래 내용이 실제로 동작하는 형태는 [`examples/nextra`](../examples/nextra)에 있습니다.

## 설치

```bash
npm install cudoc-nextra nextra@4.6.0 nextra-theme-docs@4.6.0 next@15.5 react react-dom
npm install cudoc
```

`cudoc-remark`와 `cudoc`는 의존성으로 함께 설치됩니다.

설치 명령은 검증한 Nextra와 테마 버전을 지정합니다. [검증한 조합](#검증한-조합)을 참고하십시오.

## 설정

```js
// next.config.mjs
import nextra from "nextra"
import { cudocRemarkPlugins } from "cudoc-nextra"

const cudocOptions = {
  headingMetadata: { depths: [2, 3, 4] },
  badge: true,
  tableCellList: true,
}

const withNextra = nextra({
  mdxOptions: {
    remarkPlugins: cudocRemarkPlugins(cudocOptions),
  },
})

export default withNextra({
  pageExtensions: ["js", "jsx", "md", "mdx"],
})
```

Nextra는 여기에 넘긴 플러그인을 자기 플러그인보다 앞에 놓으며, 이것이 cudoc이 필요로 하는 순서입니다. `remarkHeadings`가 헤딩 ID를 읽기 전에 앵커가 존재해야 하기 때문입니다. Docusaurus와 달리 "앞에 두겠다"고 따로 지정할 목록이 없고, 순서가 이미 맞습니다.

## 컴포넌트 제공

cudoc은 대문자로 시작하는 요소를 만들고 MDX는 하나라도 없으면 렌더링 시점에 오류를 내므로, 이 단계는 건너뛸 수 없습니다.

```jsx
// mdx-components.jsx
import { useMDXComponents as getThemeComponents } from "nextra-theme-docs"
import { cudocComponents } from "cudoc-nextra/components"

const themeComponents = getThemeComponents()

export function useMDXComponents(components) {
  return { ...themeComponents, ...cudocComponents, ...components }
}
```

테마의 컴포넌트를 먼저 두고, 그다음 cudoc의 것을, 마지막으로 호출자가 넘긴 것을 전개합니다. 이렇게 하면 개별 페이지가 컴포넌트 하나를 재정의하더라도 나머지를 잃지 않습니다.

## 앱 구조

Nextra 4는 catch-all 라우트를 통해 문서를 렌더링합니다. 파일 세 개와, 문서를 담는 `content/` 디렉터리가 필요합니다.

```jsx
// app/layout.jsx
import { Footer, Layout, Navbar } from "nextra-theme-docs"
import { Head } from "nextra/components"
import { getPageMap } from "nextra/page-map"
import "nextra-theme-docs/style.css"

export default async function RootLayout({ children }) {
  return (
    <html lang="ko" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          footer={<Footer>Docs</Footer>}
          navbar={<Navbar logo={<b>Docs</b>} />}
          pageMap={await getPageMap()}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
```

```jsx
// app/[[...mdxPath]]/page.jsx
import { generateStaticParamsFor, importPage } from "nextra/pages"
import { useMDXComponents as getMDXComponents } from "../../mdx-components.jsx"

export const generateStaticParams = generateStaticParamsFor("mdxPath")

export async function generateMetadata(props) {
  const params = await props.params
  const { metadata } = await importPage(params.mdxPath)
  return metadata
}

const Wrapper = getMDXComponents().wrapper

export default async function Page(props) {
  const params = await props.params
  const {
    default: MDXContent,
    toc,
    metadata,
  } = await importPage(params.mdxPath)

  return (
    <Wrapper toc={toc} metadata={metadata}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  )
}
```

```jsx
// app/not-found.jsx
import { NotFoundPage } from "nextra-theme-docs"

export default function NotFound() {
  return <NotFoundPage>페이지를 찾을 수 없습니다.</NotFoundPage>
}
```

`app/not-found.jsx`는 장식이 아니라 반드시 필요한 파일입니다. 이 파일이 없으면 `/_not-found`를 사전 렌더링하는 단계에서 빌드가 실패합니다. 그 경로에서도 테마 레이아웃이 렌더링되기 때문입니다.

문서는 `content/`에 두며, 그 경로가 그대로 라우트가 됩니다. `content/showcase.mdx`는 `/showcase`입니다.

## 헤딩 ID

Nextra는 헤딩 텍스트를 slug로 바꾸어 ID를 만듭니다. 그대로 두면 헤딩에는 생성된 ID가, 중첩된 앵커에는 cudoc이 만든 ID가 놓이고, 깊은 링크는 브라우저가 먼저 찾은 쪽으로 이동하게 됩니다.

어댑터는 Nextra가 헤딩을 보기 전에 각 앵커 ID를 헤딩으로 올립니다. Nextra는 `data.hProperties.id`를 입력으로 다시 slug 처리합니다. 헤딩 링크가 작성한 값을 유지하도록 중복되지 않는 소문자 slug ID를 사용하십시오.

```md
## 요청 제한 (#rate-limits)
```

위 문서는 `<h2 id="rate-limits">`로 렌더링됩니다.

다른 방식으로 지정된 ID는 그대로 둡니다. Nextra 자체 문법인 `[#custom-id]`도 여기에 해당합니다. cudoc 앵커가 없는 헤딩은 Nextra가 만든 ID를 그대로 유지합니다.

`promoteHeadingIds: false`를 넘기면 이 복사를 끕니다. 그 경우 두 ID가 더 이상 합의하지 않으며, 어댑터가 제공하는 `Anchor`는 ID를 렌더링하지 않으므로 직접 `Anchor`를 제공하셔야 합니다.

## 컴포넌트 스타일

`cudoc-nextra/components`는 `cudoc-remark/components`를 재수출합니다. Docusaurus 어댑터와 순수 Next.js 사이트도 같은 구현을 쓰기 때문에 세 호스트가 같은 마크업을 렌더링합니다. 구현은 의도적으로 단순합니다. 배지는 `span.cudoc-badge`이고, 표 열 구성은 테마의 기존 HTML 표 컴포넌트를 사용합니다. 레이아웃에서 import 하는 스타일시트에 스타일을 지정하시면 됩니다.

```css
/* app/cudoc.css */
.cudoc-badge {
  border: 1px solid currentColor;
  border-radius: 0.5rem;
  font-size: 0.75em;
  margin-left: 0.35rem;
  opacity: 0.8;
  padding: 0.05rem 0.4rem;
  vertical-align: middle;
}
```

컴포넌트 자체를 교체하시려면 `mdx-components.jsx`에서 `cudocComponents` 뒤에 두시면 됩니다.

`Anchor`는 배지만 렌더링합니다. ID는 이미 헤딩에 있고 헤딩 링크는 테마가 직접 그리므로, 둘 중 어느 것을 다시 렌더링해도 중복이 되기 때문입니다.

## AST 내보내기

```js
import exportAst from "cudoc/embed"

const withNextra = nextra({
  mdxOptions: {
    remarkPlugins: [
      ...cudocRemarkPlugins(cudocOptions),
      [exportAst, { sourceRoot: "content", outDir: ".cudoc/ast" }],
    ],
  },
})
```

여기에서 `sourceRoot`는 Nextra가 문서를 두는 위치에 맞추어 `content`입니다. `content/showcase.mdx`는 `.cudoc/ast/showcase.json`이 됩니다.

`outDir`은 `.gitignore`에 추가하시기 바랍니다.

## 확인

```bash
npx next build
```

빌드가 성공했다는 것만으로 판단하지 마시고 생성된 HTML을 읽어 보시기 바랍니다. 플러그인이 빠져 있어도 페이지는 정상적으로 렌더링되며, 문법만 원문 그대로 화면에 남습니다.

```bash
grep -o '<h2[^>]*id="[^"]*"' .next/server/app/showcase.html
ls .cudoc/ast
```

## 검증한 조합

Nextra 4.6.0, `nextra-theme-docs` 4.6.0, Next.js 15.5.25, React 19.2, Node 20 이상입니다.

예제는 Nextra와 테마를 4.6.0으로 고정하며, 다른 버전은 별도의 빌드·렌더링 검증이 필요합니다. 4.6.1에서는 zod 4와 함께 쓸 때 docs 테마의 `Layout`이 자기 props를 거부했습니다. cudoc을 쓰지 않은 순정 Nextra 사이트에서도 마찬가지였으므로, 버전을 올리실 때에는 다른 무엇보다 빌드로 먼저 확인하시는 편이 좋습니다.

## 문제 해결

**`Invalid input: expected nonoptional, received undefined → at children`** — 테마가 자기 props를 거부하는 상황이며, cudoc의 변환과는 무관합니다. Nextra 4.6.1을 zod 4와 함께 쓸 때 나타났습니다. Nextra와 테마가 빌드에 성공한 적이 있는 버전 조합인지 확인하시기 바랍니다.

**`/_not-found`를 사전 렌더링하다가 빌드가 실패합니다** — `app/not-found.jsx`가 없습니다.

**`Expected component 'Anchor' to be defined`** — `mdx-components.jsx`에 `cudocComponents`가 없거나, catch-all 라우트가 수정하신 파일이 아닌 다른 컴포넌트 파일을 import 하고 있습니다.

**문법이 원문 그대로 화면에 나옵니다** — 플러그인이 `mdxOptions.remarkPlugins`까지 전달되지 않고 있습니다. 캐시 문제를 배제하기 위해 `.next/`를 삭제한 뒤, 설정이 감싼 객체를 실제로 내보내고 있는지 확인하시기 바랍니다.
