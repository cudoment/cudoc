# cudoc 가이드

[English](./README.md) | **한국어** · [프로젝트 홈](../README.ko.md)

이 페이지는 호스트별 설정 가이드, 호스트별 데모, 지원 버전, `.md`/`.mdx` 선택, 기능별 가이드로 안내합니다.

가이드는 작업 흐름을 알려 주고, [API 레퍼런스](./api-reference/README.ko.md)는 시그니처, 기본값, 계약을 담습니다.

## 사이트에 설치하기

각 가이드는 설치, 설정, 수집 연결, 빌드 순으로 번호를 매긴 절차입니다. 모든 단계가 그대로 복사해 사용할 수 있는 명령이나 파일이므로, 직접 따라 하거나 코딩 에이전트에게 넘길 수 있습니다. 각 가이드는 그렇게 설정한 다음 무엇을 쓸 수 있는지 정리한 표와, 그 호스트에서 알아 둘 점으로 끝납니다.

| 사용 중인 사이트       | 가이드                             |
| ---------------------- | ---------------------------------- |
| **Next.js**            | [Next.js →](./next.ko.md)          |
| **Docusaurus**         | [Docusaurus →](./docusaurus.ko.md) |
| **Nextra**             | [Nextra →](./nextra.ko.md)         |
| **VitePress**          | [VitePress →](./vitepress.ko.md)   |
| **Eleventy**           | [Eleventy →](./eleventy.ko.md)     |
| **아직 생성기가 없음** | [HTML 내보내기 →](./export.ko.md)  |

문법 확장만 쓰는 설정은 호스트 설정에서 끝납니다. 문서 임베드는 사이트를 빌드하기 전에 수집이 먼저 돌아야 하며, 각 가이드가 그 경계를 표시합니다.

## 호스트별 데모

호스트마다 같은 Markdown 파일 두 개를 cudoc으로 렌더링합니다. 각 데모는 그 호스트가 빌드한 그대로 공개합니다. [`portable.md`](../examples/fixtures/portable.md)는 문법 확장을 사용하고 [`reference.md`](../examples/fixtures/reference.md)를 세 가지 모습으로 임베드합니다. 제목을 모은 요약 표, 문구를 바꾼 절 하나, 문서 구조도입니다. 데모를 두 파일과 나란히 열면 작성자가 쓴 내용과 호스트가 그린 결과를 비교할 수 있습니다.

| 호스트            | 호스트가 빌드한 데모                                                                   | 가이드                           | 실행 가능한 예제                                                         |
| ----------------- | -------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------ |
| Next.js 16.4.2    | [Portable documents](https://cudoment.github.io/cudoc/demos/next/portable/)            | [Next.js](./next.ko.md)          | [`examples/next-mdx`](../examples/next-mdx/next.config.mjs)              |
| Docusaurus 3.10.2 | [Portable documents](https://cudoment.github.io/cudoc/demos/docusaurus/docs/portable/) | [Docusaurus](./docusaurus.ko.md) | [`examples/docusaurus`](../examples/docusaurus/docusaurus.config.mjs)    |
| Nextra 4.6.0      | [Portable documents](https://cudoment.github.io/cudoc/demos/nextra/portable)           | [Nextra](./nextra.ko.md)         | [`examples/nextra`](../examples/nextra/next.config.mjs)                  |
| VitePress 1.6.4   | [Portable documents](https://cudoment.github.io/cudoc/demos/vitepress/portable.html)   | [VitePress](./vitepress.ko.md)   | [`examples/vitepress`](../examples/vitepress/docs/.vitepress/config.mjs) |
| Eleventy 3.1.7    | [Portable documents](https://cudoment.github.io/cudoc/demos/eleventy/portable/)        | [Eleventy](./eleventy.ko.md)     | [`examples/eleventy`](../examples/eleventy/eleventy.config.mjs)          |

데모는 각 예제를 그 예제의 잠금파일로 빌드한 것이므로 다음 표의 검증한 버전을 보여 주며, 데모의 탐색 영역에는 두 Markdown 파일과 가이드, 예제 코드로 가는 링크가 있습니다. 데모는 릴리스가 끝나면 이 문서 사이트와 함께 배포됩니다. 이 문서 사이트 자체는 호스트 데모가 아닙니다. 사이트 생성기 없이 `cudoc-export`가 README와 `docs/`로 만든 사이트이며, `cudoc-export`가 만드는 다른 결과물은 [내보내기](./export.ko.md#완성-예시)에서 볼 수 있습니다.

데모 사이의 차이 가운데 두 가지는 cudoc이 아니라 호스트에서 비롯됩니다.

- Next.js와 Eleventy는 `.md` 파일로 거는 링크를 쓴 그대로 두므로, _Shared values_ 절의 공유 링크는 두 사이트가 제공하지 않는 `reference.md`를 가리킵니다. 이 호스트에서는 `linkReferences`를 포함해 링크에 페이지 주소를 써야 합니다.
- 호스트마다 제목, 코드 블록, 표를 자체 테마와 앵커 방식으로 그립니다. Nextra는 코드 블록 제목을 `.mdx`에서만 유지하므로, `.md` 페이지에서는 자체 제목 표시가 없는 호스트와 같은 방식으로 보여 줍니다.

## 지원 버전

cudoc에는 Node.js 22 이상이 필요하며 모든 패키지는 ESM입니다. 아래 표는 호스트마다 cudoc의 모든 변경을 검증하는 버전, 표시한 날짜에 새 프로젝트로 설치해 확인한 조합, cudoc이 지원하는 버전, 어댑터가 npm에 선언한 피어 범위를 보여 줍니다.

| 호스트     | 검증한 버전                        | 새로 설치해 확인한 조합(2026-10-19)                                                                                                                                                                                            | 지원 범위                                                              | 선언한 피어 범위                                              |
| ---------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| Next.js    | Next.js 16.4.2, `@next/mdx` 16.4.2 | 같은 버전                                                                                                                                                                                                                      | Next.js 16.4 이상의 16.x                                               | 호스트 피어 없음: `cudoc-remark`는 remark 플러그인입니다      |
| Docusaurus | Docusaurus 3.10.2                  | 같은 버전                                                                                                                                                                                                                      | 3.10 이상의 3.x                                                        | `@docusaurus/core` `^3.10.0`                                  |
| Nextra     | Nextra 4.6.0, Next.js 15.5.28      | 실패: zod 4.6.7과 함께 쓴 Next.js 16.4.2의 Nextra 4.6.1(아래의 Nextra 결함). zod를 4.3.6으로 고정하거나, Nextra를 4.6.0으로 고정하거나, Next.js 15.5.28에서 zod를 4.3.6으로 고정하면 빌드됩니다. 16에서는 `--webpack`을 씁니다 | Nextra 4.6.0과 zod 4.4 미만의 4.6.1, webpack을 쓰는 Next.js 15 또는 16 | 호스트 피어 없음: `cudoc-nextra`는 remark 플러그인 모음입니다 |
| VitePress  | VitePress 1.6.4                    | 같은 버전                                                                                                                                                                                                                      | 1.6.4 이상의 1.x                                                       | `vitepress` `^1.6.4`, `markdown-it` `^14.1.0`                 |
| Eleventy   | Eleventy 3.1.7                     | 같은 버전, `markdown-it-attrs` 5.0.1과 `markdown-it-anchor` 10.0.0                                                                                                                                                             | Eleventy 3.1 이상의 3.x                                                | `@11ty/eleventy` `^3.1.0`, `markdown-it` `^14.1.0`            |

네 열의 뜻은 다음과 같습니다.

- **검증한 버전**은 [실행 가능한 예제](../examples/README.md)가 잠가 둔 정확한 버전이며, 지속적 통합이 변경마다 이 버전으로 빌드하고 검사하고 각 가이드를 그대로 따라 합니다.
- **새로 설치해 확인한 조합**은 그날 새 프로젝트에서 각 가이드를 따라 한 결과이며, 호스트 패키지는 그날 시작하는 사용자와 마찬가지로 npm이 고르게 두었습니다. 이 칸에는 npm이 예제가 잠가 두지 않은 버전을 고른 경우에만 그 버전을 적었고, 실패한 경우에는 실패했다고 적은 뒤 같은 방법으로 버전을 고정해 확인한 결과 빌드되는 조합을 함께 적었습니다. 이 확인은 변경마다 반복하지 않으며, `node tests/scripts/guide-consumers.mjs --latest`로 다시 할 수 있고 `이름@버전` 인수로 버전을 고정할 수 있습니다.
- **지원 범위**는 그 안에서 생긴 문제를 cudoc의 결함으로 받아 고치는 범위입니다. 범위 안이라도 **검증한 버전**과 **새로 설치해 확인한 조합**에 없는 버전은 실행해 본 적이 없습니다.
- **선언한 피어 범위**는 지원 범위가 시작하는 버전에서 시작합니다. 따라서 어댑터가 호스트를 피어로 선언한 경우, npm은 지원하는 호스트 버전 옆에만 어댑터를 설치합니다. 사이트가 선언한 범위 안에서 호스트를 지원 버전으로 올리거나, Docusaurus 3.5에서처럼 `ERESOLVE`로 설치를 거부합니다.

다음 네 가지 구성은 지원하지 않습니다.

- **zod 4.4 이상과 함께 쓰는 Nextra 4.6.1.** Nextra 4.6.1의 `^4.1.12` 범위로는 지금 이 버전이 설치되며, 이 조합에서는 `nextra-theme-docs`가 `children`을 뺀 레이아웃 props를 검사하다가 `expected nonoptional, received undefined`로 실패하므로 cudoc 사용 여부와 관계없이 어떤 Nextra 사이트도 빌드되지 않습니다. Nextra는 이 문제를 [shuding/nextra#4989](https://github.com/shuding/nextra/issues/4989)로 관리하며, 수정은 병합되었지만 4.6.1 이후 이를 담은 릴리스가 없습니다. 자체적으로 zod를 고정한 Nextra 4.6.0을 유지하거나 zod를 4.3.6으로 고정하면 빌드되며, 두 방법 모두 [Nextra 가이드](./nextra.ko.md#1단계--설치)가 밝힌 권고를 고치기 전의 zod를 씁니다.
- **Turbopack으로 빌드하는 Nextra.** 어댑터가 Nextra에 플러그인 함수를 넘기는데 Turbopack은 이를 직렬화하지 못하므로, 사이트는 webpack으로 빌드하고 서비스합니다. Next.js 15는 기본이 webpack이고, Next.js 16은 `next dev`와 `next build`에 `--webpack`을 주지 않으면 Turbopack으로 빌드합니다.
- **VitePress 2.** vitepress.dev의 시작 안내가 설치하는 알파 버전(`vitepress@next`)입니다. `cudoc-vitepress`는 `^1.6.4`를 선언하므로 npm이 2.0 알파와 함께 설치하기를 거부합니다. VitePress 2는 페이지를 렌더링하는 방식과 include 안의 링크를 처리하는 방식을 바꾸었으며 베타에 이르면 부 버전에서 지원할 계획이므로, 그때까지는 `npm install vitepress`가 설치하는 VitePress 1로 시작합니다.
- **markdown-it 15.** npm이 기본으로 설치하는 markdown-it 버전입니다. markdown-it 어댑터는 `^14.1.0`을 선언하고, VitePress 1과 Eleventy 3은 14를 설치하며, cudoc을 15에서 실행해 본 적은 없습니다.

호스트 버전에 따라 달라지는 연동 조건은 다섯 가지이며, 호스트를 올릴 때 다시 확인해야 합니다.

- **Docusaurus.** [수집기](./docusaurus.ko.md#5단계--수집기-추가)는 공개 API가 아닌 내부 모듈 `@docusaurus/mdx-loader/lib/processor.js`에서 Docusaurus 자체 MDX 프로세서를 가져와 실행합니다. 라이브러리 로더는 webpack 규칙이며 `include`에 콘텐츠 디렉터리를 적어야 합니다.
- **Nextra.** [라이브러리 로더](./nextra.ko.md#4단계--임베드-플러그인과-라이브러리-로더-추가)는 위의 이유로 webpack 규칙입니다.
- **Next.js.** 플러그인 이름을 문자열로, 옵션을 JSON으로 쓰므로 Turbopack과 webpack 모두에서 동작하며, 두 번들러를 모두 검증합니다.
- **VitePress 개발 서버.** VitePress 1이 쓰는 Vite 5의 개발 서버에는 Windows에서 `server.fs.deny`를 우회하는 문제를 비롯한 보안 공지가 있고, 이를 고친 Vite 5 릴리스는 없으므로 개발 서버는 자기 컴퓨터나 신뢰할 수 있는 네트워크에서만 실행해야 합니다. 이 공지는 `vitepress dev`에만 해당하고 `vitepress build`가 만드는 사이트에는 해당하지 않습니다. 아직 보고되는 공지와 남겨 둔 이유는 [예제 문서](../examples/README.md#build-an-example)에 정리했습니다.
- **VitePress와 Eleventy.** 플러그인은 설정을 평가할 때 불러온 라이브러리를 계속 들고 있으므로, 다시 수집한 뒤에는 개발 서버를 재시작합니다([VitePress](./vitepress.ko.md#6단계--빌드-전마다-수집-실행), [Eleventy](./eleventy.ko.md#7단계--빌드-전마다-수집-실행)).

cudoc은 유의적 버전을 따르며, 여덟 패키지가 모두 같은 버전을 씁니다. 호환을 약속하는 범위는 [API 레퍼런스](./api-reference/README.ko.md)가 문서화한 다음 항목이며, 패키지가 export하지 않는 모듈은 처음부터 이 범위에 들지 않습니다.

- 공개 import와 그 시그니처, 옵션과 기본값
- Markdown 문법
- `cudoc`과 `cudoc-export` 명령과 플래그
- 진단 코드와 심각도
- 저장 형식
- `cudoc check --format json`과 언어 서버 메시지의 형태

레퍼런스는 현재 릴리스가 동작하는 방식도 설명하지만, 그 부분은 약속이 아닙니다. 검사가 찾아내는 문제, 메시지 문구, 보고하는 위치와 제안, 텍스트 보고서의 배치, 임계값·재시도·단계 순서 같은 처리 세부가 여기에 해당합니다. 이런 내용은 부 버전에서 바뀔 수 있고, 결함을 고치는 수 버전에서도 바뀔 수 있습니다.

- **수 버전**은 결함을 고치며 이 범위를 모두 유지합니다.
- **부 버전**은 기능, 옵션, 새로 지원하는 호스트 버전처럼 범위를 넓히되 기존 범위를 유지합니다.
- 범위의 내용을 바꾸거나 없애는 것은 **주 버전**뿐이며, 무엇을 고쳐야 하는지는 [릴리스 노트](./release-notes.ko.md)에 적습니다.

결함은 [github.com/cudoment/cudoc/issues](https://github.com/cudoment/cudoc/issues)에 보고합니다. 신고 양식은 호스트 이름·버전, cudoc 버전, 문제를 보여 주는 가장 작은 문서를 비롯한 정보를 묻습니다.

## `.md`와 `.mdx` 선택

**cudoc의 모든 기능은 두 형식에서 모두 동작합니다.** 앵커, 배지, 콜아웃, 표 셀 안의 목록은 어느 호스트에서든 어느 형식에서든 평범한 HTML 요소로 컴파일되므로, cudoc 때문에 `.mdx`가 필요한 경우는 없습니다. 기준은 직접 작성하는 콘텐츠입니다. `.mdx`는 **직접 만든 React 컴포넌트**를 넣기 위한 형식입니다.

Nextra에서만 형식에 따라 두 기능을 그리는 방식이 다릅니다. 코드 블록 제목은 `.mdx`에서만 Nextra의 코드 컴포넌트로 넘기므로 `.md` 페이지에서는 자체 제목이 없는 호스트에서처럼 블록 위에 제목을 붙여 보여 줍니다. `tabElements`로 지정한 탭 컴포넌트도 `.mdx`에서만 쓰이므로 `.md` 페이지에서는 cudoc의 탭으로 보여 줍니다.

형식은 프로젝트가 아니라 **파일마다, 확장자로** 갈립니다. 수집도 호스트와 똑같이 확장자를 읽으므로 한 디렉터리에 두 형식을 섞어 둘 수 있습니다.

| 사용 중인 사이트 | `.md` | `.mdx`                 | 결정 방식                             |
| ---------------- | ----- | ---------------------- | ------------------------------------- |
| Next.js          | 가능  | 가능                   | `@next/mdx` 옵션의 `format: "detect"` |
| Docusaurus       | 가능  | 가능                   | `markdown: { format: "detect" }`      |
| Nextra           | 가능  | 가능                   | `mdxOptions`의 `format: "detect"`     |
| VitePress        | 가능  | 불가                   | markdown-it에는 MDX 파서가 없음       |
| Eleventy         | 가능  | 불가                   | markdown-it에는 MDX 파서가 없음       |
| HTML 내보내기    | 가능  | 컴포넌트별 렌더러 필요 | 컴포넌트 이름을 해석할 등록부가 없음  |

markdown-it 계열 두 호스트는 읽지 못하는 `.mdx` 파일을 어설프게 넘기지 않습니다. 수집이 이유를 말하고 멈춥니다.

```
cudoc-vitepress: markdown-it hosts compile Markdown .md documents, not React .mdx
```

정책이 아니라 파서의 한계입니다. 그 호스트에서도 컴포넌트를 쓰는 길은 따로 있습니다. VitePress는 `.md` 안에 바로 쓴 Vue 컴포넌트를 렌더링하고, cudoc은 `badge`가 호스트 문법을 받을 때 정적인 `<Badge>`를 정규화합니다. → [VitePress](./vitepress.ko.md#vitepress에서-알아-둘-점)

### 컴포넌트를 쓰면 무엇을 감수하게 되는가

컴포넌트는 등록된 곳에서만 렌더링됩니다. 그 컴포넌트를 가진 문서 안에서는 아무 문제가 없습니다. 임베드가 그 절을 다른 문서로 복사하는 순간부터 문제가 됩니다. HTML 내보내기에는 그 이름을 찾아볼 등록부가 없기 때문입니다. [`cudoc check`](./check.ko.md#unportable-component-경고)가 이를 내보내기 시점까지 미루지 않고 검사 시점에 알려 줍니다.

그래서 지킬 기준은 하나뿐입니다. **다른 문서가 임베드하는 절만 Markdown으로 두고**, 나머지 자리에는 컴포넌트를 마음껏 쓸 수 있습니다.

## 기능 익히기

기능마다 가이드가 하나씩 있습니다.

| 가이드                           | 다루는 내용                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [Markdown 문법](./syntax.ko.md)  | 앵커, 배지, 콜아웃, 표 셀 안의 목록과 셀 병합, 표 주석, 코드 제목, 탭, 변수, 공유 링크 참조, 열 배치, 문법 모드  |
| [문서 임베드](./embedding.ko.md) | 수집, 절 선택, 요약 표, 문서 트리, 찾기·바꾸기, 갱신 규칙                                                        |
| [내보내기](./export.ko.md)       | HTML 사이트·단일 페이지·리뷰 페이지, PDF와 Word, 호스트와 함께 또는 단독으로; 사이트 구성, 하이퍼링크 정책, 자산 |
| [참조 검사](./check.ko.md)       | 문서 집합 전체에서 깨진 링크·앵커·이미지·임베드와 표, 대소문자 차이, 빠진 번역본 찾기, 편집기에서 같은 검사 실행 |
| [AST 데이터셋](./dataset.ko.md)  | 컴파일된 문서를 인덱싱이나 다른 소비자를 위한 AST JSON으로 걸러내기                                              |

## 레퍼런스와 예제

[API 레퍼런스](./api-reference/README.ko.md)는 공개 import, 시그니처, 옵션 기본값, AST 메타데이터, 저장, 컴파일러 순서를 다룹니다. [실행 가능한 예제](../examples/README.md)는 로컬에서 빌드해 볼 수 있는 실제 호스트 통합입니다.

## 다루는 범위

cudoc이 맡는 일은 Markdown 문법 정규화, 문서 간 임베드, AST 투영, HTML 생성입니다. 설정은 사이트를 만드는 쪽의 몫이고, 작성자는 평범한 Markdown과 cudoc 표기만 쓸 뿐 cudoc 컴포넌트를 가져오거나 등록하지 않습니다.

네이티브 문법은 각 가이드에 적힌 형태까지만 지원합니다. 아무 호스트 플러그인이나 동적 컴포넌트가 저절로 이식 가능해지지는 않습니다. 내용이 실행 시점 상태에 달린 컴포넌트는 임베드로도, 내보낸 HTML로도 옮겨 가지 못합니다. 링크를 실시간으로 감시하는 기능은 없습니다. 수집은 `cudoc collect --watch`로 변경마다 반복되며, [빌드와 갱신](./embedding.ko.md#빌드와-갱신)에 설명합니다.
