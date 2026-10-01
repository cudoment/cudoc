# Eleventy

[English](./eleventy.md) | **한국어** · [전체 가이드](./README.ko.md)

순서대로 따라가시면 됩니다. 1–4단계는 Markdown 문법 확장을 켭니다. 5–7단계는 문서 임베딩을 더합니다. 한 문서가 다른 문서를 재사용할 수 있게 해 주는 기능입니다. 8단계는 선택 사항입니다.

## 1단계 — 설치

```sh
npm install @cudoment/cudoc cudoc-eleventy markdown-it-attrs markdown-it-anchor markdown-it-container
```

Eleventy는 remark가 아니라 markdown-it을 쓰므로 `cudoc-remark`를 사용하지 않습니다. 공용 markdown-it 계층인 `cudoc-markdown-it`은 `cudoc-eleventy`와 함께 설치됩니다. `markdown-it-*` 플러그인 세 개는 다음 단계에서 등록하는 네이티브 문법입니다.

## 2단계 — 공용 모듈에서 렌더러 만들기

Eleventy가 markdown-it 인스턴스를 소유하므로, 설정 파일과 수집기가 함께 가져다 쓸 모듈에서 한 번만 만듭니다.

```js
// markdown.mjs
import attrs from "markdown-it-attrs"
import anchor from "markdown-it-anchor"
import container from "markdown-it-container"
import { createMarkdownRenderer } from "cudoc-eleventy"

export const syntax = { headingAnchor: "both", callout: "both" }

export const createRenderer = (library) =>
  createMarkdownRenderer({ syntax, library }, (md) => {
    md.use(attrs, { allowedAttributes: ["id"] })
    md.use(anchor, { permalink: anchor.permalink.linkInsideHeader() })
    for (const type of ["warning", "tip", "info", "danger", "details"])
      md.use(container, type)
  })
```

네이티브 문법은 **직접 등록하신** 플러그인에서 나옵니다. `markdown-it-container`를 등록하기 전까지 `callout: "host"`는 정규화할 대상이 없고, `headingAnchor: "host"`에는 `markdown-it-attrs`가 필요합니다.

## 3단계 — 설정 파일에 연결

`eleventy.config.mjs`에 아래를 병합하고, 사이트의 플러그인, 필터와 다른 설정은 그대로 두십시오. `dir.input`은 수집기가 수집할 디렉터리이며, 여기서는 `docs`입니다.

```js
// eleventy.config.mjs
import { createRenderer } from "./markdown.mjs"

export default function (eleventyConfig) {
  eleventyConfig.setLibrary("md", createRenderer())
  eleventyConfig.addPassthroughCopy({
    "node_modules/@cudoment/cudoc/styles.css": "cudoc.css",
  })
  return {
    dir: { input: "docs", output: "_site" },
    markdownTemplateEngine: false,
  }
}
```

> **이 중 두 가지는 취향이 아니라 필수입니다.**
>
> `markdownTemplateEngine: false`는 markdown-it이 보기 전에 Liquid가 Markdown을 다시 쓰는 것을 막습니다. cudoc은 토큰 스트림에서 소스 위치를 읽기 때문에, 다른 엔진이 이미 렌더링한 소스를 감지하면 어댑터가 오류를 냅니다.
>
> `anchor.permalink.linkInsideHeader()`는 퍼머링크를 제목 **안쪽에** 넣습니다. 제목을 감싸는 형태의 퍼머링크는 제목 글자 전체를 링크 안에 넣어 버려서, cudoc의 `(#id)` 앵커가 제목의 일부로 남지 못합니다.

## 4단계 — 레이아웃에서 스타일시트 연결

Eleventy에는 기본 테마가 없으므로 스타일시트와 탐색은 레이아웃에 두셔야 합니다. 3단계에서 복사되는 `/cudoc.css`를 연결하십시오.

**문법 확장만 필요하시면 여기서 멈추셔도 됩니다.** 사이트를 빌드하면 [Markdown 문법](./syntax.ko.md)의 기능들이 동작합니다. 문서 임베딩이 필요하시면 계속 진행하십시오.

## 5단계 — 수집기 추가

사이트 루트에 `collect.mjs`를 만드십시오. 사이트가 쓰는 것과 같은 `markdown.mjs`에서 렌더러를 만들고, `createDocumentCompiler(md)`를 [`collectDocuments`](./api-reference/node.ko.md#감시)에 넘깁니다. `collectDocuments`는 라이브러리와 준비된 임베드를 함께 쓰므로, 실행이 실패하면 이전 두 결과가 그대로 남습니다.

```js
// collect.mjs
import { collectDocuments } from "@cudoment/cudoc/node/watch"
import { createDocumentCompiler } from "cudoc-eleventy"
import { createRenderer, syntax } from "./markdown.mjs"

// The renderer the site builds with. It needs no library: collection
// resolves embeds from the documents it collects.
const md = createRenderer()
await collectDocuments({
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  host: "eleventy",
  // Eleventy writes directory URLs, so `reference.md` is served at `/reference/`.
  routeSuffix: "/",
  syntax,
  compiler: createDocumentCompiler(md),
  // Change it whenever markdown.mjs or the Eleventy version changes.
  compilerId: "eleventy-v1",
})
```

## 6단계 — 렌더러에 라이브러리 연결

그러면 `eleventy.config.mjs`는 다음과 같으며, 사이트의 다른 설정은 그대로 둡니다.

```js
// eleventy.config.mjs
import { loadLibrary } from "@cudoment/cudoc/node/library"
import { createRenderer } from "./markdown.mjs"

export default function (eleventyConfig) {
  eleventyConfig.setLibrary(
    "md",
    createRenderer(loadLibrary(".cudoc/documents")),
  )
  eleventyConfig.addPassthroughCopy({
    "node_modules/@cudoment/cudoc/styles.css": "cudoc.css",
  })
  return {
    dir: { input: "docs", output: "_site" },
    markdownTemplateEngine: false,
  }
}
```

**수집과 렌더링은 모든 Markdown 옵션에서 일치해야 합니다.** 둘 다 `markdown.mjs`에서 나오므로 구조적으로 일치하게 되어 있습니다. 그 구조를 유지하시고, 관련 설정이 바뀌면 `compilerId`를 바꾸십시오.

## 7단계 — 빌드 전마다 수집 실행

`package.json`에 스크립트를 추가합니다.

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "check": "cudoc check --config cudoc.config.mjs",
    "dev": "npm run collect && eleventy --serve",
    "build": "npm run collect && npm run check && eleventy"
  }
}
```

`cudoc check`는 수집기가 게시한 라이브러리를 읽기만 하고 수집은 하지 않으므로 `collect` 다음에 실행하며, 설정 파일에는 그 라이브러리의 위치만 적으면 됩니다.

```js
// cudoc.config.mjs
export default { sourceRoot: "docs", outDir: ".cudoc/documents" }
```

`/img/logo.png` 같은 루트 기준 이미지는 `docs` 아래에서 찾습니다. passthrough가 그 밖의 디렉터리에서 이미지를 복사한다면 여기서는 `check: { assetDirs: [...] }`에, 8단계에서는 `--asset-dir`로 그 디렉터리를 적으십시오.

원본 문서를 고치신 뒤에는 수집을 다시 실행하고(수집기의 설정으로 호출한 [`watchDocuments`](./api-reference/node.ko.md#감시)가 변경마다 이를 대신하며, `compiler`를 포함해 수집기의 설정 전체를 담은 설정 파일을 주면 `cudoc collect --watch`도 그렇게 합니다) **개발 서버도 재시작**하셔야 합니다. 플러그인은 설정을 평가할 때 불러온 라이브러리를 계속 들고 있어서, 다시 불러오기 전까지는 원문이 오래되었다고 보고합니다. frontmatter는 비교 대상이 아닙니다. Eleventy는 frontmatter를 뺀 페이지를 렌더러에 넘기며, frontmatter 뒤의 본문이 수집한 내용과 같으면 최신 상태로 봅니다. → [참조 검사](./check.ko.md)

## 8단계 — 독립 HTML도 내보내기 (선택)

```sh
npm install cudoc-export
npx cudoc-export build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

Eleventy 빌드 결과와 수집 데이터는 변경되지 않습니다. → [독립 HTML](./export.ko.md)

---

## 이제 쓸 수 있는 것

| 기능               | 예시                             | 자세히                                          |
| ------------------ | -------------------------------- | ----------------------------------------------- |
| 명시적 제목 앵커   | `## 한도 (#limits)`              | [문법](./syntax.ko.md#앵커와-배지)              |
| 네이티브 제목 앵커 | `## 한도 {#limits}`              | [문법](./syntax.ko.md#앵커와-배지)              |
| 제목 배지          | `## 한도 (#limits) (@New)`       | [문법](./syntax.ko.md#앵커와-배지)              |
| 제목이 있는 콜아웃 | `> [!NOTE] 시작하기 전에`        | [문법](./syntax.ko.md#알림)                     |
| 네이티브 컨테이너  | `::: warning 제목`               | [문법](./syntax.ko.md#알림)                     |
| 표 셀 안 중첩 목록 | `- 계정<br />-- 이메일 인증`     | [문법](./syntax.ko.md#표-셀-내부-목록)          |
| 문서 전체 임베드   | `sources: [reference.md]`        | [임베딩](./embedding.ko.md#섹션-가져오기)       |
| 한 절 임베드       | `sources: [reference.md#limits]` | [임베딩](./embedding.ko.md#섹션-가져오기)       |
| 제목 요약 표       | `select: { depth: 2 }`           | [임베딩](./embedding.ko.md#제목-요약-표-만들기) |
| 문서 트리          | `render: { type: tree }`         | [임베딩](./embedding.ko.md#문서-트리-그리기)    |
| 사본의 문구 치환   | `replace: [{ find, replace }]`   | [임베딩](./embedding.ko.md#찾기바꾸기)          |

`details` 컨테이너는 펼침 동작을 그대로 유지합니다.

## Eleventy에서 알아 둘 점

**경로가 디렉터리 URL입니다.** 수집기는 Eleventy의 기본값에 맞춰 `routeSuffix: "/"`를 쓰므로 `reference.md`는 `/reference/`로 수집됩니다. `permalink`나 출력 확장자, 경로 접두사를 바꾸시면 수집 경로도 바꾸셔야 합니다.

**gitignore된 입력.** Eleventy는 기본적으로 gitignore된 파일을 건너뜁니다. 이 저장소 예제의 동기화된 픽스처처럼 문서가 gitignore 대상이라면 `eleventyConfig.setUseGitIgnore(false)`를 더하십시오.

**Markdown만 다룹니다.** `.md`를 작성하십시오. React `.mdx`는 처리되지 않습니다. → [`.md`와 `.mdx` 선택](./README.ko.md#md와-mdx-선택)

**사이트 플러그인의 렌더링은 그대로 유지됩니다.** 코드 블록은 사이트가 등록한 fence 렌더러를 거치고, 사이트 자체의 `::: demo`처럼 이름이 콜아웃 타입이 아닌 `markdown-it-container`는 그 플러그인이 렌더링하는 대로 열리고 닫히며, 그 안의 내용은 cudoc이 페이지의 나머지와 똑같이 읽으므로 안에 둔 제목 앵커와 임베드도 동작합니다. cudoc은 자신이 정규화하는 부분만 바꿉니다.

**목차와 임베드된 제목.** Eleventy에는 자체 목차가 없습니다. markdown-it 플러그인으로 만드는 목차는 토큰을 읽으므로 페이지 자신의 제목만 나열하고, Eleventy transform처럼 렌더링된 HTML로 만드는 목차는 임베드로 들어온 제목도 나열합니다.

**빌드 중 경고.** 등록하지 않은 콜아웃 타입이나 id가 같은 두 제목 같은 진단은 Eleventy가 페이지를 렌더링할 때 페이지와 줄을 알리는 경고로 출력됩니다. 렌더러가 수집한 라이브러리를 가지고 있으면 줄은 파일 첫 줄부터, 그렇지 않으면 frontmatter 다음 줄부터 셉니다. 직접 처리하시려면 렌더러 옵션에 `onDiagnostic(diagnostic, documentId)`를 넘기십시오. → [markdown-it 내부 동작](./api-reference/adapters.ko.md#markdown-it)

**VitePress와 공유합니다.** 이 어댑터와 [VitePress 어댑터](./vitepress.ko.md)는 모두 `cudoc-markdown-it` 위에 있습니다. 두 호스트가 같은 코드로 실제 네이티브 토큰 스트림을 변환하므로 제목과 목차 연동이 동일하게 동작합니다.

## 다음으로

- [문서 임베딩](./embedding.ko.md) — 선택, 다중 소스, 갱신 규칙
- [markdown-it 내부 동작](./api-reference/adapters.ko.md#markdown-it) — 토큰 변환과 호스트 정의
- [실행 가능한 예제](../examples/eleventy/eleventy.config.mjs) — 동작하는 사이트
