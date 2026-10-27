# Markdown 문법

[English](./syntax.md) | **한국어** · [전체 가이드](./README.ko.md)

이 페이지는 cudoc이 Markdown에 더하는 기능을 설명합니다. 사이트는 기능마다 그 기능을 끄거나, cudoc 문법·호스트 고유 문법·둘 다 가운데 하나를 고릅니다.

## 기능별 문법 선택

`syntax`의 각 기능은 네 모드 중 하나를 받고, 이 옵션은 호스트 어댑터에 전달합니다. 범용 컴파일러나 remark 플러그인에서는 `host`를 지정하고, Docusaurus, Nextra, VitePress, Eleventy, HTML 어댑터는 자기 호스트를 스스로 고릅니다.

```js
const options = {
  host: "docusaurus",
  syntax: {
    headingAnchor: "both",
    badge: "cudoc",
    tableCellList: "cudoc",
    callout: "both",
    link: "host",
    tableCellSpan: "cudoc",
    tableNote: "host",
    codeMeta: "cudoc",
    tabs: "cudoc",
  },
}
```

| 모드    | cudoc이 정규화하는 문법              |
| ------- | ------------------------------------ |
| `cudoc` | 해당 기능의 cudoc 대표 문법          |
| `host`  | 선택한 호스트에서 지원하는 고유 문법 |
| `both`  | 두 문법을 같은 문서 의미로 정규화    |
| `off`   | 정규화하지 않고 쓴 글자 그대로 둠    |

모드는 정규화 정책이지 호스트 파서를 끄는 스위치가 아닙니다. `cudoc`이나 `off`에서도 호스트가 고유 문법을 렌더링할 수 있고, 표준 Markdown 링크는 항상 동작하며, 호스트에 그 기능의 고유 문법이 없으면 `host`가 새 문법을 만들어 내지 않습니다. `off`는 cudoc에서 기능을 끕니다. 예를 들어 `tableCellList: "off"`이면 셀 안의 `- one<br>- two`는 쓴 글자 그대로 남습니다.

기본값은 `headingAnchor`, `badge`, `tableCellList`, `callout`, `tableCellSpan`, `codeMeta`, `tabs`가 `cudoc`, `link`와 `tableNote`가 `host`입니다. `syntax: {}`는 모든 기본값을 명시적으로 선택합니다. → [문서 API](./api-reference/document.ko.md)

## 앵커와 배지

제목 뒤의 `(#id)`는 그 제목의 앵커를 정하고, `(@배지)`는 제목 옆이나 본문에 글자에 포함되지 않는 배지를 표시합니다.

```md
## 요청 제한 (#rate-limits) (@New)

이 API는 (@Beta) 상태입니다.

[요청 제한 확인](#rate-limits)
```

`(#rate-limits)`는 제목 ID를 지정하고, `(@New)`는 제목 텍스트에 포함되지 않는 배지를 표시합니다. 링크와 코드 안의 배지 표기는 글자로 남으므로, 문법 자체를 보여 주려면 인라인 코드나 코드 블록에 씁니다.

한 문서의 앵커는 고유해야 합니다. 반복된 ID는 수집할 때 진단으로, [`cudoc check`](./check.ko.md)에서는 `duplicate-anchor`로 보고하며, 한 제목에 서로 다른 명시 ID가 둘 있으면 오류입니다.

명시 앵커가 없으면 호스트가 평소대로 ID를 생성하고, 단독 컴파일에서는 배지를 제외한 제목으로 생성합니다. cudoc이 읽기 전에 제목을 슬러그로 만드는 호스트는 배지 표기를 그 자동 ID에 포함시킬 수 있습니다. 따라서 배지가 붙은 제목의 앵커가 호스트마다 같아야 한다면 `(#id)`를 명시해야 합니다.

cudoc이 지원하는 호스트 제목 표기는 다음과 같습니다.

| 호스트              | 명시적 ID                                  |
| ------------------- | ------------------------------------------ |
| Docusaurus Markdown | `## 제목 {#id}`                            |
| Docusaurus MDX      | `## 제목 {/* #id */}`                      |
| Nextra              | `## 제목 [#id]`                            |
| VitePress           | `## 제목 {#id}`                            |
| Eleventy            | `markdown-it-attrs`를 통한 `## 제목 {#id}` |

`headingAnchor: "both"`는 이 표기를 `(#id)`와 함께 받아들이며, `(#id)`는 Markdown과 MDX 모두에서 표현식 이스케이프 없이 동작합니다.

cudoc이 정한 ID는 Nextra를 뺀 모든 호스트에서 쓴 그대로 페이지에 실립니다. `v1-2`처럼 영문 소문자, 숫자, 하이픈으로만 된 ID는 어느 호스트에서나 같습니다.

Docusaurus도 이 ID를 유지합니다. Docusaurus의 slugger가 바꿀 ID는 제목 글자 끝의 `{#id}`로 넘겨 문장 부호까지 그대로 유지하고, 그 밖의 ID는 slugger를 거쳐도 바뀌지 않습니다. 페이지의 `#` 제목만은 항상 slugger를 거치므로 slug 형태의 ID를 써야 합니다.

Nextra는 자체 `[#id]`를 포함한 모든 제목 ID를 슬러거에 통과시키므로 `(#v1.2)`가 `v12`가 되고, `#v1.2`로 가는 링크는 대상을 찾지 못합니다.

## 콜아웃

`[!TYPE]`으로 시작하는 인용문은 그 타입의 콜아웃이 되며, 같은 줄에 제목을 붙일 수 있습니다.

```md
> [!WARNING] 요청 제한 확인
> 제한을 초과하면 요청이 거부될 수 있습니다.
>
> - 잠시 기다린 후 재시도하세요.
> - 응답 상태를 확인하세요.
```

인용문 첫 줄의 시작에 `[!TYPE]`을 쓰고, 제목이 있으면 그 뒤에 적습니다. 제목은 굵게 표시되므로 마커를 `**`로 감쌀 필요가 없습니다. 본문에는 문단, 목록, 인라인 Markdown을 쓸 수 있고, 마커 없는 인용문은 일반 인용문으로 남습니다.

콜아웃 문법은 `> **[TYPE] 제목**`이 아니라 이 마커입니다. 일반 인용문의 강조 텍스트와 구분되고, [GitHub의 alert 마커](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts)와 같아서 [VitePress](https://vitepress.dev/guide/markdown#github-flavored-alerts)도 이 마커를 인식합니다. `> **[WARNING] 제목**`은 별도 콜아웃 문법이 아니라 일반 인용문으로 남습니다. 같은 줄의 선택적 제목과 사용자 타입 등록은 cudoc이 제공하는 기능이며, 모든 Markdown 뷰어에서 똑같이 렌더링된다는 약속은 아닙니다.

기본 타입은 `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`이며 대소문자를 구분하지 않고, 철자는 `WARING`이 아니라 `WARNING`입니다. `calloutTypes: ["success"]`로 타입을 추가하면 `[!SUCCESS]`를 쓸 수 있습니다. 등록하지 않은 타입은 쓴 그대로 남고 진단을 남깁니다. 다만 `[!TAB]`은 탭의 표지이므로, `tabs`가 cudoc 문법을 받지 않는 동안에는 진단 없이 인용 블록으로 남습니다.

`callout: "host"` 또는 `"both"`에서는 다음 고유 문법도 인식합니다.

| 호스트        | 표기                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| Docusaurus    | `:::warning[제목]` 다음에 본문을 쓰고 `:::`로 닫기                                |
| VitePress     | `::: warning 제목` 다음에 본문을 쓰고 `:::`로 닫기; GitHub식 alert                |
| Eleventy      | `markdown-it-container`를 통한 `::: warning 제목` 다음에 본문을 쓰고 `:::`로 닫기 |
| Nextra MDX    | `<Callout type="warning">본문</Callout>`                                          |
| `docs` 프로필 | `<Infobox type="warning" title="제목">본문</Infobox>`                             |

호스트 타입 `info`/`default`, `danger`/`error`, `warn`은 각각 `note`, `caution`, `warning`으로 정규화하고, `details` 컨테이너는 두 markdown-it 호스트 모두에서 펼칠 수 있는 콘텐츠로 남습니다. Eleventy에는 기본 제공되는 네이티브 표기가 없으므로, `host` 모드는 사이트가 직접 등록한 markdown-it 플러그인이 만든 토큰만 정규화합니다. 파서 설정은 [Docusaurus](./docusaurus.ko.md), [Nextra](./nextra.ko.md), [VitePress](./vitepress.ko.md), [Eleventy](./eleventy.ko.md) 가이드에 있습니다.

### `Infobox` 컴포넌트 대체

위 인용문은 import한 `Infobox` 컴포넌트를 대신합니다. 문서에 아직 컴포넌트가 남아 있는 동안에는 사이트의 렌더링·수집 파이프라인 양쪽에 `host: "docs"`와 `syntax: { callout: "both", headingAnchor: "both", link: "both" }`를 같은 설정으로 적용하며, 그러면 정적 `Infobox`·`Link`·`IconLink`와 Markdown을 함께 인식합니다. 이 프로필은 정규화 프리셋이지 연동이 아니므로, 사이트 자체의 컴파일러 연결과 스타일시트는 별도로 필요합니다. 기존 타입·제목, 동적 속성, 사용자 컴포넌트 매핑을 대표 페이지에서 확인한 뒤 해당 import를 제거합니다.

## 표 셀 내부 목록

표 셀의 줄을 `<br>`로 나누고 목록 표지로 시작하는 줄을 쓰면, 그 셀 안에 중첩 목록이나 순서 있는 목록이 생깁니다.

```md
| 항목      | 설명                                 |
| --------- | ------------------------------------ |
| 접근 조건 | - 계정<br>-- 인증된 이메일<br>- 토큰 |
| 절차      | 1. 설정 열기<br>2. 키 생성           |
```

`.md`에서는 `<br>` 또는 `<br />`로 줄을 나누고, `.mdx`에서는 MDX 파서가 요구하는 닫힌 태그 `<br />`를 씁니다. `-`, `*`는 목록을 시작하고 `--`, `**`는 하위 항목을 만듭니다. 순서 있는 목록은 `1.`, `1..`, `1...`로 중첩하며 들여쓰기도 지원합니다. 해석할 수 없는 목록 조각은 원문을 유지합니다. 일반 문서의 목록을 표로 바꾸는 문법이 아니라 **기존 표 셀 안에 목록을 만드는 문법**입니다.

목록이 긴 열에는 배치 규칙을 지정합니다.

```js
const options = {
  syntax: {},
  tableColumnLayout: [
    {
      section: { depth: 2, titles: ["요구 사항"] },
      columnHeaders: ["사전 조건"],
      split: { minItems: 4, columns: 2 },
    },
  ],
}
```

일치하는 섹션에서 조건을 만족하는 목록 셀을 여러 열로 나누고 span을 맞춥니다. 표준 HTML 표 매핑을 쓰므로 표 컴포넌트를 등록할 필요가 없고, 배치 규칙은 `syntax` 문법 모드와 별도로 설정합니다.

일정 폭보다 좁아지면 안 되는 열에는 셀마다 `<div style>`을 쓰는 대신 폭 규칙을 지정합니다.

```js
const options = {
  syntax: {},
  tableColumnWidths: [
    { widths: { 설명: "20rem" } },
    {
      section: { depth: 5, titles: ["기본 정보"] },
      widths: { Method: "6ch", URL: "120px" },
    },
  ],
}
```

헤더 글자가 열을 고르고 CSS 길이가 그 헤더 셀의 `min-width`가 되며, `section`이 없는 규칙은 모든 표에 적용됩니다. 폭 규칙과 배치 규칙은 같은 열에 함께 쓸 수 있습니다. → [문서 옵션](./api-reference/document.ko.md#문서-옵션)

## 표 셀 병합

`^^`나 `>>`만 든 셀은 위 셀이나 왼쪽 셀과 합쳐지므로, 값 하나가 여러 행이나 열에 걸칩니다.

```md
| Code | Status | Message           |
| ---- | :----: | ----------------- |
| E400 |  400   | Missing parameter |
| ^^   |   ^^   | Invalid value     |
| Note |   >>   | >>                |
```

`^^`만 든 셀은 위 셀과, `>>`만 든 셀은 왼쪽 셀과 합쳐집니다. 위 예에서 `E400`과 `400`은 두 행을, `Note`는 마지막 행 전체를 차지합니다. 가로와 세로로 모두 걸치는 블록은 첫 행에 `>>`를 이어 쓰고 그 아래 행의 각 칸에 `^^`를 쓰며, 직사각형이 아닌 병합 블록은 `UNEVEN_CELL_SPAN`으로 보고합니다.

머리 행은 가로로 합칠 수 있지만 다른 셀이 머리 행으로 합쳐질 수는 없으므로, 첫 본문 행의 `^^`와 첫 열의 `>>`는 글자로 남습니다. 두 표지를 글자로 보이려면 이스케이프하거나(`\^\^`) 코드로 쓰고, 표지를 끄려면 `tableCellSpan: "host"`로 설정합니다.

셀을 합친 표는 열 정렬을 각 셀로 옮기며, Word와 페이지 출력도 같은 셀을 합칩니다.

## 표 주석

`tableNote: "cudoc"`로 설정하면 표 바로 뒤에서 표지로 시작하는 문단이 그 표의 주석이 되어, 같은 표지가 붙은 셀을 설명합니다.

```md
| Field | Required |
| ----- | -------- |
| title | X\*      |
| image | O\*\*    |

\* One of `title` and `image` is required.

\*\* Up to 5 MB.
```

표지는 `*`, `†`, `‡`를 이어 쓴 것이나 `¹⁾` 같은 위첨자 숫자입니다. 주석은 표 아래에 작은 글씨로 놓이고, 인쇄할 때 표와 같은 쪽에 붙으며, Word에서는 `CudocTableNote` 스타일로 쓰입니다. `*`는 `\*`로 이스케이프해야 하며, 그렇지 않으면 그 줄은 목록이 됩니다.

기본값은 `host`이므로 사이트가 켜기 전까지 표 뒤의 일반 문단은 그대로 문단입니다. `docs` 프로필은 `tableNote`가 `"host"`나 `"both"`일 때 `<Footnote>` 컴포넌트를 같은 주석으로 읽고, 표 뒤에 이어진 것을 그 표의 주석 하나로 묶습니다. 페이지에서는 각 줄을 다시 `Footnote`로 그립니다. `1)`로 번호를 매긴 `Footnote`는 `¹⁾`로 표시한 셀을 설명합니다.

그러면 [`cudoc check`](./check.ko.md)가 표지의 짝을 맞춥니다. `X*`로 표시한 셀은 표 아래에 `*`로 시작하는 주석이 있어야 하고, 셀에 표지가 있는 표에서는 모든 주석을 어느 셀이든 가리켜야 합니다. 어느 쪽이 어긋나도 `unmatched-table-note`로 보고합니다.

## 코드 블록 제목과 강조 줄

펜스의 메타에 `title="…"`로 코드 블록의 이름을, `{…}`로 강조할 줄을 적으면, 예제가 어느 파일에 들어가고 어느 줄이 중요한지 보여 줍니다.

````md
```js title="retry.js" {2,4-5}
const attempts = 3
const delay = 250
export function backoff(attempt) {
  return delay * 2 ** attempt
}
```
````

`title="…"`은 코드 블록에 이름을 붙이며, 보통 그 코드가 들어갈 파일 이름을 씁니다. `{…}`는 강조할 줄을 번호와 범위로 나열합니다. 둘 다 펜스의 메타에서 언어 뒤에 쓰며, 순서는 상관없고 메타에 있는 다른 내용과 함께 써도 됩니다.

호스트마다 그리는 방식이 다릅니다. Docusaurus에는 `title=`을, Nextra와 `docs` 프로필에는 `filename=`을 넘기므로 제목이 호스트의 코드 블록에 직접 표시됩니다. 그 밖의 호스트에서는 `@cudoment/cudoc/styles.css`가 스타일을 입히는 제목 줄 아래에 블록을 넣어 감싸며, Nextra의 `.md` 페이지도 Nextra가 이 페이지에서는 코드 블록의 메타를 버리므로 같은 방식으로 감쌉니다. 강조 줄은 호스트의 구문 강조기에 넘기므로, 호스트가 줄 강조를 지원하면(Docusaurus, Nextra `.mdx`, VitePress) 페이지에 강조가 표시되고, HTML, PDF, Word 내보내기에서는 항상 강조합니다. 공백 없이 쓰는 VitePress의 `js{4}` 형식도 인식합니다.

`codeMeta`를 `"host"`나 `"both"`로 설정하면 호스트 고유의 제목 형식도 같은 제목으로 읽습니다. Nextra와 `docs` 프로필의 `filename="…"`, VitePress의 `[name]`이 여기에 해당합니다. 다만 `::: code-group` 안에서는 `[name]`이 탭의 레이블입니다. Docusaurus는 고유 형식이 원래 `title=`입니다. `docs` 프로필은 `filename=My File.swift,showLineNumbers`처럼 항목 사이를 쉼표로 잇고 값을 다음 쉼표까지 쓴 메타도 읽으며, 페이지에 넘기는 메타도 모두 이 방식으로 씁니다.

## 탭

`tab="…"` 레이블을 붙인 펜스와 `> [!TAB] 레이블`로 시작하는 인용 블록을 이어서 쓰면 하나의 탭 그룹이 되므로, 같은 호출을 두 언어로 보여 주는 식의 대안이 한 블록의 자리만 차지합니다.

````md
```kotlin tab="Kotlin" group=sdk
val profile = TalkApi.profile()
```

```java tab="Java"
Profile profile = TalkApi.profile();
```

> [!TAB] Notes
>
> Both calls need the `profile` scope.
````

펜스 탭은 그 코드 블록을 담고, 인용 블록 탭은 문단과 목록을 포함해 인용 블록에 쓸 수 있는 모든 내용을 담습니다. 첫 펜스의 `group=key`나 `> [!TAB key] 레이블`은 그룹의 키입니다. 그룹끼리 선택을 맞추는 사이트는 같은 키를 가진 그룹을 함께 전환할 수 있습니다. 다른 키를 쓴 탭은 그 자리에서 새 그룹을 시작합니다. 레이블이 없는 `[!TAB]`은 `UNLABELED_TAB`으로 보고하고 인용 블록으로 남깁니다.

`tabs`를 `"host"`나 `"both"`로 설정하면 호스트 고유 컴포넌트도 같은 그룹이 됩니다. Docusaurus의 `<Tabs groupId>`와 `<TabItem value label default>`, Nextra의 `<Tabs items={[…]} defaultIndex>`와 `<Tabs.Tab>`, `docs` 프로필의 `<Tabs>`와 `<TabsContent id label default>`, 그리고 펜스의 `[name]`을 레이블로 쓰는 VitePress의 `::: code-group`이 여기에 해당합니다. 레이블과 값은 직접 써야 합니다. 변수에서 읽는 그룹은 원래 컴포넌트로 남기고 `DYNAMIC_COMPONENT`로 보고합니다.

페이지에서는 스크립트 없이 탭으로 보입니다. 탭마다 라디오 버튼과 레이블을 두고 `@cudoment/cudoc/styles.css`가 스타일을 입히며, 독자가 다른 탭을 고르기 전까지 첫 탭이나 기본으로 표시한 탭을 보여 줍니다. CSS `:has()`를 지원하지 않는 브라우저는 모든 탭을 차례로 보여 주고, 인쇄, PDF, Word는 모든 탭을 레이블과 함께 차례로 씁니다.

`docs` 호스트에서는 그 대신 사이트의 `Tabs`와 `TabsContent` 컴포넌트로 그리며, 이 컴포넌트는 `id`, `label`, `default`, `group`을 받습니다. 전역으로 `Tabs`와 `TabItem`을 등록한 Docusaurus 사이트처럼 다른 컴포넌트를 쓰려면 remark 어댑터의 `tabElements` 옵션으로 컴포넌트와 prop 이름을 지정하며, 이 예라면 `{ tabs: { name: "Tabs", group: "groupId" }, tab: { name: "TabItem", value: "value" } }`입니다. Nextra는 `.md` 페이지에서 컴포넌트 이름을 소문자로 바꾸므로, 그곳에서는 항상 라디오 탭으로 그립니다.

## 변수

`(=이름)`은 어디에 쓰든 `variables`에 한 번 정의한 값으로 치환되므로, 버전이나 주소를 한 곳에서 바꿉니다.

```md
Load SDK (=sdk.version) with `npm install sdk@(=sdk.version)`.

<script src="https://(=sdk.cdn)/(=sdk.version)/sdk.js"></script>
```

값은 사이트와 수집이 함께 쓰는 옵션에 한 번만 정의합니다.

```js
const options = {
  variables: { "sdk.version": "2.8.3", "sdk.cdn": "cdn.example.com" },
}
```

변수를 가리키는 `(=이름)`은 텍스트, 인라인 코드와 코드 블록, raw HTML, 링크와 이미지의 주소·제목·대체 텍스트, 정적 컴포넌트 속성에서 모두 치환됩니다. 따라서 설치 명령, 스크립트 태그, 문장에 적은 버전이 값 하나가 됩니다. 이름은 영문자나 `_`로 시작하고 영문자, 숫자, `_`, `.`, `-`를 담을 수 있습니다. 표지를 `${…}`, `{…}`, `{{…}}`로 정하지 않은 이유는 코드 예제, MDX, VitePress가 이미 그 표기에 다른 뜻을 주기 때문입니다. `(@…)` 배지는 첫 `)`에서 끝나므로 그 안에 표지를 담을 수 없습니다.

어떤 변수도 가리키지 않는 표지는 쓴 그대로 페이지에 남습니다. 수집은 이를 `UNDEFINED_VARIABLE`로, [`cudoc check`](./check.ko.md)는 가장 가까운 정의 이름과 함께 `undefined-variable`로 보고합니다. `variables`가 없으면 아무것도 치환하지 않으므로 변수를 쓰지 않는 사이트는 표지를 글자로 쓸 수 있지만, 있으면 표지를 이스케이프할 방법이 없어 코드 스팬 안의 표지도 치환합니다. 임베드 블록, 페이지 나누기 펜스, MDX 표현식·`import`·`export`는 코드이므로 글자를 그대로 둡니다. VitePress와 Eleventy는 cudoc이 표지를 치환하기 전에 제목 id를 정하므로, 변수가 든 제목에는 명시 `(#id)`를 붙여야 합니다.

## 공유 링크 참조

여러 문서가 공유하는 링크는 `linkReferences`에 한 번 정의하고, 각 문서에서는 Markdown 참조 링크로 적습니다.

```md
Requests need a [business token][business-token]. Open the [app console][] first.
```

```js
const options = {
  linkReferences: {
    "business-token": "../auth/common.md#business-token",
    "app console": { url: "https://console.example.com/app", title: "Console" },
  },
}
```

같은 페이지, 같은 앵커로 사이트 곳곳에서 수백 번 거는 링크는 `linkReferences`에 한 번 정의합니다. 이 링크는 모든 문서에서 Markdown 참조 링크인 `[글자][label]`, `[label][]`, `[label]`로 씁니다. `![alt][label]`도 같은 방식으로 이미지를 보여 주며, `[![Logo][logo]](./index.md)`처럼 링크 글자 안에서도 쓸 수 있습니다. 레이블은 CommonMark와 같은 방식으로 대소문자와 반복 공백을 무시하고 맞춥니다.

상대 주소는 그 링크를 쓰는 문서를 기준으로 읽으므로, 그 문서가 링크를 직접 쓴 것과 똑같습니다. 그래서 `../auth/common.md#business-token`은 루트 아래 한 단계 폴더에 있는 모든 문서에서, 언어 폴더마다 똑같이 동작합니다. 문서가 직접 쓴 정의는 공유 정의보다 우선하고, 공유 주소 안의 변수도 치환됩니다.

이렇게 만든 링크는 일반 링크와 같습니다. 각 호스트가 다른 링크와 같은 방식으로 주소를 다시 쓰고, [`cudoc check`](./check.ko.md)가 검사하며 문제는 그 링크가 나온 `[label]` 위치에 보고합니다. 아무도 정의하지 않은 레이블을 쓴 전체·축약 참조는 글자로 남고, 검사는 가장 가까운 레이블과 함께 `undefined-link-reference`로 보고합니다. 문서가 글자로 쓰는 대괄호 단어, 예를 들어 `[설정] > [앱]`처럼 쓴 메뉴 경로와 같은 레이블은 피해야 합니다. 단축 참조 `[label]`이 그 글자를 링크로 바꾸기 때문입니다.

## 페이지 나누기

정보 문자열이 `cudoc-pagebreak`인 코드 펜스는 페이지를 나누는 출력에서 쪽을 넘기고, 문서 사이트에서는 아무것도 보이지 않습니다.

````markdown
여기서 쪽을 마칩니다.

```cudoc-pagebreak

```

여기서부터 새 쪽입니다.
````

이 펜스는 파서를 확장하지 않고도 모든 호스트의 컴파일러를 똑같이 통과하는 유일한 블록 형태입니다. HTML 주석은 MDX에서 컴파일되지 않고, 링크 정의를 이용하는 방법은 markdown-it이 조용히 버리므로, 저자가 지정한 나누기가 절반의 호스트에서 아무 진단 없이 사라집니다.

**이 문법은 `syntax` 기능이 아닙니다.** 그 축(`host`, `cudoc`, `both`, `off`)은 같은 의미를 cudoc 철자와 호스트 고유 철자 중 무엇으로 쓸지 고르는 것인데, 페이지 나누기 철자를 가진 호스트가 없습니다. 그래서 `pageBreak: "host"`는 "아무것도 인식하지 않음"을 뜻하게 되고 본문에 빈 코드 블록이 그대로 보이게 됩니다. 이 표시를 존중할지는 문법이 아니라 출력이 정하는 일로, 쪽을 나누는 내보내기는 `page.authoredBreaks`를 `false`로 두지 않는 한 존중하고 사이트는 아무것도 보여 주지 않습니다. 코드 펜스로 쓰는 임베드도 같은 이유로 `SyntaxOptions` 밖에 있습니다.

페이지를 나누는 출력은 스스로도 쪽을 넘깁니다. 한 권으로 묶은 파일에서는 문서 앞에서 넘기고, 제목이 쪽 끝에 혼자 남지 않도록 제목 바로 뒤에서는 넘기지 않으며, 표의 행 중간에서는 절대 넘기지 않습니다. 저자가 직접 지정하는 나누기는 이런 규칙이 알 수 없는 자리에 씁니다.

## 링크와 사용자 컴포넌트

호스트 간에 공유하는 콘텐츠는 Markdown 링크와 이미지를 씁니다. `link`에 호스트 문법을 허용하면 정적 링크 컴포넌트도 정규화할 수 있습니다. `docs` 프로필은 `Link`, `IconLink`를 인식하고, 다른 이름은 사이트 설정에서 명시적으로 매핑합니다.

`.md`는 Markdown으로 파싱하므로 `{value}`가 글자 그대로 남고, `.mdx`에서는 MDX 호스트의 사용자 컴포넌트를 쓸 수 있습니다. 정적 속성의 매핑된 컴포넌트는 공통 의미로 변환할 수 있지만, cudoc이 동적 속성이나 표현식을 실행하지는 않습니다. 원래 호스트에서 표시되는 컴포넌트도 공통 HTML로 임베드할 때 별도 렌더러가 필요할 수 있습니다. → [컴포넌트 매핑과 렌더링](./api-reference/document.ko.md#컴포넌트와-렌더링)
