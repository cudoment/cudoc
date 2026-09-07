# cudoc

[![CI](https://github.com/cudoment/cudoc/actions/workflows/ci.yml/badge.svg)](https://github.com/cudoment/cudoc/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE) [![Node.js 20+](https://img.shields.io/badge/node-%3E%3D20-5FA04E?logo=node.js&logoColor=white)](https://nodejs.org)

[English](./README.md) | **한국어**

MDX 문서의 컴파일된 AST에서 섹션과 표를 가져와 여러 정적 사이트 생성기에서 재사용하는 도구입니다.

cudoc은 문서 사이트에서 되풀이해서 필요해지는 표기를 제공합니다. 헤딩에 직접 지정하는 앵커, 인라인 배지, 표 셀 안의 목록, 컴포넌트로 구성하는 표가 그것입니다. 또한 각 문서의 컴파일된 AST를 JSON으로 내보낼 수 있어서, 검색과 문서 재사용과 링크 검사가 화면을 그린 것과 같은 트리를 읽게 됩니다.

다른 문서의 일부를 끼워 넣는 임베딩이 핵심 사용 흐름입니다. 컴파일된 AST를 내보내고, 읽고, 필요한 섹션을 찾아 사이트의 컴포넌트로 렌더링합니다. 문법 확장은 각각 따로 설정하며, 특정 사이트 생성기를 전제하지 않습니다.

## 목차

- [왜 필요한가](#왜-필요한가)
- [패키지](#패키지)
- [설치](#설치)
- [문법](#문법)
- [옵션](#옵션)
- [컴포넌트 제공](#컴포넌트-제공)
- [사이트 생성기에 연결하기](#사이트-생성기에-연결하기)
- [AST 내보내기](#ast-내보내기)
- [다시 읽어 쓰기](#다시-읽어-쓰기)
- [가이드와 예제](#가이드와-예제)
- [제약](#제약)

## 왜 필요한가

문서 사이트는 대개 한 번 쓰고 마는 remark 플러그인을 여러 개 갖게 됩니다. 앵커를 위한 것 하나, 배지를 위한 것 하나, 그리고 Markdown이 표 셀 안에 목록을 넣지 못하는 문제를 우회하기 위한 것 하나입니다. 이런 플러그인들은 그것이 자라난 사이트와 뒤엉키게 되고, 만들어 낸 AST는 렌더링이 끝나면 버려집니다. 그래서 검색과 검증은 문서를 다시 파싱하게 되고, 그 결과는 화면에 실제로 나타난 것과 어긋나게 됩니다.

cudoc은 이 둘을 분리합니다. 문법은 선언적으로 기술되어 어느 호스트든 받아들일 수 있고, 컴파일된 트리는 데이터로 내보낼 수 있어서 뒤따르는 모든 기능이 화면과 같은 것을 읽습니다.

## 패키지

| 패키지                                            | 담당하는 일                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| [`cudoc`](./packages/cudoc)                       | 공통 AST 계약, 검증, 조회와 임베딩을 위한 Node 저장·로드를 제공합니다 |
| [`cudoc-remark`](./packages/cudoc-remark)         | remark 플러그인입니다. 기능마다 옵션 묶음이 따로 있습니다             |
| [`cudoc-docusaurus`](./packages/cudoc-docusaurus) | Docusaurus 연결과 헤딩 ID 정리, 그리고 컴포넌트를 제공하는 테마입니다 |
| [`cudoc-nextra`](./packages/cudoc-nextra)         | Nextra 연결과 헤딩 ID 정리, 그리고 기본 컴포넌트입니다                |

각 변환은 하위 진입점으로도 제공되므로, 한 기능만 필요한 호스트는 그것만 가져다 쓸 수 있습니다.

```js
import tableCellList from "cudoc-remark/table-cell-list"
import badge from "cudoc-remark/badge"
```

## 설치

```bash
npm install cudoc cudoc-remark
npm install cudoc-docusaurus    # Docusaurus에서 사용합니다
npm install cudoc-nextra        # Nextra에서 사용합니다
```

`cudoc/embed`는 `cudoc`에 포함된 Node 전용 진입점이며 별도 패키지가 아닙니다. `cudoc`과 `cudoc/query`는 브라우저에서도 사용할 수 있습니다. 모든 어댑터와 변환은 `cudoc`을 통해 같은 내부 core를 사용하며, core는 별도로 배포하지 않습니다. AST 저장 위치와 스냅샷 시점을 정할 수 있도록 내보내기는 호스트 파이프라인에 명시적으로 연결합니다.

[임베딩 가이드](./docs/embedding.ko.md)에서 내보내기부터 렌더링까지 확인할 수 있습니다. `cudoc-remark`와 호스트 어댑터는 별도 배포 단위이며, `cudoc`만 배포한다고 함께 공개되지는 않습니다.

## 문법

### 헤딩 앵커와 배지

```md
## 요청 제한 (#rate-limits) (@REST API)
```

위 문서는 화면에 `요청 제한`만 보이는 헤딩이 되고, 그 뒤에 다음 요소가 붙습니다.

```jsx
<Anchor id="rate-limits" headerLevel="h2" badge="REST API" />
```

작성자가 직접 지정한 앵커는 값이 고정되므로, 헤딩 문구를 고쳐도 그 헤딩을 가리키던 링크가 계속 동작합니다.

### 인라인 배지

```md
이 엔드포인트는 (@지원 종료) 대상이며 이후 삭제됩니다.
```

링크 안에 있는 배지 표기는 변환하지 않습니다. 그 자리에 배지를 넣으면 상호작용하는 요소가 중첩되기 때문입니다.

### 표 셀 안의 목록

Markdown은 표 셀 안에 목록을 넣지 못합니다. cudoc은 셀의 원문을 읽어서, 일반적인 목록이 만들어 내는 것과 같은 `list` 노드로 다시 구성합니다.

```md
| 항목 | 설명                                                |
| ---- | --------------------------------------------------- |
| 배송 | - 국내 배송<br />-- 도서 산간 제외<br />- 해외 배송 |
```

`-`와 `*`가 순서 없는 항목을 나타내고, 마커를 겹치거나(`--`, `**`) 들여쓰면 한 단계 깊어집니다. 순서 있는 항목은 `1.`, `1..`, `1...`이 같은 역할을 합니다. 숫자 항목 바로 뒤에 오는 단독 `-`는 그 항목보다 한 단계 깊은 항목으로 해석합니다.

해석할 수 없는 입력은 블록 단위로 원문을 유지합니다. 시작 번호가 JavaScript의 안전 정수 범위를 벗어난 순서 있는 목록이나, 부모가 없는 중첩 단계가 그렇습니다. 이때 같은 셀의 나머지 부분은 그대로 변환됩니다.

### 표 열 구성

항목이 많은 셀은 좁은 한 열에 담기면 읽기 어렵습니다. 열 구성 규칙을 지정하면 표를 호스트 컴포넌트로 바꾸고 한 열을 여러 칸으로 나누며, 표의 격자를 맞추기 위해 머리글 칸에 span을 부여합니다.

```js
tableColumnLayout: [
  {
    section: { depth: 5, titles: ["지원 환경"] },
    columnHeaders: ["필요 조건"],
    split: { minItems: 4, columns: 2 },
  },
]
```

## 옵션

```js
{
  // 표 셀 안의 목록 문법입니다. 기본으로 켜져 있습니다.
  tableCellList: true,

  // 헤딩에 적은 앵커와 배지입니다. 기본으로 켜져 있습니다.
  headingMetadata: {
    depths: [2, 3, 4, 5],
    idDelimiters: ["(#", ")"],
    badgeDelimiters: ["(@", ")"],
    anchor: {
      name: "Anchor",
      idAttribute: "id",
      levelAttribute: "headerLevel",  // false를 주면 이 속성을 넣지 않습니다
      levelPrefix: "h",
      badgeAttribute: "badge",
    },
  },

  // 일반 본문의 배지 표기입니다. 기본으로 켜져 있습니다.
  badge: {
    name: "Badge",
    delimiters: ["(@", ")"],
    excludeAncestors: ["link", "linkReference"],
  },

  // 열 구성 규칙입니다. 적은 순서대로 적용하며 기본값은 빈 배열입니다.
  tableColumnLayout: [],

  // 직접 만든 변환입니다. 내장 변환과 같은 순회에서 실행됩니다.
  transforms: { pre: [], post: [] },
}
```

모든 기능은 `false`를 주면 꺼지고, `true`를 주면 기본 설정으로 동작합니다. 알 수 없는 옵션 이름은 무시하지 않고 오류로 알립니다. 그래야 오타가 한참 뒤에 산출물이 비는 것으로 드러나지 않고 시작 시점에 드러납니다.

모든 변환은 한 번의 순회에서 실행됩니다. 이것은 속도만을 위한 것이 아닙니다. 변환 사이의 순서가 곧 계약이기 때문입니다. 셀은 내려가는 길에 정규화되므로, 올라오는 길에 표 전체를 다시 만드는 규칙은 이미 완성된 셀을 보게 됩니다.

## 컴포넌트 제공

cudoc은 대문자로 시작하는 요소를 만듭니다. `Anchor`와 `Badge`, 그리고 표 열 구성 규칙이 지정한 이름들입니다. MDX는 이 요소들을 사용자가 제공한 컴포넌트에서 찾고, 하나라도 없으면 렌더링 시점에 오류를 냅니다.

`cudoc-remark/components`는 `Anchor`와 `Badge`를 제공합니다. 기본 표 열 구성은 호스트의 기존 `table`, `thead`, `tbody`, `tr`, `th`, `td` 매핑을 사용합니다. 대문자 표 컴포넌트 이름을 직접 지정한 경우에만 추가 구현이 필요합니다.

```jsx
import { cudocComponents } from "cudoc-remark/components"

export function useMDXComponents(components) {
  return { ...components, ...cudocComponents }
}
```

기본 구현은 디자인이 아니라 스타일을 붙일 자리를 만들어 둔 마크업입니다. `span.cudoc-badge`처럼 클래스 이름이 붙어 있습니다. 특정 컴포넌트만 교체하려면 전개 뒤에 두면 됩니다.

```jsx
return { ...components, ...cudocComponents, Badge: MyBadge }
```

Docusaurus에서는 어댑터의 테마가 이 컴포넌트들을 제공하므로 따로 작성할 것이 없습니다.

이미 갖고 있는 컴포넌트에 맞추어 요소 이름 자체를 바꿀 수도 있습니다. 이 경우에는 새로 제공할 컴포넌트가 없습니다.

```js
headingMetadata: {
  anchor: {
    name: "HeadingLink"
  }
}
```

## 사이트 생성기에 연결하기

각 호스트는 같은 문서를 렌더링하는 [예제 사이트](./examples)로 검증되어 있으며, 세 사이트의 산출물을 서로 대조합니다.

### `@next/mdx`를 쓰는 Next.js

```js
import createMDX from "@next/mdx"

const withMDX = createMDX({
  options: {
    remarkPlugins: [
      ["remark-gfm"],
      ["cudoc-remark", cudocOptions],
      // 기본 Anchor는 배지만 렌더링하므로 이 줄이 헤딩의 실제 ID를 만듭니다.
      // 앵커 ID를 헤딩에 올려 두면 깊은 링크와 이후 도구가 기대하는 자리에
      // ID가 놓이게 됩니다.
      ["cudoc-remark/heading-ids", {}],
    ],
  },
})
```

플러그인을 함수가 아니라 패키지 이름으로 지정합니다. Turbopack은 MDX 설정을 워커에 넘기므로 함수를 담을 수 없고, webpack은 설정을 이 프로세스에 그대로 두지만 `@next/mdx`의 로더가 문자열 지정자도 해석하기 때문에, 한 가지 형태로 두 번들러를 모두 지원할 수 있습니다. 옵션이 순수 JSON이어야 하는 이유도 같습니다. [제약](#제약)을 참고하시기 바랍니다.

`mdx-components.js`에서 `Anchor`와 `Badge`를 제공합니다. 기본 표 열 구성은 호스트의 기존 HTML 표 매핑을 사용하며, 대문자 컴포넌트 이름을 직접 지정한 경우에만 추가 구현이 필요합니다.

필요한 경우 [Next.js 가이드](./docs/next-mdx.ko.md#목차)에 따라 목차를 내보낼 수 있습니다.

### Docusaurus

```js
import { cudocRemarkPlugins } from "cudoc-docusaurus"

presets: [["classic", { docs: {
  beforeDefaultRemarkPlugins: cudocRemarkPlugins(cudocOptions),
} }]],
plugins: ["cudoc-docusaurus"],
```

`beforeDefaultRemarkPlugins`에 연결해서 Docusaurus가 자체 헤딩 ID를 부여하기 전에 앵커가 존재하도록 하고, 플러그인 항목을 추가해서 어댑터의 테마가 컴포넌트를 제공하도록 합니다. 자세한 내용은 [`cudoc-docusaurus`](./packages/cudoc-docusaurus#readme)에 있습니다.

### Nextra

```js
import { cudocRemarkPlugins } from "cudoc-nextra"

const withNextra = nextra({
  mdxOptions: { remarkPlugins: cudocRemarkPlugins(cudocOptions) },
})
```

Nextra는 이 플러그인들을 자기 플러그인보다 앞에 놓기 때문에 cudoc이 필요로 하는 순서가 그대로 만들어집니다. `mdx-components.jsx`에서 `cudoc-nextra/components`의 `cudocComponents`를 함께 제공해야 합니다. 자세한 내용은 [`cudoc-nextra`](./packages/cudoc-nextra#readme)에 있습니다.

### 호스트가 헤딩 ID를 직접 만드는 경우

Docusaurus와 Nextra는 헤딩 텍스트를 slug로 바꾸어 ID를 만들기 때문에, 그대로 두면 한 헤딩에 ID가 둘 생깁니다. 두 어댑터는 그보다 먼저 각 앵커 ID를 헤딩 자체에 올려서, 헤딩과 앵커가 하나의 값에 합의하도록 만듭니다. 이 일을 하는 플러그인이 `cudoc-remark/heading-ids`이며, 파이프라인이 `mdast-util-to-hast`로 끝나는 호스트라면 순수 MDX를 포함해서 어디서나 동작합니다.

## AST 내보내기

```js
import exportAst from "cudoc/embed"

remarkPlugins: [
  ["remark-gfm"],
  [cudocPrepare, cudocOptions],
  [exportAst, { sourceRoot: "docs", outDir: ".cudoc/ast" }],
]
```

`sourceRoot` 아래의 각 문서가 `outDir` 아래의 같은 경로로 저장됩니다. 위치 정보와 export 전용 노드는 제거하고, 스키마 버전을 `root.data`에 기록하며, 저장하기 전에 계약을 검증합니다.

트리는 다시 파싱한 결과가 아니라 호스트의 실제 컴파일에서 받은 것입니다. MDX를 다시 파싱해서 같은 결과를 흉내 내면 어긋나게 되는데, MDX 컴파일러가 사용자 플러그인보다 먼저 자체 변환을 적용하기 때문입니다.

## 다시 읽어 쓰기

트리를 내보내는 것은 절반입니다. 나머지 절반은 다른 문서의 항목이나 표, 문단을 가져와서 그 자리에 렌더링하는 페이지입니다. 그래야 요약과 요약 대상이 하나의 트리에서 나오고 서로 어긋나지 않습니다.

`loadAst`는 저장된 문서를 읽으면서 스키마 버전을 검증합니다. 오래된 파일이 남아 있으면 잘못 해석되지 않고 읽는 자리에서 드러납니다.

```js
import { loadAst } from "cudoc/embed"

const document = loadAst("ko/setup/app", { outDir: ".cudoc/ast" })
```

원하는 부분을 찾는 도구는 `cudoc/query`입니다. 키는 앵커 ID입니다. 작성자가 지정한 값이고 제목의 문구가 바뀌어도 남기 때문이며, cudoc에 명시적 앵커가 있는 이유이기도 합니다.

```js
import {
  findSiblingNode,
  getHeadingBadge,
  getNodeText,
  getTableCellText,
  sliceSectionByAnchorId,
} from "cudoc/query"

// 링크가 가리키는 항목을 하나의 트리로 잘라냅니다.
const section = sliceSectionByAnchorId(document, "rate-limits")
if (!section) throw new Error("Missing section: rate-limits")

const [heading, ...rest] = section.children
getNodeText([heading]) // "요청 제한"
getHeadingBadge(heading) // "REST API" — 텍스트가 아니라 속성입니다

// 항목 범위로 제한하므로 다음 항목의 표를 가져오지 않습니다.
const table = findSiblingNode(section, 0, {
  direction: "after",
  type: "table",
  boundary: section.children.length,
})
if (!table) throw new Error("Missing table in rate-limits")
getTableCellText(table, [
  [1, 0],
  [1, 1],
])
```

특정 끼워 넣기에서 어떤 노드가 필요한지는 사용자가 정합니다. cudoc은 내보내기 플러그인이 실행된 시점의 remark 트리를 저장하고 조회합니다. 그 뒤의 호스트 변환과 컴포넌트 실행 결과까지 포함하는 것은 아닙니다.

전체 과정은 [끼워 넣기 가이드](./docs/embedding.ko.md)에 있고, 실제로 그렇게 동작하는 페이지는 [`examples/next-mdx/app/embed`](./examples/next-mdx/app/embed)에 있습니다.

## 가이드와 예제

[`docs/`](./docs)에는 호스트별로 빈 프로젝트에서 화면이 나올 때까지의 설정 과정이 정리되어 있고, 세 호스트가 어디에서 왜 달라지는지도 함께 설명합니다.

- [`@next/mdx`를 쓰는 Next.js](./docs/next-mdx.ko.md)
- [Docusaurus](./docs/docusaurus.ko.md)
- [Nextra](./docs/nextra.ko.md)

[`examples/`](./examples)에는 호스트마다 사이트가 하나씩 들어 있고, 셋 모두 [같은 문서](./examples/fixtures/showcase.mdx)를 같은 옵션으로 렌더링합니다. `scripts/compare-hosts.mjs`는 세 사이트가 빌드한 HTML을 읽어서 헤딩 ID와 배지, 목록 구조와 표 구조가 일치하는지 확인합니다. `scripts/check-rebuild.mjs`는 문서를 고친 뒤 다시 빌드해서, 그 수정이 화면과 내보낸 AST 양쪽에 반영되는지 확인합니다.

## 제약

**옵션은 JSON으로 직렬화할 수 있어야 합니다.** 번들러가 플러그인 설정을 워커에 넘길 수 있기 때문에 함수와 `RegExp` 객체를 쓸 수 없습니다. 문법은 구분자 쌍으로, 조건은 선언적 셀렉터로 기술합니다. 실제로 코드가 필요한 동작은 `transforms`로 넘기는 사용자 정의 변환에 둡니다. 이 옵션은 프로그래밍 방식으로 쓸 때만 사용할 수 있습니다.

**구분자는 파서가 해석하지 않는 문자여야 합니다.** 구분자는 문서를 파싱한 뒤에 찾기 때문에, MDX에서는 JavaScript 표현식을 시작하는 `{`와 `}`, 요소를 시작하는 `<`를 쓸 수 없습니다.

**표 셀 목록은 원문이 있어야 동작합니다.** 셀의 마커는 위치 정보와 원문으로 읽는데 mdast는 이것을 보존하지 않습니다. 원문이 없으면 AST의 형태만으로 목록을 추측하지 않고 셀을 그대로 둡니다.

## 라이선스

[MIT](./LICENSE)
