# Eleventy

[English](./eleventy.md) | **한국어** · [전체 가이드](./README.ko.md)

Eleventy 사이트에 cudoc을 설정합니다. Markdown 문법 확장을 먼저 켜고, 그다음 문서 임베드를 더하며, 마지막의 HTML 내보내기는 선택 사항입니다.

**먼저 보기:** [Eleventy 데모](https://cudoment.github.io/cudoc/demos/eleventy/portable/)는 [실행 가능한 예제](../examples/eleventy/eleventy.config.mjs)를 Eleventy 3.1.7로 빌드한 사이트이며, 빌드에 쓴 Markdown 원문으로 가는 링크가 함께 있습니다. → [호스트별 데모](./README.ko.md#호스트별-데모)

단계는 순서대로 따릅니다. 1–4단계는 Markdown 문법 확장을 켜고, 5–7단계는 한 문서가 다른 문서를 재사용하게 하는 문서 임베드를 더하며, 8단계는 선택 사항입니다.

## 1단계 — 설치

코어 패키지, Eleventy 어댑터, 그리고 markdown-it 플러그인 세 개를 설치합니다.

```sh
npm install @cudoment/cudoc cudoc-eleventy markdown-it-attrs markdown-it-anchor markdown-it-container
```

Eleventy는 remark가 아니라 markdown-it을 쓰므로 `cudoc-remark`를 사용하지 않습니다. 공용 markdown-it 계층인 `cudoc-markdown-it`은 `cudoc-eleventy`와 함께 설치됩니다. `markdown-it-*` 플러그인 세 개는 다음 단계에서 등록하는 네이티브 문법입니다.

## 2단계 — 공용 모듈에서 렌더러 만들기

markdown-it 인스턴스는 설정 파일과 수집기가 함께 가져다 쓸 모듈에서 한 번만 만듭니다. Eleventy가 그 인스턴스를 소유하기 때문입니다.

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

네이티브 문법은 **직접 등록한** 플러그인에서 나옵니다. `markdown-it-container`를 등록하기 전까지 `callout: "host"`는 정규화할 대상이 없고, `headingAnchor: "host"`에는 `markdown-it-attrs`가 필요합니다.

## 3단계 — 설정 파일에 연결

`eleventy.config.mjs`에 아래를 병합하고, 사이트의 플러그인, 필터, 다른 설정은 그대로 둡니다. `dir.input`은 수집기가 수집할 디렉터리이며, 여기서는 `docs`입니다.

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
> `anchor.permalink.linkInsideHeader()`는 퍼머링크를 제목 **안쪽에** 넣고, cudoc은 그 기본 클래스 `header-anchor`로 퍼머링크를 제목 글자와 구별합니다. 제목을 감싸는 형태의 퍼머링크는 제목 글자 전체를 링크 안에 넣어 버려서, cudoc의 `(#id)` 앵커가 제목의 일부로 남지 못합니다.

## 4단계 — 레이아웃에서 스타일시트 연결

3단계에서 복사되는 `/cudoc.css`를 레이아웃에서 연결합니다. Eleventy에는 기본 테마가 없으므로 스타일시트와 탐색은 레이아웃에 둡니다.

이 스타일시트는 시스템이 다크 모드를 선호하면 콜아웃, 코드 제목, 탭을 어둡게 그리며 글자색은 페이지에 맡깁니다. 따라서 늘 밝게 표시하는 레이아웃은 `<html>`에 `light` 클래스를 주고, 시스템 설정을 따르는 레이아웃은 `<meta name="color-scheme" content="light dark">`를 선언합니다.

**문법 확장만 필요하면 여기서 멈추어도 됩니다.** 사이트를 빌드하면 [Markdown 문법](./syntax.ko.md)의 기능들이 동작합니다. 문서 임베드가 필요하면 계속 진행합니다.

## 5단계 — 수집기 추가

사이트 루트에 `collect.mjs`를 만듭니다. 사이트가 사용하는 것과 같은 `markdown.mjs`에서 렌더러를 만들고, `createDocumentCompiler(md)`를 [`collectDocuments`](./api-reference/node.ko.md#감시)에 넘깁니다. `collectDocuments`는 라이브러리와 준비된 임베드를 함께 출력하므로, 실행이 실패하면 이전 두 결과가 그대로 남습니다.

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

`eleventy.config.mjs`에서 `loadLibrary(".cudoc/documents")`를 `createRenderer()`에 넘기고, 사이트의 다른 설정은 그대로 둡니다.

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

**수집과 렌더링은 모든 Markdown 옵션에서 일치해야 합니다.** 둘 다 `markdown.mjs`에서 나오므로 구조적으로 일치하게 되어 있습니다. 그 구조를 유지하고, 관련 설정이 바뀌면 `compilerId`를 바꿉니다.

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

`cudoc check`는 `collect` 다음에 실행합니다. 수집기가 게시한 라이브러리를 읽기만 하고 수집은 하지 않으므로, 설정 파일에는 그 라이브러리의 위치만 적으면 됩니다.

```js
// cudoc.config.mjs
export default { sourceRoot: "docs", outDir: ".cudoc/documents" }
```

`/img/logo.png` 같은 루트 기준 이미지는 `docs` 아래에서 찾습니다. passthrough가 그 밖의 디렉터리에서 이미지를 복사한다면 여기서는 `check: { assetDirs: [...] }`에, 8단계에서는 `--asset-dir`로 그 디렉터리를 적습니다.

원본 문서를 고친 뒤에는 수집을 다시 실행하고 **개발 서버도 재시작**해야 합니다. 수집기의 설정으로 호출한 [`watchDocuments`](./api-reference/node.ko.md#감시)는 변경마다 수집하며, `compiler`를 포함해 수집기의 설정 전체를 담은 설정 파일을 주면 `cudoc collect --watch`도 그렇게 합니다. 재시작이 필요한 이유는 플러그인이 설정을 평가할 때 불러온 라이브러리를 계속 들고 있어서, 다시 불러오기 전까지는 원문이 오래되었다고 보고하기 때문입니다. → [참조 검사](./check.ko.md)

frontmatter는 변경으로 치지 않습니다. Eleventy는 frontmatter를 뺀 페이지를 렌더러에 넘기며, frontmatter 뒤의 본문이 수집한 내용과 같으면 최신 상태로 봅니다.

## 8단계 — HTML로도 내보내기 (선택)

`cudoc-export`를 설치하고 수집된 라이브러리를 HTML로 내보냅니다.

```sh
npm install cudoc-export
npx cudoc-export build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

Eleventy 빌드 결과와 수집 데이터는 변경되지 않습니다. → [내보내기](./export.ko.md)

---

## 이제 쓸 수 있는 것

아래 표에서 문법 행은 4단계 뒤에, 임베드 행은 7단계 뒤에 동작합니다.

| 기능                | 예시                             | 자세히                                          |
| ------------------- | -------------------------------- | ----------------------------------------------- |
| 명시적 제목 앵커    | `## 한도 (#limits)`              | [문법](./syntax.ko.md#앵커와-배지)              |
| 네이티브 제목 앵커  | `## 한도 {#limits}`              | [문법](./syntax.ko.md#앵커와-배지)              |
| 제목 배지           | `## 한도 (#limits) (@New)`       | [문법](./syntax.ko.md#앵커와-배지)              |
| 제목이 있는 콜아웃  | `> [!NOTE] 시작하기 전에`        | [문법](./syntax.ko.md#콜아웃)                   |
| 네이티브 컨테이너   | `::: warning 제목`               | [문법](./syntax.ko.md#콜아웃)                   |
| 표 셀 안 중첩 목록  | `- 계정<br />-- 이메일 인증`     | [문법](./syntax.ko.md#표-셀-내부-목록)          |
| 표 셀 병합          | 셀에 `^^`나 `>>`만 쓰기          | [문법](./syntax.ko.md#표-셀-병합)               |
| 코드 제목과 강조 줄 | ` ```js title="retry.js" {2} `   | [문법](./syntax.ko.md#코드-블록-제목과-강조-줄) |
| 탭                  | `> [!TAB] npm`                   | [문법](./syntax.ko.md#탭)                       |
| 변수                | `(=version)`                     | [문법](./syntax.ko.md#변수)                     |
| 문서 전체 임베드    | `sources: [reference.md]`        | [임베드](./embedding.ko.md#섹션-가져오기)       |
| 한 절 임베드        | `sources: [reference.md#limits]` | [임베드](./embedding.ko.md#섹션-가져오기)       |
| 제목 요약 표        | `select: { depth: 2 }`           | [임베드](./embedding.ko.md#제목-요약-표-만들기) |
| 문서 트리           | `render: { type: tree }`         | [임베드](./embedding.ko.md#문서-트리-그리기)    |
| 사본의 문구 치환    | `replace: [{ find, replace }]`   | [임베드](./embedding.ko.md#찾기바꾸기)          |

`details` 컨테이너는 펼침 동작을 그대로 유지합니다.

## Eleventy에서 알아 둘 점

**경로가 디렉터리 URL입니다.** 수집기는 Eleventy의 기본값에 맞춰 `routeSuffix: "/"`를 쓰므로 `reference.md`는 `/reference/`로 수집됩니다. `permalink`나 출력 확장자를 바꾸면 수집 경로도 바꿔야 합니다. `pathPrefix`도 마찬가지이지만, Eleventy의 `HtmlBasePlugin`을 추가했다면 바꾸지 않습니다. 이 플러그인이 임베드가 그리는 링크를 포함해 빌드된 페이지의 모든 루트 기준 주소 앞에 접두사를 붙이기 때문입니다.

**`.md` 파일로 거는 링크는 쓴 그대로 남습니다.** Eleventy는 링크 주소를 바꾸지 않으므로 `[Limits](reference.md#limits)`는 사이트가 제공하지 않는 파일을 가리킵니다. 문서와 `linkReferences` 모두 `/reference/#limits`처럼 페이지 URL로 링크합니다. 임베드가 그리는 링크는 이미 수집된 경로를 씁니다.

**gitignore된 입력.** Eleventy는 기본 설정에서 gitignore된 파일을 건너뜁니다. 이 저장소 예제의 동기화된 픽스처처럼 문서가 gitignore 대상이라면 `eleventyConfig.setUseGitIgnore(false)`를 더합니다.

**Markdown만 다룹니다.** `.md`를 작성합니다. React `.mdx`는 처리되지 않습니다. → [`.md`와 `.mdx` 선택](./README.ko.md#md와-mdx-선택)

**frontmatter는 YAML이나 JSON으로 작성합니다.** 수집은 Eleventy가 기본 frontmatter 옵션으로 분리하는 방식과 같게 frontmatter를 분리하고, 기본값인 YAML과 `---json`을 읽습니다. JavaScript frontmatter(`---js`)는 코드를 실행해야 읽을 수 있으므로 수집이 파일 경로를 알리며 실패합니다. 그런 페이지의 frontmatter는 YAML로 작성합니다.

`setFrontMatterParsingOptions`는 기본값으로 둡니다. 요약(excerpt)이나 다른 구분자를 지정하면 Eleventy가 렌더링하는 본문이 바뀌어 수집 결과와 더 이상 일치하지 않고, 다른 기본 언어를 지정하면 언어를 표기하지 않은 frontmatter를 Eleventy는 그 언어로 읽지만 수집은 YAML로 읽습니다. → [markdown-it 내부 동작](./api-reference/adapters.ko.md#markdown-it)

**사이트 플러그인의 렌더링은 그대로 유지됩니다.** 코드 블록은 사이트가 등록한 fence 렌더러를 거칩니다. 사이트 자체의 `::: demo`처럼 이름이 콜아웃 타입이 아닌 `markdown-it-container`는 그 플러그인이 렌더링하는 대로 열리고 닫힙니다. 그 안의 내용은 cudoc이 페이지의 나머지와 똑같이 읽으므로 안에 둔 제목 앵커와 임베드도 동작합니다. cudoc은 자신이 정규화하는 부분만 바꿉니다.

**목차와 임베드된 제목.** Eleventy에는 자체 목차가 없습니다. markdown-it 플러그인으로 만드는 목차는 토큰을 읽으므로 페이지 자신의 제목만 나열하고, Eleventy transform처럼 렌더링된 HTML로 만드는 목차는 임베드로 들어온 제목도 나열합니다.

**빌드 중 경고.** 등록하지 않은 콜아웃 타입이나 id가 같은 두 제목 같은 진단은 Eleventy가 페이지를 렌더링할 때 페이지와 줄을 알리는 경고로 출력됩니다. 렌더러가 수집한 라이브러리를 가지고 있으면 줄은 파일 첫 줄부터, 그렇지 않으면 frontmatter 다음 줄부터 셉니다. 직접 처리하려면 렌더러 옵션에 `onDiagnostic(diagnostic, documentId)`를 넘깁니다. → [markdown-it 내부 동작](./api-reference/adapters.ko.md#markdown-it)

**VitePress와 공유합니다.** 이 어댑터와 [VitePress 어댑터](./vitepress.ko.md)는 모두 `cudoc-markdown-it` 위에 있습니다. 두 호스트가 같은 코드로 실제 네이티브 토큰 스트림을 변환하므로 제목과 목차 연동이 동일하게 동작합니다.

## 다음으로

이어서 읽을 문서는 임베드 가이드, markdown-it 내부 동작, 실행 가능한 예제입니다.

- [문서 임베드](./embedding.ko.md): 선택, 다중 소스, 갱신 규칙
- [markdown-it 내부 동작](./api-reference/adapters.ko.md#markdown-it): 토큰 변환과 호스트 정의
- [실행 가능한 예제](../examples/eleventy/eleventy.config.mjs): 동작하는 사이트
