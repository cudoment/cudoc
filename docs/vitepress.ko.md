# VitePress

[English](./vitepress.md) | **한국어** · [전체 가이드](./README.ko.md)

순서대로 따라가시면 됩니다. 1–3단계는 Markdown 문법 확장을 켭니다. 4–6단계는 문서 임베딩을 더합니다. 한 문서가 다른 문서를 재사용할 수 있게 해 주는 기능입니다. 7단계는 선택 사항입니다.

## 1단계 — 설치

```sh
npm install @cudoment/cudoc cudoc-vitepress
```

VitePress는 remark가 아니라 markdown-it을 쓰므로 `cudoc-remark`를 사용하지 않습니다. 공용 markdown-it 계층인 `cudoc-markdown-it`은 `cudoc-vitepress`와 함께 설치됩니다.

## 2단계 — Markdown 옵션을 공용 모듈에 두기

사이트와 수집기는 같은 옵션으로 Markdown을 렌더링해야 하므로, 두 곳이 함께 가져오는 모듈 하나에 옵션을 둡니다. 두 번째 파일은 `docs/.vitepress/config.mjs`에 병합하고, 사이트의 제목, 테마 설정과 다른 설정은 그대로 두십시오.

```js
// markdown.mjs
import cudoc from "cudoc-vitepress"

export const syntax = { headingAnchor: "both", callout: "both" }

/** The `markdown` options of the site, and of the collector's renderer. */
export const markdown = (library) => ({
  config(md) {
    md.use(cudoc, { syntax, library })
  },
})
```

```js
// docs/.vitepress/config.mjs
import { defineConfig } from "vitepress"
import { markdown } from "../../markdown.mjs"

export default defineConfig({
  markdown: markdown(),
})
```

여기서는 `both`로 시작하시기를 권합니다. VitePress 사이트에는 대개 `{#id}` 앵커와 `::: warning` 컨테이너가 이미 들어 있는데, `both`로 두면 기존 문서를 고치지 않고도 cudoc이 그것들을 자체 문법과 함께 정규화합니다.

## 3단계 — 스타일시트 가져오기

테마 진입점에서 가져옵니다. `docs/.vitepress/theme/index.js`를 만들거나 기존 파일을 확장하십시오.

```js
// docs/.vitepress/theme/index.js
import DefaultTheme from "vitepress/theme"
import "@cudoment/cudoc/styles.css"
export default DefaultTheme
```

**문법 확장만 필요하시면 여기서 멈추셔도 됩니다.** 사이트를 실행하면 [Markdown 문법](./syntax.ko.md)의 기능들이 동작합니다. 문서 임베딩이 필요하시면 계속 진행하십시오.

## 4단계 — 수집기 추가

사이트 루트에 `collect.mjs`를 만드십시오. 같은 옵션으로 실제 VitePress 렌더러를 만들고, `createDocumentCompiler(md)`를 [`collectDocuments`](./api-reference/node.ko.md#감시)에 넘깁니다. `collectDocuments`는 라이브러리와 준비된 임베드를 함께 쓰므로, 실행이 실패하면 이전 두 결과가 그대로 남습니다. `sourceRoot`와 렌더러의 디렉터리는 `vitepress build`에 넘기는 디렉터리이며, 여기서는 `docs`입니다.

```js
// collect.mjs
import path from "node:path"
import { createMarkdownRenderer, disposeMdItInstance } from "vitepress"
import { createDocumentCompiler } from "cudoc-vitepress"
import { collectDocuments } from "@cudoment/cudoc/node/watch"
import { markdown, syntax } from "./markdown.mjs"

// The renderer the site builds with. It needs no library: collection
// resolves embeds from the documents it collects.
const md = await createMarkdownRenderer(path.resolve("docs"), markdown())
await collectDocuments({
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  host: "vitepress",
  routeSuffix: ".html",
  syntax,
  compiler: createDocumentCompiler(md),
  // Change it whenever markdown.mjs or the VitePress version changes.
  compilerId: "vitepress-v1",
})
disposeMdItInstance()
```

## 5단계 — 렌더러에 라이브러리 연결

그러면 `docs/.vitepress/config.mjs`는 다음과 같으며, 사이트의 다른 설정은 그대로 둡니다.

```js
// docs/.vitepress/config.mjs
import { defineConfig } from "vitepress"
import { loadLibrary } from "@cudoment/cudoc/node/library"
import { markdown } from "../../markdown.mjs"

export default defineConfig({
  markdown: markdown(loadLibrary(".cudoc/documents")),
})
```

**수집과 렌더링은 모든 Markdown 옵션에서 일치해야 합니다.** 두 곳 모두 `markdown.mjs`에서 옵션을 가져오므로 구조상 자연히 일치합니다. 이 구조를 유지하시고, 관련 설정이 바뀌면 `compilerId`를 바꾸십시오.

## 6단계 — 빌드 전마다 수집 실행

`package.json`에 스크립트를 추가합니다.

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "check": "cudoc check --config cudoc.config.mjs",
    "dev": "npm run collect && vitepress dev docs",
    "build": "npm run collect && npm run check && vitepress build docs"
  }
}
```

`cudoc check`는 수집기가 게시한 라이브러리를 읽기만 하고 수집은 하지 않으므로 `collect` 다음에 실행하며, 설정 파일에는 그 라이브러리의 위치와 사이트가 루트 기준 이미지를 제공하는 디렉터리, 즉 VitePress의 `public` 디렉터리만 적으면 됩니다.

```js
// cudoc.config.mjs
export default {
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  check: { assetDirs: ["docs/public"] },
}
```

원본 문서를 고치신 뒤에는 수집을 다시 실행하고(수집기의 설정으로 호출한 [`watchDocuments`](./api-reference/node.ko.md#감시)가 변경마다 이를 대신하며, `compiler`를 포함해 수집기의 설정 전체를 담은 설정 파일을 주면 `cudoc collect --watch`도 그렇게 합니다) **개발 서버도 재시작**하셔야 합니다. 플러그인은 설정을 평가할 때 불러온 라이브러리를 계속 들고 있어서, 다시 불러오기 전까지는 원문이 오래되었다고 보고합니다. → [참조 검사](./check.ko.md)

## 7단계 — HTML로도 내보내기 (선택)

```sh
npm install cudoc-export
npx cudoc-export build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/ --asset-dir docs/public
```

VitePress 빌드 결과와 수집 데이터는 변경되지 않습니다. → [내보내기](./export.ko.md)

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

## VitePress에서 알아 둘 점

**경로에 `.html`이 붙습니다.** 수집기는 VitePress의 기본값 `cleanUrls: false`에 맞춰 `routeSuffix: ".html"`을 씁니다. URL 동작이나 `base`, 리라이트, 커스텀 경로를 바꾸시면 수집 경로도 바꾸셔야 합니다.

**리라이트한 페이지도 임베드를 유지합니다.** 문서는 `rewrites`나 동적 라우트가 다른 경로로 제공하더라도 읽어 들인 파일 기준으로 식별되므로, 경로가 바뀐 페이지도 수집된 문서 기준으로 임베드를 해석합니다. 다만 그 문서로 가는 링크는 수집된 경로를 쓰므로, 리라이트하는 경로는 수집기의 `routes`로 알려 주십시오.

**include하는 페이지에는 임베드를 넣지 마십시오.** `<!--@include: ...-->`로 다른 파일을 끌어오는 페이지도 평소처럼 렌더링되지만, 임베드까지 있으면 그 사실을 알리는 오류와 함께 렌더링이 멈춥니다. 수집은 include한 내용 없이 파일을 읽으므로 임베드를 페이지와 대응시킬 수 없기 때문입니다. 임베드는 아무것도 include하지 않는 페이지에 두십시오.

**VitePress의 렌더링은 그대로 유지됩니다.** 코드 블록의 문법 강조, 줄 번호, 복사 버튼과 스니펫 import가 그대로 동작하고, `<script setup>`과 `<style>` 블록은 여전히 페이지 컴포넌트로 들어가며, `[[toc]]`, `::: code-group`, `::: raw`, 이모지는 VitePress가 렌더링하는 그대로 나옵니다. 컨테이너 안의 내용은 cudoc이 그대로 읽으므로, 코드 그룹이나 `::: raw` 안의 제목 앵커와 임베드도 밖에서와 똑같이 동작합니다. cudoc은 자신이 정규화하는 부분만 바꿉니다.

**목차와 임베드된 제목.** 기본 테마의 개요는 브라우저에서 렌더링된 제목으로 만들어지므로 임베드로 들어온 제목도 나열합니다. 페이지 안의 `[[toc]]`는 VitePress 자체 토큰으로 렌더링되므로 페이지 자신의 제목만 나열합니다.

**빌드 중 경고.** 등록하지 않은 콜아웃 타입이나 id가 같은 두 제목 같은 진단은 VitePress가 페이지를 렌더링할 때 페이지와 줄을 알리는 경고로 출력됩니다. 플러그인이 수집한 라이브러리를 가지고 있으면 줄은 파일 첫 줄부터, 그렇지 않으면 frontmatter 다음 줄부터 셉니다. 직접 처리하시려면 플러그인 옵션에 `onDiagnostic(diagnostic, documentId)`를 넘기십시오. → [markdown-it 내부 동작](./api-reference/adapters.ko.md#markdown-it)

**Markdown만 다룹니다.** `.md`를 작성하십시오. React `.mdx`는 처리되지 않습니다. → [`.md`와 `.mdx` 선택](./README.ko.md#md와-mdx-선택)

**정적 마크업은 정규화되고 동적 Vue는 되지 않습니다.** 정적 `<Badge type="tip" text="1.0" />`은 cudoc 배지가 됩니다. Vue 바인딩을 담은 배지는 컴포넌트가 실행되기 전까지 글자를 알 수 없으므로 원시 HTML로 남습니다. 임의의 Vue 표현식과 커스텀 플러그인 토큰이 임베드를 통해 옮겨 가는 것은 보장되지 않습니다.

**Eleventy와 공유합니다.** 이 어댑터와 [Eleventy 어댑터](./eleventy.ko.md)는 모두 `cudoc-markdown-it` 위에 있습니다. 두 호스트가 같은 코드로 실제 네이티브 토큰 스트림을 변환하므로 제목과 목차 연동이 동일하게 동작합니다.

## 다음으로

- [문서 임베딩](./embedding.ko.md) — 선택, 다중 소스, 갱신 규칙
- [markdown-it 내부 동작](./api-reference/adapters.ko.md#markdown-it) — 토큰 변환과 호스트 정의
- [실행 가능한 예제](../examples/vitepress/docs/.vitepress/config.mjs) — 동작하는 사이트
