# Docusaurus

[English](./docusaurus.md) | **한국어** · [전체 가이드](./README.ko.md)

순서대로 따라가시면 됩니다. 1–3단계는 Markdown 문법 확장을 켭니다. 4–6단계는 문서 임베딩을 더합니다. 한 문서가 다른 문서를 재사용할 수 있게 해 주는 기능입니다. 7단계는 선택 사항입니다.

## 1단계 — 설치

```sh
npm install @cudoment/cudoc cudoc-remark cudoc-docusaurus
```

## 2단계 — remark 플러그인 등록

`docusaurus.config.mjs`에 아래를 병합하고, 사이트의 다른 설정은 그대로 두십시오.

```js
import { cudocRemarkPlugins } from "cudoc-docusaurus"

export default {
  markdown: { format: "detect" },
  presets: [
    [
      "classic",
      {
        docs: {
          path: "docs",
          routeBasePath: "docs",
          beforeDefaultRemarkPlugins: cudocRemarkPlugins({ syntax: {} }),
        },
        theme: { customCss: "./src/css/custom.css" },
      },
    ],
  ],
}
```

`remarkPlugins`가 아니라 반드시 `beforeDefaultRemarkPlugins`여야 합니다. cudoc이 제목 앵커를 배정하고 나면 Docusaurus가 그 뒤에 자체 제목 id와 목차를 만듭니다. cudoc을 나중에 실행하면 둘이 서로 어긋난 채로 남습니다.

## 3단계 — 스타일시트 가져오기

`src/css/custom.css`에 추가합니다.

```css
@import "@cudoment/cudoc/styles.css";
```

콜아웃과 배지에 스타일을 입힙니다. 자체 텍스트 색상을 지정하지 않으므로 사이트의 라이트·다크 테마를 그대로 따릅니다.

**문법 확장만 필요하시면 여기서 멈추셔도 됩니다.** 사이트를 실행하면 [Markdown 문법](./syntax.ko.md)의 기능들이 동작합니다. 문서 임베딩이 필요하시면 계속 진행하십시오.

## 4단계 — 임베드 플러그인 추가

같은 `docs` 옵션 안에서, 네이티브 처리 뒤에 둡니다.

```js
import embed from "cudoc-remark/embed"

// presets → classic → docs:
remarkPlugins: [[embed, { sourceRoot: "docs", outDir: ".cudoc/documents" }]],
```

이 플러그인은 준비된 내용을 페이지가 컴파일될 때 접합하므로 컴파일된 페이지가 `.cudoc/documents/embeds.json`에 의존합니다. 작은 플러그인으로 같은 파일에 라이브러리 로더를 등록하면 재수집이 개발 서버와 빌드 캐시가 이미 컴파일한 페이지에도 닿습니다. 파일은 그대로 두고 컴파일 입력에 보이지 않는 참조 정의 한 줄만 더합니다.

```js
import path from "node:path"
import { libraryLoader } from "cudoc-remark/loader"

// docusaurus.config.mjs → plugins:
;() => ({
  name: "cudoc-library",
  configureWebpack: () => ({
    module: {
      rules: [
        {
          test: /\.mdx?$/,
          include: [path.resolve("docs")],
          use: [libraryLoader(".cudoc/documents")],
        },
      ],
    },
  }),
})
```

규칙의 `include`에 콘텐츠 디렉터리를 꼭 적어야 합니다. Docusaurus는 `.mdx`에 맞는 모든 규칙의 `include`를 모아 대체 MDX 로더를 구성하는데, `include`가 없는 규칙이 있으면 잘못된 webpack 설정이라며 빌드가 멈춥니다. Docusaurus는 설정 파일을 CommonJS로 불러오므로 경로는 `import.meta`가 아니라 작업 디렉터리 기준으로 구합니다.

## 5단계 — 수집기 추가

[예제 수집기](../examples/docusaurus/collect.mjs)를 사이트 루트에 `collect.mjs`로 복사하십시오. 실제 Docusaurus MDX 프로세서를 실행해서 Docusaurus가 문서에 가하는 변환을 그대로 포착한 뒤 임베드를 준비합니다.

`sourceRoot`, `outDir`, `routeBase`를 사이트에 맞게 설정하십시오. **수집과 렌더링은 반드시 일치해야 합니다.** 같은 문법 옵션, 같은 네이티브 Markdown 설정을 써야 하며, 한쪽을 바꾸면 다른 쪽도 바꿔야 합니다.

> 수집기는 Docusaurus의 내부 프로세서 진입점을 버전에 고정해서 가져옵니다. Docusaurus를 올리실 때 다시 확인하십시오.

## 6단계 — 빌드 전마다 수집 실행

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "check": "cudoc check --config cudoc.config.mjs",
    "start": "npm run collect && docusaurus start",
    "build": "npm run collect && npm run check && docusaurus build"
  }
}
```

수집은 사이트보다 먼저 돌아야 합니다. 글을 쓰는 동안 다시 수집하려면 `buildDocumentsAsync` 대신 `@cudoment/cudoc/node/watch`의 [`watchDocuments`](./api-reference/node.ko.md#감시)에 같은 옵션을 넘기세요. 준비된 내용은 임베드 플러그인이 알아서 삽입합니다.

`cudoc check`는 깨진 링크와 앵커, 이미지, 임베드를 한 번에 전부 보고하고 종료 코드를 0이 아닌 값으로 냅니다. 사이트가 생성되기 전에 빌드가 멈춥니다. → [참조 검사](./check.ko.md)

## 7단계 — 독립 HTML도 내보내기 (선택)

방금 수집한 라이브러리를 재사용해 전달용 HTML 묶음을 만듭니다.

```sh
npm install cudoc-export
npx cudoc-export build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

Docusaurus 빌드 결과와 수집 데이터는 변경되지 않습니다. → [독립 HTML](./export.ko.md)

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

## Docusaurus에서 알아 둘 점

**네이티브 문법과 함께 쓰기.** Docusaurus의 admonition과 `{#id}` 제목 id는 그대로 동작합니다. cudoc이 그것들까지 정규화하게 하면 임베드한 사본과 HTML 출력이 같은 의미를 갖게 됩니다.

```js
cudocRemarkPlugins({ syntax: { headingAnchor: "both", callout: "both" } })
```

지원하는 네이티브 형태는 [문법 가이드](./syntax.ko.md)에 정리되어 있습니다.

**형식 자동 판별.** `markdown: { format: "detect" }`는 `.md`를 평범한 Markdown으로 두어 `{value}`가 그대로 글자로 남게 하고, `.mdx`는 MDX로 다룹니다. 직접 만든 React 컴포넌트는 `.mdx`에 작성하십시오. → [`.md`와 `.mdx` 선택](./README.ko.md#md와-mdx-선택)

**테마 플러그인 불필요.** 이 구성에는 cudoc 테마 플러그인도, 컴포넌트 등록도 필요 없습니다. 작성자는 Markdown만 씁니다.

**커스텀 슬러그.** 문서 id와 URL이 다르면 수집기에 `routes`를 넘기시고, 컴파일에 영향을 주는 설정을 바꾸셨다면 `compilerId`를 올리십시오.

## 다음으로

- [문서 임베딩](./embedding.ko.md) — 선택, 다중 소스, 갱신 규칙
- [어댑터 내부 동작](./api-reference/adapters.ko.md#docusaurus와-nextra) — 순서, 캡처, 어댑터가 설정하는 값
- [실행 가능한 예제](../examples/docusaurus/docusaurus.config.mjs) — 동작하는 사이트
