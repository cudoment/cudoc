# 문서 API

[English](./document.md) | **한국어** · [API 레퍼런스](./README.ko.md)

이 페이지는 `@cudoment/cudoc`의 문서 옵션, 페이지 메타데이터, 컴파일, 의미 AST, 표현, 렌더링, 섹션·쿼리, 필터링, 코어 도우미를 설명합니다.

## 문서 옵션

소스: [document.ts](../../packages/cudoc/src/document.ts). 타입과 정규화 함수는 `@cudoment/cudoc/document`에서 가져옵니다.

```ts
type SyntaxMode = "host" | "cudoc" | "both" | "off"
type SyntaxOptions = Partial<
  Record<
    | "headingAnchor"
    | "badge"
    | "tableCellList"
    | "callout"
    | "link"
    | "tableCellSpan"
    | "tableNote"
    | "codeMeta"
    | "tabs",
    SyntaxMode
  >
>
type Host =
  | "markdown"
  | "next"
  | "docusaurus"
  | "nextra"
  | "vitepress"
  | "eleventy"
  | "html"
  | "docs"
```

| `DocumentOptions` 속성 | 기본값               | 계약                                              |
| ---------------------- | -------------------- | ------------------------------------------------- |
| `syntax`               | `DEFAULT_SYNTAX`     | 기능별 정규화; 알 수 없는 키·모드는 오류          |
| `host`                 | `markdown`           | 고유 문법 프로필; 호스트 컴파일러를 설치하지 않음 |
| `format`               | 독립 컴파일에서 `md` | `md` 또는 `mdx`; 수집은 파일 확장자로 결정        |
| `headingIds`           | `host`가 아니면 생성 | `host`는 자동 ID 생성을 위임; 명시적 ID는 적용    |
| `calloutTypes`         | `[]`                 | note/tip/important/warning/caution에 추가할 타입  |
| `components`           | 호스트 매핑만 적용   | 정적 컴포넌트 이름과 의미 종류의 매핑             |
| `tableColumnLayout`    | `[]`                 | 순서대로 적용할 열 배치 규칙                      |
| `tableColumnWidths`    | `[]`                 | 헤더 글자별 최소 열 폭; 배치 규칙보다 먼저 적용   |
| `ignoreDiagnostics`    | `[]`                 | 보고하지 않을 진단 코드; 노드 처리는 같음         |
| `variables`            | 없음: 치환하지 않음  | `(=이름)` 표지를 바꿀 값                          |
| `linkReferences`       | 없음                 | 모든 문서가 공유하는 레이블별 링크 참조 정의      |

`DEFAULT_SYNTAX`는 `{ headingAnchor: "cudoc", badge: "cudoc", tableCellList: "cudoc", callout: "cudoc", link: "host", tableCellSpan: "cudoc", tableNote: "host", codeMeta: "cudoc", tabs: "cudoc" }`입니다. `resolveSyntax(syntax?)`는 기본값을 채운 모든 모드를 반환합니다. 모드는 호스트 파서의 허용 여부가 아닌 정규화를 제어합니다. 일반 Markdown 링크는 모든 모드에서 유효합니다.

`normalizeDocument(tree, source, options?, inlineParser?) → DocumentDiagnostic[]`는 `tree`를 수정합니다. 다만 frontmatter는 예외입니다. `yaml`·`toml` 노드는 뒤에서 읽는 쪽을 위해 쓴 그대로 제자리에 둡니다. 표 셀 목록을 재구성할 때 원문을 읽으므로 위치 offset에 맞는 원본 소스를 전달해야 합니다.

`inlineParser(source) → PhrasingContent[]`로 표 셀의 인라인 문법에 호스트 파서를 사용할 수 있습니다. 아래 공유 참조와 마찬가지로 이 파서가 노드에 기록한 위치를 `source`와 맞춰 읽으므로, 위치가 없는 노드에서는 글자가 이스케이프한 대괄호도 대괄호로 읽습니다.

`isCudoc(mode)`, `isHost(mode)`는 각 문법 참여 여부를 확인하며, `off`에서는 둘 다 거짓이므로 cudoc은 그 기능의 어느 형식도 정규화하지 않습니다.

`idToken(id)`는 문서 ID를 HTML id와 URL 조각 어디에나 들어갈 수 있게 표기합니다. ASCII 글자, 숫자, `-`는 그대로 두고 나머지 문자는 `_`, 16진수 코드 포인트, `_`로 바꿉니다(`guide/개요` → `guide_2f__ac1c__c694_`). `%`가 없으므로 브라우저가 조각을 디코딩하든 하지 않든 조각이 요소와 맞고, 서로 다른 ID는 계속 서로 다릅니다. 임베드 각주 접두어와 `cudoc-export`의 묶음 문서 앵커가 이 함수를 씁니다.

정규화는 다음 순서로 실행합니다.

1. 컴포넌트 속성의 변수를 치환합니다.
2. 제목 표기, 콜아웃, 매핑된 컴포넌트, 셀 목록, 배지, 탭, 코드 제목, 표 주석을 처리합니다.
3. 공유 참조를 연결합니다.
4. 나머지 변수를 치환합니다.
5. 병합된 표 셀을 표시합니다.
6. 열 너비·배치 규칙을 적용합니다.
7. 병합으로 덮인 셀을 제거합니다.
8. 쪽 나누기 펜스를 바꿉니다.
9. 정적 HTML 요소를 변환합니다.
10. 독립 제목 ID를 생성합니다.

자동 제목 텍스트에서 배지와 permalink는 제외합니다. 기존 ID를 검사한 뒤 새 ID를 생성하며, 생성하는 ID는 이미 쓰인 ID를 모두 피합니다. 두 제목이 같은 ID를 가지면 오류를 던지지 않고 `DUPLICATE_HEADING_ID` 진단으로 보고하는데, 호스트는 이런 반복에 실패하지 않고 접미사를 붙이며 [`cudoc check`](./node.ko.md#참조-검사)가 모든 반복을 `duplicate-anchor`로 보고하기 때문입니다. 한 제목에 서로 다른 ID 표기가 둘 있으면 소스 위치를 포함한 `conflicting heading IDs` 오류를 던집니다.

`variables`는 이름을 문자열에 대응시킵니다. `resolveVariables(value)`가 이를 검증하며, 표지로 쓸 수 없는 이름, 곧 영문자나 `_`로 시작해 영문자·숫자·`_`·`.`·`-`로 이어지지 않는 이름이나 문자열이 아닌 값이 있으면 예외를 던지고, 옵션이 없으면 `undefined`를 반환합니다.

옵션이 있으면 `replaceVariables(text, variables, missing?)`가 표에 정의된 모든 `(=이름)`을 다음 위치에서 치환합니다.

- 각 노드의 `value`, `url`, `title`, `alt`, `meta`
- MDX JSX 속성의 문자열 값. 문자열로 쓴 값과 `{"…"}`처럼 JSON 문자열 표현식으로 쓴 값이 모두 해당하며, 표현식은 파싱한 결과도 함께 고칩니다
- `data.hProperties`의 문자열 값
- 코드 블록·콜아웃·탭의 제목인 `data.cudoc.title`

컴포넌트 속성은 가장 먼저 치환하므로, 콜아웃의 타입·클래스·기본 제목, 탭의 값, `Anchor`가 제목에 주는 id와 배지는 표지가 가리키는 값으로 만들어집니다. 나머지는 셀 목록을 원문에서 다시 만들고 공유 참조를 해석한 뒤에 치환하므로 공유 주소 안의 변수도 치환되며, 표 규칙과 제목 id가 글자를 읽기 전입니다. 표지마다 한 번만 치환하므로, 값 안에 쓴 표지는 그대로 남습니다.

`cudoc-embed`와 `cudoc-pagebreak` 코드 블록은 건너뛰며, 호스트가 실행하는 코드인 MDX 표현식, `import`, `export`도 건너뜁니다. 아무것도 가리키지 않는 표지는 쓴 그대로 두고 노드마다 한 번 `UNDEFINED_VARIABLE`로 보고합니다.

markdown-it 어댑터가 호스트의 링크 규칙보다 먼저 주소를 치환한 링크나 이미지에는 작성자가 쓴 주소가 `data.cudocWrittenAddress`에 들어 있습니다([markdown-it 호스트](./adapters.ko.md#markdown-it)). 이런 노드는 그 주소에서 표지를 보고하고, `url`과 `data.hProperties`의 `href`, `src`는 다시 치환하지 않습니다. 그다음 이 속성을 지우므로 저장 트리에는 남지 않습니다.

`linkReferences`는 레이블을 주소나 `{ url, title? }`에 대응시킵니다. `resolveLinkReferences(value)`가 이를 검증하고 `normalizeLabel(label)`로 색인하며, 다음에는 예외를 던집니다.

- 비어 있거나 대괄호가 들었거나 링크 레이블의 최대 길이인 999자를 넘는 레이블
- `Console`과 `console`처럼 서로 같은 레이블로 맞춰지는 두 레이블
- markdown-it이 문서에 직접 쓴 정의에서도 링크로 받지 않는 주소(모든 호스트에서 똑같이): `javascript:`, `vbscript:`, `file:`, 그리고 GIF·PNG·JPEG·WebP 이미지가 아닌 `data:`
- 그 밖의 값

`normalizeLabel(label)`은 micromark가 레이블을 맞추는 방식대로 공백, 탭, 줄 끝을 공백 하나로 줄이고 앞뒤에서 떼어 낸 뒤, 소문자로 바꾸고 다시 대문자로 바꿉니다. 그래서 `straße`와 `STRASSE`는 같은 레이블이지만, 사이에 U+00A0 줄바꿈 없는 공백을 쓴 `a b`와 `a b`는 다른 레이블입니다. markdown-it 호스트는 markdown-it 자체 규칙으로 레이블을 맞추며, 이 규칙은 그 밖의 공백 문자도 줄입니다.

정규화는 문서에 그 레이블의 정의가 없어서 파서가 글자로 남긴 `[글자][label]`, `[label][]`, `[label]`을 모두 `link`로 바꾸며, 정의의 `url`과 `title`, 그리고 쓴 그대로의 레이블을 담은 `data.cudoc` `{ kind: "reference", label }`을 둡니다. `![alt][label]`처럼 앞에 `!`가 있으면 링크 글자를 `alt`로 하는 `image`로 바꿉니다.

이미지의 글자에는 파서가 만든 링크나 공유 참조 링크가 들어갈 수 있으며, `alt`는 그 링크를 글자로 읽고 안에 든 이미지는 그 이미지의 `alt`로 읽습니다.

파서가 만든 이미지는 문서 자체 정의로 만든 이미지를 포함해 글자를 `alt`로만 갖고 있습니다. 그래서 이스케이프와 코드 스팬을 건너뛰며 대괄호 짝을 세어 원문에서 설명 부분을 찾고, 그 설명을 문단의 글자로 다시 파싱합니다. 이때 둘째 줄부터 들여 써서 문단이 이어지게 하고, 설명이 가리킬 수 있는 문서 자체 정의를 뒤에 붙입니다. 그래서 그 안의 공유 참조도 해석하되, 파서가 그 안에 만든 코드, 링크, 참조는 파서가 만든 그대로 둡니다. 링크 글자 안에 링크가 직접 들어 있을 때처럼, 이미지 글자 안에 링크가 있어도 그 이미지를 감싸는 링크는 만들어지지 않습니다.

다시 파싱한 결과가 파서의 `alt`와 같을 때에만 해석합니다. 따로 파싱하면 다르게 읽히는 설명은 파서가 준 `alt`를 그대로 두고, 그 안의 공유 참조도 해석하지 않습니다. 각주 참조, 표 셀 안 코드의 `\|`, 자동 링크·raw HTML·MDX 표현식이나 태그 안의 `]`가 그 예입니다. 다른 이미지의 글자 안에 네 겹 이상 든 이미지도 마찬가지인데, 겹마다 글자를 다시 파싱하기 때문입니다.

CommonMark는 보이는 글자가 아니라 쓴 레이블로 맞추므로, 레이블은 원문에 쓴 그대로 맞춥니다. 전체 형태에서는 두 번째 대괄호의 글자가 레이블이므로 `[text][a\*b]`의 레이블은 `a\*b`입니다. 축약 형태와 단축 형태에서는 링크 글자가 레이블이므로 `[**bold**][]`의 레이블은 `**bold**`이고, `[a\*b][]`의 레이블은 `a\*b`입니다. 레이블이 여러 줄에 걸치면, 파서와 마찬가지로 둘째 줄부터 글자 앞에 오는 들여쓰기와, 글자를 감싼 인용 블록 수만큼의 `>`를 빼고 읽습니다. 인용 블록의 lazy 줄이 네 칸 이상 들여 쓴 뒤 시작하는 `>`는 파서가 글자로 남기지만, 여기서는 알려진 제한으로 이것도 빼고 읽습니다.

micromark처럼 그 들여쓰기와 `>`, 그리고 줄 끝을 빼고 센 길이가 999자를 넘는 레이블은 아무것도 가리키지 않습니다.

코드, raw HTML, 정의 밖의 글자를 훑습니다. 먼저 원문에서 이어지는 이웃 텍스트 노드를 합치고, 아무것도 링크하지 않은 형제 노드는 원래대로 두며, 링크를 만든 경우에도 원래 따로 있던 텍스트 노드는 따로 둡니다.

링크 안에는 다른 링크가 들어갈 수 없으므로, 링크의 글자에서는 파서가 만든 링크이든 공유 레이블로 만든 링크이든 이미지만 해석합니다. CommonMark가 안쪽 대괄호를 먼저 해석하는 것과 같이, `[![Logo][logo]](https://example.com)`과 `[![Logo][logo]][home]`은 링크 안에 이미지를 둡니다.

링크 글자에는 모든 형태에서 다른 인라인 노드가 들어갈 수 있습니다. 다만 축약 형태와 단축 형태는 쓴 그대로만 맞추므로, `[*foo* bar]`는 레이블 `*foo* bar`와 맞습니다.

대괄호는 CommonMark처럼 중첩됩니다. 공유 참조의 대괄호 안에서 깊이와 관계없이 대괄호로 쓴 링크가 만들어지면 바깥 대괄호는 글자로 남습니다. 그래서 `[a [b]][a]`는 `b`와 `a`를 차례로 링크하며, 문서에 직접 정의를 쓴 같은 원문과 결과가 같습니다. 다만 `<https://…>` 같은 자동 링크는 CommonMark가 링크 글자 안에 허용하므로 바깥 대괄호를 막지 않습니다.

micromark가 읽는 방식대로, 링크 글자가 빈 참조는 `[][label]` 같은 전체 형태만 허용합니다. 링크 글자 바로 뒤의 `[`가 전체 형태도 축약 형태도 만들지 못하면 단축 형태 참조도 되지 않습니다. `[label][ ]`, 닫히지 않은 `[label][`, 파서가 링크로 만든 `[label][text](url)`가 그 예입니다.

파서가 만든 링크는 그대로 둡니다. 문서에 정의가 있었다면 참조가 되었을 대괄호를 파서가 인라인 링크로 읽었다면 파서의 링크가 남습니다. `[a][b](url)`의 `[b](url)`, `[[b]](url)`의 바깥 대괄호가 그 예입니다.

파서가 강조로 읽은 대괄호도 여기서는 대괄호로 보지 않습니다. 파서는 정의가 없을 때에만 대괄호를 강조 안으로 읽습니다. 링크 글자의 강조 안에 짝이 맞지 않는 대괄호가 있으면 참조를 만들지 않고, `[t][a *b] c*`처럼 레이블의 `]`가 강조 안에 있어도 참조를 만들지 않습니다. 문서에 직접 정의가 있었다면 둘 다 링크가 됩니다.

원문이 `\[`나 `&#91;` 같은 문자 참조로 이스케이프한 대괄호는 글자이므로 참조를 열거나 닫지 않고, 참조 앞에서 그렇게 이스케이프한 `!`는 이미지를 만들지 않습니다. 각 텍스트 노드를 원문 offset과 맞춰 읽어 이런 대괄호를 찾고, 이때 원문의 NUL은 파서가 바꾼 U+FFFD로 읽습니다. 찾은 대괄호는 문서에 없는 사적 사용 문자로 잠시 표시하므로, 작성자가 쓴 사적 사용 문자는 쓴 그대로 돌아갑니다.

U+E000–U+F8FF 가운데 문서에 없는 문자가 세 개보다 적으면 그 문서의 공유 참조는 해석하지 않습니다.

`(@배지)` 옆의 글자도 배지를 떼어 내기 전에 원문 offset과 맞춰 읽고, 그 글자와 배지 모두 원문 위치를 유지합니다. 정규화가 떼어 내는 제목의 ID 표시 주변 글자도 마찬가지이며, 이 글자는 참조를 해석한 뒤 다시 한 텍스트로 합칩니다. 그래서 배지나 ID 표시 옆, 또는 배지를 가로지르는 레이블도 쓴 그대로 읽습니다. 글자를 다시 읽을 때, 이미 이스케이프로 표시한 대괄호는 원문의 이스케이프와 맞춰 읽습니다.

표 셀 목록은 셀 원문을 조각별로 다시 파싱하고, 각 조각을 문서 본문과 같은 방식으로 읽습니다. 배지를 나누고, 조각의 글자와 맞춰 읽어 이스케이프한 대괄호를 표시하고, 그 글자를 원문으로 삼아 공유 참조를 해석합니다. 파싱이 기록하는 위치는 조각 글자 안의 위치이므로, 그 뒤에는 노드에 위치를 남기지 않습니다. 그래서 문서 원문과 맞춰 읽는 일이 없습니다.

조각은 문서 자체 정의 없이 파싱하므로, 문서가 정의한 레이블은 셀 목록 안에서 그 정의로도 공유 정의로도 해석하지 않고 글자로 남깁니다. 조각 안 이미지의 설명도 문서 자체 정의 없이 다시 파싱합니다.

탭 레이블과 콜아웃이 `data.cudoc.title`에 기록하는 제목은 문서 전체 해석보다 먼저 정해지므로, 제목 글자의 공유 참조를 먼저 해석한 뒤 읽습니다. 그래서 문서 자체 정의를 쓴 결과와 같습니다.

문자 참조는 micromark처럼 풉니다. 숫자 참조는 그 코드 포인트로 읽되, 제어 문자, 서로게이트, 비문자, 범위를 벗어난 값은 U+FFFD로 읽습니다. 이름 있는 참조는 그 글자로 읽으며, 대개 한 글자이고 `&fjlig;` 같은 몇몇 이름은 두 글자입니다.

markdown-it 호스트에서는 호스트가 인라인 파싱 전에 공유 참조를 직접 해석하므로 정규화는 아무것도 해석하지 않습니다.

`tableCellSpan`이 cudoc 문법을 받으면, 표 규칙보다 먼저 `^^`나 `>>`만 든 셀이 있는 GFM `table`의 셀을 합칩니다. `>>` 셀은 같은 행의 왼쪽 셀로, `^^` 셀은 둘째 본문 행부터 위 셀로 합치며, 이미 이루어진 병합을 따라갑니다. 셀에 offset이 있으면 표지를 원문에서 읽으므로 이스케이프한 `\^\^`는 글자입니다. 합칠 대상이 없는 표지, 즉 머리 행이나 첫 본문 행의 `^^`와 첫 열의 `>>`는 글자로 남습니다.

주인 셀은 `data.hProperties`에 숫자 `colSpan`과 `rowSpan`을 받습니다. 덮인 셀은 `data.cudocCovered` 표시를 받고 그대로 남으므로, 배치 규칙은 작성한 그대로의 격자에서 열을 찾습니다. 직사각형을 다 채우지 못한 병합 블록은 `UNEVEN_CELL_SPAN`으로 보고합니다.

배치 규칙이 다시 만든 표는 머리 행을 포함해 덮인 셀을 빼고, 주인 셀에 `rowSpan`과, 열 병합을 나타내는 규칙의 `spanAttribute`를 줍니다. 이때 나뉜 열은 배치된 폭만큼 셉니다. 주인 셀 자체가 나뉘면 조각마다 행 병합을 주고, 오른쪽에서 합쳐진 열은 마지막 조각이 차지합니다.

규칙을 적용한 뒤에는 GFM 표로 남은 모든 표에서 덮인 셀을 행에서 지우고, 남은 셀은 각자 열의 정렬을 `hProperties.align`으로 받으며, 표의 `align`은 `null`이 됩니다. 그래야 mdast-util-to-hast가 짧아진 행을 빈 셀로 채우지 않습니다. 트리에는 `cudocCovered`가 남지 않습니다.

표 주석은 `data.hName: "div"`, `hProperties.className: ["cudoc-table-note"]`, `data.cudoc.kind: "tableNote"`를 가진 `blockquote`이며 문단을 담습니다. `tableNote`가 호스트 문법을 받으면, `docs` 프로필이 `Footnote`를 대응시키듯 `tableNote`로 매핑한 정적 컴포넌트가 주석이 되며, 인라인 내용만 담고 있으면 문단으로 감쌉니다.

같은 부모 안에서 `table` 바로 뒤에 호스트 표기가 만든 주석(연속한 `Footnote`처럼)은 모드와 관계없이 하나의 주석으로 묶어 표 뒤에 둡니다. cudoc 문법을 받으면, 표 바로 뒤에 오고 첫 텍스트 노드가 주석 표지, 곧 `*`·`†`·`‡`의 연속이나 `⁾`가 붙을 수 있는 위첨자 숫자 뒤에 공백이 오는 글자로 시작하는 문단들도 그 주석에 묶습니다.

`parseCodeMeta(meta, mode, host, inCodeGroup?) → { title?, lines?, rest }`는 펜스의 메타를 읽되 항목의 따옴표 안은 읽지 않으므로, `title="use {2}"`는 강조 줄을 정하지 않습니다. 모드가 허용하는 `title=`은 놓인 자리와 상관없이 `filename=`보다 먼저 제목이 되고, 그런 형식은 모두 `rest`에서 빼며, VitePress의 `[name]`은 제목이 될 때만 뺍니다.

- cudoc 문법에서 제목은 `title="…"`이며 `'…'`나 따옴표 없는 단어로도 쓸 수 있습니다.
- 호스트 문법에서는 Docusaurus의 `title=`, Nextra와 `docs` 프로필의 `filename=`, VitePress의 `[name]`이 제목입니다. 다만 `::: code-group` 안의 펜스(`inCodeGroup`)에서는 `[name]`이 탭의 레이블이므로 제목으로 읽지 않고 `rest`에 남깁니다.

`docs` 프로필에서는 그 프로필의 코드 컴포넌트가 `filename=Podfile,{2},showLineNumbers`를 읽는 방식대로 메타를 읽습니다. 따옴표로 감싼 값과 `{…}` 목록 밖의 쉼표도 공백처럼 항목을 나누고, 따옴표 없는 값은 공백을 포함해 다음 쉼표까지 이어집니다. 그래서 `filename=My File.swift`의 제목은 `My File.swift`입니다.

줄 범위 `{1,3-5}`는 줄 강조를 지원하는 모든 호스트가 같은 방식으로 쓰므로 `off`를 뺀 모든 모드에서 읽습니다. `off`에서는 아무것도 읽지 않고 메타 전체를 `rest`로 돌려줍니다. 목록은 줄 번호를 정렬하고 중복 없이 줍니다. `5-3`처럼 거꾸로 쓴 범위는 `3-5`로 읽고, 빈 항목과, 0에서 시작하거나 10,000줄을 넘거나 끝 번호가 숫자로 정확히 나타낼 수 있는 정수(`Number.isSafeInteger`)를 넘는 범위는 건너뜁니다.

[표현](#표현) 단계가 메타를 다시 쓸 때는 코드 블록의 의미가 이미 담은 내용을 뺍니다. 어느 호스트 표기든 값이 제목과 같은 제목 형식 하나와, 줄이 있을 때의 `{…}` 목록만 뺍니다. 정규화가 읽지 않은 호스트 형식을 포함한 나머지는 그대로 둡니다.

`syntax.codeMeta`에 따라 정규화는 `code` 노드의 메타에서 읽은 내용을 `data.cudoc` `{ kind: "code", title?, lines? }`로 저장하고, `meta`는 작성한 그대로 둡니다. `cudoc-embed`와 `cudoc-pagebreak` 펜스는 건너뜁니다. 제목을 화면에 그리는 일은 정규화가 아니라 [표현](#표현)이 맡습니다.

탭 그룹은 `data.hName: "div"`, `hProperties.className: ["cudoc-tabs"]`, `data.cudoc` `{ kind: "tabs", group? }`를 가진 `blockquote`이며, 자식은 탭입니다. 각 탭은 `hName: "div"`, `className: ["cudoc-tab"]`, `data.cudoc` `{ kind: "tab", title, value, default? }`를 가진 `blockquote`로 탭의 내용을 담습니다.

`tabs`가 cudoc 문법을 받으면, 메타에 `tab="…"`(`'…'`나 따옴표 없는 단어로 써도 됨)가 있는 `code` 노드는 그 블록을 담은 탭이 됩니다. 이때 메타에서 `tab=`과 `group=`을 떼어 내고 `group`을 그룹 키로 씁니다. 첫 텍스트가 대소문자 구분 없이 `[!TAB]`이나 `[!TAB key]`로 시작하고 그 뒤에 공백이나 줄 끝이 오는 인용 블록은 그 줄의 나머지를 제목으로, 인용 블록의 나머지를 내용으로 가진 탭이 되며, 표지 안의 단어가 그룹 키입니다. 줄에 레이블이 없으면 인용 블록으로 남기고 `UNLABELED_TAB`으로 보고하며, 콜아웃 규칙은 이를 읽지 않습니다.

각 부모의 자식을 정규화한 뒤, 이어진 탭의 연속은 첫 탭의 그룹 키를 가진 하나의 그룹이 됩니다. 다른 그룹 키를 가진 탭은 새 그룹을 시작하므로 연달아 쓴 두 그룹은 두 그룹으로 남고, 같은 키를 다시 쓴 탭은 그 그룹에 이어집니다.

호스트 문법을 받으면, `tabs`로 매핑한 정적 컴포넌트는 모든 자식이 레이블을 주는 `tab` 매핑 정적 컴포넌트일 때 그룹이 되고, 그렇지 않으면 컴포넌트로 남습니다. `tabs`로 매핑한 컴포넌트는 `literals`(아래 참고)로 읽습니다. markdown-it 변환이 `kind: "codeGroup"`으로 표시하는 `::: code-group` 컨테이너는 펜스들이 탭인 그룹이 되며, 각 탭의 레이블은 메타에서 떼어 낸 `[name]`이고, 없으면 언어, 둘 다 없으면 `Code`입니다.

탭의 값은 컴포넌트가 준 값이거나, 그룹마다 GitHub slugger로 쓰인 그대로의 제목을 slug한 값이므로 레이블의 변수는 표지 모양대로 slug됩니다. 주어진 값은 그 값을 가진 첫 탭에 남고, 같은 값이 다시 나오거나 slug가 주어진 값과 같아지면 `value-1`, `value-2`처럼 번호를 붙입니다. 같은 값에 응답하는 두 탭은 함께 보이거나 둘 다 보이지 않기 때문입니다.

`DocumentDiagnostic`은 `code`, `message`, 선택적인 unist `position`을 가집니다. 현재 비치명적 코드는 `UNKNOWN_CALLOUT_TYPE`, `DYNAMIC_COMPONENT`, `DUPLICATE_HEADING_ID`, `UNDEFINED_VARIABLE`, `UNEVEN_CELL_SPAN`, `UNLABELED_TAB`입니다. 추가 콜아웃 타입은 `/^[a-z][\w-]*$/i`에 맞아야 합니다. 알 수 없는 cudoc 콜아웃 표기는 유지하고 동적 매핑·HTML JSX는 평가하지 않고 보존합니다.

컴파일 진단은 대문자와 밑줄로, [`cudoc check`](./node.ko.md#참조-검사)의 문제 코드는 소문자와 하이픈으로 씁니다. 그래서 `UNDEFINED_VARIABLE`은 컴파일이 페이지 하나에서 보고한 것이고, `undefined-variable`은 검사가 라이브러리 전체에서 보고한 것입니다.

`DYNAMIC_COMPONENT`는 매핑된 컴포넌트나 변환 대상 HTML 태그의 속성 값이 JSON이 아닌 표현식(`rows={count}`, `title={'Note'}`)일 때 발생합니다. 중괄호 안의 JSON(`rows={2}`, `title={"Note"}`)은 정적으로 취급하고, `tabs`에 매핑된 그룹은 리터럴도 읽습니다. 컴포넌트가 의도적으로 표현식을 받는 프로젝트에서는 `ignoreDiagnostics: ["DYNAMIC_COMPONENT"]`로 그 코드를 결과에서 제외하며, 옵션이 있든 없든 트리는 같고 메시지만 사라집니다. 문자열이 아닌 항목은 오류입니다. 어댑터도 같은 키를 받습니다.

## 페이지 메타데이터

소스: [metadata.ts](../../packages/cudoc/src/metadata.ts). `@cudoment/cudoc/query`에서 import합니다.

```ts
documentTitle(tree: Root, frontmatter?: Record<string, unknown>, fallback?: string): string
documentDescription(tree: Root, frontmatter?: Record<string, unknown>, maxLength?: number): string
frontmatterOf(tree: Root): Record<string, unknown>
const DESCRIPTION_LENGTH = 160
```

`frontmatterOf(tree)`는 트리의 `yaml` 노드에 담긴 frontmatter를 cudoc의 모든 컴파일러와 같은 방식(별칭 최대 100개, 날짜는 쓴 글자 그대로)으로 읽고, 노드가 없거나 값이 null이면 `{}`를 반환합니다. 매핑이 아니면 `cudoc: frontmatter must be a mapping` 오류를 던집니다. 독립 컴파일러와 [컴파일러 캡처](./adapters.ko.md#컴파일러-캡처)가 이 함수로 frontmatter를 읽습니다.

`documentTitle`은 비어 있지 않은 front matter `title`(앞뒤 공백을 지운 문자열이나 숫자)을 반환합니다. 없으면 트리 어디에서든 첫 1단계 제목(Docusaurus는 페이지의 `#` 제목을 `header`로 감쌈)의 보이는 글자를, 그것도 없으면 깊이와 관계없이 첫 제목의 보이는 글자를 반환하며, 배지와 퍼머링크는 뺍니다. 제목이 전혀 없으면 `fallback`(기본값 `""`)을 반환합니다.

`documentDescription`은 문자열 front matter `description`의 공백을 정리해 반환하고, 없으면 링크만 나열한 문단이 아니고 글자가 있는 첫 최상위 `paragraph`의 글자를 반환합니다. 로고 이미지만 든 문단도 건너뜁니다. 이때 raw `<br>`은 공백으로 읽고 공백을 정리합니다.

링크만 나열한 문단은 링크가 하나 이상 있고(문서가 레이블을 정의한 참조형 링크도 링크로 셉니다), 그 밖에는 링크, 굵게나 기울임으로 강조한 낱말, 구분 기호(`|`, `·`, `•`, `/`, `,`, 대시)만 있는 문단입니다. `**English** | [한국어](…)`처럼 쓴 언어 전환 줄이 여기에 해당합니다.

front matter `description`은 자르지 않고 그대로 반환합니다. 문단에서 가져온 글자가 `maxLength`(기본값 `DESCRIPTION_LENGTH`) 코드 포인트보다 길면 한도의 절반을 넘는 마지막 공백에서 자르고, 끝의 문장 부호를 지운 뒤 `…`를 붙이므로 결과는 `maxLength` 코드 포인트를 넘지 않습니다. 둘 다 없으면 빈 문자열입니다. 수집은 두 값을 [`pages.json`](./node.ko.md#라이브러리-파일)에 쓰고, `cudoc-export`는 설명을 사이트 페이지마다 `<meta name="description">`에 넣습니다.

## 컴파일

소스: [markdown.ts](../../packages/cudoc/src/markdown.ts). `compileDocument`, `CompiledDocument`는 `@cudoment/cudoc/markdown`에서 가져오며, 이 경로는 [`importedNames`와 `importedNamesFromSource`](#코어-도우미)도 다시 내보냅니다.

```ts
compileDocument(source: string, options?: DocumentOptions): CompiledDocument
// CompiledDocument = { tree: Root, frontmatter: Record<string, unknown>,
//                      diagnostics: DocumentDiagnostic[], imports?: string[] }
```

동기 독립 컴파일러는 Markdown에 remark parse/GFM/frontmatter, MDX에 실제 MDX 컴파일러를 사용합니다. `.md`의 `{value}`를 JavaScript로 해석하지 않습니다. YAML frontmatter는 매핑이어야 하며 null은 `{}`로 처리합니다. 반환 콘텐츠 트리에서는 YAML과 MDX ESM 노드를 제거합니다. frontmatter는 [`frontmatterOf`](#페이지-메타데이터)로 읽습니다.

Docusaurus 프로필은 directive 파싱을 추가하지만 Docusaurus 전체 컴파일러를 재현하지는 않습니다. 호스트 수집에는 실제 컴파일러 콜백을 사용합니다.

```js
import { compileDocument } from "@cudoment/cudoc/markdown"
import { renderDocument } from "@cudoment/cudoc/render"

const result = compileDocument(
  "## 제한 (#limits)\n\n> [!NOTE] 용량\n> 요청 100회.",
  { format: "md", syntax: {} },
)
const html = renderDocument(result.tree)
```

## 의미 AST

cudoc은 mdast 노드에 HTML 출력용 `data.hName`/`data.hProperties`와 의미 정보용 `data.cudoc`을 사용합니다. 콜아웃은 필수 React 컴포넌트가 아닌 `blockquote`입니다.

```json
{
  "type": "blockquote",
  "data": {
    "hName": "aside",
    "hProperties": {
      "className": ["cudoc-callout", "cudoc-callout-note"],
      "data-callout": "note"
    },
    "cudoc": { "kind": "callout", "type": "note", "title": "용량" }
  },
  "children": []
}
```

위 예시는 콘텐츠 자식을 생략했습니다. 실제 콜아웃은 스타일시트로 굵게 표시하며 `cudoc.kind: "calloutTitle"`을 갖는 제목 문단을 앞에 추가하고 본문 블록을 이어 붙입니다. 제목이 없으면 대문자 타입을 표시합니다. 소스 위치는 원본 블록을 가리킵니다.

다른 의미 종류는 `heading`(`explicitId`, 어느 형식으로 썼든 보이는 배지의 글자인 선택적 `badge`), `badge`(`span` 렌더링), `permalink`, `pageBreak`입니다. ` ```cudoc-pagebreak ` 펜스는 `hName: "div"`, `className: ["cudoc-page-break"]`, `hidden: true`, `cudoc.kind: "pageBreak"`를 가진 `thematicBreak`이 되어 사이트에서는 아무것도 렌더링하지 않고 쪽을 나누는 내보내기에서 쪽을 넘깁니다([공유 상수](./adapters.ko.md#페이지를-나누는-출력)). 제목 ID는 `data.hProperties.id`에 저장합니다.

Docusaurus가 `src`를 `require()` 호출로 적어 만드는 `img` JSX 요소처럼 호스트가 Markdown 이미지로 만든 노드에는 작성자가 쓴 `{ url, alt, title }`을 담은 `data.cudocImage: CapturedImage`가 붙습니다([컴파일러 캡처](./adapters.ko.md#컴파일러-캡처)). `@cudoment/cudoc/document`의 `capturedImage(node)`가 이 값을 반환합니다. 렌더링은 이런 노드를 `img`로 그리고, `cudoc check`는 그 `url`을 자산으로 검사합니다. 임베드는 그 `url`의 경로를 조정하고, 노드 속성이 `require()`하는 상대 모듈 경로를 사본이 들어가는 페이지의 디렉터리 기준으로 다시 씁니다. Word 작성기는 이미지를 그립니다.

`DocumentNode`는 확장 가능한 구조 타입이며 모든 사용자 노드를 렌더링할 수 있다는 보장은 아닙니다. `DocumentData`에는 다른 호스트 메타데이터도 들어갈 수 있습니다.

저장 AST의 버전은 `root.data.cudocAstVersion: 1`입니다. 자세한 내용은 [저장 계약](./node.ko.md#라이브러리-파일)에 있습니다. `validateAstContract(tree, options?)`는 루트·노드 구조와 목록·표 셀 제약을 검사하며 `requireVersion: true`이면 설정된 버전도 요구합니다. 임의 호스트 컴포넌트의 의미까지 모두 검증하지는 않습니다.

저장된 트리를 읽는 소비자(검색 색인기, 데이터셋 생성기, 자체 렌더러)는 버전 1에서 다음 사항에 의존할 수 있습니다. 버전은 노드 종류가 추가될 때가 아니라 이 사항이 바뀔 때 올립니다.

- MDX에서 본문이나 셀 목록이 아닌 표 셀에 쓴 `<br />`는 JSX 요소가 아닌 mdast `break` 노드입니다. Markdown 문서의 `<br>`은 파서가 만든 `html` 노드로 남고, 태그가 그 `value`입니다.
- 제목 ID는 `data.hProperties.id`에 있습니다. `headerLevel` 속성을 가진 `Anchor` 요소는 하위 컴포넌트 변환에만 존재하고 정규화가 내리므로 저장된 트리에는 나타나지 않습니다. 제목에 쓴 `Anchor`도 `headingAnchor`가 호스트 문법을 받는 동안 정규화가 내리지만, `badge: "off"`에서 배지를 가진 `Anchor`는 호스트의 컴포넌트로 남습니다.
- 문서 ID는 확장자를 뗀 라이브러리 경로이므로 `roots`를 쓰면 루트의 기준 경로로 시작하고(`docs/guide/setup`), 모든 링크·임베드 원본·데이터셋 범위가 그 형태를 사용합니다.
- `mdxjsEsm`, `position`, `estree`는 없고 표현식 노드는 `value` 글자를 유지합니다.
- 콜아웃, 배지, permalink, 쪽 나누기, 표 주석(`tableNote`), 탭(`tabs`와 `tab`), 제목이나 강조 줄이 있는 코드 블록(`code`), 공유 참조로 만든 링크(`reference`), 변환한 HTML 태그(`element`)는 위의 `data.cudoc` 종류입니다. [표현](#표현) 단계가 화면용으로 더하는 종류(`codeFrame`, `codeTitle`, `tabInput`, `tabLabel`)는 수집 과정, 즉 컴파일러 캡처와 AST 내보내기에서 지우므로 저장되지 않습니다.
- `br`, `a`, `img`가 아닌 변환한 HTML 태그는 인라인이면 `strong`, 블록이면 `blockquote`이고, `hName`이 태그, `hProperties`가 그 속성이며 `kind: "element"`로 표시합니다. 따라서 그 노드는 타입보다 `hName`을 먼저 읽어야 합니다.
- `private`와 `imports`는 트리가 아닌 manifest 항목에 있습니다.

## 표현

소스: [present.ts](../../packages/cudoc/src/present.ts). `@cudoment/cudoc/present`에서 import합니다.

```ts
type TabElements = {
  tabs: string | { name: string; group?: string }
  tab: string | { name: string; value?: string; label?: string; default?: string }
}
type PresentationTarget = {
  host: Host
  format?: "md" | "mdx"
  tabElements?: TabElements | false
}
presentDocument(tree: Root, target: PresentationTarget): void
withoutPresentation<Tree extends Root>(tree: Tree): Tree
resolveTabElements(value: unknown): TabElements | false | undefined
```

정규화는 문서가 뜻하는 내용만 남기고, `presentDocument`는 정규화된 트리를 `target`이 화면에 그리는 형태로 직접 변경합니다.

`data.cudoc.kind: "code"`인 모든 `code` 노드의 메타를 다시 씁니다. 대상에 고유한 제목 속성이 있으면 그 속성으로 제목을 먼저 쓰는데, `docusaurus`는 `title=`, `nextra`와 `docs`는 `filename=`이며 제목에 없는 따옴표로 감쌉니다. 그 뒤에 줄을 가장 짧은 `{…}` 목록으로 쓰고 나머지 메타를 공백으로 이어 씁니다. 나머지 메타는 처음 표현할 때 `data.cudocMeta`에 보관한 작성 그대로의 메타에서 [문서 옵션](#문서-옵션)에서 설명한 제목과 줄을 뺀 것이므로, `showLineNumbers`처럼 정규화가 읽지 않고 호스트가 읽는 형식은 남습니다.

`docs` 프로필의 코드 컴포넌트는 메타를 쉼표로 나누고 따옴표를 쓴 그대로 보여 주므로, 그곳에서는 제목에 쉼표가 없으면 따옴표 없이 씁니다. 나머지 메타는 이 프로필 방식대로 쉼표로 나눈 항목으로 읽고, 원문이 메타를 쉼표로 썼든 공백으로 썼든 `filename=Podfile,{2},showLineNumbers`처럼 모든 항목을 쉼표로 잇습니다.

그 밖의 대상과, rehype-raw 단계에서 모든 코드 블록의 메타를 버리는 `format: "md"`의 `nextra`에서는 제목이 있는 블록을 `blockquote`로 감쌉니다. 이 노드는 `data.hName: "div"`, `hProperties.className: ["cudoc-code"]`, `data.cudoc` `{ kind: "codeFrame", presentation: true }`를 가지며, 첫 자식은 `hName: "div"`, `className: ["cudoc-code-title"]`, `kind: "codeTitle"`을 가진 제목 문단입니다. 이미 감싼 블록은 그대로 두므로, 임베드를 끼워 넣은 뒤 다시 실행해도 됩니다.

아직 그리지 않은 탭 그룹은 두 방식, 즉 사이트의 탭 요소나 라디오 탭 중 하나로 그립니다.

탭 요소가 있으면, 즉 `target.tabElements`가 있거나 `false`가 아닌 `docs` 호스트에서 기본값 `{ tabs: "Tabs", tab: "TabsContent" }`를 쓰면, 그룹은 자리를 유지한 채 그룹 컴포넌트 이름을 `hName`으로, `{ [group]: key }`를 속성으로 받고 `data.cudoc`에 `presentation: true`가 붙습니다. 각 탭은 탭 컴포넌트 이름과 `{ [value]: value, [label]: title, [default]: true }`를 받으며, prop 이름의 기본값은 `group`, `id`, `label`, `default`입니다. MDX 호스트에서 대문자로 시작하는 `hName`은 페이지의 provider가 제공하는 컴포넌트로 컴파일됩니다.

`Tabs`와 `TabItem`을 전역으로 등록한 Docusaurus 사이트는 `{ tabs: { name: "Tabs", group: "groupId" }, tab: { name: "TabItem", value: "value" } }`로 대응시키며, `label`과 `default` prop은 이름이 같습니다. rehype-raw가 모든 요소 이름을 소문자로 바꾸는 `format: "md"`의 `nextra`에서는 탭 요소를 쓰지 않으므로, 그곳의 `.md` 페이지는 라디오 탭이 됩니다.

탭 요소가 없으면 각 탭 앞에 라디오와 레이블을 넣고 둘 다 `presentation: true`로 표시합니다. 라디오는 `hName: "input"`, `type: "radio"`, `name: "cudoc-tabs-N"`, `id: "cudoc-tabs-N-i"`, `className: ["cudoc-tab-input"]`(기본 탭에는 `cudoc-tab-default`도)를 가진 문단이고, 레이블은 `hName: "label"`, `htmlFor`, `className: ["cudoc-tab-label"]`을 가지고 제목을 담은 문단입니다.

`N`은 트리에 이미 있는 가장 큰 그룹 이름 다음부터 셉니다. 어떤 라디오에도 `checked`를 두지 않습니다. React는 변경 처리기 없이 `checked`를 가진 라디오를 고정해 버리므로, 라디오가 선택되기 전까지는 스타일시트가 기본 탭을 보여 줍니다.

`resolveTabElements(value)`는 이 옵션을 검증하며, `undefined`, `false`, 또는 두 항목이 모두 컴포넌트 이름(`/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/`)과 위에 나열한 prop만 가리키는 경우가 아니면 오류를 발생시킵니다. `docs` 호스트에서는 아직 그리지 않은 표 주석을 이 프로필의 주석 컴포넌트로 그립니다. 주석에 `presentation: true`를 표시하고, 각 문단에 `hName: "Footnote"`를 줍니다.

`withoutPresentation`은 `presentation: true`로 표시된 노드를 걷어 낸 트리를 직접 변경해 반환합니다. 프레임은 감싸고 있던 코드 블록으로 돌아가고, 탭의 라디오와 레이블은 통째로 사라지며, 탭 요소로 그린 그룹은 그룹과 탭의 데이터를 되찾습니다. 호스트의 주석 컴포넌트로 그린 표 주석은 자기 데이터를 되찾고, 모든 코드 블록은 `data.cudocMeta`에서 작성 그대로의 메타를 되찾습니다.

`cudoc-remark`의 prepare 플러그인은 정규화한 뒤 설정한 호스트와 파일 형식으로 페이지를 표현합니다. [컴파일러 캡처](./adapters.ko.md#컴파일러-캡처)는 저장하기 전에 표현을 걷어 내고, remark 임베드 플러그인은 prepare 플러그인이 파일에 남긴 대상, 없으면 라이브러리 매니페스트에 기록된 호스트로 끼워 넣은 내용을 표현합니다. markdown-it 플러그인은 수집이 트리를 저장한 뒤, HTML을 조립하기 전에 페이지 트리를 표현합니다. `cudoc-export`는 각 문서의 사본을 `html`로 표현합니다. 따라서 저장된 라이브러리, 데이터셋, Word 파일에는 의미만 남습니다.

## 컴포넌트와 렌더링

`DocumentOptions.components`는 이름을 `{ kind: "callout" | "link" | "badge" | "tableNote" | "tabs" | "tab", typeAttribute?, titleAttribute?, urlAttribute?, valueAttribute?, defaultAttribute?, groupAttribute?, itemsAttribute? }`에 매핑합니다. 속성 기본값은 `type`, `title`(탭은 `label`), `href`, `value`, `default`입니다. 탭에서 `defaultAttribute`는 기본 탭으로 만드는 boolean을, 그룹에서는 기본 탭의 인덱스나 값을 가리킵니다. 그룹의 `groupAttribute`는 그룹 키를, `itemsAttribute`는 탭이 순서대로 받는 레이블 목록을 가리킵니다.

기본 프로필은 아래 컴포넌트를 매핑합니다. 사용자 매핑은 같은 이름의 기본값을 덮어쓰며, 해당 기능에 호스트 문법을 허용해야 합니다.

| 프로필       | 항상                                      | `tabs`가 호스트 문법을 받을 때만                                                  |
| ------------ | ----------------------------------------- | --------------------------------------------------------------------------------- |
| `docs`       | `Infobox`, `Link`, `IconLink`, `Footnote` | `Tabs`/`TabsContent`(`valueAttribute: "id"`)                                      |
| `nextra`     | `Callout`                                 | `Tabs`(`itemsAttribute: "items"`, `defaultAttribute: "defaultIndex"`)/`Tabs.Tab`  |
| `docusaurus` | `Admonition`                              | `Tabs`(`groupAttribute: "groupId"`, `defaultAttribute: "defaultValue"`)/`TabItem` |

모든 프로필에서 `Badge` 컴포넌트는 `badge`가 호스트 문법을 받는 동안 배지가 됩니다.

`staticAttributes(node, literals?)`는 문자열, boolean 속성, JSON 표현식 값을 읽습니다. `literals`를 주면, 리터럴로만 이루어진 표현식(어느 따옴표든 문자열, 숫자, boolean, `null`, 배열, 일반 객체, 보간이 없는 템플릿)도 파싱된 `estree`에서 읽습니다. 저장된 트리에는 `estree`가 없습니다. `hasDynamicAttributes(node, literals?)`는 같은 기준으로 정적으로 읽을 수 없는 표현식·spread를 찾습니다.

`canonicalCalloutType(type)`은 info/default→note, danger/error→caution, warn→warning을 변환합니다. `makeCallout(type, titleNodes, children, position?)`는 의미 블록을 생성합니다. `lowerNativeElements(tree)`는 지원하는 정적 HTML JSX를 렌더링 가능한 mdast로 바꾸며 동적 JSX는 유지합니다.

렌더링은 `@cudoment/cudoc/render`에서 가져옵니다. [소스](../../packages/cudoc/src/render.ts):

```ts
documentToHast(tree: Root, options?: RenderOptions): HastRoot
renderDocument(tree: Root, options?: RenderOptions): string

type RenderOptions = {
  highlight?: (code: string, language?: string, node?: DocumentNode) => string
  components?: Record<string, (node: DocumentNode) => string>
}
```

여기서 `components`는 **HTML 렌더러 콜백**이며 의미 매핑이나 React 컴포넌트와 다릅니다. `highlight`는 완성된 HTML 조각을 반환하고 빈 문자열이면 일반 코드 마크업으로 처리합니다. `node`는 렌더링하는 `code` 노드이므로, 구문 강조기가 `data.cudoc.lines`에 표시된 줄을 읽을 수 있습니다. 지원하지 않는 MDX·directive·사용자 노드는 오류를 발생시킵니다.

모듈 export는 실행하지 않으며 raw HTML과 콜백 결과는 정화 없이 전달합니다. 신뢰하는 문서에 사용하거나 소비자가 별도 정화 정책을 적용해야 합니다.

렌더러는 표준 mdast와 HTML 메타데이터를 HAST로 변환합니다. 임베드 루트에서는 `data.cudocEmbedPrefix`로 각주의 접근성 레이블을 구분합니다.

아래 텍스트 헬퍼는 `@cudoment/cudoc/document`에서 가져옵니다. `nodeText(node)`는 값을 재귀적으로 이어 붙이고, `visibleHeadingText(node, read?)`는 배지·permalink 자식을 제외한 나머지 자식을 `read`(기본값 `nodeText`)로 읽습니다.

`decodeCharacterReferences(text)`는 CommonMark가 읽는 모든 문자 참조(`&copy;`, `&#169;`, `&#xA9;`)를 micromark와 같은 방식으로 풀고, HTML이 정의하지 않은 이름은 쓴 그대로 둡니다. `referencedCharacter(node)`는 VitePress 라이브러리가 중괄호 대신 남기는 `&#123;`처럼 문자 참조 하나만 담은 `html` 노드가 나타내는 문자를 돌려주고, 다른 노드에는 undefined를 돌려줍니다.

`nodeText`와 `visibleHeadingText`는 그런 노드를 쓴 그대로 둡니다. 이 함수들이 돌려준 글자는 VitePress `[[toc]]` 레이블이나 임베드 표의 제목처럼 페이지에 다시 쓰이기도 하는데, 그곳에서 풀린 `{{`는 Vue가 보간으로 읽기 때문입니다. `readableText(node)`는 그런 노드를 그 문자로 읽는 `nodeText`이며, `visibleHeadingText(node, readableText)`는 제목을 그렇게 읽습니다. `getNodeText`, `documentTitle`, `documentDescription`, `select.titles`와 `tableColumnLayout`의 매칭, 내보내기의 목차, Word 본문도 이 노드를 그 문자로 읽고, `getNodeText`는 이 노드를 블록이 아닌 인라인으로 다룹니다.

임베드 표와 트리의 제목·요약·셀, 탭 레이블처럼 문자열로 페이지에 쓰는 글자는 참조를 유지하므로 참조 표기가 그대로 보입니다. 트리 임베드의 `order`도 제목을 쓴 그대로 비교합니다.

블록 경계가 중요하면 아래 `getNodeText`를 사용합니다. 이 함수는 정규화된 HTML의 `hName` 블록·표 경계도 반영하며, 제목에서는 배지·permalink 자식을 제외하고 일반 문장의 배지는 유지합니다.

### 호스트 스타일시트

소스: [styles.css](../../packages/cudoc/styles.css). `@cudoment/cudoc/styles.css`로 import합니다. 렌더러가 생성하는 `cudoc-callout`, `cudoc-callout-warning`, `cudoc-callout-caution`, `cudoc-callout-title`, `cudoc-badge`, `cudoc-page-break`, `cudoc-tree`, `cudoc-tree-leaf`, `cudoc-code`, `cudoc-code-title`, `cudoc-table-note`, `cudoc-tabs`, `cudoc-tab`, `cudoc-tab-input`, `cudoc-tab-label`, `cudoc-tab-default` 클래스만 처리하며 그 밖의 요소에는 관여하지 않습니다.

[라디오 탭](#표현)은 레이블을 줄바꿈되는 한 줄에 두고 탭을 그 아래에 둡니다. `@supports selector(:has(*))` 아래에서는 선택된 라디오 뒤의 탭만 보이고, 선택된 라디오가 없으면 기본 탭이 보이며, `:has()`를 지원하지 않는 브라우저는 모든 탭을 보여 줍니다. 인쇄할 때는 모든 탭을 레이블과 함께 보여 줍니다.

코드 블록의 [제목 프레임](#표현)은 옅은 바탕의 막대에 제목을 넣어 호스트 코드 블록의 위쪽에 붙이고, 표 주석은 주변 글보다 작고 흐리게 표시합니다.

[트리](../embedding.ko.md#문서-트리-그리기)는 개요 모양으로 그립니다. 아래에 다른 줄이 있는 항목은 잎 항목의 글머리표 자리에 펼침 삼각형을 보입니다. 이 항목의 `details`는 Docusaurus의 정보 알림이나 Nextra의 테두리 상자처럼 호스트가 직접 쓴 details에 입히는 상자 모양을 벗습니다. 이 `details`는 페이지의 글자 색과, Docusaurus 알림 안에서는 그 링크 색을 따릅니다.

호스트의 페이지 안에서 로딩되므로 텍스트 색을 지정하지 않습니다. 본문 색은 호스트 테마에서 상속하고 표면과 강조색만 전환됩니다. 속성은 `--cudoc-wash`, `--cudoc-line`, `--cudoc-accent`, `--cudoc-accent-soft`, `--cudoc-warn`, `--cudoc-warn-wash`, `--cudoc-danger`, `--cudoc-danger-wash`로 이름을 구분해 두었으므로, 호스트 변수를 건드리지 않고 이 속성만 재정의해서 컴포넌트 색을 바꿀 수 있습니다. `warning` 콜아웃은 `warn` 쌍을, `danger`와 `error`를 읽어 들인 `caution` 콜아웃은 `danger` 쌍을 씁니다.

다음 세 가지 테마 신호가 어두운 팔레트를 켭니다.

- `prefers-color-scheme: dark`
- 루트 요소의 `dark` 클래스(VitePress, Nextra)
- `data-theme="dark"`(Docusaurus)

`light` 클래스나 `data-theme="light"`는 시스템이 다크를 선호해도 라이트 팔레트로 되돌리므로, 호스트 자체 토글이 양방향으로 우선합니다. 팔레트는 [내보내기 어댑터](./adapters.ko.md#내보내기)의 `siteStyles`와 동일하며, 모든 표면이 라이트와 다크 상속 텍스트 색 양쪽에서 WCAG AA를 충족합니다.

## 섹션과 쿼리

소스: [sections.ts](../../packages/cudoc/src/sections.ts). `collectSections`, `SectionSelection`, `CollectedSection`은 `/sections` 또는 `/query`에서 가져옵니다.

```ts
collectSections(tree: Root, select?: SectionSelection): CollectedSection[]
type SectionSelection = {
  anchors?: string[]
  titles?: string[]
  depth?: number | number[]
  includeChildren?: boolean
}
// CollectedSection = { anchorId: string, title: string, tree: Root, heading: Heading }
```

선택 조건을 모두 적용하며 depth는 1~6의 정수입니다. ID 없는 제목은 건너뜁니다. 명시적으로 요청한 앵커가 없으면 오류이고, 제목·단계에 일치하는 항목이 없으면 빈 결과입니다.

문서 순서로 반환합니다. 각 섹션은 그 제목이 있는 자리에서 잘라 내므로, ID를 반복하는 문서에서도 첫 번째 섹션의 내용을 두 번 주지 않고 각 제목 자신의 섹션을 줍니다. 섹션 트리는 복제하며 참조하는 링크·이미지·각주 정의를 유지합니다. `heading`은 원본 제목 참조이므로 수정 전 복제해야 합니다. `includeChildren: false`가 아니면 하위 섹션을 포함합니다.

`/query`의 하위 도우미([소스 목록](../../packages/cudoc/src/internal/core/query/index.ts)):

| 함수                                                                          | 반환과 동작                                                                       |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `findHeadingByAnchorId(tree, id, options?)`                                   | `{ heading, parent, index }` 또는 `undefined`                                     |
| `sliceSectionByAnchorId(tree, id, options?)`                                  | `Root` 또는 `undefined`; 다음 동급·상위 제목 직전까지; 기본적으로 참조 정의 유지  |
| `findSectionEnd(parent, index, depth)`                                        | 섹션 밖 첫 형제 인덱스                                                            |
| `findParentHeading(parent, index, depth)`                                     | 상위 제목 또는 `undefined`                                                        |
| `getHeadingAnchorId(heading, options?)`, `getHeadingBadge(heading, options?)` | 문자열 또는 `undefined`                                                           |
| `normalizeAnchorId(id)`                                                       | 선행 `#` 제거, percent escape 디코딩                                              |
| `findSiblingNode(parent, index, options)`                                     | 일치하는 형제 또는 `undefined`; direction 필수, type/boundary/accept 선택         |
| `getNodeText(nodes, options?)`                                                | 블록 경계를 포함한 텍스트; 기본적으로 알 수 없는 자식도 포함, 표 셀은 탭으로 분리 |
| `getTableCellNodes(table, positions)`                                         | `Node[][]`; 없는 셀은 빈 배열                                                     |
| `getTableCellText(table, positions)`                                          | `(string \| undefined)[]`                                                         |
| `getTableHeaderTexts(table)`                                                  | 헤더 문자열 배열                                                                  |
| `findTableColumnIndex(table, headerTexts)`                                    | 일치하는 열 인덱스, 없으면 `-1`                                                   |

셀 위치는 0부터 시작하는 `[row, column]`이며 헤더는 행 0입니다. `SliceSectionOptions`는 앵커 명명 옵션에 `includeDefinitions`(기본 true), `contextHeadingFromDepth`(기본 미지정)를 추가합니다. 하위 쿼리 결과는 입력 노드를 참조할 수 있으며 불변 임베드 경계가 아닙니다. `collectSections`와 임베드 처리는 변환에 사용할 트리를 복제합니다.

## 필터링

소스: [dataset.ts](../../packages/cudoc/src/dataset.ts). `@cudoment/cudoc/dataset`에서 가져옵니다.

`projectAst(tree, options?) → Root`는 입력을 검증하고 노드·속성을 재귀적으로 복제·필터링한 뒤 출력을 검증합니다. `ProjectionOptions`에는 선택적 문자열 배열 `excludeNodeTypes`, `excludeComponents`, `stripProperties`가 있으며, 기본값은 아무것도 제거하지 않습니다. `type`, `children`은 제거할 수 없습니다. 노드를 제외하면 하위 트리도 제거합니다. 컴포넌트는 MDX JSX 이름으로 비교하며 이미 정규화된 의미 노드에는 적용되지 않습니다.

`docsDatasetProjection`은 `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `DocDataEmbed`를 제외하는 선택적 프리셋입니다. 일반 Markdown 표는 제외하지 않습니다. 디스크 생성은 [Node 데이터셋](./node.ko.md#데이터셋)에서 설명합니다.

## 코어 도우미

루트 모듈은 AST 계약, 쿼리, `walk`, 섹션 선택자, 구분자, MDX 생성 도우미를 제공합니다. `compileDocument`, `normalizeDocument`, Node 라이브러리 API는 루트에서 재수출하지 않습니다.

| 진입점·소스                                                                                                  | Export와 계약                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [/ast](../../packages/cudoc/src/internal/core/ast/index.ts)                                                  | 버전 상수·해석, `validateAstContract`, 목록·부모·표 판별, AST 타입                                                                                             |
| [루트 순회](../../packages/cudoc/src/internal/core/walk.ts)                                                  | `walk({ tree, state, preTransforms, postTransforms })`; 조상·부모·인덱스 문맥으로 순서대로 원본 변환                                                           |
| [루트 선택자](../../packages/cudoc/src/internal/core/selectors.ts)                                           | `assertSectionSelector`, `matchesSectionHeading`, `findPreviousHeading`, 제목·헤더 정규화, 인라인 텍스트                                                       |
| [/syntax](../../packages/cudoc/src/internal/core/syntax/index.ts)                                            | 구분자 검증·추출·분할·제거, 제목 메타데이터 도우미                                                                                                             |
| [/mdx](../../packages/cudoc/src/internal/core/mdx/index.ts)                                                  | 속성·flow·text 요소 생성, 속성 읽기·쓰기, 줄바꿈·자식 변환, 문서의 `import` 문이 묶는 지역 이름을 읽는 `importedNames(tree)`·`importedNamesFromSource(source)` |
| [/transforms/table-cell-list](../../packages/cudoc/src/internal/transforms/table-cell-list/index.ts)         | `transformTableCellList`, 파서, 셀 재구성                                                                                                                      |
| [/transforms/table-column-layout](../../packages/cudoc/src/internal/transforms/table-column-layout/index.ts) | 배치 변환·옵션 해석, 표 생성, 분할 옵션과 셀 분할                                                                                                              |
| [cudoc-remark/badge](../../packages/cudoc-remark/src/transforms/badge.ts)                                    | 배지 변환과 옵션 해석                                                                                                                                          |

하위 제목·배지 변환은 이름 있는 MDX 요소를 출력할 수 있습니다. 컴포넌트 없는 작성 설정이 아닌 구현 구성 요소입니다. 작성용 설정에는 `normalizeDocument` 또는 어댑터의 명시적 `syntax` 옵션을 사용합니다.

`TableColumnLayoutOptions`에는 `section`(단계·제목 선택자), `columnHeaders`가 필수입니다. 선택적 `split`, `components`, `spanAttribute`(기본 `colSpan`), `metadataDelimiters`, `ignoreElements`로 출력을 조정합니다. 기본 요소 매핑은 소문자 HTML 표입니다. 공통 출력에는 의미·렌더러를 제공하지 않은 대문자 표 이름을 설정하지 않습니다. 전체 변환 문맥과 배치 타입은 연결된 소스에 있습니다.

`TableColumnWidthOptions`(`tableColumnWidths`)는 `{ section?, widths, metadataDelimiters?, ignoreElements? }`입니다. `widths`는 헤더 글자를 CSS 길이(`120px`, `6ch`, `20rem`, `25%`)에 대응시키며, 헤더 글자는 제목 메타데이터와 배지 같은 무시 요소를 제거하고 공백을 접은 뒤 비교합니다. 그 밖의 값이나 빈 맵, 객체가 아닌 규칙은 옵션 경로를 알리는 오류가 됩니다. `section`이 없는 규칙은 모든 표에 적용됩니다.

일치한 헤더 셀은 `data.hProperties.style: "min-width: <길이>"`를 얻는데, 임베드 표 열의 `minWidth`가 쓰는 값과 정확히 같으므로 HTML 사이트, 쪽을 나누는 형식, Word 작성기가 둘을 같은 방식으로 다룹니다([Word 열 폭](./adapters.ko.md#word-양식)). 규칙이 이름하지 않은 헤더 셀은 원래 스타일을 유지합니다.

폭 규칙은 배치 규칙보다 먼저 실행됩니다. 배치 규칙은 일치한 헤더 셀을 요소로 다시 만들면서 셀의 스타일을 열 정렬과 합친 `style` prop(`{ textAlign, minWidth }`)으로 옮기고, 정규화가 이를 다시 평탄한 `text-align:center;min-width:18rem` 문자열로 내립니다.
