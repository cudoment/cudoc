# VitePress

[English](./vitepress.md) | **한국어** · [전체 가이드](./README.ko.md)

순서대로 따라가시면 됩니다. 1–3단계는 Markdown 문법 확장을 켭니다. 4–6단계는 문서 임베딩을 더합니다. 한 문서가 다른 문서를 재사용할 수 있게 해 주는 기능입니다. 7단계는 선택 사항입니다.

## 1단계 — 설치

```sh
npm install @cudoment/cudoc cudoc-markdown-it cudoc-vitepress
```

VitePress는 remark가 아니라 markdown-it을 쓰므로 `cudoc-remark`를 사용하지 않습니다.

## 2단계 — 플러그인 등록

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

여기서는 `both`로 시작하시기를 권합니다. VitePress 사이트에는 대개 `{#id}` 앵커와 `::: warning` 컨테이너가 이미 들어 있는데, `both`로 두면 기존 문서를 고치지 않고도 cudoc이 그것들을 자체 문법과 함께 정규화합니다.

## 3단계 — 스타일시트 가져오기

테마 진입점에서 가져옵니다. `docs/.vitepress/theme/index.js`를 만들거나 기존 파일을 확장하십시오.

```js
import DefaultTheme from "vitepress/theme"
import "@cudoment/cudoc/styles.css"
export default DefaultTheme
```

**문법 확장만 필요하시면 여기서 멈추셔도 됩니다.** 사이트를 실행하면 [Markdown 문법](./syntax.ko.md)의 기능들이 동작합니다. 문서 임베딩이 필요하시면 계속 진행하십시오.

## 4단계 — 수집기 추가

[예제 수집기](../examples/vitepress/collect.mjs)를 사이트 루트에 `collect.mjs`로 복사하십시오. 실제 VitePress 렌더러를 같은 cudoc 옵션으로 구성하고, `createDocumentCompiler(md)`를 수집에 넘긴 뒤 임베드를 준비합니다.

## 5단계 — 렌더러에 라이브러리 연결

```js
import { loadLibrary } from "@cudoment/cudoc/node/library"

// markdown.config(md) 안에서:
md.use(cudoc, {
  syntax: { headingAnchor: "both", callout: "both" },
  library: loadLibrary(".cudoc/documents"),
  outDir: ".cudoc/documents",
})
```

**수집과 렌더링은 모든 Markdown 옵션에서 일치해야 합니다.** 한쪽을 바꾸면 다른 쪽도 바꾸시고, 관련 설정이 바뀌면 `compilerId`를 올리십시오.

## 6단계 — 빌드 전마다 수집 실행

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

수집 감시 기능이 없습니다. 원본 문서를 고치신 뒤에는 수집을 다시 실행하고 **개발 서버도 재시작**하셔야 불러온 라이브러리가 갱신됩니다.

## 7단계 — 독립 HTML도 내보내기 (선택)

```sh
npm install cudoc-html
npx cudoc-html build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

VitePress 빌드 결과와 수집 데이터는 변경되지 않습니다. → [독립 HTML](./html.ko.md)

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
| 사본의 문구 치환   | `replace: [{ find, replace }]`   | [임베딩](./embedding.ko.md#찾기바꾸기)          |

`details` 컨테이너는 펼침 동작을 그대로 유지합니다.

## VitePress에서 알아 둘 점

**경로에 `.html`이 붙습니다.** 수집기는 VitePress의 기본값 `cleanUrls: false`에 맞춰 `routeSuffix: ".html"`을 씁니다. URL 동작이나 `base`, 리라이트, 커스텀 경로를 바꾸시면 수집 경로도 바꾸셔야 합니다.

**Markdown만 다룹니다.** `.md`를 작성하십시오. React `.mdx`는 처리되지 않습니다. → [`.md`와 `.mdx` 선택](./README.ko.md#md와-mdx-선택)

**정적 마크업은 정규화되고 동적 Vue는 되지 않습니다.** 정적 `<Badge type="tip" text="1.0" />`은 cudoc 배지가 됩니다. Vue 바인딩을 담은 배지는 컴포넌트가 실행되기 전까지 글자를 알 수 없으므로 원시 HTML로 남습니다. 임의의 Vue 표현식과 커스텀 플러그인 토큰이 임베드를 통해 옮겨 가는 것은 보장되지 않습니다.

**Eleventy와 공유합니다.** 이 어댑터와 [Eleventy 어댑터](./eleventy.ko.md)는 모두 `cudoc-markdown-it` 위에 있습니다. 두 호스트가 같은 코드로 실제 네이티브 토큰 스트림을 변환하므로 제목과 목차 연동이 동일하게 동작합니다.

## 다음으로

- [문서 임베딩](./embedding.ko.md) — 선택, 다중 소스, 갱신 규칙
- [markdown-it 내부 동작](./api-reference/adapters.ko.md#markdown-it) — 토큰 변환과 호스트 정의
- [실행 가능한 예제](../examples/vitepress/docs/.vitepress/config.mjs) — 동작하는 사이트
