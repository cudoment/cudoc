# 어댑터 API와 파이프라인

[English](./adapters.md) | **한국어** · [API 레퍼런스](./README.ko.md)

## remark

소스: [prepare.ts](../../packages/cudoc-remark/src/prepare.ts), [options.ts](../../packages/cudoc-remark/src/options.ts). `cudoc-remark` 또는 `cudoc-remark/prepare`의 기본 export는 `CudocRemarkOptions`를 받는 unified 플러그인 `cudocPrepare`입니다.

권장 옵션은 `DocumentOptions`의 `syntax`, `host`, `format`, `calloutTypes`, `components`, `headingIds`, `tableColumnWidths`, `ignoreDiagnostics`에 `tableColumnLayout`, `toc`, `transforms`를 더한 구성입니다. `tableColumnWidths`는 `tableColumnLayout`과 같은 검증을 거쳐 그보다 먼저 실행되고, `ignoreDiagnostics`는 `normalizeDocument`에 그대로 전달됩니다([문서 옵션](./document.ko.md#문서-옵션)). 옵션을 생략하거나 `syntax: {}`를 전달하면 컴포넌트 없는 기본 설정을 사용합니다. 플러그인은 frontmatter 파싱을 설치하고 공통 Docusaurus 파이프라인에 directive 파싱을 추가합니다. 자체 파서는 들여오지 않습니다. Markdown과 MDX는 호스트의 프로세서가 파싱하고, GFM은 호스트 또는 `remark-gfm`으로 설치합니다.

파이프라인 동작:

1. 옵션을 해석하고 알 수 없는 최상위 키를 거부합니다.
2. `cudoc-remark/loader`가 덧붙인 `[cudoc-library]` 링크 참조 정의를 제거하므로, 이 정의는 렌더링된 페이지에도 내보낸 트리에도 남지 않습니다.
3. 기본적으로 YAML 콘텐츠 노드를 제거하고 소스와 함께 `normalizeDocument`를 호출합니다. 진단은 VFile에 추가합니다. 파일 경로가 없거나 `format: "md"`를 명시해도 적용합니다.
4. 정규화 후 순회에서 사용자 `transforms.pre`/`post`를 실행합니다. 여기서 pre/post는 순회 진입·종료를 뜻하며 내장 정규화 전·후가 아닙니다.
5. 선택적 TOC를 수집하고 적용 형식이 `mdx`일 때만 ESM export를 추가합니다. 명시한 `format`은 파일 확장자보다 우선합니다.

`headingMetadata`, 최상위 `badge`, 최상위 `tableCellList`를 명시한 MDX 파이프라인만 하위 수준의 이름 있는 컴포넌트 변환을 선택합니다. 이 옵션은 `syntax`와 함께 지정할 수 없으며 오류가 발생합니다. Markdown 파일은 항상 공통 정규화를 사용하므로 컴포넌트 전용 옵션 대신 `syntax`로 기능을 설정합니다. 기본 작성 환경에는 `Anchor`나 `Badge` 등록이 필요하지 않습니다. 하위 변환 테스트는 명시적으로 해당 경로를 선택하고, 기본 렌더링은 컴포넌트 provider 없이 검증합니다.

`toc` 기본값은 false입니다. `toc: true`이면 `{ titleDepth: 1, depths: [2,3], exportName: "toc" }`를 사용합니다. titleDepth는 false가 가능하고 수집 깊이는 1~6 중 한두 항목을 지정합니다. `Toc`는 `{ title: string | null, headings: { id, text, children: { id, text }[] }[] }`입니다. 링크 가능한 제목만 수집합니다. 추가 옵션으로 앵커 이름과 배지 구분자를 조정합니다. Docusaurus·Nextra는 목차를 호스트가 소유하므로 `toc`를 거부합니다.

지원 함수로 `getFileSource(file) → string | null`, `resolveOptions(options?)`, `buildTransforms(resolved) → {pre, post}`를 제공합니다. `buildTransforms`는 이름 있는 컴포넌트 변환 순서를 구성하며 `normalizeDocument`를 대체하지 않습니다.

### remark 진입점

| Import                             | Export·역할                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cudoc-remark`                     | 기본·이름 export `cudocPrepare`, 옵션 타입·해석, 변환, TOC 도우미, 제목 ID 반영, 호스트 팩토리, `createCompilerCapture`, `CompilerCaptureOptions` |
| `cudoc-remark/prepare`             | 준비 플러그인, 변환·소스 도우미                                                                                                                   |
| `cudoc-remark/heading-ids`         | 기본·이름 export `promoteAnchorIds`; 설정된 앵커 ID를 제목 HTML 데이터로 복사                                                                     |
| `cudoc-remark/host-plugins`        | `createHostPlugins`, `HostPluginOptions`                                                                                                          |
| `cudoc-remark/badge`               | 배지 변환·해석·기본값                                                                                                                             |
| `cudoc-remark/table-cell-list`     | 셀 목록 변환과 파싱. `@cudoment/cudoc/transforms/table-cell-list`를 다시 내보냅니다                                                               |
| `cudoc-remark/table-column-layout` | 배치 변환·옵션·표 생성·분할. `@cudoment/cudoc/transforms/table-column-layout`을 다시 내보냅니다                                                   |
| `cudoc-remark/toc`                 | `createToc`, `resolveTocOptions`, `collectHeadingToc`, `addTocExport`, TOC 타입·기본 export 이름                                                  |
| `cudoc-remark/embed`               | 준비된 임베드 접합 플러그인, `restoreExpressions`                                                                                                 |
| `cudoc-remark/loader`              | 문서를 준비된 라이브러리에 묶는 번들러 로더. `libraryLoader`, `libraryFingerprint`, `stripLibraryMarker`, `LIBRARY_LOADER`                        |
| `cudoc-remark/components`          | 하위 컴포넌트 출력용 `Anchor`, `Badge`, `cudocComponents`                                                                                         |

변환 함수는 프로세스 안에서 실행할 수 있지만 함수 옵션은 JSON 전용 번들러 worker 경계를 통과하지 못합니다. Next.js Turbopack에는 패키지 이름 문자열과 직렬화 가능한 옵션을 전달합니다.

## 컴파일러 캡처

소스: [capture.ts](../../packages/cudoc-remark/src/capture.ts). `createCompilerCapture`는 `cudoc-remark`에서 가져옵니다.

```ts
createCompilerCapture(options?: CompilerCaptureOptions): {
  remark: Plugin<[], Root>
  rehype: Plugin
  read(): CompiledDocument
}
```

컴파일마다 캡처 객체를 하나 생성합니다. remark 플러그인은 현재 트리 참조를 보관하고, rehype 플러그인은 호스트 remark 처리 후 트리를 복제하여 정적 HTML JSX 변환·YAML/ESM 제거를 수행합니다. frontmatter는 `file.data.frontMatter` 또는 `file.data.frontmatter`에서 읽습니다. 캡처 단계까지 컴파일하지 않으면 `read()`가 오류를 발생시킵니다.

remark 플러그인은 각 `image` 노드의 `url`, `alt`, `title`도 기록합니다. rehype 플러그인이 실행되기 전에 호스트 플러그인이 그런 노드를 제자리에서 고쳐 쓰면(Docusaurus는 로컬 이미지를 `src`가 `require()` 호출인 `img` JSX 요소로 바꿉니다), 캡처는 그 노드에 세 값을 담은 `data.cudocImage`를 표시합니다([캡처한 이미지](./document.ko.md#의미-ast)). 그래서 저장된 트리에도 작성자가 쓴 이미지가 무엇이었는지 남습니다. 노드를 새 노드로 갈아 끼우는 플러그인이면 표시할 노드가 남지 않습니다.

`CompilerCaptureOptions.aliases`는 호스트가 스스로 해석하는 경로 접두어를, 이미지를 대신 기록할 접두어에 연결합니다. 일치하는 접두어가 여럿이면 가장 긴 것을 씁니다. 호스트가 이미지를 그대로 두었든 컴포넌트로 바꾸었든 기록하는 모든 이미지의 `url`이 바뀌며, 호스트 자신의 페이지는 바뀌지 않습니다. Docusaurus는 `@site/static/img/logo.png`를 사이트 디렉터리에서 읽어 `/img/logo.png`로 서비스하므로, Docusaurus 수집기는 정적 디렉터리마다 항목을 하나씩 두어 `{ "@site/static/": "/" }`를 넘기고, 검사와 내보내기는 자산 디렉터리에서 그 파일을 찾습니다. 정적 디렉터리 밖을 가리키는 `@site/` 경로는 어떤 별칭과도 맞지 않고 사이트가 서비스하는 주소도 없으므로 쓴 그대로 기록되며, 검사는 이를 `missing-asset`으로 보고합니다. 이렇게 기록하는 것은 이미지뿐이며, 링크는 Docusaurus가 `@site/`로 해석하는 것이라도 쓴 경로를 그대로 둡니다. 비어 있지 않은 접두어를 문자열에 연결하는 객체가 아닌 값을 주면 `capture aliases must map path prefixes to strings` 오류가 발생합니다.

현재 캡처 결과의 `diagnostics`는 `[]`이며 호스트 VFile 경고를 복사하지 않습니다. 최종 remark 트리를 대상으로 하며 이후 임의 rehype 변환이나 컴포넌트 실행 결과는 포함하지 않습니다. 수집기가 원문 스냅샷을 만들 때까지 소스 위치를 보존해야 합니다.

수집할 때는 cudoc 문법과 캡처를 설치하되 준비된 임베드 삽입 플러그인은 제외합니다. 전체 문서 수집 후 resolver가 읽도록 `cudoc-embed` 코드 블록을 유지합니다. 수집과 치환에는 동일한 플러그인·설정을 적용한 실제 호스트 프로세서를 사용합니다.

## 준비된 임베드 접합

소스: [embed.ts](../../packages/cudoc-remark/src/embed.ts), [loader.ts](../../packages/cudoc-remark/src/loader.ts).

`cudoc-remark/embed`의 기본 export는 `{ sourceRoot?: string, roots?: SourceRoot[], outDir?: string }`를 받으며 기본값은 `sourceRoot: "docs"`, `.cudoc/documents`입니다. 수집에 쓴 것과 같은 `roots`를 주면 같은 ID를 얻습니다. `file.path`를 담는 가장 안쪽 루트의 기준 경로 뒤에 그 아래 경로를 잇고 확장자를 뗀 값입니다. 루트는 코드 블록을 만났을 때에만 해석하므로, 어느 루트에도 속하지 않는 파일도 임베드가 없으면 그대로 컴파일되고 임베드가 있으면 파일 이름을 알리며 실패합니다. 접합 자체는 `@cudoment/cudoc/node/prepare-embeds`의 `expandPreparedEmbeds`가 수행하며, markdown-it 어댑터와 `cudoc-export`도 같은 함수를 씁니다([준비된 임베드](./node.ko.md#준비된-임베드)). 블록 번호를 매기며 로더의 표식을 뗀 `file.value`로 준비 데이터의 최신 상태를 검사하고, 각 코드 블록을 `embeds.json`에서 읽은 준비 블록의 자식 노드로 바꿉니다. 복제한 노드를 코드 블록이 있던 자리에 접합하는 것이며, 코드 블록이 있는 문서만 준비 데이터를 읽습니다. 다른 원문으로 준비한 데이터는 `cudoc: stale prepared embeds for <id>; recollect documents`로, 준비 블록이 없는 코드 블록은 `cudoc: prepared embed missing in <id>; recollect documents`로 실패합니다.

접합된 노드는 그때부터 보통의 mdast입니다. 호스트의 나머지 remark 플러그인, remark-rehype, 컴포넌트 매핑이 문서 자신의 내용과 똑같이 다루므로, 임베드된 절 안의 컴포넌트는 호스트의 컴포넌트로 렌더링되고 코드 블록은 호스트의 강조기에 닿습니다. HTML 문자열로 렌더링하지 않고, 감싸는 요소를 넣지 않으며, 런타임 컴포넌트나 데이터 import를 생성하지 않습니다. 저장된 블록에는 `estree`가 없으므로(AST 내보내기가 제거) `restoreExpressions(node, documentId)`가 내보내기가 남긴 표현식 글자에서 다시 파싱합니다. 블록 안의 모든 `mdxFlowExpression`, `mdxTextExpression`, `mdxJsxAttributeValueExpression`, `mdxJsxExpressionAttribute`가 대상이며 acorn과 JSX 확장을 씁니다. 값·흐름·텍스트 표현식은 `(값)`으로, 전개 속성은 MDX 파서가 만드는 것과 같은 `({값})`으로, 주석만 있는 표현식은 빈 프로그램으로 파싱하고, 파싱되지 않는 글자는 문서와 표현식을 알리는 오류입니다. 임베드된 제목은 `hProperties.id`를 유지해 앵커로 렌더링됩니다. `cudoc-remark`가 이 플러그인보다 먼저 계산하는 자체 `toc` export에는 들어가지 않습니다. 호스트의 목차에 들어가는지는 호스트가 트리를 읽는 시점에 달려 있습니다. Docusaurus는 이 플러그인을 설치하는 `docs.remarkPlugins`보다 먼저 실행되는 기본 remark 플러그인에서 목차를 계산하므로 임베드된 제목이 목차에 없습니다. Nextra는 최종 트리에서 목차를 만들므로 그 제목들을 나열합니다. 임베드된 절 안의 `cudoc-embed` 코드 블록은 해석기가 이미 전개했으므로 중첩 임베드는 전개된 상태로 옵니다. 작성자는 cudoc 컴포넌트를 등록하지 않습니다.

컴파일된 페이지가 이제 라이브러리 내용을 담으므로 `embeds.json`에 의존하는데, 번들러는 remark 플러그인이 읽은 파일을 볼 수 없습니다. `cudoc-remark/loader`는 같은 파일에 MDX 로더보다 앞서 거는 webpack·Turbopack 로더이며 세 가지 일을 합니다. `addDependency`로 `embeds.json`을 모듈의 의존성으로 선언하는데, 이는 개발 서버와 webpack의 영구 캐시가 지켜보는 것입니다. 원문 끝에 빈 줄을 두고 `[cudoc-library]: #<embeds.json의 sha256>` 한 줄을 덧붙이는데, 이는 Markdown에서도 MDX에서도 아무것도 렌더링하지 않는 링크 참조 정의이며, 그 덕에 라이브러리가 바뀔 때마다 MDX 로더의 입력이 바뀝니다. Turbopack은 작업의 출력을 비교해 캐시하므로 원문을 건드리지 않는 로더로는 그 뒤의 컴파일에 닿을 수 없기 때문입니다. 그리고 번들러 설정을 평가하는 시점에 계산한 라이브러리의 `fingerprint`를 옵션에 담는데, 이것이 Turbopack의 영구 빌드 캐시가 두 빌드 사이에 이 로더를 다시 실행하게 만드는 조건입니다. 임베드 플러그인은 원문을 라이브러리 스냅숏과 비교하기 전에 `stripLibraryMarker`로 표식을 떼어 내므로 최신 상태 검사는 파일을 쓴 그대로 봅니다. 로더를 두 번 거쳐도 표식이 쌓이지 않습니다. `libraryFingerprint(outDir?)`는 `embeds.json`의 SHA-256이며 파일이 없으면 `""`이고, 파일의 크기와 수정 시각을 키로 캐시합니다. `libraryLoader(outDir?)`는 webpack `use` 항목이나 Turbopack `loaders` 항목으로 쓸 수 있는 순수 JSON `{ loader: "cudoc-remark/loader", options: { outDir, fingerprint } }`를 돌려줍니다. 빌드 스크립트에서는 설정 평가가 `cudoc collect` 뒤에 일어나므로 fingerprint는 새 라이브러리의 것입니다. Next.js 예제에서 확인한 결과, 로더가 있으면 `.next/cache`를 유지한 두 `next build` 사이의 재수집이 두 번들러 모두에서 임베드하는 페이지에 반영되고, 없으면 이전 라이브러리로 컴파일된 페이지가 자기 파일이 바뀌거나 캐시를 지울 때까지 그대로 제공됩니다.

## Docusaurus와 Nextra

소스: [host-plugins.ts](../../packages/cudoc-remark/src/host-plugins.ts), [Docusaurus](../../packages/cudoc-docusaurus/src/index.ts), [Nextra](../../packages/cudoc-nextra/src/index.ts).

두 패키지는 `cudocRemarkPlugins(options?) → PluggableList`, `promoteAnchorIds`, 옵션 타입을 제공합니다. 각 `cudocRemarkPlugins`는 `cudoc-remark/host-plugins`의 공통 팩토리를 자기 패키지 이름과 호스트로 호출합니다.

```ts
createHostPlugins(
  options: HostPluginOptions | undefined,
  adapter: string,
  host: "docusaurus" | "nextra",
): PluggableList
```

`HostPluginOptions`는 `CudocRemarkOptions`에서 `toc`, `host`, `headingIds`를 빼고 기본 true인 `promoteHeadingIds?: boolean`을 더합니다. 이 세 옵션은 어댑터가 정하는 값이므로, 다른 알 수 없는 키와 마찬가지로 전달하면 어댑터 이름을 알리는 unknown option `TypeError`가 됩니다. `host` 인자가 두 값이 아니어도 `TypeError`입니다. 나머지 옵션은 팩토리를 호출하는 시점에 해석하므로, 거부되는 값은 사이트 설정을 불러오는 동안 오류가 됩니다. 팩토리는 `host`를 정하고 `headingIds: "host"`를 강제하며 cudoc TOC를 끈 뒤, 다음 순서의 플러그인 목록을 반환합니다. 각 항목은 플러그인이거나 `[plugin, options]` 쌍이며, Docusaurus 전용 플러그인은 배열로 감싸지 않습니다. Docusaurus가 설정을 검증할 때 요소가 하나뿐인 배열을 거부하기 때문입니다.

1. 해당 옵션을 받은 `cudocPrepare`
2. `promoteHeadingIds: false`가 아니면 `promoteAnchorIds`. 각 앵커 ID를 제목의 `hProperties.id`로 복사해, 호스트가 제목 문구를 slug로 바꾸는 대신 그 ID를 쓰게 합니다.
3. Docusaurus에서만, Docusaurus의 slugger가 바꿀 제목 `hProperties.id`를 제목 끝의 `{#id}` 텍스트로 옮기는 플러그인. Docusaurus는 제목에 이미 있는 ID를 자기 slugger에 다시 통과시켜 `v1.2`를 `v12`로 바꾸지만, 끝에 붙은 `{#id}`는 쓴 그대로 유지합니다. 목차도 같은 값을 읽으므로 제목, 앵커, 목차 항목이 일치합니다. 문자, 숫자, 하이픈, 밑줄로만 된 ID는 제목에 그대로 두는데, slugger는 이 ID를 바꾸지 않고 기록하므로 뒤에 오는 제목의 글자가 같은 값으로 slug되면 같은 ID 대신 `-1`을 받고, 같은 ID를 적은 두 번째 제목도 `-1`을 받습니다. slugger는 글자에서 만든 ID도 기록하므로, 순서가 반대인 `## Setup` 다음 `## Intro (#setup)`에서는 Docusaurus에서 명시한 ID 쪽이 `setup-1`이 되고, 모든 ID를 문서 순서대로 slugger에 넣는 Nextra에서도 같습니다. markdown-it 호스트와 독립 컴파일은 명시한 ID에 `setup`을 남기고 앞의 제목에 번호를 붙입니다. 명시한 ID를 가진 제목을 앞에 쓰거나 다른 제목에도 ID를 직접 지정하면 모든 호스트가 같은 값을 냅니다. 페이지의 `#` 제목은 항상 ID를 제목에 둡니다. Docusaurus는 `{#id}`를 떼어 내기 전에 그 제목 글자에서 페이지 제목을 읽기 때문에, 표식이 제목에 섞이게 됩니다. 따라서 그 제목의 id를 slugger가 바꾸는 경우(`(#v1.0)` 등)에는 바뀐 값이 나오므로, 페이지 제목에는 slug 형태의 id를 쓰십시오.

Nextra는 자체 `[#id]`를 포함한 모든 제목 ID를 slugger에 통과시키므로, ID는 이미 slug 형태일 때만 철자가 유지됩니다. `(#v1.2)`는 `id="v12"`로, `(#release-2)`는 그대로 렌더링됩니다. 이 slugger는 ID를 문서 순서대로 받으므로, Docusaurus에서처럼 앞선 제목의 글자가 이미 만든 ID를 뒤에서 명시하면 명시한 쪽이 `-1`을 받습니다. 영문 소문자, 숫자, 하이픈으로 쓴 앵커는, 같은 ID를 만들 글자의 제목보다 앞에 있으면 모든 호스트에서 같게 해석됩니다.

| 호스트     | 설치 위치                                                        | 실제 수집 예제                                                               |
| ---------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Docusaurus | `docs.beforeDefaultRemarkPlugins`; 임베드는 `docs.remarkPlugins` | 실제 MDX 프로세서의 [collect.mjs](../../examples/docusaurus/collect.mjs)     |
| Nextra     | 호스트 플러그인 앞에 추가되는 `mdxOptions.remarkPlugins`         | `nextra/compile`을 사용하는 [collect.mjs](../../examples/nextra/collect.mjs) |

Docusaurus는 `{ name, getThemePath }`를 반환하는 기본 플러그인과 `./package.json`도 제공합니다. 이 플러그인은 이름 있는 컴포넌트의 테마 매핑용이며 가이드의 명시적 `syntax` 설정에는 필요하지 않습니다. Nextra는 `./components`, `./package.json`을 추가 제공하며 마찬가지로 해당 설정에 컴포넌트 매핑은 필요하지 않습니다.

Docusaurus 예제는 버전별 내부 MDX 프로세서 진입점을 사용합니다. 의존성 업그레이드 때 다시 확인합니다. 호스트 이름만 지정한다고 독립 파싱과 실제 호스트 파이프라인이 같아지지는 않습니다.

## markdown-it

소스: [tokens.ts](../../packages/cudoc-markdown-it/src/tokens.ts), [plugin.ts](../../packages/cudoc-markdown-it/src/plugin.ts), [compiler.ts](../../packages/cudoc-markdown-it/src/compiler.ts), [options.ts](../../packages/cudoc-markdown-it/src/options.ts), [host.ts](../../packages/cudoc-markdown-it/src/host.ts), [text.ts](../../packages/cudoc-markdown-it/src/text.ts). `cudoc-markdown-it`에서 import합니다.

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
markdownItText(source: string): { text: string; toSource: (offset: number) => number }

type TokenConversion = {
  adapter?: string
  token?: TokenNode
  render?: (tokens: Token[], start: number, end: number, inline: boolean) => string
  origins?: Map<DocumentNode, Token>
}
```

이 패키지는 markdown-it 계열에서 `cudoc-remark`와 같은 역할을 담당합니다. 공통 구성이 여기에 있고 각 호스트 어댑터는 `MarkdownItHost` 정의만 제공합니다. `HostPluginOptions`는 `DocumentOptions`에서 `host`, `format`, `components`를 빼고(`tableColumnWidths`, `ignoreDiagnostics`는 포함) 선택적 `onDocument(tree, source, env)`, `onDiagnostic(diagnostic, documentId)`, `library`, `outDir`(준비 데이터 기본 경로 `.cudoc/documents`)을 더합니다. `resolveHostOptions`는 플러그인을 설치하는 시점에 실행되므로, 다음 경우는 core 규칙 안이 아니라 사이트 설정을 불러오는 동안 오류가 됩니다. 알 수 없는 키, 객체가 아닌 인자, `"host"`가 아닌 `headingIds`, 잘못된 `syntax`, `components`(markdown-it이 만들지 않는 MDX 요소를 매핑하는 옵션입니다), 그리고 유효한 규칙의 배열이 아닌 `tableColumnLayout`·`tableColumnWidths`입니다. 표 규칙은 remark 어댑터와 같은 해석 함수로 검사하며 `tableColumnWidths[0]`처럼 위치를 알립니다. 플러그인은 해당 호스트의 의미와 `format: "md"`, 호스트 제목 생성을 사용합니다. `@types/markdown-it`은 이 패키지와 두 markdown-it 어댑터의 선택적 peer 의존성이며, 설정을 타입 검사하는 사이트를 위한 것입니다.

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

`tokensToAst`는 실제 markdown-it 토큰을 호스트 처리 후 mdast로 변환하며 Markdown을 두 번 파싱하지 않습니다. 모든 호스트가 공통으로 만드는 블록·인라인 토큰, 담고 있는 문자로 바꾸는 `emoji` 토큰(VitePress가 켜는 markdown-it-emoji), `github_alert_*`, `markdown-it-container` 블록을 처리합니다. `container_details_*`는 펼칠 수 있는 `details` 인용문이 되고, 컨테이너 이름이 대소문자 구분 없이 `note`, `tip`, `important`, `warning`, `caution`, `info`, `danger`이거나, 콜아웃 타입의 별칭인 호스트 이름 `default`, `error`, `warn`이거나, 등록한 `calloutTypes` 항목이면 콜아웃이 됩니다. VitePress의 `code-group`, `raw`나 사이트가 등록한 컨테이너처럼 그 밖의 컨테이너는 호스트 방식으로 열고 닫습니다. 여는 토큰과 닫는 토큰은 각각 호스트가 렌더링하는 `html` 노드가 되고, 그 사이의 내용은 페이지의 나머지와 똑같이 변환하므로 코드 그룹이나 상자 안의 제목 앵커와 임베드도 그대로 동작합니다. 호스트의 `token` 훅이 공통 변환보다 먼저 호출되므로 호스트 고유 요소가 기본 변환을 대체할 수 있습니다. 표 셀 인라인 파싱도 같은 설정의 파서를 사용합니다. 링크와 이미지는 `href`, `src`를 포함한 토큰 속성을 `hProperties`로 유지하고 토큰의 `title`을 자기 필드로 가집니다. 이미지의 `alt`는 mdast가 읽듯이 레이블을 일반 텍스트로 읽은 값이며(코드와 엔터티는 유지하고, 소프트 줄바꿈은 줄바꿈 문자로, 하드 줄바꿈은 빈 문자열로 읽습니다), markdown-it이 속성 사이에 남겨 두는 빈 `alt` 자리 표시는 그 텍스트를 덮어쓰므로 뺍니다. 제목이 호스트 방식으로 ID를 지정하는 것은 코드 스팬 밖, 끝에 `{#id}`가 있을 때뿐이므로 ``## Write `{#id}` here``는 문법을 사용하는 것이 아니라 설명하는 제목입니다.

그런 컨테이너를 제외하고 여기서 매핑하지 않는 토큰은, 블록을 여는 토큰이면 짝이 되는 닫는 토큰까지 묶어 `conversion.render(tokens, start, end, inline)`의 결과를 담은 `html` 노드로 유지합니다. `start`와 `end`는 `tokens` 안의 인덱스이고, `inline`은 그 토큰들이 인라인 토큰의 자식인지를 나타냅니다. `render`가 없으면 그런 토큰은 누락하지 않고 `conversion.adapter`를 포함한 오류를 발생시킵니다. `origins`를 전달하면 각 `code`·`html` 노드가 만들어진 블록 토큰을 채워 넣습니다.

변환한 트리가 remark 계열과 같은 의미를 갖도록 세 가지를 처리합니다. markdown-it이 각 셀의 인라인 스타일로만 알려 주는 열 정렬을 표 노드의 `align` 배열로 모읍니다. 제목 퍼머링크는 정규화보다 먼저, 토큰을 변환하는 시점에 `data.cudoc.kind: "permalink"`로 표시하므로 제목 본문을 읽는 모든 변환이 이를 제외할 수 있습니다. 이 퍼머링크의 `href`는 ID가 확정된 뒤에 보정합니다. 그리고 호스트가 제목 없는 `> [!TIP]`에 자기 타입 이름을 제목으로 넣는 경우, 타입을 그대로 반복하는 제목은 제거하므로 같은 Markdown이 모든 호스트에서 같은 콜아웃이 됩니다.

플러그인은 `md.core` 규칙 하나를 추가하므로, cudoc이 읽는 시점에 네이티브 앵커·링크·컨테이너가 이미 토큰으로 존재합니다. 호스트는 이 규칙보다 먼저 모든 제목을 slug로 바꾸는데, 이때는 cudoc이 `(#id)`에서 확정하는 ID를 알지 못합니다. 그래서 명시 ID가 없는 제목에 호스트가 준 ID는 정규화하는 동안 따로 보관해 중복 검사가 문서에 적힌 ID만 보게 하고, 정규화가 끝나면 이미 쓰인 ID를 피해 번호를 붙여 되돌려 놓습니다. `## Intro (#setup)` 다음에 `## Setup`이 오면 다른 호스트와 마찬가지로 `setup`과 `setup-1`이 됩니다. 정규화가 끝나면 확정된 제목 ID와 제목 문구를 호스트의 `heading_open` 토큰에 다시 기록하며, 이 동작이 호스트의 제목 앵커와 목차를 일치시킵니다. 확정된 ID가 없는 제목은 호스트에 맡기고, cudoc 출력의 퍼머링크 `aria-label`은 쓴 그대로의 제목이 아니라 확정된 제목 문구를 담습니다. `env.cudoc`은 규칙이 실행된 뒤 `{ tree, source, diagnostics }`를 저장하고, `onDocument`는 임베드 확장 전 복제한 트리를 받습니다.

페이지는 두 층으로 렌더링됩니다. 먼저 호스트가 cudoc이 없을 때와 똑같이 자기 토큰 스트림을 렌더링하므로, VitePress가 `<script setup>`과 `<style>`을 페이지 컴포넌트로 옮기는 일이나 dead link 검사를 위해 링크를 기록하는 일처럼 렌더링 시점의 작업은 한 번만 일어납니다. 이어서 cudoc이 정규화된 문서를 렌더링하면서, 바꾸지 않은 `fence`, `code_block`, `html_block`마다 호스트의 출력을 되돌려 놓습니다. 그래서 문법 강조, 줄 번호, 복사 버튼, 스니펫 import가 유지되고, 호스트가 아무것도 출력하지 않은 HTML 블록은 그대로 비어 있습니다. 임베드로 들어온 코드 블록에는 호스트 토큰이 없으므로 언어와 meta로 토큰을 새로 만들어 호스트의 fence 규칙에 넘기며, 그래서 페이지와 같은 문법 강조와 복사 버튼을 받습니다. VitePress가 토큰 속성으로 옮기는 줄 강조 표시처럼 호스트가 fence의 info 문자열 밖에 두는 것은 수집되지 않으므로 사본에 이어지지 않습니다. `cudoc-embed`와 `cudoc-pagebreak` 펜스는 cudoc이 그 자리에 다른 것을 두므로, 수집할 때도 페이지를 렌더링할 때도 호스트의 fence 규칙에 넘기지 않습니다. `[[toc]]` 목차, 수식, 각주처럼 변환이 매핑하지 않는 토큰은 전체 토큰 목록과 함께 호스트의 규칙으로 렌더링하므로, 이웃 토큰을 읽는 규칙도 그대로 동작합니다. 블록은 확정된 제목 ID와 문구가 호스트 토큰에 기록된 뒤에 렌더링하므로, `## Install (#setup)`에 대한 목차 항목은 `#setup`으로 연결되고 `Install`로 읽힙니다. `env.cudocRendered`에는 페이지를 렌더링할 때 반환하는 HTML을 저장합니다.

사이트가 페이지를 렌더링하는 동안 정규화가 보고하는 진단(등록하지 않은 콜아웃 타입, ID가 같은 두 제목 등)은 `onDiagnostic(diagnostic, documentId)`로 전달되며, 기본값은 `<adapter>: <문서 ID>:<줄>: <code>: <message>` 형식의 `console.warn` 한 줄입니다. 호스트는 frontmatter를 뺀 페이지를 렌더러에 넘기므로, `library`에 그 페이지가 있으면 위치를 수집한 파일의 첫 줄부터 세도록 옮기고, 없으면 frontmatter 다음 줄부터 셉니다. 수집은 컴파일한 문서와 함께 진단을 반환하므로, 수집 중에는 여기로 보고하지 않습니다.

일반 렌더링에서 동기 컴파일러가 남아 있는 라이브러리는 임베드를 그 자리에서 해석하고, 컴파일러 없이 로딩한 라이브러리는 `expandPreparedEmbeds`로 `embeds.json`을 읽습니다. 임베드가 있는 페이지에 `library`가 없으면 `build documents and provide library before rendering embeds`로 실패합니다. 페이지는 수집한 원문이어야 합니다. 수집한 텍스트를 markdown-it이 읽는 방식대로 읽었을 때 렌더러가 받은 텍스트로 끝나고 그 앞에는 비어 있어도 되는 frontmatter와 그 앞의 바이트 순서 표시(BOM)만 있어야 하며, 그렇지 않으면 `stale collected source <id>; recollect documents`로 실패합니다. 페이지가 VitePress의 `<!--@include: ...-->`로 다른 파일을 끌어오면 대신 그 사실을 알리는 오류가 납니다. 수집은 include를 전개하지 않으므로 그런 페이지의 임베드는 대응시킬 수 없기 때문입니다. 준비 블록이 없는 코드 블록은 [준비된 임베드 접합](#준비된-임베드-접합)과 같이 실패합니다.

`createHostCompiler`는 `env.cudocCollect: true`로 렌더링해 임베드 확장을 생략합니다. frontmatter 처리 후 위치를 파일 기준으로 되돌리는데, 본문을 원문의 끝부분으로 보므로 본문과 같은 글자를 담은 frontmatter 필드가 있어도 위치가 밀리지 않습니다. markdown-it은 파싱하기 전에 모든 `\r\n`과 단독 `\r`을 `\n`으로, NUL을 U+FFFD로 읽습니다. 그래서 같은 방식으로 읽은 원문에서 본문을 찾고, 각 offset에 그 앞에 있는 `\r\n`의 `\r` 수만큼 더해 원문 스냅샷과 절 범위가 자르는 파일 자체의 텍스트 기준으로 되돌립니다. 줄 번호는 두 텍스트에서 같습니다. `markdownItText(source)`가 이렇게 읽는 함수입니다. `text`는 markdown-it이 읽는 방식대로 읽은 원문이고, `toSource`는 `text` 안의 offset을 `source` 기준으로 되돌리므로, 원문을 `state.src`와 비교하는 어댑터가 사용할 수 있습니다. frontmatter와 정규화가 보고한 진단을 반환하는데, 진단의 위치도 같은 방식으로 파일 기준으로 되돌립니다. `md`에 어댑터가 먼저 설치되어 있어야 하고 React `.mdx`는 거부합니다. 치환에도 같은 설정의 렌더러를 사용합니다.

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

| 호스트    | 사이트와 수집기가 공유하는 렌더러           | 문서 ID                                       | 호스트 정의                                    |
| --------- | ------------------------------------------- | --------------------------------------------- | ---------------------------------------------- |
| VitePress | `vitepress`의 `createMarkdownRenderer`      | 읽은 파일. `env.realPath`·`path`에서 구합니다 | `<Badge>` 토큰 변환, `resolveInlineAttributes` |
| Eleventy  | `cudoc-eleventy`의 `createMarkdownRenderer` | `env.page.filePathStem`                       | gray-matter frontmatter 분리, 재작성 소스 검사 |

VitePress는 제공하는 페이지 경로를 `env.relativePath`에 넣는데, `rewrites`와 동적 라우트에서는 이 값이 페이지를 읽은 파일과 다르고, 수집은 문서를 파일 기준으로 이름 붙입니다. 그래서 어댑터는 두 값이 다르면 원본 디렉터리(`env.path`에서 `env.relativePath`를 뺀 부분) 아래의 `env.realPath`에서, 같으면 `env.relativePath`에서 `.md`를 뗀 값을 ID로 씁니다. 경로가 바뀐 페이지도 수집된 문서 기준으로 임베드를 해석합니다.

VitePress는 일부 링크를 인라인 렌더링 시점에 확정하므로 정의에 `resolveInlineAttributes`를 설정하고, 파이프라인이 토큰 사본을 렌더링해 URL을 얻으면서 원본 토큰에 base 경로가 두 번 적용되는 것을 방지합니다. `token` 훅은 정적인 `<Badge type="tip" text="1.0" />`을 cudoc 배지로 변환하며, Vue 바인딩이 붙은 배지는 컴포넌트가 실행되기 전까지 문구를 알 수 없으므로 원본 HTML로 남깁니다. 지원하는 정적 컨테이너·링크·배지를 처리하고 동적 Vue 표현식은 평가하지 않습니다.

Eleventy는 페이지 데이터 객체를 markdown-it env로 전달하고 markdown-it보다 먼저 gray-matter로 frontmatter를 제거하므로, 정의에서 `documentId`와 `frontmatter`를 모두 제공합니다. `createMarkdownRenderer`는 Eleventy 자체 렌더러 기본값(`html: true`, 들여쓰기 코드 블록 비활성화)을 적용하고 사이트의 `configure` 콜백을 실행한 뒤 cudoc을 마지막에 설치하므로, 사이트가 등록한 fence 렌더러를 감싸게 됩니다. 사이트 설정 두 가지는 권고가 아니라 계약입니다. 첫째로 `markdownTemplateEngine: false`가 필요한데, `page.rawInput`을 markdown-it이 읽는 방식대로 읽은 텍스트(그래서 `\r\n` 줄 끝도 일치합니다)가 markdown-it이 받은 텍스트와 다르면, 다른 엔진이 소스를 이미 다시 쓴 것으로 보고 어댑터가 오류를 발생시키기 때문입니다. 둘째로 제목 퍼머링크를 제목 안쪽에 삽입해야 하는데, 제목을 감싸는 퍼머링크는 cudoc이 `(#id)` 앵커를 읽는 제목 본문을 제목 밖으로 옮겨 버리기 때문입니다. 네이티브 문법은 사이트가 등록한 플러그인에서 나오므로 `{#id}`에는 `markdown-it-attrs`, `::: warning 제목`에는 `markdown-it-container`가 필요합니다. 임베드가 있는 페이지를 env에 Eleventy 페이지 데이터 없이 렌더링하면 `the markdown-it env carries no Eleventy page data`로 실패하고, `page.filePathStem`이 없으면 그 값을 알리며 실패합니다. 기본 export는 markdown-it 플러그인입니다. `eleventyConfig.addPlugin`에 넘기면 Eleventy 설정 객체를 받게 되므로 `this is a markdown-it plugin, not an Eleventy plugin` 오류를 발생시키며 `setLibrary`를 쓰라고 안내합니다.

임베드된 내용은 호스트의 토큰이 아니라 cudoc의 트리에 접합되므로, 목차가 얼마나 완전한지는 목차가 무엇을 읽는지에 달려 있습니다. VitePress 기본 테마는 브라우저에서 렌더링된 제목으로 개요를 만들므로, ID를 유지하는 임베드된 제목이 개요에 들어갑니다. 페이지 안의 `[[toc]]`는 호스트의 토큰으로 렌더링되므로 페이지 자신의 제목만 나열합니다. Eleventy에는 자체 목차가 없습니다. markdown-it 규칙으로 만드는 목차는 페이지 자신의 제목만 보고, 렌더링된 HTML로 만드는 목차는 임베드된 제목도 봅니다.

렌더러 수명은 각 수집기([VitePress](../../examples/vitepress/collect.mjs), [Eleventy](../../examples/eleventy/collect.mjs)), 경로 설정은 각 호스트 가이드([VitePress](../vitepress.ko.md), [Eleventy](../eleventy.ko.md))를 참고하세요.

## 내보내기

소스·import: [index.ts](../../packages/cudoc-export/src/index.ts), `cudoc-export`.

```ts
type SiteLinkMode = "relative" | "host" | "none"
type HtmlMode = "site" | "standalone" | "annotate"

buildSite(options: SiteOptions): SiteResult

type SiteResult = {
  outDir: string
  documentCount: number // 이번 실행이 쓴 페이지 수
  libraryDir: string
  files: string[] // HTML 출력이 쓴 파일, outDir 기준 상대 경로, 정렬됨
  diagnostics: NavigationDiagnostic[]
  dependencies: SiteDependency[] // 단일 페이지에서만, 문서·종류·url 순으로 정렬
  omitted: OmittedDocument[]
}

type SiteDependency = {
  kind: "remote" | "file" | "page"
  document: string
  url: string // 문서에 쓴 그대로
}

type OmittedDocument = {
  document: string
  reason: "private" | "not-in-navigation"
}

type NavigationDiagnostic = {
  code:
    | "missing-translation"
    | "unmatched-navigation-order"
    | "unmatched-navigation-exclude"
  message: string
  document: string // 문서 ID, 또는 항목을 적은 위치
}
```

`SiteOptions`는 `DocumentOptions`에 다음 필드를 추가합니다. `SiteOptions`, `SiteResult`, `SiteDependency`, `SiteLinkMode`, `HtmlMode`, `OmittedDocument`, `AnnotateOptions`, `StandaloneOptions`, `NavigationOption`, `NavigationSpec`, `NavigationItem`, `NavigationTitle`, `NavigationDiagnostic`, `LocaleOption`, `UiStrings`는 공개 타입이며 반환 경로는 절대 경로입니다. `siteStyles`는 기본 CSS 문자열입니다. 아래 필드도 수집 옵션도 아닌 키를 넘기면 그 키를 밝힌 오류가 납니다. `mode: "annotate"`로 대체된 `annotations`를 넘기면 오류 메시지가 대체할 옵션을 알려 줍니다.

| 옵션            | 타입 / 기본값                                                      | 계약                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sourceRoot`    | `string`; `sourceRoot`·`roots` 중 하나 필수                        | 라이브러리 최상위에 놓이는 소스 디렉터리 하나. `roots: [{ dir }]`의 축약형입니다. 자산 해석과 출력 보호에 쓰므로 `library`를 지정해도 필요합니다.                                                                       |
| `roots`         | `SourceRoot[]`; `sourceRoot`·`roots` 중 하나 필수                  | 문서가 있는 디렉터리들과 각각의 기준 경로. `library`와 함께 쓰면 라이브러리를 수집한 기준 경로와 같아야 합니다.                                                                                                         |
| `exclude`       | `string[]`, 수집 전용                                              | 문서가 아닌 파일. 수집에 전달합니다. [수집](./node.ko.md#수집)을 참고하세요.                                                                                                                                            |
| `private`       | `string[]`, 수집 전용                                              | 수집은 하되 내보내지 않는 문서. 수집에 전달합니다. 비공개 문서는 어느 형식에서도 렌더링되지 않으며, `navigation`이나 `home`, `documents`에 비공개 문서를 적으면 오류입니다.                                             |
| `externalPaths` | `string[]`, `[]`                                                   | 같은 호스트에서 다른 애플리케이션이 담당하는 루트 상대 접두어(`/sdk` 등). 그 아래로 가는 링크는 어느 정책에서도 외부로 보아 쓴 그대로 두고 해석하거나 복사하지 않습니다.                                                |
| `extractors`    | `Record<string, TableExtractor>`, 수집 전용                        | 임베드 표가 부를 수 있는 셀 추출기. 수집에 전달합니다. [임베드](./node.ko.md#임베드)를 참고하세요.                                                                                                                      |
| `outDir`        | 필수 `string`                                                      | 소스·라이브러리·자산·마운트 루트와 분리한 전용 출력 경로.                                                                                                                                                               |
| `title`         | `string`, `"Documentation"`                                        | 사이트 머리말과 페이지 제목 접미사.                                                                                                                                                                                     |
| `mode`          | `HtmlMode`, `"site"`                                               | `site`: 공유 스타일시트·탐색·홈·인쇄 HTML과 함께 게시하는 모든 페이지를 씁니다. `standalone`: [단일 페이지](#단일-페이지)를 씁니다. `annotate`: `annotate.target`에 따라 단일 페이지나 사이트에 메모 런타임을 싣습니다. |
| `annotate`      | `AnnotateOptions`, `{}`                                            | `target`(기본값 `"file"` 또는 `"hosted"`), `reviewId`(`hosted`에서 필수, 영문자나 숫자로 시작하는 64자 이하의 영문자·숫자·`.`·`-`·`_`), `inbox`(`hosted` 전용). [주석](#주석) 참고.                                     |
| `documents`     | 선택적 `string[]`                                                  | 단일 페이지 실행이 쓸 문서. ID나 소스 경로로 적으며, 사이트가 게시하는 문서여야 합니다. 사이트는 게시하는 페이지를 모두 쓰므로 사이트에서 지정하면 오류입니다.                                                          |
| `strict`        | `boolean`, `false`                                                 | 단일 페이지에 `dependencies`가 하나라도 있으면 아무것도 게시하기 전에 실행을 실패시킵니다. 사이트에서 지정하면 오류입니다.                                                                                              |
| `standalone`    | `StandaloneOptions`, `{}`                                          | `maxAssetBytes`(5 MiB)는 본문에 넣어 쓴 자원 하나, `maxPageBytes`(20 MiB)는 단일 페이지 하나의 상한입니다. 둘 다 28 MiB 이하의 바이트 수(정수)입니다.                                                                   |
| `home`          | 선택적 `string`                                                    | `index.html`로 쓸 문서. `README.md`처럼 소스 경로로 적으며, 그 번역은 `index.<code>.html`이 됩니다. 언어마다 홈이 있어야 합니다.                                                                                        |
| `header`        | `{ links?: { title: NavigationTitle; url: string }[] }`, `{}`      | 사이트 제목 옆에 둘 링크. 각각 `http(s)`나 `mailto` 절대 URL입니다.                                                                                                                                                     |
| `navigation`    | `NavigationOption`, 폴더별 전체 문서                               | 왼쪽 목록이자 사이트가 게시하는 문서. [사이트 구성](#사이트-구성) 참고.                                                                                                                                                 |
| `locales`       | 선택적 `Record<string, LocaleOption>`                              | 사이트의 언어. 첫 언어가 기본 언어이고, 각 언어는 파일 이름 접미사로 찾습니다. [사이트 구성](#사이트-구성) 참고.                                                                                                        |
| `toc`           | `false \| { depth?: number }`, `{ depth: 6 }`                      | 오른쪽 목차가 나열할 제목. `depth`(2–6) 단계까지 나열합니다. `false`는 모든 페이지에서, front matter `toc: false`는 그 페이지에서만 목차 열을 뺍니다.                                                                   |
| `css`           | 선택적 `string \| string[]`                                        | 기본 스타일시트 다음에 불러올 로컬 스타일시트. 사이트에서는 파일로 연결하고, 단일 페이지에서는 본문에 넣어 싣습니다. HTML 표현 전용이며 CSS를 읽지 않는 형식에는 닿지 않습니다.                                         |
| `sourceLinks`   | 선택적 `{ root: string; url: string }`                             | `root` 아래에 있지만 수집하지 않은 파일로 가는 링크의 대상. `url` 뒤에 그 파일의 라이브러리 경로를 붙입니다. `url`은 쿼리나 프래그먼트가 없는 `http(s)` 절대 URL입니다.                                                 |
| `mounts`        | `{ from: string; to: string }[]`, `[]`                             | 출력의 `to` 아래로 복사할 디렉터리. `from` 안으로 가는 링크는 그 복사본을 가리킵니다. `relative` 링크를 쓰는 사이트 전용입니다.                                                                                         |
| `tokens`        | 선택적 `DesignTokenOverrides`                                      | 기본 토큰 위에 그룹마다 한 단계씩 병합하는 재정의. 모든 출력 형식이 함께 읽습니다.                                                                                                                                      |
| `page`          | 선택적 `PageOptions`                                               | 용지, 여백, 머리글과 바닥글, 제목 앞 쪽 나누기, 링크 주소 인쇄. [페이지를 나누는 출력](#페이지를-나누는-출력) 참고.                                                                                                     |
| `volume`        | 선택적 `VolumeOptions`                                             | 묶은 파일의 이름, 표지, 목차, 순서. [페이지를 나누는 출력](#페이지를-나누는-출력) 참고.                                                                                                                                 |
| `libraryDir`    | `string`, `path.join(path.dirname(outDir), ".cudoc", "documents")` | `library`가 없을 때 수집 출력. `library`를 지정하면 무시합니다.                                                                                                                                                         |
| `library`       | 선택적 `string`                                                    | 컴파일하거나 다시 출력하지 않고 읽을 기존 수집 라이브러리 디렉터리.                                                                                                                                                     |
| `links`         | `SiteLinkMode`, `"relative"`                                       | 출력 전체의 하이퍼링크 정책.                                                                                                                                                                                            |
| `hostUrl`       | 선택적 `string`, `"host"`에서 필수                                 | 기본 경로를 포함한 HTTP(S) 절대 배포 URL. 인증정보·쿼리·프래그먼트를 허용하지 않으며 마지막 `/`를 정규화합니다.                                                                                                         |
| `assetDirs`     | `string[]`, `[]`                                                   | 루트 다음 순서대로 탐색할 URL 루트 자산 디렉터리.                                                                                                                                                                       |
| `renderOptions` | 선택적 `RenderOptions`                                             | HTML 컴포넌트 콜백과 코드 강조 재정의. [렌더링](./document.ko.md#컴포넌트와-렌더링) 참고.                                                                                                                               |
| `themeSwitch`   | `boolean`, `false`                                                 | 머리글에 시스템·라이트·다크 중에서 색 구성을 고르는 메뉴를 더하고, 선택을 브라우저에 기억합니다. [테마 전환](#테마-전환) 참고.                                                                                          |

동기 생성기는 두 입력 경로를 제공합니다.

1. `library`가 없으면 `host: "html"`로 `libraryDir`에 수집하고 해당 컴파일러로 임베드를 처리합니다. 나머지 `DocumentOptions`는 수집에 적용합니다.
2. `library`가 있으면 `loadLibrary`로 읽고 저장된 트리를 복제합니다. [library.ts](../../packages/cudoc-export/src/library.ts)는 문서 ID·원문·코드 블록 순서에 맞춰 `expandPreparedEmbeds`로 준비된 블록을 삽입합니다. 비동기 호스트의 컴파일과 원문 치환 결과도 재컴파일 없이 사용할 수 있습니다. 수집이 설정을 소유하므로 `library`와 함께 `DocumentOptions`를 지정하면 오류입니다. 공유 라이브러리 파일은 쓰지 않습니다.

임베드 코드 블록이 있는 문서만 준비 데이터를 읽습니다. 준비 누락·오래된 준비 데이터·블록 누락은 오류입니다. 검증 기준은 저장된 원문 스냅샷과 manifest 지문이며 모든 현재 소스 파일을 스냅샷과 비교하지는 않습니다. 소스·경로·컴파일러가 바뀌면 다시 수집하고 준비해야 합니다. `library`를 지정하면 반환값의 `libraryDir`는 해당 입력 경로입니다.

렌더링은 `renderDocument`와 기본 highlight.js를 사용하며 알 수 없는 언어는 이스케이프한 코드로 표시합니다. `renderOptions`로 기본 렌더링 옵션을 재정의하고 명시적인 컴포넌트 콜백을 전달합니다. frontmatter `title`은 탐색과 페이지의 제목입니다. `locales`가 없으면 frontmatter `lang`이 `<html lang>`(기본 `en`)이 되고, `locales`가 있으면 [사이트 구성](#사이트-구성)에서 설명하듯 파일 이름이 언어를 정합니다. 생성기는 페이지 틀을 더하고, 홈 문서가 없는 언어에는 랜딩 페이지를 만듭니다.

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

콜아웃은 `--accent`와 `--wash`로 그리되, 타입이 심각도 표인 [design/tokens.ts](../../packages/cudoc-export/src/design/tokens.ts)의 `CALLOUT_SEVERITY`에 있으면 그 색을 씁니다. `warning`은 `--warn`과 `--warn-wash`, `caution`과 `danger`와 `error`는 `--danger`와 `--danger-wash`입니다. 스타일시트의 `.cudoc-callout-<type>` 규칙을 그 표에서 생성하고 Word의 콜아웃 스타일도 같은 표를 읽으므로, 콜아웃은 모든 형식에서 같은 색입니다.

글자 크기는 고정 픽셀 루트가 아니라 브라우저의 기본 크기에서 확대·축소하므로 독자의 글자 크기 설정을 존중합니다. `html`이 `font-size: 100%`이고 본문은 `--text-base`(0.9375rem)에 `--leading-body`(1.7)를 적용합니다. 폰트 스택은 IBM Plex Sans와 JetBrains Mono를 먼저 지정하고 플랫폼 UI 폰트와 한글 폰트로 이어지며, 어떤 폰트도 내려받지 않으므로 `file://`과 오프라인에서 그대로 동작합니다. 본문은 `--measure`(72ch)로 한 줄 길이를 제한하고, 제목과 표, 코드 블록, 콜아웃은 본문 열 전체 폭을 사용합니다.

페이지 구조는 고정 헤더와 고정 문서 사이드바, 제목 목차가 그 열 양옆에 놓인 형태이며 1024px에서 두 열, 768px에서 한 열로 접힙니다. 한 열이 되면 내비게이션 대상의 높이가 2.75rem으로 커집니다. 표는 전체 테두리 격자 대신 가로 구분선과 교차 행 배경, 레이블 형태의 머리글, 고정폭 숫자를 사용하며 페이지를 넓히지 않고 가로로 스크롤합니다. 상호작용 상태는 `--ease`로 전환하고 `prefers-reduced-motion`에서는 1ms로 줄어듭니다. `css` 파일은 이 스타일 다음에 불러오므로 규칙을 다시 쓰지 않고 속성만 재정의해서 디자인을 바꿉니다. 형식을 가로질러 유지해야 하는 변경은 `tokens`로 지정하세요. `tokens`는 데이터여서 CSS를 쓰지 않는 작성기도 같은 객체를 읽지만, `css`는 스타일시트를 불러오는 출력에만 닿습니다. `resolveTokens`는 그룹마다 한 단계씩 병합하므로 색 하나를 재정의해도 나머지 팔레트가 유지되며, 폰트 스택은 병합하지 않고 통째로 교체합니다. `--radius`와 `--measure`와 `--head-h`와 `--ease`, 그리고 다크 팔레트는 CSS 밖에 대응물이 없습니다. 인쇄 블록은 헤더와 두 내비게이션 열을 숨기고, 줄 길이 제한을 해제하고, 본문 색을 그대로 두며, 표 머리글을 페이지마다 반복하고, 쪽 폭보다 긴 코드 줄은 모든 쪽을 축소해 맞추는 대신 줄을 바꿉니다. 옵션에 따라 달라지는 규칙은 아래에서 설명하는 별도의 인쇄 스타일시트 `cudoc-print.css`에만 더해지므로, 옵션이 사이트 자체의 인쇄 블록을 바꾸는 일은 없습니다.

### 사이트 구성

소스: [plan.ts](../../packages/cudoc-export/src/plan.ts), [navigation.ts](../../packages/cudoc-export/src/navigation.ts), [locales.ts](../../packages/cudoc-export/src/locales.ts), [design/shell.ts](../../packages/cudoc-export/src/design/shell.ts).

실행은 무엇이든 쓰기 전에 라이브러리와 옵션으로 출력 계획을 한 번 계산하고, 모든 형식이 그 계획을 읽습니다. 계획에는 게시하는 문서 집합(탐색이나 `hidden`이 나열하는 문서와 홈), 빠지는 문서와 그 이유, 언어별 탐색과 홈, 문서별 출력 경로, 이번 실행이 쓰는 문서, 묶은 파일의 구성 문서와 순서가 들어 있습니다. 그래서 한 형식이 빼는 문서를 다른 형식이 게시하는 일은 없습니다. 비공개 문서는 게시하지 않습니다. 탐색에도 `hidden`에도 없는 문서는 `not-in-navigation`으로 빠지며, `relative`에서는 그 문서로 가는 링크가 오류입니다.

**탐색.** `NavigationOption`은 YAML 파일 경로나 항목 목록, 또는 `NavigationSpec`입니다.

```ts
type NavigationOption = string | NavigationItem[] | NavigationSpec
type NavigationSpec = { items: NavigationItem[]; hidden?: string[] }
type NavigationTitle = string | Record<string, string> // 언어 코드별 텍스트
type NavigationItem =
  | string // "guide.md"는 문서, "guides"는 폴더, "."는 컬렉션 전체
  | {
      folder: string
      title?: NavigationTitle
      page?: string // README.md처럼 폴더 안의 문서
      exclude?: string[] // 폴더 기준 glob
      order?: string[] // 앞에 둘 이름이나 제목; "..."는 한 번만, 나머지 전부
      depth?: number // 1부터: 그룹으로 그릴 단계 수
      collapsed?: boolean
    }
  | { title: NavigationTitle; items: NavigationItem[]; collapsed?: boolean }
  | { title: NavigationTitle; url: string } // http(s) 또는 mailto
```

YAML 파일은 중복 키를 거부하며 읽고, 파일이나 그 항목의 오류는 `file:line`으로 위치를 밝힙니다. 설정 안에 적은 항목은 `navigation[2].items[0]`처럼 경로로 위치를 밝힙니다. 문서는 `.md`나 `.mdx`를 붙여 적으며 번역 키로 찾으므로, 기본 언어 파일 이름 하나가 모든 번역을 가리킵니다. 확장자가 없는 이름은 폴더입니다. 폴더 항목이 문서를 가리키면 문서 표기를 알려 주는 오류가 나고, 문서 항목이 아무것도 가리키지 않아도 오류가 납니다. 항목은 두 번에 걸쳐 해석합니다. 먼저 명시적인 항목, 곧 파일 항목과 폴더의 `page`와 `hidden` 파일이 각자의 문서를 차지합니다. 두 번 차지된 문서는 두 위치를 모두 밝힌 오류이고, 비공개 문서는 오류입니다. 그다음 각 폴더가 자기 안에 남은 문서를 나열합니다. 이미 차지된 문서, 나열된 폴더를 대표하는 페이지, 더 구체적으로 나열된 폴더가 나열하는 문서, `exclude`와 일치하는 문서는 빠집니다. `exclude`의 glob은 폴더 안의 경로와 그 상위 폴더 경로마다 맞춰 보므로, `drafts`라고 쓰면 하위 폴더 하나가 통째로 빠집니다. 폴더 안에서는 [`resolveTree`](./node.ko.md#임베드)가 트리를 읽는 방식처럼 `X.md`가 폴더 `X/`를 대표하고, 없으면 `X/index.md`가 대표하며, 컬렉션 자체의 `index.md`는 `.`를 대표합니다. `README.md`는 `page`가 지정하지 않는 한 아무 폴더도 대표하지 않습니다. 대표하는 문서가 없는 폴더는 폴더 이름을 단 그룹으로 남깁니다. 폴더를 녹여 없애는 메뉴는 독자가 위치를 잃게 만들기 때문입니다. 폴더의 항목은 `order`가 이름이나 제목으로 지정한 항목을 앞에 두고, 나머지를 `compareNames`로 제목 순, 이어서 이름 순으로 정렬합니다. `...`는 나머지 전부의 자리입니다. `depth` 단계보다 깊은 곳에는 그룹을 그리지 않습니다. 더 깊은 폴더의 페이지와 문서는 마지막으로 그린 그룹의 목록에 들어가 나머지와 함께 정렬됩니다. `navigation`이 없으면 컬렉션 전체가 그 자리에 그려지는 폴더 항목 하나가 되며 `index`가 맨 앞입니다. 아무것과도 맞지 않은 `order`나 `exclude` 항목은 그 항목을 적은 위치와 함께 `unmatched-navigation-order`나 `unmatched-navigation-exclude`로 보고합니다.

**언어.** `locales`는 `en`, `ko`, `pt-BR` 같은 언어 코드마다 레이블이나 `{ label, suffix?, ui? }`를 지정합니다.

```ts
type LocaleOption =
  string | { label: string; suffix?: string; ui?: Partial<UiStrings> }
type UiStrings = Record<
  | "skip"
  | "documents"
  | "onThisPage"
  | "language"
  | "theme"
  | "system"
  | "light"
  | "dark",
  string
>
```

첫 언어가 기본 언어이며 접미사가 없습니다. 다른 언어의 접미사는 기본값이 `.<code>`이고, 점 뒤에 영문자나 숫자, `-`가 오는 형태이며, 다른 언어의 접미사와 달라야 합니다. 문서의 언어는 파일 이름을 끝맺는 접미사로 정하되 마지막 점 구간만 읽으므로, `notes.v2.ko.md`는 `notes.v2`의 한국어 문서입니다. 번역 키는 접미사를 뺀 ID입니다. front matter `lang`은 그 코드를 더 구체적으로 만들 때만 쓸 수 있으며(`ko`에 대한 `ko-KR`), 그때는 `<html lang>`이 됩니다. 다른 언어를 적으면 오류입니다. `locales`가 없으면 모든 페이지의 `lang`은 front matter `lang`이거나 `en`입니다. 모든 언어가 같은 항목으로 탐색을 그리며, 문서 항목과 폴더 페이지와 폴더 구성원은 각각 그 키의 해당 언어 번역으로 그립니다. 없는 번역은 빠지고 한 번만 `missing-translation`으로 보고하며, 항목이 하나도 남지 않은 그룹은 그리지 않습니다. `title` 객체는 그 언어의 텍스트를, 없으면 기본 언어의 텍스트를 씁니다. `locales`에 없는 키를 적으면 오류입니다. `ui`는 페이지 틀이 쓰는 문구를 바꿉니다. cudoc은 영어와 한국어 문구를 갖추고 있고, 그 밖의 언어는 영어 문구에서 시작합니다.

**홈과 출력 경로.** 언어마다 홈은 `home`의 번역이거나(이때 모든 언어에 있어야 합니다) `index`의 번역입니다. 기본 언어의 홈은 `index.html`에, 다른 언어의 홈은 `index.<code>.html`에 쓰고, 나머지 문서는 `<id>.html`에 씁니다. 자기 파일이 홈의 파일과 겹치는데 그 홈이 아닌 문서는 오류입니다. 홈이 없는 언어는 그 언어의 탐색을 나열하는 랜딩 페이지를 생성해 받습니다. 단일 페이지는 홈을 쓰지 않으므로 `index`를 포함한 모든 문서가 `<id>.html`입니다.

**페이지 틀.** 사이트 페이지에는 머리글(그 언어의 홈으로 가는 사이트 제목, `header.links`, 언어가 둘 이상일 때의 언어 메뉴, 테마 메뉴), 탐색 사이드바, 본문 열이 있고, `toc`나 페이지의 front matter가 끄거나 홈 페이지가 아니라면 `toc.depth`까지의 제목 목차가 있습니다. 언어 메뉴는 다른 언어마다 같은 문서의 게시된 번역으로, 번역이 없으면 그 언어의 홈으로 연결합니다. 그룹은 `<details>` 요소이며 `collapsed`가 아니거나 현재 페이지를 품고 있으면 열려 있습니다. 단일 페이지에는 제목과 `header.links`, 테마 메뉴, 목차가 있고 탐색과 홈 링크, 언어 메뉴는 없습니다. 페이지 틀이 만든 링크는 페이지를 조립하는 동안 `data-cudoc-final`을 달고 있으므로 링크 정책이 다시 고쳐 쓰지 않습니다. 이 속성은 작성한 내용에서는 제거하며, 써 낸 페이지에는 남지 않습니다.

**스타일시트.** `css` 파일은 css-tree로 파싱합니다. `@import`는 거부합니다. 각 `url()`은 스타일시트 자신의 디렉터리를 기준으로 렌더링 자원처럼 해석하며, 루트나 `assetDirs` 디렉터리, 또는 그 디렉터리 안에 있어야 합니다. 사이트에서는 지정한 순서대로 `cudoc.css` 다음에 `cudoc-css/<n>-<name>.css`로 연결하고, 그 파일이 불러오는 것은 `cudoc-css/files/<SHA-256의 앞 16진수 12자리>-<name>`으로 복사하므로, 다시 빌드해도 같은 내용은 같은 이름을 받습니다. 원격 `url()`은 그대로 둡니다. 단일 페이지에서는 그 텍스트를 페이지의 `<style>` 하나에 넣고 각 `url()`을 `data:` URL로 바꾸며, 원격 `url()`은 거부합니다. 복사하는 자원은 `cudoc-css/` 아래에 쓸 수 없습니다.

**sourceLinks와 mounts.** `relative`와 `host`에서, 문서도 아니고 루트나 `assetDirs`에서도 찾지 못했지만 `sourceLinks.root` 아래 그 라이브러리 경로에 있는 파일로 가는 하이퍼링크는 `sourceLinks.url` 뒤에 그 경로를 붙인 주소가 됩니다. 경로의 구간마다 퍼센트 인코딩하고 쿼리와 프래그먼트는 유지하며, 디렉터리는 끝의 `/`를 유지하고, 비공개 문서 검사를 적용합니다. 마운트의 `from`은 디렉터리이고 `to`는 `.`, `..`, 맨 앞의 `/`가 없는 출력 안의 폴더 경로이며, 둘 다 소스·라이브러리·자산·출력 디렉터리와 겹칠 수 없고, 다른 마운트의 `from`이나 `to`와도 겹칠 수 없습니다. 루트 위의 마운트는 내비게이션이 뺀 문서까지 게시하기 때문입니다. `from` 안으로 가는 링크는 그 파일이 루트 아래에 있든 `sourceLinks.root` 아래에 있든 복사본으로 바꿔 쓰고, 폴더는 페이지를 쓴 다음 통째로 복사합니다. 그 안의 심볼릭 링크나 비공개 문서는 오류입니다. 복사하는 자원은 마운트의 `to/` 아래에 쓸 수 없습니다. 단일 페이지에서, 또는 `host`나 `none` 링크와 함께 마운트를 쓰면 오류입니다. 사이트 안의 상대 링크만 복사본에 닿기 때문입니다.

### 단일 페이지

`standalone`과 `target: "file"`인 `annotate`는 단일 페이지를 씁니다. 쓰는 문서마다 어느 폴더에서 열어도 똑같이 렌더링되는 `<id>.html` 하나가 됩니다.

- 머리에는 `<style>` 하나가 있습니다. 해석한 토큰으로 만든 `cudoc.css` 다음에, 각 `css` 파일의 텍스트가 그 파일이 불러오는 것을 본문에 넣은 채로 이어집니다. 페이지는 어떤 스타일시트에도 연결하지 않습니다. 작성한 `<link rel="stylesheet">`가 로컬 파일을 가리키면 그 파일의 텍스트를 담은 `<style>`로 바꾸고 그 파일이 불러오는 것도 페이지 안에 담으며, 다른 서버를 가리키면 거부합니다.
- [자산 규칙](#내보내기-링크와-자산)이 복사할 렌더링 자원 가운데 `<img>`, `<input>`, SVG `<image>`·`<feImage>`가 불러오는 것(`src`, 각 `srcset` 후보, `href`), 동영상의 `poster`, 인라인 `style`의 `url()`, 작성한 `<style>` 안의 `url()`은 모두 그 파일의 `data:` URL이 됩니다. 실을 수 있는 것은 이미지(PNG, JPEG, GIF, WebP, AVIF, SVG, BMP, ICO)와 글꼴(WOFF, WOFF2, TTF, OTF)뿐이며, 그 밖의 로컬 자원은 그 자원을 밝힌 오류입니다. `<object data>`, `<use href>`, `<iframe>`, `<audio>`, 동영상 자체의 `src`, 미디어 `<source>`처럼 다른 요소가 불러오는 로컬 자원도 오류입니다.
- 테마 스크립트와 메모 런타임은 인라인 `<script>` 요소로, 런타임의 스타일시트는 인라인 `<style>`로 싣습니다. 요소를 끝낼 수 있는 텍스트는 이스케이프하며(`<\/script`, `<\/style`), `<!--`를 담은 스크립트는 거부합니다. 빌드한 런타임에는 `<!--`가 없습니다.
- 다른 문서로 가는 하이퍼링크는 상대 `<id>.html` 링크로 남거나 `host`에서는 배포된 페이지를 가리키며, 이번 실행이 그 문서도 쓰지 않는 한 `page`로 보고합니다. 다른 로컬 파일로 가는 하이퍼링크는 사이트와 같이 그 파일을 페이지 옆에 복사하고 `file`로 보고합니다. 다른 서버의 자원은 쓴 그대로 두고 `remote`로 보고합니다.
- `dependencies`가 그 보고를 나열합니다. CLI는 각각을 표준 오류에 `cudoc-export: <document>: needs a page beside it|a file beside it|a remote resource: <url>`로 출력하며, `strict`는 목록이 비어 있지 않으면 아무것도 게시하기 전에 그 목록을 담은 오류로 바꿉니다.
- `standalone.maxAssetBytes`(기본 5 MiB)는 base64를 포함해 본문에 넣어 쓴 자원 하나의 크기를, `standalone.maxPageBytes`(기본 20 MiB)는 써 낸 페이지의 크기를 제한합니다. 둘 다 `LIMITS.htmlBytes − LIMITS.fileBytes − 2 MiB`인 28 MiB 이하이므로, 메모와 함께 저장한 사본도 독자가 다시 불러올 수 있는 32 MiB 안에 들어갑니다.
- 인쇄 HTML과 `cudoc-print.css`, 복사한 렌더링 자원은 `formats`가 PDF를 요청할 때만 씁니다. PDF는 그 인쇄 HTML로 인쇄하며, Word에는 그중 어느 것도 필요하지 않습니다.

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

type ExportResult = Omit<SiteResult, "files" | "diagnostics"> & {
  formats: ExportFormat[]
  files: Record<ExportFormat, string[]> // outDir 기준 상대 경로, 출력 순서
  diagnostics: ExportDiagnostic[]
}

type ExportDiagnostic =
  | NavigationDiagnostic // 내보내기 절 참고
  | {
      code:
        | "dropped-html"
        | "html-as-text"
        | "image-as-text"
        | "dropped-footnote-table"
        | "unsafe-link"
      message: string
      document: string
    }

type RunningText = string | { left?: string; center?: string; right?: string }

type PageLength = string | number // "20mm", "1in", "54pt", 또는 밀리미터 수

type PageOptions = {
  paper?:
    | "A4"
    | "A5"
    | "A3"
    | "Letter"
    | "Legal"
    | { width: PageLength; height: PageLength }
  orientation?: "portrait" | "landscape"
  margin?: {
    top?: PageLength
    right?: PageLength
    bottom?: PageLength
    left?: PageLength
  }
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
상자는 170×255mm입니다. 용지의 `width`와 `height`, 각 여백 같은 모든 길이는 `mm`,
`cm`, `in`, `pt`, `px` 단위를 붙인 수이며 단위 없는 수는 밀리미터로 읽습니다. 이
길이는 한 번에 0.01mm 단위로 반올림한 밀리미터로 바뀝니다. 브라우저의 인쇄 호출이
`px`, `in`, `cm`, `mm`만 받고 단위 없는 수를 픽셀로 읽기 때문입니다. 그 밖의 값은
`cudoc-export: unusable page length <value>` 오류입니다. 머리글이나 바닥글은 해당 쪽
여백이 15mm 이상이어야 합니다. Chrome이 여백에 들어가지 않는 러닝 라인을 잘라 버리기
때문에, 더 좁은 여백에 러닝 라인을 요청하면 오류입니다. `{page}`, `{pages}`,
`{title}`, `{date}` 필드는 두 형식에서 모두 치환되며, `{title}`은 문서별 파일에서는
문서 제목, 묶은 파일에서는 묶음 제목이고 `{date}`는 `page.date` 그대로입니다. PDF는
러닝 라인을 스타일시트를 읽지 않는 별도의 템플릿 문서에 그리므로, 글꼴과 크기와 색을
토큰에서 읽어 인라인으로 적습니다. `fonts.sans` 스택, `print.baseSize` 기준의
`text.xs`(기본 8.53pt), `colors.light.faint`입니다. Word의 `CudocRunning` 스타일은
같은 크기와 색을 Word용 글꼴 `word.sans`로 씁니다. `breakBefore: n`은 깊이 `n` 이하의 모든 제목 앞에서 쪽을 넘기되 문서의
첫 블록은 제외하며, 인쇄 스타일시트의 규칙과 Word의 문단 속성으로 표현됩니다.
`linkUrls`는 두 형식 모두에서 `http(s)` 링크 뒤에 ` (url)`을 덧붙이고, 인쇄 HTML에서는
`data-cudoc-url`을 가진 묶음 안 링크 뒤에도 덧붙입니다. `authoredBreaks: false`는 인쇄
스타일시트의 `.cudoc-page-break` 규칙을
`break-after: auto`로 만들고 Word 작성기는 그 노드를 건너뜁니다. 문서를 여는 나누기,
곧 front matter나 정의나 HTML 주석만이 앞에 있는 최상위 나누기는 설정과 관계없이 두
작성기가 모두 버립니다. 문서는 이미 새 쪽에서 시작하기 때문이며, 그다음 블록이 첫
블록으로 취급됩니다. 컨테이너 안에 중첩된 나누기는 그대로 둡니다.
`wideTables: { minColumns: n }`은 첫 행의 열이 `n` 이상인(병합 포함) 모든 표에 가로
쪽을 줍니다. 인쇄 HTML은 표를 `<div class="cudoc-wide">`로 감싸 명명 페이지
`@page cudoc-wide`에 인쇄하며, 그 크기는 세로 쪽을 돌린 것이고 여백은 그대로
물려받습니다. Word 작성기는 표 앞뒤에서 문서를 구역으로 나누어 표의 구역에
`w:orient="landscape"`를 주고, 같은 러닝 텍스트를 더 넓은 열에 맞춘 탭 위치로
넣습니다. 다른 표의 셀 안에 있는 표와 문서의 첫 블록은 넓은 표가 되지 않습니다.
Chrome이 첫 요소의 명명 페이지에 빈 쪽을 앞세우기 때문이며, Word 작성기도 두 출력이
같도록 같은 예외를 적용합니다. 넓은 표 바로 앞이나 뒤(공백 텍스트와 주석은 건너뜀)의 쪽
나누기는 두 출력에서 모두 버립니다. 가로 쪽이나 가로 구역이 이미 그 자리에서 쪽을
나누며, 표 뒤에 남은 빈 나누기 요소는 빈 쪽을 하나 더 인쇄하기 때문입니다. 다른 자리의
나누기는 그대로 남습니다.

`volume.fileName`은 순수한 파일 이름이며 문서 id와 같을 수 없습니다. 묶은 파일이
출력 루트에서 문서 파일들과 나란히 놓이기 때문입니다. `volume.cover.image`는 로컬
파일 경로이며 PNG, JPEG, GIF, BMP여야 합니다. Word가 SVG를 삽입하지 못하기
때문입니다. 이 파일은 출력에 `cudoc-cover.<type>`으로 복사됩니다. 빌드가 쓸 수 있는
모든 파일, 즉 `cudoc.css`, `index.html`, `cudoc-print.css`, `cudoc-cover.*`,
`cudoc-annotations.js`, `cudoc-annotations.css`, `cudoc-theme.js`, 그리고
모든 문서와 묶음 이름의 `<id>.html`, `<id>.print.html`, `<id>.pdf`, `<id>.docx`는
예약되어 있으며, 그 자리에 놓이게 되는 자산은 오류입니다.

**형식마다 쓰는 파일.** 사이트는 브라우저 유무와 무관하게 `cudoc-print.css`와
문서별 `<id>.print.html`과 `<묶음>.print.html`을 쓰고, 단일 페이지는 `formats`에 PDF가
있을 때만 씁니다. `pdf`는 `playwright-core`로
`chromium-headless-shell`을 한 세션 구동해 그 파일들을 각각 한 번씩 `<id>.pdf`와
`<묶음>.pdf`로 인쇄합니다. `postinstall`이 그 셸을 설치하며 어떤 경우에도 설치를
실패시키지 않습니다. `CUDOC_SKIP_BROWSER_DOWNLOAD`나
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`가 빈 값, `0`, `false`가 아닌 값이면 건너뛰고,
npm 12 이상에서는 프로젝트가 승인한 뒤에만 실행합니다
(`npm install-scripts approve cudoc-export` 후 다시 설치).
`cudoc-export install-browser`는 어느 경우에도 같은 설치기를 실행합니다. 브라우저가
없는 상태에서
PDF를 요청하면 그 명령을 알려 주는 오류를 냅니다. `docx`는 `docx` 패키지로
`<id>.docx`와 `<묶음>.docx`를 쓰며, HTML 렌더러가 읽는 것과 같은 mdast를 걷습니다.

**한 권으로 묶은 파일**은 기본 언어의 문서를 내비게이션 순서로 놓고 그 뒤에 `hidden` 문서를 이어 놓되, `volume.order`가 지정한 문서를 그 순서대로 맨 앞으로 옮긴 것입니다(각 문서는 구성원이어야 하고, 한 번만, ID나 소스 경로로 적습니다). 각 문서는
`<article class="cudoc-doc" id="cudoc-<token>">`와 자기 Word 구역에 들어가고,
`volume`이 끄지 않는 한 표지 구역과 목차 구역이 앞에 옵니다. 토큰은
`@cudoment/cudoc/document`의 `idToken(id)`입니다. 문서 id에서 ASCII 영문자, 숫자,
`-`가 아닌 모든 문자를 `_<16진 코드 포인트>_`로 적으므로 `guide/개요`는
`guide_2f__ac1c__c694_`가 됩니다. 문서 안의 모든 id에는 `cudoc-<token>-` 접두사가
붙고 그 뒤에 원래 철자가 이어지며, 다른 문서로 가는 링크는 앵커를 퍼센트 디코딩해 그
접두사가 붙은 프래그먼트로 적으므로 두 문서가 충돌할 수 없고 문서 사이의 모든 링크가
파일 안에서 해석됩니다. 표지는 쪽의 내용 상자를 채우므로 머리글과 바닥글이 표지에서도
제자리에 있습니다. 표지 이미지는 `background-size: cover`로 잘라 채우는
`background-image`이고, Word에서는 여백에 고정되어 글 뒤에 놓이는 떠 있는 그림과
종이색 띠 위의 제목 문단입니다. PDF의 목차는 문서마다 시작 쪽을 담으며, 앞부분만
따로 인쇄하고 문서를 각각 인쇄해서 측정한 뒤 검증합니다. 묶은 파일의 쪽수가 정확히
그 합이 아니면 틀린 번호를 인쇄하는 대신 내보내기가 `… so the contents page numbers
would be wrong. A document prints at a different length inside the volume than alone,
or does not start on a page boundary.` 오류로 실패합니다. 번호 열
(`.cudoc-contents-page`)은 최소 4ch 폭에 오른쪽 정렬이므로, 측정용 인쇄의 자리
표시자 옆에서도 번호 옆에서도 제목이 똑같이 줄바꿈됩니다.
`contents.pageNumbers: false`는 측정용 인쇄를 생략합니다. Word의 목차는 1수준 제목에
대한 `TOC` 필드이며 문서 목록을 현재 값으로 담고 항목마다 문서 시작의 북마크로
연결되며, `updateFields`가 켜져 있어 Word가 열 때 쪽 번호를 채웁니다. 필드를 갱신하지
않는 뷰어는 제목만 보여 줍니다. `links: "none"`에서는 두 형식 모두 항목이 일반
텍스트입니다.

**쪽을 나누는 출력의 링크**는 사이트와 똑같이 `links`를 따르며, 대상을 한 번
해석해서 형식마다 적습니다. 묶은 파일 안에서 내보낸 다른 문서로 가는 링크는
프래그먼트입니다(HTML에서는 `#cudoc-<token>-<anchor>`, Word에서는 북마크). 어느 파일에도 없는
`private` 문서로 가는 링크는 링크한 문서 자체의 인쇄에서처럼 배포 URL입니다. 프래그먼트는
Word의 북마크나 묶은 파일의 요소를 가리키기 전에 퍼센트 디코딩하고, 문서 자체의 인쇄
HTML에서는 쓴 그대로 두어 브라우저가 맞추게 하므로, `#%EA%B0%9C%EC%9A%94`가 모든
형식에서 제목 `개요`에 닿습니다. 문서별
파일에서는 `relative`이면 프래그먼트 없는 옆 파일 `<id>.pdf` 또는 `<id>.docx`,
`host`이면 배포 URL이고, `none`이면 제거됩니다. `host`에서는 묶은 파일의 프래그먼트도
그 문서 자체의 인쇄가 가리키는 배포 URL을 `data-cudoc-url`로 갖고, `linkUrls`이면 인쇄
스타일시트가 `http(s)` 링크처럼 그 주소를 덧붙이므로(`a[data-cudoc-url]::after`)
문서는 묶은 파일 안에서도 단독일 때와 같은 길이로 인쇄됩니다. 같은 문서의 프래그먼트는 모든
정책에서 파일 안에 머무릅니다. 그 밖의 로컬 파일은 사이트처럼 복사하고 연결하되
경로를 묶은 파일의 루트 기준으로 다시 적으므로, 하위 디렉터리의 문서도 묶은 파일에서
이미지를 잃지 않습니다.

**Word 작성기의 디스패치 순서는 계약의 일부입니다.** `data.cudoc.kind`를 먼저 보고,
그다음 `data.hName`, 마지막이 `node.type`입니다. 페이지 나누기는 `thematicBreak`에
실려 오고 낮춰진 `<table>`은 `blockquote`로 도착하므로, `node.type`부터 보면 나누기가
가로줄이 되고 표가 인용문이 됩니다. 흐름 콘텐츠가 와야 할 자리에 만난 구문
콘텐츠(MDX `<div>` 바로 안의 텍스트)는 버리지 않고 문단으로 감쌉니다. 참조형 링크와
이미지는 `definition`을 따라 해석되고, 각주는 파일 전체에 걸쳐 번호가 매겨진 Word
각주가 됩니다. Word 각주는 문단만 담으므로 각주 안의 표는 버리고
`dropped-footnote-table`로 보고합니다. MDX가 요소로 바꾸는, MDX 문서에서 HTML로 쓴 표는 `rowspan`과
`colspan`(어느 철자든)을 유지합니다. Word가 덮이는 셀을 병합하고, 아래 행은 HTML처럼
그 열을 비워 두며, 짧은 행은 위의 셀이 덮지 않는 열에만 칸을 채웁니다. 셀은 브라우저가
그리는 것처럼 자기 행 그룹 안에서만 행을 병합합니다. 행 그룹은 `thead`, `tbody`,
`tfoot`이나 표에 곧바로 쓴 연속된 행이며, `rowspan="0"`은 그 그룹의 마지막 행까지
닿고 그보다 긴 병합은 거기서 멈춥니다. 행 사이에 `caption` 같은 다른 요소가 오면
연속된 행이 거기서 끝나고, 빈 `<tr>`은 브라우저에서처럼 병합 범위에 자리를 차지하되
Word 표의 행이 되지는 않습니다. 행은 원문 순서를 지키므로, 본문 앞에 쓴 `tfoot`은
브라우저가 마지막에 그리는 것과 달리 그 자리에 남습니다. `.md` 문서에서
같은 표는 `html` 노드이므로 `dropped-html`로 버립니다. `<br>`은 줄바꿈입니다. 최상위
번호 목록은 `start`부터, 중첩 목록은 1부터 번호를 매깁니다. Word는 시작
번호를 번호 매기기 정의마다 하나만 두므로, 파일이 쓰는 1 아닌 시작 번호마다
`cudoc-ordered`, `cudoc-bullet`과 각각의 `-cell` 묶음 옆에
`cudoc-ordered-from-<n>`과 `cudoc-ordered-from-<n>-cell`을 더하며, 다른 종류의 목록
안에 든 하위 목록은 따로 번호를 매깁니다. 작업 목록 항목의 첫 문단은 ☑ 또는 ☐로
시작합니다. `javascript:`, `vbscript:`, `data:` 링크는 링크 없이 텍스트만 남기고
`unsafe-link`로 보고합니다. 색과 글꼴과 크기와 음영과 테두리는 선언된 스타일에만 나타나며, 그
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

**트리**도 같은 모듈의 `TREE_KIND`, `TREE_CLASS`, `TREE_PRINT_ATTRIBUTE`,
`isTree(node)`, `treePrintDepth(value)`로 읽습니다. 트리 임베드는 바깥 목록의
`data-cudoc-print`에서 읽은 `print` 단계까지 중첩 목록 그대로 인쇄합니다. 각 항목의
`summary` 줄이 항목 자신의 글자가 되고, `details` 안의 목록이 그 뒤에 오며, `print`를
넘는 단계는 뺍니다. 인쇄 HTML은 다른 details를 열기 전에 `printTrees`로 hast에서
이렇게 바꾸고, 인쇄 스타일시트가 그 항목에 다시 글머리표를 붙입니다. Word 작성기는
목록을 쓰기 전에 mdast에서 같은 일을 하므로, 모든 줄이 자기 단계의 목록 문단이 됩니다.

**인쇄 규칙**은 화면용 스타일시트가 종이에서 갖고 있던 결함 세 가지를 고칩니다. 표가
`display: block`이라 `table-header-group`이 조용히 무효였고, `pre`와 콜아웃이
`break-inside: avoid`를 약속했지만 쪽보다 큰 블록에서는 지킬 수 없었으며, 본문 색을
검정으로 덧칠했습니다. 빌더는 모든 `<details>`를 열어 두기도 합니다. Chrome이 닫힌
`<details>`를 summary만 인쇄하기 때문입니다. 트리의 `<details>`는 위에서 설명한 대로
먼저 펼친 목록으로 바꿉니다.

하위 경로: `cudoc-export/docx`는 `buildDocx`, `writeDocx`, `bookmarkName`과
`DocxWriterOptions`, `DocxComponentRenderer`를 포함한 `Docx*` 타입을,
`cudoc-export/pdf`는 `openPrinter(page, options?, tokens?)`,
`printPdfs(jobs, page, options?, tokens?)`,
`runningTemplate(text, title, date, geometry, tokens?)`(`tokens`의 기본값은
`designTokens`이며 러닝 라인의 글자를 정합니다), `browserAvailable`,
`launchBrowser`, `pdfPageCount`, `browserInstallCommand`, `BROWSER_CHANNEL`과
`PdfOptions`, `PrintJob`, `Printer` 타입을, `cudoc-export/print`는
`writePrintOutputs`, `printStylesheet`, `fillVolumePageNumbers`,
`resolveVolumeOptions`, `namespaceIds`, `namespaceDocument`, `volumeId`,
`volumePrefix`, `printFileName`, `openDetails`, `printTrees`, `tableColumns`, `dropLeadingBreaks`,
`wrapWideTables`, `localizeAssets`, `srcSetCandidate`, `urlPath`, `PRINT_STYLESHEET`, `DEFAULT_VOLUME_NAME`, `VOLUME_FILE`과
`PrintableDocument`, `PrintOutputOptions`, `VolumeOptions`,
`ResolvedVolumeOptions`, `AssetMark`, `CopiedAsset` 타입을 공개합니다.

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
`leading`을 Word 자체의 1.2로 나눠서 정합니다. 콜아웃 스타일의 선과 색조는
스타일시트가 읽는 심각도 표를 따릅니다(`warning`은 `warn`, `caution`·`danger`·`error`는
`danger`, 그 밖의 타입은 `accent`와 `wash`). [내보내기](#내보내기)에서 설명합니다.

### 테마 전환

`themeSwitch: true`(CLI `--theme-switch`)는 모든 페이지의 머리글에 테마 메뉴를
더합니다. 모니터·해·달 아이콘 옆에 시스템·라이트·다크를 고르는 기본 `<select>`이므로,
키보드 조작과 스크린 리더의 안내, 휴대전화 자체의 선택 화면을 브라우저가 제공합니다.
사이트에서는 출력 루트에 예약된 파일 하나 `cudoc-theme.js`를 패키지의
`dist/browser/`에서 복사하고, 모든 페이지가 `<head>` 끝에서 `defer` 없는 평범한
`<script src>`로 이 파일을 읽으므로, 기억된 선택이 본문이 그려지기 전에 적용됩니다.
단일 페이지는 같은 스크립트를 그 자리에 인라인으로 싣습니다. 주석과 같은
Content-Security-Policy 메타를 두 옵션 중 먼저 요청하는 쪽이 한 번만 넣습니다.
스크립트는 `<html>`에 `data-theme="light"` 또는 `"dark"`를 설정하거나
제거하고(스타일시트가 이에 응답하는 방식은 `siteStyles` 설명 참고), 선택을
`localStorage["cudoc-theme"]`에 기억합니다(없으면 시스템, 저장은 주석과 같이 최선
노력, 다른 탭의 변경은 `storage` 이벤트로 따라감). 메뉴는 스크립트가 만들므로
스크립트가 없는 페이지에는 메뉴도 없습니다. 메뉴의 문구는 빌더가 페이지 언어의
`ui` 문구(`theme`, `system`, `light`, `dark`)로 `<html>`에 써 둔 `data-cudoc-ui`에서
읽고, 그 속성이 없으면 문서의 `lang`(`ko`면 한국어, 그 외 영어)을 따릅니다. 도구
설명은 "<테마>: <모드>"입니다. 기본값은 꺼짐이며, 꺼진 출력은 스크립트 없이 시스템
설정을 따릅니다.

### 주석

`mode: "annotate"`(CLI `--mode annotate`)는 페이지에 메모 런타임을 실어, 페이지를
받은 사람이 글자나 블록을 골라 평문 메모를 남기고, 답글을 달고, 해결로 표시하고,
저자에게 돌려줄 수 있게 합니다. 다른 모드의 출력은 이 기능 때문에 바이트 하나도
바뀌지 않습니다. 스크립트도, 정책 메타도, 블록 id도 없습니다.

```ts
type AnnotateOptions = {
  target?: "file" | "hosted" // "file"
  reviewId?: string // "hosted"에서 필수
  inbox?: { github: { repo: string; template: string; field?: string } }
}
```

기본값인 `target: "file"`은 런타임을 인라인으로 싣는 [단일 페이지](#단일-페이지)를
씁니다. `target: "hosted"`는 정적 호스트에 올릴 사이트를 쓰고 런타임을 페이지 옆에
두며, `reviewId`가 필요합니다. 한 호스트의 사이트들은 같은 출처를 쓰므로 브라우저
저장소도 함께 쓰기 때문입니다. `reviewId`가 그 저장소의 키가 되며, 지정하지 않은
파일 대상 페이지는 제목과 게시하는 모든 문서 id의 해시를 씁니다. 그래서 `documents`로 어떤 페이지를 쓰든 키가 같습니다. `inbox`(`hosted` 전용)는 GitHub
저장소(`owner/name`), 그 저장소의 이슈 양식 파일(`*.yml` 또는 `*.yaml`), 양식의 필드
id(기본값 `notes`, 영문자·숫자·`_`·`-`)를 지정합니다.

**모드가 더하는 것.** 사이트에서는 출력 루트에 예약된 파일 둘을 패키지의
`dist/browser/`에서 복사합니다. `cudoc-annotations.js`는 의존성과 네트워크 접근이
없는 클래식 지연 스크립트 하나이고, `cudoc-annotations.css`가 그 스타일입니다. 모든
페이지가 두 파일의 `<link>`와 `<script defer>`를 갖습니다(생성된 랜딩 페이지도
스크립트를 읽지만 문서가 없어 아무 일도 하지 않습니다). 단일 페이지는 두 파일을
인라인으로 싣습니다. 모든 페이지의 문자 집합 메타 바로 뒤에는
`<meta http-equiv="Content-Security-Policy" content="object-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'">`가
붙습니다. 이 정책은 출처와 무관한 지시문만 씁니다. 일부 브라우저에서 `file://`
페이지의 불투명 출처는 `'self'`와 맞지 않아 스타일시트까지 막히기 때문입니다.
`<main>`에는 `data-cudoc-document`(문서 id), `data-cudoc-ast-hash`와
`data-cudoc-source-hash`(라이브러리 매니페스트의 그 문서 `astHash`와 `hash`),
`data-cudoc-site`(위의 저장소 키), `data-cudoc-generator`가 붙고, 받는 곳이 있으면
그 JSON인 `data-cudoc-inbox`도 붙습니다.
모든 `p`, `li`, `tr`, `pre`, `blockquote`, `dt`,
`dd`, 제목, `aside.cudoc-callout`에는 `data-cudoc-block="<제목 id>:<16진수 8자>"`가
붙습니다. 직전 제목의 id(첫 제목 앞은 빈 문자열)와 블록 텍스트의 공백을 접은 뒤 구한
SHA-256 앞 여덟 자리이며, 한 절에서 같은 텍스트가 반복되면 `~2`, `~3` …을 붙입니다.
내용 해시는 다른 곳에 블록이 끼어들거나 옮겨져도 그대로이고, 고친 블록만 새 id를
얻어 그 메모는 인용 검색으로 물러납니다. 인쇄용 HTML, PDF, Word는 공유 트리로
만들어지므로 바뀌지 않습니다. `object-src 'none'`과 `form-action 'none'`은 이 모드에서만
저자의 raw `<embed>`·`<form>`에도 미칩니다.

**런타임.** 글자를 선택하면 메모 버튼이, 블록에 마우스를 올리면 왼쪽 여백에 `+`가
나타나고, 포인터가 여백을 건너 그 버튼으로 가는 동안 버튼은 사라지지 않습니다. 둘
다 평문 작성 창을 엽니다. 메모 버튼은 선택 영역을 따릅니다. 메모 버튼이나 작성 창이
아닌 곳을 누르면 그 즉시 사라지고(캡처 단계의 `pointerdown`), 손을 뗄 때 다시
나타나는 것은 `main` 안에서, 그리고 조작 요소(`button`, `select`, `input`,
`textarea`, `label`, `summary`, `[role=button]`, 편집 가능한 텍스트) 밖에서 시작한
누름뿐입니다. 그래서 테마 메뉴나 details 요약을 써도 버튼이 이전 선택 영역 옆에 다시
나타나지 않습니다. 선택 영역이 접히거나 `main`을 벗어나면 사라지고
(`selectionchange`), 터치나 펜으로 선택하면 선택 영역이 350ms 동안 움직이지 않을 때
나타납니다. Escape로 사라지고, 키보드로 선택한 뒤 Tab을 누르면 버튼으로 초점이
옮겨 가며, 초점이 다른 곳으로 옮겨 가면 사라집니다. 오른쪽 아래의 둥근 토글(말풍선 아이콘과 이 문서의 메모
개수)이 패널을 엽니다. 패널은 이름 입력란(선택 사항, 입력하는 즉시 반영, 브라우저가
기억, 기본 비움)으로 시작하고, 그 아래에 1차 동작 둘(공유 토큰 복사, 이 브라우저의
저장 내용 지우기)과 접힌 *더 보기*에 파일 동작을 둡니다. `<id>.annotations.json`
내려받기; `<id>.annotated.html` 저장(메모를
`<script type="application/json" id="cudoc-annotations-data">` 블록에 넣고 모든
`<`를 이스케이프한, 런타임 UI를 뺀 페이지 사본이며 단일 페이지라면 어디서든 열리고
사이트 페이지라면 원본과 같은 폴더에 있어야 스타일시트가 열림); `.json`이나 `.annotated.html` 불러오기(레이어 어디에나 끌어다
놓아도 됨). 그 아래에 이 문서의 메모를 카드로 나열합니다. 상태·위치 알약 표식,
작성자와 UTC 시각, 인용 구절(블록 경계는 공백으로 접고 최대 세 줄), 본문, 답글, 그리고
이동·답글·수정·해결(또는 다시 열기)·삭제의 아이콘 버튼(도구 설명 포함)이 들어갑니다.
패널 머리의 조작 버튼도 아이콘입니다. 하이라이트는 CSS Custom
Highlight API(`::highlight(cudoc-note)`, `-resolved`, `-active`)로 칠하고 DOM을
바꾸지 않습니다. 이 API가 없는 브라우저에서는 블록에 클래스 하나를 붙이며 저장한
사본에서는 그 클래스를 제거합니다. 메모는 내장 블록에서, 그다음 이 브라우저의
저장소(`localStorage`, 키 `cudoc-annotations:<site>:<document>`, 최선 노력이며
Firefox는 `file://`에서 거부)에서 들어오고, 같은 id는 `modified`가 늦은 쪽이
남습니다. 손으로 고쳤거나 잘린 사본처럼 내장 블록을 읽을 수 없으면 패널의 알림 줄에
알리고(_Could not load:_, 한국어 문구로는 *불러오지 못했습니다:*와 이유) 메모가 없는 것으로 보므로, 저장소의 메모는 그대로
들어옵니다. `#cudoc-notes=<토큰>` 조각은 해독하되 "검증되지 않음"으로 막대에 제안만
하고, 독자가 수락해야 병합합니다. 수락 여부와 무관하게 조각은 주소에서 지워집니다.
잘못된 `%` 이스케이프를 포함해 해독되지 않는 토큰은 제안하지 않고 패널에 알립니다.
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
받는 곳이 있으면 패널은 토큰 옆에 *GitHub에서 제출 작성*을 더합니다. 이 동작은 메모를
공유 토큰으로 인코딩해
`https://github.com/<repo>/issues/new?template=<template>&title=Review%20notes%3A%20<page title>&<field>=%23cudoc-notes%3D<token>`
주소를 만듭니다. GitHub는 긴 주소에 414로 답하면서 상한을 공개하지 않으므로, 주소가
6,000자를 넘으면 대신 JSON 파일을 내려받고 이슈에 첨부하라고 알립니다. 그렇지 않으면
패널이 먼저 무엇이 전달되는지(메모 본문, 인용문, 이름이 주소에 실려 GitHub로 가며
공개 저장소에서는 공개된다는 점, 압축한 토큰은 암호화가 아니라는 점)를 보여 주고,
독자가 확인해야 `window.open(url, "_blank", "noopener,noreferrer")`로 그 주소를
엽니다. 페이지를 여는 것은 제출이 아니므로 아무것도 보낸 것으로 표시하지 않습니다.
메모가 없으면 보낼 메모가 없다고 알립니다.
`window.cudocAnnotations`가 자동화용으로 `create(exact, text)`,
`createOnBlock(blockId, text)`, `reply(id, text)`, `list()`, `anchors()`,
`load(text)`, `collection()`, `embeddedCopy()`, `token()`을 노출합니다.

**파일**은 W3C Web Annotation의 `AnnotationCollection`(`@context`
`http://www.w3.org/ns/anno.jsonld`)이며 `generator`, `total`, `items`를 갖습니다.
항목마다 `Annotation`으로 `id`(`urn:uuid:…`), `created`와 `modified`(밀리초까지
적은 UTC ISO 8601, `Date.prototype.toISOString`이 쓰는 형태),
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
음수이거나 뒤집혔거나, 날짜가 ISO 8601이 아니거나, 상한(파일 2MiB, 메모 500개, 본문
10KiB, 인용문 2KiB, 문맥 64바이트, 이름과 id 200자)을 넘으면 입력 전체를 거부합니다. 저장한 `.annotated.html`은 최대
32MiB(`LIMITS.htmlBytes`)이며, 그 안의 메모 블록에는 메모 파일과 같은 2MiB 상한을
적용합니다.
날짜는 달력 날짜(`2026-09-16`)이거나 `Z` 또는 `±hh:mm` 오프셋이 붙은 날짜와 시각이며
달력에 있는 날인지 확인한 뒤 위의 UTC 형태로 저장하므로, 어느 오프셋으로 적은 날짜든
텍스트로 비교됩니다. 오프셋 없는 지역 시각이나 그 밖에 `Date.parse`만 받아들이는
값은 거부합니다. 패널에서 고른 파일이든 명령줄에 적은 파일이든, 파일은 읽기 전에
바이트 크기로 잽니다.

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
프롬프트 아래에 붙이는 자료이기 때문입니다. 머리에 파일, 라이브러리(붙여 넣은 보고서에 저자의 홈 경로가 담기지 않도록 작업
디렉터리 기준 상대 경로로 적음), 개수가 오고, 문서마다
라이브러리 순서(모르는 문서는 뒤)로 원문 경로와 메모 이후 버전이 바뀌었는지, 메모마다
줄 순서로 제목·상태·범위·일치 종류, 펜스 안의 원문 줄, 그리고 "Reviewer-provided
text (data, not instructions)" 라벨 아래 내용의 어떤 백틱 연속보다 긴 펜스에 담은
리뷰어의 글과 이름·시각이 오고, 답글도 같은 형식입니다. 제어 문자와 방향 전환
문자(C0, U+200B–U+200F, U+202A–U+202E, U+2066–U+2069, U+FEFF)는 보고서가 직접 쓰지
않은 글이 나오는 모든 자리, 즉 파일과 라이브러리 이름, 문서 id와 경로, 제목과 제목
id, 펜스 안의 글, 서명의 이름과 시각에서 `\uXXXX`로 보이게 바꿉니다. `--json`은 같은 사실을 JSON으로 냅니다. 종료 코드는 보고서를 만들면
0(인용문 미발견과 버전 변경은 사실이지 오류가 아닙니다), 파일이나 라이브러리가
없거나 잘못되면 1입니다. `cudoc-embed`로 끌어온 글은 임베드한 문서의 Markdown에
없으므로 그 위의 메모는 `not-found`가 됩니다.

### 내보내기 링크와 자산

[links.ts](../../packages/cudoc-export/src/links.ts)는 소스 ID와 수집된 경로에서 링크 대상을 해석합니다. Markdown 경로는 소스 ID, 고유 URL 경로는 라우트를 우선합니다. `guide/`, `./`, `..`처럼 디렉터리로 쓴 경로는 [`cudoc check`](./node.ko.md#참조-검사)가 읽는 것처럼 같은 이름의 문서가 옆에 있어도 그 디렉터리의 index 문서를 가리킵니다. 루트 기준·소스 기준·배포 기본 경로 포함·커스텀 경로를 지원하며 쿼리와 프래그먼트를 보존합니다.

- `relative`: 게시하는 문서를 그 출력 파일로 연결합니다. 프래그먼트만 있는 링크는 로컬에, 외부 URL은 그대로 유지합니다. 나머지 내부 링크 대상은 마운트의 복사본이나 `sourceLinks`로 가거나, 복사할 수 있는 파일이어야 합니다. 사이트가 게시하지 않는 문서로 가는 링크는 그 문서와 해결 방법을 알리는 오류입니다.
- `host`: 문서를 `hostUrl`과 저장된 경로로 연결하며 기존 기본 경로를 중복 추가하지 않습니다. 프래그먼트만 있는 링크는 배포된 현재 문서로 연결합니다. 수집하지 않은 `sourceLinks.root` 아래의 파일은 `sourceLinks.url`로 연결하고, 그 밖의 루트 경로는 배포 기본 경로, 상대 경로는 배포된 현재 문서 URL을 기준으로 해석합니다. 외부 스킴 URL과 프로토콜 상대 URL은 유지합니다. 원격 링크 검사는 수행하지 않습니다.
- `none`: `<a>`를 `<span>`으로 바꾸고 `<a>`·`<area>`의 하이퍼링크 속성을 제거합니다. 텍스트·ID·중첩 마크업·이미지는 보존합니다. 제거한 링크의 대상은 해석하거나 복사하지 않습니다. 스크립트·이벤트 핸들러 정화가 아닌 하이퍼링크 제거입니다.

본문·raw HTML·렌더러 콜백·임베드·각주·자동 index를 포함한 전체 페이지에 정책을 적용합니다. 페이지 틀이 만드는 머리말·탐색·언어 메뉴·목차 링크는 해석한 상태로 쓰고 `data-cudoc-final`을 달아 두며, 다시 쓰기 단계는 이 링크를 건너뛰고 속성을 제거합니다. 로컬 본문 바로가기 링크는 `relative`에서만 생성합니다. 수집의 `syntax.link`와 별개의 옵션입니다.

렌더링 자원은 별도로 처리하며 로컬 자원은 모든 모드에서 로컬에 유지합니다. 대상은 모든 요소의 `src`, `srcset`의 각 후보(브라우저처럼 읽으므로 URL은 다음 공백까지 이어져 data URL 안의 쉼표는 URL에 속하고, 남는 쉼표가 만든 빈 후보는 버림), `<video>`의 `poster`, `<object>`의 `data`, 작성한 스타일시트의 `<link href>`, SVG `<image>`·`<use>`·`<feImage>`의 `href`와 `xlink:href`입니다. 라이브러리 좌표에서 찾습니다. 문서 상대 경로는 문서의 라이브러리 경로를 기준으로, 루트 상대 경로는 라이브러리 경로 그대로 해석해 그 경로를 담는 루트를 통해 디스크에 닿고, 그다음 선택적 배포 기본 경로를 제거한 URL 루트 경로로 `assetDirs`를 탐색합니다. 참조 파일은 여러 페이지와 출력이 가리켜도 한 번만 복사하고 상대 출력 URL로 연결하며 외부 자원은 그대로 유지합니다. 경로는 `cudoc-export/print`의 `urlPath`가 URL로 적는데, 파일 이름의 공백, 쉼표, `%`, `#`, `?`를 이스케이프하므로 `media/a b.png`는 `src`에서도 `srcset`에서도 `media/a%20b.png`로 적힙니다. 복사한 파일로 가는 링크도 사이트, 인쇄 HTML, Word에서 같은 방식으로 적습니다. `css` 파일의 `url()` 파일은 [사이트 구성](#사이트-구성)에서 설명하는 대로 처리하고 `@import`는 거부합니다. 단일 페이지에서는 이 자원을 모두 [단일 페이지](#단일-페이지)에서 설명하는 대로 본문에 넣어 씁니다.

잘못된 링크 모드·URL, 빈 입력, 문서나 폴더를 가리키지 않는 탐색 항목, 자산 누락, 자산·출력 충돌, 동일 출력 경로를 공유하는 서로 다른 자산, 미지원 노드, 잘못된 출력 디렉터리는 오류입니다. 모든 루트와 모든 `assetDirs` 루트를 벗어나는 로컬 렌더링 자원은 모든 정책에서 URL과 그것을 담고 있는 문서를 함께 알리는 로컬 대상 누락 오류로 보고합니다. 같은 위치를 가리키는 하이퍼링크는 그 파일을 복사하는 `relative`에서만 이렇게 보고하고, `host`에서는 배포 주소를 기준으로 해석하며, `none`에서는 제거합니다. 해당 루트 밖에서는 어떤 파일도 복사하지 않습니다. 내보내는 문서가 비공개 문서로 링크하면 `relative`에서는 두 문서를 알리는 오류입니다. 그 페이지가 출력에 없고 원문을 복사하면 공개되어 버리기 때문입니다. `host`에서는 묶은 파일을 포함한 모든 출력에서 그 페이지를 서비스하는 배포 주소를 가리키고, `none`에서는 다른 링크처럼 제거됩니다. 자원은 세 정책 모두에서 복사하므로, 자원이나 `relative`에서의 로컬 파일 링크가 비공개 문서의 파일에 닿으면 모든 정책에서 오류입니다. 경로가 아니라 파일 자체를 비교하므로, 루트를 거치든 `assetDirs` 디렉터리나 심볼릭 링크를 거치든 이름을 다르게 적든 마찬가지입니다. 오류 메시지는 `cudoc-export: <document> loads the private document <library path> as a resource (<url>), which would publish its source`입니다. 소스·라이브러리·자산·마운트 루트와 출력이 겹치면 쓰기 전에 거부합니다. 출력은 임시 디렉터리에서 생성해 교체합니다. 실패한 실행은 이전 출력을 보존하고, 성공한 실행은 출력 전체를 교체하므로 이전 실행이나 다른 모드가 쓴 파일이 새 출력 옆에 남지 않습니다. 수집 모드에서는 라이브러리와 사이트 출력이 별개이므로 사이트 실패 시 새 라이브러리를 되돌리지는 않습니다. 재사용 모드에서는 라이브러리를 변경하지 않습니다. HTML은 정화하지 않고 React·Vue 코드는 실행하지 않습니다. 사이트 기본 구조에 클라이언트 JavaScript 의존성은 없습니다. 예외는 `mode: "annotate"`나 `themeSwitch`가 스크립트를 더하는 경우이며, [주석](#주석)과 [테마 전환](#테마-전환)에서 설명합니다.

CLI([소스](../../packages/cudoc-export/src/cli.ts)):

```sh
cudoc-export build [sourceRoot] [--out-dir site] [--external-path /prefix]
cudoc-export build --config site.config.mjs
cudoc-export build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/ --asset-dir public
cudoc-export build docs --library .cudoc/documents --out-dir shared-html --links none
cudoc-export build docs --out-dir out --mode standalone --document guide.md --strict
cudoc-export build --config review.yml --mode annotate
cudoc-export build docs --out-dir out --format pdf --format docx \
  --granularity both --paper Letter --landscape
cudoc-export annotations review.annotations.json --library .cudoc/documents --out review.md
cudoc-export install-browser
```

`--mode`는 `mode`를 정하고, 반복한 `--document`는 설정의 목록을 대체하는 `documents` 목록이 되며, `--strict`와 `--theme-switch`는 각 옵션을 켭니다. 폐지된 `--annotations`는 `--mode annotate`를 알려 주는 메시지와 함께 실패합니다. `--format`은 반복할 수 있고 그 목록이 설정의 `formats`를 대체합니다. `--granularity`는 `granularity`를 정하고, `--paper <이름>`(이름 있는 크기: `A4`, `A5`, `A3`, `Letter`, `Legal`)과 `--landscape`는 설정의 `page` 위에 `page.paper`와 `page.orientation`을 정합니다. `cudoc-export annotations <메모 파일…> [--token 토큰]… --library <디렉터리> [--out 파일] [--json]`은 [주석](#주석)에서 설명하는 리뷰 보고서를 출력하거나 파일로 쓰며, 파일이나 라이브러리가 없거나 잘못되었을 때만 종료 코드 1을 냅니다. `cudoc-export install-browser`는 브라우저 설치기를 실행하고 그 종료 코드로 끝납니다. CLI 기본값은 `docs`, `site`입니다. ESM 설정은 객체를 기본 export하며 JSON과 YAML(`.json`, `.yml`, `.yaml`)도 지원합니다. 함수 콜백은 ESM 또는 코드 API가 필요합니다. 명시적인 소스, `--out-dir`, `--library`, `--links`, `--host-url`, `--granularity`는 설정보다 우선합니다. 반복한 `--asset-dir`는 배열로 모아 설정의 `assetDirs`를 대체하고, 반복한 `--external-path`는 설정의 `externalPaths`를 대체합니다. 설정에 `roots`가 있으면 그대로 쓰되, 명령줄에 소스 루트를 주면 그것이 `roots`를 대체합니다. 상대 경로는 실행 디렉터리 기준입니다. 성공하면 빌드 결과 JSON을 표준 출력에 출력하고, 표준 오류에는 진단마다 `cudoc-export: <document>: <message>`를, 단일 페이지의 의존 항목마다 `cudoc-export: <document>: needs a page beside it: <url>`(또는 `a file beside it`, `a remote resource`)을 출력합니다. 모르는 플래그나 값이 없는 값 플래그를 포함해 오류가 나면 종료 코드는 1입니다. watch 명령은 없습니다.
