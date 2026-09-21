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

모든 루트에서 `.md`와 `.mdx`를 재귀적으로 수집하며 숨김 항목과 `node_modules`는 건너뛰고 symlink는 거부합니다. 루트의 `base`는 양쪽 `/`를 떼어 정규화하며, 여러 조각(`docs/v2`)이어도 되고 비어 있어도 되지만 `.`, `..`, `?`, `#`은 들어갈 수 없습니다. 두 루트가 같은 기준 경로를 가질 수 있고 한 기준 경로가 다른 것을 확장할 수도 있으나(`docs`와 `docs/api`), 같은 디렉터리를 두 번 나열할 수는 없습니다. 이 해석을 `resolveRoots`가 수행하며 모든 소비자가 이 함수를 호출합니다.

문서의 **라이브러리 경로**는 루트의 기준 경로 뒤에 그 루트 디렉터리 기준 POSIX 경로를 이은 값이고, ID는 라이브러리 경로에서 확장자를 뗀 값입니다. `{ dir: "content", base: "docs" }`로 수집한 `content/ko/guide.md`는 `docs/ko/guide.md`와 `docs/ko/guide`가 됩니다. `sourceRoot`를 쓰면 기준 경로가 비어 있어 ID는 이전과 같습니다. `StoredDocument.sourcePath`가 라이브러리 경로입니다. 문서를 이름 짓는 모든 것(링크, 임베드 `sources`, 검사기, 내보내기, `exclude`·`private` 패턴)이 라이브러리 경로를 좌표계로 쓰므로, 루트 상대 링크 `/terms/token.md`는 어느 디렉터리에서 읽었든 문서 `terms/token`을 가리키고, 상대 링크도 라이브러리 좌표에서 해석됩니다. 즉 기준 경로가 디렉터리 이름과 같을 때에만 한 루트에서 다른 루트로 건너가고, 그렇지 않으면 누락으로 보고됩니다. `documentIdOf`와 `libraryPathOf`는 파일을 그 좌표로 옮기며 파일을 담는 가장 안쪽 루트를 씁니다. `sourceFileOf`는 라이브러리 경로를 파일로 되돌리며, 기준 경로가 가장 길게 맞는 루트부터 시도하고 실제로 존재하는 파일을 우선합니다. 루트 전체에 걸친 확장자·대소문자 충돌은 두 파일을 함께 알리는 오류입니다. 기본 URL은 연결 `/`를 맞춘 `routeBase + id + routeSuffix`이므로 기준 경로가 URL 접두어가 됩니다. 재정의 경로는 고유해야 하며 `/`로 시작하되 `//`로 시작하지 않고 `?`, `#`이 없는 루트 상대 pathname이어야 합니다. frontmatter slug는 자동으로 추론하지 않습니다.

글롭 패턴은 라이브러리 경로에 대조하며 문법은 작습니다. 조각 안의 `*`와 `?`, 조각 수에 상관없는 `**`, 그리고 `/`가 없는 패턴은 어디에 있든 파일·디렉터리 이름에 맞습니다. 끝의 `/**`는 그 디렉터리 자체에도 맞으므로 제외된 디렉터리에는 들어가지 않고 그 안의 symlink도 보지 않습니다. 중괄호 집합, 문자 클래스, 부정은 없으며, 빈 패턴이나 `..`이 든 패턴은 오류입니다. `exclude`는 무엇이 문서인지를 정하고, `private`는 수집·검사·임베드는 되지만 라이브러리와 manifest에 `private: true`가 붙는 문서를 표시하며 `cudoc-export`와 `generateDataset`이 그 표시를 읽습니다.

컴파일러를 생략할 수 있는 호스트는 `markdown`, `html`, `next`, 호스트 미지정입니다. 나머지 프로필은 콜백이 필요합니다. 추가 플러그인을 사용하는 Next.js도 동등한 결과를 위해 같은 콜백이 필요합니다.

```ts
type DocumentCompiler = (
  source: string,
  context: { id: string; filePath: string; options: DocumentOptions },
) => CompiledDocument
// AsyncDocumentCompiler는 인자가 같고 Promise<CompiledDocument>를 반환합니다.
```

`filePath`는 절대 경로이며 `options.format`은 파일별로 결정합니다. export가 위치를 제거하기 전의 위치 정보가 있는 트리를 반환해야 합니다. 수집기는 반환된 진단을 상대 파일·행과 함께 stderr에 출력합니다. 원문 범위를 저장하고 export 검증·버전 표기를 거쳐 라이브러리를 출력합니다. 비동기 수집기는 출력 전에 각 파일을 컴파일하고 치환을 위해 비동기 컴파일러를 보관합니다.

`previous`를 주면 설정 해시가 같고 라이브러리 경로가 같고 원문의 해시가 저장된 해시와 같은 문서를 그 라이브러리에서 트리, 스냅샷, frontmatter, `private`, `imports`까지 그대로 가져옵니다. 나머지는 평소처럼 컴파일하고, 디스크에서 사라진 문서는 빠지며, 출력 디렉터리는 어느 경우에나 완전합니다. 재사용한 문서의 진단은 다시 출력하지 않습니다. 결과에는 양쪽 문서 id를 담은 `incremental: { compiled, reused }`가 붙습니다. 옵션, 라우팅, 루트, 패턴, 추출기 버전, `compilerId` 같은 설정이 바뀌면 아무것도 재사용하지 않는데, 호스트를 올렸을 때 `compilerId`를 바꿔야 하는 이유도 여기에 있습니다. 해시는 컴파일러가 무엇을 하는지 볼 수 없습니다.

`Library`는 `documents: StoredDocument[]`, `options`, `configuration`(해시), `bases: string[]`(수집 당시 루트들의 기준 경로, 맨 위 루트 하나면 `[""]`), 선택적 런타임 `roots: ResolvedRoot[]`(절대 `dir`, 정규화한 `base`), `compiler`, `asyncCompiler`를 가집니다. `StoredDocument`는 `id`, `sourcePath`, `route`, `tree`, `source: SourceSnapshot`, `frontmatter`를 가지며, `private` 패턴에 맞은 문서에는 `private: true`가, 무엇이든 import하는 문서에는 `imports: string[]`이 붙습니다. `imports`는 그 문서의 `import` 문이 묶는 지역 이름이며, 내보내기가 `mdxjsEsm` 노드를 버리기 전에 컴파일러의 estree에서 읽습니다(`CompiledDocument.imports`, `@cudoment/cudoc/mdx`의 `importedNames(tree)`가 계산하며 `/markdown`도 재수출). 호스트 캡처도 같은 값을 기록하며, `.mdx` 파일에서는 `importedNamesFromSource(source)`로 원문도 훑습니다. 펜스 코드 밖의 최상위 `import` 문을 모듈로 파싱하는데, Nextra처럼 캡처가 보기 전에 ESM을 트리 밖으로 끌어올리는 호스트가 있기 때문입니다. 컴파일러 함수와 절대 루트 디렉터리는 직렬화하지 않고, manifest에는 각 루트의 `base`만 기록합니다.

`loadLibrary`의 기본 경로는 `.cudoc/documents`이며 manifest 버전, AST 계약, 저장 해시를 검증해 라이브러리를 복원합니다. 현재 소스 파일이나 컴파일러 설정과 비교하지는 않습니다. 최신화하려면 다시 수집합니다. 문서가 디스크의 어디에 있는지 복원하려면 `roots`를 전달합니다. 단일 루트 축약형이면 디렉터리 하나, 아니면 수집에 쓴 것과 같은 `{ dir, base }` 목록이며, 치환 컴파일과 자산 해석이 이 정보를 필요로 합니다. 전달한 기준 경로는 manifest에 기록된 것과 같아야 하는데 ID가 거기서 파생되었기 때문이며, 다르면 기록된 기준 경로를 알리는 오류가 납니다. 치환에는 원래 동기 컴파일러를 전달하거나 `library.asyncCompiler`에 원래 콜백을 연결하고 비동기 API를 사용합니다. 준비된 임베드만 소비하는 라이브러리는 컴파일러가 필요하지 않습니다. `{ cache: true }`를 주면 해석한 `outDir`별로 불러온 문서를 메모리에 유지하고, `manifest.json`이 바이트 단위로 같은 동안 같은 `documents` 배열을 반환합니다. 재수집은 항상 manifest를 바꾸므로 그때 새로 읽으며, 전달한 `roots`는 호출마다 기록된 기준 경로와 대조합니다. 옵션이 없으면 호출마다 파일을 다시 읽습니다. 요청마다 라이브러리를 불러오는 서버(임베드를 렌더링하는 라우트 핸들러, 검색 엔드포인트)는 캐시 형태를 쓰고, 한 번만 실행되는 빌드 단계에는 필요하지 않습니다.

## 라이브러리 파일

```text
.cudoc/documents/
  .cudoc-output
  manifest.json
  documents/<id>.json
  sources/<id>.json
  embeds.json              # prepareEmbeds가 추가
```

| 파일                  | 계약                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `manifest.json`       | `schemaVersion: 2`, 설정 해시, 문서 옵션, 선택적 컴파일러 ID, `roots: [{ base }]`, 문서별 메타데이터·해시 |
| `documents/<id>.json` | 버전 있는 mdast 루트; `data.cudocAstVersion: 1`; `position`/`estree` 속성과 `mdxjsEsm` 노드 제거          |
| `sources/<id>.json`   | 원문, SHA-256 해시, 형식, 섹션 offset                                                                     |
| `embeds.json`         | `schemaVersion: 2`; 준비된 임베드 AST 블록, 블록마다 읽은 문서 목록, 최신 상태 확인용 메타데이터          |

manifest 문서 항목은 `id`, `sourcePath`, `route`, `frontmatter`, `hash`, `astHash`, `snapshotHash`이고, 비공개 문서에는 `private: true`가, 무엇이든 import하는 문서에는 그 `import` 문이 묶는 지역 이름 목록 `imports`가 있습니다. AST·스냅샷 해시는 객체의 `JSON.stringify`, 원문 해시는 원본 텍스트를 대상으로 합니다. `configuration`은 옵션, 경로, 루트 기준 경로, `exclude`·`private` 패턴, 컴파일러 식별자를 해시하므로 이 중 무엇이든 바뀌면 준비된 임베드가 무효가 됩니다. `LIBRARY_SCHEMA_VERSION`이 현재 버전을 export하며 다른 버전의 manifest는 "incompatible document manifest" 오류로 거부합니다. 공개 함수로 생성하고 파일을 직접 수정하지 않습니다.

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

offset은 JavaScript 문자열 인덱스입니다. `start`는 제목 시작, `end`는 다음 동급·상위 제목 또는 문서 경계, `ownEnd`는 하위 제목 직전입니다. dependency 범위는 원문의 정의 위치입니다. 이 범위로 저장 AST의 position이 제거된 뒤에도 원본 Markdown을 치환합니다.

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
type EmbedSpec = {
  sources: string[]
  select?: SectionSelection
  render?: "section" | { type: "table"; columns?: TableColumn[] }
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
  extract(row: EmbedRow, context: { library: Library; documentId: string; column: TableColumn }):
    string | ExtractedCell | undefined
}

parseEmbedSpec(value: string): EmbedSpec
resolveDocumentReference(library: Library, reference: string, from: string): {
  document: StoredDocument; anchor?: string
}
resolveEmbed(library: Library, spec: EmbedSpec, context: EmbedContext): Root
resolveDocumentEmbeds(library: Library, documentId: string): Root
buildEmbedRow(document: StoredDocument, anchorId: string | undefined, tree: Root): EmbedRow
extractCell(library: Library, column: TableColumn, row: EmbedRow, context: EmbedContext): {
  cell: ExtractedCell; problem?: string
}
buildEmbedTable(library: Library, columns: TableColumn[], rows: EmbedRow[], context: EmbedContext): Root
// 비동기 버전은 Promise<Root>를 반환합니다.
// resolveEmbedAsync(library, spec, context)
// resolveDocumentEmbedsAsync(library, documentId)
```

`parseEmbedSpec`은 YAML을 읽고 최상위 키와 선택 조건 키, 치환 규칙 키, 소스 목록, 출력 형식을 검증합니다. 모르는 키는 세 계층 모두에서 거부하며 메시지에 알려진 키 목록을 함께 보여 줍니다. `regex: true` 없이 쓴 `flags`는 조용히 무시하지 않고 오류로 처리합니다. `parseEmbedBlock(value, documentId, number?)`은 이 함수를 감싸서, 실패했을 때 문서와 블록 번호를, 파서 오류라면 줄과 열까지 함께 알려 줍니다. `sources`는 비어 있으면 안 됩니다. 기본 출력은 `section`, 표 기본 열은 `DEFAULT_TABLE_COLUMNS`인 title/link/summary입니다. 표 열은 축약 이름 또는 키마다 검증하는 매핑입니다. `value`는 필수이며 세 이름 중 하나, 셀 좌표 매핑(`row`·`column`은 음이 아닌 정수, 선택적 `table` 인덱스와 문자열 `skipTablesWithHeaders`), 또는 단독 `{ extractor }`입니다. `link`는 `section`, `parent`, `document` 중 하나이고 `minWidth`는 숫자와 `px`, `rem`, `em`, `ch`, `%` 중 한 단위로 된 CSS 길이입니다. `render`에는 `type`과 `columns` 외의 키를 쓸 수 없습니다. 선택 동작은 [문서 쿼리](./document.ko.md#섹션과-쿼리)에 정의되어 있습니다.

표 출력은 선택된 절마다 `buildEmbedRow`로 `EmbedRow` 하나를 만들며, id를 재기준화하기 전에 읽으므로 셀의 링크가 복사본이 아닌 원본 문서를 가리킵니다. `section.title`은 제목의 보이는 글자(문서 전체면 문서 제목), `parent`는 원본 트리에서 그 절 위에 있는 가장 가까운 더 얕은 제목, `url`은 문서 경로에 앵커를 붙인 값입니다. `extractCell`은 열 하나를 글자와 선택적 링크로 바꿉니다. `title`, `summary`(절의 직접 자식 중 첫 문단의 일반 텍스트), `parent`, 표 셀(절 안의 표를 문서 순서로 세되 머리 행에 `skipTablesWithHeaders`의 이름이 있는 표는 제외, `row` 0은 머리 행, 글자는 `nodeText`), 또는 추출기의 반환값입니다. 열의 `link`는 절의 `url`, 상위 제목의 주소(앵커가 있으면 앵커, 없으면 문서 경로), 문서 경로로 해석되며 추출기가 돌려준 `url`은 링크가 없을 때 쓰입니다. 값이 없으면(문단 없음, 상위 제목 없음, 표·행·셀 부족, 추출기가 `undefined`나 `""`를 반환) `cell.text`는 `""`이고 `problem`이 무엇을 기대했고 절에 무엇이 있는지 적습니다. `buildEmbedTable`은 `minWidth`를 지정한 열의 머리 셀에 `data.hProperties.style`로 `min-width: <minWidth>`를 쓰고 `EmbedRow`마다 행 하나를 씁니다. 라이브러리에 없는 추출기를 부르는 `{ extractor }` 열은 예외를 던집니다.

추출기는 `BuildDocumentsOptions.extractors`, 즉 이름에서 `{ version, extract }`로 가는 맵에서 옵니다. `version`은 비어 있지 않은 문자열이어야 하며 이름순으로 정렬한 `{ 이름: version }`으로 설정 해시에 들어가므로, 추출기가 바뀌면 컴파일러가 바뀔 때처럼 다시 수집합니다. 함수는 런타임의 `Library.extractors`에만 있고 직렬화되지 않으며, 불러온 라이브러리에는 없습니다. 준비된 임베드에는 문제가 없고, `{ extractor }` 열을 새로 해석할 때에만 오류가 됩니다.

참조는 `context.documentId`의 상대 경로이며 `/`로 시작하면 문서 루트 기준입니다. `.md`/`.mdx`, `#anchor`를 지원합니다. URL, 역슬래시 경로, 루트 이탈, 없는 문서는 오류입니다. 앵커와 선택 조건이 모두 없으면 문서 전체를 사용합니다.

소스 AST를 복제합니다. 치환이 있으면 원본의 선택 범위를 읽고 규칙을 순서대로 적용한 뒤 기존 컴파일러·옵션으로 다시 컴파일합니다. 일반 치환은 split/join으로 전체 일치를 바꾸고, 정규식은 JavaScript `RegExp`를 사용하며 기본 플래그는 `g`입니다. 선택 범위 밖의 정의는 바꾸지 않고 추가합니다. 원본 소스와 AST는 수정하지 않습니다. 비동기 API는 처리별 컴파일 캐시를 통해 비동기 컴파일러를 사용합니다. 반환된 루트에는 렌더러가 각주 레이블을 구분하는 데 쓰는 `data.cudocEmbedPrefix`와 `data.cudocDependencies`가 있습니다. 후자는 해석이 읽은 모든 문서의 id를 정렬한 목록으로, 펜스의 sources와 그 안에 중첩된 임베드의 sources를 포함하며, `{ extractor }` 열이 실행되었으면 추출기가 어떤 문서든 읽을 수 있으므로 `"*"`가 더해집니다.

ID·각주·정의를 구분하고 링크·이미지·지원하는 raw HTML 속성 경로를 조정합니다. 누락된 섹션, 순환 의존성, 처리할 수 없는 치환, 64를 초과한 깊이는 문맥을 포함한 오류입니다. 독립적인 `resolveEmbed` 결과를 합칠 때는 서로 다른 `prefix`를 사용합니다. 전체 문서·준비 API는 블록 번호를 직접 관리합니다.

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

## 준비된 임베드

소스·import: [prepare-embeds.ts](../../packages/cudoc/src/node/prepare-embeds.ts), `@cudoment/cudoc/node/prepare-embeds`.

```ts
prepareEmbeds(library: Library, outDir?: string, options?: { previous?: PreparedEmbeds }): Promise<PreparedEmbeds>
readPreparedEmbeds(outDir: string, documentId: string, source: string): PreparedEmbeds
embedKey(documentId: string, value: string, index: number): string
```

`prepareEmbeds`는 전체 수집 문서의 코드 블록 임베드를 비동기로 처리하고 `embeds.json`을 원자적으로 교체합니다. 기본 `outDir`는 `.cudoc/documents`이며 **라이브러리에서 추론하지 않습니다**. 사용자 수집 경로는 명시적으로 전달합니다.

`PreparedEmbeds`는 `schemaVersion: 2`, `configuration`, `sourceHashes: Record<string,string>`, `blocks: Record<string,Root>`, 그리고 같은 키 아래에 각 블록의 `cudocDependencies`를 담은 `dependencies: Record<string,string[]>`를 가집니다. 키는 `documentId:index:sha256(fenceValue)`이며 블록 번호는 1부터입니다. `readPreparedEmbeds`는 스키마, manifest 설정, 현재 문서 소스 해시, manifest 문서 해시를 검사합니다. 없거나 오래된 데이터는 재수집을 안내하는 오류이며, 이전 버전이 쓴 파일도 오래된 데이터입니다.

`previous`를 주면 네 조건이 모두 맞는 블록을 해석하지 않고 그 결과에서 가져옵니다. 설정이 같고, 문서 id 집합이 같고(문서가 추가되거나 삭제되면 어느 블록 안의 링크든 해석 결과가 바뀔 수 있습니다), 임베드하는 문서의 해시가 같고, 블록의 `dependencies`에 있는 모든 id의 해시가 그대로일 때입니다. `dependencies`에 `"*"`가 있는 블록은 항상 다시 해석합니다. 기록되는 파일은 어느 경우에나 완전하며 절약되는 것은 작업량입니다.

수집은 라이브러리 디렉터리를 출력하고 준비는 이후 파일을 출력합니다. 두 출력은 별도 경계입니다. 수집 성공 후 준비가 실패하면 호스트 빌드 전에 준비·수집을 다시 실행합니다. 여러 단계 전체가 하나의 트랜잭션으로 롤백된다고 가정하지 않습니다.

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

`collectDocuments`는 CLI `collect`가 하는 일의 한 회차입니다. 설정에 `compiler`가 있으면 비동기 수집기로(반환값은 promise여도 값이어도 됩니다), 없으면 동기 수집기로 라이브러리를 만들고 `outDir`에 임베드를 준비하며, 두 단계에 `previous.library`와 `previous.prepared`를 넘겨 바뀌지 않은 문서와 영향 없는 블록을 재사용합니다. 회차 결과는 컴파일한 문서 id(전체 회차에서는 모든 id), 재사용한 문서와 블록의 수, 소요 시간을 담습니다. `previousCollection(outDir)`은 끝난 실행이 `outDir`에 남긴 것을 불러옵니다. 라이브러리는 `loadLibrary`로, 준비 결과는 스키마가 현재 것일 때 읽고, 없거나 읽을 수 없거나 호환되지 않으면 `{}`를 반환하므로 새 프로세스가 지난 실행에서 이어 갑니다.

`watchDocuments`는 한 회차를 실행한 뒤, 어느 루트 아래에서든 `.md`·`.mdx` 파일이 생기거나 바뀌거나 이름이 바뀌거나 삭제되면 `debounce` 밀리초(기본 150)의 정지 후 다시 실행합니다. 각 루트 디렉터리에 `fs.watch`를 재귀로 겁니다. 회차 도중의 변경은 한 회차를 더 예약합니다. 실패한 회차(컴파일되지 않는 문서, 원본이 없는 임베드)는 `onError`로 가고, 마지막 성공 회차의 상태를 다음 회차에 그대로 쓰며 감시는 계속됩니다. 이때 수집은 이미 출력되었는데 준비가 실패해 둘이 맞지 않을 수 있고, 그러면 `collect`가 실패했을 때와 마찬가지로 다음 성공 회차까지 호스트의 `embeds.json` 읽기가 오래된 데이터 오류를 냅니다. `reuseOutput: false`가 아니면 첫 회차는 `previousCollection(outDir)`에서 시작합니다. `ready`는 첫 회차가 끝나면 확정되고 `close()`는 감시를 멈춥니다.

## 참조 검사

소스와 import: [node/check.ts](../../packages/cudoc/src/node/check.ts), `@cudoment/cudoc/node/check`, 그리고 [node/report.ts](../../packages/cudoc/src/node/report.ts), `@cudoment/cudoc/node/report`.

`checkReferences(library: Library, options?: CheckOptions): CheckResult`는 모든 문서를 훑어 `{ issues, documentCount, checkedReferences }`를 반환합니다. 읽기만 하며 아무것도 쓰지 않고 라이브러리도 바꾸지 않습니다.

`ReferenceIssue`는 `code`, `severity`(`"error"` 또는 `"warning"`), `documentId`, `sourcePath`, `message`, `reference`(작성자가 쓴 그대로), 선택적 `position`을 담습니다. `missing-anchor`와 `missing-embed-anchor`에는 대상 문서가 실제로 가진 앵커를 나열한 `available`이 추가됩니다. 코드는 `missing-document`, `missing-anchor`, `missing-asset`, `missing-embed-source`, `missing-embed-anchor`, `invalid-embed-spec`, `duplicate-anchor`, `empty-anchor`, `unstable-anchor-link`, `unmatched-embed-replacement`, `empty-embed-cell`, `unportable-embed-component`, `imported-embed-component`이며, 이 중 `unstable-anchor-link`, `unmatched-embed-replacement`, `empty-embed-cell`, `unportable-embed-component`가 경고입니다.

`CheckOptions`는 `ignore`(결과에서 제외할 코드), `assetDirs`, `withoutBase`, `externalPaths`, 그리고 `sourceRoot` 또는 `roots`를 받으며 루트의 기본값은 라이브러리 자체의 루트입니다. 루트가 전혀 없으면 파일 검사는 건너뛰고 문서 링크·앵커·임베드만 검사합니다. 문서 링크는 라이브러리 좌표에서 해석합니다. 상대 경로는 문서의 라이브러리 경로를 기준으로, 루트 상대 경로는 라이브러리 경로 그대로, 그리고 `withoutBase`가 있으면 배포 기본 경로를 뗀 형태로 한 번 더 찾는데 이는 내보내기가 경로를 찾는 방식과 같습니다. `externalPaths`는 같은 호스트에서 다른 애플리케이션이 담당하는 루트 상대 접두어 목록이며(`/sdk` 등), pathname이 그 접두어 자체이거나 그 아래에 있는 링크는 외부로 보아 검사하지 않습니다. 이 판정 함수 `isExternalPath(url, prefixes)`도 export합니다. 로컬 링크와 이미지는 그다음 [`resolveLocalTarget`](../../packages/cudoc/src/node/local-target.ts)으로 해석합니다. `cudoc-export`이 자산을 복사할 때 쓰는 것과 같은 함수이므로, 대상의 존재 여부를 두고 검사기와 출력기가 어긋날 수 없습니다. 그 함수의 `LocalTargetRoots`는 `{ roots, assetDirs?, withoutBase?, externalPaths? }`이며, 문서 상대 경로는 그 라이브러리 경로를 담는 루트를 통해 디스크에 닿습니다.

위치는 저장된 트리가 아니라 `document.source.text`에서 복원합니다. 수집이 AST를 저장할 때 `position`을 제거하기 때문입니다. 탐색은 Markdown 목적지 구분자로 끝나는 출현을 우선하므로, `guide.md#limit`이 `guide.md#limits`가 있는 줄을 가리키지 않습니다. 중복 앵커는 나중 선언을 보고합니다. 원본에 더 이상 없는 참조는 틀린 위치 대신 위치 없음으로 처리합니다.

`formatCheckResult(result: CheckResult): string`은 문서별로 묶어 `줄:열` 접두어와 함께 출력하며, `available`은 최대 네 개까지 보이고 나머지는 개수로 요약합니다.

`invalid-embed-spec`은 `parseEmbedSpec`이 거부한 블록을 다룹니다. 보고 위치는 펜스 줄에 파서가 알려 준 줄을 더한 값이라, 블록 기준이 아니라 파일 기준 좌표가 나옵니다. 메시지에 남아 있던 블록 기준 `at line N, column M` 꼬리표는 같은 이야기를 두 번 하지 않도록 제거합니다.

`unmatched-embed-replacement`는 `transformedSection`이 자르는 원문 슬라이스를 그대로 다시 계산합니다. `source.sections[anchor]`를 `end` 또는 `ownEnd`로 끊거나, 문서 전체 임베드라면 `source.text` 전부입니다. 그 각각에 규칙을 순서대로 적용하면서 무엇이 맞았는지 기록합니다. 어떤 슬라이스에서도 맞지 않은 규칙만 보고합니다. 규칙 목록은 선택된 절 전부에 적용되므로 한 절만 겨냥한 규칙이 나머지를 비껴가는 것은 설계상 정상이기 때문입니다. 쓸 수 없는 패턴은 맞은 것으로 셉니다. 그건 해석기가 낼 오류이기 때문입니다.

`empty-embed-cell`은 표 출력이 수행하는 추출을 `buildEmbedRow`와 `extractCell`로 똑같이 수행하되, 매핑으로 쓴 모든 열을 선택된 모든 절에 대고 돌려서 값이 없는 셀마다 열 번호와 머리 글자, 행의 절, 추출기의 `problem` 글자를 보고합니다. 축약형 열은 보고하지 않습니다. 표로 시작하는 절의 `summary`가 비는 것은 정상이기 때문입니다. 등록되지 않은 추출기를 부르는 `{ extractor }` 열은 검사를 중단하는 대신 행마다 `invalid-embed-spec`으로 보고합니다.

`unportable-embed-component`는 임베드가 실제로 복사하게 될 내용을 검사합니다. 선택은 해석기가 쓰는 것과 같은 [`collectSections`](../../packages/cudoc/src/sections.ts)로 적용하므로, `includeChildren: false`와 `select`가 복사 범위를 좁히는 만큼 검사 범위도 함께 좁혀집니다. `render: { type: table }` 임베드는 제목 글자만 이동하므로 건너뜁니다. 보고 대상은 타입이 `mdx`로 시작하거나 `Directive`로 끝나는 노드이며, [`documentToHast`](../../packages/cudoc/src/render.ts)가 거부하지 않고 버리는 `mdxjsEsm`과 `yaml`은 제외합니다. `select.anchors`가 존재하지 않는 절을 가리키면 `collectSections`가 예외를 던지는데, 빌드도 같은 오류를 내기 때문에 삼키지 않고 `missing-embed-anchor`로 보고합니다.

`unportable-embed-component`의 문구는 라이브러리의 호스트에 따라 다릅니다. `next`, `docusaurus`, `nextra`에서는 호스트가 접합된 자리에서 복사본을 렌더링하고 독립 내보내기만 렌더러가 필요하다고 말하고, 그 밖의 호스트에서는 둘 다 렌더링할 수 없다고 말합니다.

`imported-embed-component`는 복사되는 컴포넌트 이름(`.` 앞부분)을 `target.imports`와 `doc.imports`에 대조합니다. 원본 문서가 자기 파일에서 import하고 임베드하는 문서는 import하지 않는 이름을 오류로 보고하는데, 내보내기가 `mdxjsEsm`을 버리므로 접합된 복사본이 그 이름의 바인딩이 없는 모듈에 놓이기 때문입니다. `render: section` 임베드에서만, `unportable-embed-component` 뒤에 보고합니다.

`collectAnchors(tree: Root)`는 모든 제목 앵커에 대해 `{ id, explicit }`를 반환합니다. `explicit`는 `data.cudoc.explicitId`를 반영하며, 작성자가 쓴 앵커와 슬러거가 만든 앵커를 가르는 값이자 `unstable-anchor-link`가 판단 기준으로 삼는 값입니다.

## 데이터셋

소스·import: [node/dataset.ts](../../packages/cudoc/src/node/dataset.ts), `@cudoment/cudoc/node/dataset`.

`generateDataset(options: DatasetOptions)`는 동기적으로 필터링한 AST를 출력하고 `{ schemaVersion: "1.0.0", documentCount, documents }`를 반환합니다.

`DatasetOptions`는 `ProjectionOptions`에 필수 `inputDir`, `outDir`, 선택적 `library`, `documents`, `scopes`, 기본 `custom`인 `projectionId`, 기본 true인 `requireVersion`을 추가합니다. 입력은 AST JSON 디렉터리이며 보통 `.cudoc/documents/documents`입니다. `manifest.json`, `meta.json`은 건너뜁니다. 문서 ID는 확장자 없는 정확한 상대 경로입니다. `library`는 그 AST가 나온 수집 라이브러리 디렉터리입니다. 그 manifest의 루트 기준 경로가 문서의 scope 조각이 어디서 시작하는지를 정하는데, ID에 접두어로 맞는 가장 긴 기준 경로 다음의 첫 조각이 scope이므로 기준 경로가 `docs`, `terms`일 때 `docs/ko/guide`와 `terms/ko/token`은 모두 scope `ko`에 속합니다. 또한 그 라이브러리의 비공개 문서는 제외되며 `documents`로 비공개 문서를 요청하면 오류입니다. `library`가 없으면 scope는 첫 경로 조각이고 비공개 문서는 없습니다. `scopeOf(id, bases)`를 export합니다. 명시한 ID가 없으면 오류입니다.

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

입출력 중첩과 symlink 출력을 거부합니다. **기존 출력은 빈 디렉터리도 `.cudoc-output`에 `cudoc\n`을 갖고 있어야 합니다.** 처음에는 존재하지 않는 출력 경로를 사용합니다. 잠금은 배타적으로 생성하고 콜백에는 임시 경로를 전달합니다.

콜백은 동기와 비동기 어느 쪽이든 됩니다. `publishDirectory`는 `build`가 반환한 값을 확인해서, thenable이면 그것이 완료될 때까지 교체를 미루고 자신도 프로미스를 반환하며, 그 밖의 값이면 즉시 교체하고 아무것도 반환하지 않습니다. 오버로드 시그니처는 편의를 위한 것이며 실제 판단은 이 런타임 검사가 합니다. 생성 실패 시 기존 출력을 유지하고 최종 rename 실패 시 복원합니다. 잠금은 트랜잭션 전체에 걸쳐 유지하므로, 비동기 생성이 진행되는 동안 같은 출력으로 발행을 다시 시도하면 실패합니다. 생성 도중 프로세스가 강제로 종료되면 잠금 파일과 임시 디렉터리가 남는데, 비동기 생성은 그 구간을 길게 만들 뿐 새로운 실패 방식을 더하지는 않습니다. 이 도우미는 생성물 보호용이며 임의 컴파일러·렌더러 콜백을 격리하는 sandbox가 아닙니다.

## 개별 AST 스냅샷

소스: [export-ast.ts](../../packages/cudoc/src/node/export-ast.ts), [load-ast-file.ts](../../packages/cudoc/src/node/load-ast-file.ts), [paths.ts](../../packages/cudoc/src/node/paths.ts).

이 공개 기본 함수는 AST 파일을 개별 처리합니다. 라이브러리 manifest, 원문 스냅샷, 준비된 코드 블록 임베드를 만들지 않습니다. 사용 가이드는 라이브러리 흐름을 기준으로 합니다.

- `/embed` 또는 `/node/export-ast`의 기본 export인 `exportAst(options?)`는 설치한 remark 위치의 스냅샷을 저장합니다. 렌더링 트리는 유지하며 파일별로 원자적으로 작성합니다.
- `resolveExportAstOptions(options?) → ExportAstContext`, `projectTree(node, context) → unknown`, `buildExportedAst(tree, context) → object`는 디스크 쓰기 없이 export 준비를 제공합니다.
- Export 기본값: 입력 `docs`, 출력 `.cudoc/ast`, 확장자 `.md`/`.mdx`, 제거 속성 `position`/`estree`, 제거 노드 `mdxjsEsm`, 버전 `cudocAstVersion: 1`, 검증 true. 사용자 `version`, `tableCellElement`, `write(filePath, contents)`, 경로 옵션도 지원합니다.
- `/embed`의 `loadAst(documentPath, options?)`는 확장자 없는 상대 ID를 읽고 `/node/load-ast-file`의 `loadAstFile(filePath, options?)`는 알려진 파일을 직접 읽습니다. 기본적으로 검증하고 `ExportedCudocAstRoot`를 반환합니다. 읽기 옵션은 `version`, `validate`, `tableCellElement`이며 `loadAst`는 경로 옵션도 받습니다.
- `/node/paths`는 `resolvePathOptions`, `getRelativeOutputPath`, `getOutputPath`, `DEFAULT_SOURCE_ROOT`, `DEFAULT_OUTPUT_ROOT`, `DEFAULT_EXTENSIONS`를 제공합니다. `PathOptions`는 `{ sourceRoot?, outDir?, extensions?, cwd? }`이며 출력 매핑은 범위 밖·확장자 불일치 경로에 `null`을 반환합니다.

서버 번들의 경로를 알고 있다면 `loadAstFile`을 사용합니다. 런타임이 JSON을 읽으면 배포물에 해당 파일을 포함해야 합니다. `/embed`는 개별 export·읽기·경로 함수와 하위 쿼리를 재수출하며 이 페이지 앞의 새 API를 재수출하지 않습니다.

## CLI

소스: [cli.ts](../../packages/cudoc/src/node/cli.ts).

```sh
cudoc collect --config cudoc.config.mjs [--watch]
cudoc check --config cudoc.config.mjs [--format json] [--strict]
cudoc dataset --config dataset.config.json
```

위 세 명령과 `--config <path>` 인자 형태만 지원합니다. ESM은 설정 객체를 기본 export하고 `.json`은 직접 파싱합니다. 설정 안의 경로는 설정 파일 위치가 아닌 명령 실행 디렉터리 기준입니다. `collect`는 수집과 준비를 실행하며 컴파일러는 동기·비동기 모두 가능합니다. `check`는 같은 방식으로 수집한 뒤 그 결과에 [참조 검사](#참조-검사)를 실행하며, 같은 설정 파일의 선택적 `check` 키(`ignore`, `assetDirs`, `externalPaths`, `roots`)를 읽고 아무것도 쓰지 않습니다. `dataset`은 설정을 그대로 `generateDataset`에 넘기므로, 그 안의 `library`가 scope와 비공개 문서를 읽어 올 수집 라이브러리를 가리킵니다. 오류가 하나라도 보고되면, 또는 `--strict`를 주었을 때 무엇이든 보고되면 종료 코드가 1입니다. `collect`와 `dataset`은 성공 시 JSON 요약을 출력하고, 오류는 stderr에 출력하며 종료 코드를 1로 설정합니다. `collect --watch`는 같은 설정으로 [`watchDocuments`](#감시)를 실행하고 종료하지 않습니다. 첫 회차는 `outDir`에 이미 있는 것에서 이어 가고, 회차마다 JSON 한 줄(`documentCount`, 컴파일한 id 목록 `compiled`, `reused`, `blocks`, `reusedBlocks`, `outDir`, `elapsed`)을 출력하며, 실패한 회차는 오류를 출력하고 마지막 성공 출력을 그대로 둡니다. 플래그가 없는 `collect`는 항상 전체 빌드입니다. 내보내기 CLI는 [어댑터](./adapters.ko.md#내보내기)에 설명합니다.
