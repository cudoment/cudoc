# Markdown 문법

[English](./syntax.md) | **한국어** · [전체 가이드](./README.ko.md)

## 기능별 문법 선택

호스트 어댑터에 다음 옵션을 전달합니다. 범용 컴파일러나 remark 플러그인에서는 `host`를 지정하고, Docusaurus·Nextra·VitePress·HTML 어댑터에서는 해당 호스트가 자동으로 선택됩니다.

```js
const options = {
  host: "docusaurus",
  syntax: {
    headingAnchor: "both",
    badge: "cudoc",
    tableCellList: "cudoc",
    callout: "both",
    link: "host",
  },
}
```

| 모드    | cudoc이 정규화하는 문법              |
| ------- | ------------------------------------ |
| `cudoc` | 해당 기능의 cudoc 대표 문법          |
| `host`  | 선택한 호스트에서 지원하는 고유 문법 |
| `both`  | 두 문법을 같은 문서 의미로 정규화    |

이 설정은 정규화 정책입니다. 호스트 파서 자체를 비활성화하지 않으므로 `cudoc`에서도 호스트 고유 문법이 렌더링될 수 있습니다. 표준 Markdown 링크는 항상 사용할 수 있습니다. 호스트에 특정 기능의 고유 문법이 없다면 `host`가 새 문법을 추가하지는 않습니다.

기본값은 `headingAnchor`, `badge`, `tableCellList`, `callout`이 `cudoc`, `link`가 `host`입니다. `off` 값은 없습니다. 기본값을 명시적으로 선택하려면 `syntax: {}`를 사용합니다. 전체 옵션 정의는 [API 레퍼런스](./api-reference/document.ko.md)를 참고하세요.

## 앵커와 배지

```md
## 요청 제한 (#rate-limits) (@New)

이 API는 (@Beta) 상태입니다.

[요청 제한 확인](#rate-limits)
```

`(#rate-limits)`는 제목 ID를 지정합니다. `(@New)`는 제목 텍스트나 자동 ID에 포함되지 않는 배지를 표시합니다. 한 문서의 앵커는 고유해야 하며 서로 다른 명시적 ID가 충돌하면 오류가 발생합니다. 앵커를 생략하면 호스트의 기본 ID 규칙을 따르고, 독립 컴파일에서는 제목에서 ID를 생성합니다.

링크와 코드 안의 배지 표기는 텍스트로 유지됩니다. 문법 자체를 보여주려면 인라인 코드나 코드 블록을 사용합니다.

지원하는 호스트 제목 표기는 다음과 같습니다.

| 호스트              | 명시적 ID             |
| ------------------- | --------------------- |
| Docusaurus Markdown | `## 제목 {#id}`       |
| Docusaurus MDX      | `## 제목 {/* #id */}` |
| Nextra              | `## 제목 [#id]`       |
| VitePress           | `## 제목 {#id}`       |

`headingAnchor: "both"`를 선택하면 `(#id)`와 함께 사용할 수 있습니다. cudoc의 `(#id)`는 Markdown과 MDX 모두에서 표현식 이스케이프 없이 사용할 수 있습니다.

## 알림

```md
> [!WARNING] 요청 제한 확인
> 제한을 초과하면 요청이 거부될 수 있습니다.
>
> - 잠시 기다린 후 재시도하세요.
> - 응답 상태를 확인하세요.
```

인용문 첫 줄의 시작에 `[!TYPE]`을 쓰고, 필요한 경우 뒤에 제목을 적습니다. 제목은 굵게 표시되므로 마커를 `**`로 감쌀 필요가 없습니다. 본문에는 문단, 목록, 인라인 Markdown을 사용할 수 있습니다. 마커 없는 인용문은 일반 인용문으로 유지됩니다.

`> **[TYPE] 제목**`보다 이 표기를 권장합니다. 일반 인용문의 강조 텍스트와 구분되며, [GitHub 알림 마커](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts)를 사용하고 [VitePress](https://vitepress.dev/guide/markdown#github-flavored-alerts)에서도 같은 마커를 인식합니다. 같은 줄의 선택적 제목과 사용자 타입 등록은 cudoc이 제공하는 기능이며 모든 Markdown 뷰어에서 동일하게 렌더링된다는 뜻은 아닙니다. `> **[WARNING] 제목**`은 별도 알림 문법이 아니라 일반 인용문으로 유지됩니다.

기본 타입은 `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`이며 대소문자를 구분하지 않습니다. `WARING` 대신 `WARNING`을 사용하세요. `calloutTypes: ["success"]`로 타입을 추가하면 `[!SUCCESS]`를 사용할 수 있습니다. 등록하지 않은 타입은 원래 표기를 유지하고 진단 메시지를 남깁니다.

`callout: "host"` 또는 `"both"`에서는 다음 고유 문법도 인식합니다.

| 호스트          | 표기                                                              |
| --------------- | ----------------------------------------------------------------- |
| Docusaurus      | `:::warning[제목]` 다음에 본문을 쓰고 `:::`로 닫기                |
| VitePress       | `::: warning 제목` 다음에 본문을 쓰고 `:::`로 닫기; GitHub식 알림 |
| Nextra MDX      | `<Callout type="warning">본문</Callout>`                          |
| Docs MDX 프로필 | `<Infobox type="warning" title="제목">본문</Infobox>`             |

호스트 타입 `info`/`default`, `danger`/`error`, `warn`은 각각 `note`, `caution`, `warning`으로 정규화합니다. VitePress의 `details`는 펼칠 수 있는 콘텐츠로 유지됩니다. 파서 설정은 [Docusaurus](./docusaurus.ko.md), [Nextra](./nextra.ko.md), [VitePress](./vitepress.ko.md) 가이드를 참고하세요.

### Docs에서 Infobox 대체

`Infobox`를 import하는 대신 위 인용문 예제를 사용합니다. 전환 중에는 실제 Docs 렌더링·수집 파이프라인에 `host: "docs"`, `syntax: { callout: "both", headingAnchor: "both", link: "both" }`를 같은 설정으로 적용하면 정적 `Infobox`·`Link`·`IconLink`와 Markdown을 함께 인식합니다. 이 프로필은 정규화 프리셋이지 Docs에 이미 설치된 연동이 아닙니다. Docs 프로젝트의 컴파일러 연결과 스타일 반영은 별도로 필요합니다. 기존 타입·제목, 동적 속성, 사용자 컴포넌트 매핑을 대표 Docs 페이지에서 확인한 뒤 해당 import를 제거하세요.

## 표 셀 내부 목록

```md
| 항목      | 설명                                 |
| --------- | ------------------------------------ |
| 접근 조건 | - 계정<br>-- 인증된 이메일<br>- 토큰 |
| 절차      | 1. 설정 열기<br>2. 키 생성           |
```

`.md`에서는 `<br>` 또는 `<br />`로 줄을 나눕니다. `.mdx`에서는 MDX 파서 규칙에 맞게 닫힌 태그 `<br />`를 사용합니다. `-`, `*`는 목록을 시작하고 `--`, `**`는 하위 항목을 만듭니다. 순서 있는 목록은 `1.`, `1..`, `1...`로 중첩하며 들여쓰기도 지원합니다. 해석할 수 없는 목록 조각은 원문을 유지합니다. 일반 문서의 목록을 표로 바꾸는 문법이 아니라 **기존 표 셀 안에 목록을 만드는 문법**입니다.

목록이 긴 열에는 배치 규칙을 지정할 수 있습니다.

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

일치하는 섹션에서 조건을 만족하는 목록 셀을 여러 열로 나누고 span을 맞춥니다. 표준 HTML 표 매핑을 사용하므로 표 컴포넌트를 등록할 필요가 없습니다. 배치 규칙은 다섯 문법 모드와 별도로 설정합니다.

## 링크와 사용자 컴포넌트

호스트 간 공유할 콘텐츠는 Markdown 링크와 이미지를 사용합니다. `link`에 호스트 문법을 허용하면 정적 링크 컴포넌트도 정규화할 수 있습니다. `docs` 프로필은 `Link`, `IconLink`를 인식하며, 다른 이름은 사이트 설정에서 매핑합니다.

`.md`는 Markdown으로 파싱하므로 `{value}`가 일반 텍스트로 유지됩니다. `.mdx`에서는 MDX 호스트의 사용자 컴포넌트를 사용할 수 있습니다. 정적 속성의 매핑된 컴포넌트는 공통 의미로 변환할 수 있지만 cudoc이 동적 속성이나 표현식을 실행하지는 않습니다. 원래 호스트에서 표시되는 컴포넌트도 공통 HTML로 임베드할 때 별도 렌더러가 필요할 수 있습니다. [컴포넌트 매핑과 렌더링](./api-reference/document.ko.md#컴포넌트와-렌더링)을 참고하세요.
