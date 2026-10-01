# Node API

[English](./node.md) | **한국어** · [API 레퍼런스](./README.ko.md)

이 진입점은 파일을 읽거나 쓰므로 Node.js 빌드·서버 코드에서 사용합니다. 별도 설명이 없으면 상대 파일시스템 경로는 현재 작업 디렉터리 기준입니다.

## 수집

소스·import: [library.ts](../../packages/cudoc/src/node/library.ts), `@cudoment/cudoc/node/library`. 아래의 루트 도우미(`SourceRoot`, `ResolvedRoot`, `resolveRoots`, `documentIdOf`, `libraryPathOf`, `sourceFileOf`)는 컴파일러를 불러오지 않는 [roots.ts](../../packages/cudoc/src/node/roots.ts), `@cudoment/cudoc/node/roots`에서도 export합니다. remark 임베드 플러그인은 거기서 가져오므로 호스트가 MDX 스택 없이 설정을 불러올 수 있습니다.

```ts
buildDocuments(options: BuildDocumentsOptions): Library
buildDocumentsAsync(options: Omit<BuildDocumentsOptions, "compiler"> & {
  compiler: AsyncDocumentCompiler
}): Promise<Library>
loadLibrary(outDir?: string, compiler?: DocumentCompiler, roots?: string | SourceRoot[], options?: { cache?: boolean }): Library
resolveRoots(options: { sourceRoot?: string; roots?: SourceRoot[] }): ResolvedRoot[]
documentIdOf(roots: ResolvedRoot[], file: string): string | undefined
libraryPathOf(roots: ResolvedRoot[], file: string): string | undefined
sourceFileOf(roots: ResolvedRoot[], libraryPath: string): string | undefined
```

`BuildDocumentsOptions`는 `DocumentOptions`를 확장합니다.

| 속성          | 기본값                  | 의미                                                                                            |
| ------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| `sourceRoot`  | 둘 중 하나 필수         | 라이브러리 최상위에 놓이는 입력 디렉터리 하나. `roots: [{ dir: sourceRoot }]`의 축약형          |
| `roots`       | 둘 중 하나 필수         | `{ dir, base? }[]`: 수집할 디렉터리와 각각의 기준 경로. `sourceRoot`와 `roots`를 함께 주면 오류 |
| `exclude`     | `[]`                    | 문서가 아닌 파일과 디렉터리를 고르는 글롭 패턴. 라이브러리 경로에 대조                          |
| `private`     | `[]`                    | 수집·검사는 하되 내보내기와 데이터셋에서는 제외하는 문서를 고르는 글롭 패턴                     |
| `outDir`      | `.cudoc/documents`      | cudoc 전용 라이브러리 출력                                                                      |
| `routeBase`   | `/`                     | 기본 문서 경로 접두사                                                                           |
| `routeSuffix` | `""`                    | `.html` 같은 접미사                                                                             |
| `routes`      | `{}`                    | 확장자 없는 문서 ID별 경로 재정의                                                               |
| `compiler`    | 독립 컴파일러           | 전달하면 실제 호스트 컴파일러 콜백 사용                                                         |
| `compilerId`  | `compiler` 사용 시 필수 | 호출자가 관리하는 컴파일러·설정 식별자                                                          |
| `previous`    | 없음                    | 앞서 수집한 라이브러리. 원문이 바뀌지 않은 문서는 컴파일하지 않고 여기서 가져옴                 |

모든 루트에서 `.md`와 `.mdx`를 재귀적으로 수집하며 숨김 항목과 `node_modules`는 건너뛰고 symlink는 거부합니다. 루트의 `base`는 양쪽 `/`를 떼어 정규화하며, 여러 조각(`docs/v2`)이어도 되고 비어 있어도 되지만 `.`, `..`, `?`, `#`은 들어갈 수 없습니다. 두 루트가 같은 기준 경로를 가질 수 있고 한 기준 경로가 다른 것을 확장할 수도 있습니다(`docs`와 `docs/api`). 한 루트의 디렉터리가 다른 루트의 디렉터리 안에 있어도 되며, 이때 파일은 안쪽 루트의 것입니다. 바깥 루트를 훑을 때 그 디렉터리를 안쪽 루트에 맡기고, 트리 안에서 다른 루트의 디렉터리로 이어지는 심볼릭 링크도 거부하는 대신 그 루트에 맡기므로, 각 파일은 안쪽 루트의 기준 경로로 한 번만 수집됩니다. 같은 디렉터리를 두 번 나열할 수는 없으며, 한 번은 그대로 쓰고 한 번은 심볼릭 링크로 쓴 경우도 같은 디렉터리로 봅니다. 이 해석을 `resolveRoots`가 수행하며 모든 소비자가 이 함수를 호출합니다.

문서의 **라이브러리 경로**는 루트의 기준 경로 뒤에 그 루트 디렉터리 기준 POSIX 경로를 이은 값이고, ID는 라이브러리 경로에서 확장자를 뗀 값입니다. `{ dir: "content", base: "docs" }`로 수집한 `content/ko/guide.md`는 `docs/ko/guide.md`와 `docs/ko/guide`가 됩니다. `sourceRoot`를 쓰면 기준 경로가 비어 있으므로 ID는 그 디렉터리 아래의 파일 경로입니다. `StoredDocument.sourcePath`가 라이브러리 경로입니다. 문서를 이름 짓는 모든 것(링크, 임베드 `sources`, 검사기, 내보내기, `exclude`·`private` 패턴)이 라이브러리 경로를 좌표계로 쓰므로, 루트 상대 링크 `/terms/token.md`는 어느 디렉터리에서 읽었든 문서 `terms/token`을 가리키고, 상대 링크도 라이브러리 좌표에서 해석됩니다. 즉 기준 경로가 디렉터리 이름과 같을 때에만 한 루트에서 다른 루트로 건너가고, 그렇지 않으면 누락으로 보고됩니다. `documentIdOf`와 `libraryPathOf`는 파일을 그 좌표로 옮기며 파일을 담는 가장 안쪽 루트를 씁니다. 루트 디렉터리와 파일은 실제 경로로 풀어서 비교하므로, symlink로 설정한 루트 아래 파일을 호스트가 실제 경로로 알려 주어도(반대의 경우도) 같은 문서를 찾고, 링크로 설정한 중첩 루트도 자기 파일을 그대로 가집니다. `sourceFileOf`는 라이브러리 경로를 파일로 되돌리며, 기준 경로가 가장 길게 맞는 루트부터 시도하고 실제로 존재하는 파일을 우선합니다. 다른 루트가 가진 파일은 일치로 보지 않으므로, 기준 경로가 따로 있는 중첩 루트의 파일을 바깥 루트 기준으로 쓴 경로는 아무 파일도 가리키지 않습니다. 반면 루트가 자기 안의 심볼릭 링크로 닿는 파일은, 예를 들어 점으로 시작하는 디렉터리 아래의 파일이라도 그 루트의 파일로 남습니다. 루트 전체에 걸친 확장자·대소문자 충돌은 두 파일을 함께 알리는 오류입니다. 기본 URL은 연결 `/`를 맞춘 `routeBase + id + routeSuffix`이므로 기준 경로가 URL 접두어가 됩니다. 다만 `routeSuffix`가 `""`나 `"/"`이면 index 문서는 호스트가 서비스하는 대로 자기 디렉터리의 URL을 받습니다. `routeBase: "/docs"`에서 `index`는 `/docs/`, `guide/index`는 `/docs/guide/`입니다. 경로가 끝의 슬래시 하나만 다른 두 문서는 경로가 같은 두 문서와 마찬가지로 `duplicate document route`로 실패합니다. 재정의 경로는 고유해야 하며 `/`로 시작하되 `//`로 시작하지 않고 `?`, `#`이 없는 루트 상대 pathname이어야 합니다. frontmatter slug는 자동으로 추론하지 않습니다.

글롭 패턴은 라이브러리 경로에 대조하며 문법은 작습니다. 조각 안의 `*`와 `?`, 조각 수에 상관없는 `**`, 그리고 `/`가 없는 패턴은 어디에 있든 파일·디렉터리 이름에 맞습니다. 끝의 `/**`는 그 디렉터리 자체에도 맞으므로 제외된 디렉터리에는 들어가지 않고 그 안의 symlink도 보지 않습니다. 중괄호 집합, 문자 클래스, 부정은 없으며, 빈 패턴이나 `..`이 든 패턴은 오류입니다. `exclude`는 무엇이 문서인지를 정하고, `private`는 수집·검사·임베드는 되지만 라이브러리와 manifest에 `private: true`가 붙는 문서를 표시하며 `cudoc-export`와 `generateDataset`이 그 표시를 읽습니다.

컴파일러를 생략할 수 있는 호스트는 `markdown`, `html`, `next`, 호스트 미지정입니다. 나머지 프로필은 콜백이 필요합니다. 추가 플러그인을 사용하는 Next.js도 동등한 결과를 위해 같은 콜백이 필요합니다.

```ts
type DocumentCompiler = (
  source: string,
  context: { id: string; filePath: string; options: DocumentOptions },
) => CompiledDocument
// AsyncDocumentCompiler는 인자가 같고 Promise<CompiledDocument>를 반환합니다.
```

`filePath`는 절대 경로이며 `options.format`은 파일별로 결정합니다. export가 위치를 제거하기 전의 위치 정보가 있는 트리를 반환해야 합니다. 수집기는 반환된 진단을 상대 파일·행과 함께 stderr에 출력합니다. 원문 범위를 저장하고 export 검증·버전 표기를 거칩니다. 모든 문서의 컴파일이 끝나기 전에는 아무것도 쓰지 않으며, 그다음 라이브러리를 [`publishDirectory`](#저장) 한 번으로 출력하므로 컴파일되지 않는 문서가 있으면 이전 라이브러리가 그대로 남습니다. 출력은 디렉터리 전체를 교체하므로 앞선 준비가 쓴 `embeds.json`은 남지 않습니다. `prepareEmbeds`가 다시 쓰고, [`collectDocuments`](#감시)는 둘을 함께 출력합니다. 비동기 수집기는 출력 전에 각 파일을 컴파일하고 치환을 위해 비동기 컴파일러를 보관합니다.

`previous`를 주면 설정 해시가 같고 라이브러리 경로가 같고 원문의 해시가 저장된 해시와 같은 문서를 그 라이브러리에서 트리, 스냅샷, frontmatter, `private`, `imports`까지 그대로 가져옵니다. 나머지는 평소처럼 컴파일하고, 디스크에서 사라진 문서는 빠지며, 출력 디렉터리는 어느 경우에나 완전합니다. 재사용한 문서의 진단은 다시 출력하지 않습니다. 결과에는 양쪽 문서 id를 담은 `incremental: { compiled, reused }`가 붙습니다. 옵션, 라우팅, 루트, 패턴, 추출기 버전, `compilerId`, `@cudoment/cudoc` 버전 같은 설정이 바뀌면 아무것도 재사용하지 않는데, 호스트를 올렸을 때 `compilerId`를 바꿔야 하는 이유도 여기에 있습니다. 해시는 컴파일러가 무엇을 하는지 볼 수 없습니다.

`Library`는 `documents: StoredDocument[]`, `options`, `configuration`(해시), `bases: string[]`(수집 당시 루트들의 기준 경로, 맨 위 루트 하나면 `[""]`), 선택적 런타임 `roots: ResolvedRoot[]`(절대 `dir`, 정규화한 `base`), `compiler`, `asyncCompiler`를 가집니다. `StoredDocument`는 `id`, `sourcePath`, `route`, `tree`, `source: SourceSnapshot`, `frontmatter`를 가지며, `private` 패턴에 맞은 문서에는 `private: true`가, 무엇이든 import하는 문서에는 `imports: string[]`이 붙습니다. `imports`는 그 문서의 `import` 문이 묶는 지역 이름이며, 내보내기가 `mdxjsEsm` 노드를 버리기 전에 컴파일러의 estree에서 읽습니다(`CompiledDocument.imports`, `@cudoment/cudoc/mdx`의 `importedNames(tree)`가 계산하며 `/markdown`도 재수출). 호스트 캡처도 같은 값을 기록하며, `.mdx` 파일에서는 `importedNamesFromSource(source)`로 원문도 훑습니다. 펜스 코드 밖의 최상위 `import` 문을 모듈로 파싱하는데, Nextra처럼 캡처가 보기 전에 ESM을 트리 밖으로 끌어올리는 호스트가 있기 때문입니다. 컴파일러 함수와 절대 루트 디렉터리는 직렬화하지 않고, manifest에는 각 루트의 `base`만 기록합니다.

`loadLibrary`의 기본 경로는 `.cudoc/documents`이며 manifest 버전, AST 계약, 저장 해시를 검증해 라이브러리를 복원합니다. 현재 소스 파일이나 컴파일러 설정과 비교하지는 않습니다. 최신화하려면 다시 수집합니다. 문서가 디스크의 어디에 있는지 복원하려면 `roots`를 전달합니다. 단일 루트 축약형이면 디렉터리 하나, 아니면 수집에 쓴 것과 같은 `{ dir, base }` 목록이며, 치환 컴파일과 자산 해석이 이 정보를 필요로 합니다. 전달한 기준 경로는 manifest에 기록된 것과 같아야 하는데 ID가 거기서 파생되었기 때문이며, 다르면 기록된 기준 경로를 알리는 오류가 납니다. 치환에는 원래 동기 컴파일러를 전달하거나 `library.asyncCompiler`에 원래 콜백을 연결하고 비동기 API를 사용합니다. 준비된 임베드만 소비하는 라이브러리는 컴파일러가 필요하지 않습니다. `{ cache: true }`를 주면 해석한 `outDir`별로 불러온 문서를 메모리에 유지하고, `manifest.json`이 바이트 단위로 같은 동안 같은 `documents` 배열을 반환합니다. 재수집은 항상 manifest를 바꾸므로 그때 새로 읽으며, 전달한 `roots`는 호출마다 기록된 기준 경로와 대조합니다. 옵션이 없으면 호출마다 파일을 다시 읽습니다. 요청마다 라이브러리를 불러오는 서버(임베드를 렌더링하는 라우트 핸들러, 검색 엔드포인트)는 캐시 형태를 쓰고, 한 번만 실행되는 빌드 단계에는 필요하지 않습니다.

## 라이브러리 파일

```text
.cudoc/documents/
  .cudoc-output
  manifest.json
  documents/<id>.json
  sources/<id>.json
  embeds.json              # prepareEmbeds와 collectDocuments가 추가
```

| 파일                  | 계약                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `manifest.json`       | `schemaVersion: 2`, 설정 해시, 문서 옵션, 선택적 컴파일러 ID, `roots: [{ base }]`, 문서별 메타데이터·해시 |
| `documents/<id>.json` | 버전 있는 mdast 루트; `data.cudocAstVersion: 1`; `position`/`estree` 속성과 `mdxjsEsm` 노드 제거          |
| `sources/<id>.json`   | 원문, SHA-256 해시, 형식, 섹션 offset                                                                     |
| `embeds.json`         | `schemaVersion: 2`; 준비된 임베드 AST 블록, 블록마다 읽은 문서 목록, 최신 상태 확인용 메타데이터          |

manifest 문서 항목은 `id`, `sourcePath`, `route`, `frontmatter`, `hash`, `astHash`, `snapshotHash`이고, 비공개 문서에는 `private: true`가, 무엇이든 import하는 문서에는 그 `import` 문이 묶는 지역 이름 목록 `imports`가 있습니다. AST·스냅샷 해시는 객체의 `JSON.stringify`, 원문 해시는 원본 텍스트를 대상으로 합니다. `configuration`은 옵션, 경로, 루트 기준 경로, `exclude`·`private` 패턴, 추출기 버전, 컴파일러 식별자, `@cudoment/cudoc` 버전을 해시하므로 이 중 무엇이든 바뀌면 준비된 임베드가 무효가 됩니다. 라이브러리와 `embeds.json`은 항상 같은 해시로 함께 기록되므로 업그레이드한 뒤에도 다음 수집 전까지는 서로 일치하며, 다음 수집은 아무것도 재사용하지 않고 둘을 모두 교체합니다. 라이브러리를 읽을 때 이 해시를 실행 중인 릴리스와 비교하지는 않습니다. `LIBRARY_SCHEMA_VERSION`이 현재 버전을 export하며 다른 버전의 manifest는 "incompatible document manifest" 오류로 거부합니다. 공개 함수로 생성하고 파일을 직접 수정하지 않습니다.

```ts
type SourceSnapshot = {
  text: string
  hash: string
  format: "md" | "mdx"
  sections: Record<
    string,
    {
      start: number
      end: number
      ownEnd: number
      dependencies: [number, number][]
    }
  >
}
```

offset은 모든 호스트에서 `\r\n` 줄 끝을 포함한 파일 자체의 텍스트에 대한 JavaScript 문자열 인덱스입니다. `start`는 제목 시작, `end`는 다음 동급·상위 제목 또는 문서 경계, `ownEnd`는 하위 제목 직전입니다. 여러 제목이 같은 id를 가지면 그 id로 가는 링크가 닿는 첫 번째 제목의 범위를 기록하므로, 그 id에 `replace` 규칙을 쓰면 첫 번째 절을 두 번 치환하는 대신 `cudoc: <document> gives #<id> to <n> headings, so a replace rule cannot tell which section to rewrite; give them distinct ids` 오류를 던집니다. 문서 루트의 직접 자식이 아닌 제목은 범위가 자기 줄에 있는 바깥 블록의 표시에서, 또는 그 뒤에서 시작합니다. 표시는 제목 줄 자체에서 읽는데, remark 호스트는 표시 뒤에서, markdown-it 호스트는 줄의 처음부터 제목을 기록하기 때문입니다. 규칙은 절의 원문을 따로 읽었을 때의 글자에 적용하며, 이 글자는 [replace.ts](../../packages/cudoc/src/node/replace.ts)의 `sectionText`가 자릅니다. 목록 항목에서는 항목의 표시와, 뒤따르는 모든 줄에서 항목의 들여쓰기(항목 내용이 시작하는 열로, 제목이 있는 열이거나, 제목이 항목의 뒷줄에 있으면 항목을 여는 줄의 열이며, 그 줄에 표시만 있으면 표시 다음 열이고, 탭은 다음 4의 배수까지)를 파서가 항목 내용에서 뗀 것처럼 떼어 내므로, 목록 항목 안의 절은 아무리 깊어도 수집한 구조대로 치환됩니다. 바깥 블록의 일부가 원문에 남는 경우에는 같은 파일의 `unreplaceableSection`이 구조가 다른 사본을 컴파일하는 대신 규칙을 거부합니다. 제목 앞에 인용문이나 콜아웃의 `>`가 있을 때, 각주의 들여쓰기가 남을 때, 절이 컴포넌트나 `:::` 지시문, markdown-it 컨테이너의 끝까지 이어지고 마지막 줄이 그 블록을 닫는 `:::`나 태그일 때입니다. 오류는 `cudoc: <document>#<id> starts inside <a quote | a callout | a footnote | a container | a component | a <type> block>, and <reason>, so a replace rule cannot rewrite it; …`입니다. 저장된 트리와 원문만으로 판단하며, `cudoc check`는 같은 경우를 `unreplaceable-embed-section`으로 보고합니다. 컴포넌트나 컨테이너 안에서 뒤에 다른 제목이 이어지는 절과 모든 최상위 절은 평소처럼 치환하며, 규칙 없이 임베드하면 수집한 트리 그대로 들어갑니다. dependency 범위는 원문의 정의 위치입니다. 이 범위로 저장 AST의 position이 제거된 뒤에도 원본 Markdown을 치환합니다.

## 임베드

소스·import: [resolve-embed.ts](../../packages/cudoc/src/node/resolve-embed.ts), `@cudoment/cudoc/node/resolve-embed`.

```ts
type Replacement = { find: string; replace: string; regex?: boolean; flags?: string }
type CellValue =
  | "title" | "summary" | "parent"
  | { table?: number; row: number; column: number; skipTablesWithHeaders?: string[] }
  | { extractor: string }
type TableColumn =
  | "title" | "link" | "summary"
  | { header?: string; value: CellValue; link?: "section" | "parent" | "document"; minWidth?: string }
type TreeRender = {
  type: "tree"
  open?: number // 기본값 1
  print?: number // 기본값: 모든 단계
  depth?: number // 기본값: 모든 단계
  headings?: number // 0–5, 기본값 0
  order?: string[]
  columns?: TableColumn[] // 기본값 DEFAULT_TREE_COLUMNS, ["link", "summary"]
}
type EmbedSpec = {
  sources: string[]
  select?: SectionSelection
  render?: "section" | { type: "table"; columns?: TableColumn[] } | TreeRender
  replace?: Replacement[]
}
type EmbedContext = { documentId: string; prefix?: string }
type EmbedRow = {
  document: StoredDocument
  section: { anchorId?: string; title: string; tree: Root }
  parent?: { title: string; anchorId?: string }
  url: string
}
type ExtractedCell = { text: string; url?: string }
type TableExtractor = {
  version: string
  extract(
    row: EmbedRow,
    context: { library: Library; documentId: string; column: TableColumn; node?: TreeNode },
  ): string | ExtractedCell | undefined
}
type TreeNode = {
  id: string // documentId, 제목이면 documentId#anchorId
  kind: "document" | "heading"
  documentId: string
  anchorId?: string
  name: string
  title: string
  url: string
  sourcePath: string
  level: number
  cells: ExtractedCell[]
  children: TreeNode[]
}
type TreeSource =
  | { folder: string; documents: StoredDocument[] }
  | { document: StoredDocument; anchor?: string }

parseEmbedSpec(value: string): EmbedSpec
resolveDocumentReference(library: Library, reference: string, from: string): {
  document: StoredDocument; anchor?: string
}
resolveEmbed(library: Library, spec: EmbedSpec, context: EmbedContext): Root
resolveDocumentEmbeds(library: Library, documentId: string): Root
buildEmbedRow(document: StoredDocument, anchorId: string | undefined, tree: Root): EmbedRow
extractCell(library: Library, column: TableColumn, row: EmbedRow, context: EmbedContext, node?: TreeNode): {
  cell: ExtractedCell; problem?: string
}
buildEmbedTable(library: Library, columns: TableColumn[], rows: EmbedRow[], context: EmbedContext): Root
resolveTree(library: Library, spec: EmbedSpec, context: EmbedContext): TreeNode[]
resolveTreeSource(library: Library, reference: string, from: string, page?: string): TreeSource
buildEmbedTree(nodes: TreeNode[], render: TreeRender): Root
namesTreeNode(entry: string, node: Pick<TreeNode, "name" | "title">): boolean
// 비동기 버전은 Promise<Root>를 반환합니다.
// resolveEmbedAsync(library, spec, context)
// resolveDocumentEmbedsAsync(library, documentId)
```

`parseEmbedSpec`은 YAML을 읽고 최상위 키와 선택 조건 키, 치환 규칙 키, 소스 목록, 출력 형식을 검증합니다. 모르는 키는 세 계층 모두에서 거부하며 메시지에 알려진 키 목록을 함께 보여 줍니다. `regex: true` 없이 쓴 `flags`는 조용히 무시하지 않고 오류로 처리합니다. `parseEmbedBlock(value, documentId, number?)`은 이 함수를 감싸서, 실패했을 때 문서와 블록 번호를, 파서 오류라면 줄과 열까지 함께 알려 줍니다. `sources`는 비어 있으면 안 됩니다. 기본 출력은 `section`, 표 기본 열은 `DEFAULT_TABLE_COLUMNS`인 title/link/summary입니다. 표 열은 축약 이름 또는 키마다 검증하는 매핑입니다. `value`는 필수이며 세 이름 중 하나, 셀 좌표 매핑(`row`·`column`은 음이 아닌 정수, 선택적 `table` 인덱스와 문자열 `skipTablesWithHeaders`), 또는 단독 `{ extractor }`입니다. `link`는 `section`, `parent`, `document` 중 하나이고 `minWidth`는 숫자와 `px`, `rem`, `em`, `ch`, `%` 중 한 단위로 된 CSS 길이입니다. `render`는 `section`이거나 `type`이 `table` 또는 `tree`인 매핑이며, 그 밖의 값은 `cudoc: render must be "section" or a mapping with type: table or type: tree` 오류입니다. 표에는 `type`과 `columns` 외의 키를, 트리에는 `type`, `open`, `print`, `depth`, `headings`, `order`, `columns` 외의 키를 쓸 수 없습니다. 트리의 `open`은 0 이상의 정수, `print`와 `depth`는 1 이상의 정수, `headings`는 0부터 5까지의 정수이고, `order`는 비어 있지 않은 문자열의 목록이며 NFC 기준으로 같은 이름을 두 번 쓸 수 없고 `...`는 한 번만 쓸 수 있습니다. 트리의 열은 표의 열과 같이 검증합니다. 트리는 절의 본문을 복사하지 않으므로 `select`나 `replace`를 쓰면 오류입니다. 선택 동작은 [문서 쿼리](./document.ko.md#섹션과-쿼리)에 정의되어 있습니다.

표 출력은 선택된 절마다 `buildEmbedRow`로 `EmbedRow` 하나를 만들며, id를 재기준화하기 전에 읽으므로 셀의 링크가 복사본이 아닌 원본 문서를 가리킵니다. `section.title`은 제목의 보이는 글자(문서 전체면 문서 제목), `parent`는 원본 트리에서 그 절 위에 있는 가장 가까운 더 얕은 제목, `url`은 문서 경로에 앵커를 붙인 값입니다. `extractCell`은 열 하나를 글자와 선택적 링크로 바꿉니다. `title`, `summary`(절의 직접 자식 중 첫 문단의 일반 텍스트), `parent`, 표 셀(절 안의 표를 문서 순서로 세되 머리 행에 `skipTablesWithHeaders`의 이름이 있는 표는 제외, `row` 0은 머리 행, 글자는 `nodeText`), 또는 추출기의 반환값입니다. 열의 `link`는 절의 `url`, 상위 제목의 주소(앵커가 있으면 앵커, 없으면 문서 경로), 문서 경로로 해석되며 추출기가 돌려준 `url`은 열의 `link`보다 우선합니다. 이 주소는 표나 트리가 얼마나 깊이 중첩되든 임베드가 놓일 페이지(`context.documentId`)에서 쓸 주소로 적습니다. 이를 감싸는 사본은 사본 안의 id를 가리키는, 조각만 있는 주소만 그 id의 새 이름으로 바꿉니다. 값이 없으면(문단 없음, 상위 제목 없음, 표·행·셀 부족, 추출기가 `undefined`나 `""`를 반환) `cell.text`는 `""`이고 `problem`이 무엇을 기대했고 절에 무엇이 있는지 적습니다. `buildEmbedTable`은 `minWidth`를 지정한 열의 머리 셀에 `data.hProperties.style`로 `min-width: <minWidth>`를 쓰고 `EmbedRow`마다 행 하나를 씁니다. 라이브러리에 없는 추출기를 부르는 `{ extractor }` 열은 예외를 던집니다.

추출기는 `BuildDocumentsOptions.extractors`, 즉 이름에서 `{ version, extract }`로 가는 맵에서 옵니다. `version`은 비어 있지 않은 문자열이어야 하며 이름순으로 정렬한 `{ 이름: version }`으로 설정 해시에 들어가므로, 추출기가 바뀌면 컴파일러가 바뀔 때처럼 다시 수집합니다. 함수는 런타임의 `Library.extractors`에만 있고 직렬화되지 않으며, 불러온 라이브러리에는 없습니다. 준비된 임베드에는 문제가 없고, `{ extractor }` 열을 새로 해석할 때에만 오류가 됩니다. 검사는 표 임베드를 새로 해석하므로 `cudoc check`는 설정의 `extractors`를 불러온 라이브러리에 붙입니다. 불러온 라이브러리를 직접 검사하는 프로그램은 `library.extractors`를 스스로 설정합니다.

트리 출력은 원본마다 `resolveTreeSource`로 읽습니다. `/`로 끝나는 경로는 폴더이며 `from` 기준으로, `/`로 시작하면 라이브러리 맨 위 기준으로 해석합니다. 폴더 원본은 `cudoc: a folder source takes no anchor: <참조>`, `cudoc: embed source escapes root: <참조>`, 또는 폴더 아래에 문서가 없을 때 `cudoc: no documents in folder <참조> referenced from <from>` 오류가 날 수 있습니다. 트리가 놓이는 문서 `page`를 주면, 그 페이지가 `private`가 아닌 한 문서가 모두 `private`인 폴더도 `cudoc: folder <참조> referenced from <from> holds only private documents, which a tree on <page> leaves out` 오류입니다. 그 밖의 경로는 `resolveDocumentReference`와 같이 문서를 가리키며, id는 NFC로도 비교합니다. 없는 문서의 경로가 문서를 가진 폴더라면 문서 누락 메시지에 `; a folder source ends with /, as in <경로>/`가 붙습니다. 문서의 계층은 [tree.ts](../../packages/cudoc/src/node/tree.ts)가 문서 목록마다 한 번 계산하며, id는 NFC로 비교합니다. 문서 자신의 폴더부터 위로 올라가면서, 폴더를 대표하는 문서 가운데 그 문서 자신이 아닌 첫 문서가 상위 문서가 됩니다. 대표 문서는 `<폴더>.md`를 `<폴더>/index.md`보다 먼저 보며, 라이브러리 맨 위는 `index`가 대표합니다. 그래서 `X.md`는 `X/`의 문서를 하위로 받고, `X/index.md`는 `X.md`가 없으면 `X/`의 나머지 문서를 받고 `X.md`가 있으면 그 아래에 달리며, 대표 문서가 없는 폴더는 건너뜁니다. 폴더 원본의 첫 층은 폴더 안의 문서 가운데 상위 문서가 그 폴더 안에 있지 않은 문서이며, 폴더를 대표하는 문서는 빠집니다. 문서 원본은 줄 하나이고, 앵커가 붙은 원본은 `collectSections`가 그 앵커로 찾은 제목마다 줄 하나이며 각 줄은 `headings` 범위 안의 더 깊은 제목을 하위로 가집니다. 문서 줄 아래에는 단계가 `depth` 안에 있는 동안 깊이 2부터 `headings + 1`까지의 제목이 문서 순서대로 깊이에 따라 중첩되어 달리고(`depth`를 넘은 제목은 그 아래 제목도 함께 뺍니다), 그다음에 그 문서를 상위로 둔 문서가 달립니다. 트리가 놓이는 페이지 `context.documentId`가 `private`가 아니면(수집된 문서를 가리키지 않는 id도 `private`가 아닌 페이지로 봅니다), 폴더 원본이나 상위 문서를 통해 들어오는 `private` 문서는 그 아래 줄과 함께 뺍니다. 내보내기가 비공개 문서를 쓰지 않아 그 문서로 링크할 수 없기 때문입니다. 문서 원본은 그 문서가 무엇이든 가리킵니다. 첫 층은 `sources`에 적은 순서를 따릅니다. 폴더 원본이 가져온 문서와 모든 줄 아래의 문서는 `title`, `name`, `id` 순으로 정렬하며, 대소문자를 무시하고 연속된 숫자는 값으로, 그 밖에는 코드 포인트로 비교하므로 순서가 로캘을 따르지 않습니다. 그다음 `order`가 같은 순위의 순서를 유지하며 첫 층을 옮깁니다. 줄은 `namesTreeNode`가 일치시키는 첫 항목, 곧 `name`이나 `title`이 NFC 기준으로 같은 항목의 자리로 가고, 그 밖의 줄은 `...`의 자리로, `...`가 없으면 끝으로 갑니다.

문서 줄의 행에는 앵커가 없고 `url`은 문서 경로입니다. 제목은 문서의 `#` 제목, 곧 최상위 블록 가운데 또는 최상위 `header` 요소 안의 첫 깊이 1 제목의 보이는 글자입니다. `header` 요소는 Docusaurus가 페이지 제목을 읽는 제목을 넣는 곳입니다. 그런 제목이 없으면 앞부분 정보의 비어 있지 않은 문자열 `title`을, 그것도 없으면 `name`을 씁니다. `name`은 확장자를 뺀 파일 이름이며 index 문서라면 폴더 이름이고 NFC로 씁니다. 행의 `section.tree`는 제목을 담은 블록부터 다음 제목 블록 전까지이고, 제목이 없으면 문서 전체이므로 `summary`는 제목 다음의 첫 문단입니다. 제목 줄의 행은 그 절의 `buildEmbedRow`이고, `name`은 NFC로 쓴 제목입니다. 칸은 트리를 다 만든 뒤 가장 깊은 줄부터 채우므로, 추출기의 `context.node`에는 그 아래 줄이 모두 채워져 있습니다. `extractCell`은 `node` 인자를 그 `node`로 넘깁니다. 트리의 `data.cudocDependencies`는 줄을 읽어 온 문서이며, `{ extractor }` 열이 있으면 `"*"`가 더해집니다. 트리는 절의 본문을 복사하지 않으므로 그 안에서 펼치거나 이름공간을 붙이는 것은 없습니다. 복사된 절 안의 트리는 그 사본을 가져온 문서를 기준으로 해석하며, 트리의 링크는 이미 페이지의 주소이므로, 이를 감싸는 사본은 아래의 경로 조정 규칙대로 다룹니다.

`buildEmbedTree`는 `spread: false`인 순서 없는 `list`를 쓰며, 여기에 `data.cudoc.kind: "tree"`와 `className: ["cudoc-tree"]` `hProperties`를, `print`가 있으면 `data-cudoc-print`도 붙입니다. 아래에 다른 줄이 있는 줄은 `hName: "details"`인 `blockquote`를 담은 `listItem`이며, 단계가 `open` 이하이면 `hProperties.open: true`가 붙고, 그 자식은 `hName: "summary"`인 `paragraph`로 쓴 줄과 중첩된 `list`입니다. 아래 줄이 없는 줄은 `className: ["cudoc-tree-leaf"]`인 `listItem`이 그 줄을 `paragraph`로 담습니다. 줄은 비어 있지 않은 칸을 `·`로 이은 것이며, `url`이 있는 칸은 `link`이고, 모든 칸이 비어 있으면 제목만 씁니다. 페이지 단위 출력이 트리를 알아보는 값은 `@cudoment/cudoc/paged`가 내보냅니다. `TREE_KIND`, `TREE_CLASS`, `TREE_PRINT_ATTRIBUTE`, `isTree(node)`, 그리고 인쇄 깊이나 `Infinity`를 돌려주는 `treePrintDepth(value)`입니다.

참조는 `context.documentId`의 상대 경로이며 `/`로 시작하면 문서 루트 기준입니다. `.md`/`.mdx`, `#anchor`를 지원합니다. 앵커는 퍼센트 인코딩을 풀어 읽으며, 이스케이프가 아닌 `%`가 있으면 `cudoc: embed source has a malformed percent-escape: <참조>` 오류입니다. URL, 역슬래시 경로, 루트 이탈, 없는 문서는 오류입니다. 문서는 문서 목록마다 한 번 만드는 색인으로 찾으므로, 큰 라이브러리의 블록을 모두 해석해도 참조마다 목록을 훑지 않습니다. 앵커와 선택 조건이 모두 없으면 문서 전체를 사용합니다.

소스 AST를 복제합니다. 치환이 있으면 원본의 선택 범위를 읽고 규칙을 순서대로 적용한 뒤 기존 컴파일러·옵션으로 다시 컴파일합니다. 일반 치환은 split/join으로 전체 일치를 바꾸고, 정규식은 JavaScript `RegExp`를 사용하며 기본 플래그는 `g`입니다. 선택 범위 밖의 정의는 바꾸지 않고 추가합니다. 원본 소스와 AST는 수정하지 않습니다. 비동기 API는 처리별 컴파일 캐시를 통해 비동기 컴파일러를 사용합니다. 반환된 루트에는 렌더러가 각주 레이블을 구분하는 데 쓰는 `data.cudocEmbedPrefix`(`cudoc-<문서 id>-<prefix 또는 embed>-`, 문서 id는 [`idToken`](./document.ko.md#문서-옵션)으로 표기)와 `data.cudocDependencies`가 있습니다. 후자는 해석이 읽은 모든 문서의 id를 정렬한 목록으로, 펜스의 sources와 그 안에 중첩된 임베드의 sources를 포함하며, `{ extractor }` 열이 실행되었으면 추출기가 어떤 문서든 읽을 수 있으므로 `"*"`가 더해집니다. 트리라면 줄을 읽어 온 문서입니다.

ID·각주·정의를 구분하고 링크·이미지·지원하는 raw HTML 속성 경로를 조정합니다. 노드마다 경로 조정은 그 노드를 담은 가장 안쪽 사본에서 한 번만 합니다. 안쪽 사본이 이미 조정한 노드나 표와 트리가 쓴 노드는 이미 페이지의 주소를 담고 있으므로, 바깥 사본은 그 노드의 id를 바꾸고, 사본 안의 id를 가리키는 조각만 있는 주소를 그 id의 새 이름으로 고칠 뿐, 다른 주소는 그대로 둡니다. 이 주소를 원본 경로로 다시 읽으면, `routes`가 어떤 문서에 다른 문서의 경로를 줄 때 경로가 다른 문서를 가리킬 수 있고, 라이브러리 밖으로 올라가는 경로는 엉뚱한 디렉터리를 기준으로 다시 적히기 때문입니다. 조정하는 raw HTML 속성은 내보내기가 복사하는 자산과 같은 `href`, `src`, `poster`, `data`, `xlink:href`와 `srcset`의 각 후보이며, `srcset` 후보의 너비나 밀도 표기는 그대로 둡니다. 낮춘 요소의 같은 `hProperties`(`srcSet` 포함)도 같은 방식으로 조정합니다. 조각 링크는 복사본에 그 id가 있으면 복사본 안을 계속 가리키고, 없으면 원본 문서 경로에 조각을 붙인 주소가 됩니다. 경로가 없는 링크(`?tab=2`, 빈 `href`)는 원본 문서의 디렉터리가 아니라 복사해 온 원본 문서 자체를 가리킵니다. 상대 경로는 원본 문서의 라이브러리 경로를 기준으로 해석하며, 수집된 문서를 라이브러리 경로나 id로 가리키는 경로(`/guide/setup.md`, `/guide/setup`, `/guide/setup/`)와 index 문서의 디렉터리를 가리키는 경로(`guide/index`의 `/guide/`)는 그 문서의 경로가 되고, 그 밖의 경로는 정규화한 루트 상대 경로로 남습니다. `internal/notes.md`의 `../../outside.png`처럼 라이브러리 루트 밖으로 올라가는 상대 경로는 라이브러리 경로가 없고, 루트에서 잘라 내면 다른 파일을 가리키게 됩니다. 그래서 임베드하는 문서 기준으로 다시 적습니다(`guide.md`에서는 `../outside.png`). 라이브러리에 루트가 있으면 두 파일의 실제 디렉터리를 기준으로 삼아 같은 파일에 닿고, 없으면 작업 디렉터리와 상관없이 라이브러리 경로만으로 계산합니다. 디렉터리는 index를 가리키는 끝의 슬래시를 유지합니다. 임베드하는 문서를 알 수 없으면 쓴 그대로 둡니다. 끝에 슬래시를 붙여 쓴 디렉터리는 같은 이름의 문서가 옆에 있어도 index 문서를 가리키며, 슬래시 없이 쓰면 같은 이름의 문서를 가리킵니다. `.`와 `..` 경로도 같은 방식으로 디렉터리를 가리킵니다. Docusaurus가 Markdown 이미지([`data.cudocImage`](./document.ko.md#의미-ast))나 로컬 파일로 가는 링크를 쓰는 방식처럼 속성이 webpack 로더 뒤에 `./`나 `../`로 시작하는 상대 모듈을 `require()`하는 JSX 요소는, 사본이 들어가는 파일의 디렉터리 기준으로 그 경로를 다시 씁니다. 이때 경로를 JavaScript 문자열로 읽은 뒤, 원래 따옴표에 맞춰 이스케이프한 문자열로 다시 적습니다. 사본이 얼마나 깊이 중첩되었든 한 번만 다시 쓰므로 다른 디렉터리의 페이지에서도 모듈을 찾을 수 있습니다. 라이브러리에 루트가 있으면 파일의 디렉터리를, 없으면 라이브러리 경로의 디렉터리를 기준으로 삼으며, 후자는 모든 루트의 기준 경로가 디렉터리 이름과 같을 때에만 파일의 디렉터리와 일치합니다. 임베드하는 문서의 id가 수집된 문서를 가리키지 않으면 수집한 경로를 그대로 둡니다. 누락된 섹션, 순환 의존성, 처리할 수 없는 치환, 64를 초과한 깊이는 문맥을 포함한 오류입니다. 독립적인 `resolveEmbed` 결과를 합칠 때는 서로 다른 `prefix`를 사용합니다. 전체 문서·준비 API는 블록 번호를 직접 관리합니다.

```js
import { loadLibrary } from "@cudoment/cudoc/node/library"
import { resolveEmbed } from "@cudoment/cudoc/node/resolve-embed"
import { renderDocument } from "@cudoment/cudoc/render"

const library = loadLibrary(".cudoc/documents")
const tree = resolveEmbed(
  library,
  {
    sources: ["reference.md"],
    select: { depth: 2 },
    render: { type: "table" },
  },
  { documentId: "index", prefix: "reference-summary" },
)
const html = renderDocument(tree)
```

### 트리 데이터

`resolveTree(library, spec, context)`는 트리 임베드가 그리는 줄을 돌려줍니다. 생성한 페이지에 트리를 블록으로 적어 두는 아웃라이너처럼, 트리를 자기 형식으로 쓰는 프로그램을 위한 함수입니다. `spec`은 `render`가 트리인 임베드이며 `parseEmbedSpec`과 같이 검증합니다. 다른 출력이면 `cudoc: resolveTree needs an embed whose render is a tree` 오류이고, 아무것도 가리키지 않는 원본에는 해석기와 같은 오류를 던집니다. `context.documentId`는 상대 원본을 해석하는 기준이자 추출기가 받는 값이며, `prefix`는 쓰지 않습니다. `open`과 `print`가 무엇이든 `depth`까지의 모든 단계가 들어 있습니다. 결과는 일반 데이터이므로 같은 라이브러리와 명세는 같은 `JSON.stringify` 출력을 내며, 자기가 쓴 내용을 해시로 확인하는 프로그램은 이 성질에 기댈 수 있습니다. `buildEmbedTree(nodes, render)`는 줄을 `resolveEmbed`가 만드는 mdast로 바꾸므로, 줄을 먼저 고친 프로그램도 임베드와 같은 방식으로 렌더링할 수 있습니다. 아래 예시는 `cudoc collect`가 `.cudoc/documents`에 출력한 라이브러리를 읽어 트리를 아웃라이너의 들여쓴 블록으로 출력합니다.

```js
import { loadLibrary } from "@cudoment/cudoc/node/library"
import { resolveTree } from "@cudoment/cudoc/node/resolve-embed"

const library = loadLibrary(".cudoc/documents")
const lines = resolveTree(
  library,
  { sources: ["/projects/"], render: { type: "tree", columns: ["summary"] } },
  { documentId: "index" },
)
const outline = (nodes, indent = "") =>
  nodes.flatMap((node) => [
    `${indent}- [[${node.name}]] · ${node.cells[0].text}`,
    ...outline(node.children, `${indent}\t`),
  ])
console.log(outline(lines).join("\n"))
```

불러온 라이브러리에는 추출기가 없으므로, 열이 추출기를 부르는 트리를 해석하기 전에 표와 마찬가지로 `library.extractors`를 설정합니다. 여러 단계에 걸친 합계는 [하위 단계의 합계](../embedding.ko.md#하위-단계의-합계)처럼 `context.node`를 읽는 추출기로 구하거나, 돌려받은 줄을 순회하며 값을 더해서 구합니다.

## 준비된 임베드

소스·import: [prepare-embeds.ts](../../packages/cudoc/src/node/prepare-embeds.ts), `@cudoment/cudoc/node/prepare-embeds`.

```ts
prepareEmbeds(library: Library, outDir?: string, options?: { previous?: PreparedEmbeds }): Promise<PreparedEmbeds>
readPreparedEmbeds(outDir: string, documentId: string, source: string): PreparedEmbeds
embedKey(documentId: string, value: string, index: number): string
expandPreparedEmbeds(
  tree: Root,
  target: PreparedTarget | (() => PreparedTarget),
  onBlock?: (block: Root, documentId: string) => void,
): Root
type PreparedTarget = { outDir: string; documentId: string; source: string }
```

`prepareEmbeds`는 전체 수집 문서의 코드 블록 임베드를 비동기로 처리하고 `embeds.json`을 원자적으로 교체합니다. 무엇이든 쓰기 전에 모든 블록을 해석합니다. 실패한 블록이 하나면 해석기의 오류를 `cause`로 감싼 `cudoc: <sourcePath>, embed <number>: <message>` 오류를 던지고, 여럿이면 `AggregateError` 하나로 던집니다. 이 오류의 `errors`는 개별 실패이고, 메시지는 `cudoc: <n> embeds could not be prepared:` 뒤에 블록마다 한 줄(`<sourcePath>, embed <number>: <message>`)을 붙인 것입니다. 실패한 블록이 있으면 아무것도 쓰지 않습니다. 기본 `outDir`는 `.cudoc/documents`이며 **라이브러리에서 추론하지 않습니다**. 사용자 수집 경로는 명시적으로 전달합니다.

`PreparedEmbeds`는 `schemaVersion: 2`, `configuration`, `sourceHashes: Record<string,string>`, `blocks: Record<string,Root>`, 그리고 같은 키 아래에 각 블록의 `cudocDependencies`를 담은 `dependencies: Record<string,string[]>`를 가집니다. 키는 `documentId:index:sha256(fenceValue)`이며 블록 번호는 1부터입니다. `readPreparedEmbeds`는 스키마, manifest 설정, 현재 문서 소스 해시, manifest 문서 해시를 검사합니다. 없거나 오래된 데이터는 재수집을 안내하는 오류이며, 이전 버전이 쓴 파일도 오래된 데이터입니다. `embeds.json`과 `manifest.json`은 해석한 `outDir`마다 한 번 파싱하고, 두 파일의 inode, 크기, 수정 시각이 그대로인 동안 유지하므로 페이지마다 또는 블록마다 묻는 호스트가 파일을 다시 파싱하지 않습니다. 출력할 때마다 두 파일이 모두 교체되므로 재수집 뒤의 다음 호출은 새 파일을 읽습니다. 반환된 객체는 호출 사이에 공유되므로, 블록을 자기 트리에 넣기 전에 복사합니다.

`expandPreparedEmbeds`는 모든 호스트 통합이 수행하는 접합입니다. `tree`의 `cudoc-embed` 펜스를 문서 순서대로 각 펜스의 준비된 블록 복사본의 자식으로 바꾸고, 제자리에서 수정한 같은 트리를 반환합니다. `target`은 출력된 라이브러리(`outDir`), 임베드하는 문서와 수집 당시의 원문이며, 첫 펜스를 만났을 때에만 읽으므로 임베드가 없는 문서에는 라이브러리가 필요하지 않고, 함수를 넘기면 대상을 찾는 작업을 그때까지 미룹니다. `onBlock`은 각 복사본을 접합하기 전에 받습니다. 준비된 블록이 없는 펜스는 `cudoc: prepared embed missing in <id>; recollect documents` 오류입니다. remark 임베드 플러그인, markdown-it 어댑터, `cudoc-export`의 `library` 모드가 모두 이 함수로 접합합니다.

`previous`를 주면 네 조건이 모두 맞는 블록을 해석하지 않고 그 결과에서 가져옵니다. 설정이 같고, 문서 id 집합이 같고(문서가 추가되거나 삭제되면 어느 블록 안의 링크든 해석 결과가 바뀔 수 있습니다), 임베드하는 문서의 해시가 같고, 블록의 `dependencies`에 있는 모든 id의 해시가 그대로일 때입니다. `dependencies`에 `"*"`가 있는 블록은 항상 다시 해석합니다. 기록되는 파일은 어느 경우에나 완전하며 절약되는 것은 작업량입니다.

`buildDocuments` 다음에 `prepareEmbeds`를 부르면 라이브러리, 그다음 `embeds.json` 순서로 두 번 출력합니다. 그 사이에 준비가 실패하면 준비된 임베드가 없는 라이브러리가 남고, 준비가 성공할 때까지 호스트 빌드가 재수집을 요구합니다. `cudoc collect`가 실행하는 [`collectDocuments`](#감시)는 라이브러리 자체의 출력이 쓰는 임시 디렉터리에 준비하므로, 라이브러리와 `embeds.json`이 함께 교체되거나 둘 다 그대로 남습니다.

## 감시

소스·import: [watch.ts](../../packages/cudoc/src/node/watch.ts), `@cudoment/cudoc/node/watch`.

```ts
type CollectConfig = Omit<BuildDocumentsOptions, "compiler"> & {
  compiler?: (...parameters: Parameters<DocumentCompiler>) => CompiledDocument | Promise<CompiledDocument>
}
type CollectionState = { library?: Library; prepared?: PreparedEmbeds }
type CollectionPass = {
  library: Library; prepared: PreparedEmbeds
  documentCount: number; compiled: string[]; reused: number
  blocks: number; reusedBlocks: number; outDir: string; elapsed: number
}
collectDocuments(config: CollectConfig, previous?: CollectionState): Promise<CollectionPass>
previousCollection(outDir?: string): CollectionState
watchDocuments(config: CollectConfig, options?: {
  debounce?: number; reuseOutput?: boolean
  onPass?(pass: CollectionPass): void; onError?(error: unknown): void
}): { ready: Promise<void>; close(): void }
```

`collectDocuments`는 CLI `collect`가 하는 일의 한 회차입니다. 설정에 `compiler`가 있으면 비동기 수집기로(반환값은 promise여도 값이어도 됩니다), 없으면 동기 수집기로 라이브러리를 컴파일하고 임베드를 해석한 뒤, 둘을 [`publishDirectory`](#저장) 트랜잭션 한 번으로 `outDir`에 출력합니다. 두 단계에 `previous.library`와 `previous.prepared`를 넘겨 바뀌지 않은 문서와 영향 없는 블록을 재사용합니다. 모든 임베드가 해석되기 전에는 아무것도 쓰지 않으므로, 실패한 회차는 이전 라이브러리와 그 `embeds.json`을 서로 맞는 상태 그대로 남깁니다. 회차 결과는 컴파일한 문서 id(전체 회차에서는 모든 id), 재사용한 문서와 블록의 수, 소요 시간을 담습니다. `previousCollection(outDir)`은 끝난 실행이 `outDir`에 남긴 것을 불러옵니다. 라이브러리는 `loadLibrary`로, 준비 결과는 스키마가 현재 것일 때 읽고, 없거나 읽을 수 없거나 호환되지 않으면 `{}`를 반환하므로 새 프로세스가 지난 실행에서 이어 갑니다.

`watchDocuments`는 한 회차를 실행한 뒤, 어느 루트 아래에서든 `.md`·`.mdx` 파일이 생기거나 바뀌거나 이름이 바뀌거나 삭제되면 `debounce` 밀리초(기본 150)의 정지 후 다시 실행합니다. 디렉터리나 더는 없는 항목이 바뀌어도 회차를 시작하는데, 문서가 든 디렉터리의 이름이 바뀌었거나 옮겨졌거나 삭제되었을 수 있기 때문입니다. 항목은 이름으로 판단하지 않고 디스크에서 확인하므로 `v1.5/`도 해당합니다. 수집이 읽지 않는 숨김 항목과 `node_modules` 아래의 변경은 무시합니다. 각 루트 디렉터리에 `fs.watch`를 재귀로 겁니다. 회차 도중의 변경은 한 회차를 더 예약합니다. 실패한 회차(컴파일되지 않는 문서, 원본이 없는 임베드)는 `onError`로 가고, 마지막 성공 회차의 상태를 다음 회차에 그대로 쓰며, 출력 디렉터리에는 그 회차의 라이브러리와 임베드가 남고, 감시는 계속됩니다. 운영체제가 감시할 파일 수를 더 허용하지 않거나 루트가 삭제되는 등 파일 감시기 자체가 내는 오류도 프로세스를 끝내지 않고 `onError`로 갑니다. `onError`가 없으면 오류를 stderr에 출력합니다. `reuseOutput: false`가 아니면 첫 회차는 `previousCollection(outDir)`에서 시작합니다. `ready`는 첫 회차가 성공하든 실패하든 끝나고, 그 회차 도중의 변경이 예약한 회차까지 끝나면 확정됩니다. 다만 이것이 변경이 이미 보고되고 있다는 뜻은 아닙니다. macOS에서는 재귀 감시가 호출 직후 잠시 뒤에 시작되므로, 첫 회차가 파일을 읽은 뒤 그 사이에 바뀐 파일은 변경이 보고되지 않을 수 있으며, 그러면 다음 변경이 시작하는 회차에서 수집됩니다. `close()`는 감시를 멈추며 진행 중인 회차는 끝까지 실행합니다.

## 참조 검사

소스와 import: [node/check.ts](../../packages/cudoc/src/node/check.ts), `@cudoment/cudoc/node/check`, 그리고 [node/report.ts](../../packages/cudoc/src/node/report.ts), `@cudoment/cudoc/node/report`.

`checkReferences(library: Library, options?: CheckOptions): CheckResult`는 모든 문서를 훑어 `{ issues, documentCount, checkedReferences }`를 반환합니다. 읽기만 하며 아무것도 쓰지 않고 라이브러리도 바꾸지 않습니다.

`ReferenceIssue`는 `code`, `severity`(`"error"` 또는 `"warning"`), `documentId`, `sourcePath`, `message`, `reference`(작성자가 쓴 그대로), 선택적 `position`을 담습니다. `missing-anchor`와 `missing-embed-anchor`에는 대상 문서가 실제로 가진 앵커를 나열한 `available`이 추가됩니다. `missing-embed-anchor`에는 제목 id만 나열합니다. raw HTML이 선언한 id는 링크 대상은 될 수 있어도 임베드할 구역을 시작하지 않기 때문입니다. `unmatched-tree-order`의 `available`에는 트리 첫 층의 제목이 들어 있습니다. 코드는 `missing-document`, `missing-anchor`, `missing-asset`, `missing-embed-source`, `missing-embed-anchor`, `invalid-embed-spec`, `duplicate-anchor`, `empty-anchor`, `unstable-anchor-link`, `unmatched-embed-replacement`, `unreplaceable-embed-section`, `empty-embed-cell`, `unportable-embed-component`, `imported-embed-component`, `cyclic-embed`, `unmatched-tree-order`이며, 이 중 `unstable-anchor-link`, `unmatched-embed-replacement`, `empty-embed-cell`, `unportable-embed-component`, `unmatched-tree-order`가 경고입니다.

`CheckOptions`는 `ignore`(결과에서 제외할 코드), `assetDirs`, `withoutBase`, `externalPaths`, 그리고 `sourceRoot` 또는 `roots`를 받으며 루트의 기본값은 라이브러리 자체의 루트입니다. 루트가 전혀 없으면 파일 검사는 건너뛰고 문서 링크·앵커·임베드만 검사합니다. 문서 링크는 라이브러리 좌표에서 해석합니다. 상대 경로는 문서의 라이브러리 경로를 기준으로, 루트 상대 경로는 라이브러리 경로 그대로, 그리고 `withoutBase`가 있으면 배포 기본 경로를 뗀 형태로 한 번 더 찾는데 이는 내보내기가 경로를 찾는 방식과 같습니다. 라이브러리 맨 위보다 더 올라가는 상대 경로는 어떤 문서도 가리키지 않습니다. `./`나 `guide/`처럼 디렉터리를 가리키는 경로는 그 디렉터리의 index 문서로 해석하며, 끝에 슬래시가 있으면 같은 이름의 문서가 옆에 있어도 index 문서로, 슬래시가 없으면 같은 이름의 문서로 해석합니다. 쿼리는 다른 문서를 가리키지 않으므로 `guide/?tab=1`은 `guide/`로 검사합니다. 경로는 먼저 퍼센트 인코딩을 풀어 읽으며, `100%.md`처럼 이스케이프가 아닌 `%`가 있으면 검사를 끝내지 않고 쓴 그대로 찾아 해당 문서와 함께 누락으로 보고합니다. 호스트가 ASCII가 아닌 조각을 퍼센트 인코딩하므로 조각은 쓴 그대로든 풀어 읽은 것이든 앵커와 맞으면 됩니다. `externalPaths`는 같은 호스트에서 다른 애플리케이션이 담당하는 루트 상대 접두어 목록이며(`/sdk` 등), pathname이 그 접두어 자체이거나 그 아래에 있는 링크는 외부로 보아 검사하지 않습니다. 이 판정 함수 `isExternalPath(url, prefixes)`도 export합니다. 로컬 링크와 이미지는 그다음 [`resolveLocalTarget`](../../packages/cudoc/src/node/local-target.ts)으로 해석하며, 이 함수는 `isExternalPath`, `externalUrl`, `parseSrcSet`과 함께 `@cudoment/cudoc/node/local-target`에서 export합니다. `cudoc-export`이 자산을 복사할 때 쓰는 것과 같은 함수이므로, 대상의 존재 여부를 두고 검사기와 출력기가 어긋날 수 없습니다. 그 함수의 `LocalTargetRoots`는 `{ roots, assetDirs?, withoutBase?, externalPaths? }`이며, 문서 상대 경로는 그 라이브러리 경로를 담는 루트를 통해 디스크에 닿습니다. `parseSrcSet(value)`는 HTML 표준이 읽는 방식대로 `srcset`의 `{ url, descriptor }` 후보를 반환합니다. URL은 다음 ASCII 공백까지이고, URL 끝의 쉼표는 구분자로 보며, 빈 후보는 건너뛰고, 설명자는 괄호 밖의 다음 쉼표까지입니다. 임베드 해석기와 내보내기가 모두 이 함수로 `srcset`을 읽습니다.

위치는 저장된 트리가 아니라 `document.source.text`에서 복원합니다. 수집이 AST를 저장할 때 `position`을 제거하기 때문입니다. 탐색은 Markdown 목적지 구분자로 끝나는 출현을 우선하므로, `guide.md#limit`이 `guide.md#limits`가 있는 줄을 가리키지 않습니다. 중복 앵커는 나중 선언을 보고합니다. 원본에 더 이상 없는 참조는 틀린 위치 대신 위치 없음으로 처리합니다.

`formatCheckResult(result: CheckResult): string`은 문서별로 묶어 `줄:열` 접두어와 함께 출력하며, `available`은 최대 네 개까지 보이고 나머지는 개수로 요약합니다. 앵커는 `#id`로, `unmatched-tree-order`의 이름은 큰따옴표로 감싸서 보입니다.

임베드 원본은 해석기가 직접 호출하는 `resolveDocumentReference`로 해석하므로, 검사기가 통과시킨 원본은 빌드도 찾습니다. 이 함수가 거부하는 것(없는 문서, URL, 역슬래시 경로, 루트를 벗어나는 경로, 앵커의 잘못된 퍼센트 이스케이프)은 해석기의 메시지를 담은 `missing-embed-source`입니다. 대상에 없는 앵커를 가리키는 원본과 어떤 절에도 맞지 않는 선택은 `missing-embed-anchor`이며, 해석기도 두 경우 모두 실패합니다.

트리 임베드의 원본은 해석기와 같이 `resolveTreeSource`로 읽습니다. 이 함수가 거부하는 원본은, 아래에 문서가 없는 폴더를 포함해 그 메시지를 담은 `missing-embed-source`이고, 앵커가 대상의 어느 제목 id와도 맞지 않는 문서 원본은 그 id들을 `available`로 담은 `missing-embed-anchor`입니다. 라이브러리에 없는 추출기를 부르는 열은 추출기 이름 위치의 `invalid-embed-spec`입니다. 폴더 원본은 임베드하는 문서를 `page`로 주고 읽으므로, 공개 페이지라면 모두 빠질 문서만 가진 폴더도 `missing-embed-source`입니다. 모든 원본이 해석되면, `...`가 아닌 `order` 항목 가운데 `namesTreeNode` 기준으로 첫 층의 어느 줄과도 일치하지 않는 항목을, 페이지가 뺀 비공개 문서를 가리키는 항목까지 포함해 `unmatched-tree-order`로 보고하며, 위치는 펜스 안 `order:` 뒤의 그 항목 줄입니다. 트리는 절의 본문을 복사하지 않고 빈 열을 줄에서 빼므로, 순환을 따라가지 않고 컴포넌트나 빈 셀도 검사하지 않습니다.

`cyclic-embed`는 블록이 복사하는 모든 절 안의 임베드를 따라가며, 중첩된 블록을 해석기가 전개하는 방식대로 파싱합니다. 따라가는 대상은 블록의 `replace` 규칙이 남긴 사본이므로, 중첩된 펜스를 일반 코드로 바꾸는 규칙은 연쇄를 거기서 끝내고 중첩된 원본을 되돌려 가리키게 하는 규칙은 연쇄를 새로 만듭니다. 이미 복사하고 있는 절로 되돌아오거나 해석기의 깊이 한도 64에 닿는 연쇄를 `a#* -> b#limits -> a#*` 형태로, 연쇄를 시작하는 펜스의 줄에 보고합니다. 빌드도 같은 연쇄에서 실패합니다.

`invalid-embed-spec`은 `parseEmbedSpec`이 거부한 블록을 다룹니다. 보고 위치의 줄은 펜스 줄에 파서가 알려 준 줄을 더한 값입니다. 열은 파서가 알려 준 열에, 파일의 해당 줄에서 블록 글자 앞에 놓인 부분(들여쓰기, 인용문의 `>`, 목록 항목의 오프셋)의 길이를 더한 값입니다. 그래서 블록 기준이 아니라 파일 기준 좌표가 나오고, 메시지에 남아 있던 블록 기준 `at line N, column M` 꼬리표는 같은 이야기를 두 번 하지 않도록 제거합니다. 좌표가 없는 오류는 펜스 위치에 붙입니다. 펜스는 저장된 원문을 GFM과 front matter를 포함한 Markdown으로 파싱해서 찾으며, `.mdx` 문서는 MDX로 파싱합니다. 따라서 더 긴 펜스나 들여쓴 코드 블록 안에 보여 준 펜스는 예시 글자로 보고, 인용문이나 콜아웃, 목록 항목 안의 펜스는 블록으로 셉니다. 찾아낸 펜스는 문서의 임베드 블록을 순서대로 담고 있어야 하며, 이때 `\r`과 줄 끝 공백을 뺀 글자로 비교합니다. 일치하지 않거나 원문이 파싱되지 않으면 Markdown이 펜스를 닫는 방식대로 원문을 줄 단위로 훑고, 그래도 블록을 찾지 못하면 임베드 진단에 위치를 붙이지 않습니다. 따라서 펜스까지 이어지는 VitePress 컴포넌트의 HTML 블록처럼 호스트가 Markdown과 다르게 읽는 블록이 있으면, Markdown이 읽은 펜스가 호스트의 블록과 같은 글자를 담고 있지 않은 한 위치를 비워 둡니다. `cyclic-embed`도 같은 방식으로 펜스 위치를 붙입니다.

`unmatched-embed-replacement`는 규칙이 치환하는 것과 같은 글자, 즉 [replace.ts](../../packages/cudoc/src/node/replace.ts)의 `sectionText`를 읽습니다. `source.sections[anchor]`를 `end` 또는 `ownEnd`로 끊고 목록 항목의 표시와 들여쓰기를 뗀 글자이거나, 문서 전체 임베드라면 `source.text` 전부입니다. 그 각각에 규칙을 순서대로 적용하면서 무엇이 맞았는지 기록합니다. 어떤 슬라이스에서도 맞지 않은 규칙만 보고합니다. 규칙 목록은 선택된 절 전부에 적용되므로 한 절만 겨냥한 규칙이 나머지를 비껴가는 것은 설계상 정상이기 때문입니다. 쓸 수 없는 패턴은 맞은 것으로 셉니다. 그건 해석기가 낼 오류이기 때문입니다. `unreplaceable-embed-section`은 같은 파일의 `unreplaceableSection`이 거부하는 선택 절마다 그 메시지로 보고하므로, 각자 어떤 컴파일러를 쓰든 검사는 빌드가 멈출 곳에서 멈춥니다.

`empty-embed-cell`은 표 출력이 수행하는 추출을 `buildEmbedRow`와 `extractCell`로 똑같이 수행하되, 매핑으로 쓴 모든 열을 선택된 모든 절에 대고 돌려서 값이 없는 셀마다 열 번호와 머리 글자, 행의 절, 추출기의 `problem` 글자를 보고합니다. 축약형 열은 보고하지 않습니다. 표로 시작하는 절의 `summary`가 비는 것은 정상이기 때문입니다. 등록되지 않은 추출기를 부르는 `{ extractor }` 열은 검사를 중단하는 대신 행마다 `invalid-embed-spec`으로 보고합니다.

`unportable-embed-component`는 임베드가 실제로 복사하게 될 내용을 검사합니다. 선택은 해석기가 쓰는 것과 같은 [`collectSections`](../../packages/cudoc/src/sections.ts)로 적용하므로, `includeChildren: false`와 `select`가 복사 범위를 좁히는 만큼 검사 범위도 함께 좁혀지고, 원본에 적은 절(`reference.md#limits`)은 해석기와 같은 방식으로 `select`와 결합합니다. `render: { type: table }` 임베드는 제목 글자만 이동하므로 건너뜁니다. 보고 대상은 타입이 `mdx`로 시작하거나 `Directive`로 끝나는 노드이며, [`documentToHast`](../../packages/cudoc/src/render.ts)가 거부하지 않고 버리는 `mdxjsEsm`과 `yaml`은 제외합니다. `select.anchors`가 존재하지 않는 절을 가리키면 `collectSections`가 예외를 던지는데, 빌드도 같은 오류를 내기 때문에 삼키지 않고 `missing-embed-anchor`로 보고합니다.

`replace` 규칙이 있으면 사본은 수집된 그대로의 절이 아니라 다시 쓴 Markdown을 다시 컴파일한 결과이며, `cyclic-embed`, `empty-embed-cell`, `unportable-embed-component`, `imported-embed-component`가 모두 그 사본을 읽습니다. 그래서 컴포넌트를 글로 바꾸는 규칙이 있으면 보고할 것이 남지 않습니다. 다시 쓰는 과정은 해석기의 것과 같으며, 둘 다 [replace.ts](../../packages/cudoc/src/node/replace.ts)에서 가져옵니다. 동기 호스트 컴파일러가 있는 라이브러리는 그 컴파일러로 사본을 만듭니다. `cudoc check`는 컴파일러 없이 라이브러리를 불러오고, 비동기 컴파일러로 수집한 라이브러리에는 검사기가 호출할 컴파일러가 남지 않으므로, 이때는 독립 컴파일러가 다시 쓴 Markdown을 라이브러리의 옵션으로 읽습니다. 독립 컴파일러는 임베드 펜스, 컴포넌트, 표를 호스트와 같게 읽지만, 호스트의 파서만 아는 문법은 잃거나 거부합니다. VitePress의 `::: tip` 컨테이너는 글자로 남고, Docusaurus의 `{#id}`나 HTML 주석이 든 MDX는 컴파일되지 않습니다. 그 때문에, 또는 해석기가 규칙이나 스냅숏이나 반복된 절 id를 거부해서 사본을 만들 수 없는 절은, 수집된 그대로 읽지 않고 위 네 가지 검사에서 뺍니다. 규칙이 바로 그 검사가 찾는 내용을 바꿨을 수 있기 때문이며, 해석기가 거부하는 경우는 빌드가 스스로 실패합니다. 사본은 몇 가지 검사와 연쇄가 읽든 검사 한 번에 한 번만 컴파일합니다.

`unportable-embed-component`의 문구는 라이브러리의 호스트에 따라 다릅니다. `next`, `docusaurus`, `nextra`에서는 호스트가 접합된 자리에서 복사본을 렌더링하고 독립 내보내기만 렌더러가 필요하다고 말하고, 그 밖의 호스트에서는 둘 다 렌더링할 수 없다고 말합니다.

`imported-embed-component`는 복사되는 컴포넌트 이름(`.` 앞부분)을 `target.imports`와 `doc.imports`에 대조합니다. 원본 문서가 자기 파일에서 import하고 임베드하는 문서는 import하지 않는 이름을 오류로 보고하는데, 내보내기가 `mdxjsEsm`을 버리므로 접합된 복사본이 그 이름의 바인딩이 없는 모듈에 놓이기 때문입니다. `render: section` 임베드에서만, `unportable-embed-component` 뒤에 보고합니다.

`collectAnchors(tree: Root)`는 모든 제목 앵커와, `<a id="legacy"></a>`처럼 raw HTML의 요소가 선언하는 모든 id에 대해 `{ id, explicit }`를 반환합니다. HTML id는 작성자가 쓴 것이므로 명시적인 앵커로 셉니다. 제목의 `explicit`는 `data.cudoc.explicitId`를 반영하며, 작성자가 쓴 앵커와 슬러거가 만든 앵커를 가르는 값이자 `unstable-anchor-link`가 판단 기준으로 삼는 값입니다. 이 경고는 `-<숫자>`로 끝나는 생성 앵커로 가는 링크에서, 접미사를 뗀 id가 같은 문서에 함께 있을 때에만 발생합니다. `#overview` 옆의 `#overview-1`은 같은 제목의 제목이 하나 더 끼어들면 옮겨 가는 슬러거의 구분 접미사이지만, 제목 글자 자체가 `version-2`를 만드는 `## Version 2`는 문제 삼지 않습니다. `duplicate-anchor`는 제목 id만 비교합니다.

## 데이터셋

소스·import: [node/dataset.ts](../../packages/cudoc/src/node/dataset.ts), `@cudoment/cudoc/node/dataset`.

`generateDataset(options: DatasetOptions)`는 동기적으로 필터링한 AST를 출력하고 `{ schemaVersion: "1.0.0", documentCount, documents }`를 반환합니다.

`DatasetOptions`는 `ProjectionOptions`에 필수 `inputDir`, `outDir`, 선택적 `library`, `documents`, `scopes`, 기본 `custom`인 `projectionId`, 기본 true인 `requireVersion`을 추가합니다. 입력은 AST JSON 디렉터리이며 보통 `.cudoc/documents/documents`입니다. `inputDir` 맨 위의 `manifest.json`, `meta.json`은 건너뛰며, 하위 디렉터리에 있는 같은 이름의 문서는 다른 문서와 똑같이 다룹니다. 문서 ID는 확장자 없는 정확한 상대 경로입니다. `library`는 그 AST가 나온 수집 라이브러리 디렉터리입니다. 그 manifest의 루트 기준 경로가 문서의 scope 조각이 어디서 시작하는지를 정하는데, ID에 접두어로 맞는 가장 긴 기준 경로 다음의 첫 조각이 scope이므로 기준 경로가 `docs`, `terms`일 때 `docs/ko/guide`와 `terms/ko/token`은 모두 scope `ko`에 속합니다. 또한 그 라이브러리의 비공개 문서는 제외되며 `documents`로 비공개 문서를 요청하면 오류입니다. `library`가 없으면 scope는 첫 경로 조각이고 비공개 문서는 없습니다. `scopeOf(id, bases)`를 export합니다. 명시한 ID가 없으면 오류입니다. 생성기는 저장된 AST를 필터링하며 아무것도 해석하지 않습니다. `cudoc-embed` 블록은 수집된 모습 그대로 `code` 노드로 남으므로, 임베드한 절은 데이터셋에서 그 절을 가진 문서에만 들어 있습니다.

출력은 `documents/<id>.json`과 `manifest.json`입니다. manifest에는 스키마 `"1.0.0"`, 필터링 ID·옵션, 문서 수, scope, `{ id, hash, outputHash }`가 있습니다. `hash`는 UTF-8로 읽은 입력 파일, `outputHash`는 직렬화한 출력 AST를 대상으로 합니다. 입력과 출력을 검증하며 파일별 오류는 원인을 보존하고 출력을 중단합니다. 필터링 의미는 [projectAst](./document.ko.md#필터링)를 참고하세요.

## 저장

소스·import: [storage.ts](../../packages/cudoc/src/node/storage.ts), `@cudoment/cudoc/node/storage`.

| 함수                                              | 동작                                                                                                                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hash(value)`                                     | 문자열의 SHA-256 hex                                                                                                                                                                   |
| `posix(value)`                                    | 플랫폼 경로 구분자를 `/`로 변환                                                                                                                                                        |
| `contained(root, target)`                         | 루트 자체를 포함한 경로 포함 여부                                                                                                                                                      |
| `realPath(target)`                                | 존재하는 조상의 실제 경로에 없는 부분을 연결                                                                                                                                           |
| `safePath(root, relative)`                        | 포함된 하위 경로로 해석; 이탈·루트 자체 거부                                                                                                                                           |
| `sourceFiles(root, extensions?, { exclude? })`    | 정렬된 재귀 절대 경로; 기본 `.md`, `.mdx`; 숨김 항목·node_modules 제외; 디렉터리에 들어가거나 파일을 넣기 전에 `exclude(상대 POSIX 경로)`에 물음; 실제로 만난 소스 트리 symlink는 거부 |
| `writeJson(file, value)`                          | 부모 디렉터리 생성 후 compact JSON 작성; 자체 트랜잭션 없음                                                                                                                            |
| `publishDirectory(inputRoots, outputRoot, build)` | 잠금·임시 생성 후 소유한 출력 디렉터리 교체. `inputRoots`는 디렉터리 하나 또는 목록이며 어느 것도 출력과 겹칠 수 없음. `build`가 프로미스를 반환하면 이 함수도 프로미스를 반환         |

입출력 중첩과 symlink 출력을 거부합니다. **기존 출력은 빈 디렉터리도 `.cudoc-output`에 `cudoc\n`을 갖고 있어야 합니다.** 처음에는 존재하지 않는 출력 경로를 사용합니다. 잠금 `<output>.lock`은 쓰는 프로세스의 id를 담으며, id를 먼저 적은 파일을 링크로 들여놓기 때문에 비어 있는 상태로 읽히는 일이 없습니다. 콜백에는 임시 경로를 전달합니다. 잠금을 가진 프로세스가 아직 실행 중이면 `cudoc: <output> is being written by process <pid>; wait for it to finish` 오류입니다. 그 밖의 잠금은 강제로 종료된 빌드가 남긴 것입니다. 이 잠금은 이름을 바꿔서 가져오고, 다른 무엇보다 먼저 잠금을 다시 잡습니다. 옮겨 온 파일에 실행 중인 프로세스의 id가 있으면 되돌려 놓고 그 빌드를 보고하며, 오래된 잠금을 다른 프로세스가 먼저 가져갔으면 잠금을 다시 시도합니다. 강제로 종료된 빌드가 남긴 것은 잠금을 쥔 프로세스가 복구합니다. 실행 중인 빌드의 디렉터리는 그 빌드가 잠금을 쥐고 있는 동안에만 존재하기 때문이며, 종료된 id를 읽고 나서 잠금의 이름을 바꾸기까지의 짧은 순간만이 세 번째 프로세스가 끼어들 수 있는 유일한 틈입니다. 복구는 게시 과정이 붙이는 이름, 즉 백업의 `<output>.previous-<uuid>`와 임시 디렉터리의 `<output>.cudoc-staging-` 뒤 영문자나 숫자 여섯 개만 살피고, 그중에서도 `.cudoc-output`의 내용이 정확히 `cudoc\n`인 실제 디렉터리만 다룹니다. 기존 출력이 통과해야 하는 검사와 같은 기준입니다. 이런 백업은 출력 자체가 없으면 제자리로 옮기고 있으면 삭제하며, 이런 임시 디렉터리는 삭제합니다. 다른 이름의 디렉터리, 소유 표시의 내용이 다른 디렉터리와 심볼릭 링크는 그대로 둡니다. 소유한 디렉터리는 소유 표시를 마지막에 지우므로, 삭제가 중간에 멈춰도 남은 디렉터리를 다음 복구가 마저 지웁니다. 옮기거나 지울 수 없는 잔여물이 있으면 게시가 실패하고 잠금을 풉니다. 복구하지 않는 잔여물은 두 가지입니다. 소유 표시를 쓰기 전에 강제로 종료된 빌드의 임시 디렉터리, 그리고 잠금을 잡는 도중에 종료된 빌드가 남긴 잠금용 임시 파일 `<output>.lock.<pid>-<uuid>`와 `<output>.lock.stale-<pid>-<uuid>`입니다. 이것들에는 출력 내용이 없으므로 지워도 됩니다. 임시 디렉터리를 만들지 못하면 잠금을 다시 풉니다.

콜백은 동기와 비동기 어느 쪽이든 됩니다. `publishDirectory`는 `build`가 반환한 값을 확인해서, thenable이면 그것이 완료될 때까지 교체를 미루고 자신도 프로미스를 반환하며, 그 밖의 값이면 즉시 교체하고 아무것도 반환하지 않습니다. 오버로드 시그니처는 편의를 위한 것이며 실제 판단은 이 런타임 검사가 합니다. 생성 실패 시 기존 출력을 유지하고 최종 rename 실패 시 복원합니다. 잠금은 트랜잭션 전체에 걸쳐 유지하므로, 비동기 생성이 진행되는 동안 같은 출력으로 발행을 다시 시도하면 실패합니다. 생성 도중 프로세스가 강제로 종료되면 같은 출력으로 다음 발행이 이를 복구할 때까지 잠금 파일과 임시 디렉터리가 남는데, 비동기 생성은 그 구간을 길게 만들 뿐 새로운 실패 방식을 더하지는 않습니다. 이 도우미는 생성물 보호용이며 임의 컴파일러·렌더러 콜백을 격리하는 sandbox가 아닙니다.

## 개별 AST 스냅샷

소스: [export-ast.ts](../../packages/cudoc/src/node/export-ast.ts), [load-ast-file.ts](../../packages/cudoc/src/node/load-ast-file.ts), [paths.ts](../../packages/cudoc/src/node/paths.ts).

이 공개 기본 함수는 AST 파일을 개별 처리합니다. 라이브러리 manifest, 원문 스냅샷, 준비된 코드 블록 임베드를 만들지 않습니다. 사용 가이드는 라이브러리 흐름을 기준으로 합니다.

- `/embed` 또는 `/node/export-ast`의 기본 export인 `exportAst(options?)`는 설치한 remark 위치의 스냅샷을 저장합니다. 렌더링 트리는 유지하며 파일별로 원자적으로 작성합니다.
- `resolveExportAstOptions(options?) → ExportAstContext`, `projectTree(node, context) → unknown`, `buildExportedAst(tree, context) → object`는 디스크 쓰기 없이 export 준비를 제공합니다.
- Export 기본값: 입력 `docs`, 출력 `.cudoc/ast`, 확장자 `.md`/`.mdx`, 제거 속성 `position`/`estree`, 제거 노드 `mdxjsEsm`, 버전 `cudocAstVersion: 1`, 검증 true. 사용자 `version`, `tableCellElement`, `write(filePath, contents)`, 경로 옵션도 지원합니다.
- `/embed`의 `loadAst(documentPath, options?)`는 출력 디렉터리 안의 확장자 없는 상대 ID를 읽습니다. `../../secrets`처럼 그 밖으로 나가는 경로는 읽지 않고 `cudoc: path escapes document root` 오류를 냅니다. `/node/load-ast-file`의 `loadAstFile(filePath, options?)`는 알려진 파일을 직접 읽습니다. 기본적으로 검증하고 `ExportedCudocAstRoot`를 반환합니다. 읽기 옵션은 `version`, `validate`, `tableCellElement`이며 `loadAst`는 경로 옵션도 받습니다.
- `/node/paths`는 `resolvePathOptions`, `getRelativeOutputPath`, `getOutputPath`, `DEFAULT_SOURCE_ROOT`, `DEFAULT_OUTPUT_ROOT`, `DEFAULT_EXTENSIONS`를 제공합니다. `PathOptions`는 `{ sourceRoot?, outDir?, extensions?, cwd? }`이며 출력 매핑은 범위 밖·확장자 불일치 경로에 `null`을 반환합니다.

서버 번들의 경로를 알고 있다면 `loadAstFile`을 사용합니다. 런타임이 JSON을 읽으면 배포물에 해당 파일을 포함해야 합니다. `/embed`는 개별 export·읽기·경로 함수와 하위 쿼리를 재수출하며 이 페이지 앞의 API를 재수출하지 않습니다.

## CLI

소스: [cli.ts](../../packages/cudoc/src/node/cli.ts)이며, [command.ts](../../packages/cudoc/src/node/command.ts)를 실행합니다.

```sh
cudoc collect --config cudoc.config.mjs [--watch]
cudoc check --config cudoc.config.mjs [--format text|json] [--strict]
cudoc dataset --config dataset.config.json
```

위 세 명령과 `--config <path>` 인자 형태만 지원합니다. 다른 명령, 값이 빠진 `--config`, `text`나 `json`이 아닌 `--format`은 `Usage: cudoc <collect|check|dataset> --config config.mjs [--watch] [--format text|json] [--strict]`를 출력하고 종료 코드 1로 끝나며, 그 밖의 인자는 무시합니다. ESM은 설정 객체를 기본 export하고 `.json`은 직접 파싱합니다. 설정 안의 경로는 설정 파일 위치가 아닌 명령 실행 디렉터리 기준입니다. 오류는 stderr에 출력하며 종료 코드를 1로 설정합니다. 사용법 줄과 메시지가 `cudoc`과 콜론으로 시작하는 오류는 메시지와, 감싼 원인마다 `caused by:` 한 줄을 출력하고, 그 밖의 오류는 스택과 함께 출력합니다.

`collect`는 [`collectDocuments`](#감시) 한 회차를 실행합니다. 수집과 준비를 `outDir`에 함께 출력하므로, 실패한 실행은 이전 라이브러리와 그 `embeds.json`을 그대로 남기고, 준비할 수 없는 임베드는 한 메시지에 함께 나열됩니다([`prepareEmbeds`](#준비된-임베드) 참고). 컴파일러는 동기·비동기 모두 가능합니다. 성공하면 `{ documentCount, outDir }`를 JSON으로 출력합니다. `collect --watch`는 같은 설정으로 [`watchDocuments`](#감시)를 실행하고 종료하지 않습니다. 첫 회차는 `outDir`에 이미 있는 것에서 이어 가고, 회차마다 JSON 한 줄(`documentCount`, 컴파일한 id 목록 `compiled`, `reused`, `blocks`, `reusedBlocks`, `outDir`, `elapsed`)을 출력하며, 실패한 회차는 오류를 출력하고 마지막 성공 출력을 그대로 둡니다. 플래그가 없는 `collect`는 항상 전체 빌드입니다.

`check`는 마지막 수집이 `outDir`(기본 `.cudoc/documents`)에 출력한 라이브러리를 `loadLibrary`로 읽고, 같은 설정 파일의 선택적 `check` 키(`ignore`, `assetDirs`, `externalPaths`, `sourceRoot` 또는 `roots`)로 [참조 검사](#참조-검사)를 실행합니다. 수집하거나 쓰는 것이 없으므로 컴파일러가 필요하지 않으며, 컴파일하는 Markdown은 `replace` 규칙이 다시 쓴 임베드 사본뿐이고 이는 독립 컴파일러가 읽습니다. 수집기가 별도 스크립트인 호스트는 같은 `outDir`를 가리키는 설정을 `check`에 줍니다. 설정 최상위의 `roots` 또는 `sourceRoot`는 `loadLibrary`에 전달되므로 라이브러리를 수집할 때의 기준 경로와 같아야 합니다. 이 값은 문서가 디스크의 어디에 있는지 알려 주며, 최상위에도 `check` 아래에도 없으면 경로는 수집된 문서에 대해서만 확인합니다. 파일이 없는 이미지와, 문서도 파일도 가리키지 않는 링크는 보고하지 않습니다. 수집된 라이브러리가 없으면 `cudoc: no collected library in <outDir>; collect documents before checking them` 오류입니다. 기본값인 `--format text`는 `formatCheckResult`가 렌더링한 결과를, `--format json`은 결과 전체를 출력합니다. 오류가 하나라도 보고되면, 또는 `--strict`를 주었을 때 무엇이든 보고되면 종료 코드가 1입니다.

`dataset`은 설정을 그대로 `generateDataset`에 넘기므로, 그 안의 `library`가 scope와 비공개 문서를 읽어 올 수집 라이브러리를 가리키며, JSON 요약을 출력합니다. 내보내기 CLI는 [어댑터](./adapters.ko.md#내보내기)에 설명합니다.
