# Nextra

[English](./nextra.md) | **한국어** · [전체 가이드](./README.ko.md)

순서대로 따라가시면 됩니다. 1–3단계는 Markdown 문법 확장을 켭니다. 4–6단계는 문서 임베딩을 더합니다. 한 문서가 다른 문서를 재사용할 수 있게 해 주는 기능입니다. 7단계는 선택 사항입니다.

## 1단계 — 설치

```sh
npm install @cudoment/cudoc cudoc-remark cudoc-nextra
```

Next.js 15는 `postcss` 8.4.31을, Nextra의 수식 지원은 `@xmldom/xmldom` 0.9.10을 정확한 버전으로 고정합니다. `npm audit`은 두 패키지 모두에 보안 권고를 보고하지만, 이렇게 고정되어 있으면 npm이 수정판을 고를 수 없습니다. [예제 사이트](../examples/nextra/package.json)는 수정판을 고정한 상태로 빌드를 확인했으므로, 같은 `overrides`를 `package.json`에 기존 항목과 함께 추가하고 다시 설치하십시오.

```json
{
  "overrides": {
    "@xmldom/xmldom": "0.9.12",
    "postcss": "8.5.28"
  }
}
```

```sh
npm install
```

Next.js나 Nextra 릴리스가 수정판에 직접 의존하게 되면 해당 항목을 지우십시오. 항목이 아직 필요한지는 `npm audit`으로 확인할 수 있습니다.

## 2단계 — remark 플러그인 등록

`next.config.mjs`에 아래를 병합하고, 사이트의 다른 설정은 그대로 두십시오.

```js
// next.config.mjs
import nextra from "nextra"
import { cudocRemarkPlugins } from "cudoc-nextra"

const withNextra = nextra({
  mdxOptions: {
    format: "detect",
    remarkPlugins: cudocRemarkPlugins({ syntax: {} }),
  },
})

export default withNextra({
  pageExtensions: ["js", "jsx", "ts", "tsx", "md", "mdx"],
})
```

기존 Nextra 테마 설정과 MDX 컴포넌트 매핑은 그대로 두십시오. Nextra는 설정된 remark 플러그인을 자체 제목 처리보다 먼저 실행하므로, Nextra가 목차를 만들 때 cudoc의 앵커가 이미 자리를 잡고 있습니다.

## 3단계 — 스타일시트 가져오기

루트 레이아웃에서 한 번만 가져옵니다.

```js
// app/layout.jsx — add at the top
import "@cudoment/cudoc/styles.css"
```

cudoc 컴포넌트 매핑은 필요 없습니다.

**문법 확장만 필요하시면 여기서 멈추셔도 됩니다.** 사이트를 실행하면 [Markdown 문법](./syntax.ko.md)의 기능들이 동작합니다. 문서 임베딩이 필요하시면 계속 진행하십시오.

## 4단계 — 임베드 플러그인과 라이브러리 로더 추가

임베드 플러그인은 어댑터가 넣는 플러그인들 뒤에 붙이고, 라이브러리 로더는 같은 파일에 등록합니다. 둘을 모두 넣은 `next.config.mjs`는 다음과 같으며, 사이트의 다른 설정은 그대로 둡니다.

```js
// next.config.mjs
import nextra from "nextra"
import { cudocRemarkPlugins } from "cudoc-nextra"
import embed from "cudoc-remark/embed"
import { libraryLoader } from "cudoc-remark/loader"

const withNextra = nextra({
  mdxOptions: {
    format: "detect",
    remarkPlugins: [
      ...cudocRemarkPlugins({ syntax: {} }),
      [embed, { sourceRoot: "content", outDir: ".cudoc/documents" }],
    ],
  },
})

export default withNextra({
  pageExtensions: ["js", "jsx", "ts", "tsx", "md", "mdx"],
  webpack(config) {
    config.module.rules.push({
      test: /\.mdx?$/,
      use: [libraryLoader(".cudoc/documents")],
    })
    return config
  },
})
```

이 플러그인은 준비된 내용을 페이지가 컴파일될 때 접합하므로 컴파일된 페이지가 `.cudoc/documents/embeds.json`에 의존합니다. 로더가 없으면 재수집이 번들러가 이미 컴파일한 페이지에 닿지 않습니다.

webpack 형태만 있습니다. 위와 같이 Nextra에 플러그인 함수를 넘기면 그 로더 옵션을 Turbopack이 직렬화할 수 없으므로, 이렇게 구성한 사이트는 webpack으로 빌드하고 서비스합니다. [Next.js 가이드](./next.ko.md#5단계--임베드-플러그인과-라이브러리-로더-추가)의 Turbopack 규칙은 여기에 해당하지 않습니다. → [준비된 임베드 접합](./api-reference/adapters.ko.md#준비된-임베드-접합)

## 5단계 — 수집기 추가

사이트 루트에 `collect.mjs`를 만드십시오. 네이티브 플러그인 파이프라인과 함께 `nextra/compile`을 호출해서 결과 문서를 포착하고, 그 결과를 [`collectDocuments`](./api-reference/node.ko.md#감시)에 넘깁니다. `collectDocuments`는 라이브러리와 준비된 임베드를 함께 쓰므로, 실행이 실패하면 이전 두 결과가 그대로 남습니다.

```js
// collect.mjs
import { compileMdx } from "nextra/compile"
import { cudocRemarkPlugins } from "cudoc-nextra"
import { createCompilerCapture } from "cudoc-remark"
import { collectDocuments } from "@cudoment/cudoc/node/watch"

// The options next.config.mjs passes to cudocRemarkPlugins.
const documentOptions = { syntax: {} }

await collectDocuments({
  sourceRoot: "content",
  outDir: ".cudoc/documents",
  host: "nextra",
  // Change it whenever these settings or the Nextra version change.
  compilerId: "nextra-v1",
  ...documentOptions,
  async compiler(source, { filePath, options }) {
    const capture = createCompilerCapture()
    await compileMdx(source, {
      filePath,
      codeHighlight: false,
      mdxOptions: {
        format: options.format,
        remarkPlugins: [...cudocRemarkPlugins(documentOptions), capture.remark],
        rehypePlugins: [capture.rehype],
      },
    })
    return capture.read()
  },
})
```

`sourceRoot`, 문법 설정, 네이티브 컴파일러 옵션, 경로를 콘텐츠 설정에 맞추십시오. **수집과 렌더링은 반드시 일치해야 합니다.** 수집기는 문서 옵션을 `documentOptions` 객체 하나에 담아 `collectDocuments` 설정에 펼쳐 넣고, 컴파일러 안의 `cudocRemarkPlugins` 호출에도 넘깁니다. 이 객체에는 `next.config.mjs`가 `cudocRemarkPlugins`에 넘기는 옵션을 그대로 적으십시오. 한쪽을 바꾸면 다른 쪽도 바꿔야 하고, 관련 설정이나 의존성 버전이 바뀌면 `compilerId`를 바꾸십시오.

## 6단계 — 빌드 전마다 수집 실행

`package.json`에 스크립트를 추가합니다.

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "check": "cudoc check --config cudoc.config.mjs",
    "dev": "npm run collect && next dev",
    "build": "npm run collect && npm run check && next build"
  }
}
```

`cudoc check`는 수집기가 게시한 라이브러리를 읽기만 하고 수집은 하지 않으므로 `collect` 다음에 실행하며, 설정 파일에는 그 라이브러리의 위치와 사이트가 루트 기준 이미지를 제공하는 디렉터리만 적으면 됩니다.

```js
// cudoc.config.mjs
export default {
  sourceRoot: "content",
  outDir: ".cudoc/documents",
  check: { assetDirs: ["public"] },
}
```

수집은 Nextra보다 먼저 돌아야 합니다. 글을 쓰는 동안 다시 수집하려면 `collectDocuments` 대신 `@cudoment/cudoc/node/watch`의 [`watchDocuments`](./api-reference/node.ko.md#감시)에 같은 옵션을 넘기세요. 로더 규칙이 회차마다의 결과를 개발 서버가 이미 컴파일한 페이지에도 전달합니다.

`cudoc check`는 깨진 링크와 앵커, 이미지, 임베드를 한 번에 전부 보고하고 종료 코드를 0이 아닌 값으로 냅니다. 사이트가 생성되기 전에 빌드가 멈춥니다. → [참조 검사](./check.ko.md)

## 7단계 — HTML로도 내보내기 (선택)

```sh
npm install cudoc-export
npx cudoc-export build content --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/ --asset-dir public
```

소스 디렉터리가 `docs`가 아니라 `content`인 점에 유의하십시오. Nextra 빌드 결과와 수집 데이터는 변경되지 않습니다. → [내보내기](./export.ko.md)

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
| 문서 트리          | `render: { type: tree }`         | [임베딩](./embedding.ko.md#문서-트리-그리기)    |
| 사본의 문구 치환   | `replace: [{ find, replace }]`   | [임베딩](./embedding.ko.md#찾기바꾸기)          |

## Nextra에서 알아 둘 점

**네이티브 문법과 함께 쓰기.** Nextra의 `[#id]` 앵커와 정적 `<Callout>` 컴포넌트는 그대로 동작합니다. cudoc이 그것들까지 정규화하게 하면 임베드한 사본과 HTML 출력이 같은 의미를 갖게 됩니다.

```js
cudocRemarkPlugins({ syntax: { headingAnchor: "both", callout: "both" } })
```

`both`를 켜실 때는 수집기의 `documentOptions`도 함께 바꾸셔야 합니다. 지원하는 네이티브 형태는 [문법 가이드](./syntax.ko.md)에 정리되어 있습니다.

**목차는 Nextra가 계속 담당합니다.** 어댑터는 `host: "nextra"`를 설정하고 명시적 id를 승격시킨 뒤, 목차는 Nextra에 맡깁니다. Nextra는 완성된 페이지로 목차를 만들므로 임베드로 들어온 제목도 목차에 들어갑니다.

**제목 id는 slug로 바뀝니다.** Nextra는 자체 `[#id]`를 포함한 모든 제목 id를 slugger에 통과시키므로, id는 이미 slug 형태일 때만 철자가 유지됩니다. `## 버전 (#v1.2)`은 `v12`로 렌더링됩니다. 이 slugger는 id를 문서 순서대로 받으므로, 앞선 제목의 글자가 이미 만든 id를 뒤에서 명시하면(`## Setup` 다음 `## Intro (#setup)`) 여기와 Docusaurus에서는 명시한 쪽이 `setup-1`이 되지만, VitePress, Eleventy, 독립 내보내기는 명시한 id에 `setup`을 남기고 앞의 제목에 번호를 붙입니다. 앵커를 영문 소문자, 숫자, 하이픈으로 쓰고, 명시한 id를 가진 제목을 같은 id를 만들 글자의 제목보다 앞에 두시면 그 앵커로 가는 링크가 모든 호스트에서 같게 해석됩니다.

**정적 컴포넌트는 문서 노드가 되고 동적 컴포넌트는 컴포넌트로 남습니다.** 정적 `<Callout>`은 이식 가능한 콜아웃으로 정규화되어 모든 호스트와 HTML 내보내기가 렌더링할 수 있습니다. 임베드된 절에 남은 컴포넌트는 복사본이 접합되는 자리에서 Nextra의 컴포넌트 매핑으로 렌더링되며, HTML 내보내기에는 여전히 렌더러가 필요하고 `cudoc check`가 그 이름을 알려 줍니다.

**`.md`와 `.mdx`의 차이.** 직접 만든 React 컴포넌트는 `.mdx`에 작성하십시오. `.md`는 Markdown으로 남아 `{value}`가 그대로 글자가 됩니다. → [`.md`와 `.mdx` 선택](./README.ko.md#md와-mdx-선택)

## 다음으로

- [문서 임베딩](./embedding.ko.md) — 선택, 다중 소스, 갱신 규칙
- [어댑터 내부 동작](./api-reference/adapters.ko.md#docusaurus와-nextra) — 순서, 캡처, 어댑터가 설정하는 값
- [실행 가능한 예제](../examples/nextra/next.config.mjs) — 동작하는 사이트
