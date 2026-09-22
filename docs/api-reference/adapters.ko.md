# 어댑터 API와 파이프라인

[English](./adapters.md) | **한국어** · [API 레퍼런스](./README.ko.md)

## remark

소스: [prepare.ts](../../packages/cudoc-remark/src/prepare.ts), [options.ts](../../packages/cudoc-remark/src/options.ts). `cudoc-remark` 또는 `cudoc-remark/prepare`의 기본 export는 `CudocRemarkOptions`를 받는 unified 플러그인 `cudocPrepare`입니다.

권장 옵션은 `DocumentOptions`의 `syntax`, `host`, `format`, `calloutTypes`, `components`, `headingIds`, `tableColumnWidths`, `ignoreDiagnostics`에 `tableColumnLayout`, `toc`, `transforms`를 더한 구성입니다. `tableColumnWidths`는 `tableColumnLayout`과 같은 검증을 거쳐 그보다 먼저 실행되고, `ignoreDiagnostics`는 `normalizeDocument`에 그대로 전달됩니다([문서 옵션](./document.ko.md#문서-옵션)). 옵션을 생략하거나 `syntax: {}`를 전달하면 컴포넌트 없는 기본 설정을 사용합니다. 플러그인은 frontmatter 파싱을 설치하고 공통 Docusaurus 파이프라인에 directive 파싱을 추가합니다. GFM은 호스트 또는 `remark-gfm`으로 설치합니다.

파이프라인 동작:

1. 옵션을 해석하고 알 수 없는 최상위 키를 거부합니다.
2. 기본적으로 YAML 콘텐츠 노드를 제거하고 소스와 함께 `normalizeDocument`를 호출합니다. 진단은 VFile에 추가합니다. 파일 경로가 없거나 `format: "md"`를 명시해도 적용합니다.
3. 정규화 후 순회에서 사용자 `transforms.pre`/`post`를 실행합니다. 여기서 pre/post는 순회 진입·종료를 뜻하며 내장 정규화 전·후가 아닙니다.
4. 선택적 TOC를 수집하고 적용 형식이 `mdx`일 때만 ESM export를 추가합니다. 명시한 `format`은 파일 확장자보다 우선합니다.

`headingMetadata`, 최상위 `badge`, 최상위 `tableCellList`를 명시한 MDX 파이프라인만 하위 수준의 이름 있는 컴포넌트 변환을 선택합니다. 이 옵션은 `syntax`와 함께 지정할 수 없으며 오류가 발생합니다. Markdown 파일은 항상 공통 정규화를 사용하므로 컴포넌트 전용 옵션 대신 `syntax`로 기능을 설정합니다. 기본 작성 환경에는 `Anchor`나 `Badge` 등록이 필요하지 않습니다. 하위 변환 테스트는 명시적으로 해당 경로를 선택하고, 기본 렌더링은 컴포넌트 provider 없이 검증합니다.

`toc` 기본값은 false입니다. `toc: true`이면 `{ titleDepth: 1, depths: [2,3], exportName: "toc" }`를 사용합니다. titleDepth는 false가 가능하고 수집 깊이는 1~6 중 한두 항목을 지정합니다. `Toc`는 `{ title: string | null, headings: { id, text, children: { id, text }[] }[] }`입니다. 링크 가능한 제목만 수집합니다. 추가 옵션으로 앵커 이름과 배지 구분자를 조정합니다. Docusaurus·Nextra는 목차를 호스트가 소유하므로 `toc`를 거부합니다.

지원 함수로 `getFileSource(file) → string | null`, `resolveOptions(options?)`, `buildTransforms(resolved) → {pre, post}`를 제공합니다. `buildTransforms`는 이름 있는 컴포넌트 변환 순서를 구성하며 `normalizeDocument`를 대체하지 않습니다.

### remark 진입점

| Import                             | Export·역할                                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `cudoc-remark`                     | 기본·이름 export `cudocPrepare`, 옵션 타입·해석, 변환, TOC 도우미, 제목 ID 반영, 호스트 팩토리, `createCompilerCapture`    |
| `cudoc-remark/prepare`             | 준비 플러그인, 변환·소스 도우미                                                                                            |
| `cudoc-remark/heading-ids`         | 기본·이름 export `promoteAnchorIds`; 설정된 앵커 ID를 제목 HTML 데이터로 복사                                              |
| `cudoc-remark/host-plugins`        | `createHostPlugins`, `HostPluginOptions`                                                                                   |
| `cudoc-remark/badge`               | 배지 변환·해석·기본값                                                                                                      |
| `cudoc-remark/table-cell-list`     | 셀 목록 변환과 파싱                                                                                                        |
| `cudoc-remark/table-column-layout` | 배치 변환·옵션·표 생성·분할                                                                                                |
| `cudoc-remark/toc`                 | `createToc`, `resolveTocOptions`, `collectHeadingToc`, `addTocExport`, TOC 타입·기본 export 이름                           |
| `cudoc-remark/embed`               | 준비된 임베드 접합 플러그인, `restoreExpressions`                                                                          |
| `cudoc-remark/loader`              | 문서를 준비된 라이브러리에 묶는 번들러 로더. `libraryLoader`, `libraryFingerprint`, `stripLibraryMarker`, `LIBRARY_LOADER` |
| `cudoc-remark/components`          | 하위 컴포넌트 출력용 `Anchor`, `Badge`, `cudocComponents`                                                                  |

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

## 준비된 임베드 접합

소스: [embed.ts](../../packages/cudoc-remark/src/embed.ts), [loader.ts](../../packages/cudoc-remark/src/loader.ts).

`cudoc-remark/embed`의 기본 export는 `{ sourceRoot?: string, roots?: SourceRoot[], outDir?: string }`를 받으며 기본값은 `sourceRoot: "docs"`, `.cudoc/documents`입니다. 수집에 쓴 것과 같은 `roots`를 주면 같은 ID를 얻습니다. `file.path`를 담는 가장 안쪽 루트의 기준 경로 뒤에 그 아래 경로를 잇고 확장자를 뗀 값입니다. 루트는 코드 블록을 만났을 때에만 해석하므로, 어느 루트에도 속하지 않는 파일도 임베드가 없으면 그대로 컴파일되고 임베드가 있으면 파일 이름을 알리며 실패합니다. 블록 번호를 매기며 `file.value`로 준비 데이터의 최신 상태를 검사하고, 각 코드 블록을 `embeds.json`에서 읽은 준비 블록의 자식 노드로 바꿉니다. 복제한 노드를 코드 블록이 있던 자리에 접합하는 것이며, 코드 블록이 있는 문서만 준비 데이터를 읽습니다.

접합된 노드는 그때부터 보통의 mdast입니다. 호스트의 나머지 remark 플러그인, remark-rehype, 컴포넌트 매핑이 문서 자신의 내용과 똑같이 다루므로, 임베드된 절 안의 컴포넌트는 호스트의 컴포넌트로 렌더링되고 코드 블록은 호스트의 강조기에 닿습니다. HTML 문자열로 렌더링하지 않고, 감싸는 요소를 넣지 않으며, 런타임 컴포넌트나 데이터 import를 생성하지 않습니다. 저장된 블록에는 `estree`가 없으므로(AST 내보내기가 제거) `restoreExpressions(node, documentId)`가 내보내기가 남긴 표현식 글자에서 다시 파싱합니다. 블록 안의 모든 `mdxFlowExpression`, `mdxTextExpression`, `mdxJsxAttributeValueExpression`, `mdxJsxExpressionAttribute`가 대상이며 acorn과 JSX 확장을 씁니다. 값·흐름·텍스트 표현식은 `(값)`으로, 전개 속성은 MDX 파서가 만드는 것과 같은 `({값})`으로, 주석만 있는 표현식은 빈 프로그램으로 파싱하고, 파싱되지 않는 글자는 문서와 표현식을 알리는 오류입니다. 임베드된 제목은 `hProperties.id`를 유지해 앵커로 렌더링됩니다. `cudoc-remark`가 이 플러그인보다 먼저 계산하는 자체 `toc` export에는 들어가지 않지만, 최종 트리에서 목차를 만드는 호스트는 그 제목들을 나열합니다. 임베드된 절 안의 `cudoc-embed` 코드 블록은 해석기가 이미 전개했으므로 중첩 임베드는 전개된 상태로 옵니다. 작성자는 cudoc 컴포넌트를 등록하지 않습니다.

컴파일된 페이지가 이제 라이브러리 내용을 담으므로 `embeds.json`에 의존하는데, 번들러는 remark 플러그인이 읽은 파일을 볼 수 없습니다. `cudoc-remark/loader`는 같은 파일에 MDX 로더보다 앞서 거는 webpack·Turbopack 로더이며 세 가지 일을 합니다. `addDependency`로 `embeds.json`을 모듈의 의존성으로 선언하는데, 이는 개발 서버와 webpack의 영구 캐시가 지켜보는 것입니다. 원문 끝에 빈 줄을 두고 `[cudoc-library]: #<embeds.json의 sha256>` 한 줄을 덧붙이는데, 이는 Markdown에서도 MDX에서도 아무것도 렌더링하지 않는 링크 참조 정의이며, 그 덕에 라이브러리가 바뀔 때마다 MDX 로더의 입력이 바뀝니다. Turbopack은 작업의 출력을 비교해 캐시하므로 원문을 건드리지 않는 로더로는 그 뒤의 컴파일에 닿을 수 없기 때문입니다. 그리고 번들러 설정을 평가하는 시점에 계산한 라이브러리의 `fingerprint`를 옵션에 담는데, 이것이 Turbopack의 영구 빌드 캐시가 두 빌드 사이에 이 로더를 다시 실행하게 만드는 조건입니다. 임베드 플러그인은 원문을 라이브러리 스냅숏과 비교하기 전에 `stripLibraryMarker`로 표식을 떼어 내므로 최신 상태 검사는 파일을 쓴 그대로 봅니다. 로더를 두 번 거쳐도 표식이 쌓이지 않습니다. `libraryFingerprint(outDir?)`는 `embeds.json`의 SHA-256이며 파일이 없으면 `""`이고, 파일의 크기와 수정 시각을 키로 캐시합니다. `libraryLoader(outDir?)`는 webpack `use` 항목이나 Turbopack `loaders` 항목으로 쓸 수 있는 순수 JSON `{ loader: "cudoc-remark/loader", options: { outDir, fingerprint } }`를 돌려줍니다. 빌드 스크립트에서는 설정 평가가 `cudoc collect` 뒤에 일어나므로 fingerprint는 새 라이브러리의 것입니다. Next.js 예제에서 확인한 결과, 로더가 있으면 `.next/cache`를 유지한 두 `next build` 사이의 재수집이 두 번들러 모두에서 임베드하는 페이지에 반영되고, 없으면 이전 라이브러리로 컴파일된 페이지가 자기 파일이 바뀌거나 캐시를 지울 때까지 그대로 제공됩니다.

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

이 패키지는 markdown-it 계열에서 `cudoc-remark`와 같은 역할을 담당합니다. 공통 구성이 여기에 있고 각 호스트 어댑터는 `MarkdownItHost` 정의만 제공합니다. `HostPluginOptions`는 `DocumentOptions`에서 `host`/`format`을 빼고(`tableColumnWidths`, `ignoreDiagnostics`는 포함) 선택적 `onDocument(tree, source, env)`, `library`, `outDir`(준비 데이터 기본 경로 `.cudoc/documents`)을 더합니다. `resolveHostOptions`는 플러그인을 설치하는 시점에 실행되므로, 알 수 없는 키나 객체가 아닌 인자, `"host"`가 아닌 `headingIds`는 첫 문서가 아니라 사이트 설정을 불러오는 동안 오류가 됩니다. 플러그인은 해당 호스트의 의미와 `format: "md"`, 호스트 제목 생성을 사용합니다.

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

## 내보내기

소스·import: [index.ts](../../packages/cudoc-export/src/index.ts), `cudoc-export`.

```ts
type SiteLinkMode = "relative" | "host" | "none"

buildSite(options: SiteOptions): {
  outDir: string
  documentCount: number
  libraryDir: string
}
```

`SiteOptions`는 `DocumentOptions`에 다음 필드를 추가합니다. `SiteOptions`, `SiteLinkMode`는 공개 타입이며 반환 경로는 절대 경로입니다. `siteStyles`는 기본 CSS 문자열입니다.

| 옵션            | 타입 / 기본값                                                      | 계약                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sourceRoot`    | `string`; `sourceRoot`·`roots` 중 하나 필수                        | 라이브러리 최상위에 놓이는 소스 디렉터리 하나. `roots: [{ dir }]`의 축약형입니다. 자산 해석과 출력 보호에 쓰므로 `library`를 지정해도 필요합니다.                        |
| `roots`         | `SourceRoot[]`; `sourceRoot`·`roots` 중 하나 필수                  | 문서가 있는 디렉터리들과 각각의 기준 경로. `library`와 함께 쓰면 라이브러리를 수집한 기준 경로와 같아야 합니다.                                                          |
| `exclude`       | `string[]`, 수집 전용                                              | 문서가 아닌 파일. 수집에 전달합니다. [수집](./node.ko.md#수집)을 참고하세요.                                                                                             |
| `private`       | `string[]`, 수집 전용                                              | 수집은 하되 내보내지 않는 문서. 수집에 전달합니다. 비공개 문서는 어느 형식에서도 렌더링되지 않고 탐색·목차·문서 수에도 들지 않습니다.                                    |
| `externalPaths` | `string[]`, `[]`                                                   | 같은 호스트에서 다른 애플리케이션이 담당하는 루트 상대 접두어(`/sdk` 등). 그 아래로 가는 링크는 어느 정책에서도 외부로 보아 쓴 그대로 두고 해석하거나 복사하지 않습니다. |
| `extractors`    | `Record<string, TableExtractor>`, 수집 전용                        | 임베드 표가 부를 수 있는 셀 추출기. 수집에 전달합니다. [임베드](./node.ko.md#임베드)를 참고하세요.                                                                       |
| `outDir`        | 필수 `string`                                                      | 소스·라이브러리·자산 루트와 분리한 사이트 전용 출력 경로.                                                                                                                |
| `title`         | `string`, `"Documentation"`                                        | 사이트 머리말과 페이지 제목 접미사.                                                                                                                                      |
| `navigation`    | `string[]`, 전체 ID                                                | 먼저 표시할 기존 문서 ID. 나머지 문서가 뒤에 이어집니다.                                                                                                                 |
| `css`           | 선택적 `string`                                                    | 기본 스타일 뒤에 추가할 로컬 CSS 파일. HTML 표현 전용이며 CSS를 읽지 않는 형식에는 닿지 않습니다.                                                                        |
| `tokens`        | 선택적 `DesignTokenOverrides`                                      | 기본 토큰 위에 그룹마다 한 단계씩 병합하는 재정의. 모든 출력 형식이 함께 읽습니다.                                                                                       |
| `page`          | 선택적 `PageOptions`                                               | 용지, 여백, 머리글과 바닥글, 제목 앞 쪽 나누기, 링크 주소 인쇄. [페이지를 나누는 출력](#페이지를-나누는-출력) 참고.                                                      |
| `volume`        | 선택적 `VolumeOptions`                                             | 묶은 파일의 이름, 표지, 목차. [페이지를 나누는 출력](#페이지를-나누는-출력) 참고.                                                                                        |
| `libraryDir`    | `string`, `path.join(path.dirname(outDir), ".cudoc", "documents")` | `library`가 없을 때 수집 출력. `library`를 지정하면 무시합니다.                                                                                                          |
| `library`       | 선택적 `string`                                                    | 컴파일하거나 다시 출력하지 않고 읽을 기존 수집 라이브러리 디렉터리.                                                                                                      |
| `links`         | `SiteLinkMode`, `"relative"`                                       | 출력 전체의 하이퍼링크 정책.                                                                                                                                             |
| `hostUrl`       | 선택적 `string`, `"host"`에서 필수                                 | 기본 경로를 포함한 HTTP(S) 절대 배포 URL. 인증정보·쿼리·프래그먼트를 허용하지 않으며 마지막 `/`를 정규화합니다.                                                          |
| `assetDirs`     | `string[]`, `[]`                                                   | 루트 다음 순서대로 탐색할 URL 루트 자산 디렉터리.                                                                                                                        |
| `renderOptions` | 선택적 `RenderOptions`                                             | HTML 컴포넌트 콜백과 코드 강조 재정의. [렌더링](./document.ko.md#컴포넌트와-렌더링) 참고.                                                                                |
| `annotations`   | `boolean`, `false`                                                 | 모든 페이지에 메모 런타임을 실어, 받은 사람이 메모를 남기고 파일로 돌려줄 수 있게 합니다. [주석](#주석) 참고.                                                            |
| `themeSwitch`   | `boolean`, `false`                                                 | 머리글에 시스템·라이트·다크를 차례로 고르는 버튼을 더하고 선택을 브라우저에 기억합니다. [테마 전환](#테마-전환) 참고.                                                    |

동기 생성기는 두 입력 경로를 제공합니다.

1. `library`가 없으면 `host: "html"`로 `libraryDir`에 수집하고 해당 컴파일러로 임베드를 처리합니다. 나머지 `DocumentOptions`는 수집에 적용합니다.
2. `library`가 있으면 `loadLibrary`로 읽고 저장된 트리를 복제합니다. [library.ts](../../packages/cudoc-export/src/library.ts)는 문서 ID·원문·코드 블록 순서에 맞춰 `readPreparedEmbeds`의 블록을 삽입합니다. 비동기 호스트의 컴파일과 원문 치환 결과도 재컴파일 없이 사용할 수 있습니다. 수집이 설정을 소유하므로 `library`와 함께 `DocumentOptions`를 지정하면 오류입니다. 공유 라이브러리 파일은 쓰지 않습니다.

임베드 코드 블록이 있는 문서만 준비 데이터를 읽습니다. 준비 누락·오래된 준비 데이터·블록 누락은 오류입니다. 검증 기준은 저장된 원문 스냅샷과 manifest 지문이며 모든 현재 소스 파일을 스냅샷과 비교하지는 않습니다. 소스·경로·컴파일러가 바뀌면 다시 수집하고 준비해야 합니다. `library`를 지정하면 반환값의 `libraryDir`는 해당 입력 경로입니다.

렌더링은 `renderDocument`와 기본 highlight.js를 사용하며 알 수 없는 언어는 이스케이프한 코드로 표시합니다. `renderOptions`로 기본 렌더링 옵션을 재정의하고 명시적인 컴포넌트 콜백을 전달합니다. frontmatter `title`은 탐색·페이지 제목, `lang`은 언어(기본 `en`)입니다. 생성기는 CSS·탐색·목차를 추가하며 필요하면 index를 생성합니다.

`siteStyles`는 토큰으로 구성되며 테마를 인식하는 스타일시트입니다. [design/tokens.ts](../../packages/cudoc-export/src/design/tokens.ts)의 객체에서 `buildStyles(tokens)`가 생성하며, `designTokens`와 `resolveTokens`와 `buildStyles`를 공개하고 `siteStyles`는 기본값으로 만든 결과입니다. 속성 선언과 highlight.js 색상 규칙 네 벌을 그 객체에서 생성하고, `__tests__/styles.test.ts`가 결과를 바이트 단위 골든 픽스처와 대조합니다. 라이트 팔레트를 `:root`의 사용자 정의 속성으로 정의하고 `prefers-color-scheme: dark`에서는 그 속성만 다시 정의하므로, 스크립트 없이 시스템 설정이 테마를 선택합니다. 인쇄 블록을 제외하면 어떤 규칙에도 색을 직접 쓰지 않으며, 두 테마 모두에서 모든 전경·표면 조합이 WCAG AA를 충족합니다. 본문 텍스트는 4.5:1, 포커스 링은 3:1입니다. 다크 색은 `:root`와 같은 특이성으로 두 번 선언됩니다. `prefers-color-scheme: dark` 아래의 `:root:where(:not([data-theme="light"]))`와 `:root:where([data-theme="dark"])`입니다. 그래서 `<html>`의 `data-theme="light"`나 `"dark"`가 시스템 설정을 덮어쓰고 `color-scheme`도 함께 정하되, 덧붙인 스타일시트의 `:root` 규칙은 여전히 이깁니다. 이 속성을 설정하는 것은 [테마 전환](#테마-전환)이며, 그 옵션이 없으면 아무것도 설정하지 않습니다.

| 토큰 묶음    | 속성                                                                                          | 용도                                                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 표면         | `--canvas`, `--paper`, `--wash`, `--row-alt`                                                  | 페이지 바닥, 본문 표면, 코드와 패널 채움, 표의 교차 행                                                                                               |
| 텍스트       | `--ink`, `--muted`, `--faint`                                                                 | 본문 색, 보조 문장, 작은 레이블                                                                                                                      |
| 선           | `--line`, `--line-soft`                                                                       | 영역 구분선과 행 구분선                                                                                                                              |
| 강조와 상태  | `--accent`, `--accent-soft`, `--warn`, `--warn-wash`, `--danger`, `--danger-wash`             | 링크와 활성 내비게이션, 그리고 콜아웃 심각도마다 대응하는 표면                                                                                       |
| 코드         | `--code-keyword`, `--code-string`, `--code-comment`, `--code-number`                          | highlight.js 토큰 색                                                                                                                                 |
| 타이포그래피 | `--font-sans`, `--font-mono`, `--text-xs` … `--text-3xl`, `--leading-body`, `--leading-tight` | 폰트 스택과 모듈러 스케일. Word는 `text`를 `print.baseSize` 기준으로 환산해 글자 크기를 정하고, 줄 간격은 CSS 값을 Word 자체의 1.2로 나눈 배수입니다 |
| 레이아웃     | `--space-1` … `--space-12`, `--radius`, `--measure`, `--head-h`, `--ease`                     | 4px 간격 격자, 모서리 반경, 한 줄 길이 상한, 헤더 높이, 전환                                                                                         |
| Word         | 없음: `word.sans`, `word.mono`, `word.eastAsia`, `word.paragraphSpacing` … `word.padding`     | Word 양식의 글꼴과 간격 체계. 어떤 스타일시트도 읽지 않습니다. [Word 양식](#word-양식) 참고                                                          |

글자 크기는 고정 픽셀 루트가 아니라 브라우저의 기본 크기에서 확대·축소하므로 독자의 글자 크기 설정을 존중합니다. `html`이 `font-size: 100%`이고 본문은 `--text-base`(0.9375rem)에 `--leading-body`(1.7)를 적용합니다. 폰트 스택은 IBM Plex Sans와 JetBrains Mono를 먼저 지정하고 플랫폼 UI 폰트와 한글 폰트로 이어지며, 어떤 폰트도 내려받지 않으므로 `file://`과 오프라인에서 그대로 동작합니다. 본문은 `--measure`(72ch)로 한 줄 길이를 제한하고, 제목과 표, 코드 블록, 콜아웃은 본문 열 전체 폭을 사용합니다.

페이지 구조는 고정 헤더와 고정 문서 사이드바, 제목 목차가 그 열 양옆에 놓인 형태이며 1024px에서 두 열, 768px에서 한 열로 접힙니다. 한 열이 되면 내비게이션 대상의 높이가 2.75rem으로 커집니다. 표는 전체 테두리 격자 대신 가로 구분선과 교차 행 배경, 레이블 형태의 머리글, 고정폭 숫자를 사용하며 페이지를 넓히지 않고 가로로 스크롤합니다. 상호작용 상태는 `--ease`로 전환하고 `prefers-reduced-motion`에서는 1ms로 줄어듭니다. `css`는 이 스타일 뒤에 덧붙여지므로 규칙을 다시 쓰지 않고 속성만 재정의해서 디자인을 바꿉니다. 형식을 가로질러 유지해야 하는 변경은 `tokens`로 지정하세요. `tokens`는 데이터여서 CSS를 쓰지 않는 작성기도 같은 객체를 읽지만, `css`는 스타일시트를 불러오는 출력에만 닿습니다. `resolveTokens`는 그룹마다 한 단계씩 병합하므로 색 하나를 재정의해도 나머지 팔레트가 유지되며, 폰트 스택은 병합하지 않고 통째로 교체합니다. `--radius`와 `--measure`와 `--head-h`와 `--ease`, 그리고 다크 팔레트는 CSS 밖에 대응물이 없습니다. 인쇄 블록은 헤더와 두 내비게이션 열을 숨기고, 줄 길이 제한을 해제하고, 본문 색을 그대로 두며, 표 머리글을 페이지마다 반복하고, 쪽 폭보다 긴 코드 줄은 모든 쪽을 축소해 맞추는 대신 줄을 바꿉니다. 옵션에 따라 달라지는 규칙은 아래에서 설명하는 독립 인쇄 스타일시트에만 더해지므로, 옵션이 사이트 자체의 인쇄 블록을 바꾸는 일은 없습니다.

### 페이지를 나누는 출력

`cudoc-export`의 `buildExport(options)`는 한 번 수집한 결과에서 모든 형식을
하나의 발행 트랜잭션 안에서 만들고 프로미스를 반환합니다.

```ts
type ExportFormat = "html" | "pdf" | "docx"
type ExportGranularity = "documents" | "volume" | "both"

function buildExport(options: ExportOptions): Promise<ExportResult>

type ExportOptions = SiteOptions & {
  formats?: ExportFormat[] // ["html"]
  granularity?: ExportGranularity // "documents"
  pdf?: { executablePath?: string } // 설치된 셸 대신 쓸 기존 브라우저
  docx?: DocxWriterOptions
}

type DocxWriterOptions = {
  rawHtml?: "drop" | "text" // "drop"
  calloutStyle?: "paragraph" | "table" // "paragraph"
  components?: Record<
    string,
    (node: DocumentNode) => readonly (Paragraph | Table | ParagraphChild)[]
  >
}

type ExportResult = SiteResult & {
  formats: ExportFormat[]
  files: Record<ExportFormat, string[]> // outDir 기준 상대 경로, 출력 순서
  diagnostics: {
    code: "dropped-html" | "html-as-text" | "image-as-text"
    message: string
    document: string
  }[]
}

type RunningText = string | { left?: string; center?: string; right?: string }

type PageOptions = {
  paper?:
    "A4" | "A5" | "A3" | "Letter" | "Legal" | { width: string; height: string }
  orientation?: "portrait" | "landscape"
  margin?: { top?: string; right?: string; bottom?: string; left?: string }
  header?: RunningText | false // "{title}"
  footer?: RunningText | false // { center: "{page} / {pages}" }
  date?: string // "" — 시계에서 읽지 않습니다
  breakBefore?: 0 | 1 | 2 | 3 // 0
  linkUrls?: boolean // false
  authoredBreaks?: boolean // true
  wideTables?: false | { minColumns: number } // false
}

type VolumeOptions = {
  fileName?: string // "volume"
  cover?: false | { image?: string } // {}
  contents?: false | { title?: string; pageNumbers?: boolean } // { title: "Contents", pageNumbers: true }
}
```

`page`와 `volume`은 `SiteOptions`에 있으므로 `buildSite`도 같은 형상과 같은
앞부분으로 인쇄용 HTML을 씁니다. `resolvePageOptions(page)`가 모든 필드를 검증하고
형상을 한 번 해석하며, `resolvePageGeometry(page)`는 형상만 해석합니다. 둘 다
공개합니다. `@page` 규칙과 인쇄 호출의 여백과 Word 구역의 twips와 러닝 라인의 탭
위치가 모두 그 한 값에서 파생됩니다. 기본값은 A4 세로에 20/20/22/20mm이며 내용
상자는 170×255mm입니다. 머리글이나 바닥글은 해당 쪽 여백이 15mm 이상이어야 합니다.
Chrome이 여백에 들어가지 않는 러닝 라인을 잘라 버리기 때문에, 더 좁은 여백에 러닝
라인을 요청하면 오류입니다. `{page}`, `{pages}`, `{title}`, `{date}` 필드는 두 형식에서
모두 치환되며, `{title}`은 문서별 파일에서는 문서 제목, 묶은 파일에서는 묶음 제목이고
`{date}`는 `page.date` 그대로입니다. `breakBefore: n`은 깊이 `n` 이하의 모든 제목
앞에서 쪽을 넘기되 문서의 첫 블록은 제외하며, 인쇄 스타일시트의 규칙과 Word의 문단
속성으로 표현됩니다. `linkUrls`는 두 형식 모두에서 `http(s)` 링크 뒤에 ` (url)`을
덧붙입니다. `authoredBreaks: false`는 인쇄 스타일시트의 `.cudoc-page-break` 규칙을
`break-after: auto`로 만들고 Word 작성기는 그 노드를 건너뜁니다.
`wideTables: { minColumns: n }`은 첫 행의 열이 `n` 이상인(병합 포함) 모든 표에 가로
쪽을 줍니다. 인쇄 HTML은 표를 `<div class="cudoc-wide">`로 감싸 명명 페이지
`@page cudoc-wide`에 인쇄하며, 그 크기는 세로 쪽을 돌린 것이고 여백은 그대로
물려받습니다. Word 작성기는 표 앞뒤에서 문서를 구역으로 나누어 표의 구역에
`w:orient="landscape"`를 주고, 같은 러닝 텍스트를 더 넓은 열에 맞춘 탭 위치로
넣습니다. 다른 표의 셀 안에 있는 표와 문서의 첫 블록은 넓은 표가 되지 않습니다.
Chrome이 첫 요소의 명명 페이지에 빈 쪽을 앞세우기 때문이며, Word 작성기도 두 출력이
같도록 같은 예외를 적용합니다.

`volume.fileName`은 순수한 파일 이름이며 문서 id와 같을 수 없습니다. 묶은 파일이
출력 루트에서 문서 파일들과 나란히 놓이기 때문입니다. `volume.cover.image`는 로컬
파일 경로이며 PNG, JPEG, GIF, BMP여야 합니다. Word가 SVG를 삽입하지 못하기
때문입니다. 이 파일은 출력에 `cudoc-cover.<type>`으로 복사됩니다. 빌드가 쓸 수 있는
모든 파일, 즉 `cudoc.css`, `index.html`, `cudoc-print.css`, `cudoc-cover.*`,
`cudoc-annotations.js`, `cudoc-annotations.css`, `cudoc-theme.js`, 그리고
모든 문서와 묶음 이름의 `<id>.html`, `<id>.print.html`, `<id>.pdf`, `<id>.docx`는
예약되어 있으며, 그 자리에 놓이게 되는 자산은 오류입니다.

**형식마다 쓰는 파일.** 모든 빌드가 브라우저 유무와 무관하게 `cudoc-print.css`와
문서별 `<id>.print.html`과 `<묶음>.print.html`을 씁니다. `pdf`는 `playwright-core`로
`chromium-headless-shell`을 한 세션 구동해 그 파일들을 각각 한 번씩 `<id>.pdf`와
`<묶음>.pdf`로 인쇄합니다. `postinstall`이 그 셸을 설치하며
`CUDOC_SKIP_BROWSER_DOWNLOAD`를 존중하고 어떤 경우에도 설치를 실패시키지 않습니다.
`cudoc-export install-browser`가 같은 설치기를 실행합니다. 브라우저가 없는 상태에서
PDF를 요청하면 그 명령을 알려 주는 오류를 냅니다. `docx`는 `docx` 패키지로
`<id>.docx`와 `<묶음>.docx`를 쓰며, HTML 렌더러가 읽는 것과 같은 mdast를 걷습니다.

**한 권으로 묶은 파일**은 내비게이션 순서의 문서들이며, 각 문서는
`<article class="cudoc-doc" id="cudoc-<인코딩한 id>">`와 자기 Word 구역에 들어가고,
`volume`이 끄지 않는 한 표지 구역과 목차 구역이 앞에 옵니다. 문서 안의 모든 id에는
`cudoc-<encodeURIComponent(id)>-` 접두사가 붙고, 다른 문서로 가는 링크는 그 접두사가
붙은 프래그먼트로 적히므로 두 문서가 충돌할 수 없고 문서 사이의 모든 링크가 파일
안에서 해석됩니다. 표지는 쪽의 내용 상자를 채우므로 머리글과 바닥글이 표지에서도
제자리에 있습니다. 표지 이미지는 `background-size: cover`로 잘라 채우는
`background-image`이고, Word에서는 여백에 고정되어 글 뒤에 놓이는 떠 있는 그림과
종이색 띠 위의 제목 문단입니다. PDF의 목차는 문서마다 시작 쪽을 담으며, 앞부분만
따로 인쇄하고 문서를 각각 인쇄해서 측정한 뒤 검증합니다. 묶은 파일의 쪽수가 정확히
그 합이 아니면 틀린 번호를 인쇄하는 대신 내보내기가 실패합니다.
`contents.pageNumbers: false`는 측정용 인쇄를 생략합니다. Word의 목차는 1수준 제목에
대한 `TOC` 필드이며 문서 목록을 현재 값으로 담고 항목마다 문서 시작의 북마크로
연결되며, `updateFields`가 켜져 있어 Word가 열 때 쪽 번호를 채웁니다. 필드를 갱신하지
않는 뷰어는 제목만 보여 줍니다. `links: "none"`에서는 두 형식 모두 항목이 일반
텍스트입니다.

**쪽을 나누는 출력의 링크**는 사이트와 똑같이 `links`를 따르며, 대상을 한 번
해석해서 형식마다 적습니다. 묶은 파일 안에서 수집된 다른 문서로 가는 링크는
프래그먼트입니다(HTML에서는 `#cudoc-<id>-<anchor>`, Word에서는 북마크). 문서별
파일에서는 `relative`이면 프래그먼트 없는 옆 파일 `<id>.pdf` 또는 `<id>.docx`,
`host`이면 배포 URL이고, `none`이면 제거됩니다. 같은 문서의 프래그먼트는 모든
정책에서 파일 안에 머무릅니다. 그 밖의 로컬 파일은 사이트처럼 복사하고 연결하되
경로를 묶은 파일의 루트 기준으로 다시 적으므로, 하위 디렉터리의 문서도 묶은 파일에서
이미지를 잃지 않습니다.

**Word 작성기의 디스패치 순서는 계약의 일부입니다.** `data.cudoc.kind`를 먼저 보고,
그다음 `data.hName`, 마지막이 `node.type`입니다. 페이지 나누기는 `thematicBreak`에
실려 오고 낮춰진 `<table>`은 `blockquote`로 도착하므로, `node.type`부터 보면 나누기가
가로줄이 되고 표가 인용문이 됩니다. 흐름 콘텐츠가 와야 할 자리에 만난 구문
콘텐츠(MDX `<div>` 바로 안의 텍스트)는 버리지 않고 문단으로 감쌉니다. 참조형 링크와
이미지는 `definition`을 따라 해석되고, 각주는 파일 전체에 걸쳐 번호가 매겨진 Word
각주가 됩니다. 색과 글꼴과 크기와 음영과 테두리는 선언된 스타일에만 나타나며, 그
id는 `Cudoc*`, Word의 `Heading1`~`Heading6`, `TOC1`, `IndexLink`입니다. 기본 제공이든
`calloutTypes`로 등록했든 모든 콜아웃 타입이 본문 스타일과 제목 스타일을 얻습니다.
스타일 목록과 각 스타일의 간격, 그 간격을 정하는 토큰 묶음은 [Word 양식](#word-양식)에
정리되어 있습니다.
북마크 이름은 `cudoc` 뒤에 문서 id와 제목 id를 해시한 26자를 붙인 것이고, `docx`
9.7.1이 모든 북마크에 숫자 id 1을 주기 때문에 숫자 id는 파일 전체에서 고유하게 다시
매깁니다. raw `html` 노드는 버리며, 버린 사실은 문서마다 한 번씩 `diagnostics`와 CLI
표준 오류에 보고합니다. `docx.rawHtml: "text"`는 그 노드를 `CudocCodeBlock`
문단으로(인라인이면 `CudocCode` 런으로) 쓰고 대신 `html-as-text`를 보고합니다. PNG,
JPEG, GIF, BMP가 아니거나 로컬 파일로 해석되지 않는 이미지는 대체 텍스트가 되며
`image-as-text`로 보고합니다. Word가 내장할 수 있는 이미지는 비율을 유지한 채
본문 폭과 본문 높이에 모두 들어갈 때까지 줄이는데, 인쇄 스타일시트가 이미지에 두는
한계와 같습니다.
`docx.calloutStyle: "table"`은 콜아웃마다 셀 하나짜리 표를 만들어 셀이 왼쪽 선과
색조를 갖고, 그 안의 문단은 이 모드에서만 선언되는 `CudocCallout<Type>Plain`과
`...PlainTitle` 스타일을 씁니다. 정규화를 거치고도 남은 컴포넌트(`mdx*`나 지시문
노드)는 `no Word renderer for <name>`을 던집니다. `renderDocument`가 HTML 렌더러
없는 컴포넌트에 던지는 것과 같습니다. 단, `docx.components[name]`이 있으면 노드를
넘겨 호출하고 그 결과인 `docx` 객체를 씁니다. 컴포넌트가 흐름 콘텐츠 자리면 문단과
표를 받고 그 사이의 런은 문단으로 감싸며, 구문 콘텐츠 자리면 런만 받고 문단은
오류입니다.

**페이지 나누기**는 `@cudoment/cudoc/paged`에서 공유합니다. `PAGE_BREAK_FENCE`,
`PAGE_BREAK_KIND`, `PAGE_BREAK_CLASS`, `isPageBreak(node)`, `pageBreakNode()`가 있습니다.
`normalizeDocument`가 ` ```cudoc-pagebreak ` 펜스를 `hName: "div"`와
`className: ["cudoc-page-break"]`와 `hidden: true`와 `data.cudoc.kind: "pageBreak"`를
가진 `thematicBreak`으로 바꿉니다.

**인쇄 규칙**은 화면용 스타일시트가 종이에서 갖고 있던 결함 세 가지를 고칩니다. 표가
`display: block`이라 `table-header-group`이 조용히 무효였고, `pre`와 콜아웃이
`break-inside: avoid`를 약속했지만 쪽보다 큰 블록에서는 지킬 수 없었으며, 본문 색을
검정으로 덧칠했습니다. 빌더는 모든 `<details>`를 열어 두기도 합니다. Chrome이 닫힌
`<details>`를 summary만 인쇄하기 때문입니다.

하위 경로: `cudoc-export/docx`는 `buildDocx`, `writeDocx`, `bookmarkName`과
`DocxWriterOptions`, `DocxComponentRenderer`를 포함한 `Docx*` 타입을, `cudoc-export/pdf`는 `openPrinter`, `printPdfs`, `browserAvailable`,
`launchBrowser`, `runningTemplate`, `pdfPageCount`, `browserInstallCommand`를,
`cudoc-export/print`는 `writePrintOutputs`, `printStylesheet`,
`fillVolumePageNumbers`, `resolveVolumeOptions`, `namespaceIds`, `volumeId`,
`PRINT_STYLESHEET`, `VOLUME_FILE`을 공개합니다.

### Word 양식

`.docx`는 문서이면서 양식입니다. 모든 외양이 이름 붙은 스타일이므로 Word의 스타일
창에서 파일 전체를 바꿀 수 있고, 그 스타일들이 출발하는 값이 `word` 토큰 묶음입니다.
그 밖의 어떤 것도 Word의 간격에 닿지 않습니다. `css`는 읽지 않고, `--space-*`
스케일은 스타일시트를 움직일 뿐 Word 스타일에는 쓰이지 않습니다. 그래서 Word에서
문서가 너무 헐겁거나 너무 빽빽하게 읽히면 사이트와 PDF를 건드리지 않고 여기서만
조정합니다.

**페이지 여백**은 `page.margin`(기본 20/20/22/20mm)이며 PDF가 인쇄하는 값과 같고,
넓은 표를 위한 가로 구역도 같은 여백을 유지합니다. **여백 안의 모든 간격**은
`tokens.word`입니다. 길이는 `print.baseSize`(10.5pt)에 대한 `rem` 배수이며 twip으로
환산됩니다.

| 키                         | 기본값                                 | 정하는 것                                                                                                                                                           |
| -------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sans`, `mono`, `eastAsia` | `Calibri`, `Consolas`, `Malgun Gothic` | 모든 스타일의 라틴 글꼴, 고정폭 글꼴, 한글 글꼴. 문자 체계마다 글꼴 하나만 지정합니다. Word는 스택을 훑지 못하고, 없는 글꼴은 조용히 다른 글꼴로 바꾸기 때문입니다. |
| `paragraphSpacing`         | `1rem`                                 | 본문 문단 뒤 간격. `CudocBody`, `CudocQuote`, `CudocCaption`, 그리고 문서 기본값에 적용됩니다.                                                                      |
| `headingSpacing`           | `1.5rem`                               | `Heading2`~`Heading6` 앞 간격. `Heading1`은 그 3분의 4를, 모든 제목의 뒤 간격은 그 절반을 씁니다.                                                                   |
| `blockSpacing`             | `1rem`                                 | 코드 블록과 구분선의 앞뒤 간격, 그리고 표나 콜아웃 다음에 오는 블록의 앞 간격.                                                                                      |
| `listSpacing`              | `0.25rem`                              | 목록 항목(`CudocListItem`) 뒤 간격.                                                                                                                                 |
| `listIndent`               | `1.5rem`                               | 목록 단계마다의 들여쓰기. 글머리 기호는 그 60% 지점에 내어 씁니다. 표 셀 안에서는 3분의 2를 씁니다.                                                                 |
| `indent`                   | `1rem`                                 | `CudocQuote`와 `CudocDetailsBody`의 왼쪽 들여쓰기, 콜아웃 상자의 양쪽 들여쓰기.                                                                                     |
| `padding`                  | `0.5rem`                               | 코드 블록과 콜아웃 상자의 안쪽 여백(테두리 간격으로, 정수 pt이며 최대 31), 그리고 표 셀의 안쪽 여백. 셀의 좌우는 그 1.5배입니다.                                    |

```js
tokens: {
  word: { paragraphSpacing: "0.75rem", blockSpacing: "0.75rem", listIndent: "1.25rem" },
}
```

이 묶음도 다른 묶음처럼 한 단계만 병합하므로 키 하나를 바꾸면 나머지는 기본값을
유지합니다. `resolveTokens({ word }).word`가 병합된 결과입니다.

간격이 어디에 적용되는지도 계약의 일부입니다. 스타일을 고칠 때 독자가 보는 것이
바로 그것이기 때문입니다.

- 간격은 스타일에 있고, 직접 서식으로 두는 예외는 셋입니다. 코드 블록의 첫 줄과
  마지막 줄이 `blockSpacing`을 앞뒤로 갖습니다. 표나 콜아웃 다음에 오는 문단이
  `blockSpacing`을 앞에 갖습니다. Word의 표에는 바깥 여백이 없고 콜아웃 상자는
  마지막 문단에서 끝나기 때문입니다. 표나 콜아웃 다음에 다시 표나 콜아웃이 오면 그
  간격을 실은 1pt짜리 빈 문단 `CudocSpacer`를 앞에 둡니다. Word가 연속한 표를 표
  하나로, 테두리와 들여쓰기가 같은 연속 문단을 상자 하나로 그리기 때문입니다. 표
  다음의 제목은 자기 스타일의 더 큰 앞 간격을 그대로 씁니다.
- 콜아웃은 같은 테두리와 들여쓰기를 공유하는 문단의 연속이며 Word가 이를 상자
  하나로 합칩니다. 테두리 간격이 안쪽 여백이고, 상자 안의 리듬(문단 사이 `space-1`,
  제목 뒤 0)은 고정입니다.
- 표 셀은 색과 테두리가 직접 속성으로 들어가는 유일한 곳입니다. 머리글 아래
  구분선, 행 사이의 연한 구분선, 본문 행 하나 건너의 음영, 셀 안쪽 여백이 `w:tcPr`에
  있고, `w:tblGrid`에 내용 폭을 등분한 열 폭을 적어 두므로 격자로 표를 배치하는
  뷰어도 내용에 맞춰 열을 조정하는 Word와 같은 표를 보입니다. 머리 셀에
  `min-width` 스타일(임베드 표 열의 `minWidth`, 또는 그 글자에 맞는
  `tableColumnWidths` 규칙)이 있으면 그 열을 최소 그 폭으로
  유지하고(`px`는 15 twip, `rem`·`em`은 16px, `ch`는 8px, `%`는 표 폭 기준) 나머지
  열이 남은 폭을 나누며, 최소 폭의 합이 쪽을 넘으면 함께 줄입니다.

문단 스타일은 `CudocBody`, `CudocListItem`, `CudocSpacer`, `CudocQuote`,
`CudocCodeBlock`, `CudocTableHeader`, `CudocTableCell`, `CudocCaption`,
`CudocRule`, `CudocDetailsSummary`, `CudocDetailsBody`, `CudocRunning`,
`CudocCoverTitle`, `CudocCoverTitlePanel`, `CudocContentsTitle`, `TOC1`,
`CudocFootnote`, 콜아웃 타입마다의 `CudocCallout<Type>`과
`CudocCallout<Type>Title`(`calloutStyle: "table"`에서는 `...Plain`과
`...PlainTitle`), 그리고 Word의 `Heading1`~`Heading6`입니다. 문자 스타일은
`IndexLink`, `CudocCode`, `CudocCodeKeyword`, `CudocCodeString`,
`CudocCodeComment`, `CudocCodeNumber`, `CudocLinkUrl`, `CudocBadge`입니다. 색은
`colors.light`에서, 크기는 `text`를 `print.baseSize` 기준으로 환산해서, 줄 간격은
`leading`을 Word 자체의 1.2로 나눠서 정합니다.

### 테마 전환

`themeSwitch: true`(CLI `--theme-switch`)는 모든 페이지의 머리글에 시스템·라이트·다크를
차례로 고르는 버튼을 더하고, 출력 루트에 예약된 파일 하나 `cudoc-theme.js`를 패키지의
`dist/browser/`에서 복사합니다. 모든 페이지가 `<head>` 끝에서 `defer` 없는 평범한
`<script src>`로 이 파일을 읽으므로, 기억된 선택이 본문이 그려지기 전에 적용됩니다.
주석과 같은 Content-Security-Policy 메타를 두 옵션 중 먼저 요청하는 쪽이 한 번만
넣습니다. 스크립트는 `<html>`에 `data-theme="light"` 또는 `"dark"`를 설정하거나
제거하고(스타일시트가 이에 응답하는 방식은 `siteStyles` 설명 참고), 선택을
`localStorage["cudoc-theme"]`에 기억합니다(없으면 시스템, 저장은 주석과 같이 최선
노력, 다른 탭의 변경은 `storage` 이벤트로 따라감). 버튼은 스크립트가 만들므로
스크립트가 없는 페이지에는 버튼도 없습니다. 라벨은 문서의 `lang`(`ko`면 한국어, 그 외
영어)을 따라 시스템·라이트·다크로 읽히고 모니터·해·달 아이콘이 함께 놓이며, 도구
설명과 접근성 이름은 "테마: <모드>"입니다. 기본값은 꺼짐이며, 꺼진 출력은
스크립트 없이 시스템 설정을 따릅니다.

### 주석

`annotations: true`(CLI `--annotations`)는 사이트에 메모 런타임을 실어, 파일을 받은
사람이 글자나 블록을 골라 평문 메모를 남기고, 답글을 달고, 해결로 표시하고, 저자에게
돌려줄 수 있게 합니다. 기본값은 꺼짐이고, 꺼진 출력은 바이트 하나도 바뀌지
않습니다. 스크립트도, 정책 메타도, 블록 id도 없습니다.

**옵션이 더하는 것.** 출력 루트에 예약된 파일 둘을 패키지의 `dist/browser/`에서
복사합니다. `cudoc-annotations.js`는 의존성과 네트워크 접근이 없는 클래식 지연
스크립트 하나이고, `cudoc-annotations.css`가 그 스타일입니다. 모든 페이지가 두 파일의
`<link>`와 `<script defer>`를 갖고(랜딩 페이지도 스크립트를 읽지만 문서가 없어 아무
일도 하지 않습니다), 문자 집합 메타 바로 뒤에
`<meta http-equiv="Content-Security-Policy" content="object-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'">`가
붙습니다. 이 정책은 출처와 무관한 지시문만 씁니다. 일부 브라우저에서 `file://`
페이지의 불투명 출처는 `'self'`와 맞지 않아 스타일시트까지 막히기 때문입니다.
`<main>`에는 `data-cudoc-document`(문서 id), `data-cudoc-ast-hash`와
`data-cudoc-source-hash`(라이브러리 매니페스트의 그 문서 `astHash`와 `hash`),
`data-cudoc-site`(제목과 문서 순서의 해시로, 브라우저 저장소의 키가 됨),
`data-cudoc-generator`가 붙습니다. 모든 `p`, `li`, `tr`, `pre`, `blockquote`, `dt`,
`dd`, 제목, `aside.cudoc-callout`에는 `data-cudoc-block="<제목 id>:<16진수 8자>"`가
붙습니다. 직전 제목의 id(첫 제목 앞은 빈 문자열)와 블록 텍스트의 공백을 접은 뒤 구한
SHA-256 앞 여덟 자리이며, 한 절에서 같은 텍스트가 반복되면 `~2`, `~3` …을 붙입니다.
내용 해시는 다른 곳에 블록이 끼어들거나 옮겨져도 그대로이고, 고친 블록만 새 id를
얻어 그 메모는 인용 검색으로 물러납니다. 인쇄용 HTML, PDF, Word는 공유 트리로
만들어지므로 바뀌지 않습니다. `object-src 'none'`과 `form-action 'none'`은 옵션이
켜진 동안 저자의 raw `<embed>`·`<form>`에도 미칩니다.

**런타임.** 글자를 선택하면 메모 버튼이, 블록에 마우스를 올리면 왼쪽 여백에 `+`가
나타나고, 포인터가 여백을 건너 그 버튼으로 가는 동안 버튼은 사라지지 않습니다. 둘
다 평문 작성 창을 엽니다. 오른쪽 아래의 둥근 토글(말풍선 아이콘과 이 문서의 메모
개수)이 패널을 엽니다. 패널은 이름 입력란(선택 사항, 입력하는 즉시 반영, 브라우저가
기억, 기본 비움)으로 시작하고, 그 아래에 1차 동작 둘(공유 토큰 복사, 이 브라우저의
저장 내용 지우기)과 접힌 *더 보기*에 파일 동작을 둡니다. `<id>.annotations.json`
내려받기; `<id>.annotated.html` 저장(메모를
`<script type="application/json" id="cudoc-annotations-data">` 블록에 넣고 모든
`<`를 이스케이프한, 런타임 UI를 뺀 페이지 사본이며 원본과 같은 폴더에 있어야
스타일시트가 열림); `.json`이나 `.annotated.html` 불러오기(레이어 어디에나 끌어다
놓아도 됨). 그 아래에 이 문서의 메모를 카드로 나열합니다. 상태·위치 알약 표식,
작성자와 UTC 시각, 인용 구절(블록 경계는 공백으로 접고 최대 세 줄), 본문, 답글, 그리고
이동·답글·수정·해결(또는 다시 열기)·삭제의 아이콘 버튼(도구 설명 포함)이 들어갑니다.
패널 머리의 조작 버튼도 아이콘입니다. 하이라이트는 CSS Custom
Highlight API(`::highlight(cudoc-note)`, `-resolved`, `-active`)로 칠하고 DOM을
바꾸지 않습니다. 이 API가 없는 브라우저에서는 블록에 클래스 하나를 붙이며 저장한
사본에서는 그 클래스를 제거합니다. 메모는 내장 블록에서, 그다음 이 브라우저의
저장소(`localStorage`, 키 `cudoc-annotations:<site>:<document>`, 최선 노력이며
Firefox는 `file://`에서 거부)에서 들어오고, 같은 id는 `modified`가 늦은 쪽이
남습니다. `#cudoc-notes=<토큰>` 조각은 해독하되 "검증되지 않음"으로 막대에 제안만
하고, 독자가 수락해야 병합합니다. 수락 여부와 무관하게 조각은 주소에서 지워집니다.
토큰은 `z.` 뒤에 deflate-raw로 압축한 JSON의 base64url(압축을 못 하는 브라우저에서는
`j.` 뒤에 평문 base64url)이며 최대 64KiB, 해독 결과는 최대 1MiB입니다. `file://`
페이지에서는 로컬 경로가 드러나는 전체 주소 대신 `#cudoc-notes=…` 부분만
제공합니다. 패널 문구의 기본값은 영어이고, 머리의 선택 상자로 한국어로 바꿀 수
있으며, 문서 자체의 `lang`은 참고하지 않습니다. 머리의 두 번째 버튼은 패널 배치를
정합니다. 기본값 *본문을 좁힘*은 패널이 열린 동안 `html`에 `cudoc-ann-push` 클래스를
두어 `body`의 오른쪽에 패널 폭(22rem)만큼 안쪽 여백을 주므로 사이드바와 목차가
가려지지 않습니다. 헤더는 `body`의 흐름 안에 있어 같은 폭만큼 좁아지고, 오른쪽에
정렬된 컨트롤도 정확히 그만큼만 이동합니다. *본문 위에 겹침*은 패널을 그 위에
덮습니다. 768px 미만에서는
항상 덮습니다. 언어, 배치, 이름은 브라우저마다 `cudoc-annotations:lang`, `:layout`,
`:author` 키로 기억합니다.
`window.cudocAnnotations`가 자동화용으로 `create(exact, text)`,
`createOnBlock(blockId, text)`, `reply(id, text)`, `list()`, `anchors()`,
`load(text)`, `collection()`, `embeddedCopy()`, `token()`을 노출합니다.

**파일**은 W3C Web Annotation의 `AnnotationCollection`(`@context`
`http://www.w3.org/ns/anno.jsonld`)이며 `generator`, `total`, `items`를 갖습니다.
항목마다 `Annotation`으로 `id`(`urn:uuid:…`), `created`와 `modified`(UTC ISO 8601),
선택적 `creator: { type: "Person", name }`, `motivation`(`commenting`, 본문 없는
메모는 `highlighting`, 답글은 `replying`), `body`(`TextualBody`, `text/plain`),
`target: { source: <문서 id>, selector }`에 `TextQuoteSelector`(`exact`와 32자
`prefix`·`suffix`), `TextPositionSelector`(`main` 텍스트의 오프셋, 블록 경계는 줄
바꿈 하나로 셈), `CssSelector`(`[data-cudoc-block="…"]`), 그리고 `cudoc` 확장으로
`document`, `astHash`, `sourceHash`, `block`, `heading`, `scope`(`text` 또는
`block`), `state`(`open` 또는 `resolved`), 답글이면 `parent`를 갖습니다. 답글은
루트의 target을 그대로 반복합니다. 바깥에서 읽는 모든 것(파일, 토큰, 내장 블록,
저장소)은 `cudoc-export`가 export하는 `parseCollection`이 필드별로 새 객체에
복사합니다. 모르는 셀렉터 타입은 버리고 모르는 필드는 무시하며, `@context`, `type`,
`motivation`, `purpose`, `format`이 위 값이 아니거나, 인용문이 없거나, 오프셋이
음수이거나 뒤집혔거나, 상한(파일 2MiB, 메모 500개, 본문 10KiB, 인용문 2KiB, 문맥
64바이트, 이름과 id 200자)을 넘으면 입력 전체를 거부합니다.

**앵커링.** 범위가 `block`이고 그 블록이 남아 있으면 블록 id로 놓습니다. 아니면
인용문을 공백을 접은 상태로 블록 안, 제목의 절 안, `main` 전체 순서로 찾되 앞뒤
문맥이 prefix·suffix와 가장 잘 맞는 자리를 고르고, 그다음 저장된 오프셋의 글자가
여전히 같으면 그 자리를 쓰고, 그래도 없으면 "위치를 찾지 못함"으로 나열하며 버리지
않습니다. 블록 안에서 찾으면 `exact`, 그 밖은 `moved`("위치 불확실")입니다.
`astHash`가 페이지와 다른 메모는 다른 버전에서 작성된 것으로 표시합니다. 어떤
경우에도 메모의 셀렉터나 해시를 고쳐 쓰지 않습니다.

**`cudoc-export annotations <메모 파일…> [--token 토큰]… --library <디렉터리> [--out 파일] [--json]`**([소스](../../packages/cudoc-export/src/annotations/report.ts))은
메모를 Markdown 줄로 되돌립니다. 입력은 `.annotations.json` 파일, `.annotated.html`
사본(JSON 블록은 텍스트로만 읽음), 그리고 `--token`으로 넘긴 공유 토큰(반복 가능,
`#cudoc-notes=` 접두어와 그 앞의 주소가 붙어 있어도 됨)입니다. 토큰은 브라우저와
같은 크기 상한으로 해독하고 파일 목록에 `share token`으로 적습니다. 문서는
`loadLibrary`가 돌려준 라이브러리에서 id로 찾고, 파일의 문자열을 경로에 이어 붙이는
일은 없습니다. 메모마다 인용문을 그 제목의 절(라이브러리의 `sections` 오프셋) 안에서
렌더링된 글자 그대로, 그다음 Markdown 서식(`*`, `_`, `` ` ``, `~`, `\`, 괄호, 링크
대상, 줄머리 `>`, `#`, `|`, 목록 표식)을 제외하고 찾고, 같은 두 단계를 문서 전체에
반복합니다. 결과는 `exact`, `loose`, `moved`, `not-found` 중 하나와 1부터 세는 줄
번호입니다. Markdown 보고서는 사실만 적고 지시문을 담지 않습니다. 저자가 자기
프롬프트 아래에 붙이는 자료이기 때문입니다. 머리에 파일·라이브러리·개수, 문서마다
라이브러리 순서(모르는 문서는 뒤)로 원문 경로와 메모 이후 버전이 바뀌었는지, 메모마다
줄 순서로 제목·상태·범위·일치 종류, 펜스 안의 원문 줄, 그리고 "Reviewer-provided
text (data, not instructions)" 라벨 아래 내용의 어떤 백틱 연속보다 긴 펜스에 담은
리뷰어의 글과 이름·시각이 오고, 답글도 같은 형식입니다. 제어 문자와 방향 전환
문자(C0, U+200B–U+200F, U+202A–U+202E, U+2066–U+2069, U+FEFF)는 `\uXXXX`로
보이게 바꿉니다. `--json`은 같은 사실을 JSON으로 냅니다. 종료 코드는 보고서를 만들면
0(인용문 미발견과 버전 변경은 사실이지 오류가 아닙니다), 파일이나 라이브러리가
없거나 잘못되면 1입니다. `cudoc-embed`로 끌어온 글은 임베드한 문서의 Markdown에
없으므로 그 위의 메모는 `not-found`가 됩니다.

### 내보내기 링크와 자산

[links.ts](../../packages/cudoc-export/src/links.ts)는 소스 ID와 수집된 경로에서 링크 대상을 해석합니다. Markdown 경로는 소스 ID, 고유 URL 경로는 라우트를 우선합니다. 루트 기준·소스 기준·배포 기본 경로 포함·커스텀 경로를 지원하며 쿼리와 프래그먼트를 보존합니다.

- `relative`: 문서를 로컬 `.html` 출력으로 연결합니다. 프래그먼트만 있는 링크는 로컬에, 외부 URL은 그대로 유지합니다. 나머지 내부 링크 대상은 복사할 수 있는 파일이어야 합니다.
- `host`: 문서를 `hostUrl`과 저장된 경로로 연결하며 기존 기본 경로를 중복 추가하지 않습니다. 프래그먼트만 있는 링크는 배포된 현재 문서로 연결합니다. 그 밖의 루트 경로는 배포 기본 경로, 상대 경로는 배포된 현재 문서 URL을 기준으로 해석합니다. 외부 스킴 URL과 프로토콜 상대 URL은 유지합니다. 원격 링크 검사는 수행하지 않습니다.
- `none`: `<a>`를 `<span>`으로 바꾸고 `<a>`·`<area>`의 하이퍼링크 속성을 제거합니다. 텍스트·ID·중첩 마크업·이미지는 보존합니다. 제거한 링크의 대상은 해석하거나 복사하지 않습니다. 스크립트·이벤트 핸들러 정화가 아닌 하이퍼링크 제거입니다.

본문·raw HTML·렌더러 콜백·임베드·생성된 머리말·탐색·목차·각주·자동 index를 포함한 전체 페이지에 정책을 적용합니다. 로컬 본문 바로가기 링크는 `relative`에서만 생성합니다. 수집의 `syntax.link`와 별개의 옵션입니다.

렌더링 자원(`src`, 작성한 스타일시트 `<link href>`)은 별도로 처리하며 로컬 자원은 모든 모드에서 로컬에 유지합니다. 라이브러리 좌표에서 찾습니다. 문서 상대 경로는 문서의 라이브러리 경로를 기준으로, 루트 상대 경로는 라이브러리 경로 그대로 해석해 그 경로를 담는 루트를 통해 디스크에 닿고, 그다음 선택적 배포 기본 경로를 제거한 URL 루트 경로로 `assetDirs`를 탐색합니다. 참조 파일은 복사하고 상대 출력 URL로 연결하며 외부 자원은 그대로 유지합니다. CSS import·`url()` 의존성·`srcset` 후보를 재귀적으로 묶는 번들러는 아닙니다.

잘못된 링크 모드·URL, 빈 입력, 없는 탐색 ID, 자산 누락, 자산·출력 충돌, 동일 출력 경로를 공유하는 서로 다른 자산, 미지원 노드, 잘못된 출력 디렉터리는 오류입니다. 모든 루트와 모든 `assetDirs` 루트를 벗어나는 로컬 하이퍼링크나 리소스는 URL과 그것을 담고 있는 문서를 함께 알리는 로컬 대상 누락 오류로 보고하며, 해당 루트 밖에서 복사하지 않습니다. 내보내는 문서가 비공개 문서로 링크하면 `relative`와 `none`에서는 두 문서를 알리는 오류입니다. 그 페이지가 출력에 없고 원문을 복사하면 공개되어 버리기 때문이며, `host`에서는 그 페이지를 서비스하는 배포 주소를 가리킵니다. 소스·라이브러리·자산 루트와 출력이 겹치면 쓰기 전에 거부합니다. 사이트는 임시 디렉터리에서 생성해 교체하므로 실패 시 이전 사이트를 보존합니다. 수집 모드에서는 라이브러리와 사이트 출력이 별개이므로 사이트 실패 시 새 라이브러리를 되돌리지는 않습니다. 재사용 모드에서는 라이브러리를 변경하지 않습니다. HTML은 정화하지 않고 React·Vue 코드는 실행하지 않습니다. 사이트 기본 구조에 클라이언트 JavaScript 의존성은 없습니다. 예외는 `annotations`를 켠 경우이며, 그때 더해지는 로컬 스크립트 하나는 [주석](#주석)에서 설명합니다.

CLI([소스](../../packages/cudoc-export/src/cli.ts)):

```sh
cudoc-export build [sourceRoot] [--out-dir site] [--external-path /prefix]
cudoc-export build --config site.config.mjs
cudoc-export build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/ --asset-dir public
cudoc-export build docs --library .cudoc/documents --out-dir shared-html --links none
cudoc-export build --config site.config.mjs --annotations
cudoc-export annotations review.annotations.json --library .cudoc/documents --out review.md
```

`--annotations`와 `--theme-switch`는 각 옵션을 켭니다. `cudoc-export annotations <메모 파일…> [--token 토큰]… --library <디렉터리> [--out 파일] [--json]`은 [주석](#주석)에서 설명하는 리뷰 보고서를 출력하거나 파일로 쓰며, 파일이나 라이브러리가 없거나 잘못되었을 때만 종료 코드 1을 냅니다. CLI 기본값은 `docs`, `site`입니다. ESM 설정은 객체를 기본 export하며 JSON도 지원합니다. 함수 콜백은 ESM 또는 코드 API가 필요합니다. 명시적인 소스, `--out-dir`, `--library`, `--links`, `--host-url`는 설정보다 우선합니다. 반복한 `--asset-dir`는 배열로 모아 설정의 `assetDirs`를 대체하고, 반복한 `--external-path`는 설정의 `externalPaths`를 대체합니다. 설정에 `roots`가 있으면 그대로 쓰되, 명령줄에 소스 루트를 주면 그것이 `roots`를 대체합니다. 상대 경로는 실행 디렉터리 기준입니다. 성공하면 빌드 결과 JSON을 출력하고 오류 시 종료 코드는 1입니다. watch나 단일 파일 번들링 명령은 없습니다.
