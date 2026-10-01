# Docusaurus

[English](./docusaurus.md) | **한국어** · [전체 가이드](./README.ko.md)

순서대로 따라가시면 됩니다. 1–3단계는 Markdown 문법 확장을 켭니다. 4–6단계는 문서 임베딩을 더합니다. 한 문서가 다른 문서를 재사용할 수 있게 해 주는 기능입니다. 7단계는 선택 사항입니다.

## 1단계 — 설치

```sh
npm install @cudoment/cudoc cudoc-remark cudoc-docusaurus
```

Docusaurus 3.10은 webpack 플러그인을 통해 `serialize-javascript` 6에, 개발 서버를 통해 `uuid` 8에 의존합니다. `npm audit`은 두 패키지 모두에 보안 권고를 보고하지만, Docusaurus가 선언한 버전 범위로는 npm이 수정판을 고를 수 없습니다. [예제 사이트](../examples/docusaurus/package.json)는 수정판을 고정한 상태로 빌드와 개발 서버 실행을 확인했으므로, 같은 `overrides`를 `package.json`에 기존 항목과 함께 추가하고 다시 설치하십시오.

```json
{
  "overrides": {
    "serialize-javascript": "7.1.2",
    "uuid": "11.1.1"
  }
}
```

```sh
npm install
```

Docusaurus 릴리스가 수정판에 직접 의존하게 되면 해당 항목을 지우십시오. 항목이 아직 필요한지는 `npm audit`으로 확인할 수 있습니다.

## 2단계 — remark 플러그인 등록

`docusaurus.config.mjs`에 아래를 병합하고, 사이트의 다른 설정은 그대로 두십시오.

```js
// docusaurus.config.mjs
import { cudocRemarkPlugins } from "cudoc-docusaurus"

export default {
  // Your site's own settings stay as they are.
  title: "My docs",
  url: "https://docs.example.com",
  baseUrl: "/",
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

```css
/* src/css/custom.css — add at the top */
@import "@cudoment/cudoc/styles.css";
```

콜아웃과 배지에 스타일을 입힙니다. 자체 텍스트 색상을 지정하지 않으므로 사이트의 라이트·다크 테마를 그대로 따릅니다.

**문법 확장만 필요하시면 여기서 멈추셔도 됩니다.** 사이트를 실행하면 [Markdown 문법](./syntax.ko.md)의 기능들이 동작합니다. 문서 임베딩이 필요하시면 계속 진행하십시오.

## 4단계 — 임베드 플러그인과 라이브러리 로더 추가

임베드 플러그인은 같은 `docs` 옵션의 `remarkPlugins`에 넣어 Docusaurus 자체 처리 뒤에 실행되게 합니다. 로더는 사이트에 직접 만드는 작은 플러그인에 넣습니다. 둘을 모두 넣은 설정은 다음과 같으며, 사이트의 다른 설정은 그대로 둡니다.

```js
// docusaurus.config.mjs
import path from "node:path"
import { cudocRemarkPlugins } from "cudoc-docusaurus"
import embed from "cudoc-remark/embed"
import { libraryLoader } from "cudoc-remark/loader"

export default {
  // Your site's own settings stay as they are.
  title: "My docs",
  url: "https://docs.example.com",
  baseUrl: "/",
  markdown: { format: "detect" },
  presets: [
    [
      "classic",
      {
        docs: {
          path: "docs",
          routeBasePath: "docs",
          beforeDefaultRemarkPlugins: cudocRemarkPlugins({ syntax: {} }),
          remarkPlugins: [
            [embed, { sourceRoot: "docs", outDir: ".cudoc/documents" }],
          ],
        },
        theme: { customCss: "./src/css/custom.css" },
      },
    ],
  ],
  plugins: [
    () => ({
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
    }),
  ],
}
```

임베드 플러그인은 준비된 내용을 페이지가 컴파일될 때 접합하므로 컴파일된 페이지가 `.cudoc/documents/embeds.json`에 의존합니다. 로더를 등록하면 재수집이 개발 서버와 빌드 캐시가 이미 컴파일한 페이지에도 닿습니다. 파일은 그대로 두고 컴파일 입력에 보이지 않는 참조 정의 한 줄만 더합니다.

규칙의 `include`에 콘텐츠 디렉터리를 꼭 적어야 합니다. Docusaurus는 `.mdx`에 맞는 모든 규칙의 `include`를 모아 대체 MDX 로더를 구성하는데, `include`가 없는 규칙이 있으면 잘못된 webpack 설정이라며 빌드가 멈춥니다. Docusaurus는 설정 파일을 CommonJS로 불러오므로 경로는 `import.meta`가 아니라 작업 디렉터리 기준으로 구합니다.

## 5단계 — 수집기 추가

사이트 루트에 `collect.mjs`를 만드십시오. 실제 Docusaurus MDX 프로세서를 실행해서 Docusaurus가 각 문서에 가하는 변환을 그대로 포착하고, 그 결과를 [`collectDocuments`](./api-reference/node.ko.md#감시)에 넘깁니다. `collectDocuments`는 라이브러리와 준비된 임베드를 함께 쓰므로, 실행이 실패하면 이전 두 결과가 그대로 남습니다.

```js
// collect.mjs
import path from "node:path"
import { createRequire } from "node:module"
import { cudocRemarkPlugins } from "cudoc-docusaurus"
import { createCompilerCapture } from "cudoc-remark"
import { collectDocuments } from "@cudoment/cudoc/node/watch"

// The options docusaurus.config.mjs passes to cudocRemarkPlugins.
const documentOptions = { syntax: {} }

// Docusaurus's own MDX processor, the one @docusaurus/core depends on. It
// is not a public entry point.
const core = createRequire(import.meta.url).resolve(
  "@docusaurus/core/package.json",
)
const { createProcessorUncached } = createRequire(core)(
  "@docusaurus/mdx-loader/lib/processor.js",
)

await collectDocuments({
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  routeBase: "/docs",
  host: "docusaurus",
  // Change it whenever these settings or the Docusaurus version change.
  compilerId: "docusaurus-v1",
  ...documentOptions,
  async compiler(source, { filePath, options }) {
    // An image named through Docusaurus's `@site` alias is recorded at the
    // address the site serves it from, which the check and the export find.
    const capture = createCompilerCapture({ aliases: { "@site/static/": "/" } })
    const processor = await createProcessorUncached({
      format: options.format,
      options: {
        siteDir: process.cwd(),
        // The site's `staticDirectories`, where `/img/…` images resolve.
        staticDirs: [path.resolve("static")],
        admonitions: true,
        removeContentTitle: false,
        // The `markdown` settings of docusaurus.config.mjs, with Docusaurus's
        // defaults for anything the site does not set.
        markdownConfig: {
          anchors: { maintainCase: false },
          hooks: {
            onBrokenMarkdownLinks: "warn",
            onBrokenMarkdownImages: "throw",
          },
          mdx1Compat: { comments: true, admonitions: true, headingIds: true },
          emoji: true,
          mermaid: false,
        },
        beforeDefaultRemarkPlugins: [
          ...cudocRemarkPlugins(documentOptions),
          capture.remark,
        ],
        rehypePlugins: [capture.rehype],
      },
    })
    await processor.process({
      content: source,
      filePath,
      frontMatter: {},
      compilerName: "server",
    })
    return capture.read()
  },
})
```

`sourceRoot`, `outDir`, `routeBase`를 사이트에 맞게 설정하십시오. **수집과 렌더링은 반드시 일치해야 합니다.** 같은 문법 옵션, 같은 네이티브 Markdown 설정을 써야 합니다. 수집기는 문서 옵션을 `documentOptions` 객체 하나에 담아 `collectDocuments` 설정에 펼쳐 넣고, 컴파일러 안의 `cudocRemarkPlugins` 호출에도 넘깁니다. 이 객체에는 사이트 설정이 `cudocRemarkPlugins`에 넘기는 옵션을 그대로 적으십시오. 한쪽을 바꾸면 다른 쪽도 바꿔야 합니다. 정적 디렉터리도 마찬가지입니다. `staticDirs`에 정적 디렉터리를 모두 적고, `aliases`에서 `@site/` 뒤에 각 디렉터리를 붙인 접두어를 Docusaurus가 그 파일을 서비스하는 주소인 `/`로 연결하며, `cudoc.config.mjs`의 `check.assetDirs`와 내보내기마다 쓰는 `--asset-dir`에도 각 디렉터리를 적으십시오. 그러면 `@site/static/img/logo.png`로 쓴 이미지를 `/img/logo.png`로 검사하고 내보냅니다([컴파일러 캡처](./api-reference/adapters.ko.md#컴파일러-캡처)).

> 수집기는 공개 API가 아닌 Docusaurus 내부 프로세서 모듈 `@docusaurus/mdx-loader/lib/processor.js`를 읽습니다. Docusaurus를 올리실 때 다시 확인하십시오. 검증한 버전은 [지원 버전](./README.ko.md#지원-버전)에 있습니다.

## 6단계 — 빌드 전마다 수집 실행

`package.json`에 스크립트를 추가합니다.

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

`cudoc check`는 수집기가 게시한 라이브러리를 읽기만 하고 수집은 하지 않으므로 `collect` 다음에 실행하며, 설정 파일에는 그 라이브러리의 위치와 사이트가 루트 기준 이미지를 제공하는 디렉터리만 적으면 됩니다.

```js
// cudoc.config.mjs
export default {
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  check: { assetDirs: ["static"] },
}
```

수집은 사이트보다 먼저 돌아야 합니다. 글을 쓰는 동안 다시 수집하려면 `collectDocuments` 대신 `@cudoment/cudoc/node/watch`의 [`watchDocuments`](./api-reference/node.ko.md#감시)에 같은 옵션을 넘기세요. 준비된 내용은 임베드 플러그인이 알아서 삽입합니다.

`cudoc check`는 깨진 링크와 앵커, 이미지, 임베드를 한 번에 전부 보고하고 종료 코드를 0이 아닌 값으로 냅니다. 사이트가 생성되기 전에 빌드가 멈춥니다. → [참조 검사](./check.ko.md)

## 7단계 — HTML로도 내보내기 (선택)

방금 수집한 라이브러리를 재사용해 전달용 HTML 묶음을 만듭니다.

```sh
npm install cudoc-export
npx cudoc-export build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/ --asset-dir static
```

Docusaurus 빌드 결과와 수집 데이터는 변경되지 않습니다. → [내보내기](./export.ko.md)

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

## Docusaurus에서 알아 둘 점

**네이티브 문법과 함께 쓰기.** Docusaurus의 admonition과 `{#id}` 제목 id는 그대로 동작합니다. cudoc이 그것들까지 정규화하게 하면 임베드한 사본과 HTML 출력이 같은 의미를 갖게 됩니다.

```js
cudocRemarkPlugins({ syntax: { headingAnchor: "both", callout: "both" } })
```

지원하는 네이티브 형태는 [문법 가이드](./syntax.ko.md)에 정리되어 있습니다.

**제목 id는 쓴 그대로 유지됩니다.** 어댑터는 Docusaurus의 slugger가 바꿀 제목 id를 제목 끝의 `{#id}`로 Docusaurus에 넘기고, Docusaurus는 이 값을 다시 slug로 바꾸지 않고 그대로 씁니다. 그래서 `## 버전 (#v1.2)`은 페이지에서도 목차에서도 `v1.2`로 남습니다. 그 밖의 id는 제목에 그대로 두며, slugger는 이 id를 바꾸지 않고, 뒤에 오는 제목의 글자가 같은 값으로 slug되면 번호를 붙여 구분합니다. 순서가 반대이면 호스트마다 달라집니다. 앞선 제목의 글자가 이미 만든 id를 뒤에서 명시하면(`## Setup` 다음 `## Intro (#setup)`) 여기와 Nextra에서는 명시한 쪽이 `setup-1`이 되지만, VitePress, Eleventy, 독립 내보내기는 명시한 id에 `setup`을 남기고 앞의 제목에 번호를 붙입니다. 명시한 id를 가진 제목을 앞에 쓰거나, 다른 제목에도 id를 직접 지정하십시오. 페이지의 `#` 제목은 항상 id를 제목에 둡니다. Docusaurus가 `{#id}`를 떼어 내기 전에 그 글자에서 페이지 제목을 읽기 때문입니다. 그 제목에는 slug 형태의 id를 쓰십시오. `(#v1.0)` 같은 id는 거기서 `v10`이 됩니다. 임베드로 들어온 제목은 페이지의 앵커가 되지만 목차 항목은 되지 않습니다. Docusaurus가 임베드 플러그인이 실행되기 전에 목차를 만들기 때문입니다.

**형식 자동 판별.** `markdown: { format: "detect" }`는 `.md`를 평범한 Markdown으로 두어 `{value}`가 그대로 글자로 남게 하고, `.mdx`는 MDX로 다룹니다. 직접 만든 React 컴포넌트는 `.mdx`에 작성하십시오. → [`.md`와 `.mdx` 선택](./README.ko.md#md와-mdx-선택)

**테마 플러그인 불필요.** 이 구성에는 cudoc 테마 플러그인도, 컴포넌트 등록도 필요 없습니다. 작성자는 Markdown만 씁니다.

**커스텀 슬러그.** 문서 id와 URL이 다르면 수집기에 `routes`를 넘기시고, 컴파일에 영향을 주는 설정을 바꾸셨다면 `compilerId`를 올리십시오.

## 다음으로

- [문서 임베딩](./embedding.ko.md) — 선택, 다중 소스, 갱신 규칙
- [어댑터 내부 동작](./api-reference/adapters.ko.md#docusaurus와-nextra) — 순서, 캡처, 어댑터가 설정하는 값
- [실행 가능한 예제](../examples/docusaurus/docusaurus.config.mjs) — 동작하는 사이트
