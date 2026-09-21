# 문서 임베드

[English](./embedding.md) | **한국어** · [전체 가이드](./README.ko.md)

수집한 다른 문서의 내용을 가져와 재사용합니다. 작성자는 `cudoc-embed` 코드 블록을 쓰고, 호스트 연동이 렌더링 결과를 삽입합니다. 문법 확장은 독립적으로 사용할 수 있지만 문서 간 임베드에는 저장된 AST와 원문 스냅샷이 필요합니다.

임베드는 참조로 남지 않고 빌드 시점에 실제 문서 노드로 해석됩니다. 공용 조각 파일을 임포트하는 방식과 갈리는 지점이 바로 여기입니다. → [공용 컴포넌트로 만들면 안 되나요?](../README.ko.md#그냥-공용-컴포넌트로-만들어서-임포트하면-안-되나요)

## 문서 수집 설정

일반 Markdown 또는 표준 cudoc 파이프라인을 사용하는 Next.js에서는 `cudoc.config.mjs`를 작성합니다.

```js
export default {
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  host: "markdown", // Next.js 가이드에서는 "next"를 사용합니다.
  syntax: {},
}
```

다음 명령을 실행합니다.

```sh
npx cudoc collect --config cudoc.config.mjs
```

문서를 수집하고 임베드를 준비합니다. 같은 입력 디렉터리와 문법 설정으로 호스트를 빌드하거나 실행합니다. [Next.js](./next.ko.md), [Docusaurus](./docusaurus.ko.md), [Nextra](./nextra.ko.md), [VitePress](./vitepress.ko.md), [Eleventy](./eleventy.ko.md) 연동에서 수집 결과를 소비하도록 설정하세요. [독립 HTML](./export.ko.md)은 빌드 명령 안에서 이 과정을 처리합니다.

각각 다른 경로로 서비스되는 여러 디렉터리의 문서는 `sourceRoot` 대신 `roots`로 수집합니다. `exclude`는 `**/AGENTS.md` 같은 파일을 제외하고, `private`는 수집과 검사는 하되 내보내지는 않는 문서를 표시합니다. 옵션과 ID 파생 규칙은 [수집](./api-reference/node.ko.md#수집)에서 설명합니다.

```js
export default {
  roots: [
    { dir: "content", base: "docs" }, // content/ko/guide.md → /docs/ko/guide
    { dir: "glossary", base: "terms" },
  ],
  exclude: ["**/AGENTS.md", "docs/ko/drafts/**"],
  private: ["docs/in/**"],
  outDir: ".cudoc/documents",
  host: "markdown",
}
```

Docusaurus, Nextra, VitePress, Eleventy 수집은 실제 호스트 컴파일러를 사용해야 합니다. 각 가이드에서 실행 가능한 수집기를 제공합니다. 범용 파서로 다시 읽는 것만으로는 호스트 고유 변환을 재현할 수 없습니다. Next.js에 별도 플러그인을 추가했다면 수집기에도 같은 컴파일러 구성을 적용하세요. 사용자 컴파일러에는 `compilerId`가 필요하며, 컴파일러 버전이나 관련 설정을 변경할 때 갱신합니다.

## 섹션 가져오기

`docs/index.md`에 작성합니다.

````md
```cudoc-embed
sources: [reference.md#limits]
```
````

제한 섹션의 제목, 본문, 하위 섹션을 포함합니다. → [왜 컴포넌트가 아니라 코드 블록인가](#왜-컴포넌트가-아니라-코드-블록인가) 같은 단계 또는 상위 단계의 다음 제목 직전까지가 섹션입니다. `#limits`를 생략하면 문서 전체를 가져오며 확장자도 생략할 수 있습니다. 경로는 임베드를 작성한 문서 기준입니다. `/`로 시작하면 운영체제 루트가 아닌 `sourceRoot` 기준입니다. 수집된 로컬 문서만 대상으로 지정할 수 있습니다.

하위 섹션을 제외하려면 다음과 같이 작성합니다.

````md
```cudoc-embed
sources: [reference.md]
select:
  anchors: [limits]
  includeChildren: false
render: section
```
````

선택 조건은 `anchors`, 정확히 일치하는 `titles`, 1–6의 숫자 또는 배열인 `depth`를 지원합니다. 여러 조건을 지정하면 모두 만족해야 합니다. 제목이 바뀔 수 있으면 명시적 앵커를 사용하세요. 부모·자식 섹션을 함께 선택하면 자식 내용이 반복될 수 있습니다.

## 제목 요약 표 만들기

````md
```cudoc-embed
sources: [reference.md, advanced.md]
select:
  depth: 2
render:
  type: table
  columns: [title, link, summary]
```
````

선택한 제목마다 행 하나를 생성합니다. `title`은 표시 제목, `link`는 원본 섹션 링크, `summary`는 섹션의 첫 문단을 일반 텍스트로 만든 값입니다. 필요한 열과 순서를 선택할 수 있으며 기본 순서는 `title`, `link`, `summary`입니다.

### 열을 직접 정의하기

열을 매핑으로 쓰면 그 열의 글자가 어디서 오는지, 무엇으로 연결되는지, 어느 폭을 유지해야 하는지를 적을 수 있습니다. 다음은 API마다 하나씩 있는 "기본 정보" 절을 개요 표의 행 하나로 바꿉니다.

````md
```cudoc-embed
sources: [/docs/rest-api.md]
select:
  depth: 5
  titles: [기본 정보]
render:
  type: table
  columns:
    - { header: API, value: parent, link: parent, minWidth: 10rem }
    - header: 메서드
      value: { row: 1, column: 0, skipTablesWithHeaders: [요구 사항] }
    - header: URL
      value: { row: 1, column: 1, skipTablesWithHeaders: [요구 사항] }
    - { header: 설명, value: summary }
    - { header: 레퍼런스, value: { extractor: sdkReference } }
```
````

| 키                                                       | 의미                                                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `header`                                                 | 머리 셀의 글자. 기본값은 값 이름입니다.                                                                                                                                  |
| `value: title`                                           | 행이 된 절의 제목 글자.                                                                                                                                                  |
| `value: summary`                                         | 절의 첫 문단을 일반 텍스트로 만든 값.                                                                                                                                    |
| `value: parent`                                          | 그 절보다 얕은 가장 가까운 상위 제목의 글자. "기본 정보" 위에 있는 API 이름이 여기에 해당합니다.                                                                         |
| `value: { row, column, table?, skipTablesWithHeaders? }` | 절 안의 표 하나에서 셀 하나. 머리 행을 0으로 하여 0부터 셉니다. `table`은 절의 표를 순서대로 고르되, 머리 행에 `skipTablesWithHeaders`의 이름이 있는 표는 세지 않습니다. |
| `value: { extractor }`                                   | 수집 옵션에 그 이름으로 등록한 함수. 아래에서 설명합니다.                                                                                                                |
| `link`                                                   | `section`은 행의 절로, `parent`는 상위 제목으로, `document`는 문서로 연결합니다. 생략하면 글자만 넣습니다.                                                               |
| `minWidth`                                               | `120px`, `10rem` 같은 CSS 길이이며 머리 셀의 `min-width` 스타일로 쓰입니다. HTML 사이트는 스타일로 반영하고 Word 내보내기는 그 열을 최소 그 폭으로 유지합니다.           |

축약형 열은 각각 `{ value: title }`, `{ value: title, link: section }`, `{ value: summary }`와 같고 머리 글자는 그 이름입니다.

고정 어휘로 부족하면 수집 옵션에 함수를 등록하고 열에서 이름을 부릅니다. 함수는 행(원본 문서, 선택된 절, 상위 제목, 절의 주소)을 받아 글자 또는 글자와 링크를 돌려줍니다.

```js
// cudoc.config.mjs
export default {
  sourceRoot: "docs",
  extractors: {
    sdkReference: {
      version: "2026-09-21", // 함수의 출력이 바뀌면 함께 바꿉니다
      extract(row) {
        const language = row.document.id.split("/")[1]
        return {
          text: `${row.section.title} (${language})`,
          url: `/sdk/${language}/${row.section.anchorId}`,
        }
      },
    },
  },
}
```

`version`은 라이브러리 설정에 들어가므로, 추출기가 바뀌면 컴파일러가 바뀔 때처럼 준비된 임베드가 무효가 됩니다. 아무것도 찾지 못한 열은 빈 셀로 렌더링되며, `cudoc check`가 매핑으로 쓴 열에 대해 그런 셀마다 열이 요구한 것과 절이 가진 것을 함께 적은 `empty-embed-cell` 경고를 보고합니다. → [참조 검사](./check.ko.md)

## 찾기·바꾸기

````md
```cudoc-embed
sources: [reference.md#limits]
replace:
  - find: "**기본값**"
    replace: "_적용값_"
  - find: "v[0-9]+"
    replace: "current"
    regex: true
    flags: g
```
````

선택한 **원본 Markdown 소스**에 규칙을 순서대로 적용합니다. 기본적으로 하위 절도 포함합니다. 일반 문자열 규칙은 일치하는 모든 부분을 바꾸며 **대소문자를 구분합니다.** 정규식은 `regex: true`로 켜고 기본 플래그는 `g`입니다. Markdown 표기를 유지한 채 원본 문서의 컴파일러 설정으로 다시 컴파일합니다. 원본 파일과 수집된 AST는 그대로 둡니다.

선택한 내용이 참조하는 외부 참조 정의도 함께 쓸 수 있습니다. 치환 대상은 선택한 원문 범위이며, 그 범위 밖에 덧붙는 정의는 바꾸지 않습니다.

### 어디에 적용되는가

치환은 트리에서 무언가를 골라내기 전에 **원문 슬라이스 단계**에서 일어납니다. 그래서 **모든 임베드 형태에 적용됩니다.** 하위 절을 포함하든 빼든, 문서 전체를 가져오든, 원본을 여러 개 쓰든, 제목이나 깊이로 고르든 마찬가지입니다. `render: { type: table }` 요약 표에도 적용되어 제목 열과 요약 열이 바뀝니다. 다만 링크 열의 주소는 원본 문서의 실제 앵커 그대로입니다.

닿지 않는 곳이 두 군데 있습니다. 가져오는 절 안에 또 다른 `cudoc-embed` 블록이 있으면 그 블록은 따로 해석되므로(중첩 임베드는 자기 규칙대로 전개됩니다), 작성하신 규칙이 그 중첩 임베드가 끌어온 내용까지 바꾸지는 않습니다. 그리고 규칙 목록은 선택된 절 **전부**에 적용되므로, `depth: 2`로 여러 절을 고른 상태에서 한 절만 겨냥한 규칙은 나머지 절에서 아무것도 찾지 못합니다. 이건 정상이며 오류가 아닙니다.

### `find`를 안전하게 쓰는 법

`find`는 YAML 스칼라이고, YAML은 따옴표 없는 글자를 나름대로 해석합니다. **따옴표로 감싸십시오.** 그러지 않으면 아래처럼 조용히 틀리거나 파싱이 깨집니다.

| 이렇게 쓰면         | 이렇게 됩니다                          |
| ------------------- | -------------------------------------- |
| `find: "**굵게**"`  | 정상                                   |
| `find: **굵게**`    | YAML 오류. `*`가 별칭 표기로 해석됨    |
| `find: 한도 # 분당` | **조용히 `한도`로 잘림.** `#`부터 주석 |
| `find: 참고: 이것`  | YAML 오류. 콜론이 하나 더              |
| `find: @New`        | YAML 오류. `@`는 예약 문자             |

정규식은 한 단계가 더 필요합니다. 큰따옴표 안에서는 `\`가 이스케이프 문자이기 때문입니다.

| 이렇게 쓰면    | 실제로 전달되는 패턴                     |
| -------------- | ---------------------------------------- |
| `find: "\d+"`  | YAML 오류. 잘못된 이스케이프             |
| `find: "\\d+"` | `\d+`                                    |
| `find: '\d+'`  | `\d+`. 작은따옴표는 글자 그대로 받습니다 |

역슬래시가 들어가면 작은따옴표를 쓰시는 편이 편합니다. 여러 줄을 찾으실 때는 블록 스칼라를 씁니다.

```yaml
- find: |-
    첫째 줄
    둘째 줄
  replace: "한 줄로"
```

### 찾는 대상이 없을 때

아무 일도 일어나지 않습니다. 임베드는 원본의 표현을 그대로 실어 나르는데, 그 자리는 다르게 쓰일 것을 전제로 작성된 자리입니다. 그래도 빌드는 아무 말을 하지 않습니다. [`cudoc check`](./check.ko.md)가 이것을 보고합니다.

```
  6:12  warning unmatched-embed-replacement was reworded away
        replacement 1 found no "was reworded away" in what this embed copies
        from reference, so nothing was changed. …
```

선택된 절 **어디에서도** 맞지 않은 규칙만 보고하므로, 바로 위에서 말씀드린 절별 부분 불일치는 조용히 넘어갑니다.

## 왜 컴포넌트가 아니라 코드 블록인가

임베드를 `<Embed sources={...} />`처럼 만들 수도 있었습니다. 코드 블록을 고른 이유는 컴포넌트 형태를 막는 조건이 세 가지 있고, 그와 별개로 코드 블록이 더 나은 이유가 하나 더 있기 때문입니다.

**`.md`에는 컴포넌트가 없습니다.** MDX는 `.md`에서 JSX를 끄기 때문에, 거기 쓴 `<Embed />`는 요소가 아니라 문단 안의 raw HTML로 파싱됩니다. 임베딩을 컴포넌트로 만들면 이 기능을 쓰는 문서를 전부 `.mdx`로 바꿔야 합니다. 이 프로젝트가 어디서나 지키는 원칙, 즉 작성자는 Markdown만 쓰고 아무것도 등록하지 않는다는 원칙과 정면으로 어긋납니다.

**여섯 호스트 중 둘에는 MDX 자체가 없습니다.** VitePress와 Eleventy는 markdown-it 위에 있어서 JSX를 파싱하지 못하고, `.mdx` 파일은 수집 단계에서 거부됩니다. 컴포넌트 문법이었다면 이 두 호스트를 빼거나 호스트마다 다른 표기를 만들어야 했을 텐데, 그건 공용 조각 파일을 옮기기 어렵게 만드는 바로 그 분화입니다. 코드 블록은 어디서나 `code` 노드 하나이고, 파이프라인 전체가 술어 하나로 찾습니다.

```js
node.type === "code" && node.lang === "cudoc-embed"
```

**스펙은 렌더링되기 전에 읽힙니다.** `prepareEmbeds`는 빌드 시점에 **저장된** AST를 훑습니다. React가 실행되기 한참 전입니다. JSX props로 쓴 `replace={[{ find: "a", replace: "b" }]}`는 속성 표현식이고, 그 파싱 결과는 `estree`에 담깁니다. 그런데 수집은 `estree`를 제거합니다. 이식 가능한 문서 AST가 JavaScript 구문 트리를 들고 다닐 이유가 없기 때문입니다. 남는 것은 `[{ find: "a", replace: "b" }]`라는 소스 문자열뿐이라, 스펙을 되읽으려면 문서 안의 JavaScript를 다시 파싱하거나 평가해야 합니다. 코드 블록의 값은 처음부터 문자열이고 YAML이 그대로 읽습니다.

**다른 곳에서 얌전히 물러납니다.** cudoc을 모르는 파서는 이걸 `code` 노드로 보고 회색 블록으로 렌더링하며, 다시 Markdown으로 써도 한 글자도 바뀌지 않습니다. GitHub에서도 그대로 보입니다. 같은 자리에 컴포넌트 형태가 있었다면 깨진 마크업이거나 글자 그대로 노출됩니다. 문서가 여기저기로 옮겨 다닌다는 것이 이 기능의 전제인데 말입니다. 원문 치환도 같은 성질에 기댑니다. 펜스는 원본 Markdown에서 잘려 나갔다가 다시 컴파일되는 왕복을 그대로 통과합니다.

## 빌드와 갱신

1. 전체 원본 문서를 수집합니다.
2. 임베드를 준비합니다. `cudoc collect`에는 이 단계가 포함되어 있습니다.
3. 호스트를 빌드하거나 개발 서버를 실행합니다.
4. 원본 문서, 문법, 경로, 컴파일러 설정이 바뀌면 수집과 준비를 다시 실행합니다. 실행 중인 호스트가 라이브러리를 메모리에 보관한다면 재시작합니다.

MDX 호스트에서는 임베드 플러그인이 준비된 내용을 페이지가 컴파일될 때 접합하므로, 컴파일된 페이지가 라이브러리 내용을 담고 있고 번들러는 그 페이지의 파일이 바뀌기 전까지 그대로 제공합니다. 같은 파일에 `cudoc-remark/loader`를 등록하면([Next.js](./next.ko.md#5단계--임베드-플러그인-추가), [Nextra](./nextra.ko.md#4단계--임베드-플러그인-추가), [Docusaurus](./docusaurus.ko.md#4단계--임베드-플러그인-추가) 가이드에 위치가 있습니다) 재수집이 개발 서버와 영구 빌드 캐시가 이미 컴파일한 페이지에도 닿습니다. 파일은 그대로 두고, 컴파일 입력에 아무것도 렌더링하지 않는 참조 정의 한 줄만 더합니다.

패키지 스크립트의 `dev`, `build` 전에 수집 명령을 연결해, 빌드가 오래된 라이브러리로 돌아가지 않게 하세요. 글을 쓰는 동안에는 개발 서버 옆에서 `cudoc collect --watch --config cudoc.config.mjs`를 실행하면 루트 아래의 문서가 바뀔 때마다 다시 수집합니다. 원문이 바뀐 문서만 컴파일하고 바뀐 문서를 읽는 임베드만 다시 해석하며, 컴파일되지 않는 문서는 라이브러리를 깨뜨리는 대신 메시지로 남습니다. 호스트 전용 수집기는 범용 명령 대신 `node collect.mjs`를 사용하는데, 같은 반복은 [`watchDocuments`](./api-reference/node.ko.md#감시)로 쓸 수 있습니다. 생성된 `.cudoc/`은 버전 관리에서 제외하고 CI에서 다시 생성합니다.

`routeBase`에는 `/docs` 같은 문서 경로 접두사를 지정합니다. VitePress의 `cleanUrls: false`에는 `routeSuffix: ".html"`이, Eleventy의 기본 디렉터리 URL 규칙에는 `routeSuffix: "/"`가 필요합니다. 호스트의 사용자 경로나 frontmatter slug에는 `routes: { "guide/start": "/custom/start" }`를 지정하세요. 자동 추론하지 않습니다. 이 설정으로 요약 표와 임베드 안의 문서 링크를 실제 페이지에 맞춥니다.

## 문제 해결

| 증상                          | 조치                                                                    |
| ----------------------------- | ----------------------------------------------------------------------- |
| 준비된 임베드가 없거나 오래됨 | 호스트 실행 전에 다시 수집·준비하고 양쪽 출력 경로가 같은지 확인        |
| 문서 또는 섹션을 찾을 수 없음 | 상대 경로, 수집 범위, 명시적 앵커 ID 확인                               |
| ID 중복 또는 충돌             | 제목에 고유 ID 지정; API로 여러 임베드를 조합하면 서로 다른 prefix 사용 |
| 순환 임베드                   | 문서 또는 섹션 의존성의 순환 제거                                       |
| 컴포넌트의 공통 렌더러가 없음 | Markdown 사용, 정적 의미 매핑 설정, 또는 렌더링 API에 렌더러 전달       |
| 내용은 맞지만 링크가 틀림     | `routeBase`, `routeSuffix`, `routes`를 실제 호스트 경로에 맞춤          |

임베드는 ID와 참조를 조정해 충돌을 피하고 문서 링크와 이미지 경로를 다시 계산합니다. 코드로 직접 수집하거나 비동기 컴파일러·저장 데이터·수동 렌더링을 다루려면 [Node API 레퍼런스](./api-reference/node.ko.md)를 참고하세요.
