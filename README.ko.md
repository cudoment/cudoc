# cudoc

[![CI](https://img.shields.io/github/actions/workflow/status/cudoment/cudoc/ci.yml?branch=main&label=CI&logo=githubactions&logoColor=white)](https://github.com/cudoment/cudoc/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@cudoment/cudoc?logo=npm)](https://www.npmjs.com/package/@cudoment/cudoc)
[![npm downloads](https://img.shields.io/npm/dm/@cudoment/cudoc)](https://www.npmjs.com/package/@cudoment/cudoc)
[![Node.js](https://img.shields.io/node/v/@cudoment/cudoc?logo=nodedotjs&logoColor=white)](./docs/README.ko.md#지원-버전)
[![License](https://img.shields.io/npm/l/@cudoment/cudoc)](./LICENSE)
[![Hosts](https://img.shields.io/badge/hosts-Next.js%20%C2%B7%20Docusaurus%20%C2%B7%20Nextra%20%C2%B7%20VitePress%20%C2%B7%20Eleventy-blue)](#사이트-생성기-고르기)
[![Export](https://img.shields.io/badge/export-HTML%20%C2%B7%20PDF%20%C2%B7%20Word-blue)](./docs/export.ko.md)

[English](./README.md) | **한국어**

**한 번 쓴 사실을 어디서나 재사용합니다. 모든 문서, 사이트, 인덱스가 원본 하나를 공유합니다.**

cudoc은 지금 있는 Markdown 문서와 사용 중인 사이트 생성기에 세 기능을 더합니다.

- **문법 확장**은 표 셀 안의 목록, 제목을 붙인 콜아웃, 탭처럼 기본 Markdown에 없는 표현을 쓸 수 있게 합니다.
- **문서 임베드**는 빌드할 때 다른 문서나 그 문서의 절을 페이지로 가져오므로, 같은 사실을 한 번만 쓰면 됩니다.
- **내보내기**는 같은 문서를 HTML 사이트, 단일 HTML 페이지, PDF, Word로 만듭니다.

작성자는 컴포넌트를 임포트하지 않고 평소처럼 Markdown을 씁니다. 이제 문서에는 독자가 둘입니다. 하나는 문서를 여는 사람이고, 다른 하나는 그보다 훨씬 자주 문서를 읽는 검색 파이프라인·에이전트·모델 같은 기계입니다. cudoc은 원본 하나로 두 독자 모두에게 같은 문서를 제공합니다.

**설정 가이드:** [Next.js](./docs/next.ko.md) · [Docusaurus](./docs/docusaurus.ko.md) · [Nextra](./docs/nextra.ko.md) · [VitePress](./docs/vitepress.ko.md) · [Eleventy](./docs/eleventy.ko.md) · [아직 생성기가 없음](./docs/export.ko.md) · [호스트마다 필요한 조건](#사이트-생성기-고르기)

**이 README는 [웹사이트](https://cudoment.github.io/cudoc/index.ko.html)로도 읽을 수 있습니다.** 정적 사이트 생성기 없이 `cudoc-export`가 이 파일과 `docs/`로 만든 사이트이며, cudoc의 문서를 cudoc이 직접 내보냈습니다.

---

## 문제: 같은 문장이 열한 군데에 흩어져 있습니다

여러 페이지에 들어가야 하는 사실은 복사되고, 사본은 하나를 고치는 순간부터 서로 어긋납니다. 요청 한도, 필요한 권한, 지원 버전 표가 그렇습니다. 사본 하나를 바로잡으면 나머지 열 개가 조용히 틀린 내용이 됩니다.

**cudoc은 사본을 없앱니다.** 사실 하나는 한 문서에만 두고, 다른 문서는 모두 그 문서를 가리킵니다.

````md
```cudoc-embed
sources: [reference.md#limits]
```
````

빌드할 때 cudoc이 실제 내용을 끌어옵니다. 독자는 완성된 페이지를 읽고, 작성자는 문단 하나만 관리합니다.

---

## "그냥 공용 컴포넌트로 만들어서 임포트하면 안 되나요?"

됩니다. 그렇게 해도 사본은 사라지지만, 임포트와 임베드는 서로 다른 것을 만들어 냅니다. MDX 계열 호스트는 조각 파일을 만들어 임포트할 수 있고, markdown-it 계열 호스트에는 같은 일을 하는 include 지시자가 있습니다.

임포트는 **참조인 채로 남습니다.** 페이지에는 컴포넌트 노드 하나가 들어가고, 그 컴포넌트가 등록된 호스트가 렌더링할 때에야 글이 나타납니다.

```mdx
import Limits from "./_limits.mdx"

<Limits />
```

임베드는 **아무것도 렌더링되기 전에 해석됩니다.** 빌드 시점에 cudoc이 이 블록을 원본 문서의 실제 제목, 문단, 표, 즉 평범한 문서 노드로 바꿔 놓습니다.

````md
```cudoc-embed
sources: [reference.md#limits]
```
````

이 차이 하나가 나머지를 전부 결정합니다.

|                              | 공용 컴포넌트                                                                                       | `cudoc-embed`                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 재사용의 단위                | 파일 하나 전체. VitePress는 줄 범위나 파일에 표시해 둔 영역도 가져옴                                | 실제 페이지의 아무 절이나. 앵커, 제목, 깊이로 고르고 원본에는 표시하지 않음 |
| 사실이 놓이는 자리           | URL도 앵커도 없고 목차에도 없는 조각 파일. VitePress 영역은 페이지 안에 표시해 둠                   | 독자가 링크할 수 있는 정식 문서                                             |
| 작성 방식                    | `.mdx`와, 쓰는 페이지마다 붙는 import 한 줄                                                         | 평범한 `.md`. 가져올 것도 등록할 것도 없음                                  |
| 호스트 사이의 이동           | 호스트마다 표기가 다름                                                                              | 여섯 호스트에서 같은 블록                                                   |
| 가져온 내용 손보기           | props를 붙이거나 조각 파일을 하나 더 만듦                                                           | `replace`로 이 페이지에서만 바꿔 씀. 원본은 그대로                          |
| 파생해서 보여 주기           | 가져오는 것만 가능                                                                                  | `render: { type: table }`로 제목 요약 표를 만들어 냄                        |
| 검사                         | 없는 파일을 가져오면 빌드가 하나씩 실패함. VitePress include는 파일이나 영역이 없어도 조용히 넘어감 | `cudoc check`가 깨진 원본과 앵커를 한 번에 보고                             |
| 호스트 밖의 소비자가 받는 것 | 렌더링할 수 없는 컴포넌트 이름                                                                      | 글 그 자체                                                                  |

### 재사용하려고 문서를 조각낼 필요는 없습니다

cudoc은 문서를 통째로 둡니다. `reference.md`는 URL을 가진 페이지 그대로이고, `#limits`는 누구나 링크할 수 있는 앵커 그대로이며, 재사용은 재사용이 일어나는 자리에 적힙니다. 어디까지 떼어 쓸지 미리 정해 둘 필요가 없고, 그 경계가 바뀌어도 구조를 다시 짜지 않습니다.

조각 파일 방식은 재사용의 단위를 파일의 단위와 같게 만듭니다. 절 하나를 공유하려면 그 절을 `_limits.mdx`로 도려낸 다음 원래 있던 페이지로 다시 임포트해야 하고, 몇 번 반복하면 원본 글은 아무도 직접 열어 보지 않는 조각들에 흩어지며 실제 페이지는 조립 명세서가 됩니다.

### 그리고 가져온 내용은 진짜 글입니다

cudoc이 해석해 놓은 결과는 실제 내용이므로, 어느 도착지든 똑같이 완성된 문서를 받습니다. 컴포넌트 노드는 호스트가 아닌 모든 것에게 불투명합니다. HTML 내보내기도, AST 데이터셋도, 말뭉치를 읽는 검색기도 그 안을 볼 수 없습니다. → [문서 임베드](./docs/embedding.ko.md)

---

## 두 번째 독자: 검색 파이프라인

중복된 문서는 유지보수 비용에 더해 이제 **검색 인덱스까지 망가뜨립니다.** 중복된 문서 위에 RAG 파이프라인을 올리면 거의 똑같은 사본 열한 개가 전부 청크가 됩니다. 질의 하나가 그중 여러 개를 끌어와 같은 문장을 반복하느라 컨텍스트를 쓰고, 정작 답이 들어 있는 청크의 관련도 점수는 그만큼 묻힙니다. 한 페이지만 고치고 나머지를 두면 낡은 사본이 최신 내용과 나란히 경쟁하는데, 모델에게는 어느 쪽이 지금 맞는 값인지 가릴 방법이 없습니다.

원본을 하나로 모으면 이 문제는 뿌리부터 사라집니다. 그 위에 cudoc은 기계 독자에게 네 가지를 더 제공합니다.

- **가리키는 대신 펼쳐서 내보냅니다.** 임베드는 빌드할 때 펼쳐지므로 크롤러나 검색기가 읽는 HTML은 빠진 곳 없는 문서입니다. 작성자는 참조만 관리하고 기계는 전문을 받습니다.
- **글자 수가 아니라 의미로 자릅니다.** `cudoc dataset`은 컴파일한 문서를 AST JSON과 매니페스트로 내보내면서 제목 계층, 앵커, 절 경계를 그대로 살리므로, 문장 중간에서 끊기는 고정 길이 창 대신 절 하나를 청크로 삼을 수 있습니다. 설정 한 줄이면 `code` 블록이나 내부용 컴포넌트를 인덱스에서 뺄 수 있습니다. → [AST 데이터셋](./docs/dataset.ko.md)
- **공유한 사실이 한 번씩만 들어 있는 말뭉치가 나옵니다.** 데이터셋은 수집한 그대로의 문서를 담으므로 임베드는 사본 없이 원본을 가리키는 `cudoc-embed` 블록으로 남고, 임베드로 공유한 사실은 그 사실을 가진 문서에서 한 번만 색인됩니다. 모든 절이 `문서#앵커`로 주소를 가지므로 "요청 한도가 얼마죠?"라는 질문에 페이지 하나가 아니라 절 하나로 답하고 그 앵커를 출처로 돌려줄 수 있습니다. 데이터셋은 노드를 걸러 낼 뿐 중복을 찾아 없애지는 않으므로, 손으로 복사해 둔 글은 복사된 채로 남습니다.
- **모델이 그대로 읽을 수 있는 원본을 남깁니다.** 작성자가 컴포넌트를 import하거나 등록하는 일이 없으므로, 모델이 읽어 들이는 `.md` 파일은 사람이 읽는 그 글과 똑같습니다. 걷어낼 JSX도, 렌더링해야만 생기는 런타임 상태도 없습니다.

에이전트가 문서를 쓰게 한다면 `cudoc check --format json`이 깨진 링크, 앵커, 이미지, 임베드를 한 번에, 기계가 읽는 형태로 돌려주므로 사람이 빌드 로그를 들여다보지 않아도 고치는 순환이 닫힙니다. `cudoc lsp`는 같은 검사를 편집기에서 저장할 때마다 실행하고, 그럴듯한 수정안을 빠른 수정으로 제공합니다. → [참조 검사](./docs/check.ko.md)

---

## 사이트 생성기 고르기

각 가이드는 설치, 설정, 수집 연결, 빌드 순으로 번호를 매긴 절차입니다. 모든 단계가 그대로 복사해 사용할 수 있는 명령이나 파일이라, 직접 따라 해도 되고 코딩 에이전트에게 그대로 넘겨 설정을 맡겨도 됩니다.

| 사이트 생성기          | 가이드                                       | 데모                                                                                         | 설치                                            |
| ---------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Next.js**            | [Next.js 설정 →](./docs/next.ko.md)          | [Next.js가 빌드한 데모](https://cudoment.github.io/cudoc/demos/next/portable/)               | `@cudoment/cudoc cudoc-remark`                  |
| **Docusaurus**         | [Docusaurus 설정 →](./docs/docusaurus.ko.md) | [Docusaurus가 빌드한 데모](https://cudoment.github.io/cudoc/demos/docusaurus/docs/portable/) | `@cudoment/cudoc cudoc-remark cudoc-docusaurus` |
| **Nextra**             | [Nextra 설정 →](./docs/nextra.ko.md)         | [Nextra가 빌드한 데모](https://cudoment.github.io/cudoc/demos/nextra/portable)               | `@cudoment/cudoc cudoc-remark cudoc-nextra`     |
| **VitePress**          | [VitePress 설정 →](./docs/vitepress.ko.md)   | [VitePress가 빌드한 데모](https://cudoment.github.io/cudoc/demos/vitepress/portable.html)    | `@cudoment/cudoc cudoc-vitepress`               |
| **Eleventy**           | [Eleventy 설정 →](./docs/eleventy.ko.md)     | [Eleventy가 빌드한 데모](https://cudoment.github.io/cudoc/demos/eleventy/portable/)          | `@cudoment/cudoc cudoc-eleventy`                |
| **아직 생성기가 없음** | [HTML 내보내기 →](./docs/export.ko.md)       | [사이트로 본 이 README](https://cudoment.github.io/cudoc/index.ko.html)                      | `@cudoment/cudoc cudoc-export`                  |

호스트별 데모는 모두 같은 Markdown 파일 두 개를 [실행 가능한 예제](./examples/README.md)에서 각 호스트가 빌드한 결과이며, 각 데모와 함께 볼 원문 파일은 [호스트별 데모](./docs/README.ko.md#호스트별-데모)에 있습니다. 아직 생성기가 없다면 마지막 줄이 빈 디렉터리에서 시작하는 길입니다. 명령 두 번과 문서 두 개면 사이트 하나가 나옵니다. → [첫 사이트 만들기](./docs/export.ko.md#빈-디렉터리에서-첫-사이트-만들기)

설치 열에는 cudoc 패키지만 적었고, 호스트에 따로 필요한 패키지는 각 가이드의 1단계에서 함께 설치합니다. 모든 패키지는 ESM이며 Node.js 22 이상이 필요합니다. 모든 변경을 어떤 호스트 버전으로 검증하는지와 호스트마다 필요한 조건의 자세한 내용은 [지원 버전](./docs/README.ko.md#지원-버전)에 있습니다.

- **Docusaurus.** 수집은 Docusaurus 자체의 MDX 프로세서를 `@docusaurus/mdx-loader/lib/processor.js`에서 불러 실행합니다. 이 모듈은 공개 API가 아닌 내부 모듈이므로 Docusaurus를 올릴 때 다시 확인해야 합니다.
- **Nextra.** 어댑터가 Nextra에 넘기는 플러그인 함수를 Turbopack이 전달하지 못하므로, 사이트는 Turbopack 대신 webpack으로 빌드하고 실행하며 Next.js 16에서는 `--webpack`을 지정해야 합니다. 지금 npm이 설치하는 Nextra 4.6.1은 cudoc 사용 여부와 관계없이 zod 4.4 이상과 함께 쓰면 아무것도 빌드하지 못합니다. 그래서 가이드는 4.6.0 유지를 권하며, zod를 4.4 미만으로 고정해도 4.6.1이 빌드됩니다.
- **VitePress와 Eleventy.** 플러그인은 시작할 때 불러온 라이브러리를 계속 쓰므로, 다시 수집한 뒤에는 개발 서버를 다시 시작해야 합니다.
- **VitePress.** VitePress 1은 Vite 5를 쓰는데, Vite 5 개발 서버에는 어느 Vite 5 릴리스로도 고쳐지지 않은 보안 권고가 공개되어 있습니다. 빌드한 사이트에는 해당하지 않습니다.

모든 호스트가 `.md`를 받고, MDX 계열 세 호스트는 `.mdx`도 받으며 어느 쪽인지는 파일 확장자로 파일마다 갈립니다. cudoc의 기능은 두 형식에서 모두 동작하고, 다만 Nextra의 `.md` 페이지에서만 코드 제목과 이름을 지정한 탭 컴포넌트를 다르게 그립니다. → [`.md`와 `.mdx` 선택](./docs/README.ko.md#md와-mdx-선택)

HTML, PDF, Word 내보내기는 어느 호스트에서든 같은 수집 결과를 재사용해 **추가로** 만드는 출력이며, 위 여섯 가지 대신 고르는 일곱 번째 선택지가 아닙니다. → [기존 사이트와 함께 생성](./docs/export.ko.md#기존-사이트와-함께-생성)

---

## 무엇을 얻게 되나

사이트는 세 기능을 문법 확장, 문서 임베드, 내보내기 순서로 들입니다. 문법 확장은 지금 있는 페이지 안에서, 문서 임베드는 페이지 사이에서 동작하고, 내보내기는 같은 문서를 다른 형식으로 만듭니다.

### 컴포넌트 없이도 더 많이 담는 Markdown

작성자는 React 컴포넌트를 가져오지도 등록하지도 않으며, 문서는 그대로 Markdown입니다.

```md
## 준비 사항 (#requirements) (@New)

> [!NOTE] 시작하기 전에
> 계정과 액세스 토큰을 준비하세요.

| 항목 | 필요한 것                                     |
| ---- | --------------------------------------------- |
| 접근 | - 계정<br />-- 이메일 인증<br />- 액세스 토큰 |
```

확장 문법은 명시적 제목 앵커, 배지, 제목이 붙는 콜아웃, 표 셀 안의 중첩 목록, 셀 병합, 표 주석, 제목·강조 줄이 있는 코드 블록, 탭, 공유 변수, 공유 링크 정의입니다. 호스트에도 고유 표기가 있는 기능은 cudoc 문법과 호스트 고유 문법 중 하나만 쓰거나 둘 다 받아들이도록 고를 수 있으므로, 기존 페이지를 한 줄도 손대지 않고 cudoc을 들일 수 있습니다. 쓰지 않는 기능은 끌 수 있으며, 끈 기능의 문법은 쓴 글자 그대로 남습니다. → [Markdown 문법](./docs/syntax.ko.md)

### 통째로가 아니라 골라서 가져옵니다

임베드는 문서 전체, 절 하나, 폴더 하나 가운데 하나를 지정하고, 가져온 내용을 요약하거나 개요로 그리거나 바꿔 쓸 수 있습니다.

| 하고 싶은 것                      | 쓰는 방법                                          |
| --------------------------------- | -------------------------------------------------- |
| 문서 전체                         | `sources: [reference.md]`                          |
| 한 절과 그 아래 절까지            | `sources: [reference.md#limits]`                   |
| 아래 절을 뺀 한 절                | `includeChildren: false`                           |
| 제목만 모은 요약 표               | `select: { depth: 2 }`와 `render: { type: table }` |
| 폴더의 문서를 접어 두는 트리      | `sources: [guides/]`와 `render: { type: tree }`    |
| 같은 내용을 이 페이지 문맥에 맞게 | `replace: [{ find: "...", replace: "..." }]`       |

원본 문서는 손대지 않습니다. → [문서 임베드](./docs/embedding.ko.md)

### 원본을 고치면 글을 쓰는 동안 모든 사본이 따라옵니다

개발 서버 옆에서 실행해 둔 `cudoc collect --watch`는 저장한 문서를 그 파일 하나를 컴파일하는 시간 안에 다시 수집합니다. 원문이 바뀐 문서만 컴파일하고, 그 문서를 읽는 임베드만 다시 해석하며, 나머지는 재사용합니다.

```sh
cudoc collect --watch --config cudoc.config.mjs
```

MDX 호스트에서는 등록해 둔 로더가 그 문서를 임베드한 페이지들이 바뀌었다고 개발 서버에 알리므로 브라우저의 사본이 재시작 없이 갱신되고, 컴파일되지 않는 문서는 터미널의 메시지로 남으며 마지막 정상 결과는 그대로 유지됩니다. VitePress와 Eleventy는 설정을 평가할 때 라이브러리를 불러오므로, 거기서는 변경 뒤 개발 서버를 재시작합니다. → [수집 설정](./docs/embedding.ko.md#문서-수집-설정), [감시](./docs/api-reference/node.ko.md#감시)

### 문서 한 벌로 도착지 세 곳

기존 사이트, 전달용 HTML, 기계가 읽는 AST 말뭉치가 모두 같은 Markdown에서 같은 해석을 거쳐 나옵니다.

| 출력          | 명령                 | 쓰임새                                                    |
| ------------- | -------------------- | --------------------------------------------------------- |
| 기존 사이트   | 기존 빌드 명령       | 사람이 읽는 운영 문서                                     |
| HTML 내보내기 | `cudoc-export build` | 오프라인 전달, 파일 하나로 첨부, 리뷰 회차, 정적 배포     |
| AST 데이터셋  | `cudoc dataset`      | RAG 파이프라인, 검색 인덱스, MCP 서버, 에이전트 참고 자료 |

HTML 내보내기는 사이트, 스타일·그림을 품은 단일 페이지, 리뷰 메모를 받는 페이지 가운데 하나를 만듭니다. 하이퍼링크는 로컬 파일로 잇기, 배포 URL로 바꾸기, 링크 없애기의 세 정책 가운데 하나로 처리합니다. 그래서 같은 내용을 디스크에서 열든, 메시지에 첨부하든, 웹에 올리든 그대로 동작합니다.

완성된 예시가 저장소에 함께 들어 있습니다. 문서 여섯 개로 된 API 핸드북을 [설정 파일 하나](./examples/export/showcase.config.mjs)로 두 언어의 사이트, 문서별 파일, 표지와 목차가 붙은 묶음 파일로 내보냈고, 설정 세 개를 더해 [단일 페이지](./examples/export/standalone-output/getting-started.html), [리뷰용 페이지](./examples/export/annotate-output/getting-started.html), [호스팅 리뷰](./examples/export/review-output/)로도 내보냈습니다. [PDF](./examples/export/showcase-output/northlight-handbook.pdf)와 [Word 파일](./examples/export/showcase-output/northlight-handbook.docx)은 바로 열어 볼 수 있고, [사이트](./examples/export/showcase-output/index.html)는 문서 사이트에서 보거나 저장소를 내려받아 디스크에서 열 수 있으며, 이 결과를 만든 Markdown은 [원본 문서](./examples/export/showcase/)에서 비교할 수 있습니다. → [완성 예시](./docs/export.ko.md#완성-예시)

---

## 레퍼런스

가이드가 작업 흐름을 알려 주고, 레퍼런스는 시그니처, 기본값, 계약을 담습니다.

| 찾는 것                                                  | 문서                                               |
| -------------------------------------------------------- | -------------------------------------------------- |
| 문법 모드, 콜아웃 종류, 네이티브 형태, 열 배치           | [Markdown 문법](./docs/syntax.ko.md)               |
| 수집 설정, 선택, 치환, 갱신 규칙                         | [문서 임베드](./docs/embedding.ko.md)              |
| HTML 모드, 사이트 구성, 링크 정책, PDF와 Word            | [내보내기](./docs/export.ko.md)                    |
| 문서 집합 전체의 깨진 링크, 앵커, 이미지, 임베드         | [참조 검사](./docs/check.ko.md)                    |
| 투영 옵션, 매니페스트 형식, 소비자 계약                  | [AST 데이터셋](./docs/dataset.ko.md)               |
| import, 시그니처, 옵션 기본값, AST 메타데이터, 내부 동작 | [API 레퍼런스](./docs/api-reference/README.ko.md)  |
| 어떤 패키지가 무엇을 맡고 무엇을 내보내는지              | [패키지](./docs/api-reference/README.ko.md#패키지) |
| 실제로 돌려 볼 수 있는 사이트                            | [실행 가능한 예제](./examples/README.md)           |

---

## 기여하기

클론은 명령 세 개로 빌드하고 테스트합니다.

```sh
npm ci
npm run build
npm test
```

`npm test`는 세 계층을 돌립니다. 패키지 단위 테스트, 각 예제의 실제 컴파일러로 공유 픽스처를 통과시키는 통합 검사, 그리고 빌드된 예제 사이트를 직접 읽는 검사입니다. 전제를 갖추지 못한 계층은 실패하는 대신 그 전제를 만드는 명령과 함께 건너뛰며, `CUDOC_STRICT=1`을 설정하면 건너뛴 사례가 하나라도 있을 때 실패합니다. 자세한 내용은 [`tests/README.md`](./tests/README.md)를 참고합니다.

호스트 예제는 자체 lockfile로 따로 설치합니다. API나 사용 흐름을 바꿀 때는 해당 가이드와 API 레퍼런스도 같은 변경 안에서 함께 고쳐야 합니다. 문제 보고, 변경 방법, 문서 작성 규칙은 [CONTRIBUTING.ko.md](./CONTRIBUTING.ko.md)에 있습니다.

## 릴리스 노트

버전마다 바뀐 내용은 [릴리스 노트](./docs/release-notes.ko.md)에 있습니다.

## 라이선스

cudoc은 [MIT 라이선스](./LICENSE)로 배포합니다.
