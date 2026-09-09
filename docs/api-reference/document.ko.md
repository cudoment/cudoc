# 문서 API

[English](./document.md) | **한국어** · [API 레퍼런스](./README.ko.md)

## 문서 옵션

소스: [document.ts](../../packages/cudoc/src/document.ts). 타입과 정규화 함수는 `@cudoment/cudoc/document`에서 가져옵니다.

```ts
type SyntaxMode = "host" | "cudoc" | "both"
type SyntaxOptions = Partial<
  Record<
    "headingAnchor" | "badge" | "tableCellList" | "callout" | "link",
    SyntaxMode
  >
>
type Host =
  "markdown" | "next" | "docusaurus" | "nextra" | "vitepress" | "html" | "docs"
```

| `DocumentOptions` 속성 | 기본값               | 계약                                              |
| ---------------------- | -------------------- | ------------------------------------------------- |
| `syntax`               | `DEFAULT_SYNTAX`     | 기능별 정규화; 알 수 없는 키·모드는 오류          |
| `host`                 | `markdown`           | 고유 문법 프로필; 호스트 컴파일러를 설치하지 않음 |
| `format`               | 독립 컴파일에서 `md` | `md` 또는 `mdx`; 수집은 파일 확장자로 결정        |
| `headingIds`           | `host`가 아니면 생성 | `host`는 자동 ID 생성을 위임; 명시적 ID는 적용    |
| `calloutTypes`         | `[]`                 | note/tip/important/warning/caution에 추가할 타입  |
| `components`           | 호스트 매핑만 적용   | 정적 컴포넌트 이름과 의미 종류의 매핑             |
| `tableColumnLayout`    | `[]`                 | 순서대로 적용할 열 배치 규칙                      |

`DEFAULT_SYNTAX`는 `{ headingAnchor: "cudoc", badge: "cudoc", tableCellList: "cudoc", callout: "cudoc", link: "host" }`입니다. `resolveSyntax(syntax?)`는 기본값을 채운 다섯 모드를 반환합니다. 모드는 호스트 파서의 허용 여부가 아닌 정규화를 제어합니다. 일반 Markdown 링크는 모든 모드에서 유효합니다.

`normalizeDocument(tree, source, options?, inlineParser?) → DocumentDiagnostic[]`는 `tree`를 수정합니다. 표 셀 목록을 재구성할 때 원문을 읽으므로 위치 offset에 맞는 원본 소스를 전달해야 합니다. `inlineParser(source) → PhrasingContent[]`로 표 셀의 인라인 문법에 호스트 파서를 사용할 수 있습니다. `isCudoc(mode)`, `isHost(mode)`는 각 문법 참여 여부를 확인합니다.

정규화는 제목 표기, 알림, 매핑된 컴포넌트, 셀 목록, 배지를 처리한 뒤 열 배치 규칙, 정적 HTML 요소 변환, 독립 제목 ID 생성을 수행합니다. 배지와 permalink는 자동 제목 텍스트에서 제외합니다. 기존 ID를 검사한 뒤 새 ID를 생성하며 중복·충돌 ID는 소스 위치를 포함한 오류를 발생시킵니다.

`DocumentDiagnostic`은 `code`, `message`, 선택적인 unist `position`을 가집니다. 현재 비치명적 코드는 `UNKNOWN_CALLOUT_TYPE`, `DYNAMIC_COMPONENT`입니다. 추가 알림 타입은 `/^[a-z][\w-]*$/i`에 맞아야 합니다. 알 수 없는 cudoc 알림 표기는 유지하고 동적 매핑·HTML JSX는 평가하지 않고 보존합니다.

## 컴파일

소스: [markdown.ts](../../packages/cudoc/src/markdown.ts). `compileDocument`, `CompiledDocument`는 `@cudoment/cudoc/markdown`에서 가져옵니다.

```ts
compileDocument(source: string, options?: DocumentOptions): CompiledDocument
// CompiledDocument = { tree: Root, frontmatter: Record<string, unknown>,
//                      diagnostics: DocumentDiagnostic[] }
```

동기 독립 컴파일러는 Markdown에 remark parse/GFM/frontmatter, MDX에 실제 MDX 컴파일러를 사용합니다. `.md`의 `{value}`를 JavaScript로 해석하지 않습니다. YAML frontmatter는 매핑이어야 하며 null은 `{}`로 처리합니다. 반환 콘텐츠 트리에서는 YAML과 MDX ESM 노드를 제거합니다. Docusaurus 프로필은 directive 파싱을 추가하지만 Docusaurus 전체 컴파일러를 재현하지는 않습니다. 호스트 수집에는 실제 컴파일러 콜백을 사용합니다.

```js
import { compileDocument } from "@cudoment/cudoc/markdown"
import { renderDocument } from "@cudoment/cudoc/render"

const result = compileDocument(
  "## 제한 (#limits)\n\n> [!NOTE] 용량\n> 요청 100회.",
  { format: "md", syntax: {} },
)
const html = renderDocument(result.tree)
```

## 의미 AST

mdast 노드에 HTML 출력용 `data.hName`/`data.hProperties`, 의미 정보용 `data.cudoc`을 사용합니다. 알림은 필수 React 컴포넌트가 아닌 `blockquote`입니다.

```json
{
  "type": "blockquote",
  "data": {
    "hName": "aside",
    "hProperties": {
      "className": ["cudoc-callout", "cudoc-callout-note"],
      "data-callout": "note"
    },
    "cudoc": { "kind": "callout", "type": "note", "title": "용량" }
  },
  "children": []
}
```

위 예시는 콘텐츠 자식을 생략했습니다. 실제 알림은 스타일시트로 굵게 표시하며 `cudoc.kind: "calloutTitle"`을 갖는 제목 문단을 앞에 추가하고 본문 블록을 이어 붙입니다. 제목이 없으면 대문자 타입을 표시합니다. 소스 위치는 원본 블록을 가리킵니다.

다른 의미 종류는 `heading`(`explicitId`, 선택적 `badge`), `badge`(`span` 렌더링), `permalink` 등입니다. 제목 ID는 `data.hProperties.id`에 저장합니다. `DocumentNode`는 확장 가능한 구조 타입이며 모든 사용자 노드를 렌더링할 수 있다는 보장은 아닙니다. `DocumentData`에는 다른 호스트 메타데이터도 들어갈 수 있습니다.

저장 AST의 버전은 `root.data.cudocAstVersion: 1`입니다. [저장 계약](./node.ko.md#라이브러리-파일)을 참고하세요. `validateAstContract(tree, options?)`는 루트·노드 구조와 목록·표 셀 제약을 검사하며 `requireVersion: true`이면 설정된 버전도 요구합니다. 임의 호스트 컴포넌트의 의미까지 모두 검증하지는 않습니다.

## 컴포넌트와 렌더링

`DocumentOptions.components`는 이름을 `{ kind: "callout" | "link" | "badge", typeAttribute?, titleAttribute?, urlAttribute? }`에 매핑합니다. 속성 기본값은 `type`, `title`, `href`입니다. 기본 프로필은 Docs의 `Infobox`/`Link`/`IconLink`, Nextra의 `Callout`, Docusaurus의 `Admonition`을 매핑합니다. 사용자 매핑은 같은 이름의 기본값을 덮어씁니다. 해당 기능에 호스트 문법을 허용해야 합니다.

`staticAttributes(node)`는 문자열, boolean 속성, JSON 표현식 값을 읽습니다. `hasDynamicAttributes(node)`는 정적으로 읽을 수 없는 표현식·spread를 찾습니다. `canonicalCalloutType(type)`은 info/default→note, danger/error→caution, warn→warning을 변환합니다. `makeCallout(type, titleNodes, children, position?)`는 의미 블록을 생성합니다. `lowerNativeElements(tree)`는 지원하는 정적 HTML JSX를 렌더링 가능한 mdast로 바꾸며 동적 JSX는 유지합니다.

렌더링은 `@cudoment/cudoc/render`에서 가져옵니다. [소스](../../packages/cudoc/src/render.ts):

```ts
documentToHast(tree: Root, options?: RenderOptions): HastRoot
renderDocument(tree: Root, options?: RenderOptions): string

type RenderOptions = {
  highlight?: (code: string, language?: string) => string
  components?: Record<string, (node: DocumentNode) => string>
}
```

여기서 `components`는 **HTML 렌더러 콜백**이며 의미 매핑이나 React 컴포넌트와 다릅니다. `highlight`는 완성된 HTML 조각을 반환하고 빈 문자열이면 일반 코드 마크업으로 처리합니다. 지원하지 않는 MDX·directive·사용자 노드는 오류를 발생시킵니다. 모듈 export는 실행하지 않으며 raw HTML과 콜백 결과는 정화 없이 전달합니다. 신뢰하는 문서에 사용하거나 소비자가 별도 정화 정책을 적용해야 합니다.

렌더러는 표준 mdast와 HTML 메타데이터를 HAST로 변환합니다. 임베드 루트에서는 `data.cudocEmbedPrefix`로 각주의 접근성 레이블을 구분합니다. `nodeText(node)`는 값을 재귀적으로 이어 붙이고 `visibleHeadingText(node)`는 배지·permalink 자식을 제외합니다. 블록 경계가 중요하면 아래 `getNodeText`를 사용합니다. 이 함수는 정규화된 HTML의 `hName` 블록·표 경계도 반영하며, 제목에서는 배지·permalink 자식을 제외하고 일반 문장의 배지는 유지합니다.

## 섹션과 쿼리

소스: [sections.ts](../../packages/cudoc/src/sections.ts). `collectSections`, `SectionSelection`, `CollectedSection`은 `/sections` 또는 `/query`에서 가져옵니다.

```ts
collectSections(tree: Root, select?: SectionSelection): CollectedSection[]
type SectionSelection = {
  anchors?: string[]
  titles?: string[]
  depth?: number | number[]
  includeChildren?: boolean
}
// CollectedSection = { anchorId: string, title: string, tree: Root, heading: Heading }
```

선택 조건을 모두 적용하며 depth는 1~6의 정수입니다. ID 없는 제목은 건너뜁니다. 명시적으로 요청한 앵커가 없으면 오류이고, 제목·단계에 일치하는 항목이 없으면 빈 결과입니다. 문서 순서로 반환합니다. 섹션 트리는 복제하며 참조하는 링크·이미지·각주 정의를 유지합니다. `heading`은 원본 제목 참조이므로 수정 전 복제해야 합니다. `includeChildren: false`가 아니면 하위 섹션을 포함합니다.

`/query`의 하위 도우미([소스 목록](../../packages/cudoc/src/internal/core/query/index.ts)):

| 함수                                                                          | 반환과 동작                                                                       |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `findHeadingByAnchorId(tree, id, options?)`                                   | `{ heading, parent, index }` 또는 `undefined`                                     |
| `sliceSectionByAnchorId(tree, id, options?)`                                  | `Root` 또는 `undefined`; 다음 동급·상위 제목 직전까지; 기본적으로 참조 정의 유지  |
| `findSectionEnd(parent, index, depth)`                                        | 섹션 밖 첫 형제 인덱스                                                            |
| `findParentHeading(parent, index, depth)`                                     | 상위 제목 또는 `undefined`                                                        |
| `getHeadingAnchorId(heading, options?)`, `getHeadingBadge(heading, options?)` | 문자열 또는 `undefined`                                                           |
| `normalizeAnchorId(id)`                                                       | 선행 `#` 제거, percent escape 디코딩                                              |
| `findSiblingNode(parent, index, options)`                                     | 일치하는 형제 또는 `undefined`; direction 필수, type/boundary/accept 선택         |
| `getNodeText(nodes, options?)`                                                | 블록 경계를 포함한 텍스트; 기본적으로 알 수 없는 자식도 포함, 표 셀은 탭으로 분리 |
| `getTableCellNodes(table, positions)`                                         | `Node[][]`; 없는 셀은 빈 배열                                                     |
| `getTableCellText(table, positions)`                                          | `(string \| undefined)[]`                                                         |
| `getTableHeaderTexts(table)`                                                  | 헤더 문자열 배열                                                                  |
| `findTableColumnIndex(table, headerTexts)`                                    | 일치하는 열 인덱스, 없으면 `-1`                                                   |

셀 위치는 0부터 시작하는 `[row, column]`이며 헤더는 행 0입니다. `SliceSectionOptions`는 앵커 명명 옵션에 `includeDefinitions`(기본 true), `contextHeadingFromDepth`(기본 미지정)를 추가합니다. 하위 쿼리 결과는 입력 노드를 참조할 수 있으며 불변 임베드 경계가 아닙니다. `collectSections`와 임베드 처리는 변환에 사용할 트리를 복제합니다.

## 필터링

소스: [dataset.ts](../../packages/cudoc/src/dataset.ts). `@cudoment/cudoc/dataset`에서 가져옵니다.

`projectAst(tree, options?) → Root`는 입력을 검증하고 노드·속성을 재귀적으로 복제·필터링한 뒤 출력을 검증합니다. `ProjectionOptions`에는 선택적 문자열 배열 `excludeNodeTypes`, `excludeComponents`, `stripProperties`가 있습니다. 기본값은 아무것도 제거하지 않습니다. `type`, `children`은 제거할 수 없습니다. 노드를 제외하면 하위 트리도 제거합니다. 컴포넌트는 MDX JSX 이름으로 비교하며 이미 정규화된 의미 노드에는 적용되지 않습니다.

`docsDatasetProjection`은 `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `DocDataEmbed`를 제외하는 선택적 프리셋입니다. 일반 Markdown 표는 제외하지 않습니다. 디스크 생성은 [Node 데이터셋](./node.ko.md#데이터셋)을 참고하세요.

## 코어 도우미

루트 모듈은 AST 계약, 쿼리, `walk`, 섹션 선택자, 구분자, MDX 생성 도우미를 제공합니다. `compileDocument`, `normalizeDocument`, 새 Node 라이브러리 API는 루트에서 재수출하지 않습니다.

| 진입점·소스                                                                                                        | Export와 계약                                                                                            |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| [/ast](../../packages/cudoc/src/internal/core/ast/index.ts)                                                        | 버전 상수·해석, `validateAstContract`, 목록·부모·표 판별, AST 타입                                       |
| [루트 순회](../../packages/cudoc/src/internal/core/walk.ts)                                                        | `walk({ tree, state, preTransforms, postTransforms })`; 조상·부모·인덱스 문맥으로 순서대로 원본 변환     |
| [루트 선택자](../../packages/cudoc/src/internal/core/selectors.ts)                                                 | `assertSectionSelector`, `matchesSectionHeading`, `findPreviousHeading`, 제목·헤더 정규화, 인라인 텍스트 |
| [/syntax](../../packages/cudoc/src/internal/core/syntax/index.ts)                                                  | 구분자 검증·추출·분할·제거, 제목 메타데이터 도우미                                                       |
| [/mdx](../../packages/cudoc/src/internal/core/mdx/index.ts)                                                        | 속성·flow·text 요소 생성, 속성 읽기·쓰기, 줄바꿈·자식 변환                                               |
| [/transforms/table-cell-list/index](../../packages/cudoc/src/internal/transforms/table-cell-list/index.ts)         | `transformTableCellList`, 파서, 셀 재구성                                                                |
| [/transforms/table-column-layout/index](../../packages/cudoc/src/internal/transforms/table-column-layout/index.ts) | 배치 변환·옵션 해석, 표 생성, 분할 옵션과 셀 분할                                                        |
| [cudoc-remark/badge](../../packages/cudoc-remark/src/transforms/badge.ts)                                          | 배지 변환과 옵션 해석                                                                                    |

하위 제목·배지 변환은 이름 있는 MDX 요소를 출력할 수 있습니다. 컴포넌트 없는 작성 설정이 아닌 구현 구성 요소입니다. 작성용 설정에는 `normalizeDocument` 또는 어댑터의 명시적 `syntax` 옵션을 사용합니다.

`TableColumnLayoutOptions`에는 `section`(단계·제목 선택자), `columnHeaders`가 필수입니다. 선택적 `split`, `components`, `spanAttribute`(기본 `colSpan`), `metadataDelimiters`, `ignoreElements`로 출력을 조정합니다. 기본 요소 매핑은 소문자 HTML 표입니다. 공통 출력에는 의미·렌더러를 제공하지 않은 대문자 표 이름을 설정하지 않습니다. 전체 변환 문맥과 배치 타입은 연결된 소스를 참고하세요.
