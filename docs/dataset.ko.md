# AST 데이터셋

[English](./dataset.md) | **한국어** · [전체 가이드](./README.ko.md)

컴파일한 문서를 필터링해 인덱싱 등 후속 처리에서 사용할 사본을 만듭니다. 입력은 Markdown이 아닌 AST JSON이며 원본은 수정하지 않습니다. 검색 엔진이나 링크 감시 기능 자체를 생성하지는 않습니다.

## 먼저 문서 수집

[문서 수집](./embedding.ko.md#문서-수집-설정)을 완료합니다. 데이터셋 입력은 AST 파일이 있는 `.cudoc/documents/documents`입니다. manifest와 원문 스냅샷이 함께 있는 라이브러리 루트를 지정하지 않습니다.

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

후속 처리에서 `.cudoc/dataset/documents/`의 필터링된 AST와 `.cudoc/dataset/manifest.json`의 문서 목록을 읽습니다. 출력 디렉터리는 입력과 분리합니다.

## 포함할 콘텐츠 선택

| 옵션                                  | 동작                                               |
| ------------------------------------- | -------------------------------------------------- |
| `documents: ["guide/start"]`          | 확장자 없는 상대 문서 ID로 선택                    |
| `library: ".cudoc/documents"`         | 루트 기준 경로와 비공개 문서를 라이브러리에서 읽음 |
| `scopes: ["en", "ko"]`                | scope 조각으로 선택                                |
| `excludeNodeTypes: ["code"]`          | 일치하는 노드와 하위 트리를 재귀적으로 제거        |
| `excludeComponents: ["InternalNote"]` | 해당 이름의 MDX JSX 컴포넌트 노드 제거             |
| `stripProperties: ["position"]`       | 지정한 속성을 재귀적으로 제거                      |
| `projectionId: "search-v1"`           | 소비자가 사용하는 필터링 정책 식별                 |

기본값은 아무 콘텐츠도 제외하지 않습니다. `documents`와 `scopes`를 함께 지정하면 모두 일치해야 합니다. 문서의 scope는 첫 경로 조각이며, `library`를 주면 그 루트의 기준 경로 다음 첫 조각이 되므로 기준 경로 `docs`, `terms`로 수집한 `docs/ko/guide`와 `terms/ko/token`은 모두 `ko`에 속합니다. `library`를 주면 `private` 패턴으로 수집한 문서는 제외되며, 그 문서를 `documents`로 지정하면 오류입니다. `type`, `children`은 제거할 수 없습니다. 이미 Markdown 노드로 정규화된 컴포넌트는 원래 JSX 이름으로 선택되지 않습니다.

기본적으로 버전 정보가 있는 AST를 요구합니다. 버전 없는 AST 모음을 의도적으로 읽을 때만 `requireVersion: false`를 사용하세요. 구조 검증은 유지됩니다.

Docs 전용 제외 정책이 필요하면 `@cudoment/cudoc/dataset`의 `docsDatasetProjection`을 설정에 명시적으로 펼쳐 넣습니다. 이 프리셋은 Docs의 지정된 표 컴포넌트와 `DocDataEmbed`를 제외하며 일반 Markdown 표를 제거하지 않습니다. 프리셋 적용이 Docs 프로젝트의 마이그레이션을 수행하지는 않습니다.

## Docs 데이터셋 도구와의 관계

컴파일된 AST의 후처리, 컴포넌트 하위 트리의 재귀 제외, Markdown 표 유지, 상대 문서 경로 보존은 공통입니다. 다만 `src/tools/docs-ast-dataset`을 그대로 대체하는 도구는 아닙니다.

- Docs는 `data.docsAstVersion: 2`를 검증하고 `meta.json`을 게시합니다. cudoc 수집은 `data.cudocAstVersion: 1`, 데이터셋 출력은 `manifest.json`을 사용합니다. 버전 검사를 끄는 방식으로 계약 차이를 우회하지 않습니다.
- Docs에는 원본 경로 커버리지 검사와 commit/ref 메타데이터 주입이 있습니다. cudoc의 범용 생성기는 해당 릴리스 검증이나 공개 가능한 스코프의 판단을 수행하지 않습니다.
- Docs는 제외 대상 없는 payload의 입력 바이트를 보존하고 실패 시 이전 출력을 제거합니다. cudoc은 투영 AST를 직렬화하며 staging 실패 시 이전 성공 출력을 유지합니다. 소비자는 과거 manifest의 존재만으로 성공을 판단하지 말고 명령의 성공 여부를 확인해야 합니다.
- 이름 기준 제외는 해당 JSX 이름이 남아 있는 단계에서 실행해야 합니다. 이미 HTML·Markdown으로 정규화한 뒤에는 Docs 컴포넌트 이름 프리셋으로 원래 요소를 식별할 수 없습니다.

Docs 명령을 대체하기 전에 소비자 계약, 허용 스코프, 빌드 출처 검증, 실패 시 동작을 결정해야 합니다. Docs 고유 후처리는 기존 `buildDocumentPayload` 진입점에 유지하며, 그 안에서 `projectAst`를 재사용하는 것은 별도 연동 작업입니다. Markdown을 다시 파싱하는 경로를 추가할 이유는 아닙니다.

코드 호출과 manifest는 [데이터셋 API](./api-reference/node.ko.md#데이터셋), 메모리에서의 변환은 [projectAst](./api-reference/document.ko.md#필터링)를 참고하세요.
