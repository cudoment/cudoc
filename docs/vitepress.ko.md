# VitePress

[English](./vitepress.md) | **한국어** · [전체 가이드](./README.ko.md)

기존 VitePress 사이트에서 설치합니다.

```sh
npm install @cudoment/cudoc cudoc-markdown-it cudoc-vitepress
```

## 문법 설정

```js
// docs/.vitepress/config.mjs
import { defineConfig } from "vitepress"
import cudoc from "cudoc-vitepress"

export default defineConfig({
  markdown: {
    config(md) {
      md.use(cudoc, {
        syntax: { headingAnchor: "both", callout: "both" },
      })
    },
  },
})
```

테마 진입점에서 `@cudoment/cudoc/styles.css`를 import합니다. 기본 테마를 사용하면 `docs/.vitepress/theme/index.js`를 만들거나 확장합니다.

```js
import DefaultTheme from "vitepress/theme"
import "@cudoment/cudoc/styles.css"
export default DefaultTheme
```

VitePress는 Markdown-it을 사용하므로 `cudoc-remark`를 사용하지 않습니다. [Eleventy 어댑터](./eleventy.ko.md)와 `cudoc-markdown-it`을 공유하기 때문에, 두 호스트가 실제 호스트 토큰을 같은 코드로 처리하고 제목·목차 연동을 유지합니다. 문서는 `.md`로 작성하며 React `.mdx`는 지원하지 않습니다. 지원하는 정적 호스트 표기는 정규화할 수 있지만 임의의 Vue 표현식이나 사용자 플러그인 토큰이 어댑터를 통해 모두 렌더링되는 것은 아닙니다.

위 설정에서는 `(#id)`와 호스트의 `{#id}`, `[!WARNING]` 인용문과 호스트의 `::: warning 제목` 컨테이너를 함께 사용할 수 있습니다. `details`는 펼치기 동작을 유지합니다.

## 임베드 추가

[VitePress 수집기](../examples/vitepress/collect.mjs)를 `collect.mjs`로 사용합니다. 같은 cudoc 옵션으로 실제 VitePress 렌더러를 구성하고, `createDocumentCompiler(md)`를 수집기에 전달한 뒤 임베드를 준비합니다.

플러그인 설정에 라이브러리를 추가합니다.

```js
import { loadLibrary } from "@cudoment/cudoc/node/library"

// markdown.config(md) 내부:
md.use(cudoc, {
  syntax: { headingAnchor: "both", callout: "both" },
  library: loadLibrary(".cudoc/documents"),
  outDir: ".cudoc/documents",
})
```

사이트 프로젝트 루트에서 명령을 실행합니다.

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "dev": "npm run collect && vitepress dev docs",
    "build": "npm run collect && vitepress build docs"
  }
}
```

수집기는 기본 `cleanUrls: false`에 맞춰 `routeSuffix: ".html"`을 사용합니다. URL 규칙, `base`, rewrite, 사용자 경로를 바꾸면 수집 경로도 변경하세요. 수집과 렌더링의 Markdown 옵션을 맞추고 관련 변경마다 `compilerId`를 갱신합니다. 문서 수정 후 다시 수집하고 개발 서버를 재시작해 메모리의 라이브러리도 갱신합니다.

[임베드 가이드](./embedding.ko.md), [실행 설정](../examples/vitepress/docs/.vitepress/config.mjs), [markdown-it API 내부 동작](./api-reference/adapters.ko.md#markdown-it)을 참고하세요.

## 독립 HTML도 함께 생성

위 수집과 준비가 끝나면 `cudoc-html`을 설치하고 같은 결과로 공유용 HTML을 추가 생성할 수 있습니다. 기본 사이트와 출력 경로를 분리합니다.

```sh
npm install cudoc-html
npx cudoc-html build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

`--host-url`과 수집된 문서 경로를 실제 배포 URL에 맞춥니다. `--links relative`는 로컬 탐색, `--links none`은 전체 하이퍼링크 제거입니다. 자산 경로와 사용자 컴포넌트 설정은 [독립 HTML 가이드](./html.ko.md)를 참고하세요.
