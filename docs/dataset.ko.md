# AST 데이터셋

[English](./dataset.md) | **한국어** · [전체 가이드](./README.ko.md)

`cudoc dataset`은 컴파일한 문서를 필터링한 사본을 AST JSON과 manifest로 만들어 인덱싱이나 다른 후속 소비자에게 제공합니다.

데이터셋 생성은 Markdown이 아닌 AST JSON을 읽으며 입력을 수정하지 않습니다. 검색 엔진이나 링크 감시 기능을 만들지는 않습니다.

## 먼저 문서 수집

[문서 수집](./embedding.ko.md#문서-수집-설정)을 완료합니다. 데이터셋 입력은 AST 파일이 있는 `.cudoc/documents/documents`이며, manifest와 원문 스냅샷이 함께 있는 라이브러리 루트가 아닙니다.

`dataset.config.mjs`를 작성합니다.

```js
export default {
  inputDir: ".cudoc/documents/documents",
  outDir: ".cudoc/dataset",
  excludeNodeTypes: ["code"],
  excludeComponents: ["InternalNote"],
  stripProperties: ["position"],
  projectionId: "search-v1",
}
```

다음 명령을 실행합니다.

```sh
npx cudoc dataset --config dataset.config.mjs
```

후속 소비자에서는 `.cudoc/dataset/documents/`의 필터링된 AST와 `.cudoc/dataset/manifest.json`의 문서 목록을 읽습니다. 출력 디렉터리는 입력과 분리한 전용 디렉터리를 씁니다.

## 포함할 콘텐츠 선택

`dataset.config.mjs`의 옵션으로 문서를 고르고, 노드를 제거하고, 필터링 정책의 이름을 정합니다.

| 옵션                                  | 동작                                                               |
| ------------------------------------- | ------------------------------------------------------------------ |
| `documents: ["guide/start"]`          | 확장자 없는 상대 문서 ID로 선택                                    |
| `library: ".cudoc/documents"`         | AST를 복사해 온 라이브러리에서 루트 기준 경로와 비공개 문서를 읽음 |
| `scopes: ["en", "ko"]`                | scope 조각으로 선택                                                |
| `excludeNodeTypes: ["code"]`          | 일치하는 노드와 하위 트리를 재귀적으로 제거                        |
| `excludeComponents: ["InternalNote"]` | 해당 이름의 MDX JSX 컴포넌트 노드 제거                             |
| `stripProperties: ["position"]`       | 지정한 속성을 재귀적으로 제거                                      |
| `projectionId: "search-v1"`           | 소비자가 사용하는 필터링 정책 식별                                 |

AST는 수집한 문서 그대로이며 임베드를 펼치지 않습니다. 임베드는 `lang: "cudoc-embed"`인 `code` 노드로 남고 그 값이 원본을 가리키므로, 임베드로 공유한 사실은 그 사실을 가진 문서에 한 번만 들어 있습니다. 독자가 보는 페이지 모습이 필요한 소비자는 블록의 `sources`를 따라가 해당 절을 읽습니다. `excludeNodeTypes: ["code"]`를 쓰면 다른 코드 블록과 함께 이 블록도 제거됩니다.

데이터셋은 기본으로 `private` 패턴으로 수집한 문서만 제외하며, 그 문서를 `documents`로 지정하면 오류입니다. `documents`와 `scopes`를 함께 지정하면 모두 일치해야 합니다. 문서의 scope는 루트 기준 경로 다음의 첫 조각이므로 기준 경로 `docs`, `terms`로 수집한 `docs/ko/guide`와 `terms/ko/token`은 모두 `ko`에 속합니다. 두 규칙은 `inputDir`가 속한 라이브러리를 읽고, AST를 그 밖으로 복사했다면 `library`로 지정한 라이브러리를 읽습니다. 라이브러리가 없는 AST 디렉터리에서는 scope가 첫 경로 조각이고 비공개 문서는 없습니다.

`type`과 `children`은 제거할 수 없으며, 이미 Markdown 노드로 정규화된 컴포넌트는 원래 JSX 이름으로 선택되지 않습니다.

따로 지정하지 않으면 버전 정보가 있는 AST를 요구합니다. 버전 없는 AST 모음을 의도적으로 읽을 때만 `requireVersion: false`를 씁니다. 구조 검증은 유지됩니다.

`docs` 호스트 프로필의 표 컴포넌트로 쓴 문서라면 `@cudoment/cudoc/dataset`의 `docsDatasetProjection`을 설정에 펼쳐 넣습니다. 이 프리셋은 `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` 컴포넌트와 `DocDataEmbed`를 제외하며 일반 Markdown 표는 제거하지 않습니다.

출력 디렉터리는 한 번에 출력하므로, 실패한 실행은 이전에 출력한 데이터셋을 그대로 남깁니다. manifest가 있는지가 아니라 명령이 성공했는지를 확인합니다.

코드 호출과 manifest는 [데이터셋 API](./api-reference/node.ko.md#데이터셋), 메모리에서의 변환은 [projectAst](./api-reference/document.ko.md#필터링)를 참고합니다.
