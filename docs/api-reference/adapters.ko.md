# 어댑터 API와 파이프라인

[English](./adapters.md) | **한국어** · [API 레퍼런스](./README.ko.md)

## remark

소스: [prepare.ts](../../packages/cudoc-remark/src/prepare.ts), [options.ts](../../packages/cudoc-remark/src/options.ts). `cudoc-remark` 또는 `cudoc-remark/prepare`의 기본 export는 `CudocRemarkOptions`를 받는 unified 플러그인 `cudocPrepare`입니다.

권장 옵션은 `DocumentOptions`의 `syntax`, `host`, `format`, `calloutTypes`, `components`, `headingIds`에 `tableColumnLayout`, `toc`, `transforms`를 더한 구성입니다. 옵션을 생략하거나 `syntax: {}`를 전달하면 컴포넌트 없는 기본 설정을 사용합니다. 플러그인은 frontmatter 파싱을 설치하고 공통 Docusaurus 파이프라인에 directive 파싱을 추가합니다. GFM은 호스트 또는 `remark-gfm`으로 설치합니다.

파이프라인 동작:

1. 옵션을 해석하고 알 수 없는 최상위 키를 거부합니다.
2. 기본적으로 YAML 콘텐츠 노드를 제거하고 소스와 함께 `normalizeDocument`를 호출합니다. 진단은 VFile에 추가합니다. 파일 경로가 없거나 `format: "md"`를 명시해도 적용합니다.
3. 정규화 후 순회에서 사용자 `transforms.pre`/`post`를 실행합니다. 여기서 pre/post는 순회 진입·종료를 뜻하며 내장 정규화 전·후가 아닙니다.
4. 선택적 TOC를 수집하고 적용 형식이 `mdx`일 때만 ESM export를 추가합니다. 명시한 `format`은 파일 확장자보다 우선합니다.

`headingMetadata`, 최상위 `badge`, 최상위 `tableCellList`를 명시한 MDX 파이프라인만 하위 수준의 이름 있는 컴포넌트 변환을 선택합니다. 이 옵션은 `syntax`와 함께 지정할 수 없으며 오류가 발생합니다. Markdown 파일은 항상 공통 정규화를 사용하므로 컴포넌트 전용 옵션 대신 `syntax`로 기능을 설정합니다. 기본 작성 환경에는 `Anchor`나 `Badge` 등록이 필요하지 않습니다. 하위 변환 테스트는 명시적으로 해당 경로를 선택하고, 기본 렌더링은 컴포넌트 provider 없이 검증합니다.

`toc` 기본값은 false입니다. `toc: true`이면 `{ titleDepth: 1, depths: [2,3], exportName: "toc" }`를 사용합니다. titleDepth는 false가 가능하고 수집 깊이는 1~6 중 한두 항목을 지정합니다. `Toc`는 `{ title: string | null, headings: { id, text, children: { id, text }[] }[] }`입니다. 링크 가능한 제목만 수집합니다. 추가 옵션으로 앵커 이름과 배지 구분자를 조정합니다. Docusaurus·Nextra는 목차를 호스트가 소유하므로 `toc`를 거부합니다.

지원 함수로 `getFileSource(file) → string | null`, `resolveOptions(options?)`, `buildTransforms(resolved) → {pre, post}`를 제공합니다. `buildTransforms`는 이름 있는 컴포넌트 변환 순서를 구성하며 `normalizeDocument`를 대체하지 않습니다.

### remark 진입점

| Import                             | Export·역할                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `cudoc-remark`                     | 기본·이름 export `cudocPrepare`, 옵션 타입·해석, 변환, TOC 도우미, 제목 ID 반영, 호스트 팩토리, `createCompilerCapture` |
| `cudoc-remark/prepare`             | 준비 플러그인, 변환·소스 도우미                                                                                         |
| `cudoc-remark/heading-ids`         | 기본·이름 export `promoteAnchorIds`; 설정된 앵커 ID를 제목 HTML 데이터로 복사                                           |
| `cudoc-remark/host-plugins`        | `createHostPlugins`, `HostPluginOptions`                                                                                |
| `cudoc-remark/badge`               | 배지 변환·해석·기본값                                                                                                   |
| `cudoc-remark/table-cell-list`     | 셀 목록 변환과 파싱                                                                                                     |
| `cudoc-remark/table-column-layout` | 배치 변환·옵션·표 생성·분할                                                                                             |
| `cudoc-remark/toc`                 | `createToc`, `resolveTocOptions`, `collectHeadingToc`, `addTocExport`, TOC 타입·기본 export 이름                        |
| `cudoc-remark/embed`               | 준비된 임베드 삽입 플러그인                                                                                             |
| `cudoc-remark/runtime`             | 생성 import가 사용하는 React HTML 래퍼 `EmbeddedDocument({ tree })`                                                     |
| `cudoc-remark/components`          | 하위 컴포넌트 출력용 `Anchor`, `Badge`, `cudocComponents`                                                               |

변환 함수는 프로세스 안에서 실행할 수 있지만 함수 옵션은 JSON 전용 번들러 worker 경계를 통과하지 못합니다. Next.js Turbopack에는 패키지 이름 문자열과 직렬화 가능한 옵션을 전달합니다.

## 컴파일러 캡처

소스: [capture.ts](../../packages/cudoc-remark/src/capture.ts). `createCompilerCapture`는 `cudoc-remark`에서 가져옵니다.

```ts
createCompilerCapture(): {
  remark: Plugin<[], Root>
  rehype: Plugin
  read(): CompiledDocument
}
```

컴파일마다 캡처 객체를 하나 생성합니다. remark 플러그인은 현재 트리 참조를 보관하고, rehype 플러그인은 호스트 remark 처리 후 트리를 복제하여 정적 HTML JSX 변환·YAML/ESM 제거를 수행합니다. frontmatter는 `file.data.frontMatter` 또는 `file.data.frontmatter`에서 읽습니다. 캡처 단계까지 컴파일하지 않으면 `read()`가 오류를 발생시킵니다.

현재 캡처 결과의 `diagnostics`는 `[]`이며 호스트 VFile 경고를 복사하지 않습니다. 최종 remark 트리를 대상으로 하며 이후 임의 rehype 변환이나 컴포넌트 실행 결과는 포함하지 않습니다. 수집기가 원문 스냅샷을 만들 때까지 소스 위치를 보존해야 합니다.

수집할 때는 cudoc 문법과 캡처를 설치하되 준비된 임베드 삽입 플러그인은 제외합니다. 전체 문서 수집 후 resolver가 읽도록 `cudoc-embed` 코드 블록을 유지합니다. 수집과 치환에는 동일한 플러그인·설정을 적용한 실제 호스트 프로세서를 사용합니다.

## 준비된 임베드 삽입

소스: [embed.ts](../../packages/cudoc-remark/src/embed.ts), [runtime.tsx](../../packages/cudoc-remark/src/runtime.tsx).

`cudoc-remark/embed`의 기본 export는 `{ sourceRoot?: string, outDir?: string }`를 받으며 기본값은 `docs`, `.cudoc/documents`입니다. `file.path`에서 확장자 없는 ID를 구하고 블록 번호를 매기며 `file.value`로 준비 데이터의 최신 상태를 검사합니다. 각 코드 블록을 `embeds.json`의 트리를 사용하는 생성 MDX로 바꿉니다.

문서마다 한 번 `cudoc-remark/runtime`과 상대 JSON 경로를 import합니다. JSON이 번들러 의존성이 되어 캐시된 임베드 페이지도 새 준비 데이터를 반영할 수 있습니다. 코드 블록이 있는 문서만 준비 데이터를 읽습니다. 런타임은 `renderDocument`의 HTML을 삽입하며 작성자의 React 컴포넌트를 평가하거나 사용자 렌더러 옵션을 받지 않습니다. 작성자는 cudoc 컴포넌트를 등록하지 않습니다.

## Docusaurus와 Nextra

소스: [host-plugins.ts](../../packages/cudoc-remark/src/host-plugins.ts), [Docusaurus](../../packages/cudoc-docusaurus/src/index.ts), [Nextra](../../packages/cudoc-nextra/src/index.ts).

두 패키지는 `cudocRemarkPlugins(options?) → PluggableList`, `promoteAnchorIds`, 옵션 타입을 제공합니다. `HostPluginOptions`는 `CudocRemarkOptions`에서 `toc`를 빼고 기본 true인 `promoteHeadingIds?: boolean`을 더합니다. 공통 팩토리는 호스트를 선택하고 `headingIds: "host"`를 강제하며 cudoc TOC를 끕니다. 명시적으로 해제하지 않으면 제목 ID 반영 플러그인을 추가합니다.

| 호스트     | 설치 위치                                                        | 실제 수집 예제                                                               |
| ---------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Docusaurus | `docs.beforeDefaultRemarkPlugins`; 임베드는 `docs.remarkPlugins` | 실제 MDX 프로세서의 [collect.mjs](../../examples/docusaurus/collect.mjs)     |
| Nextra     | 호스트 플러그인 앞에 추가되는 `mdxOptions.remarkPlugins`         | `nextra/compile`을 사용하는 [collect.mjs](../../examples/nextra/collect.mjs) |

Docusaurus는 `{ name, getThemePath }`를 반환하는 기본 플러그인과 `./package.json`도 제공합니다. 이 플러그인은 이름 있는 컴포넌트의 테마 매핑용이며 가이드의 명시적 `syntax` 설정에는 필요하지 않습니다. Nextra는 `./components`, `./package.json`을 추가 제공하며 마찬가지로 해당 설정에 컴포넌트 매핑은 필요하지 않습니다.

Docusaurus 예제는 버전별 내부 MDX 프로세서 진입점을 사용합니다. 의존성 업그레이드 때 다시 확인합니다. 호스트 이름만 지정한다고 독립 파싱과 실제 호스트 파이프라인이 같아지지는 않습니다.

## markdown-it

소스: [tokens.ts](../../packages/cudoc-markdown-it/src/tokens.ts), [plugin.ts](../../packages/cudoc-markdown-it/src/plugin.ts), [compiler.ts](../../packages/cudoc-markdown-it/src/compiler.ts), [options.ts](../../packages/cudoc-markdown-it/src/options.ts), [host.ts](../../packages/cudoc-markdown-it/src/host.ts). `cudoc-markdown-it`에서 import합니다.

```ts
installHostPlugin(md: MarkdownIt, options: HostPluginOptions, host: MarkdownItHost): void
createHostCompiler(md: MarkdownIt, host: MarkdownItHost): DocumentCompiler
tokensToAst(
  tokens: Token[],
  source: string,
  options?: DocumentOptions,
  conversion?: TokenConversion,
): Root
resolveHostOptions(options: HostPluginOptions, adapter: string): HostPluginOptions
```

이 패키지는 markdown-it 계열에서 `cudoc-remark`와 같은 역할을 담당합니다. 공통 구성이 여기에 있고 각 호스트 어댑터는 `MarkdownItHost` 정의만 제공합니다. `HostPluginOptions`는 `DocumentOptions`에서 `host`/`format`을 빼고 선택적 `onDocument(tree, source, env)`, `library`, `outDir`(준비 데이터 기본 경로 `.cudoc/documents`)을 더합니다. `resolveHostOptions`는 플러그인을 설치하는 시점에 실행되므로, 알 수 없는 키나 객체가 아닌 인자, `"host"`가 아닌 `headingIds`는 첫 문서가 아니라 사이트 설정을 불러오는 동안 오류가 됩니다. 플러그인은 해당 호스트의 의미와 `format: "md"`, 호스트 제목 생성을 사용합니다.

`MarkdownItHost`는 호스트 생성기마다 다른 동작을 모두 명시합니다.

| 필드                      | 필수   | 효과                                                                                              |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| `adapter`                 | 예     | 패키지 이름이며 공통 파이프라인이 발생시키는 모든 오류의 접두사로 사용됩니다.                     |
| `host`                    | 예     | `normalizeDocument`에 전달되어 네이티브 문법을 선택하는 `Host` 값입니다.                          |
| `documentId(env)`         | 예     | 호스트의 markdown-it env에서 읽는 수집 문서 ID이며 임베드가 이 값을 기준으로 해석됩니다.          |
| `compilerEnv(context)`    | 아니오 | 호스트 빌드 밖에서 실행되는 수집 과정에서 그 env를 다시 구성합니다.                               |
| `token(token, context)`   | 아니오 | 호스트 자체 markdown-it 플러그인이 만든 토큰을 공통 변환보다 먼저 처리합니다.                     |
| `resolveInlineAttributes` | 아니오 | 링크 목적지를 렌더러 규칙에서 확정하는 호스트를 위해 인라인 토큰 사본을 먼저 렌더링합니다.        |
| `frontmatter(source)`     | 아니오 | markdown-it 밖에서 frontmatter를 제거하는 호스트를 위해 수집도 같은 토큰에 도달하도록 분리합니다. |

`tokensToAst`는 실제 markdown-it 토큰을 호스트 처리 후 mdast로 변환하며 Markdown을 두 번 파싱하지 않습니다. 모든 호스트가 공통으로 만드는 블록·인라인 토큰과 함께 `github_alert_*`, `markdown-it-container` 블록을 처리합니다. `container_details_*`는 펼칠 수 있는 `details` 인용문이 되고 그 외 컨테이너는 콜아웃이 됩니다. 호스트의 `token` 훅이 공통 변환보다 먼저 호출되므로 호스트 고유 요소가 기본 변환을 대체할 수 있습니다. 표 셀 인라인 파싱도 같은 설정의 파서를 사용합니다. 매핑이 없는 토큰은 누락하지 않고 `conversion.adapter`를 포함한 오류를 발생시킵니다.

변환한 트리가 remark 계열과 같은 의미를 갖도록 세 가지를 처리합니다. markdown-it이 각 셀의 인라인 스타일로만 알려 주는 열 정렬을 표 노드의 `align` 배열로 모읍니다. 제목 퍼머링크는 정규화보다 먼저, 토큰을 변환하는 시점에 `data.cudoc.kind: "permalink"`로 표시하므로 제목 본문을 읽는 모든 변환이 이를 제외할 수 있습니다. 이 퍼머링크의 `href`는 ID가 확정된 뒤에 보정합니다. 그리고 호스트가 제목 없는 `> [!TIP]`에 자기 타입 이름을 제목으로 넣는 경우, 타입을 그대로 반복하는 제목은 제거하므로 같은 Markdown이 모든 호스트에서 같은 콜아웃이 됩니다.

플러그인은 `md.core` 규칙 하나를 추가하므로, cudoc이 읽는 시점에 네이티브 앵커·링크·컨테이너가 이미 토큰으로 존재합니다. 정규화가 끝나면 확정된 제목 ID와 제목 문구를 호스트의 `heading_open` 토큰에 다시 기록하며, 이 동작이 호스트의 제목 앵커와 목차를 일치시킵니다. 이어서 렌더러 래퍼가 호스트 렌더링의 부수 효과 이후 정규화된 HTML을 제공합니다. `env.cudoc`은 `{ tree, source, diagnostics }`, `env.cudocRendered`는 HTML을 저장하고, `onDocument`는 임베드 확장 전 복제한 트리를 받습니다.

일반 렌더링에서 동기 컴파일러가 있는 라이브러리는 임베드를 직접 처리할 수 있습니다. 컴파일러 없이 로딩한 라이브러리는 `embeds.json`을 읽습니다. 라이브러리 누락, 오래된 소스, 없는 준비 블록은 오류입니다.

`createHostCompiler`는 `env.cudocCollect: true`로 렌더링해 임베드 확장을 생략합니다. frontmatter 처리 후 소스 offset을 복원하고 frontmatter·진단을 반환합니다. `md`에 어댑터가 먼저 설치되어 있어야 하며 React `.mdx`는 거부합니다. 치환에도 같은 설정의 렌더러를 사용합니다.

## VitePress와 Eleventy

소스: [VitePress](../../packages/cudoc-vitepress/src/index.ts), [Eleventy](../../packages/cudoc-eleventy/src/index.ts).

두 패키지 모두 기본 markdown-it 플러그인과 `createDocumentCompiler(md)`를 내보내며 `cudoc-markdown-it`에 위임합니다. `VitePressOptions`와 `EleventyOptions`는 모두 `HostPluginOptions`입니다.

```ts
// 기본 플러그인: md.use(cudocVitePress, options) 또는 md.use(cudocEleventy, options)
createDocumentCompiler(md: MarkdownIt): DocumentCompiler
createMarkdownRenderer( // cudoc-eleventy 전용
  options?: EleventyOptions,
  configure?: (md: MarkdownIt) => void,
): MarkdownIt
```

| 호스트    | 사이트와 수집기가 공유하는 렌더러           | 문서 ID                 | 호스트 정의                                    |
| --------- | ------------------------------------------- | ----------------------- | ---------------------------------------------- |
| VitePress | `vitepress`의 `createMarkdownRenderer`      | `env.relativePath`      | `<Badge>` 토큰 변환, `resolveInlineAttributes` |
| Eleventy  | `cudoc-eleventy`의 `createMarkdownRenderer` | `env.page.filePathStem` | gray-matter frontmatter 분리, 재작성 소스 검사 |

VitePress는 일부 링크를 인라인 렌더링 시점에 확정하므로 정의에 `resolveInlineAttributes`를 설정하고, 파이프라인이 토큰 사본을 렌더링해 URL을 얻으면서 원본 토큰에 base 경로가 두 번 적용되는 것을 방지합니다. `token` 훅은 정적인 `<Badge type="tip" text="1.0" />`을 cudoc 배지로 변환하며, Vue 바인딩이 붙은 배지는 컴포넌트가 실행되기 전까지 문구를 알 수 없으므로 원본 HTML로 남깁니다. 지원하는 정적 컨테이너·링크·배지를 처리하고 동적 Vue 표현식은 평가하지 않습니다.

Eleventy는 페이지 데이터 객체를 markdown-it env로 전달하고 markdown-it보다 먼저 gray-matter로 frontmatter를 제거하므로, 정의에서 `documentId`와 `frontmatter`를 모두 제공합니다. `createMarkdownRenderer`는 Eleventy 자체 렌더러 기본값(`html: true`, 들여쓰기 코드 블록 비활성화)을 적용하고 사이트의 `configure` 콜백을 실행한 뒤 cudoc을 마지막에 설치하므로, 사이트가 등록한 fence 렌더러를 감싸게 됩니다. 사이트 설정 두 가지는 권고가 아니라 계약입니다. 첫째로 `markdownTemplateEngine: false`가 필요한데, `page.rawInput`을 통해 다른 엔진이 소스를 이미 다시 쓴 것을 확인하면 어댑터가 오류를 발생시키기 때문입니다. 둘째로 제목 퍼머링크를 제목 안쪽에 삽입해야 하는데, 제목을 감싸는 퍼머링크는 cudoc이 `(#id)` 앵커를 읽는 제목 본문을 제목 밖으로 옮겨 버리기 때문입니다. 네이티브 문법은 사이트가 등록한 플러그인에서 나오므로 `{#id}`에는 `markdown-it-attrs`, `::: warning 제목`에는 `markdown-it-container`가 필요합니다.

렌더러 수명은 각 수집기([VitePress](../../examples/vitepress/collect.mjs), [Eleventy](../../examples/eleventy/collect.mjs)), 경로 설정은 각 호스트 가이드([VitePress](../vitepress.ko.md), [Eleventy](../eleventy.ko.md))를 참고하세요.

## HTML

소스·import: [index.ts](../../packages/cudoc-html/src/index.ts), `cudoc-html`.

```ts
type SiteLinkMode = "relative" | "host" | "none"

buildSite(options: SiteOptions): {
  outDir: string
  documentCount: number
  libraryDir: string
}
```

`SiteOptions`는 `DocumentOptions`에 다음 필드를 추가합니다. `SiteOptions`, `SiteLinkMode`는 공개 타입이며 반환 경로는 절대 경로입니다. `siteStyles`는 기본 CSS 문자열입니다.

| 옵션            | 타입 / 기본값                                                      | 계약                                                                                                            |
| --------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `sourceRoot`    | 필수 `string`                                                      | 자산 해석과 출력 보호에 사용하는 소스 루트. `library`를 지정해도 필수입니다.                                    |
| `outDir`        | 필수 `string`                                                      | 소스·라이브러리·자산 루트와 분리한 사이트 전용 출력 경로.                                                       |
| `title`         | `string`, `"Documentation"`                                        | 사이트 머리말과 페이지 제목 접미사.                                                                             |
| `navigation`    | `string[]`, 전체 ID                                                | 먼저 표시할 기존 문서 ID. 나머지 문서가 뒤에 이어집니다.                                                        |
| `css`           | 선택적 `string`                                                    | 기본 스타일 뒤에 추가할 로컬 CSS 파일.                                                                          |
| `libraryDir`    | `string`, `path.join(path.dirname(outDir), ".cudoc", "documents")` | `library`가 없을 때 수집 출력. `library`를 지정하면 무시합니다.                                                 |
| `library`       | 선택적 `string`                                                    | 컴파일하거나 다시 출력하지 않고 읽을 기존 수집 라이브러리 디렉터리.                                             |
| `links`         | `SiteLinkMode`, `"relative"`                                       | 출력 전체의 하이퍼링크 정책.                                                                                    |
| `hostUrl`       | 선택적 `string`, `"host"`에서 필수                                 | 기본 경로를 포함한 HTTP(S) 절대 배포 URL. 인증정보·쿼리·프래그먼트를 허용하지 않으며 마지막 `/`를 정규화합니다. |
| `assetDirs`     | `string[]`, `[]`                                                   | `sourceRoot` 다음 순서대로 탐색할 URL 루트 자산 디렉터리.                                                       |
| `renderOptions` | 선택적 `RenderOptions`                                             | HTML 컴포넌트 콜백과 코드 강조 재정의. [렌더링](./document.ko.md#컴포넌트와-렌더링) 참고.                       |

동기 생성기는 두 입력 경로를 제공합니다.

1. `library`가 없으면 `host: "html"`로 `libraryDir`에 수집하고 해당 컴파일러로 임베드를 처리합니다. 나머지 `DocumentOptions`는 수집에 적용합니다.
2. `library`가 있으면 `loadLibrary`로 읽고 저장된 트리를 복제합니다. [library.ts](../../packages/cudoc-html/src/library.ts)는 문서 ID·원문·코드 블록 순서에 맞춰 `readPreparedEmbeds`의 블록을 삽입합니다. 비동기 호스트의 컴파일과 원문 치환 결과도 재컴파일 없이 사용할 수 있습니다. 수집이 설정을 소유하므로 `library`와 함께 `DocumentOptions`를 지정하면 오류입니다. 공유 라이브러리 파일은 쓰지 않습니다.

임베드 코드 블록이 있는 문서만 준비 데이터를 읽습니다. 준비 누락·오래된 준비 데이터·블록 누락은 오류입니다. 검증 기준은 저장된 원문 스냅샷과 manifest 지문이며 모든 현재 소스 파일을 스냅샷과 비교하지는 않습니다. 소스·경로·컴파일러가 바뀌면 다시 수집하고 준비해야 합니다. `library`를 지정하면 반환값의 `libraryDir`는 해당 입력 경로입니다.

렌더링은 `renderDocument`와 기본 highlight.js를 사용하며 알 수 없는 언어는 이스케이프한 코드로 표시합니다. `renderOptions`로 기본 렌더링 옵션을 재정의하고 명시적인 컴포넌트 콜백을 전달합니다. frontmatter `title`은 탐색·페이지 제목, `lang`은 언어(기본 `en`)입니다. 생성기는 CSS·탐색·목차를 추가하며 필요하면 index를 생성합니다.

`siteStyles`는 토큰으로 구성되며 테마를 인식하는 스타일시트입니다. 라이트 팔레트를 `:root`의 사용자 정의 속성으로 정의하고 `prefers-color-scheme: dark`에서는 그 속성만 다시 정의하므로, 스크립트 없이 시스템 설정이 테마를 선택합니다. 인쇄 블록을 제외하면 어떤 규칙에도 색을 직접 쓰지 않으며, 두 테마 모두에서 모든 전경·표면 조합이 WCAG AA를 충족합니다. 본문 텍스트는 4.5:1, 포커스 링은 3:1입니다.

| 토큰 묶음    | 속성                                                                                          | 용도                                                           |
| ------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 표면         | `--canvas`, `--paper`, `--wash`, `--row-alt`                                                  | 페이지 바닥, 본문 표면, 코드와 패널 채움, 표의 교차 행         |
| 텍스트       | `--ink`, `--muted`, `--faint`                                                                 | 본문 색, 보조 문장, 작은 레이블                                |
| 선           | `--line`, `--line-soft`                                                                       | 영역 구분선과 행 구분선                                        |
| 강조와 상태  | `--accent`, `--accent-soft`, `--warn`, `--warn-wash`, `--danger`, `--danger-wash`             | 링크와 활성 내비게이션, 그리고 콜아웃 심각도마다 대응하는 표면 |
| 코드         | `--code-keyword`, `--code-string`, `--code-comment`, `--code-number`                          | highlight.js 토큰 색                                           |
| 타이포그래피 | `--font-sans`, `--font-mono`, `--text-xs` … `--text-3xl`, `--leading-body`, `--leading-tight` | 폰트 스택과 모듈러 스케일                                      |
| 레이아웃     | `--space-1` … `--space-12`, `--radius`, `--measure`, `--head-h`, `--ease`                     | 4px 간격 격자, 모서리 반경, 한 줄 길이 상한, 헤더 높이, 전환   |

글자 크기는 고정 픽셀 루트가 아니라 브라우저의 기본 크기에서 확대·축소하므로 독자의 글자 크기 설정을 존중합니다. `html`이 `font-size: 100%`이고 본문은 `--text-base`(0.9375rem)에 `--leading-body`(1.7)를 적용합니다. 폰트 스택은 IBM Plex Sans와 JetBrains Mono를 먼저 지정하고 플랫폼 UI 폰트와 한글 폰트로 이어지며, 어떤 폰트도 내려받지 않으므로 `file://`과 오프라인에서 그대로 동작합니다. 본문은 `--measure`(72ch)로 한 줄 길이를 제한하고, 제목과 표, 코드 블록, 콜아웃은 본문 열 전체 폭을 사용합니다.

페이지 구조는 고정 헤더와 고정 문서 사이드바, 제목 목차가 그 열 양옆에 놓인 형태이며 1024px에서 두 열, 768px에서 한 열로 접힙니다. 한 열이 되면 내비게이션 대상의 높이가 2.75rem으로 커집니다. 표는 전체 테두리 격자 대신 가로 구분선과 교차 행 배경, 레이블 형태의 머리글, 고정폭 숫자를 사용하며 페이지를 넓히지 않고 가로로 스크롤합니다. 상호작용 상태는 `--ease`로 전환하고 `prefers-reduced-motion`에서는 1ms로 줄어듭니다. `css`는 이 스타일 뒤에 덧붙여지므로 규칙을 다시 쓰지 않고 속성만 재정의해서 디자인을 바꿉니다. 인쇄 규칙은 흰 바탕에 검은 글자를 강제하고, 헤더와 두 내비게이션 열을 숨기고, 줄 길이 제한을 해제하고, 표 머리글을 페이지마다 반복합니다.

### HTML 링크와 자산

[links.ts](../../packages/cudoc-html/src/links.ts)는 소스 ID와 수집된 경로에서 링크 대상을 해석합니다. Markdown 경로는 소스 ID, 고유 URL 경로는 라우트를 우선합니다. 루트 기준·소스 기준·배포 기본 경로 포함·커스텀 경로를 지원하며 쿼리와 프래그먼트를 보존합니다.

- `relative`: 문서를 로컬 `.html` 출력으로 연결합니다. 프래그먼트만 있는 링크는 로컬에, 외부 URL은 그대로 유지합니다. 나머지 내부 링크 대상은 복사할 수 있는 파일이어야 합니다.
- `host`: 문서를 `hostUrl`과 저장된 경로로 연결하며 기존 기본 경로를 중복 추가하지 않습니다. 프래그먼트만 있는 링크는 배포된 현재 문서로 연결합니다. 그 밖의 루트 경로는 배포 기본 경로, 상대 경로는 배포된 현재 문서 URL을 기준으로 해석합니다. 외부 스킴 URL과 프로토콜 상대 URL은 유지합니다. 원격 링크 검사는 수행하지 않습니다.
- `none`: `<a>`를 `<span>`으로 바꾸고 `<a>`·`<area>`의 하이퍼링크 속성을 제거합니다. 텍스트·ID·중첩 마크업·이미지는 보존합니다. 제거한 링크의 대상은 해석하거나 복사하지 않습니다. 스크립트·이벤트 핸들러 정화가 아닌 하이퍼링크 제거입니다.

본문·raw HTML·렌더러 콜백·임베드·생성된 머리말·탐색·목차·각주·자동 index를 포함한 전체 페이지에 정책을 적용합니다. 로컬 본문 바로가기 링크는 `relative`에서만 생성합니다. 수집의 `syntax.link`와 별개의 옵션입니다.

렌더링 자원(`src`, 작성한 스타일시트 `<link href>`)은 별도로 처리하며 로컬 자원은 모든 모드에서 로컬에 유지합니다. 소스 문서 디렉터리를 기준으로 `sourceRoot`에서 찾은 뒤 선택적 배포 기본 경로를 제거한 URL 루트 경로로 `assetDirs`를 탐색합니다. 참조 파일은 복사하고 상대 출력 URL로 연결하며 외부 자원은 그대로 유지합니다. CSS import·`url()` 의존성·`srcset` 후보를 재귀적으로 묶는 번들러는 아닙니다.

잘못된 링크 모드·URL, 빈 입력, 없는 탐색 ID, 자산 누락, 자산·출력 충돌, 동일 출력 경로를 공유하는 서로 다른 자산, 미지원 노드, 잘못된 출력 디렉터리는 오류입니다. `sourceRoot`와 모든 `assetDirs` 루트를 벗어나는 로컬 하이퍼링크나 리소스는 URL과 그것을 담고 있는 문서를 함께 알리는 로컬 대상 누락 오류로 보고하며, 해당 루트 밖에서 복사하지 않습니다. 소스·라이브러리·자산 루트와 출력이 겹치면 쓰기 전에 거부합니다. 사이트는 임시 디렉터리에서 생성해 교체하므로 실패 시 이전 사이트를 보존합니다. 수집 모드에서는 라이브러리와 사이트 출력이 별개이므로 사이트 실패 시 새 라이브러리를 되돌리지는 않습니다. 재사용 모드에서는 라이브러리를 변경하지 않습니다. HTML은 정화하지 않고 React·Vue 코드는 실행하지 않습니다. 사이트 기본 구조에 클라이언트 JavaScript 의존성은 없습니다.

CLI([소스](../../packages/cudoc-html/src/cli.ts)):

```sh
cudoc-html build [sourceRoot] [--out-dir site]
cudoc-html build --config site.config.mjs
cudoc-html build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/ --asset-dir public
cudoc-html build docs --library .cudoc/documents --out-dir shared-html --links none
```

CLI 기본값은 `docs`, `site`입니다. ESM 설정은 객체를 기본 export하며 JSON도 지원합니다. 함수 콜백은 ESM 또는 코드 API가 필요합니다. 명시적인 소스, `--out-dir`, `--library`, `--links`, `--host-url`는 설정보다 우선합니다. 반복한 `--asset-dir`는 배열로 모아 설정의 `assetDirs`를 대체합니다. 상대 경로는 실행 디렉터리 기준입니다. 성공하면 빌드 결과 JSON을 출력하고 오류 시 종료 코드는 1입니다. watch나 단일 파일 번들링 명령은 없습니다.
