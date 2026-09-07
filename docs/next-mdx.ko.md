# Next.js에서 cudoc 사용하기

[English](./next-mdx.md) | **한국어**

`@next/mdx`를 쓰는 Next.js App Router 프로젝트에서, 빈 프로젝트부터 화면이 나오는 페이지까지 cudoc을 설정하는 과정입니다.

Next.js용 어댑터 패키지는 없습니다. `@next/mdx`가 remark 플러그인을 그대로 넘겨 주기 때문에 `cudoc-remark`를 직접 연결하면 됩니다. 이 가이드가 더하는 것은 틀리기 쉬운 두 가지입니다. 플러그인을 어떤 형태로 지정해야 하는지, 그리고 어떤 컴포넌트를 제공해야 하는지입니다.

아래 내용이 실제로 동작하는 형태는 [`examples/next-mdx`](../examples/next-mdx)에 있습니다.

## 설치

```bash
npm install cudoc-remark @next/mdx @mdx-js/loader @mdx-js/react remark-gfm
npm install cudoc
```

`cudoc`는 의존성으로 함께 설치됩니다.

## 설정

```js
// next.config.mjs
import createMDX from "@next/mdx"

const cudocOptions = {
  headingMetadata: { depths: [2, 3, 4] },
  badge: true,
  tableCellList: true,
}

const withMDX = createMDX({
  options: {
    remarkPlugins: [
      ["remark-gfm"],
      ["cudoc-remark", cudocOptions],
      ["cudoc-remark/heading-ids", {}],
    ],
  },
})

export default withMDX({
  pageExtensions: ["js", "jsx", "md", "mdx"],
})
```

### 플러그인을 문자열로 지정하는 이유

Turbopack은 MDX 설정을 워커에 넘기는데, 워커는 함수를 받을 수 없습니다. `[cudocPrepare, options]` 형태는 webpack에서는 동작하고 Turbopack에서는 실패하는데, 이런 차이는 누군가 번들러를 바꾸었을 때에야 드러납니다.

문자열로 지정하면 양쪽 모두에서 이 문제가 생기지 않습니다. Turbopack에서는 워커가 패키지를 직접 해석하고, webpack에서는 `@next/mdx`의 로더가 `require.resolve`로 해석한 뒤 `@mdx-js/loader`에 넘깁니다. 한 가지 형태로 두 번들러를 모두 지원하며, 예제를 `next build --turbopack`과 `next build --webpack`으로 각각 빌드해서 확인한 사실입니다.

옵션 값이 순수 JSON이어야 하는 이유도 같은 제약에서 나옵니다. 함수와 정규식을 쓸 수 없습니다. cudoc의 옵션은 이 조건에 맞추어 설계되어 있어서, 문법은 구분자 쌍으로, 조건은 선언적 셀렉터로 기술합니다.

### 헤딩 ID

`cudoc-remark/heading-ids`는 각 앵커 ID를 헤딩 자체에 올립니다. 그래서 `## 요청 제한 (#rate-limits)`은 `<h2 id="rate-limits">`로 렌더링되며, ID가 중첩된 요소에 남지 않습니다.

`@next/mdx`는 자체 헤딩 ID를 만들지 않습니다. 기본 `Anchor`는 배지만 렌더링하므로 이 플러그인이 필요합니다. 직접 제공하는 헤딩 또는 앵커 컴포넌트가 ID를 출력할 때만 생략할 수 있습니다.

이 플러그인은 `cudoc-remark` 뒤에 있어야 합니다. 읽어들일 앵커를 만드는 것이 `cudoc-remark`이기 때문입니다.

### 목차

`@next/mdx`에서 목차를 내보내려면 `cudocOptions`에 `toc`를 추가합니다.

```js
const cudocOptions = {
  toc: {
    titleDepth: 1, // false를 주면 제목을 수집하지 않습니다
    depths: [2, 3],
    exportName: "toc",
  },
}
```

기본으로 꺼져 있으며, `toc: true`를 주면 위 기본값을 사용합니다. MDX 문서의 named export인 `toc`를 import하여 페이지에서 렌더링할 수 있습니다. `title`과 `headings`를 담고 있으며, 각 헤딩에는 `id`, `text`, `children`이 있습니다.

## 컴포넌트 제공

cudoc은 대문자로 시작하는 요소를 만듭니다. MDX는 이 요소들을 사용자가 제공한 컴포넌트에서 찾고 하나라도 없으면 렌더링 시점에 오류를 내므로, 이 단계는 건너뛸 수 없습니다.

헤딩 메타데이터에는 `Anchor`, 배지에는 `Badge`가 필요하며 `cudoc-remark/components`가 둘을 제공합니다. 표 열 구성은 호스트의 기존 HTML 표 매핑을 사용합니다. 규칙에서 대문자 컴포넌트 이름을 직접 지정한 경우에만 추가 구현이 필요합니다.

```jsx
// mdx-components.jsx
import { cudocComponents } from "cudoc-remark/components"

export function useMDXComponents(components) {
  return { ...components, ...cudocComponents }
}
```

`@next/mdx`가 이 파일을 MDX 프로바이더로 자동 연결합니다. 파일 위치는 프로젝트 루트 또는 `src/` 아래입니다. 이 파일이 없으면 대문자 요소가 컴포넌트 조회가 아니라 스코프 변수로 컴파일되고, 페이지는 `Expected component 'Anchor' to be defined` 오류로 실패합니다.

기본 구현은 스타일을 붙일 자리를 만들어 둔 마크업입니다. `span.cudoc-badge`처럼 클래스 이름이 붙어 있고, 그대로 쓰기보다 스타일을 입히거나 교체하는 것을 전제로 합니다. 특정 컴포넌트만 교체하려면 전개 뒤에 두면 됩니다.

```jsx
import { Badge, cudocComponents } from "cudoc-remark/components"

function Anchor({ id, headerLevel, badge }) {
  return (
    <>
      {badge ? <Badge>{badge}</Badge> : null}
      <a
        aria-label="Permalink to this section"
        className="cudoc-anchor"
        data-header-level={headerLevel}
        href={`#${id}`}
      >
        #
      </a>
    </>
  )
}

export function useMDXComponents(components) {
  return { ...components, ...cudocComponents, Anchor }
}
```

이 교체는 Next.js에서는 해 둘 만합니다. 기본 `Anchor`는 배지만 렌더링하는데, Docusaurus와 Nextra는 헤딩 링크를 자체적으로 그리기 때문입니다. `@next/mdx`는 그리지 않으므로, 직접 추가하지 않으면 헤딩으로 연결되는 링크가 없습니다.

여기에서 `id` 속성을 렌더링하지 않는다는 점에 유의하시기 바랍니다. `cudoc-remark/heading-ids`가 이미 헤딩에 ID를 올려 두었고, 같은 ID를 가진 요소가 둘이면 깊은 링크가 어느 쪽을 가리키는지 불분명해지기 때문입니다. 그 플러그인을 빼신다면 `id={id}`를 다시 넣어야 합니다.

## 문서 추가

`pageExtensions`에 `mdx`가 포함되어 있으면 `app/` 아래의 `.mdx` 파일이 그대로 라우트가 됩니다.

```
app/showcase/page.mdx
```

문서를 라우팅 트리 밖에 두려면, 즉 `cudoc/embed`가 소스 루트를 기준으로 AST를 내보내게 하려면, 문서를 별도 디렉터리에 두고 import 하면 됩니다.

```jsx
// app/showcase/page.jsx
import Showcase from "../../docs/showcase.mdx"

export default function ShowcasePage() {
  return <Showcase />
}
```

## AST 내보내기

```js
remarkPlugins: [
  ["remark-gfm"],
  ["cudoc-remark", cudocOptions],
  ["cudoc-remark/heading-ids", {}],
  ["cudoc/embed", { sourceRoot: "docs", outDir: ".cudoc/ast" }],
]
```

`sourceRoot` 아래의 모든 문서가 `outDir` 아래의 대응하는 경로에 저장됩니다. `docs/showcase.mdx`는 `.cudoc/ast/showcase.json`이 됩니다. `sourceRoot` 밖의 문서는 건너뜁니다.

이 플러그인이 마지막에 있으므로, 저장되는 트리는 다른 모든 변환이 끝난 뒤의 트리입니다.

저장한 AST는 `loadAst`로 다시 읽습니다. 읽는 시점에 스키마 버전을 검증합니다.

```js
import { loadAst } from "cudoc/embed"

const document = loadAst("showcase", { outDir: ".cudoc/ast" })
```

`outDir`은 `.gitignore`에 추가하시기 바랍니다. 컴파일할 때마다 다시 생성되는 빌드 산출물입니다.

서버 컴포넌트에서 파일 경로를 알고 있다면 `cudoc/node/load-ast-file`의 `loadAstFile`을 사용하십시오. 빌드용 경로 계산 모듈을 읽기 경로에서 제외하고, 필요한 JSON을 파일 추적에 포함할 수 있습니다. 예제의 `/embed` 라우트 설정은 다음과 같습니다.

```js
export default withMDX({
  outputFileTracingIncludes: { "/embed": ["./.cudoc/ast/showcase.json"] },
})
```

라우트와 데이터 경로는 사이트에 맞게 지정하십시오. AST를 읽기 전에 원본 MDX가 컴파일되어야 한다는 조건은 그대로입니다. [끼워 넣기 가이드](./embedding.ko.md)를 참고하십시오.

## 확인

```bash
npx next build
```

빌드가 성공했다는 것만으로 플러그인이 실행되었다고 판단하지 마시고, 생성된 HTML을 직접 확인하시기 바랍니다. 플러그인이 빠져 있어도 페이지는 정상적으로 렌더링되며, 문법만 원문 그대로 화면에 남습니다.

```bash
grep -o 'id="[a-z-]*"' .next/server/app/showcase.html
ls .cudoc/ast
```

remark 플러그인은 MDX가 실제로 컴파일될 때만 실행됩니다. 빌드 캐시가 낡은 상태라면 화면과 내보낸 AST가 모두 이전 버전에 머문 채로 빌드가 성공했다고 보고될 수 있습니다.

## 검증한 조합

Next.js 16.3, `@next/mdx` 16.3, React 19.2, Node 20 이상이며, Turbopack과 webpack 양쪽에서 확인했습니다.

## 문제 해결

**`Expected component 'Anchor' to be defined`** — 컴포넌트가 MDX에 전달되지 않고 있습니다. `mdx-components.jsx`가 프로젝트 루트나 `src/` 아래에 있는지, 그리고 `useMDXComponents`라는 이름으로 내보내고 있는지 확인하시기 바랍니다.

**문법이 원문 그대로 화면에 나옵니다** (`## 요청 제한 (#rate-limits)`에서 괄호가 그대로 보입니다) — 플러그인이 실행되지 않았습니다. `remarkPlugins`에 적은 패키지 이름이 프로젝트 루트에서 해석되는지 확인하고, 캐시 문제를 배제하기 위해 `.next/`를 삭제해 보시기 바랍니다.

**Turbopack에서 설정 직렬화 관련 오류가 발생합니다** — 옵션 안에 JSON이 아닌 값이 있습니다. 함수나 정규식을 찾아서 구분자 쌍과 셀렉터로 바꾸시기 바랍니다.

**같은 ID를 가진 요소가 둘입니다** — `cudoc-remark/heading-ids`와 `id={id}`를 렌더링하는 `Anchor`를 함께 쓰고 있습니다. 둘 중 하나만 남기시기 바랍니다.
