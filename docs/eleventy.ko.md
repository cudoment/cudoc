# Eleventy

[English](./eleventy.md) | **한국어** · [전체 가이드](./README.ko.md)

기존 Eleventy 사이트에서 설치합니다.

```sh
npm install @cudoment/cudoc cudoc-markdown-it cudoc-eleventy
```

## 문법 설정

Eleventy는 markdown-it 인스턴스를 직접 소유하므로, 설정 파일과 수집기가 함께 import하는 모듈에서 한 번만 구성합니다.

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

레이아웃에서 `/cudoc.css`를 연결합니다. Eleventy에는 기본 테마가 없으므로 스타일시트와 내비게이션은 레이아웃에서 작성합니다.

두 가지 설정은 선택 사항이 아니라 필수입니다. `markdownTemplateEngine: false`는 markdown-it보다 먼저 Liquid가 Markdown을 다시 쓰지 못하게 막습니다. cudoc은 토큰 스트림에서 원문 위치를 읽기 때문에, 다른 엔진이 이미 렌더링한 소스를 감지하면 어댑터가 오류를 발생시킵니다. 그리고 제목 퍼머링크는 `anchor.permalink.linkInsideHeader()`처럼 제목 안쪽에 삽입해야 합니다. 제목 전체를 링크로 감싸는 퍼머링크를 사용하면 제목의 본문이 링크 안으로 들어가서, cudoc이 읽어야 하는 `(#id)` 앵커가 제목 자체의 텍스트에 남지 않게 됩니다.

Eleventy는 Markdown-it을 사용하므로 `cudoc-remark`를 사용하지 않습니다. VitePress 어댑터와 `cudoc-markdown-it`을 공유하기 때문에, 두 호스트가 실제 네이티브 토큰 스트림을 같은 코드로 변환하고 제목·목차 연동을 유지합니다. 문서는 `.md`로 작성하며 React `.mdx`는 지원하지 않습니다.

위 설정에서는 `(#id)`와 호스트의 `{#id}`, `[!WARNING]` 인용문과 호스트의 `::: warning 제목` 컨테이너를 함께 사용할 수 있습니다. `details`는 펼치기 동작을 유지합니다. 네이티브 표기는 사이트가 등록한 markdown-it 플러그인에서 나오므로, `markdown-it-container`를 등록하기 전에는 `callout: "host"`가 정규화할 대상이 없고 `headingAnchor: "host"`에는 `markdown-it-attrs`가 필요합니다.

## 임베드 추가

[Eleventy 수집기](../examples/eleventy/collect.mjs)를 `collect.mjs`로 사용합니다. 사이트와 같은 모듈에서 렌더러를 만들고, `createDocumentCompiler(md)`를 수집기에 전달한 뒤 임베드를 준비합니다.

그리고 렌더러에 라이브러리를 넣어 줍니다.

```js
// eleventy.config.mjs
import { loadLibrary } from "@cudoment/cudoc/node/library"

eleventyConfig.setLibrary("md", createRenderer(loadLibrary(".cudoc/documents")))
```

사이트 프로젝트 루트에서 명령을 실행합니다.

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "dev": "npm run collect && eleventy --serve",
    "build": "npm run collect && eleventy"
  }
}
```

수집기는 Eleventy의 기본 디렉터리 URL 규칙에 맞춰 `routeSuffix: "/"`를 사용하므로 `reference.md`는 `/reference/`로 수집됩니다. `permalink`, 출력 확장자, 경로 접두사를 바꾸면 수집 경로도 변경하세요. 수집과 렌더링의 Markdown 옵션을 맞추고 관련 변경마다 `compilerId`를 갱신합니다. 문서 수정 후 다시 수집하고 개발 서버를 재시작해 메모리의 라이브러리도 갱신합니다.

이 저장소의 예제처럼 문서가 Git에서 무시되는 경로에 있다면 `eleventyConfig.setUseGitIgnore(false)`를 추가하세요. Eleventy는 기본적으로 Git에서 무시되는 입력을 건너뜁니다.

[임베드 가이드](./embedding.ko.md), [실행 설정](../examples/eleventy/eleventy.config.mjs), [markdown-it API 내부 동작](./api-reference/adapters.ko.md#markdown-it)을 참고하세요.

## 독립 HTML도 함께 생성

위 수집과 준비가 끝나면 `cudoc-html`을 설치하고 같은 결과로 공유용 HTML을 추가 생성할 수 있습니다. 기본 사이트와 출력 경로를 분리합니다.

```sh
npm install cudoc-html
npx cudoc-html build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

`--host-url`과 수집된 문서 경로를 실제 배포 URL에 맞춥니다. `--links relative`는 로컬 탐색, `--links none`은 전체 하이퍼링크 제거입니다. 자산 경로와 사용자 컴포넌트 설정은 [독립 HTML 가이드](./html.ko.md)를 참고하세요.
