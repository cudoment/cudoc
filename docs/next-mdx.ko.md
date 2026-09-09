# Next.js와 MDX

[English](./next-mdx.md) | **한국어** · [전체 가이드](./README.ko.md)

기존 Next.js App Router 애플리케이션에 cudoc을 추가합니다. `@next/mdx`는 Next.js 버전에 맞춥니다.

```sh
npm install @cudoment/cudoc cudoc-remark remark-gfm @next/mdx @mdx-js/loader @mdx-js/react
```

## Markdown 설정

```js
// next.config.mjs
import createMDX from "@next/mdx"

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    format: "detect",
    remarkPlugins: [
      ["remark-gfm"],
      ["cudoc-remark", { host: "next", syntax: {} }],
    ],
  },
})

export default withMDX({
  pageExtensions: ["js", "jsx", "ts", "tsx", "md", "mdx"],
})
```

Turbopack의 worker 경계를 통과하도록 플러그인은 문자열 이름, 옵션은 JSON 직렬화 가능한 값으로 전달합니다. 같은 형태를 webpack에서도 사용할 수 있습니다. 두 문서 형식 모두 기본적으로 cudoc의 표준 HTML 출력을 사용하며, `syntax: {}`는 기본 선택을 명시합니다.

Next.js에는 `mdx-components.jsx`가 필요합니다. 이미 있다면 기존 매핑을 유지합니다.

```jsx
export function useMDXComponents(components) {
  return { ...components }
}
```

루트 layout에서 스타일을 한 번 가져옵니다.

```js
import "@cudoment/cudoc/styles.css"
```

`docs/`에 `.md` 문서를 작성합니다. App Router 페이지에서 문서를 import하거나 애플리케이션의 기존 MDX 라우팅을 사용합니다. 예를 들어 `app/guide/page.jsx`에서 `../../docs/guide.md`를 렌더링할 수 있습니다. cudoc의 `Anchor`, `Badge`, 표 컴포넌트 등록은 필요하지 않습니다.

## 임베드 추가

[수집 설정](./embedding.ko.md#문서-수집-설정)을 적용하고 `host: "next"`를 사용합니다. `cudoc-remark` 뒤에 다음 플러그인을 추가합니다.

```js
;[
  "cudoc-remark/embed",
  {
    sourceRoot: "docs",
    outDir: ".cudoc/documents",
  },
]
```

Next.js 명령 전에 수집을 실행합니다.

```json
{
  "scripts": {
    "collect": "cudoc collect --config cudoc.config.mjs",
    "dev": "npm run collect && next dev",
    "build": "npm run collect && next build"
  }
}
```

플러그인이 런타임과 준비된 데이터의 import를 추가합니다. 작성자가 Markdown에 import를 쓰거나 임베드 컴포넌트를 등록하지 않습니다. `routes`로 수집한 문서 경로를 실제 App Router 경로에 맞춥니다. 예를 들어 `guide.md`를 `/help/guide`에서 렌더링하면 `routes: { guide: "/help/guide" }`를 지정합니다.

범용 수집기는 위의 표준 cudoc/GFM 설정에 대응합니다. 별도 remark 파이프라인을 추가하면 수집과 치환에도 같은 컴파일러를 적용해야 합니다. [컴파일러 캡처 API](./api-reference/adapters.ko.md#컴파일러-캡처)를 참고하세요.

## 선택 사항: MDX 목차

remark 옵션에 `toc: true`를 추가하면 `.mdx` 컴파일 모듈에서 `toc`를 export합니다. 두 단계로 구성된 문서 목차이며 구조와 기본값은 [TOC 레퍼런스](./api-reference/adapters.ko.md#remark)를 참고하세요. 일반 `.md`에는 ESM TOC export를 추가하지 않습니다.

App Router import와 두 번들러 실행은 [Next.js 실행 예제](../examples/README.md)에서 확인할 수 있습니다. 예제의 추가 컴포넌트 fixture는 하위 API 검증용이며, 사용을 시작할 때는 위 설정을 기준으로 합니다.

## 독립 HTML도 함께 생성

위 수집과 준비가 끝나면 `cudoc-html`을 설치하고 같은 결과로 공유용 HTML을 추가 생성할 수 있습니다. 기본 사이트와 출력 경로를 분리합니다.

```sh
npm install cudoc-html
npx cudoc-html build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

`--host-url`과 수집된 문서 경로를 실제 배포 URL에 맞춥니다. `--links relative`는 로컬 탐색, `--links none`은 전체 하이퍼링크 제거입니다. 자산 경로와 사용자 컴포넌트 설정은 [독립 HTML 가이드](./html.ko.md)를 참고하세요.
