# cudoc

[![CI](https://github.com/cudoment/cudoc/actions/workflows/ci.yml/badge.svg)](https://github.com/cudoment/cudoc/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE) [![Node.js 20+](https://img.shields.io/badge/node-%3E%3D20-5FA04E?logo=node.js&logoColor=white)](https://nodejs.org)

[English](./README.md) | **한국어**

MDX 문서 문법 확장과 AST 추출을 여러 정적 사이트 생성기에서 함께 쓰기 위한 도구입니다.

cudoc은 문서 사이트에서 되풀이해서 필요해지는 표기를 제공합니다. 헤딩에 직접 지정하는 앵커, 인라인 배지, 표 셀 안의 목록, 컴포넌트로 구성하는 표가 그것입니다. 또한 각 문서의 컴파일된 AST를 JSON으로 내보낼 수 있어서, 검색과 문서 재사용과 링크 검사가 화면을 그린 것과 같은 트리를 읽게 됩니다.

모든 기능은 선택 사항이며 각각 따로 설정합니다. 특정 사이트 생성기를 전제하지 않습니다.

## 목차

- [왜 필요한가](#왜-필요한가)
- [패키지](#패키지)
- [설치](#설치)
- [문법](#문법)
- [옵션](#옵션)
- [컴포넌트 제공](#컴포넌트-제공)
- [사이트 생성기에 연결하기](#사이트-생성기에-연결하기)
- [AST 내보내기](#ast-내보내기)
- [제약](#제약)

## 왜 필요한가

문서 사이트는 대개 한 번 쓰고 마는 remark 플러그인을 여러 개 갖게 됩니다. 앵커를 위한 것 하나, 배지를 위한 것 하나, 그리고 Markdown이 표 셀 안에 목록을 넣지 못하는 문제를 우회하기 위한 것 하나입니다. 이런 플러그인들은 그것이 자라난 사이트와 뒤엉키게 되고, 만들어 낸 AST는 렌더링이 끝나면 버려집니다. 그래서 검색과 검증은 문서를 다시 파싱하게 되고, 그 결과는 화면에 실제로 나타난 것과 어긋나게 됩니다.

cudoc은 이 둘을 분리합니다. 문법은 선언적으로 기술되어 어느 호스트든 받아들일 수 있고, 컴파일된 트리는 데이터로 내보낼 수 있어서 뒤따르는 모든 기능이 화면과 같은 것을 읽습니다.

## 패키지

| 패키지                                    | 담당하는 일                                                                         |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| [`cudoc-core`](./packages/cudoc-core)     | AST 계약, 검증, 순회, 문법 해석입니다. 파일 시스템과 프레임워크에 의존하지 않습니다 |
| [`cudoc-remark`](./packages/cudoc-remark) | remark 플러그인입니다. 기능마다 옵션 묶음이 따로 있습니다                           |
| [`cudoc-node`](./packages/cudoc-node)     | 경로 해석과 AST의 JSON 저장 및 로드를 담당합니다                                    |

각 변환은 하위 진입점으로도 제공되므로, 한 기능만 필요한 호스트는 그것만 가져다 쓸 수 있습니다.

```js
import tableCellList from "cudoc-remark/table-cell-list"
import badge from "cudoc-remark/badge"
```

## 설치

```bash
npm install cudoc-remark
npm install cudoc-node   # AST를 JSON으로 저장할 때만 필요합니다
```

`cudoc-core`는 두 패키지의 의존성으로 함께 설치됩니다.

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

  // 목차입니다. 대부분의 호스트가 자체 목차를 만들기 때문에 기본으로 꺼져 있습니다.
  toc: {
    titleDepth: 1,       // false를 주면 제목을 수집하지 않습니다
    depths: [2, 3],
    exportName: "toc",
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

cudoc은 대문자로 시작하는 요소를 만들어 냅니다. `Anchor`와 `Badge`, 그리고 열 구성 규칙에 지정한 이름들입니다. MDX는 이 요소들을 제공된 컴포넌트에서 찾으며, 없으면 렌더링 시점에 오류를 냅니다. 호스트가 MDX 컴포넌트를 연결하는 자리에서 함께 제공해야 합니다.

```jsx
export function useMDXComponents(components) {
  return {
    ...components,
    Anchor: MyAnchor,
    Badge: MyBadge,
  }
}
```

이미 가지고 있는 컴포넌트에 맞추어 이름을 바꿀 수도 있습니다.

```js
headingMetadata: {
  anchor: {
    name: "HeadingLink"
  }
}
```

## 사이트 생성기에 연결하기

### `@next/mdx`를 쓰는 Next.js

```js
import createMDX from "@next/mdx"
import cudocPrepare from "cudoc-remark"

const withMDX = createMDX({
  options: {
    remarkPlugins: [["remark-gfm"], [cudocPrepare, cudocOptions]],
  },
})
```

Turbopack은 설정을 워커에 넘기기 때문에 플러그인을 문자열로 지정하고 옵션은 순수 JSON이어야 합니다. cudoc의 옵션은 그 조건에 맞추어 설계되어 있습니다. [제약](#제약)을 참고하시기 바랍니다.

### Docusaurus

`beforeDefaultRemarkPlugins`로 연결해서 Docusaurus가 자체 헤딩 ID와 목차를 만들기 전에 앵커가 존재하도록 합니다. 목차를 양쪽에서 만들지 않도록 `toc`는 꺼 둡니다.

### Nextra

`mdxOptions.remarkPlugins`로 연결합니다. 같은 이유로 `toc`는 꺼 둡니다.

> Docusaurus와 Nextra 어댑터는 아직 배포하지 않았습니다. 두 호스트 모두 MDX v3를 쓰므로 플러그인 자체는 동작하며, 어댑터가 더하는 것은 실행 순서와 기본 컴포넌트입니다. 버전을 고정하고 작은 예제로 먼저 확인하시기 바랍니다.

## AST 내보내기

```js
import exportAst from "cudoc-node"

remarkPlugins: [
  ["remark-gfm"],
  [cudocPrepare, cudocOptions],
  [exportAst, { sourceRoot: "docs", outDir: ".cudoc/ast" }],
]
```

`sourceRoot` 아래의 각 문서가 `outDir` 아래의 같은 경로로 저장됩니다. 위치 정보와 export 전용 노드는 제거하고, 스키마 버전을 `root.data`에 기록하며, 저장하기 전에 계약을 검증합니다.

트리는 다시 파싱한 결과가 아니라 호스트의 실제 컴파일에서 받은 것입니다. MDX를 다시 파싱해서 같은 결과를 흉내 내면 어긋나게 되는데, MDX 컴파일러가 사용자 플러그인보다 먼저 자체 변환을 적용하기 때문입니다.

`loadAst`로 다시 읽을 수 있습니다. 읽는 시점에도 버전을 검증하므로, 오래된 파일이 남아 있으면 그것을 읽는 자리에서 드러납니다.

```js
import { loadAst } from "cudoc-node"

const document = loadAst("ko/setup/app", { outDir: ".cudoc/ast" })
```

## 제약

**옵션은 JSON으로 직렬화할 수 있어야 합니다.** 번들러가 플러그인 설정을 워커에 넘길 수 있기 때문에 함수와 `RegExp` 객체를 쓸 수 없습니다. 문법은 구분자 쌍으로, 조건은 선언적 셀렉터로 기술합니다. 실제로 코드가 필요한 동작은 `transforms`로 넘기는 사용자 정의 변환에 둡니다. 이 옵션은 프로그래밍 방식으로 쓸 때만 사용할 수 있습니다.

**구분자는 파서가 해석하지 않는 문자여야 합니다.** 구분자는 문서를 파싱한 뒤에 찾기 때문에, MDX에서는 JavaScript 표현식을 시작하는 `{`와 `}`, 요소를 시작하는 `<`를 쓸 수 없습니다.

**표 셀 목록은 원문이 있어야 동작합니다.** 셀의 마커는 위치 정보와 원문으로 읽는데 mdast는 이것을 보존하지 않습니다. 원문이 없으면 AST의 형태만으로 목록을 추측하지 않고 셀을 그대로 둡니다.

## 라이선스

[MIT](./LICENSE)
