# cudoc

[English](./README.md) | **한국어**

**Markdown에 알림과 중첩 목록 표를 더하고, 다른 문서의 내용을 가져오고, 같은 문서를 HTML로 공유하세요.**

cudoc은 Next.js(MDX), Docusaurus, Nextra, VitePress 등 **문서 호스트**를 지원합니다. 문서 호스트는 문서를 빌드하고 제공하는 정적 사이트 생성기와 웹 프레임워크를 통칭합니다. 사이트에 맞는 어댑터를 한 번 설정하면 문서 작성자는 Markdown 표기만으로 기능을 사용합니다. cudoc 전용 React 컴포넌트를 import하거나 등록할 필요가 없습니다.

핵심 기능의 두 축은 Markdown 문법 확장과 문서 임베드입니다. 독립 HTML은 같은 콘텐츠를 공유하는 **선택적 추가 출력 기능**으로, 지원하는 모든 문서 호스트와 함께 사용할 수 있습니다. 기존 호스트를 대체하거나 별도 문서 사본을 관리할 필요가 없으며, 다른 호스트 없이 단독으로 사용할 수도 있습니다.

## 제공 기능

### Markdown 표기만으로 알림·앵커·표 작성

제목에 앵커와 배지를 붙이고, 인용문을 알림으로 표시하고, 표 셀 안에 중첩 목록을 작성합니다.

```md
## 시작 조건 (#requirements) (@New)

> [!NOTE] 시작하기 전에
> 계정과 액세스 토큰을 준비하세요.

| 항목      | 준비할 내용                                     |
| --------- | ----------------------------------------------- |
| 접근 조건 | - 계정<br />-- 인증된 이메일<br />- 액세스 토큰 |
```

`#requirements`로 바로 연결할 수 있는 제목, New 배지, 제목을 굵게 표시하는 알림, 계정 아래 이메일이 중첩된 목록으로 렌더링합니다. 기능별로 cudoc 문법과 호스트 고유 문법을 선택하거나 함께 사용할 수 있습니다.

### 한 번 작성한 문서를 섹션이나 요약 표로 재사용

가져올 문서와 제목 조건을 코드 블록에 적습니다. 다음은 `reference.md`의 2단계 제목을 모아 제목·링크·요약 표를 만듭니다.

````md
```cudoc-embed
sources: [reference.md]
select: { depth: 2 }
render: { type: table }
```
````

특정 섹션과 하위 섹션을 본문으로 가져오거나, 가져온 사본에만 찾기·바꾸기를 적용할 수도 있습니다. 사이트 빌드 전에 문서를 수집하도록 연결하면 작성자는 같은 코드 블록으로 내용을 재사용합니다. 아래 HTML 명령은 수집까지 처리합니다.

### 명령 하나로 공유할 HTML 생성

`docs/`에 Markdown 문서가 있다면 패키지를 설치한 뒤 바로 생성합니다.

```sh
npm install @cudoment/cudoc cudoc-html
npx cudoc-html build docs --out-dir site
```

`site/index.html`을 열면 탐색 메뉴·목차·스타일을 갖춘 문서를 볼 수 있습니다. `site/` 전체를 파일로 공유하거나 정적 서버에 배포하세요. 기존 정적 사이트를 운영하면서 같은 문서로 HTML을 추가 생성할 수도 있습니다. 링크는 로컬 파일 연결, 기본 사이트 연결, 전체 제거 중에서 선택합니다.

[시작하기](#시작하기) · [지원 범위와 호스트 연결](#지원-범위와-호스트-연결) · [문법 선택](#문법-선택) · [문서 재사용 확장](#문서-재사용-확장) · [기존 사이트와 함께 HTML 생성](#기존-사이트와-함께-html-생성) · [상세 가이드와 API](#상세-가이드와-api)

## 시작하기

기존 사이트에 적용하려면 아래 [호스트별 가이드](#지원-범위와-호스트-연결)에서 패키지를 설치하고 어댑터와 스타일을 연결합니다. 문법 확장은 이 설정으로 사용할 수 있고, 문서 임베드는 빌드 전 수집 단계를 추가합니다.

먼저 독립 HTML로 기능을 확인하려면 위 설치 명령을 실행하고 다음 두 파일을 작성하세요. Node.js 20 이상과 npm이 필요합니다.

### 1. 재사용할 문서 작성

`docs/reference.md`:

```md
# 레퍼런스

## 제한 (#limits)

분당 요청 제한은 **기본값** 100회입니다.

### 재시도 (#retry)

잠시 기다린 후 다시 요청합니다.

## 인증 (#authentication)

요청에 액세스 토큰을 전달합니다.
```

### 2. 요약을 표시할 문서 작성

`docs/index.md`:

````md
# 제품 가이드

> [!NOTE] 이 가이드에 대하여
> 아래 표는 레퍼런스 문서에서 가져옵니다.

```cudoc-embed
sources: [reference.md]
select: { depth: 2 }
render: { type: table }
```
````

### 3. 생성하고 열기

```sh
npx cudoc-html build docs --out-dir site
```

`site/index.html`에 알림과 제한·인증 두 행의 요약 표가 표시됩니다. 표의 링크는 `reference.html`의 해당 제목으로 연결합니다. 문서를 수정하면 같은 명령으로 다시 생성하세요.

`site/`는 소스와 분리한 전용 출력 디렉터리로 사용합니다. 처음에는 존재하지 않는 경로를 지정하고, 이후에는 cudoc이 만든 디렉터리를 갱신합니다. 공유할 때는 HTML·CSS·자산이 들어 있는 디렉터리 전체를 전달합니다.

## 지원 범위와 호스트 연결

호스트에 맞는 가이드에서 설치 패키지, 플러그인 순서, 스타일 연결과 수집 설정을 확인합니다.

| 호스트                | 문서 형식                        | 설정 가이드                                |
| --------------------- | -------------------------------- | ------------------------------------------ |
| Next.js와 `@next/mdx` | `.md`, `.mdx`                    | [Next.js 설정](./docs/next-mdx.ko.md)      |
| Docusaurus            | 형식 감지를 적용한 `.md`, `.mdx` | [Docusaurus 설정](./docs/docusaurus.ko.md) |
| Nextra                | 형식 감지를 적용한 `.md`, `.mdx` | [Nextra 설정](./docs/nextra.ko.md)         |
| VitePress             | `.md`                            | [VitePress 설정](./docs/vitepress.ko.md)   |

어떤 호스트를 선택해도 수집 라이브러리에서 [독립 HTML을 추가로 출력](./docs/html.ko.md)할 수 있습니다. HTML 출력은 기존 호스트 대신 선택해야 하는 다른 호스트가 아닙니다.

`.md`는 일반 Markdown으로 처리하므로 `{value}`도 텍스트로 유지합니다. 자신의 React 컴포넌트를 작성하려면 MDX 호스트에서 `.mdx`를 사용합니다. VitePress는 React MDX를 처리하지 않습니다.

| 기능               | 지원 내용                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------- |
| Markdown 문법 확장 | 명시적 앵커, 배지, 알림, 표 셀 내부 중첩 목록, 목록 셀의 열 분할                            |
| 문서 임베드        | 문서·섹션 선택, 하위 섹션 포함 여부, 제목 요약 표, 문자열·정규식 찾기·바꾸기                |
| 독립 HTML          | 단독 생성 또는 호스트 수집 결과 재사용, 탐색·목차·코드 강조, 로컬 자산 복사, 링크 정책 선택 |
| AST 데이터셋       | 수집한 문서를 필터링해 후속 처리용 AST JSON과 manifest 생성                                 |

문법 확장만 사용할 때는 수집 파일이 필요하지 않습니다. 문서 간 임베드에는 수집한 AST와 원문 스냅샷이 필요하며, 문서나 설정을 수정하면 다시 수집합니다. 호스트 고유 문법은 [문법 가이드](./docs/syntax.ko.md)에 명시한 형태를 지원합니다. 수집에는 렌더링과 같은 호스트 컴파일러·문법·경로 설정을 사용해야 합니다.

독립 HTML은 공통 문서로 정규화된 내용을 렌더링합니다. 사용자 React·Vue 코드를 실행하지 않으므로 남아 있는 사용자 컴포넌트에는 별도 HTML 렌더러가 필요합니다. 출력은 HTML·CSS·자산 디렉터리이며 모든 자산을 한 파일에 묶지는 않습니다. 자동 수집 watcher와 문서 링크 감시는 현재 제공하지 않습니다.

## 문법 선택

호스트 어댑터의 `syntax`에서 기능별로 선택합니다.

```js
const options = {
  syntax: {
    headingAnchor: "both",
    badge: "cudoc",
    tableCellList: "cudoc",
    callout: "both",
    link: "host",
  },
}
```

| 값      | 처리할 문법                          |
| ------- | ------------------------------------ |
| `cudoc` | cudoc의 대표 문법                    |
| `host`  | 선택한 호스트에서 지원하는 고유 문법 |
| `both`  | 두 문법 모두                         |

기본값은 앵커·배지·셀 목록·알림이 `cudoc`, 링크가 `host`입니다. remark 기본 설정만으로 `.md`와 `.mdx` 모두 cudoc 컴포넌트 등록 없이 사용할 수 있으며, `syntax: {}`는 이 선택을 명시하는 표기입니다. 표준 Markdown 링크는 모든 모드에서 사용할 수 있습니다.

이 옵션은 cudoc이 정규화할 문법을 선택합니다. `cudoc`을 선택해도 호스트 파서가 자체 문법을 허용할 수 있습니다. 알림 타입, 호스트 고유 표기와 표 열 배치는 [Markdown 문법](./docs/syntax.ko.md)을 참고하세요.

## 문서 재사용 확장

요약 표 대신 제한 섹션과 그 하위 섹션을 본문으로 가져오려면 다음처럼 작성합니다.

````md
```cudoc-embed
sources: [reference.md#limits]
```
````

가져온 사본만 바꾸려면 같은 블록에 `replace`를 추가합니다. 원본 문서는 유지됩니다.

````md
```cudoc-embed
sources: [reference.md#limits]
replace:
  - find: "**기본값**"
    replace: "_적용값_"
```
````

`sources` 경로는 현재 문서 기준입니다. `select`로 앵커·제목·제목 단계를 선택하고, `includeChildren: false`로 하위 섹션을 제외할 수 있습니다. 수집 설정, 여러 문서 선택, 표 열 선택, 정규식 치환은 [문서 임베드 가이드](./docs/embedding.ko.md)에서 확인하세요.

## 기존 사이트와 함께 HTML 생성

호스트 가이드의 수집기를 실행한 뒤 같은 수집 결과를 HTML로 출력합니다.

```sh
npm install cudoc-html
npx cudoc-html build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

문서 경로에는 실제 소스 디렉터리를 지정합니다. Nextra 가이드는 `content`입니다. 호스트에서 처리한 문서와 준비된 임베드를 재사용하며, 기존 사이트의 출력과 수집 데이터는 수정하지 않습니다.

| `--links`           | 동작                                                              |
| ------------------- | ----------------------------------------------------------------- |
| `relative` (기본값) | 공유 디렉터리 안의 HTML 파일로 연결                               |
| `host`              | 내부 문서 링크를 `--host-url`과 수집된 경로로 연결, 외부 URL 유지 |
| `none`              | 외부 URL까지 모든 하이퍼링크 제거, 텍스트·서식 유지               |

본문·임베드·탐색 메뉴·목차에 모두 적용하며 로컬 이미지와 CSS는 유지합니다. `--host-url`에는 배포 기본 경로까지 포함하고, 수집된 문서 경로를 기본 사이트와 맞춥니다. 문서를 바꾸면 다시 수집한 뒤 HTML을 생성합니다. `public`·`static` 자산 경로와 추가 설정은 [독립 HTML 가이드](./docs/html.ko.md)를 참고하세요.

## 상세 가이드와 API

| 하고 싶은 일                          | 문서                                              |
| ------------------------------------- | ------------------------------------------------- |
| 앵커·배지·알림·중첩 목록 표 작성      | [Markdown 문법](./docs/syntax.ko.md)              |
| 섹션 재사용·요약 표·찾기·바꾸기       | [문서 임베드](./docs/embedding.ko.md)             |
| HTML 생성·공유·링크 정책 설정         | [독립 HTML](./docs/html.ko.md)                    |
| 수집 문서를 필터링해 후속 처리에 사용 | [AST 데이터셋](./docs/dataset.ko.md)              |
| 함수·타입·기본값·내부 동작 확인       | [API 레퍼런스](./docs/api-reference/README.ko.md) |
| 실제 호스트 예제 실행                 | [실행 예제](./examples/README.md)                 |

## 패키지와 개발

사용하는 호스트에 필요한 패키지를 선택합니다. ESM과 Node.js 20 이상을 사용합니다.

| 패키지                                                      | 역할                                         |
| ----------------------------------------------------------- | -------------------------------------------- |
| [`@cudoment/cudoc`](./packages/cudoc/README.md)             | 공통 문서 처리, 컴파일, 쿼리, 수집, 데이터셋 |
| [`cudoc-remark`](./packages/cudoc-remark/README.md)         | remark·MDX 파이프라인 연결                   |
| [`cudoc-docusaurus`](./packages/cudoc-docusaurus/README.md) | Docusaurus 연동                              |
| [`cudoc-nextra`](./packages/cudoc-nextra/README.md)         | Nextra 연동                                  |
| [`cudoc-vitepress`](./packages/cudoc-vitepress/README.md)   | VitePress 렌더링과 수집                      |
| [`cudoc-html`](./packages/cudoc-html/README.md)             | 독립 HTML 생성                               |

이 저장소를 개발하려면 루트에서 실행합니다.

```sh
npm ci
npm run build
npm run test:run
npm run typecheck
npm run format:check
```

호스트 예제는 별도로 설치합니다. API와 사용 흐름을 변경할 때는 해당 가이드와 API 레퍼런스를 함께 갱신합니다.

[MIT 라이선스](./LICENSE)
