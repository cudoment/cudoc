# Node API

[English](./node.md) | **한국어** · [API 레퍼런스](./README.ko.md)

이 페이지의 진입점은 파일을 읽거나 쓰므로 Node.js 빌드·서버 코드에서 사용합니다. 별도 설명이 없으면 상대 경로는 현재 작업 디렉터리 기준입니다.

## 수집

수집은 설정한 루트 아래의 모든 문서를 컴파일해 라이브러리 하나로 출력합니다. 소스·import: [library.ts](../../packages/cudoc/src/node/library.ts), `@cudoment/cudoc/node/library`.

루트 도우미 `SourceRoot`, `ResolvedRoot`, `resolveRoots`, `documentIdOf`, `libraryPathOf`, `sourceFileOf`, `normalizeBase`, `libraryPath`, `candidateFiles`는 컴파일러를 불러오지 않는 [roots.ts](../../packages/cudoc/src/node/roots.ts), `@cudoment/cudoc/node/roots`에서도 export합니다. remark 임베드 플러그인은 거기서 가져오므로 호스트가 MDX 스택 없이 설정을 불러올 수 있습니다.

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
normalizeBase(base: string | undefined): string
libraryPath(root: ResolvedRoot, relative: string): string
candidateFiles(roots: readonly ResolvedRoot[], target: string): string[]
globToRegExp(pattern: string): RegExp
globMatcher(patterns: readonly string[] | undefined, option: string): (libraryPath: string) => boolean
```

`normalizeBase`는 기준 경로를 라이브러리에서 쓰는 형태로 바꾸며(`/docs/`는 `docs`), 아래 규칙에 어긋나면 `cudoc: invalid root base: <base>`를 던집니다. `libraryPath(root, relative)`는 루트 디렉터리 안의 경로 앞에 그 루트의 기준 경로를 붙입니다. `candidateFiles(roots, target)`는 라이브러리 경로가 가리킬 수 있는 모든 파일을 기준 경로가 긴 순서로 나열합니다. 루트 디렉터리를 벗어나는 경로와 안쪽에 있는 다른 루트가 가진 파일은 빼고 나열합니다.

`globToRegExp`는 `exclude`와 `private`가 쓰는 글롭 문법의 패턴 하나를 정규식으로 바꿉니다([glob.ts](../../packages/cudoc/src/node/glob.ts)). `globMatcher`는 라이브러리 경로를 패턴 목록과 비교하며, 비어 있지 않은 문자열이 아닌 패턴이 있으면 `option`의 이름을 들어 오류를 냅니다. `cudoc-export`도 내비게이션 폴더의 `exclude`를 같은 문법으로 읽습니다.

문법은 작으며 패턴은 라이브러리 경로에 대조합니다.

- `*`와 `?`는 한 구간 안에서, `**`는 여러 구간에 걸쳐 맞습니다.
- `/`가 없는 패턴은 어디에 있든 그 이름의 파일이나 디렉터리에 맞습니다.
- 끝의 `/**`는 그 디렉터리 자체에도 맞으므로 제외된 디렉터리에는 들어가지 않고 그 안의 symlink도 보지 않습니다.
- 중괄호 집합, 문자 클래스, 부정은 없으며, 빈 패턴이나 `..`이 든 패턴은 오류입니다.

`exclude`는 무엇이 문서인지를 정하고, `private`는 수집·검사·임베드는 되지만 라이브러리와 manifest에 `private: true`가 붙는 문서를 표시하며 `cudoc-export`와 `generateDataset`이 그 표시를 읽습니다.

`BuildDocumentsOptions`는 `DocumentOptions`를 확장합니다.

| 속성          | 기본값                  | 의미                                                                                               |
| ------------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| `sourceRoot`  | 둘 중 하나 필수         | 라이브러리 최상위에 놓이는 입력 디렉터리 하나. `roots: [{ dir: sourceRoot }]`의 축약형             |
| `roots`       | 둘 중 하나 필수         | `{ dir, base? }[]`: 수집할 디렉터리와 각각의 기준 경로. `sourceRoot`와 `roots`를 함께 주면 오류    |
| `exclude`     | `[]`                    | 문서가 아닌 파일과 디렉터리를 고르는 글롭 패턴. 라이브러리 경로에 대조                             |
| `private`     | `[]`                    | 수집·검사는 하되 내보내기와 데이터셋에서는 제외하는 문서를 고르는 글롭 패턴                        |
| `outDir`      | `.cudoc/documents`      | cudoc 전용 라이브러리 출력                                                                         |
| `routeBase`   | `/`                     | 기본 문서 경로 접두사                                                                              |
| `routeSuffix` | `""`                    | `.html` 같은 접미사                                                                                |
| `routes`      | `{}`                    | 확장자 없는 문서 ID별 경로 재정의                                                                  |
| `compiler`    | 독립 컴파일러           | 전달하면 실제 호스트 컴파일러 콜백 사용                                                            |
| `compilerId`  | `compiler` 사용 시 필수 | 호출자가 관리하는 컴파일러·설정 식별자                                                             |
| `previous`    | 없음                    | 앞서 수집한 라이브러리. 원문이 바뀌지 않은 문서는 컴파일하지 않고 여기서 가져옴                    |
| `imageSizes`  | `false`                 | 문서마다 보여 주는 로컬 이미지의 픽셀 크기를 담은 `images.json`도 씀                               |
| `assetDirs`   | `[]`                    | `images.json`에서 이미지 주소를 그 라이브러리 경로로 한 번 더 찾는 디렉터리(`public`, `static` 등) |

모든 루트에서 `.md`와 `.mdx`를 재귀적으로 수집하며 숨김 항목과 `node_modules`는 건너뛰고 symlink는 거부합니다. `resolveRoots`가 다음 규칙으로 루트를 해석하며 모든 소비자가 이 함수를 호출합니다.

- 루트의 `base`는 양쪽 `/`를 떼어 정규화합니다. 여러 조각(`docs/v2`)이어도 되고 비어 있어도 되지만, 빈 조각과 `.`·`..` 조각, `?`, `#`은 들어갈 수 없습니다.
- 두 루트가 같은 기준 경로를 가져도 되고, 한 기준 경로가 다른 기준 경로를 확장해도 됩니다(`docs`와 `docs/api`).
- 한 루트의 디렉터리가 다른 루트의 디렉터리 안에 있어도 되며, 이때 파일은 안쪽 루트가 가집니다. 바깥 루트를 훑을 때 그 디렉터리를 안쪽 루트에 맡기고, 트리 안에서 다른 루트의 디렉터리로 이어지는 심볼릭 링크도 거부하는 대신 그 루트에 맡기므로, 각 파일은 안쪽 루트의 기준 경로로 한 번만 수집됩니다.
- 같은 디렉터리를 두 번 나열할 수는 없으며, 한 번은 그대로 쓰고 한 번은 심볼릭 링크로 쓴 경우도 같은 디렉터리로 봅니다.

문서의 **라이브러리 경로**는 루트의 기준 경로 뒤에 그 루트 디렉터리 기준 POSIX 경로를 이은 값이고, ID는 라이브러리 경로에서 확장자를 뗀 값입니다. `{ dir: "content", base: "docs" }`로 수집한 `content/ko/guide.md`는 `docs/ko/guide.md`와 `docs/ko/guide`가 됩니다. `sourceRoot`를 쓰면 기준 경로가 비어 있으므로 ID는 그 디렉터리 아래의 파일 경로입니다. `StoredDocument.sourcePath`가 라이브러리 경로입니다.

문서를 이름 짓는 모든 것, 즉 링크, 임베드 `sources`, 검사기, 내보내기, `exclude`·`private` 패턴이 라이브러리 경로를 좌표계로 씁니다. 루트 상대 링크 `/terms/token.md`는 어느 디렉터리에서 읽었든 문서 `terms/token`을 가리키고, 상대 링크도 라이브러리 좌표에서 해석됩니다. 즉 기준 경로가 디렉터리 이름과 같을 때에만 한 루트에서 다른 루트로 건너가고, 그렇지 않으면 누락으로 보고됩니다.

`documentIdOf`와 `libraryPathOf`는 파일을 그 좌표로 옮기며 파일을 담는 가장 안쪽 루트를 씁니다. 루트 디렉터리와 파일은 실제 경로로 풀어서 비교하므로, symlink로 설정한 루트 아래 파일을 호스트가 실제 경로로 알려 주어도(반대의 경우도) 같은 문서를 찾고, 링크로 설정한 중첩 루트도 자기 파일을 그대로 가집니다.

`sourceFileOf`는 라이브러리 경로를 파일로 되돌리며, 기준 경로가 가장 길게 맞는 루트부터 시도하고 실제로 존재하는 파일을 우선합니다. 다른 루트가 가진 파일은 일치로 보지 않으므로, 기준 경로가 따로 있는 중첩 루트의 파일을 바깥 루트 기준으로 쓴 경로는 아무 파일도 가리키지 않습니다. 반면 루트가 자기 안의 심볼릭 링크로 닿는 파일은, 예를 들어 점으로 시작하는 디렉터리 아래의 파일이라도 그 루트의 파일로 남습니다. 루트 전체에 걸친 확장자·대소문자 충돌은 두 파일을 함께 알리는 오류입니다.

기본 URL은 연결 `/`를 맞춘 `routeBase + id + routeSuffix`이므로 기준 경로가 URL 접두어가 됩니다. 다만 `routeSuffix`가 `""`나 `"/"`이면 index 문서는 호스트가 서비스하는 대로 자기 디렉터리의 URL을 받습니다. `routeBase: "/docs"`에서 `index`는 `/docs/`, `guide/index`는 `/docs/guide/`입니다.

경로가 끝의 슬래시 하나만 다른 두 문서는 경로가 같은 두 문서와 마찬가지로 `duplicate document route`로 실패합니다. 재정의 경로는 고유해야 하며 `/`로 시작하되 `//`로 시작하지 않고 `?`, `#`이 없는 루트 상대 pathname이어야 합니다. frontmatter slug는 자동으로 추론하지 않습니다.

컴파일러를 생략할 수 있는 호스트는 `markdown`, `html`, `next`, 호스트 미지정입니다. 나머지 프로필은 콜백이 필요합니다. 추가 플러그인을 사용하는 Next.js도 동등한 결과를 위해 같은 콜백이 필요합니다.

```ts
type DocumentCompiler = (
  source: string,
  context: { id: string; filePath: string; options: DocumentOptions },
) => CompiledDocument
// AsyncDocumentCompiler는 인자가 같고 Promise<CompiledDocument>를 반환합니다.
```

`filePath`는 절대 경로이며 `options.format`은 파일별로 결정합니다. export가 위치를 제거하기 전의 위치 정보가 있는 트리를 반환해야 합니다. 수집기는 반환된 진단을 `<library path>:<line>: <code>: <message>` 형식으로 stderr에 출력하므로, 기준 경로가 있는 루트의 파일에는 그 기준 경로가 보입니다. 원문 범위를 저장하고 export 검증·버전 표기를 거칩니다.

모든 문서의 컴파일이 끝나기 전에는 아무것도 쓰지 않으며, 그다음 라이브러리를 [`publishDirectory`](#저장) 한 번으로 출력하므로 컴파일되지 않는 문서가 있으면 이전 라이브러리가 그대로 남습니다. 출력은 디렉터리 전체를 교체하므로 앞선 준비가 쓴 `embeds.json`은 남지 않습니다. `prepareEmbeds`가 다시 쓰고, [`collectDocuments`](#감시)는 둘을 함께 출력합니다. 비동기 수집기는 출력 전에 각 파일을 컴파일하고 치환을 위해 비동기 컴파일러를 보관합니다.

`previous`를 주면 설정 해시가 같고 라이브러리 경로가 같고 원문의 해시가 저장된 해시와 같은 문서를 그 라이브러리에서 트리, 스냅샷, frontmatter, `private`, `imports`까지 그대로 가져옵니다. 나머지는 평소처럼 컴파일하고, 디스크에서 사라진 문서는 빠지며, 출력 디렉터리는 어느 경우에나 완전합니다. 재사용한 문서의 진단은 다시 출력하지 않습니다. 결과에는 양쪽 문서 id를 담은 `incremental: { compiled, reused }`가 붙습니다.

설정이 바뀌면 아무것도 재사용하지 않습니다. 옵션, 라우팅, 루트, 패턴, 추출기 버전, `compilerId`, `@cudoment/cudoc` 버전이 설정입니다. 호스트를 올렸을 때 `compilerId`를 바꿔야 하는 이유도 여기에 있습니다. 해시는 컴파일러가 무엇을 하는지 볼 수 없습니다.

`Library`는 `documents: StoredDocument[]`, `options`, `configuration`(해시), `bases: string[]`(수집 당시 루트들의 기준 경로, 맨 위 루트 하나면 `[""]`), 선택적 런타임 `roots: ResolvedRoot[]`(절대 `dir`, 정규화한 `base`), `compiler`, `asyncCompiler`를 가집니다. 컴파일러 함수와 절대 루트 디렉터리는 직렬화하지 않고, manifest에는 각 루트의 `base`만 기록합니다.

`StoredDocument`는 `id`, `sourcePath`, `route`, `tree`, `source: SourceSnapshot`, `frontmatter`를 가지며, `private` 패턴에 맞은 문서에는 `private: true`가, 무엇이든 import하는 문서에는 `imports: string[]`이 붙습니다.

`imports`는 그 문서의 `import` 문이 묶는 지역 이름이며, 내보내기가 `mdxjsEsm` 노드를 버리기 전에 컴파일러의 estree에서 읽습니다(`CompiledDocument.imports`, `@cudoment/cudoc/mdx`의 `importedNames(tree)`가 계산하며 `/markdown`도 재수출). 호스트 캡처도 같은 값을 기록하며, `.mdx` 파일에서는 `importedNamesFromSource(source)`로 원문도 훑습니다. 펜스 코드 밖의 최상위 `import` 문을 모듈로 파싱하는데, Nextra처럼 캡처가 보기 전에 ESM을 트리 밖으로 끌어올리는 호스트가 있기 때문입니다.

`loadLibrary`의 기본 경로는 `.cudoc/documents`이며 manifest 버전, AST 계약, 저장 해시를 검증해 라이브러리를 복원합니다. 현재 소스 파일이나 컴파일러 설정과 비교하지는 않습니다. 최신화하려면 다시 수집합니다.

문서가 디스크의 어디에 있는지 복원하려면 `roots`를 전달합니다. 단일 루트 축약형이면 디렉터리 하나, 아니면 수집에 쓴 것과 같은 `{ dir, base }` 목록이며, 치환 컴파일과 자산 해석이 이 정보를 필요로 합니다. 전달한 기준 경로는 manifest에 기록된 것과 같아야 하는데 ID가 거기서 파생되었기 때문이며, 다르면 기록된 기준 경로를 알리는 오류가 납니다.

치환에는 원래 동기 컴파일러를 전달하거나 `library.asyncCompiler`에 원래 콜백을 연결하고 비동기 API를 사용합니다. 준비된 임베드만 소비하는 라이브러리는 컴파일러가 필요하지 않습니다.

`{ cache: true }`를 주면 해석한 `outDir`별로 불러온 문서를 메모리에 유지하고, `manifest.json`이 바이트 단위로 같은 동안 같은 `documents` 배열을 반환합니다. 재수집은 항상 manifest를 바꾸므로 그때 새로 읽으며, 전달한 `roots`는 호출마다 기록된 기준 경로와 대조합니다. 옵션이 없으면 호출마다 파일을 다시 읽습니다. 요청마다 라이브러리를 불러오는 서버(임베드를 렌더링하는 라우트 핸들러, 검색 엔드포인트)는 캐시 형태를 쓰고, 한 번만 실행되는 빌드 단계에는 필요하지 않습니다.

## 라이브러리 파일

출력된 라이브러리는 다음 파일을 담은 디렉터리 하나, 곧 `outDir`입니다.

```text
.cudoc/documents/
  .cudoc-output
  manifest.json
  pages.json
  images.json              # imageSizes를 켠 경우
  documents/<id>.json
  sources/<id>.json
  embeds.json              # prepareEmbeds와 collectDocuments가 추가
```

| 파일                  | 계약                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `manifest.json`       | `schemaVersion: 2`, 설정 해시, 문서 옵션, 선택적 컴파일러 ID, `roots: [{ base }]`, 문서별 메타데이터·해시      |
| `documents/<id>.json` | 버전 있는 mdast 루트; `data.cudocAstVersion: 1`; `position`/`estree` 속성과 `mdxjsEsm`·`yaml`·`toml` 노드 제거 |
| `sources/<id>.json`   | 원문, SHA-256 해시, 형식, 섹션 offset                                                                          |
| `embeds.json`         | `schemaVersion: 2`; 준비된 임베드 AST 블록, 블록마다 읽은 문서 목록, 최신 상태 확인용 메타데이터               |
| `pages.json`          | `schemaVersion: 1`; 사이트의 제목·설명·탐색에 쓰는 `pages`, 라이브러리 순서대로 문서마다 항목 하나             |
| `images.json`         | `schemaVersion: 1`; `documents`, 문서마다 작성한 주소별 로컬 이미지의 `type`, `width`, `height`                |

manifest 문서 항목은 `id`, `sourcePath`, `route`, `frontmatter`, `hash`, `astHash`, `snapshotHash`이고, 비공개 문서에는 `private: true`가, 무엇이든 import하는 문서에는 그 `import` 문이 묶는 지역 이름 목록 `imports`가 있습니다. AST·스냅샷 해시는 객체의 `JSON.stringify`, 원문 해시는 원본 텍스트를 대상으로 합니다.

`configuration`은 옵션, 경로, 루트 기준 경로, `exclude`·`private` 패턴, 추출기 버전, 컴파일러 식별자, `@cudoment/cudoc` 버전을 해시하므로 이 중 무엇이든 바뀌면 준비된 임베드가 무효가 됩니다. 라이브러리와 `embeds.json`은 항상 같은 해시로 함께 기록되므로 업그레이드한 뒤에도 다음 수집 전까지는 서로 일치하며, 다음 수집은 아무것도 재사용하지 않고 둘을 모두 교체합니다. 라이브러리를 읽을 때 이 해시를 실행 중인 릴리스와 비교하지는 않습니다.

`LIBRARY_SCHEMA_VERSION`이 현재 버전을 export하며 다른 버전의 manifest는 "incompatible document manifest" 오류로 거부합니다. 공개 함수로 생성하고 파일을 직접 수정하지 않습니다.

`pages.json` 항목은 `{ id, route, sourcePath, title, description?, private? }`입니다. `title`은 `documentTitle(tree, frontmatter, id)`이고 `description`은 `documentDescription(tree, frontmatter)`이며, 비어 있으면 생략합니다([페이지 메타데이터](./document.ko.md#페이지-메타데이터)). 비공개 문서는 manifest와 같이 `private: true`로 나열하므로, 페이지를 게시하는 소비자는 이를 제외합니다.

`imageSizes`를 켜면 `images.json`은 로컬 이미지를 보여 주는 문서마다 `{ [url]: { type, width, height } }`를 기록합니다. 대상은 모든 Markdown 이미지, 레이블의 첫 정의를 따라간 참조형 이미지(`[label]: ./a.png`와 함께 쓴 `![alt][label]`, 페이지가 보여 주는 정의), 호스트가 컴포넌트로 바꾼 이미지(`data.cudocImage`), 정적 `<img>` 컴포넌트의 `src`입니다. 주소는 검사와 내보내기가 로컬 주소를 해석하는 방식, 즉 라이브러리 경로로 루트 아래에서 먼저 찾고 같은 라이브러리 경로로 각 `assetDirs` 아래에서 찾는 방식으로 해석하고 `imageSize`로 읽습니다.

수집은 배포 기본 경로를 모르므로, 검사는 `withoutBase`로, 내보내기는 `hostUrl`의 경로로 떼어 내는 기본 경로를 포함한 주소는 여기서 파일로 해석되지 않습니다. 상대 경로나 기본 경로 없는 루트 기준 경로로 쓴 이미지는 크기를 기록합니다. 파일이 없거나 PNG, JPEG, GIF, BMP가 아닌 이미지는 생략하며, 없는 이미지는 참조 검사가 보고합니다.

`imageSizes`와 `assetDirs`는 설정 해시에 들어가지 않으므로 켜도 `previous` 라이브러리를 재사용합니다. 문서가 그대로여도 이미지는 바뀔 수 있으므로 `images.json`은 수집할 때마다 새로 씁니다.

`@cudoment/cudoc/node/image-size`의 `imageSize(bytes)`([소스](../../packages/cudoc/src/node/image-size.ts))는 매직 바이트로 판별한 파일 헤더에서 `{ type: "png" | "jpg" | "gif" | "bmp", width, height }`를 읽어 반환하며, 그 밖의 내용이면 `null`을 반환합니다. `cudoc-export`도 Word에 쓸 크기를 같은 함수로 읽습니다.

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

offset은 모든 호스트에서 `\r\n` 줄 끝을 포함한 파일 자체의 텍스트에 대한 JavaScript 문자열 인덱스입니다. `start`는 제목 시작, `end`는 다음 동급·상위 제목 또는 문서 경계, `ownEnd`는 하위 제목 직전입니다. dependency 범위는 원문의 정의 위치입니다. 이 범위로 저장 AST의 position이 제거된 뒤에도 원본 Markdown을 치환합니다.

여러 제목이 같은 id를 가지면 그 id로 가는 링크가 닿는 첫 번째 제목의 범위를 기록하므로, 그 id에 `replace` 규칙을 쓰면 첫 번째 절을 두 번 치환하는 대신 `cudoc: <document> gives #<id> to <n> headings, so a replace rule cannot tell which section to rewrite; give them distinct ids` 오류를 던집니다.

문서 루트의 직접 자식이 아닌 제목은 범위가 자기 줄에 있는 바깥 블록의 표시에서, 또는 그 뒤에서 시작합니다. 표시는 제목 줄 자체에서 읽는데, remark 호스트는 표시 뒤에서, markdown-it 호스트는 줄의 처음부터 제목을 기록하기 때문입니다.

규칙은 절의 원문을 따로 읽었을 때의 글자에 적용하며, 이 글자는 [replace.ts](../../packages/cudoc/src/node/replace.ts)의 `sectionText`가 자릅니다. 목록 항목에서는 항목의 표시와, 뒤따르는 모든 줄에서 항목의 들여쓰기를 파서가 항목 내용에서 뗀 것처럼 떼어 내므로, 목록 항목 안의 절은 아무리 깊어도 수집한 구조대로 치환됩니다. 들여쓰기는 항목 내용이 시작하는 열로, 제목이 있는 열이거나, 제목이 항목의 뒷줄에 있으면 항목을 여는 줄의 열이며, 그 줄에 표시만 있으면 표시 다음 열이고, 탭은 다음 4의 배수까지입니다.

바깥 블록의 일부가 원문에 남는 경우에는 같은 파일의 `unreplaceableSection`이 구조가 다른 사본을 컴파일하는 대신 규칙을 거부합니다.

- 제목 앞에 인용문이나 콜아웃의 `>`가 있을 때
- 각주의 들여쓰기가 남을 때
- 절이 컴포넌트나 `:::` 지시문, markdown-it 컨테이너의 끝까지 이어지고 마지막 줄이 그 블록을 닫는 `:::`나 태그일 때

오류는 `cudoc: <document>#<id> starts inside <a quote | a callout | a footnote | a container | a component | a <type> block>, and <reason>, so a replace rule cannot rewrite it; …`입니다. 저장된 트리와 원문만으로 판단하며, `cudoc check`는 같은 경우를 `unreplaceable-embed-section`으로 보고합니다. 컴포넌트나 컨테이너 안에서 뒤에 다른 제목이 이어지는 절과 모든 최상위 절은 평소처럼 치환하며, 규칙 없이 임베드하면 수집한 트리 그대로 들어갑니다.

## 임베드

해석기는 임베드 명세 하나를 그것이 뜻하는 노드, 곧 복사한 절, 절의 표, 문서의 트리로 바꿉니다. 소스·import: [resolve-embed.ts](../../packages/cudoc/src/node/resolve-embed.ts), `@cudoment/cudoc/node/resolve-embed`.

[tree.ts](../../packages/cudoc/src/node/tree.ts)의 도우미 세 개도 `resolveTree`와 함께 export하므로, 다른 소비자도 `cudoc-export`의 내비게이션처럼 트리와 똑같은 순서와 이름으로 문서를 다룰 수 있습니다.

- `nfc(value)`는 NFC로 정규화합니다.
- `documentName(id)`는 id의 마지막 구간을, `index`라면 그 폴더의 이름을 돌려줍니다.
- `compareNames(a, b)`는 대소문자를 무시하고, 이어진 숫자는 수로 읽으며(`Step 2`가 `Step 10`보다 앞), 나머지는 코드 포인트 순으로 비교하므로 어느 컴퓨터에서든 한글 음절이 사전 순서로 정렬됩니다.

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

`parseEmbedSpec`은 YAML을 읽고 최상위 키와 선택 조건 키, 치환 규칙 키, 소스 목록, 출력 형식, 치환 규칙을 검증합니다. 모르는 키는 세 계층 모두에서 거부하며 메시지에 알려진 키 목록을 함께 보여 줍니다. `regex: true` 없이 쓴 `flags`는 조용히 무시하지 않고 오류로 처리합니다. `sources`는 비어 있으면 안 됩니다. 선택 동작은 [문서 쿼리](./document.ko.md#섹션과-쿼리)에 정의되어 있습니다.

`parseEmbedBlock(value, documentId, number?)`은 이 함수를 감싸서, 실패했을 때 문서와 블록 번호를, 파서 오류라면 줄과 열까지 함께 알려 줍니다.

기본 출력은 `section`, 표 기본 열은 `DEFAULT_TABLE_COLUMNS`인 title/link/summary입니다. 표 열은 축약 이름 또는 키마다 검증하는 매핑입니다.

- `value`는 필수이며 세 이름 중 하나, 셀 좌표 매핑(`row`·`column`은 음이 아닌 정수, 선택적 `table` 인덱스와 문자열 `skipTablesWithHeaders`), 또는 단독 `{ extractor }`입니다.
- `link`는 `section`, `parent`, `document` 중 하나입니다.
- `minWidth`는 숫자 뒤에 `px`, `rem`, `em`, `ch`, `%` 가운데 한 단위를 붙인 CSS 길이입니다.

`render`는 `section`이거나 `type`이 `table` 또는 `tree`인 매핑이며, 그 밖의 값은 `cudoc: render must be "section" or a mapping with type: table or type: tree` 오류입니다. 표에는 `type`과 `columns` 외의 키를, 트리에는 `type`, `open`, `print`, `depth`, `headings`, `order`, `columns` 외의 키를 쓸 수 없습니다. 트리는 절의 본문을 복사하지 않으므로 `select`나 `replace`를 쓰면 오류입니다.

트리의 열은 표의 열과 같이 검증하고, 나머지 키는 다음과 같이 검증합니다.

| 키               | 조건                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------- |
| `open`           | 0 이상의 정수                                                                           |
| `print`, `depth` | 1 이상의 정수                                                                           |
| `headings`       | 0부터 5까지의 정수                                                                      |
| `order`          | 비어 있지 않은 문자열의 목록. NFC 기준으로 같은 이름을 두 번 쓸 수 없고 `...`는 한 번만 |

표 출력은 선택된 절마다 `buildEmbedRow`로 `EmbedRow` 하나를 만들며, id를 재기준화하기 전에 읽으므로 셀의 링크가 복사본이 아닌 원본 문서를 가리킵니다. `section.title`은 사본의 최상위 첫 제목(깊이와 무관)의 보이는 글자이며, 제목이 없으면 front matter `title`, 그다음 문서 id입니다. `parent`는 원본 트리에서 그 절 위에 있는 가장 가까운 더 얕은 제목이고, `url`은 문서 경로에 앵커를 붙인 값입니다.

`extractCell`은 열 하나를 글자와 선택적 링크로 바꿉니다. 글자는 열의 `value`에 따라 정해집니다.

| 값              | 글자                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `title`         | `section.title`                                                                                                                          |
| `summary`       | 절의 직접 자식 중 첫 문단의 일반 텍스트                                                                                                  |
| `parent`        | 상위 제목의 제목                                                                                                                         |
| 셀 좌표 매핑    | 표 셀. 절 안의 표를 문서 순서로 세되 머리 행에 `skipTablesWithHeaders`의 이름이 있는 표는 제외하며, `row` 0은 머리 행, 글자는 `nodeText` |
| `{ extractor }` | 추출기의 반환값                                                                                                                          |

열의 `link`는 절의 `url`, 상위 제목의 주소(앵커가 있으면 앵커, 없으면 문서 경로), 문서 경로로 해석되며 추출기가 돌려준 `url`은 열의 `link`보다 우선합니다. 이 주소는 표나 트리가 얼마나 깊이 중첩되든 임베드가 놓일 페이지(`context.documentId`)에서 쓸 주소로 적습니다. 이를 감싸는 사본은 사본 안의 id를 가리키는, 조각만 있는 주소만 그 id의 새 이름으로 바꿉니다.

값이 없으면(문단 없음, 상위 제목 없음, 표·행·셀 부족, 추출기가 `undefined`나 `""`를 반환) `cell.text`는 `""`이고 `problem`이 무엇을 기대했고 절에 무엇이 있는지 적습니다. `buildEmbedTable`은 `minWidth`를 지정한 열의 머리 셀에 `data.hProperties.style`로 `min-width: <minWidth>`를 쓰고 `EmbedRow`마다 행 하나를 씁니다. 라이브러리에 없는 추출기를 부르는 `{ extractor }` 열은 예외를 던집니다.

추출기는 `BuildDocumentsOptions.extractors`, 즉 이름에서 `{ version, extract }`로 가는 맵에서 옵니다. `version`은 비어 있지 않은 문자열이어야 하며 이름순으로 정렬한 `{ 이름: version }`으로 설정 해시에 들어가므로, 추출기가 바뀌면 컴파일러가 바뀔 때처럼 다시 수집합니다.

함수는 런타임의 `Library.extractors`에만 있고 직렬화되지 않으며, 불러온 라이브러리에는 없습니다. 준비된 임베드에는 문제가 없고, `{ extractor }` 열을 새로 해석할 때에만 오류가 됩니다. 검사는 표 임베드를 새로 해석하므로 `cudoc check`는 설정의 `extractors`를 불러온 라이브러리에 붙입니다. 불러온 라이브러리를 직접 검사하는 프로그램은 `library.extractors`를 스스로 설정합니다.

트리 출력은 원본마다 `resolveTreeSource`로 읽습니다. `/`로 끝나는 경로는 폴더이며 `from` 기준으로, `/`로 시작하면 라이브러리 맨 위 기준으로 해석합니다. 그 밖의 경로는 `resolveDocumentReference`와 같이 문서를 가리키며, id는 NFC로도 비교합니다. 없는 문서의 경로가 문서를 가진 폴더라면 문서 누락 메시지에 `; a folder source ends with /, as in <경로>/`가 붙습니다.

폴더 원본은 다음 메시지 가운데 하나로 실패합니다.

- `cudoc: a folder source takes no anchor: <참조>`: 앵커를 붙인 폴더 원본
- `cudoc: embed source escapes root: <참조>`: 루트를 벗어나는 폴더 원본
- `cudoc: no documents in folder <참조> referenced from <from>`: 아래에 문서가 없는 폴더
- `cudoc: folder <참조> referenced from <from> holds only private documents, which a tree on <page> leaves out`: 트리가 놓이는 문서 `page`를 주었을 때 문서가 모두 `private`인 폴더(그 페이지가 `private`이면 예외)

문서의 계층은 [tree.ts](../../packages/cudoc/src/node/tree.ts)가 문서 목록마다 한 번 계산하며, id는 NFC로 비교합니다. 문서 자신의 폴더부터 위로 올라가면서, 폴더를 대표하는 문서 가운데 그 문서 자신이 아닌 첫 문서가 상위 문서가 됩니다. 대표 문서는 `<폴더>.md`를 `<폴더>/index.md`보다 먼저 보며, 라이브러리 맨 위는 `index`가 대표합니다. 그래서 `X.md`는 `X/`의 문서를 하위로 받고, `X/index.md`는 `X.md`가 없으면 `X/`의 나머지 문서를 받고 `X.md`가 있으면 그 아래에 달리며, 대표 문서가 없는 폴더는 건너뜁니다.

폴더 원본의 첫 층은 폴더 안의 문서 가운데 상위 문서가 그 폴더 안에 있지 않은 문서이며, 폴더를 대표하는 문서는 빠집니다. 문서 원본은 줄 하나이고, 앵커가 붙은 원본은 `collectSections`가 그 앵커로 찾은 제목마다 줄 하나이며 각 줄은 `headings` 범위 안의 더 깊은 제목을 하위로 가집니다. 문서 줄 아래에는 단계가 `depth` 안에 있는 동안 깊이 2부터 `headings + 1`까지의 제목이 문서 순서대로 깊이에 따라 중첩되어 달리고(`depth`를 넘은 제목은 그 아래 제목도 함께 뺍니다), 그다음에 그 문서를 상위로 둔 문서가 달립니다.

폴더 원본이나 상위 문서가 들여오는 `private` 문서는 그 아래 줄과 함께 뺍니다. 내보내기가 비공개 문서를 쓰지 않아 그 문서로 링크할 수 없기 때문입니다. 다만 트리가 놓이는 페이지 `context.documentId`가 `private`이면 빼지 않으며, 수집된 문서를 가리키지 않는 id는 `private`가 아닌 페이지로 봅니다. 문서 원본은 그 문서가 무엇이든 가리킵니다.

첫 층은 `sources`에 적은 순서를 따릅니다. 폴더 원본이 가져온 문서와 모든 줄 아래의 문서는 `title`, `name`, `id` 순으로 정렬하며, 대소문자를 무시하고 연속된 숫자는 값으로, 그 밖에는 코드 포인트로 비교하므로 순서가 로캘을 따르지 않습니다. 그다음 `order`가 같은 순위의 순서를 유지하며 첫 층을 옮깁니다. 줄은 `namesTreeNode`가 일치시키는 첫 항목, 곧 `name`이나 `title`이 NFC 기준으로 같은 항목의 자리로 가고, 그 밖의 줄은 `...`의 자리로, `...`가 없으면 끝으로 갑니다.

문서 줄의 행에는 앵커가 없고 `url`은 문서 경로입니다. 제목은 문서의 `#` 제목, 곧 최상위 블록 가운데 또는 최상위 `header` 요소 안의 첫 깊이 1 제목의 보이는 글자입니다. `header` 요소는 Docusaurus가 페이지 제목을 읽는 제목을 넣는 곳입니다. 그런 제목이 없으면 앞부분 정보의 비어 있지 않은 문자열 `title`을, 그것도 없으면 확장자를 뺀 파일 이름(index 문서라면 폴더 이름)을 NFC로 쓴 `name`을 씁니다. 행의 `section.tree`는 제목을 담은 블록부터 다음 제목 블록 전까지이고, 제목이 없으면 문서 전체이므로 `summary`는 제목 다음의 첫 문단입니다.

제목 줄의 행은 그 절의 `buildEmbedRow`이고, `name`은 NFC로 쓴 제목입니다. 칸은 트리를 다 만든 뒤 가장 깊은 줄부터 채우므로, 추출기의 `context.node`에는 그 아래 줄이 모두 채워져 있습니다. `extractCell`은 `node` 인자를 그 `node`로 넘깁니다. 트리의 `data.cudocDependencies`는 줄을 읽어 온 문서이며, `{ extractor }` 열이 있으면 `"*"`가 더해집니다.

트리는 절의 본문을 복사하지 않으므로 그 안에서 펼치거나 이름공간을 붙이는 것은 없습니다. 복사된 절 안의 트리는 그 사본을 가져온 문서를 기준으로 해석하며, 트리의 링크는 이미 페이지의 주소이므로, 이를 감싸는 사본은 아래의 경로 조정 규칙대로 다룹니다.

`buildEmbedTree`는 `spread: false`인 순서 없는 `list`를 쓰며, 여기에 `data.cudoc.kind: "tree"`와 `className: ["cudoc-tree"]` `hProperties`를, `print`가 있으면 `data-cudoc-print`도 붙입니다. 아래에 다른 줄이 있는 줄은 `hName: "details"`인 `blockquote`를 담은 `listItem`이며, 단계가 `open` 이하이면 `hProperties.open: true`가 붙고, 그 자식은 `hName: "summary"`인 `paragraph`로 쓴 줄과 중첩된 `list`입니다. 아래 줄이 없는 줄은 `className: ["cudoc-tree-leaf"]`인 `listItem`이 그 줄을 `paragraph`로 담습니다.

줄은 비어 있지 않은 칸을 `·`로 이은 것이며, `url`이 있는 칸은 `link`이고, 모든 칸이 비어 있으면 제목만 씁니다. 페이지 단위 출력이 트리를 알아보는 값은 `@cudoment/cudoc/paged`가 내보냅니다. `TREE_KIND`, `TREE_CLASS`, `TREE_PRINT_ATTRIBUTE`, `isTree(node)`, 그리고 인쇄 깊이나 `Infinity`를 돌려주는 `treePrintDepth(value)`입니다.

참조는 `context.documentId`의 상대 경로이며 `/`로 시작하면 문서 루트 기준입니다. `.md`/`.mdx`와 `#anchor`를 지원하며, 앵커는 퍼센트 인코딩을 풀어 읽고 이스케이프가 아닌 `%`가 있으면 `cudoc: embed source has a malformed percent-escape: <참조>` 오류입니다. URL, 역슬래시 경로, 루트 이탈, 없는 문서는 오류입니다. 문서는 문서 목록마다 한 번 만드는 색인으로 찾으므로, 큰 라이브러리의 블록을 모두 해석해도 참조마다 목록을 훑지 않습니다. 앵커와 선택 조건이 모두 없으면 문서 전체를 사용합니다.

해석은 소스 AST를 복제하며 원본 소스와 AST는 수정하지 않습니다. 치환이 있으면 원본의 선택 범위를 읽고 규칙을 순서대로 적용한 뒤 기존 컴파일러·옵션으로 다시 컴파일합니다. 일반 치환은 split/join으로 전체 일치를 바꾸고, 정규식은 JavaScript `RegExp`를 사용하며 기본 플래그는 `g`입니다. 선택 범위 밖의 정의는 바꾸지 않고 추가합니다. 비동기 API는 처리별 컴파일 캐시로 비동기 컴파일러를 사용합니다.

반환된 루트에는 렌더러가 각주 레이블을 구분하는 데 쓰는 `data.cudocEmbedPrefix`(`cudoc-<문서 id>-<prefix 또는 embed>-`, 문서 id는 [`idToken`](./document.ko.md#문서-옵션)으로 표기)와 `data.cudocDependencies`가 있습니다. 후자는 해석이 읽은 모든 문서의 id를 정렬한 목록으로, 펜스의 sources와 그 안에 중첩된 임베드의 sources를 포함하며, `{ extractor }` 열이 실행되었으면 추출기가 어떤 문서든 읽을 수 있으므로 `"*"`가 더해집니다. 트리라면 줄을 읽어 온 문서입니다.

ID·각주·정의를 구분하고 링크·이미지·지원하는 raw HTML 속성 경로를 조정합니다. 노드마다 경로 조정은 그 노드를 담은 가장 안쪽 사본에서 한 번만 합니다.

안쪽 사본이 이미 조정한 노드나 표와 트리가 쓴 노드는 이미 페이지의 주소를 담고 있으므로, 바깥 사본은 그 노드의 id를 바꾸고, 사본 안의 id를 가리키는 조각만 있는 주소를 그 id의 새 이름으로 고칠 뿐, 다른 주소는 그대로 둡니다. 이 주소를 원본 경로로 다시 읽으면, `routes`가 어떤 문서에 다른 문서의 경로를 줄 때 경로가 다른 문서를 가리킬 수 있고, 라이브러리 밖으로 올라가는 경로는 엉뚱한 디렉터리를 기준으로 다시 적히기 때문입니다.

조정하는 raw HTML 속성은 내보내기가 복사하는 자산과 같은 `href`, `src`, `poster`, `data`, `xlink:href`와 `srcset`의 각 후보이며, `srcset` 후보의 너비나 밀도 표기는 그대로 둡니다. 낮춘 요소의 같은 `hProperties`(`srcSet` 포함)도 같은 방식으로 조정합니다.

주소는 쓴 형태에 따라 조정합니다.

- 조각 링크는 복사본에 그 id가 있으면 복사본 안을 계속 가리키고, 없으면 원본 문서 경로에 조각을 붙인 주소가 됩니다.
- 경로가 없는 링크(`?tab=2`, 빈 `href`)는 원본 문서의 디렉터리가 아니라 복사해 온 원본 문서 자체를 가리킵니다.
- 상대 경로는 원본 문서의 라이브러리 경로를 기준으로 해석합니다. 수집된 문서를 라이브러리 경로나 id로 가리키는 경로(`/guide/setup.md`, `/guide/setup`, `/guide/setup/`)와 index 문서의 디렉터리를 가리키는 경로(`guide/index`의 `/guide/`)는 그 문서의 경로가 되고, 그 밖의 경로는 정규화한 루트 상대 경로로 남습니다.
- 끝에 슬래시를 붙여 쓴 디렉터리는 같은 이름의 문서가 옆에 있어도 index 문서를 가리키며, 슬래시 없이 쓰면 같은 이름의 문서를 가리킵니다. `.`와 `..` 경로도 같은 방식으로 디렉터리를 가리킵니다.

`internal/notes.md`의 `../../outside.png`처럼 라이브러리 루트 밖으로 올라가는 상대 경로는 라이브러리 경로가 없고, 루트에서 잘라 내면 다른 파일을 가리키게 됩니다. 그래서 임베드하는 문서 기준으로 다시 적습니다(`guide.md`에서는 `../outside.png`). 라이브러리에 루트가 있으면 두 파일의 실제 디렉터리를 기준으로 삼아 같은 파일에 닿고, 없으면 작업 디렉터리와 상관없이 라이브러리 경로만으로 계산합니다. 디렉터리는 index를 가리키는 끝의 슬래시를 유지합니다. 임베드하는 문서를 알 수 없으면 쓴 그대로 둡니다.

Docusaurus가 Markdown 이미지([`data.cudocImage`](./document.ko.md#의미-ast))나 로컬 파일로 가는 링크를 쓰는 방식처럼 속성이 webpack 로더 뒤에 `./`나 `../`로 시작하는 상대 모듈을 `require()`하는 JSX 요소는, 사본이 들어가는 파일의 디렉터리 기준으로 그 경로를 다시 씁니다. 이때 경로를 JavaScript 문자열로 읽은 뒤, 원래 따옴표에 맞춰 이스케이프한 문자열로 다시 적습니다. 사본이 얼마나 깊이 중첩되었든 한 번만 다시 쓰므로 다른 디렉터리의 페이지에서도 모듈을 찾을 수 있습니다.

라이브러리에 루트가 있으면 파일의 디렉터리를, 없으면 라이브러리 경로의 디렉터리를 기준으로 삼으며, 후자는 모든 루트의 기준 경로가 디렉터리 이름과 같을 때에만 파일의 디렉터리와 일치합니다. 임베드하는 문서의 id가 수집된 문서를 가리키지 않으면 수집한 경로를 그대로 둡니다.

누락된 섹션, 순환 의존성, 처리할 수 없는 치환, 64를 초과한 깊이는 문맥을 포함한 오류입니다. 독립적인 `resolveEmbed` 결과를 합칠 때는 서로 다른 `prefix`를 사용합니다. 전체 문서·준비 API는 블록 번호를 직접 관리합니다.

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

`resolveTree(library, spec, context)`는 트리 임베드가 그리는 줄을 돌려줍니다. 생성한 페이지에 트리를 블록으로 적어 두는 아웃라이너처럼, 트리를 자기 형식으로 쓰는 프로그램을 위한 함수입니다. `spec`은 `render`가 트리인 임베드이며 `parseEmbedSpec`과 같이 검증합니다. 다른 출력이면 `cudoc: resolveTree needs an embed whose render is a tree` 오류이고, 아무것도 가리키지 않는 원본에는 해석기와 같은 오류를 던집니다. `context.documentId`는 상대 원본을 해석하는 기준이자 추출기가 받는 값이며, `prefix`는 쓰지 않습니다.

`open`과 `print`가 무엇이든 `depth`까지의 모든 단계가 들어 있습니다. 결과는 일반 데이터이므로 같은 라이브러리와 명세는 같은 `JSON.stringify` 출력을 내며, 자기가 쓴 내용을 해시로 확인하는 프로그램은 이 성질에 기댈 수 있습니다. `buildEmbedTree(nodes, render)`는 줄을 `resolveEmbed`가 만드는 mdast로 바꾸므로, 줄을 먼저 고친 프로그램도 임베드와 같은 방식으로 렌더링할 수 있습니다. 아래 예시는 `cudoc collect`가 `.cudoc/documents`에 출력한 라이브러리를 읽어 트리를 아웃라이너의 들여쓴 블록으로 출력합니다.

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

준비된 임베드는 라이브러리의 모든 임베드 블록을 한 번 해석해 `embeds.json`에 저장한 것이므로, 호스트 빌드는 해석 없이 접합만 합니다. 소스·import: [prepare-embeds.ts](../../packages/cudoc/src/node/prepare-embeds.ts), `@cudoment/cudoc/node/prepare-embeds`.

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

`prepareEmbeds`는 전체 수집 문서의 코드 블록 임베드를 비동기로 처리하고 `embeds.json`을 원자적으로 교체합니다. 무엇이든 쓰기 전에 모든 블록을 해석하며, 실패한 블록이 있으면 아무것도 쓰지 않습니다. 기본 `outDir`는 `.cudoc/documents`이며 **라이브러리에서 추론하지 않습니다**. 사용자 수집 경로는 명시적으로 전달합니다.

실패한 블록이 하나면 해석기의 오류를 `cause`로 감싼 `cudoc: <sourcePath>, embed <number>: <message>` 오류를 던지고, 여럿이면 `AggregateError` 하나로 던집니다. 이 오류의 `errors`는 개별 실패이고, 메시지는 `cudoc: <n> embeds could not be prepared:` 뒤에 블록마다 한 줄(`<sourcePath>, embed <number>: <message>`)이 이어집니다.

`PreparedEmbeds`는 `schemaVersion: 2`, `configuration`, `sourceHashes: Record<string,string>`, `blocks: Record<string,Root>`, 그리고 같은 키 아래에 각 블록의 `cudocDependencies`를 담은 `dependencies: Record<string,string[]>`를 가집니다. 키는 `documentId:index:sha256(fenceValue)`이며 블록 번호는 1부터입니다.

`readPreparedEmbeds`는 스키마, manifest 설정, 현재 문서 소스 해시, manifest 문서 해시를 검사합니다. 없거나 오래된 데이터는 재수집을 안내하는 오류이며, 이전 버전이 쓴 파일도 오래된 데이터입니다. 반환된 객체는 호출 사이에 공유되므로, 블록을 자기 트리에 넣기 전에 복사합니다.

`embeds.json`과 `manifest.json`은 해석한 `outDir`마다 한 번 파싱하고, 두 파일의 inode, 크기, 수정 시각이 그대로인 동안 유지하므로 페이지마다 또는 블록마다 묻는 호스트가 파일을 다시 파싱하지 않습니다. 출력할 때마다 두 파일이 모두 교체되므로 재수집 뒤의 다음 호출은 새 파일을 읽습니다.

`expandPreparedEmbeds`는 모든 호스트 통합이 수행하는 접합입니다. `tree`의 `cudoc-embed` 펜스를 문서 순서대로 각 펜스의 준비된 블록 복사본의 자식으로 바꾸고, 제자리에서 수정한 같은 트리를 반환합니다. remark 임베드 플러그인, markdown-it 어댑터, `cudoc-export`의 `library` 모드가 모두 이 함수로 접합합니다.

`target`은 출력된 라이브러리(`outDir`), 임베드하는 문서와 수집 당시의 원문이며, 첫 펜스를 만났을 때에만 읽으므로 임베드가 없는 문서에는 라이브러리가 필요하지 않고, 함수를 넘기면 대상을 찾는 작업을 그때까지 미룹니다. `onBlock`은 각 복사본을 접합하기 전에 받습니다. 준비된 블록이 없는 펜스는 `cudoc: prepared embed missing in <id>; recollect documents` 오류입니다.

`previous`를 주면 다음 네 조건이 모두 맞는 블록을 해석하지 않고 그 결과에서 가져옵니다.

- 설정이 같습니다.
- 문서 id 집합이 같습니다. 문서가 추가되거나 삭제되면 어느 블록 안의 링크든 해석 결과가 바뀔 수 있습니다.
- 임베드하는 문서의 해시가 같습니다.
- 블록의 `dependencies`에 있는 모든 id의 해시가 그대로입니다.

`dependencies`에 `"*"`가 있는 블록은 항상 다시 해석합니다. 기록되는 파일은 어느 경우에나 완전하며 절약되는 것은 작업량입니다.

`buildDocuments` 다음에 `prepareEmbeds`를 부르면 라이브러리, 그다음 `embeds.json` 순서로 두 번 출력합니다. 그 사이에 준비가 실패하면 준비된 임베드가 없는 라이브러리가 남고, 준비가 성공할 때까지 호스트 빌드가 재수집을 요구합니다. `cudoc collect`가 실행하는 [`collectDocuments`](#감시)는 라이브러리 자체의 출력이 쓰는 임시 디렉터리에 준비하므로, 라이브러리와 `embeds.json`이 함께 교체되거나 둘 다 그대로 남습니다.

## 감시

`collectDocuments`는 라이브러리와 준비된 임베드를 한 번의 출력으로 묶은 수집 회차 하나를 실행하고, `watchDocuments`는 변경이 있을 때마다 이를 다시 실행합니다. 소스·import: [watch.ts](../../packages/cudoc/src/node/watch.ts), `@cudoment/cudoc/node/watch`.

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

`collectDocuments`는 CLI `collect`가 하는 일의 한 회차입니다. 설정에 `compiler`가 있으면 비동기 수집기로(반환값은 promise여도 값이어도 됩니다), 없으면 동기 수집기로 라이브러리를 컴파일하고 임베드를 해석한 뒤, 둘을 [`publishDirectory`](#저장) 트랜잭션 한 번으로 `outDir`에 출력합니다. 두 단계에 `previous.library`와 `previous.prepared`를 넘겨 바뀌지 않은 문서와 영향 없는 블록을 재사용합니다. 모든 임베드가 해석되기 전에는 아무것도 쓰지 않으므로, 실패한 회차는 이전 라이브러리와 그 `embeds.json`을 서로 맞는 상태 그대로 남깁니다.

회차 결과는 컴파일한 문서 id(전체 회차에서는 모든 id), 재사용한 문서와 블록의 수, 소요 시간을 담습니다. `previousCollection(outDir)`은 끝난 실행이 `outDir`에 남긴 것을 불러옵니다. 라이브러리는 `loadLibrary`로, 준비 결과는 스키마가 현재 것일 때 읽으므로 새 프로세스가 지난 실행에서 이어 갑니다. 라이브러리가 없거나 읽을 수 없거나 호환되지 않으면 `{}`를 반환하고, 준비 결과만 그렇다면 `{ library }`를 반환합니다.

`watchDocuments`는 한 회차를 실행한 뒤, 어느 루트 아래에서든 `.md`·`.mdx` 파일이 생기거나 바뀌거나 이름이 바뀌거나 삭제되면 `debounce` 밀리초(기본 150)의 정지 후 다시 실행합니다. 각 루트 디렉터리에 `fs.watch`를 재귀로 겁니다. 회차 도중의 변경은 한 회차를 더 예약합니다. `reuseOutput: false`가 아니면 첫 회차는 `previousCollection(outDir)`에서 시작합니다.

디렉터리나 더는 없는 항목이 바뀌어도 회차를 시작하는데, 문서가 든 디렉터리의 이름이 바뀌었거나 옮겨졌거나 삭제되었을 수 있기 때문입니다. 항목은 이름으로 판단하지 않고 디스크에서 확인하므로 `v1.5/`도 해당합니다. 수집이 읽지 않는 숨김 항목과 `node_modules` 아래의 변경은 무시합니다.

실패한 회차(컴파일되지 않는 문서, 원본이 없는 임베드)는 `onError`로 가고, 마지막 성공 회차의 상태를 다음 회차에 그대로 쓰며, 출력 디렉터리에는 그 회차의 라이브러리와 임베드가 남고, 감시는 계속됩니다. 운영체제가 감시할 파일 수를 더 허용하지 않거나 루트가 삭제되는 등 파일 감시기 자체가 내는 오류도 프로세스를 끝내지 않고 `onError`로 갑니다. `onError`가 없으면 오류를 stderr에 출력합니다.

`ready`는 첫 회차가 성공하든 실패하든 끝나고, 그 회차 도중의 변경이 예약한 회차까지 끝나면 확정됩니다. 다만 이것이 변경이 이미 보고되고 있다는 뜻은 아닙니다. macOS에서는 재귀 감시가 호출 직후 잠시 뒤에 시작되므로, 첫 회차가 파일을 읽은 뒤 그 사이에 바뀐 파일은 변경이 보고되지 않을 수 있으며, 그러면 다음 변경이 시작하는 회차에서 수집됩니다. `close()`는 감시를 멈추며 진행 중인 회차는 끝까지 실행합니다.

## 참조 검사

`checkReferences`는 수집된 라이브러리의 깨진 링크, 앵커, 이미지, 임베드를 코드가 붙은 문제로 모두 보고하고, `formatCheckResult`가 이를 출력 형태로 렌더링합니다. 소스·import: [node/check.ts](../../packages/cudoc/src/node/check.ts), `@cudoment/cudoc/node/check`, 그리고 [node/report.ts](../../packages/cudoc/src/node/report.ts), `@cudoment/cudoc/node/report`.

`checkReferences(library: Library, options?: CheckOptions): CheckResult`는 모든 문서를 훑어 `{ issues, documentCount, checkedReferences }`를 반환합니다. 읽기만 하며 아무것도 쓰지 않고 라이브러리도 바꾸지 않습니다.

`ReferenceIssue`는 다음 필드를 가집니다.

| 필드                          | 내용                                                                                                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`, `severity`, `message` | 코드, `"error"` 또는 `"warning"`, 메시지                                                                                                                                                                                                                            |
| `documentId`, `sourcePath`    | 참조를 가진 문서. `unused-asset`은 문서가 아니라 파일을 가리키므로 `documentId`는 빈 문자열이고, `sourcePath`와 `reference`는 작업 디렉터리 기준 파일 경로이며, 위치는 없음                                                                                         |
| `reference`                   | 작성자가 쓴 그대로의 글자. URL은 `sourceForms`가 원문에서 찾은 첫 형태로 담으므로, 호스트가 `guide`로 저장한 링크도 작성자가 쓴 `guide.md`로 보고                                                                                                                   |
| `position`                    | 선택적                                                                                                                                                                                                                                                              |
| `available`                   | `missing-anchor`와 `missing-embed-anchor`에서는 대상 문서가 실제로 가진 앵커. `missing-embed-anchor`에서는 제목 id만 나열하는데, raw HTML이 선언한 id는 링크 대상은 될 수 있어도 임베드할 구역을 시작하지 않기 때문. `unmatched-tree-order`에서는 트리 첫 층의 제목 |
| `suggestions`                 | `missing-document`, `missing-asset`, `missing-anchor`, `path-case-mismatch`, `undefined-variable`, `undefined-link-reference`에서 가까운 것부터 최대 세 개의 수정안. 충분히 가까운 대상이 없으면 없음                                                               |

이름이나 경로의 파일 이름은 대소문자만 다르거나, 더 긴 쪽의 세 글자마다 한 번 이하로 고쳐서(최소 한 번) 같아지면 충분히 가깝다고 봅니다. 그래서 `api`에는 `app`을 제안하지만 `cli`는 제안하지 않습니다. `/file/a.csv`처럼 페이지가 아닌 파일을 가리키는 링크는 문서가 아니라 루트나 자산 디렉터리 아래에서 확장자가 같은 파일로 수정안을 만듭니다.

제안하는 경로는 원문에 있는 형태 그대로 쓰므로 참조를 그 가운데 하나로 바꾸면 문제가 해결됩니다. 제안 경로는 다음 규칙을 따릅니다.

- 같은 상대 경로나 루트 상대 경로로 씁니다.
- 링크에 쓴 배포 기준 경로를 `withoutBase`가 제거하고 대상을 그 경로 없이 찾았다면 기준 경로를 유지합니다. 문서와 자산 디렉터리의 파일이 이 경우에 해당하고, 루트 아래의 파일은 쓴 경로 그대로 찾으므로 해당하지 않습니다.
- 링크에 확장자가 있을 때에만 확장자를 붙입니다.
- 쿼리와 조각을 유지합니다.
- 이미지나 그 밖의 파일에 대한 `path-case-mismatch`에서는 링크에 쓴 퍼센트 이스케이프도 유지합니다.

파일 이름으로 만든 경로에서는 공백, `#`, `?`, `%`, `\`, `&`, `<`, `>`를 퍼센트 이스케이프하고, 괄호는 짝이 맞지 않을 때 이스케이프합니다. 그래서 `start here.md`는 `start%20here.md`로 제안합니다. 링크 대상에는 공백을 쓸 수 없고 괄호는 짝을 이룰 때만 쓸 수 있으며, `#`과 `?`는 조각이나 쿼리를, `%`, `\`, `&`는 이스케이프나 문자 참조를, `<`는 꺾쇠괄호로 감싼 주소를 시작하기 때문입니다.

이 표는 코드와 심각도를 나열하며, 규칙 전체는 아래 문단에 있습니다. → [무엇을 보고하는가](../check.ko.md#무엇을-보고하는가)

| 코드                          | 심각도 |
| ----------------------------- | ------ |
| `missing-document`            | 오류   |
| `missing-anchor`              | 오류   |
| `missing-asset`               | 오류   |
| `missing-embed-source`        | 오류   |
| `missing-embed-anchor`        | 오류   |
| `invalid-embed-spec`          | 오류   |
| `duplicate-anchor`            | 오류   |
| `empty-anchor`                | 오류   |
| `unstable-anchor-link`        | 경고   |
| `unmatched-embed-replacement` | 경고   |
| `unreplaceable-embed-section` | 오류   |
| `empty-embed-cell`            | 경고   |
| `unportable-embed-component`  | 경고   |
| `imported-embed-component`    | 오류   |
| `cyclic-embed`                | 오류   |
| `unmatched-tree-order`        | 경고   |
| `table-column-count`          | 오류   |
| `table-unclosed-code`         | 오류   |
| `path-case-mismatch`          | 오류   |
| `missing-translation`         | 경고   |
| `translation-anchor-mismatch` | 경고   |
| `translation-visibility`      | 경고   |
| `invalid-anchor-format`       | 경고   |
| `missing-title`               | 경고   |
| `empty-alt`                   | 경고   |
| `unused-asset`                | 경고   |
| `undefined-variable`          | 오류   |
| `undefined-link-reference`    | 경고   |
| `unmatched-table-note`        | 경고   |

링크와 이미지는 트리에 저장된 대로 검사합니다. remark 호스트가 `linkReference`나 `imageReference`로 저장하는 참조형 링크와 이미지는, markdown-it 호스트가 직접 해석해 링크나 이미지로 저장하는 것처럼, 그 레이블의 첫 정의가 주는 주소로 검사하고, 그 정의가 주소를 쓴 위치에 보고합니다.

`CheckOptions`는 다음 필드를 받으며, 각각은 아래에 설명합니다.

| 옵션                  | 의미                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ignore`              | 결과에서 제외할 코드                                                                                                                                                                                                     |
| `sourceRoot`, `roots` | 문서가 디스크의 어디에 있는지. 기본값은 라이브러리 자체의 루트. 루트가 전혀 없으면 파일 검사는 건너뛰고 문서 링크·앵커·임베드만 검사하며, 어떤 참조도 파일로 해석하지 않았으므로 `unusedAssets`도 아무것도 보고하지 않음 |
| `assetDirs`           | 루트 다음에 로컬 대상을 그 라이브러리 경로로 한 번 더 찾는 디렉터리                                                                                                                                                      |
| `withoutBase`         | 루트 상대 경로를 한 번 더 찾을 때 떼어 내는 배포 기본 경로                                                                                                                                                               |
| `externalPaths`       | 같은 호스트에서 다른 애플리케이션이 담당하는 루트 상대 접두어. 그 아래의 링크는 검사하지 않음                                                                                                                            |
| `siteOrigins`         | 출처 URL 목록. 그중 하나로 시작하는 절대 URL은 출처 뒤의 루트 상대 경로로 검사                                                                                                                                           |
| `translations`        | 문서끼리 비교할 둘 이상의 `{ code, prefix?, suffix? }` 언어                                                                                                                                                              |
| `anchorPattern`       | 모든 명시 제목 앵커 전체에 맞아야 하는 정규식 소스                                                                                                                                                                       |
| `requireTitle`        | `missing-title`을 보고                                                                                                                                                                                                   |
| `requireAlt`          | `empty-alt`를 보고                                                                                                                                                                                                       |
| `unusedAssets`        | 작업 디렉터리 기준 글롭 패턴. 그에 맞는 모든 파일을 어떤 문서든 참조해야 함                                                                                                                                              |

문서 링크는 라이브러리 좌표에서 해석합니다. 상대 경로는 문서의 라이브러리 경로를 기준으로, 루트 상대 경로는 라이브러리 경로 그대로, 그리고 `withoutBase`가 있으면 배포 기본 경로를 뗀 형태로 한 번 더 찾는데 이는 내보내기가 경로를 찾는 방식과 같습니다. 라이브러리 맨 위보다 더 올라가는 상대 경로는 어떤 문서도 가리키지 않습니다.

`./`나 `guide/`처럼 디렉터리를 가리키는 경로는 그 디렉터리의 index 문서로 해석하며, 끝에 슬래시가 있으면 같은 이름의 문서가 옆에 있어도 index 문서로, 슬래시가 없으면 같은 이름의 문서로 해석합니다. 쿼리는 다른 문서를 가리키지 않으므로 `guide/?tab=1`은 `guide/`로 검사합니다.

경로는 먼저 퍼센트 인코딩을 풀어 읽으며, `100%.md`처럼 이스케이프가 아닌 `%`가 있으면 검사를 끝내지 않고 쓴 그대로 찾아 해당 문서와 함께 누락으로 보고합니다. 호스트가 ASCII가 아닌 조각을 퍼센트 인코딩하므로 조각은 쓴 그대로든 풀어 읽은 것이든 앵커와 맞으면 됩니다.

`externalPaths`는 같은 호스트에서 다른 애플리케이션이 담당하는 루트 상대 접두어 목록이며(`/sdk` 등), pathname이 그 접두어 자체이거나 그 아래에 있는 링크는 외부로 보아 검사하지 않습니다. 이 판정 함수 `isExternalPath(url, prefixes)`도 export합니다.

로컬 링크와 이미지는 그다음 [`resolveLocalTarget`](../../packages/cudoc/src/node/local-target.ts)으로 해석하며, 이 함수는 `isExternalPath`, `externalUrl`, `parseSrcSet`과 함께 `@cudoment/cudoc/node/local-target`에서 export합니다. `cudoc-export`이 자산을 복사할 때 쓰는 것과 같은 함수이므로, 대상의 존재 여부를 두고 검사기와 출력기가 어긋날 수 없습니다. 그 함수의 `LocalTargetRoots`는 `{ roots, assetDirs?, withoutBase?, externalPaths? }`이며, 문서 상대 경로는 그 라이브러리 경로를 담는 루트를 거쳐 디스크에 닿습니다.

`resolveLocalTarget(url, documentSourcePath, roots)`는 `LocalTarget`을 반환합니다. 프래그먼트, 스킴, 프로토콜 상대 URL, `externalPaths` 아래 경로는 `{ kind: "external", url }`입니다. 있는 파일은 `{ kind: "resolved", relative, source, suffix }`이며, `relative`는 라이브러리 경로나 자산 디렉터리 아래 경로, `source`는 디스크의 파일, `suffix`는 적힌 그대로의 쿼리와 프래그먼트입니다. 그 밖에는 `{ kind: "missing", relative, suffix }`입니다.

이 함수는 URL이 가리킬 수 있는 파일을 차례로 시도합니다. 먼저 URL이 가리키는 라이브러리 경로로 루트 아래에서 찾고, 다음으로 기본 경로를 뗀 루트 상대 경로로 각 자산 디렉터리 아래에서 찾습니다. `parseSrcSet(value)`는 HTML 표준이 읽는 방식대로 `srcset`의 `{ url, descriptor }` 후보를 반환합니다. URL은 다음 ASCII 공백까지이고, URL 끝의 쉼표는 구분자로 보며, 빈 후보는 건너뛰고, 설명자는 괄호 밖의 다음 쉼표까지입니다. 임베드 해석기와 내보내기가 모두 이 함수로 `srcset`을 읽습니다.

`siteOrigins`는 출처 URL 목록입니다. 각 항목은 `scheme://host[:port]`로 줄이며, 파싱되지 않거나 `http`·`https`가 아니면 예외를 던집니다. 링크나 이미지의 절대 URL이 그 가운데 하나로 시작하고(대소문자 무시), 그 뒤가 `/`, `?`, `#`이거나 아무것도 없으면, 출처 뒤의 루트 상대 경로로 위의 모든 단계를 거쳐 검사하고 보고에는 쓴 그대로의 URL을 씁니다.

`anchorPattern`은 모든 명시 제목 앵커 전체에 맞춰 보는 정규식 소스입니다(`u` 플래그로 `^(?:pattern)$`). 컴파일되지 않으면 예외를 던지고, 맞지 않는 앵커는 앵커 표기 위치에 `invalid-anchor-format`으로 보고합니다.

`requireTitle`은 트리 어디에도 보이는 글자가 있는 1단계 제목이 없고 [`documentTitle`](./document.ko.md#페이지-메타데이터)이 받아들이는 frontmatter `title`도 없는 문서를 1:1 위치의 `missing-title`로 보고합니다. Docusaurus는 페이지의 `#` 제목을 `<header>`로 감싸며, 배지는 글자로 치지 않습니다. 받아들이는 `title`은 공백만 있지 않은 문자열이나 숫자입니다. `requireAlt`는 대체 텍스트가 비었거나 공백뿐인 Markdown 이미지, 또는 그 이미지를 대신하는 호스트 컴포넌트를 `empty-alt`로 보고합니다.

`unusedAssets`는 작업 디렉터리 기준으로 읽는 [수집 방언](#수집)의 글롭 패턴 목록입니다. 각 패턴에서 `*`나 `?`가 없는 앞쪽 세그먼트가 훑을 폴더를 정하고(점으로 시작하는 항목과 `node_modules`는 건너뜀), 패턴에 맞는 파일 가운데 검사 중에 어떤 링크, 이미지, 정의(`![alt][label]`이 인용하는 `[label]: ./chart.svg`)도 해석되어 닿지 않은 파일은 `unused-asset`입니다. 경로는 `fs.realpathSync.native`가 쓰는 표기로 비교합니다.

raw HTML, `<img src={img}>`처럼 속성이 표현식이라 JSX 요소로 남은 MDX 요소, frontmatter는 읽지 않으므로 그곳에서만 참조하는 파일도 보고됩니다.

`path-case-mismatch`는 어느 디스크에서나 같은 방식으로 판정합니다. 경로가 어떤 문서도 가리키지 않지만 대소문자를 무시하고 id를 비교하면 문서를 가리키는 링크는, 그 문서의 라이브러리 경로를 링크를 쓴 방식대로 써서 보고합니다.

파일 검사가 해석한 로컬 대상은 URL이 직접 쓴 세그먼트(`.`와 `..` 제외)를 디렉터리 목록과 하나씩 대조하며, 대소문자를 무시하는 디스크에서만 해석되는 대상이면 보고합니다. 대소문자를 구분하는 디스크에서는 같은 URL이 아무것도 가리키지 않는데, 누락으로 보고하기 전에 `resolveLocalTarget`이 시도하는 파일을 같은 방식으로 찾으므로 두 디스크에서 판정과 제안이 같습니다.

`translations`는 코드가 서로 다른 둘 이상의 `{ code, prefix?, suffix? }` 언어 목록입니다. 접두어와 접미사가 모두 없는 언어는 하나만 둘 수 있으며, 다른 언어가 차지하지 않은 id를 모두 받습니다. 문서는 접두어로 id가 시작하고 접미사로 id가 끝나며 둘을 뗀 키가 비어 있지 않은 첫 언어에 속하고, 키가 같은 문서끼리 번역입니다.

각 문서에서 다른 각 언어의 대응 문서가 없으면 `missing-translation`입니다(`reference`는 기대한 id). 문서에 있고 대응 문서가 제공하는 앵커 가운데에는 없는 명시 앵커는 최대 다섯 개를 이름으로 든 `translation-anchor-mismatch` 하나로 대응 문서에 보고합니다. 공개 문서의 대응 문서가 비공개이면 공개 문서에 `translation-visibility`를 보고합니다. 이 셋은 1:1 위치에 둡니다.

라이브러리를 `variables`와 함께 수집했다면, 정규화가 치환하는 필드(탭 레이블과 코드 블록 제목 포함)에 트리가 아직 담고 있는 `(=이름)` 표지(`cudoc-` 펜스 밖)는 라이브러리가 정의하지 않은 변수를 가리키므로 `undefined-variable`(오류)입니다. 표지와 문서마다 한 번 보고하며, 가장 가까운 정의 이름을 `(=이름)` 형태의 제안으로 붙입니다.

공유 링크 참조로 만든 링크는 그 링크가 나온 `[label]` 위치에 문제를 보고하며, 메시지 끝에 ` (the shared link reference [label] in linkReferences)`를 붙이고, 수정할 곳이 설정이므로 `suggestions`는 붙이지 않습니다. 그런 링크는 정규화가 `data.cudoc.kind: "reference"`로 표시한 링크와, markdown-it 호스트가 직접 해석해서 원문이 `sourceForms`의 어떤 형태로도 주소를 쓰지 않았으나 `linkReferences`의 주소와 맞는 링크입니다.

라이브러리를 `linkReferences`와 함께 수집했다면, 텍스트 노드에 남은 전체 참조 `[text][label]`나 축약 참조 `[label][]` 가운데 레이블에 문자가 있고 대괄호가 없으며 원문에 쓴 그대로 있는 것은 아무도 정의하지 않은 레이블을 가리키므로 `undefined-link-reference`(경고)입니다. 레이블과 문서마다 한 번 보고하고, 가장 가까운 공유 레이블을 `[label]` 형태의 제안으로 붙입니다. `\[text\]\[label\]`처럼 원문이 대괄호를 이스케이프한 참조는 작성자가 텍스트로 의도한 것이므로 보고하지 않습니다.

위치는 원문이 코드 밖에서, 홀수 개의 역슬래시 뒤가 아닌 자리에 그 참조를 처음 쓴 곳입니다. 펜스 코드, 들여쓴 코드, raw HTML 블록, front matter, MDX 표현식, 코드 스팬에 쓴 예문은 건너뛰며, 문단의 여러 줄에 걸친 코드 스팬도 마찬가지입니다.

수집이 표 주석을 읽었다면, 즉 `syntax.tableNote`가 cudoc 문법을 받거나, `tableNote`가 `off`가 아닐 때 `Footnote`가 주석인 `docs` 호스트라면, 모든 표를 바로 뒤에 이어지는 `tableNote` 전부와 비교합니다. `docs` 프로필의 `Footnote`는 하나하나가 별도의 주석이기 때문입니다. 표는 GFM `table`이거나 HTML 요소 이름으로 작성했거나 배치 규칙이 그 이름의 요소로 다시 만든 표이며, `docs` 호스트는 `Table` 계열 컴포넌트에도 HTML 이름을 주므로 이 표들도 검사합니다. 배치 규칙의 `components`처럼 그 밖의 컴포넌트 이름으로 그린 표는 검사하지 않습니다.

표의 셀이 가진 표지를 주석 문단이 시작하는 표지와 맞춰 봅니다. 셀의 글자는 굵게 같은 서식을 건너 통째로 읽고, 셀 안의 줄바꿈과 목록은 공백처럼 단어를 나눕니다. 표지는 `*`, `†`, `‡`를 이어 쓴 것이나 위첨자 숫자(뒤에 `⁾`가 올 수 있음)이며, `X*`, `**X**\*`, `` `id`† ``처럼 문자·숫자·닫는 괄호·닫는 따옴표나 코드 스팬 바로 뒤에 붙고, 그 뒤에는 글의 끝이나 공백, 문장 부호가 옵니다. `X¹⁾²⁾`처럼 표지 여러 개를 이어 쓸 수도 있습니다. 코드 안의 글자는 표지가 아닙니다.

`docs` 프로필의 `Footnote`에서 흔히 쓰듯 `1)`로 번호를 매긴 주석은 셀이 쓰는 방식인 같은 번호의 위첨자 `¹⁾`를 표지로 주며, 보고할 때는 주석에 쓴 그대로 담습니다. `m²`처럼 단위를 쓰는 경우가 있으므로 위첨자 숫자만으로 된 표지는 그 표지로 시작하는 주석이 있을 때에만 표지로 봅니다.

어떤 주석도 주지 않는 표지는 표시된 단어 위치에, 어떤 셀도 가리키지 않는 주석은 그 주석 위치에 보고하며, 둘 다 `unmatched-table-note`(경고)입니다. 셀에 표지가 하나도 없는 표 아래의 주석은 `\* 변경될 수 있음.`처럼 표 전체에 대한 안내이므로 보고하지 않습니다.

위치는 해당 표의 줄 안에서 찾습니다. 트리의 표와 원문의 표는 링크, 태그, 코드 스팬, 강조 표기와 `>>`로 병합되어 사라진 머리 셀을 뺀 머리 행으로 차례대로 짝짓습니다. 머리 행이 맞지 않더라도 트리와 원문의 표 개수가 같으면 순서대로 짝짓습니다.

요소로 작성한 표처럼 원문에 파이프 표가 없어서 어느 방법으로도 찾지 못한 표는 앞 표의 다음 줄부터 찾으며, 그 표에서 찾은 표지와 주석 가운데 마지막 것이 그 표의 끝입니다. 주석은 첫 서식 앞까지의 시작 글자를 표 다음 줄부터 찾아, 그 글자가 처음 나오는 위치에 보고합니다.

표 진단은 [parsed-tables.ts](../../packages/cudoc/src/node/parsed-tables.ts)가 만듭니다. `document.source.text`를 라이브러리의 파서로 직접 파싱합니다. VitePress와 Eleventy를 제외한 모든 호스트에서는 remark(`remark-parse`와 `remark-gfm`에 Docusaurus에서는 `remark-directive`, `.mdx` 문서에서는 `remark-mdx`를 더함)를 쓰고, 이 두 호스트에서는 markdown-it을 씁니다. markdown-it은 두 어댑터가 peer 의존성으로 받는 패키지입니다. 라이브러리의 루트에서 찾고, 없으면 작업 디렉터리에서 찾아 불러오며, raw HTML을 켜고 호스트 자신의 블록 규칙을 더합니다.

VitePress에서는 등록된 컨테이너(`tip`, `info`, `warning`, `danger`, `details`, `v-pre`, `raw`, `code-group`)와, 각각 한 줄을 차지하는 `[[toc]]`와 `<<<` 코드 스니펫을 따르고, raw HTML은 markdown-it 대신 VitePress의 규칙으로 읽습니다. VitePress의 기본 설정을 가정하므로, 컴포넌트 태그나 `toc` 패턴 같은 사이트의 `markdown` 옵션은 읽지 않습니다.

VitePress의 raw HTML 규칙에서 `<script>`, `<pre>`, `<style>`은 대소문자와 관계없이 이 셋 가운데 아무 닫는 태그까지 이어지고, `<textarea>`는 다른 태그처럼 홀로 있는 태그로 읽으며, 속성 이름은 `@`로 시작할 수 있습니다. 또 컴포넌트를 여는 줄은 표나 문단을 끝내고, 같은 줄에서 닫히면 그 줄만 차지합니다. 컴포넌트는 HTML 인라인 요소와 블록 수준 요소가 아닌 모든 태그입니다.

Eleventy에서는 markdown-it-container를 그 이름으로 등록했을 때처럼, 이름이 있는 모든 컨테이너를 엽니다. 또한 Eleventy는 받은 모든 렌더러에서 들여쓴 코드 블록을 끄므로, Eleventy에서는 들여쓴 코드 블록을 읽지 않습니다. 컨테이너는 여는 줄 이상의 `:` 뒤에 공백이나 탭만 있는 줄에서 닫힙니다. 파싱하기 전에 맨 위의 front matter는 줄 수를 유지한 채 비웁니다. 호스트도 파서보다 먼저 front matter를 읽기 때문입니다.

파싱 결과는 lazy 연속 줄과 들여쓰기를 포함해 모든 표를 인용 블록과 목록 항목 안의 실제 위치에 놓고, 각 행의 셀을 모두 담습니다. micromark의 행 노드에는 페이지에서 버려지는 셀까지 들어 있습니다. markdown-it에서는 표 규칙을 감싸서, 그 규칙이 컨테이너 안에서 각 행을 읽기 시작한 위치부터 행을 읽습니다.

머리 행의 셀 수가 그 아래 구분 행과 다르면 표가 되지 않으므로 어느 파싱 결과에도 나타나지 않습니다. 그래서 구분 행 바로 위의 줄마다 줄 앞의 목록 항목 기호와 인용 블록 기호를 하나씩 떼어 가며 셀 수를 세고, 구분 행을 그 셀 수에 맞춘 원문을 다시 파싱합니다. 그 자리에 표가 생기면 머리 행 위치에 `table-column-count` 하나를 보고합니다.

파싱 결과에서 코드 블록, raw HTML 블록, MDX 표현식이나 import에 속한 줄은 시도하지 않습니다. 다만 markdown-it은 다른 어떤 블록보다 표를 먼저 시도하므로, markdown-it에서는 블록의 첫 줄을 시도합니다. `.mdx` 문서에서는 셀 안의 표현식을 비운 글자로 읽으므로, 그 JavaScript 안의 백틱이나 파이프는 세지 않습니다.

표 주석 검사도 같은 결과로 표시를 찾습니다. 문서마다 파싱한 결과를 원문이 바뀔 때까지 보관하므로, `cudoc lsp`는 바뀐 문서만 다시 파싱합니다. 찾지 못한 markdown-it은 30초가 지나면 다시 찾습니다. 원문이 파싱되지 않거나(컴파일되지 않는 MDX 등) markdown-it을 불러올 수 없으면 줄 단위 리더가 대신 답합니다.

줄 단위 리더는 [source-tables.ts](../../packages/cudoc/src/node/source-tables.ts)이며, `withoutCode`도 이 리더를 사용합니다. 이 리더는 `document.source.text`를 줄 단위로, 라이브러리의 파서가 파이프 표를 읽는 방식대로 읽습니다. 맨 위의 frontmatter, 펜스 코드, raw HTML은 건너뜁니다.

raw HTML은 CommonMark를 따릅니다. 주석, `<?`, `<!X`, `<![CDATA[`는 각자의 닫는 표시까지, `<pre>`, `<script>`, `<style>`, `<textarea>`는 이 네 태그 가운데 하나의 닫는 태그가 있는 줄까지, `<div>`, `<details>`, `<table>` 같은 블록 수준 태그는 다음 빈 줄까지 이어집니다. 그 밖의 태그는 줄에 홀로 있으면서 문단을 잇지 않을 때에만 raw HTML을 엽니다. 그래서 `<b>`로 시작하는 줄은 글입니다.

`.mdx` 문서의 태그는 자식을 Markdown으로 읽는 컴포넌트이므로 그 문서에는 raw HTML이 없고, 대신 주석 `{/* … */}`를 포함한 모든 MDX 표현식 `{…}`을 건너뜁니다. 표현식은 JavaScript이며 그 안의 문자열, 템플릿 문자열, 정규식, JSX도 JavaScript가 읽는 방식대로 읽고, front matter의 중괄호는 표현식을 열지 않습니다. 그래서 속성의 템플릿 문자열에 표 행이 들어 있어도 표가 아닙니다. 코드 스팬과 따옴표로 감싼 속성값 안의 중괄호는 글자입니다. 코드 스팬은 문단 안에서 같은 길이의 백틱 묶음이 닫으면 여러 줄에 걸칠 수 있습니다.

`}` 뒤의 `/`는 JavaScript가 읽는 대로 읽습니다. `if (a) {} /{/.test(b)`처럼 문장 블록이나, 문장이 시작하는 자리에서 선언한 함수·클래스의 본문을 닫는 `}` 뒤의 `/`는 정규식을 시작합니다. 문장 블록에는 `catch {}`, `for await (…) {}`, `case 1: {}`도 포함되며, 값 뒤에서 줄을 바꾼 자리의 선언도 문장 위치의 선언입니다. 객체를 닫는 `}`, `(function () {} / 2)`처럼 값으로 쓴 함수·클래스의 본문을 닫는 `}`, `++`와 `--` 뒤의 `/`는 나눗셈입니다. 그 사이에 주석이 있어도 판단은 같습니다.

인용 블록과 목록 항목은 컨테이너입니다. 펜스와 raw HTML은 자기 컨테이너가 끝나면 함께 끝나고, 구분 행과 표의 모든 행은 머리 행과 같은 컨테이너에 있어야 합니다. 앞 줄 문단의 컨테이너 밖에 있으면서 스스로 블록을 시작하지 않는 줄은 그 문단을 lazy 연속으로 이으며, 한 경우를 제외하면 표의 머리 행이 되지 않습니다. 다만 그 문단이 속한 목록 항목보다 왼쪽에서 인용 블록을 여는 줄은 문단을 잇지 않고 새 인용 블록을 시작합니다. 또 문단과 인용 깊이가 다른 `===`는 그 문단의 제목 밑줄이 되지 않습니다.

그 한 경우는 micromark의 규칙입니다. micromark는 lazy 연속 줄 아래의 구분 행이 문단의 컨테이너 안에 있고 셀 수가 같으면 그 줄을 표의 머리 행으로 받습니다. 줄 단위 리더는 문단의 위치를 정확히 정할 수 있는 경우에만 그런 표를 인용 블록 안에서 읽습니다. 문단이 인용 블록 안에만 있고 각 `>`가 줄의 맨 앞이나 앞의 `>` 바로 뒤에 있으며, lazy 연속 줄이 네 칸 미만으로 들여 쓰여 있고 태그만 있는 줄이 아닌 경우입니다. 그래서 `> quote`, `a | b`, `> --- | ---` 세 줄은 그곳에서 표가 됩니다.

목록 항목 기호로 시작하는 lazy 연속 줄은 문단에 속하며, 그 뒤로는 문단에 인용 블록 안의 줄이 다시 나올 때까지 어떤 lazy 연속 줄도 머리 행이 되지 않습니다. markdown-it은 인용 블록 안의 lazy 연속 줄을 계속 문단에 둡니다.

micromark는 들여 쓴 `>` 아래에서도 이런 표를 만들고, 두 파서 모두 목록 항목 안에서도 표를 만듭니다. 줄 단위 리더는 그런 표를 읽지 않으므로 놓칠 수 있습니다. 들여쓴 코드가 없는 MDX를 제외하면, 줄이 속한 목록 항목보다 네 칸 이상 들여 쓴 줄은 아무것도 열지 않고, 그만큼 들여 쓴 구분 행이나 행은 그 표의 것이 아닙니다. 이런 줄을 코드로 보는 것은 들여쓴 코드 블록이 켜져 있을 때뿐이므로, Eleventy에서는 코드로 보지 않습니다.

표는 머리 행과 그 아래의 구분 행으로 이루어지며, `- `로 시작하는 줄은 목록 항목이므로 구분 행이 아닙니다. VitePress와 Eleventy를 제외한 모든 호스트가 쓰는 micromark는 이스케이프하지 않은 `|`가 없는 머리 행도, 그 아래 구분 행의 셀이 하나이면 받습니다. 셀이 더 많은 구분 행은 그 머리 행과 표를 이루지 못하므로, 그 행이 스스로 다른 표의 머리 행이 될 수 있게 둡니다. 또 micromark는 태그만 있는 줄을 머리 행으로 받지 않습니다. MDX가 아닌 문서에서 그 아래에 셀 수가 맞는 행이 오면 그 태그는 빈 줄까지 이어지는 raw HTML을 열고, MDX에서는 그 태그들이 lazy 연속 줄이든 아니든 문단을 끝내는 컴포넌트입니다.

markdown-it은 이스케이프 여부와 관계없이 머리 행에 `|`가 있어야 하고, 제목이나 목록 항목보다 표를 먼저 시도하므로 `## a | b`나 `2. a | b` 아래에 셀 수가 맞는 구분 행이 오면 그 줄이 표의 머리 행이 됩니다.

본문은 빈 줄, 컨테이너를 벗어나는 줄, 다른 블록을 시작하는 줄 앞에서 끝납니다. 다른 블록은 펜스, 목록 항목, 제목, 구분선, raw HTML이며, raw HTML 가운데 홀로 있는 태그는 markdown-it에서는 제외하고, MDX에서는 태그만 있는 줄을 뜻합니다. markdown-it에서는 `:::`로 시작하는 모든 줄을 컨테이너의 줄로 보아 다른 블록으로 다루며, 이 줄은 문단도 끝냅니다. 그 밖의 줄은 파이프가 있든 없든 모두 행이므로, 표 바로 아래에 빈 줄 없이 쓴 주석은 셀이 하나인 행이 됩니다.

행은 앞뒤 파이프를 하나씩 뗀 뒤 이스케이프하지 않은 모든 `|`에서 나누며, micromark와 markdown-it 14가 코드 스팬까지 포함해 나누는 방식과 같습니다. 무엇이 파이프를 이스케이프하는지는 라이브러리의 호스트를 따릅니다. VitePress와 Eleventy의 markdown-it은 바로 앞이 역슬래시인 파이프를 이스케이프한 것으로 보고, 그 밖의 호스트에서 쓰는 micromark는 앞에 역슬래시가 홀수 개 이어진 파이프만 이스케이프한 것으로 봅니다. 그래서 `\\|`는 micromark에서는 행을 나누고 markdown-it 호스트에서는 나누지 않습니다.

머리 행의 셀 수가 구분 행과 다르면 `table-column-count` 하나이며(그 줄들은 표가 아님), 셀 수가 다른 각 행도 같은 코드입니다. 각 셀에서 같은 길이의 백틱 묶음으로 닫히지 않는 백틱 묶음은 그 위치의 `table-unclosed-code`입니다. 같은 묶음이 행 전체에서는 닫히면 메시지가 셀을 나눈 파이프를 지적하고, 뒤 셀에서 그 묶음을 닫는 쪽은 다시 보고하지 않습니다. 둘 다 오류이며 행이나 백틱 묶음 위치에 둡니다.

위치는 저장된 트리가 아니라 `document.source.text`에서 복원하는데, 수집이 AST를 저장할 때 `position`을 제거하기 때문입니다. 중복 앵커는 나중 선언을 보고합니다. 원본에 더 이상 없는 참조는 틀린 위치 대신 위치 없음으로 처리합니다.

탐색은 참조와 글자만 같은 곳을 건너뜁니다. Markdown 목적지 구분자로 끝나는 출현을 우선하므로, `guide.md#limit`이 `guide.md#limits`가 있는 줄을 가리키지 않습니다. 링크 자신의 글자를 건너뛰므로 `[./guide.md](./guide.md)`는 목적지 위치에 보고합니다. 코드 블록과 코드 스팬도 건너뛰므로, 같은 링크를 보여 주는 코드 예제를 편집기의 수정이 고치지 않습니다. 변수처럼 코드 안에만 쓴 참조는 코드에서 찾습니다.

`formatCheckResult(result: CheckResult): string`은 문서별로 묶어 `줄:열` 접두어와 함께 출력하며, 각 문서의 항목은 위치 순서로 정렬하고 위치가 없는 항목을 맨 앞에 둡니다. `available`은 최대 네 개까지 보이고 나머지는 개수로 요약합니다. 앵커는 `#id`로, `unmatched-tree-order`의 이름은 큰따옴표로 감싸서 보이며, `suggestions`는 `did you mean:` 줄에 보입니다. 마지막 줄은 오류와 경고의 수, 그리고 그것이 있는 문서의 수를 세며, 사용하지 않는 파일은 `1 warning in 0 of 1 documents and 1 file`처럼 따로 셉니다.

임베드 원본은 해석기가 직접 호출하는 `resolveDocumentReference`로 해석하므로, 검사기가 통과시킨 원본은 빌드도 찾습니다. 이 함수가 거부하는 것(없는 문서, URL, 역슬래시 경로, 루트를 벗어나는 경로, 앵커의 잘못된 퍼센트 이스케이프)은 해석기의 메시지를 담은 `missing-embed-source`입니다. 대상에 없는 앵커를 가리키는 원본과 어떤 절에도 맞지 않는 선택은 `missing-embed-anchor`이며, 해석기도 두 경우 모두 실패합니다.

트리 임베드의 원본은 해석기와 같이 `resolveTreeSource`로 읽습니다. 이 함수가 거부하는 원본은, 아래에 문서가 없는 폴더를 포함해 그 메시지를 담은 `missing-embed-source`이고, 앵커가 대상의 어느 제목 id와도 맞지 않는 문서 원본은 그 id들을 `available`로 담은 `missing-embed-anchor`입니다. 라이브러리에 없는 추출기를 부르는 열은 추출기 이름 위치의 `invalid-embed-spec`입니다. 폴더 원본은 임베드하는 문서를 `page`로 주고 읽으므로, 공개 페이지라면 모두 빠질 문서만 가진 폴더도 `missing-embed-source`입니다.

모든 원본이 해석되면, `...`가 아닌 `order` 항목 가운데 `namesTreeNode` 기준으로 첫 층의 어느 줄과도 일치하지 않는 항목을, 페이지가 뺀 비공개 문서를 가리키는 항목까지 포함해 `unmatched-tree-order`로 보고하며, 위치는 펜스 안 `order:` 뒤의 그 항목 줄입니다. 트리는 절의 본문을 복사하지 않고 빈 열을 줄에서 빼므로, 순환을 따라가지 않고 컴포넌트나 빈 셀도 검사하지 않습니다.

`cyclic-embed`는 블록이 복사하는 모든 절 안의 임베드를 따라가며, 중첩된 블록을 해석기가 전개하는 방식대로 파싱합니다. 따라가는 대상은 블록의 `replace` 규칙이 남긴 사본이므로, 중첩된 펜스를 일반 코드로 바꾸는 규칙은 연쇄를 거기서 끝내고 중첩된 원본을 되돌려 가리키게 하는 규칙은 연쇄를 새로 만듭니다. 이미 복사하고 있는 절로 되돌아오거나 해석기의 깊이 한도 64에 닿는 연쇄를 `a#* -> b#limits -> a#*` 형태로, 연쇄를 시작하는 펜스의 줄에 보고합니다. 빌드도 같은 연쇄에서 실패합니다.

`invalid-embed-spec`은 `parseEmbedSpec`이 거부한 블록을 다룹니다. 보고 위치의 줄은 펜스 줄에 파서가 알려 준 줄을 더한 값입니다. 열은 파서가 알려 준 열에, 파일의 해당 줄에서 블록 글자 앞에 놓인 부분(들여쓰기, 인용문의 `>`, 목록 항목의 오프셋)의 길이를 더한 값입니다. 그래서 블록 기준이 아니라 파일 기준 좌표가 나오고, 메시지에 남아 있던 블록 기준 `at line N, column M` 꼬리표는 같은 이야기를 두 번 하지 않도록 제거합니다. 좌표가 없는 오류는 펜스 위치에 붙입니다.

펜스는 저장된 원문을 GFM과 front matter를 포함한 Markdown으로 파싱해서 찾으며, `.mdx` 문서는 MDX로 파싱합니다. 따라서 더 긴 펜스나 들여쓴 코드 블록 안에 보여 준 펜스는 예시 글자로 보고, 인용문이나 콜아웃, 목록 항목 안의 펜스는 블록으로 셉니다. 찾아낸 펜스는 문서의 임베드 블록을 순서대로 담고 있어야 하며, 이때 `\r`과 줄 끝 공백을 뺀 글자로 비교합니다. 일치하지 않거나 원문이 파싱되지 않으면 Markdown이 펜스를 닫는 방식대로 원문을 줄 단위로 훑고, 그래도 블록을 찾지 못하면 임베드 진단에 위치를 붙이지 않습니다.

따라서 펜스까지 이어지는 VitePress 컴포넌트의 HTML 블록처럼 호스트가 Markdown과 다르게 읽는 블록이 있으면, Markdown이 읽은 펜스가 호스트의 블록과 같은 글자를 담고 있지 않은 한 위치를 비워 둡니다. `cyclic-embed`도 같은 방식으로 펜스 위치를 붙입니다.

`unmatched-embed-replacement`는 규칙이 치환하는 것과 같은 글자, 즉 [replace.ts](../../packages/cudoc/src/node/replace.ts)의 `sectionText`를 읽습니다. `source.sections[anchor]`를 `end` 또는 `ownEnd`로 끊고 목록 항목의 표시와 들여쓰기를 뗀 글자이거나, 문서 전체 임베드라면 `source.text` 전부입니다. 그 각각에 규칙을 순서대로 적용하면서 무엇이 맞았는지 기록합니다. 어떤 슬라이스에서도 맞지 않은 규칙만 보고하는데, 규칙 목록은 선택된 절 전부에 적용되므로 한 절만 겨냥한 규칙이 나머지를 비껴가는 것은 설계상 정상이기 때문입니다. 쓸 수 없는 패턴은 해석기가 낼 오류이므로 맞은 것으로 셉니다.

`unreplaceable-embed-section`은 같은 파일의 `unreplaceableSection`이 거부하는 선택 절마다 그 메시지로 보고하므로, 각자 어떤 컴파일러를 쓰든 검사는 빌드가 멈출 곳에서 멈춥니다.

`empty-embed-cell`은 표 출력이 수행하는 추출을 `buildEmbedRow`와 `extractCell`로 똑같이 수행하되, 매핑으로 쓴 모든 열을 선택된 모든 절에 대고 돌려서 값이 없는 셀마다 열 번호와 머리 글자, 행의 절, 추출기의 `problem` 글자를 보고합니다. 축약형 열은 보고하지 않습니다. 표로 시작하는 절의 `summary`가 비는 것은 정상이기 때문입니다. 등록되지 않은 추출기를 부르는 `{ extractor }` 열은 검사를 중단하는 대신 행마다 `invalid-embed-spec`으로 보고합니다.

`unportable-embed-component`는 임베드가 실제로 복사하게 될 내용을 검사합니다. 선택은 해석기가 쓰는 것과 같은 [`collectSections`](../../packages/cudoc/src/sections.ts)로 적용하므로, `includeChildren: false`와 `select`가 복사 범위를 좁히는 만큼 검사 범위도 함께 좁혀지고, 원본에 적은 절(`reference.md#limits`)은 해석기와 같은 방식으로 `select`와 결합합니다. `render: { type: table }` 임베드는 제목 글자만 이동하므로 건너뜁니다.

보고 대상은 타입이 `mdx`로 시작하거나 `Directive`로 끝나는 노드이며, [`documentToHast`](../../packages/cudoc/src/render.ts)가 거부하지 않고 버리는 `mdxjsEsm`과 `yaml`은 제외합니다. `select.anchors`가 존재하지 않는 절을 가리키면 `collectSections`가 예외를 던지는데, 빌드도 같은 오류를 내기 때문에 삼키지 않고 `missing-embed-anchor`로 보고합니다.

`replace` 규칙이 있으면 사본은 수집된 그대로의 절이 아니라 다시 쓴 Markdown을 다시 컴파일한 결과이며, `cyclic-embed`, `empty-embed-cell`, `unportable-embed-component`, `imported-embed-component`가 모두 그 사본을 읽습니다. 그래서 컴포넌트를 글로 바꾸는 규칙이 있으면 보고할 것이 남지 않습니다. 다시 쓰는 과정은 해석기의 것과 같으며, 둘 다 [replace.ts](../../packages/cudoc/src/node/replace.ts)에서 가져옵니다. 사본은 몇 가지 검사와 연쇄가 읽든 검사 한 번에 한 번만 컴파일합니다.

동기 호스트 컴파일러가 있는 라이브러리는 그 컴파일러로 사본을 만듭니다. `cudoc check`는 컴파일러 없이 라이브러리를 불러오고, 비동기 컴파일러로 수집한 라이브러리에는 검사기가 호출할 컴파일러가 남지 않으므로, 이때는 독립 컴파일러가 다시 쓴 Markdown을 라이브러리의 옵션으로 읽습니다. 독립 컴파일러는 임베드 펜스, 컴포넌트, 표를 호스트와 같게 읽지만, 호스트의 파서만 아는 문법은 잃거나 거부합니다. VitePress의 `::: tip` 컨테이너는 글자로 남고, Docusaurus의 `{#id}`나 HTML 주석이 든 MDX는 컴파일되지 않습니다.

그 때문에, 또는 해석기가 규칙이나 스냅숏이나 반복된 절 id를 거부해서 사본을 만들 수 없는 절은, 수집된 그대로 읽지 않고 위 네 가지 검사에서 뺍니다. 규칙이 바로 그 검사가 찾는 내용을 바꿨을 수 있기 때문이며, 해석기가 거부하는 경우는 빌드가 스스로 실패합니다.

`unportable-embed-component`의 문구는 라이브러리의 호스트에 따라 다릅니다. `next`, `docusaurus`, `nextra`에서는 호스트가 접합된 자리에서 복사본을 렌더링하고 독립 내보내기만 렌더러가 필요하다고 말하고, 그 밖의 호스트에서는 둘 다 렌더링할 수 없다고 말합니다.

`imported-embed-component`는 복사되는 컴포넌트 이름(`.` 앞부분)을 `target.imports`와 `doc.imports`에 대조합니다. 원본 문서가 자기 파일에서 import하고 임베드하는 문서는 import하지 않는 이름을 오류로 보고하는데, 내보내기가 `mdxjsEsm`을 버리므로 접합된 복사본이 그 이름의 바인딩이 없는 모듈에 놓이기 때문입니다. `render: section` 임베드에서만, `unportable-embed-component` 뒤에 보고합니다.

`collectAnchors(tree: Root)`는 모든 제목 앵커와, `<a id="legacy"></a>`처럼 raw HTML의 요소가 선언하는 모든 id마다 `{ id, explicit }`를 반환합니다. HTML id는 작성자가 쓴 것이므로 명시적인 앵커로 셉니다. 제목의 `explicit`는 `data.cudoc.explicitId`를 반영하며, 작성자가 쓴 앵커와 슬러거가 만든 앵커를 가르는 값이자 `unstable-anchor-link`가 판단 기준으로 삼는 값입니다. `duplicate-anchor`는 제목 id만 비교합니다.

`unstable-anchor-link`는 `-<숫자>`로 끝나는 생성 앵커로 가는 링크에서, 접미사를 뗀 id가 같은 문서에 함께 있을 때에만 발생합니다. `#overview` 옆의 `#overview-1`은 같은 제목의 제목이 하나 더 끼어들면 옮겨 가는 슬러거의 구분 접미사이지만, 제목 글자 자체가 `version-2`를 만드는 `## Version 2`는 문제 삼지 않습니다.

## 데이터셋

`generateDataset`은 수집된 라이브러리의 필터링한 AST를 데이터셋으로 출력합니다. 소스·import: [node/dataset.ts](../../packages/cudoc/src/node/dataset.ts), `@cudoment/cudoc/node/dataset`.

`generateDataset(options: DatasetOptions)`는 동기적으로 필터링한 AST를 출력하고 `{ schemaVersion: "1.0.0", documentCount, documents }`를 반환합니다.

`DatasetOptions`는 `ProjectionOptions`에 다음 필드를 추가합니다.

| 필드                  | 의미                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `inputDir`            | 필수. AST JSON 디렉터리이며 보통 `.cudoc/documents/documents`                                                                                  |
| `outDir`              | 필수                                                                                                                                           |
| `library`             | 선택. 그 AST가 나온 수집 라이브러리 디렉터리이며 scope와 비공개 문서를 여기서 읽음. 기본값은 `inputDir`를 `documents` 디렉터리로 둔 라이브러리 |
| `documents`, `scopes` | 선택. 포함할 문서와 scope                                                                                                                      |
| `projectionId`        | 기본 `custom`                                                                                                                                  |
| `requireVersion`      | 기본 true                                                                                                                                      |

`inputDir` 맨 위의 `manifest.json`, `meta.json`은 건너뛰며, 하위 디렉터리에 있는 같은 이름의 문서는 다른 문서와 똑같이 다룹니다. 문서 ID는 확장자 없는 정확한 상대 경로입니다. 명시한 ID가 없으면 오류입니다.

`library`를 주면 그 manifest의 루트 기준 경로가 문서의 scope 조각이 어디서 시작하는지를 정합니다. ID에 접두어로 맞는 가장 긴 기준 경로 다음의 첫 조각이 scope이므로 기준 경로가 `docs`, `terms`일 때 `docs/ko/guide`와 `terms/ko/token`은 모두 scope `ko`에 속합니다. 그 라이브러리의 비공개 문서는 제외되며 `documents`로 비공개 문서를 요청하면 오류입니다. `scopeOf(id, bases)`를 export합니다.

`library`가 없을 때 `inputDir`가 라이브러리의 `manifest.json` 옆에 있는 `documents` 디렉터리이면 그 라이브러리를 읽으므로, 수집 결과에서 바로 만든 데이터셋에는 비공개 문서가 들어가지 않습니다. 데이터셋의 manifest처럼 `schemaVersion`이 숫자가 아닌 `manifest.json`은 라이브러리로 보지 않습니다. 그 밖의 입력에서는 scope가 첫 경로 조각이고 비공개 문서는 없습니다.

생성기는 저장된 AST를 필터링하며 아무것도 해석하지 않습니다. `cudoc-embed` 블록은 수집된 모습 그대로 `code` 노드로 남으므로, 임베드한 절은 데이터셋에서 그 절을 가진 문서에만 들어 있습니다.

출력은 `documents/<id>.json`과 `manifest.json`입니다. manifest에는 스키마 `"1.0.0"`, 필터링 ID·옵션, 문서 수, scope, `{ id, hash, outputHash }`가 있습니다. `hash`는 UTF-8로 읽은 입력 파일, `outputHash`는 직렬화한 출력 AST를 대상으로 합니다. 입력과 출력을 검증하며 파일별 오류는 원인을 보존하고 출력을 중단합니다. 필터링 의미는 [projectAst](./document.ko.md#필터링)에 있습니다.

## 저장

`publishDirectory`는 생성한 출력 디렉터리를 통째로 교체하므로, 읽는 쪽이 절반만 쓰인 디렉터리를 보는 일이 없습니다. 소스·import: [storage.ts](../../packages/cudoc/src/node/storage.ts), `@cudoment/cudoc/node/storage`.

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

입출력 중첩과 symlink 출력을 거부합니다. **기존 출력은 빈 디렉터리도 `.cudoc-output`에 `cudoc\n`을 갖고 있어야 합니다.** 처음에는 존재하지 않는 출력 경로를 사용합니다. 콜백에는 임시 경로를 전달하며, 임시 디렉터리를 만들지 못하면 잠금을 다시 풉니다.

잠금 `<output>.lock`은 쓰는 프로세스의 id를 담으며, id를 먼저 적은 파일을 링크로 들여놓기 때문에 비어 있는 상태로 읽히는 일이 없습니다. 잠금을 가진 프로세스가 아직 실행 중이면 `cudoc: <output> is being written by process <pid>; wait for it to finish` 오류입니다.

그 밖의 잠금은 강제로 종료된 빌드가 남겼습니다. 이 잠금은 이름을 바꿔서 가져오고, 다른 무엇보다 먼저 잠금을 다시 잡습니다. 옮겨 온 파일에 실행 중인 프로세스의 id가 있으면 되돌려 놓고 그 빌드를 보고하며, 오래된 잠금을 다른 프로세스가 먼저 가져갔으면 잠금을 다시 시도합니다. 강제로 종료된 빌드가 남긴 것은 잠금을 쥔 프로세스가 복구합니다. 실행 중인 빌드의 디렉터리는 그 빌드가 잠금을 쥐고 있는 동안에만 존재하기 때문이며, 종료된 id를 읽고 나서 잠금의 이름을 바꾸기까지의 짧은 순간만이 세 번째 프로세스가 끼어들 수 있는 유일한 틈입니다.

복구는 게시 과정이 붙이는 이름, 즉 백업의 `<output>.previous-<uuid>`와 임시 디렉터리의 `<output>.cudoc-staging-` 뒤 영문자나 숫자 여섯 개만 살피고, 그중에서도 `.cudoc-output`의 내용이 정확히 `cudoc\n`인 실제 디렉터리만 다룹니다. 기존 출력이 통과해야 하는 검사와 같은 기준입니다. 이런 백업은 출력 자체가 없으면 제자리로 옮기고 있으면 삭제하며, 이런 임시 디렉터리는 삭제합니다. 다른 이름의 디렉터리, 소유 표시의 내용이 다른 디렉터리와 심볼릭 링크는 그대로 둡니다.

소유한 디렉터리는 소유 표시를 마지막에 지우므로, 삭제가 중간에 멈춰도 남은 디렉터리를 다음 복구가 마저 지웁니다. 옮기거나 지울 수 없는 잔여물이 있으면 게시가 실패하고 잠금을 풉니다. 복구하지 않는 잔여물은 두 가지입니다. 소유 표시를 쓰기 전에 강제로 종료된 빌드의 임시 디렉터리, 그리고 잠금을 잡는 도중에 종료된 빌드가 남긴 잠금용 임시 파일 `<output>.lock.<pid>-<uuid>`와 `<output>.lock.stale-<pid>-<uuid>`입니다. 이것들에는 출력 내용이 없으므로 지워도 됩니다.

콜백은 동기와 비동기 어느 쪽이든 됩니다. `publishDirectory`는 `build`가 반환한 값을 확인해서, thenable이면 그것이 완료될 때까지 교체를 미루고 자신도 프로미스를 반환하며, 그 밖의 값이면 즉시 교체하고 아무것도 반환하지 않습니다. 오버로드 시그니처는 편의를 위한 것이며 실제 판단은 이 런타임 검사가 합니다. 생성 실패 시 기존 출력을 유지하고 최종 rename 실패 시 복원합니다.

잠금은 트랜잭션 전체에 걸쳐 유지하므로, 비동기 생성이 진행되는 동안 같은 출력으로 발행을 다시 시도하면 실패합니다. 생성 도중 프로세스가 강제로 종료되면 같은 출력으로 다음 발행이 이를 복구할 때까지 잠금 파일과 임시 디렉터리가 남는데, 비동기 생성은 그 구간을 길게 만들 뿐 새로운 실패 방식을 더하지는 않습니다. 이 도우미는 생성물 보호용이며 임의 컴파일러·렌더러 콜백을 격리하는 sandbox가 아닙니다.

## 개별 AST 스냅샷

이 공개 기본 함수는 AST 파일을 하나씩 개별 처리하며, 라이브러리 manifest, 원문 스냅샷, 준비된 코드 블록 임베드를 만들지 않고, 사용 가이드는 라이브러리 흐름을 기준으로 합니다. 소스: [export-ast.ts](../../packages/cudoc/src/node/export-ast.ts), [load-ast-file.ts](../../packages/cudoc/src/node/load-ast-file.ts), [paths.ts](../../packages/cudoc/src/node/paths.ts).

- `/embed` 또는 `/node/export-ast`의 기본 export인 `exportAst(options?)`는 설치한 remark 위치의 스냅샷을 저장합니다. 렌더링 트리는 유지하며 파일별로 원자적으로 작성합니다.
- `resolveExportAstOptions(options?) → ExportAstContext`, `projectTree(node, context) → unknown`, `buildExportedAst(tree, context) → object`는 디스크 쓰기 없이 export 준비를 제공합니다. `buildExportedAst`는 사본에서 `withoutPresentation`으로 cudoc이 화면용으로 그린 것을 걷어 내므로, 표현 뒤에 쓴 스냅숏도 의미와 작성 그대로의 메타를 담습니다. 그다음에 설정한 속성을 제거합니다.
- Export 기본값: 입력 `docs`, 출력 `.cudoc/ast`, 확장자 `.md`/`.mdx`, 모든 노드에서 지우는 `strip` 속성 `position`/`estree`(`DEFAULT_STRIPPED_PROPERTIES`), 하위 트리와 함께 지우는 `dropNodeTypes` 노드 `mdxjsEsm`, `yaml`, `toml`(`DEFAULT_DROPPED_NODE_TYPES`), 버전 `cudocAstVersion: 1`, 검증 true. 사용자 `version`, `tableCellElement`, `write(filePath, contents)`, 경로 옵션도 지원합니다.
- `/embed`의 `loadAst(documentPath, options?)`는 출력 디렉터리 안의 확장자 없는 상대 ID를 읽으며, `../../secrets`처럼 그 밖으로 나가는 경로는 읽는 대신 `cudoc: path escapes document root` 오류를 냅니다. `/node/load-ast-file`의 `loadAstFile(filePath, options?)`는 알려진 파일을 직접 읽습니다. 두 함수는 기본으로 검증하고 `ExportedCudocAstRoot`를 반환하며, 읽기 옵션은 `version`, `validate`, `tableCellElement`이고 `loadAst`는 경로 옵션도 받습니다.
- `/node/paths`는 `resolvePathOptions`, `getRelativeOutputPath`, `getOutputPath`, `DEFAULT_SOURCE_ROOT`, `DEFAULT_OUTPUT_ROOT`, `DEFAULT_EXTENSIONS`를 제공합니다. `PathOptions`는 `{ sourceRoot?, outDir?, extensions?, cwd? }`이며 출력 매핑은 범위 밖·확장자 불일치 경로에 `null`을 반환합니다.

서버 번들의 경로를 알고 있다면 `loadAstFile`을 사용합니다. 런타임이 JSON을 읽으면 배포물에 해당 파일을 포함해야 합니다. `/embed`는 개별 export·읽기·경로 함수와 하위 쿼리를 재수출하며 이 페이지 앞의 API를 재수출하지 않습니다.

## CLI

`cudoc` 명령은 설정 파일 하나로 수집, 검사, 데이터셋 생성, 언어 서버를 실행합니다. 소스: [cli.ts](../../packages/cudoc/src/node/cli.ts)이며, [command.ts](../../packages/cudoc/src/node/command.ts)를 실행합니다.

```sh
cudoc collect --config cudoc.config.mjs [--watch]
cudoc check --config cudoc.config.mjs [--format text|json] [--strict]
cudoc dataset --config dataset.config.json
cudoc lsp --config cudoc.config.mjs
```

위 네 명령과 `--config <path>` 인자 형태만 지원합니다. 다른 명령, 값이 빠진 `--config`, `text`나 `json`이 아닌 `--format`은 `Usage: cudoc <collect|check|dataset|lsp> --config config.mjs [--watch] [--format text|json] [--strict]`를 출력하고 종료 코드 1로 끝나며, 그 밖의 인자는 무시합니다. ESM은 설정 객체를 기본 export하고 `.json`은 직접 파싱합니다. 설정 안의 경로는 설정 파일 위치가 아닌 명령 실행 디렉터리 기준입니다.

오류는 stderr에 출력하며 종료 코드를 1로 설정합니다. 사용법 줄과 메시지가 `cudoc:`이나 `cudoc-vitepress:`처럼 패키지 접두어와 콜론으로 시작하는 오류는 메시지와, 감싼 원인마다 `caused by:` 한 줄을 출력하고, 그 밖의 오류는 스택과 함께 출력합니다.

`collect`는 [`collectDocuments`](#감시) 한 회차를 실행합니다. 수집과 준비를 `outDir`에 함께 출력하므로, 실패한 실행은 이전 라이브러리와 그 `embeds.json`을 그대로 남기고, 준비할 수 없는 임베드는 한 메시지에 함께 나열됩니다([`prepareEmbeds`](#준비된-임베드) 참고). 컴파일러는 동기·비동기 모두 가능합니다. 성공하면 `{ documentCount, outDir }`를 JSON으로 출력하며, `--watch`가 없으면 항상 전체 빌드입니다. 설정의 `check` 키는 수집에 넘기지 않으므로, 언어 서버에서처럼 라이브러리의 설정 해시를 바꾸지 않습니다.

`collect --watch`는 같은 설정으로 [`watchDocuments`](#감시)를 실행하고 종료하지 않습니다. 첫 회차는 `outDir`에 이미 있는 것에서 이어 가고, 회차마다 JSON 한 줄(`documentCount`, 컴파일한 id 목록 `compiled`, `reused`, `blocks`, `reusedBlocks`, `outDir`, `elapsed`)을 출력하며, 실패한 회차는 오류를 출력하고 마지막 성공 출력을 그대로 둡니다.

`check`는 마지막 수집이 `outDir`(기본 `.cudoc/documents`)에 출력한 라이브러리를 `loadLibrary`로 읽고, 같은 설정 파일의 선택적 `check` 키로 [참조 검사](#참조-검사)를 실행합니다. 이 키는 [`CheckOptions`](#참조-검사)의 모든 필드를 받습니다. 수집하거나 쓰는 것이 없으므로 컴파일러가 필요하지 않으며, 컴파일하는 Markdown은 `replace` 규칙이 다시 쓴 임베드 사본뿐이고 이는 독립 컴파일러가 읽습니다. 수집기가 별도 스크립트인 호스트는 같은 `outDir`를 가리키는 설정을 `check`에 줍니다.

설정 최상위의 `roots` 또는 `sourceRoot`는 `loadLibrary`에 전달되므로 라이브러리를 수집할 때의 기준 경로와 같아야 합니다. 이 값은 문서가 디스크의 어디에 있는지 알려 주며, 최상위에도 `check` 아래에도 없으면 경로는 수집된 문서에 대해서만 확인합니다. 파일이 없는 이미지와, 문서도 파일도 가리키지 않는 링크는 보고하지 않습니다. 수집된 라이브러리가 없으면 `cudoc: no collected library in <outDir>; collect documents before checking them` 오류입니다.

기본값인 `--format text`는 `formatCheckResult`가 렌더링한 결과를, `--format json`은 결과 전체를 출력합니다. 오류가 하나라도 보고되면, 또는 `--strict`를 주었을 때 무엇이든 보고되면 종료 코드가 1입니다.

`lsp`는 설정으로 표준 입출력에서 [언어 서버](#언어-서버)를 실행하고, 편집기가 종료되면 프로세스가 끝나도록 표준 입력을 닫은 뒤 서버가 반환한 코드로 종료합니다. `dataset`은 설정을 그대로 `generateDataset`에 넘기므로, 그 안의 `library`가 scope와 비공개 문서를 읽어 올 수집 라이브러리를 가리키며, JSON 요약을 출력합니다. 내보내기 CLI는 [어댑터](./adapters.ko.md#내보내기)에 설명합니다.

## 언어 서버

`serveLanguageServer`는 Language Server Protocol로 편집기에 붙어 저장할 때마다 수집과 참조 검사를 실행합니다. 소스/import: [lsp.ts](../../packages/cudoc/src/node/lsp.ts), `@cudoment/cudoc/node/lsp`.

```ts
serveLanguageServer(
  config: LanguageServerConfig, // CollectConfig & { check?: CheckOptions }
  streams: { input: Readable; output: Writable },
): Promise<number>
```

`input`에서 `Content-Length` 헤더로 구분한 JSON-RPC 2.0 메시지를 읽고, `output`에는 자신의 메시지만 씁니다. Language Server Protocol 중 다음 부분을 구현합니다.

| 메시지                                          | 동작                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `initialize`                                    | `textDocumentSync` `{ openClose: true, change: 1, save: { includeText: false } }`와 `codeActionProvider` `{ codeActionKinds: ["quickfix"] }`를 담은 `capabilities`, 그리고 `serverInfo` `{ name: "cudoc", version }`으로 응답합니다                    |
| `initialized`, `textDocument/didSave`           | 회차를 실행합니다. `previousCollection(outDir)`에서 시작해 `check`를 뺀 설정으로 `collectDocuments`를 실행하고 `checkReferences(library, config.check)`를 실행합니다. 회차는 한 번에 하나만 실행하며, 실행 중의 저장은 끝난 뒤 한 회차를 더 요청합니다 |
| `textDocument/didOpen`, `didChange`, `didClose` | 열린 문서마다 편집기의 글(전체 동기화)을 보관하며, 코드 액션이 이를 읽습니다                                                                                                                                                                           |
| `textDocument/codeAction`                       | 제안을 가진 진단마다 제안 하나당 `quickfix` 하나를 만들고 첫 번째를 우선으로 표시합니다. 진단 범위 안에서 처음 나오는 `reference`를 제안으로 바꿉니다                                                                                                  |
| `cudoc/counterpart`                             | `{ textDocument: { uri } }`에 `{ language, uri }[]`로 응답합니다. `check.translations`의 언어들이 짝짓는 문서 중 존재하는 것입니다. `translations`가 없거나 어느 언어에도 속하지 않는 문서면 `[]`입니다                                                |
| `shutdown`                                      | 실행 중인 회차가 진단을 보낸 뒤 `null`로 응답합니다                                                                                                                                                                                                    |
| `exit` 또는 `input`의 끝                        | `input` 읽기를 멈추고, `shutdown` 뒤라면 0, 아니면 1로 resolve합니다                                                                                                                                                                                   |

그 밖의 요청에는 `-32601` 오류로 응답하고, 그 밖의 알림은 무시합니다. 파일을 가리키지 않는 URI를 받은 `cudoc/counterpart`처럼 처리 중에 오류가 난 요청에는 오류 메시지를 담은 `-32603` 오류로 응답합니다.

회차는 문제가 있는 파일마다 `textDocument/publishDiagnostics`를 보내고, 이전 회차가 보냈지만 이번에는 문제가 없는 파일에는 빈 목록을 보냅니다. 문제의 파일은 라이브러리 루트를 거친 문서의 소스 파일이며, `unused-asset`은 작업 디렉터리 기준 경로입니다. 범위는 문제의 위치를 0부터 세는 줄과 문자로 바꾼 것이며, 위치가 없으면 파일의 시작입니다.

진단은 오류면 `severity` 1, 경고면 2와 `code`, `source: "cudoc"`, `message`, `data: { reference, suggestions }`를 가집니다. 회차마다 검사·컴파일한 문서 수와 문제 수를 담은 type 3 `window/logMessage`도 보내며, 오류가 난 회차는 오류 메시지를 담은 type 1을 보내고 이미 보낸 진단은 그대로 둡니다. 수집은 컴파일 진단을 `output`이 아닌 stderr에 씁니다.

서버는 회차마다 먼저 `outDir`의 `manifest.json`을 읽습니다. 그 라이브러리를 수집한 `compilerId`나 `host`가 설정과 다르면, 사이트 빌드가 읽는 라이브러리를 바꾸지 않도록 그 회차는 아무것도 수집하지 않고 둘을 모두 밝힌 type 1을 보냅니다. `compilerId`가 없는 설정과 manifest는 독립 컴파일러로, `host`가 없는 설정과 manifest는 `markdown`으로 봅니다. 읽을 수 있는 `manifest.json`이 없으면 그 회차는 설정대로 수집합니다.
