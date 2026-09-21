# Next.js

[English](./next.md) | **한국어** · [전체 가이드](./README.ko.md)

순서대로 따라가시면 됩니다. 1–4단계는 Markdown 문법 확장을 켭니다. 5–6단계는 문서 임베딩을 더합니다. 한 문서가 다른 문서를 재사용할 수 있게 해 주는 기능입니다. 7단계는 선택 사항입니다.

이미 App Router를 쓰고 계신 애플리케이션을 전제로 합니다. `@next/mdx` 버전은 Next.js 버전에 맞추십시오.

`@next/mdx`는 로더이지 형식 제한이 아닙니다. 아래 설정은 `.md`와 `.mdx`를 함께 컴파일하며, `.md`만 쓰시는 구성도 그대로 지원합니다. → [`.md`와 `.mdx` 선택](./README.ko.md#md와-mdx-선택)

## 1단계 — 설치

```sh
npm install @cudoment/cudoc cudoc-remark remark-gfm @next/mdx @mdx-js/loader @mdx-js/react
```

## 2단계 — remark 플러그인 등록

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

**플러그인 이름은 문자열로, 옵션은 JSON으로 직렬화할 수 있게 유지하십시오.** Turbopack이 워커 경계를 넘겨 전달하기 때문에 함수 참조는 살아남지 못합니다. 이 형태는 webpack에서도 그대로 동작합니다.

## 3단계 — `mdx-components.jsx` 준비

Next.js가 이 파일을 요구합니다. 이미 있으시면 기존 매핑을 그대로 두고 아무것도 더하지 않으셔도 됩니다.

```jsx
export function useMDXComponents(components) {
  return { ...components }
}
```

cudoc의 앵커, 배지, 표 컴포넌트를 등록할 필요는 없습니다.

## 4단계 — 스타일시트 가져오기

루트 레이아웃에서 한 번만 가져옵니다.

```js
import "@cudoment/cudoc/styles.css"
```

문서는 `docs/` 아래에 작성하시고, 기존 MDX 라우팅으로 렌더링하시면 됩니다. 예를 들어 `app/guide/page.jsx`가 `../../docs/guide.md`를 가져오는 식입니다.

**문법 확장만 필요하시면 여기서 멈추셔도 됩니다.** 앱을 실행하면 [Markdown 문법](./syntax.ko.md)의 기능들이 동작합니다. 문서 임베딩이 필요하시면 계속 진행하십시오.

## 5단계 — 임베드 플러그인 추가

같은 `remarkPlugins` 배열에서 `cudoc-remark` 뒤에 붙입니다.

```js
;["cudoc-remark/embed", { sourceRoot: "docs", outDir: ".cudoc/documents" }]
```

수집에 `roots`를 썼다면 여기에도 `sourceRoot` 대신 같은 목록을 넘겨야 파일이 수집 당시의 ID로 이어집니다.

이 플러그인은 각 임베드의 준비된 내용을 페이지가 컴파일될 때 접합하므로, 임베드된 절 안의 컴포넌트도 다른 컴포넌트와 같이 `mdx-components.jsx`를 통해 렌더링됩니다. 그만큼 컴파일된 페이지가 `.cudoc/documents/embeds.json`에 의존하게 되는데 번들러는 그것을 볼 수 없습니다. 두 번들러 모두에 같은 파일을 대상으로 통과형 로더를 등록하십시오.

```js
import { libraryLoader } from "cudoc-remark/loader"

const library = libraryLoader(".cudoc/documents")

export default withMDX({
  pageExtensions: ["js", "jsx", "md", "mdx"],
  webpack(config) {
    config.module.rules.push({ test: /\.mdx?$/, use: [library] })
    return config
  },
  turbopack: { rules: { "*.{md,mdx}": { loaders: [library] } } },
})
```

파일은 그대로 두고, 번들러가 컴파일하는 내용에 라이브러리 해시를 담은 보이지 않는 참조 정의 한 줄을 더합니다. 그래서 라이브러리가 바뀌면 페이지가 바뀐 것으로 개발 서버와 두 번들러의 빌드 캐시가 인식하고, `cudoc collect`가 이미 컴파일된 페이지에도 닿습니다. → [준비된 임베드 접합](./api-reference/adapters.ko.md#준비된-임베드-접합)

## 6단계 — 빌드 전마다 수집 실행

[수집 설정](./embedding.ko.md#문서-수집-설정)에 따라 `cudoc.config.mjs`를 만들되 `host: "next"`로 지정한 뒤, 다음과 같이 연결합니다.

```json
{
  "scripts": {
    "collect": "cudoc collect --config cudoc.config.mjs",
    "check": "cudoc check --config cudoc.config.mjs",
    "dev": "npm run collect && next dev",
    "build": "npm run collect && npm run check && next build"
  }
}
```

수집은 Next.js보다 먼저 돌아야 합니다. 글을 쓰는 동안에는 `next dev` 옆에서 `cudoc collect --watch --config cudoc.config.mjs`를 실행하세요. `docs/` 아래가 바뀔 때마다 다시 수집하고, 앞 단계의 로더 규칙이 그 결과를 개발 서버가 이미 컴파일한 페이지에도 전달합니다. 임베드 플러그인은 import도 런타임 컴포넌트도 생성하지 않으며, 작성자가 Markdown에 import를 쓸 일은 없습니다.

**수집된 경로를 App Router 경로에 맞추십시오.** `/help/guide`에서 제공되는 `guide.md`라면 `routes: { guide: "/help/guide" }`가 필요합니다.

## 7단계 — 독립 HTML도 내보내기 (선택)

```sh
npm install cudoc-export
npx cudoc-export build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

Next.js 빌드 결과와 수집 데이터는 변경되지 않습니다. → [독립 HTML](./export.ko.md)

---

## 이제 쓸 수 있는 것

| 기능               | 예시                             | 자세히                                          |
| ------------------ | -------------------------------- | ----------------------------------------------- |
| 명시적 제목 앵커   | `## 한도 (#limits)`              | [문법](./syntax.ko.md#앵커와-배지)              |
| 제목 배지          | `## 한도 (#limits) (@New)`       | [문법](./syntax.ko.md#앵커와-배지)              |
| 제목이 있는 콜아웃 | `> [!NOTE] 시작하기 전에`        | [문법](./syntax.ko.md#알림)                     |
| 표 셀 안 중첩 목록 | `- 계정<br />-- 이메일 인증`     | [문법](./syntax.ko.md#표-셀-내부-목록)          |
| 문서 전체 임베드   | `sources: [reference.md]`        | [임베딩](./embedding.ko.md#섹션-가져오기)       |
| 한 절 임베드       | `sources: [reference.md#limits]` | [임베딩](./embedding.ko.md#섹션-가져오기)       |
| 제목 요약 표       | `select: { depth: 2 }`           | [임베딩](./embedding.ko.md#제목-요약-표-만들기) |
| 사본의 문구 치환   | `replace: [{ find, replace }]`   | [임베딩](./embedding.ko.md#찾기바꾸기)          |

## Next.js에서 알아 둘 점

**두 번들러 모두 지원.** 위의 문자열 지정자 형태는 Turbopack과 webpack 양쪽에서 빌드됩니다. [실행 가능한 예제](../examples/README.md)가 둘 다 검증합니다.

**`.md`와 `.mdx`의 차이.** `format: "detect"`는 `.md`를 평범한 Markdown으로 두어 `{value}`가 그대로 글자로 남게 하고, `.mdx`는 직접 만든 React 컴포넌트를 위한 MDX로 다룹니다. → [`.md`와 `.mdx` 선택](./README.ko.md#md와-mdx-선택)

**MDX 목차 (선택).** remark 옵션에 `toc: true`를 더하면 컴파일된 `.mdx` 모듈이 `toc` 바인딩을 내보냅니다. 두 단계 개요입니다. 평범한 `.md`는 ESM export를 받지 않습니다. → [목차 레퍼런스](./api-reference/adapters.ko.md#remark)

**직접 구성한 remark 파이프라인.** 기본 수집기는 위의 표준 cudoc/GFM 구성을 전제로 합니다. 파이프라인이 다르다면 수집과 소스 치환에 반드시 그 컴파일러를 써야 합니다. → [컴파일러 캡처](./api-reference/adapters.ko.md#컴파일러-캡처)

## 다음으로

- [문서 임베딩](./embedding.ko.md) — 선택, 다중 소스, 갱신 규칙
- [어댑터 내부 동작](./api-reference/adapters.ko.md#remark) — 플러그인 순서와 진입점
- [실행 가능한 예제](../examples/README.md) — 두 번들러에서의 App Router 연결
