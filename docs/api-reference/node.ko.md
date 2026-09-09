# Node API

[English](./node.md) | **한국어** · [API 레퍼런스](./README.ko.md)

이 진입점은 파일을 읽거나 쓰므로 Node.js 빌드·서버 코드에서 사용합니다. 별도 설명이 없으면 상대 파일시스템 경로는 현재 작업 디렉터리 기준입니다.

## 수집

소스·import: [library.ts](../../packages/cudoc/src/node/library.ts), `@cudoment/cudoc/node/library`.

```ts
buildDocuments(options: BuildDocumentsOptions): Library
buildDocumentsAsync(options: Omit<BuildDocumentsOptions, "compiler"> & {
  compiler: AsyncDocumentCompiler
}): Promise<Library>
loadLibrary(outDir?: string, compiler?: DocumentCompiler, sourceRoot?: string): Library
```

`BuildDocumentsOptions`는 `DocumentOptions`를 확장합니다.

| 속성          | 기본값                  | 의미                                    |
| ------------- | ----------------------- | --------------------------------------- |
| `sourceRoot`  | 필수                    | 입력 디렉터리; `.md`, `.mdx` 재귀 수집  |
| `outDir`      | `.cudoc/documents`      | cudoc 전용 라이브러리 출력              |
| `routeBase`   | `/`                     | 기본 문서 경로 접두사                   |
| `routeSuffix` | `""`                    | `.html` 같은 접미사                     |
| `routes`      | `{}`                    | 확장자 없는 문서 ID별 경로 재정의       |
| `compiler`    | 독립 컴파일러           | 전달하면 실제 호스트 컴파일러 콜백 사용 |
| `compilerId`  | `compiler` 사용 시 필수 | 호출자가 관리하는 컴파일러·설정 식별자  |

문서 ID는 `sourceRoot` 기준 POSIX 상대 경로에서 확장자를 제거한 값입니다. 확장자·대소문자 충돌은 오류입니다. 기본 URL은 연결 `/`를 맞춘 `routeBase + id + routeSuffix`입니다. 재정의 경로는 고유해야 하며 `/`로 시작하되 `//`로 시작하지 않고 `?`, `#`이 없는 루트 상대 pathname이어야 합니다. frontmatter slug는 자동으로 추론하지 않습니다.

컴파일러를 생략할 수 있는 호스트는 `markdown`, `html`, `next`, 호스트 미지정입니다. 나머지 프로필은 콜백이 필요합니다. 추가 플러그인을 사용하는 Next.js도 동등한 결과를 위해 같은 콜백이 필요합니다.

```ts
type DocumentCompiler = (
  source: string,
  context: { id: string; filePath: string; options: DocumentOptions },
) => CompiledDocument
// AsyncDocumentCompiler는 인자가 같고 Promise<CompiledDocument>를 반환합니다.
```

`filePath`는 절대 경로이며 `options.format`은 파일별로 결정합니다. export가 위치를 제거하기 전의 위치 정보가 있는 트리를 반환해야 합니다. 수집기는 반환된 진단을 상대 파일·행과 함께 stderr에 출력합니다. 원문 범위를 저장하고 export 검증·버전 표기를 거쳐 라이브러리를 출력합니다. 비동기 수집기는 출력 전에 각 파일을 컴파일하고 치환을 위해 비동기 컴파일러를 보관합니다.

`Library`는 `documents: StoredDocument[]`, `options`, `configuration`(해시), 선택적 런타임 `sourceRoot`, `compiler`, `asyncCompiler`를 가집니다. `StoredDocument`는 `id`, `sourcePath`, `route`, `tree`, `source: SourceSnapshot`, `frontmatter`를 가집니다. 컴파일러 함수와 절대 소스 루트는 직렬화하지 않습니다.

`loadLibrary`의 기본 경로는 `.cudoc/documents`이며 manifest 버전, AST 계약, 저장 해시를 검증해 라이브러리를 복원합니다. 현재 소스 파일이나 컴파일러 설정과 비교하지는 않습니다. 최신화하려면 다시 수집합니다. 상대 링크·import의 절대 컴파일 경로 복원을 위해 `sourceRoot`를 전달합니다. 치환에는 원래 동기 컴파일러를 전달하거나 `library.asyncCompiler`에 원래 콜백을 연결하고 비동기 API를 사용합니다. 준비된 임베드만 소비하는 라이브러리는 컴파일러가 필요하지 않습니다.

## 라이브러리 파일

```text
.cudoc/documents/
  .cudoc-output
  manifest.json
  documents/<id>.json
  sources/<id>.json
  embeds.json              # prepareEmbeds가 추가
```

| 파일                  | 계약                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `manifest.json`       | `schemaVersion: 1`, 설정 해시, 문서 옵션, 선택적 컴파일러 ID, 문서별 메타데이터·해시             |
| `documents/<id>.json` | 버전 있는 mdast 루트; `data.cudocAstVersion: 1`; `position`/`estree` 속성과 `mdxjsEsm` 노드 제거 |
| `sources/<id>.json`   | 원문, SHA-256 해시, 형식, 섹션 offset                                                            |
| `embeds.json`         | 준비된 임베드 AST 블록과 최신 상태 확인용 메타데이터                                             |

manifest 문서 항목은 `id`, `sourcePath`, `route`, `frontmatter`, `hash`, `astHash`, `snapshotHash`입니다. AST·스냅샷 해시는 객체의 `JSON.stringify`, 원문 해시는 원본 텍스트를 대상으로 합니다. `configuration`은 옵션·경로·컴파일러 식별자를 해시합니다. 공개 함수로 생성하고 파일을 직접 수정하지 않습니다.

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
type EmbedSpec = {
  sources: string[]
  select?: SectionSelection
  render?: "section" | { type: "table"; columns?: ("title" | "link" | "summary")[] }
  replace?: Replacement[]
}
type EmbedContext = { documentId: string; prefix?: string }

parseEmbedSpec(value: string): EmbedSpec
resolveDocumentReference(library: Library, reference: string, from: string): {
  document: StoredDocument; anchor?: string
}
resolveEmbed(library: Library, spec: EmbedSpec, context: EmbedContext): Root
resolveDocumentEmbeds(library: Library, documentId: string): Root
// 비동기 버전은 Promise<Root>를 반환합니다.
// resolveEmbedAsync(library, spec, context)
// resolveDocumentEmbedsAsync(library, documentId)
```

`parseEmbedSpec`은 YAML을 읽고 지원하는 최상위·선택 조건 키, 소스 목록, 출력 형식, 치환 규칙을 검증합니다. `sources`는 비어 있으면 안 됩니다. 기본 출력은 `section`, 표 기본 열은 title/link/summary입니다. 선택 동작은 [문서 쿼리](./document.ko.md#섹션과-쿼리)에 정의되어 있습니다.

참조는 `context.documentId`의 상대 경로이며 `/`로 시작하면 문서 루트 기준입니다. `.md`/`.mdx`, `#anchor`를 지원합니다. URL, 역슬래시 경로, 루트 이탈, 없는 문서는 오류입니다. 앵커와 선택 조건이 모두 없으면 문서 전체를 사용합니다.

소스 AST를 복제합니다. 치환이 있으면 원본의 선택 범위를 읽고 규칙을 순서대로 적용한 뒤 기존 컴파일러·옵션으로 다시 컴파일합니다. 일반 치환은 split/join으로 전체 일치를 바꾸고, 정규식은 JavaScript `RegExp`를 사용하며 기본 플래그는 `g`입니다. 선택 범위 밖의 정의는 바꾸지 않고 추가합니다. 원본 소스와 AST는 수정하지 않습니다. 비동기 API는 처리별 컴파일 캐시를 통해 비동기 컴파일러를 사용합니다.

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
prepareEmbeds(library: Library, outDir?: string): Promise<PreparedEmbeds>
readPreparedEmbeds(outDir: string, documentId: string, source: string): PreparedEmbeds
embedKey(documentId: string, value: string, index: number): string
```

`prepareEmbeds`는 전체 수집 문서의 코드 블록 임베드를 비동기로 처리하고 `embeds.json`을 원자적으로 교체합니다. 기본 `outDir`는 `.cudoc/documents`이며 **라이브러리에서 추론하지 않습니다**. 사용자 수집 경로는 명시적으로 전달합니다.

`PreparedEmbeds`는 `schemaVersion: 1`, `configuration`, `sourceHashes: Record<string,string>`, `blocks: Record<string,Root>`를 가집니다. 키는 `documentId:index:sha256(fenceValue)`이며 블록 번호는 1부터입니다. `readPreparedEmbeds`는 스키마, manifest 설정, 현재 문서 소스 해시, manifest 문서 해시를 검사합니다. 없거나 오래된 데이터는 재수집을 안내하는 오류입니다. 실시간 소스 watcher는 아닙니다.

수집은 라이브러리 디렉터리를 출력하고 준비는 이후 파일을 출력합니다. 두 출력은 별도 경계입니다. 수집 성공 후 준비가 실패하면 호스트 빌드 전에 준비·수집을 다시 실행합니다. 여러 단계 전체가 하나의 트랜잭션으로 롤백된다고 가정하지 않습니다.

## 데이터셋

소스·import: [node/dataset.ts](../../packages/cudoc/src/node/dataset.ts), `@cudoment/cudoc/node/dataset`.

`generateDataset(options: DatasetOptions)`는 동기적으로 필터링한 AST를 출력하고 `{ schemaVersion: "1.0.0", documentCount, documents }`를 반환합니다.

`DatasetOptions`는 `ProjectionOptions`에 필수 `inputDir`, `outDir`, 선택적 `documents`, `scopes`, 기본 `custom`인 `projectionId`, 기본 true인 `requireVersion`을 추가합니다. 입력은 AST JSON 디렉터리이며 보통 `.cudoc/documents/documents`입니다. `manifest.json`, `meta.json`은 건너뜁니다. 문서 ID는 확장자 없는 정확한 상대 경로, scope는 첫 경로 조각입니다. 명시한 ID가 없으면 오류입니다.

출력은 `documents/<id>.json`과 `manifest.json`입니다. manifest에는 스키마 `"1.0.0"`, 필터링 ID·옵션, 문서 수, scope, `{ id, hash, outputHash }`가 있습니다. `hash`는 UTF-8로 읽은 입력 파일, `outputHash`는 직렬화한 출력 AST를 대상으로 합니다. 입력과 출력을 검증하며 파일별 오류는 원인을 보존하고 출력을 중단합니다. 필터링 의미는 [projectAst](./document.ko.md#필터링)를 참고하세요.

## 저장

소스·import: [storage.ts](../../packages/cudoc/src/node/storage.ts), `@cudoment/cudoc/node/storage`.

| 함수                                             | 동작                                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `hash(value)`                                    | 문자열의 SHA-256 hex                                                                           |
| `posix(value)`                                   | 플랫폼 경로 구분자를 `/`로 변환                                                                |
| `contained(root, target)`                        | 루트 자체를 포함한 경로 포함 여부                                                              |
| `realPath(target)`                               | 존재하는 조상의 실제 경로에 없는 부분을 연결                                                   |
| `safePath(root, relative)`                       | 포함된 하위 경로로 해석; 이탈·루트 자체 거부                                                   |
| `sourceFiles(root, extensions?)`                 | 정렬된 재귀 절대 경로; 기본 `.md`, `.mdx`; 숨김 항목·node_modules 제외, 소스 트리 symlink 거부 |
| `writeJson(file, value)`                         | 부모 디렉터리 생성 후 compact JSON 작성; 자체 트랜잭션 없음                                    |
| `publishDirectory(inputRoot, outputRoot, build)` | 잠금·임시 생성 후 소유한 출력 디렉터리 교체                                                    |

입출력 중첩과 symlink 출력을 거부합니다. **기존 출력은 빈 디렉터리도 `.cudoc-output`에 `cudoc\n`을 갖고 있어야 합니다.** 처음에는 존재하지 않는 출력 경로를 사용합니다. 잠금은 배타적으로 생성하고 동기 콜백에는 임시 경로를 전달합니다. 생성 실패 시 기존 출력을 유지하고 최종 rename 실패 시 복원합니다. 이 도우미는 생성물 보호용이며 임의 컴파일러·렌더러 콜백을 격리하는 sandbox가 아닙니다.

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
cudoc collect --config cudoc.config.mjs
cudoc dataset --config dataset.config.json
```

위 두 명령과 정확한 `--config <path>` 인자 형태만 지원합니다. ESM은 설정 객체를 기본 export하고 `.json`은 직접 파싱합니다. 설정 안의 경로는 설정 파일 위치가 아닌 명령 실행 디렉터리 기준입니다. `collect`는 수집과 준비를 실행하며 컴파일러는 동기·비동기 모두 가능합니다. 성공 시 JSON 요약을 출력하고 오류는 stderr에 출력하며 종료 코드를 1로 설정합니다. watch 명령은 없습니다. HTML CLI는 [어댑터](./adapters.ko.md#html)에 설명합니다.
