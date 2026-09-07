# 다른 문서의 일부를 끼워 넣기

[English](./embedding.md) | **한국어**

한 문서의 일부를 다른 문서 안에서 렌더링하되, 손으로 관리하는 사본이 아니라 cudoc이 내보낸 AST에서 읽어 오는 방법입니다.

AST 내보내기가 의미를 갖는 이유가 바로 이 절반에 있습니다. "요청 제한 항목의 내용은 이렇습니다"라고 말하는 페이지는 그 항목을 되풀이해서 적었거나, 읽어 온 것입니다. 되풀이해서 적으면 원본과 어긋나게 됩니다. 여기에서 설명하는 것은 읽어 오는 쪽입니다.

## 전체 흐름

네 단계이고, cudoc이 담당하는 것은 앞의 세 단계입니다.

1. 문서가 컴파일될 때 `cudoc/embed`로 AST를 **내보냅니다**.
2. 저장된 트리를 `loadAst`로 **읽습니다**.
3. 원하는 부분을 `cudoc/query`로 **찾습니다**.
4. 끼워 넣는 페이지의 방식대로 **렌더링합니다**.

네 번째 단계를 사용자에게 남겨 둔 것은 의도한 결정입니다. 끼워 넣기는 "이 항목을 그대로 출력하는 것"인 경우가 드뭅니다. 카드이거나, 요약 행이거나, 사이트의 나머지와 같은 스타일을 입힌 파라미터 표입니다. cudoc은 노드를 넘겨 주고, 그것을 무엇으로 만들지는 각 문서 체계가 정할 문제입니다.

실제로 동작하는 형태는 [`examples/next-mdx/app/embed`](../examples/next-mdx/app/embed)에 있습니다.

## 내보내고 읽기

내보내기 플러그인은 마지막에 두어야 합니다. 그러면 저장되는 트리가 다른 모든 변환이 끝난 뒤의 트리가 됩니다.

```js
// next.config.mjs 등 플러그인을 설정하는 자리
remarkPlugins: [
  ["remark-gfm"],
  ["cudoc-remark", cudocOptions],
  ["cudoc/embed", { sourceRoot: "docs", outDir: ".cudoc/ast" }],
]
```

```js
import { loadAst } from "cudoc/embed"

const document = loadAst("guide/limits", { outDir: ".cudoc/ast" })
```

둘은 같은 `outDir`을 받고, `loadAst`에 넘기는 경로는 `sourceRoot` 기준 상대 경로입니다. 그래서 `docs/guide/limits.mdx`는 `.cudoc/ast/guide/limits.json`에 저장되고 `"guide/limits"`로 읽습니다.

`loadAst`는 파일 시스템을 읽으므로 서버에서 실행되는 자리에 두어야 합니다. React 서버 컴포넌트나 빌드 스크립트, `getStaticProps` 같은 곳입니다.

읽는 쪽이 파일 경로를 이미 알고 있다면 `cudoc/node/load-ast-file`이 더 좁은 진입점입니다.

```js
import path from "node:path"
import { loadAstFile } from "cudoc/node/load-ast-file"

const document = loadAstFile(
  path.join(process.cwd(), ".cudoc/ast/guide/limits.json"),
)
```

검증은 동일하게 수행하면서 빌드 시점의 경로 계산을 읽는 쪽 모듈 그래프에서 제외합니다. 그래서 번들러가 페이지가 실제로 읽는 것보다 많은 파일을 추적하지 않게 됩니다.

### 빌드가 문서를 먼저 컴파일해야 합니다

remark 플러그인은 MDX가 실제로 컴파일될 때만 실행되므로, JSON은 문서가 한 번이라도 빌드된 뒤에야 존재합니다. 사이트의 어떤 것도 그 문서를 import 하거나 라우트로 노출하지 않으면 문서는 컴파일되지 않고 AST도 저장되지 않습니다.

embed가 읽기 전에 원본의 AST 내보내기가 끝나야 합니다. 개발 모드에서 embed 페이지를 먼저 열면 원본 라우트가 컴파일되지 않을 수 있습니다. 컴파일 캐시를 유지할 때는 `.cudoc/ast`도 함께 유지해야 합니다. JSON만 지워서는 캐시된 MDX가 다시 컴파일되지 않습니다. 둘을 함께 재생성하고, 런타임에 읽는 배포에는 JSON도 포함하십시오.

AST는 내보내기 플러그인이 실행된 시점의 remark 트리입니다. 어댑터 예제는 호스트 변환 전에 내보내므로, 호스트가 나중에 만드는 ID나 자산 경로, 컴포넌트 실행 결과까지 담지는 않습니다. embed에는 명시적 ID를 사용하십시오. Nextra는 ID를 다시 slug 처리하므로 중복되지 않는 소문자 slug ID를 사용해야 합니다. 조회 함수는 JavaScript 표현식을 실행하지 않습니다.

## 원하는 부분 찾기

### 앵커로 항목 잘라내기

```js
import { sliceSectionByAnchorId } from "cudoc/query"

const section = sliceSectionByAnchorId(document, "rate-limits")
```

결과는 그 자체로 하나의 트리입니다. 해당 제목과 그 아래 내용 전부이며, 같은 깊이이거나 더 얕은 다음 제목 앞에서 끝납니다. 루트의 `data`가 함께 옮겨지므로 스키마 버전이 잘라낸 조각에도 남고, 그 결과를 다시 검증할 수 있습니다.

조각에서 사용하는 링크·이미지·각주 정의는 섹션 밖에 있어도 함께 보존합니다. 형제 노드 범위만 필요하면 `includeDefinitions: false`를 지정하십시오. 노드는 원본과 공유되므로 수정할 때는 먼저 복제해야 합니다.

앵커 ID가 적절한 키입니다. 제목의 문구는 바뀌지만 작성자가 지정한 ID는 바뀌지 않으며, cudoc에 명시적 앵커가 있는 이유가 바로 그것입니다. `#rate-limits`와 `rate%20limits`를 모두 받아들이므로 링크에서 그대로 가져온 ID도 동작합니다.

그 ID를 가진 제목이 없으면 예외를 던지지 않고 `undefined`를 반환합니다. 끊어진 참조는 실제로 일어나는 상황이고, 그 상황에서 무엇을 할지는(대체 내용을 보여줄지, 경고할지, 빌드를 실패시킬지) 사용자가 정할 문제이기 때문입니다.

API 이름 아래에 놓인 `Requirements`처럼 그 자체만으로는 의미가 없는 깊은 항목이라면, 위쪽 제목을 함께 요청하실 수 있습니다.

```js
sliceSectionByAnchorId(document, "create-user-requirements", {
  contextHeadingFromDepth: 5,
})
```

### 특정 노드 주변에서 찾기

```js
import { findSectionEnd, findSiblingNode } from "cudoc/query"

const table = findSiblingNode(parent, index, {
  direction: "after",
  type: "table",
  boundary: findSectionEnd(parent, index, heading.depth),
})
```

여기에서 중요한 것은 `boundary`입니다. 이것이 없으면 "이 제목 다음의 표"가 조용히 "문서 안의 다음 표"가 되고, 자기 표가 없는 항목이 뒤따르는 항목의 표를 가져다 쓰게 됩니다. 화면은 정상적으로 그려지고 데이터만 틀리기 때문에, 이런 종류의 오류는 그대로 배포됩니다.

### 블록을 포함한 텍스트

```js
import { getNodeText } from "cudoc/query"

getNodeText(section.children)
```

`getInlineText`와 달리 블록까지 내려가며 블록 사이를 구분하므로, 제목이 그 아래 문단과 붙지 않습니다. 기본적으로는 알지 못하는 요소 안으로도 들어갑니다. 저장된 트리에는 호스트 고유의 JSX가 많고, 그 안의 텍스트를 조용히 버리면 내용이 사라지기 때문입니다. 본문만 필요하시다면 `includeUnknown: false`를 넘기시면 됩니다.

### 제목의 배지

```js
import { getHeadingBadge } from "cudoc/query"

getHeadingBadge(heading) // "REST API"
```

배지는 제목의 자식 노드가 아니라 앵커 요소의 속성이므로, 제목의 텍스트를 모아도 찾을 수 없습니다. 제목을 얻으려는 경우에는 그것이 바람직한 동작이고, 배지 자체가 필요한 경우에는 결코 바람직하지 않은 동작입니다.

### 표의 셀

```js
import {
  findTableColumnIndex,
  getTableCellText,
  getTableHeaderTexts,
} from "cudoc/query"

getTableHeaderTexts(table) // ["파라미터", "필수", "설명"]
findTableColumnIndex(table, ["필수"]) // 1
getTableCellText(table, [
  [1, 0],
  [1, 1],
]) // ["user_id", "필수"]
```

행과 열 번호로 셀을 지정하는 것은 투박하지만, Markdown 표에는 그 대신 쓸 필드 이름이 없습니다. 헤더로 열 번호를 먼저 찾으면, 누군가 열 순서를 바꾸었을 때 끼워 넣기가 깨지지 않습니다.

없는 셀은 예외 대신 `undefined`를 반환합니다. 열이 하나 모자란 표는 문서 쪽 문제이고, 경고만 할지 실패시킬지는 호출하는 쪽이 정할 수 있기 때문입니다.

코드 블록의 텍스트도 읽으며, 표 전체를 읽을 때는 셀 사이에 탭을 넣습니다. `tableCellSeparator`로 셀 구분자를 바꿀 수 있습니다. 표현식과 import/export는 텍스트로 읽거나 실행하지 않습니다.

표 조회 함수는 목록이 들어 있는 cudoc의 셀을 포함해 mdast 표를 읽습니다. `tableColumnLayout` 규칙으로 변환된 표는 그 시점에 이미 JSX이므로, 그 컴포넌트 구조를 대신 읽어야 합니다. 내보내기와 읽기는 기본적으로 `td`와 `th`, `TableCell` 셀 안의 목록을 검증합니다. 규칙이 자체 셀 컴포넌트를 지정한다면 양쪽에 같은 `tableCellElement: ["CustomCell"]`을 넘기시면 됩니다.

## 기존 Next.js 파이프라인에서 옮겨오기

Next.js 사이트가 직접 만든 remark 플러그인을 cudoc으로 교체할 때에는, 뒤따르는 코드를 동시에 고치지 않는 편이 낫습니다. 첫 번째 버전은 기존 산출물을 바이트 단위로 그대로 재현하게 만들고, 그 다음에야 다른 것을 옮기는 방식입니다.

그러려면 대개 네 가지를 기존 값에 고정해야 합니다.

```js
const cudocOptions = {
  // 기존 Next.js 파이프라인의 목차 export를 유지합니다.
  toc: true,
  tableColumnLayout: [
    {
      section: { depth: 5, titles: ["Requirements"] },
      columnHeaders: ["Prerequisites"],
      split: { minItems: 4, columns: 2 },
      // 사이트가 표를 컴포넌트로 렌더링하는 경우에만 지정합니다. 기본값은
      // HTML 태그 이름이며, 그 경우에는 제공할 컴포넌트가 없습니다.
      components: {
        table: "Table",
        header: "TableHeader",
        body: "TableBody",
        row: "TableRow",
        head: "TableHead",
        cell: "TableCell",
      },
    },
  ],
}

const astOptions = {
  sourceRoot: "docs",
  // 사이트가 이미 JSON을 저장하는 위치와, 소비 코드가 확인하는 필드입니다.
  outDir: "src/data/documents",
  version: { field: "documentAstVersion", value: 2 },
}

const remarkPlugins = [
  ["remark-gfm"],
  ["cudoc-remark", cudocOptions],
  ["cudoc/embed", astOptions],
  // 사이트가 자기 플러그인 뒤에 두었던 것은 cudoc 뒤에 그대로 둡니다.
]
```

`titles`와 `columnHeaders`는 각각 여러 문자열을 받습니다. 하나의 규칙으로 여러 언어로 발행되는 문서 체계를 함께 다룰 수 있습니다.

사이트의 컴포넌트는 그대로 두시기 바랍니다. 사이트의 `Anchor`가 이미 ID를 직접 렌더링하고 있다면, `heading-ids`를 추가하면 헤딩에도 같은 ID가 놓입니다. 둘 중 하나는 바꾸어야 하며, 아무것도 바꾸지 않는 선택은 없습니다.

ID를 헤딩으로 올리는 방식이 더 나중에 정리된 방식이고 더 낫습니다. 다만 이것은 렌더링 결과가 달라지는 변경이므로, 교체 작업의 부수 효과가 아니라 의도한 결정으로 진행하시기 바랍니다.

### 래퍼가 여전히 담당해야 하는 것

사이트의 기존 보조 함수가 하던 일 가운데 일부는 동작 방식이 아니라 정책이며, cudoc은 그것을 의도적으로 정하지 않습니다.

- **없는 앵커.** `sliceSectionByAnchorId`는 `undefined`를 반환합니다. 경고할지, 대체 내용을 보일지, 빌드를 실패시킬지는 사이트가 정할 문제입니다.
- **인라인 전용 셀.** `getTableCellNodes`는 목록도 인라인 내용과 마찬가지로 반환합니다. 셀이 인라인이어야 한다고 요구하는 사이트는 직접 확인해야 합니다.
- **조각 링크.** `#anchor`를 원본 문서의 URL에 붙이는 방식은 사이트가 문서를 어떻게 라우팅하는지에 달려 있습니다.
- **항목의 문맥.** 깊은 항목이 위쪽 제목을 함께 가져올지, 어느 깊이부터 그렇게 할지는 관례입니다. `contextHeadingFromDepth`가 깊이를 받고, 그 값을 정하는 것은 사용자의 몫입니다.

기존 함수 이름을 유지하는 얇은 래퍼를 두는 것이 가장 비용이 적은 경로입니다. 호출하는 코드와 그 테스트를 그대로 둔 채 내부 구현만 바뀌기 때문입니다.

### 교체 전후 대조

먼저 기존 구현으로 빌드해서 산출물을 보관하고, cudoc으로 다시 빌드해서 비교하시기 바랍니다. 저장된 JSON**과** 컴파일된 MDX를 모두 비교해야 하며, 목차 export도 포함해야 합니다. 저장하는 트리는 맞으면서 화면에 그리는 결과는 틀린 변환이 있을 수 있기 때문입니다.

## cudoc이 의도적으로 하지 않는 것

**노드를 렌더링하지 않습니다.** `<Ast nodes={...} />` 같은 것은 없습니다. 끼워 넣기의 가치는 그것이 놓인 페이지와 같은 모습이라는 데 있고, 범용 렌더러는 그 목적과 충돌합니다. 노드를 순회하면서 사이트의 컴포넌트를 만들어 쓰시거나, 하위 트리 전체가 필요하다면 `mdast-util-to-hast`로 변환하시면 됩니다.

**각 항목이 무엇을 뜻하는지 알지 못합니다.** "파라미터 표를 찾아라"나 "엔드포인트를 읽어라" 같은 기능은 없습니다. 어떤 제목이 무엇을 소개하고 어떤 열이 무엇을 담는지는 특정 문서 체계의 관례이며, 공용 패키지에 그것을 넣으면 다른 모든 사용자에게 맞지 않는 것이 됩니다. 위의 원시 도구들 위에 직접 만드시기 바랍니다.

## 끼워 넣기를 믿을 수 있게 유지하기

빌드가 저절로 실패하지 않는 두 가지 실패를 특히 주의하셔야 합니다.

**낡은 산출물.** 빌드가 컴파일 캐시를 재사용하면 화면과 내보낸 AST가 모두 이전 버전에 머물 수 있습니다. 문서를 고치고 다시 빌드했을 때 둘 다 바뀌어야 하며, 이 저장소의 [`scripts/check-rebuild.mjs`](../scripts/check-rebuild.mjs)가 그것을 확인하는 한 가지 방법입니다.

**조용히 잘못된 참조.** 더 이상 존재하지 않는 앵커나 다른 항목으로 옮겨 간 표가 그렇습니다. `sliceSectionByAnchorId`는 `undefined`를 반환하고 `getTableCellText`도 없는 셀에 `undefined`를 반환하므로, 이를 확인하지 않는 끼워 넣기는 실패하는 대신 빈 카드를 그립니다. 끊어진 참조가 어떻게 동작해야 하는지 정하시고, 그 확인을 코드에 명시하시기 바랍니다.
