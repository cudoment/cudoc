# 내보내기

[English](./export.md) | **한국어** · [전체 가이드](./README.ko.md)

`cudoc-export`는 수집한 문서 집합 하나와 디자인 토큰 한 벌에서 HTML 사이트, 단일 HTML 페이지, 리뷰 페이지, PDF, Word를 만듭니다.

`cudoc-export`는 기존 사이트 옆에 더하는 선택적 출력이며, cudoc의 Markdown 문법 확장과 문서 임베드로 쓴 문서를 내보냅니다. Next.js, Docusaurus, Nextra, VitePress, Eleventy를 기본 문서 호스트로 유지하고, 같은 수집 문서와 준비된 임베드 위에서 `cudoc-export`를 함께 실행합니다. 별도 문서 사본도, 호스트 교체도 필요 없습니다. 다른 호스트 없이 단독으로도 실행되며, 애플리케이션 구조 없이 출력물을 정적 서버에 배포하거나 디스크에서 바로 엽니다.

## 빈 디렉터리에서 첫 사이트 만들기

명령 두 번과 문서 두 개면 사이트 하나가 완성됩니다. 필요한 것은 Node.js 22 이상과 npm뿐이며, 사이트도 프레임워크도 설정 파일도 필요 없습니다.

```sh
npm install @cudoment/cudoc cudoc-export
```

문서 두 개를 만듭니다. 공유할 사실은 `docs/reference.md` 한 곳에 둡니다.

```md
# 레퍼런스

## 한도 (#limits)

분당 100회까지 요청할 수 있습니다.

## 인증 (#authentication)

요청마다 액세스 토큰을 함께 보냅니다.
```

`docs/index.md`는 그 내용을 다시 적는 대신 가져다 씁니다.

````md
# 제품 가이드

> [!NOTE] 이 가이드에 대하여
> 아래 표는 레퍼런스 문서에서 만들어집니다.

```cudoc-embed
sources: [reference.md]
select: { depth: 2 }
render: { type: table }
```
````

빌드합니다.

```sh
npx cudoc-export build docs --out-dir site
```

`site/index.html`은 내비게이션과 제목 목차를 갖춘 사이트이며, 요약 표의 각 행은 `reference.html`의 해당 절로 이어집니다. 생성기가 문서를 수집하고 임베드를 처리해 HTML, 스타일, 로컬 자산을 썼고, 콜아웃, 가로로 스크롤되는 표, 코드 강조가 함께 들어갑니다. 문서를 고치고 같은 명령을 한 번 더 실행하면 그 문서를 가져다 쓰는 페이지가 전부 따라 바뀝니다.

`site/` 디렉터리를 통째로 건네거나 아무 정적 호스트에나 올릴 수 있습니다. 출력물에는 서버도 번들러도 CDN도 필요 없으므로 `file://`로 열어도 URL로 열 때와 똑같이 동작합니다. 페이지 하나를 파일 하나로 보내려면 `mode: "standalone"`으로 씁니다. → [HTML의 세 가지 형태](#html의-세-가지-형태)

## 완성 예시

저장소에 커밋된 완성 내보내기 결과가 아래 옵션 하나하나를 산출물로 보여 줍니다. 문서는 가상의 날씨 API를 다루는 여섯 개짜리 핸드북으로 [`examples/export/showcase/`](../examples/export/showcase/)에 있으며, 영어로 썼고 그중 두 개에는 한국어 번역이 있습니다. `examples/export` 안에서 `npm run showcase`를 실행하면 이 문서들을 네 가지 형태로 만듭니다.

| 출력                                                                              | 설정                                                                | 보여 주는 것                                                                                                                                                                       |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`showcase-output/`](../examples/export/showcase-output/index.html)               | [`showcase.config.mjs`](../examples/export/showcase.config.mjs)     | 사이트: [내비게이션 파일](../examples/export/showcase/nav.yml), 영어와 한국어, 헤더 링크, 사이트 고유 스타일시트, 테마 메뉴. 한 권으로 묶은 PDF·Word와 문서별 파일도 함께 있습니다 |
| [`standalone-output/`](../examples/export/standalone-output/getting-started.html) | [`standalone.config.mjs`](../examples/export/standalone.config.mjs) | 스타일, 그림, 테마 메뉴를 각자 품은 단일 파일 페이지 두 개. 링크는 게시된 사이트를 가리킵니다                                                                                      |
| [`annotate-output/`](../examples/export/annotate-output/getting-started.html)     | [`annotate.config.mjs`](../examples/export/annotate.config.mjs)     | 리뷰를 받으려고 보내는 페이지 하나. 메모 런타임이 페이지 안에 들어 있습니다                                                                                                        |
| [`review-output/`](../examples/export/review-output/)                             | [`review.config.mjs`](../examples/export/review.config.mjs)         | 정적 호스트에 올리도록 메모 런타임을 페이지 옆에 둔 사이트. GitHub [이슈 양식](../examples/export/review/cudoc-review.yml)으로 메모를 받습니다                                     |

[`review-samples/`](../examples/export/review-samples/)에는 리뷰용 페이지에서 독자가 돌려준 메모와, `cudoc-export annotations`가 그 메모로 만든 [보고서](../examples/export/review-samples/report.md)가 있습니다. [문서 사이트](https://cudoment.github.io/cudoc/index.ko.html)가 앞의 세 가지를 `showcase/`, `samples/standalone/`, `samples/annotate/` 아래에 게시하므로, 저장소를 받지 않아도 브라우저에서 열어 볼 수 있습니다.

스물여덟 쪽짜리 묶음 파일은 [`northlight-handbook.pdf`](../examples/export/showcase-output/northlight-handbook.pdf)로, 같은 묶음의 Word 판은 [`northlight-handbook.docx`](../examples/export/showcase-output/northlight-handbook.docx)로, 문서 하나만 내보낸 결과는 [`getting-started.pdf`](../examples/export/showcase-output/getting-started.pdf)나 [`getting-started.docx`](../examples/export/showcase-output/getting-started.docx)로 바로 열 수 있습니다.

예시를 이루는 것은 다음과 같습니다.

- **문서**는 작성자가 Markdown으로 쓸 수 있는 것만 사용합니다. 명시적 앵커, 배지, 등록한 `success` 타입을 포함한 콜아웃, 긴 열을 나누는 배치 규칙이 붙은 표 셀 안의 목록, 각 엔드포인트의 메서드와 경로를 레퍼런스에서 읽어 개요 페이지의 요약 표로 만드는 임베드, `replace`로 문맥에 맞게 고쳐 쓴 임베드 절이 들어 있습니다. 각주, 이미지, `curl`·Node.js·Python·HTTP·SQL로 쓴 요청·응답 예시, 열이 일곱인 표, 부록 앞의 `cudoc-pagebreak` 펜스도 들어 있습니다.
- **사이트 설정**은 세 형식을 두 단위로 모두 내보내고, 표지 이미지, 쪽 번호가 붙은 목차, 고정된 `date`를 넣은 머리글·바닥글을 켭니다. 링크 주소 인쇄, 열이 여섯 이상인 표의 가로 쪽, 설명 열과 날짜 열의 최소 폭, 테마 메뉴도 켜고, `tokens`로 세 산출물 모두에 닿는 강조색을 지정합니다.
- **나머지 세 설정**은 사이트 설정을 가져와서 각 모드에 필요한 부분만 바꿉니다.

`tests/scripts/export-showcase.mjs`가 네 가지를 모두 다시 만들고, 커밋된 텍스트 산출물이 현재 패키지의 결과와 다르면 실패하므로 어느 예시도 릴리스보다 뒤처지지 않습니다.

## HTML의 세 가지 형태

`mode`(또는 `--mode`)가 HTML 출력의 형태를 정합니다.

| `mode`          | 쓰는 것                                                                                              | 용도                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `site` (기본값) | 게시하는 모든 페이지. `cudoc.css`와 내비게이션을 함께 쓰고, 홈 페이지와 인쇄용 HTML이 붙습니다       | 통째로 배포하거나 건네줄 디렉터리                                                           |
| `standalone`    | 문서마다 HTML 파일 하나. 각 파일이 보여 주는 것을 모두 품습니다                                      | 메시지에 첨부하거나 어느 폴더에서든 열 페이지                                               |
| `annotate`      | 리뷰 메모 런타임을 실은 페이지. 기본값은 단일 파일이고, `annotate.target: "hosted"`이면 사이트입니다 | 메모가 저자에게 돌아오는 리뷰. [피드백 받기](#내보낸-사이트에서-피드백-받기)에서 설명합니다 |

단일 페이지는 `standalone`이 쓰고 `annotate`도 기본값으로 쓰는 형태이며, 주변 사이트 없이 문서 하나만 담습니다. 내비게이션, 홈 링크, 언어 메뉴가 없습니다. PDF와 Word는 `formats`에 요청하면 어느 모드에서든 씁니다.

`documents`(또는 반복하는 `--document`)는 단일 페이지 실행에서 쓸 문서를 ID나 파일 이름으로 고르며, 사이트가 게시하는 문서 중에서만 고를 수 있습니다. 지정하지 않으면 게시하는 문서마다 페이지를 씁니다. 사이트는 게시하는 페이지를 모두 쓰므로 사이트에서 `documents`를 지정하면 오류입니다.

```sh
npx cudoc-export build docs --out-dir out --mode standalone --document guide.md
```

### 단일 페이지가 품는 것

단일 페이지는 보여 주는 것을 모두 안에 품으므로, 내려받기 폴더에서 열든 채팅 첨부로 받든 다른 컴퓨터에서 열든 똑같이 보입니다.

| 문서에 있는 것                                                                                                                                                | 페이지에 들어가는 형태                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 기본 스타일시트, `css` 파일, `tokens`                                                                                                                         | `<style>` 요소 하나                                                                                                                                  |
| 로컬 이미지, `srcset`의 각 후보, 동영상 포스터, SVG `<image>`, `css` 파일이 불러오는 이미지와 글꼴                                                            | `data:` URL                                                                                                                                          |
| 테마 메뉴와 리뷰 메모 런타임                                                                                                                                  | 인라인 `<script>`와 `<style>` 요소                                                                                                                   |
| 다른 문서로 가는 링크                                                                                                                                         | 그대로 둡니다. 같은 실행에서 그 페이지도 쓰지 않으면 옆에 필요한 페이지로 보고하며, `links: "host"`에서는 배포된 페이지를 가리키고 보고하지 않습니다 |
| PDF처럼 다른 로컬 파일로 가는 링크                                                                                                                            | 파일을 페이지 옆에 복사하고 보고합니다                                                                                                               |
| 원격 이미지처럼 다른 서버에 있는 자원                                                                                                                         | 쓴 그대로 두고 보고합니다                                                                                                                            |
| 다른 서버의 스타일시트, `css` 파일의 `@import`나 원격 `url()`, 이미지도 글꼴도 아닌 로컬 자원, `<object>`·`<use>`·`<iframe>`·미디어 소스가 불러오는 로컬 자원 | 거부합니다                                                                                                                                           |

실행하면 각 페이지가 밖에서 필요로 하는 것을 표준 오류에 출력하고, 같은 목록을 `dependencies`로 돌려줍니다.

```text
cudoc-export: guide: needs a file beside it: spec.pdf
cudoc-export: guide: needs a page beside it: reference.md
cudoc-export: guide: needs a remote resource: https://example.com/diagram.png
```

`strict: true`(또는 `--strict`)를 지정하면 이 중 하나라도 있을 때 오류가 납니다. 다른 파일 없이 혼자 열려야 하는 페이지라면 이 옵션을 켭니다. 인라인으로 쓴 크기가 `standalone.maxAssetBytes`(기본값 5 MiB)보다 큰 자원이나 `standalone.maxPageBytes`(20 MiB)보다 큰 페이지는 빌드를 멈춥니다. 그래서 페이지가 빨리 열리고, 메모를 담아 다시 저장할 수 있을 만큼 작게 유지됩니다.

## 기존 사이트와 함께 생성

내보내기는 호스트의 수집기가 쓴 라이브러리를 읽으므로, 사이트와 내보내기가 수집 결과 하나를 공유합니다. 먼저 [호스트 가이드](./README.ko.md#사이트에-설치하기)의 수집기를 실행합니다. 수집기가 실제 호스트 컴파일러의 결과를 수집하고 임베드를 준비합니다. 그다음 해당 프로젝트에 `cudoc-export`를 설치하고 `site.config.mjs`를 작성합니다.

```js
export default {
  sourceRoot: "docs", // Nextra 가이드에서는 "content"
  library: ".cudoc/documents",
  outDir: "shared-html",
  title: "제품 문서",
  links: "host",
  hostUrl: "https://docs.example.com/project/",
  assetDirs: ["public"], // Docusaurus는 주로 "static" 사용
}
```

```sh
npm run collect
npx cudoc-export build --config site.config.mjs
```

수집 이후에는 호스트 빌드와 내보내기가 모두 수집 결과를 읽으며, 어느 순서로 실행해도 됩니다. `library`는 저장된 AST, 호스트의 제목 ID, 문서 경로, 준비된 임베드를 재사용하며 비동기 호스트에서 컴파일한 치환 결과도 포함하고, 라이브러리를 다시 만들거나 수정하지 않고 읽기만 합니다. 기본 사이트와 내보내기의 출력 디렉터리는 분리합니다.

문법, 컴포넌트 매핑, 컴파일러 설정은 수집기에 두고, `library`를 지정한 이 설정에는 중복 지정하지 않습니다. 문서·경로·컴파일러 설정을 바꾸면 다시 수집하고 임베드를 준비합니다. 내보내기는 저장하지 않았거나 방금 고친 원본이 아니라 수집된 스냅샷을 읽습니다. 임베드 없는 문서는 준비 파일이 없어도 되지만 임베드가 있으면 준비 파일이 필요합니다.

수집 후 명령 하나로도 실행할 수 있습니다.

```sh
npx cudoc-export build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/ --asset-dir public
```

## PDF와 Word

같은 수집 문서를 호출 한 번으로 PDF와 Word로도 내보냅니다.

```js
import { buildExport } from "cudoc-export"

await buildExport({
  sourceRoot: "docs",
  outDir: "out",
  title: "제품 문서",
  formats: ["html", "pdf", "docx"],
  granularity: "both",
})
```

명령줄에서도 같습니다.

```sh
npx cudoc-export build docs --out-dir out \
  --format html --format pdf --format docx --granularity both
```

모든 실행이 HTML 출력을 쓰므로 `formats`는 거기에 더할 형식, 곧 `pdf`, `docx` 또는 둘 다를 정합니다. 기본값 `["html"]`은 `buildSite`가 쓰는 것을 쓰며, 다른 형식과 함께 적은 `"html"`은 아무것도 바꾸지 않습니다.

`granularity`가 한 번 실행에서 무엇을 만들지 정합니다. `documents`는 문서마다 파일 하나를, `volume`은 모든 문서를 내비게이션 순서로 담은 파일 하나를 쓰고, `both`는 둘 다 씁니다. 두 가지가 모두 있는 이유는 문서 사이를 잇는 링크가 한 권으로 묶은 파일 안에서만 해석되기 때문이며, 문서별 출력에서는 옆 파일을 가리킵니다.

모든 형식이 같은 디자인 토큰을 읽습니다. 그래서 PDF는 두 번째 디자인이 아니라 사이트 스타일시트를 인쇄한 결과이고, Word는 같은 팔레트, 글자 크기 단계, 간격을 Word 스타일로 번역해 받습니다. 콜아웃은 세 형식에서 모두 같은 색입니다. `WARNING`은 경고 색, `CAUTION`과 등록한 `danger`·`error` 타입은 위험 색, 그 밖의 타입은 강조색입니다. `tokens`의 키는 [어댑터 레퍼런스](./api-reference/adapters.ko.md#내보내기)에 있습니다.

### 한 권으로 묶은 파일

묶은 파일은 제목을 실은 표지로 시작하고, 문서마다 시작 쪽을 적은 목차가 이어지며, 그 뒤에 문서들이 각각 새 쪽에서 시작합니다. 기본 언어의 문서가 내비게이션 순서로 오고, 이어서 `hidden` 문서가 옵니다. `volume.order`는 지정한 문서를 그 순서대로 맨 앞으로 옮깁니다. `volume`이 파일 이름과 이 앞부분을 정합니다.

```js
await buildExport({
  sourceRoot: "docs",
  outDir: "out",
  formats: ["pdf", "docx"],
  granularity: "volume",
  volume: {
    fileName: "handbook", // handbook.pdf, handbook.docx, handbook.print.html
    cover: { image: "design/cover.png" }, // false면 표지를 만들지 않습니다
    contents: { title: "목차", pageNumbers: true }, // false면 목차를 만들지 않습니다
    order: ["overview.md"], // 맨 앞에 두고, 나머지는 내비게이션 순서를 따릅니다
  },
})
```

`cover.image`는 로컬 PNG, JPEG, GIF, BMP 파일이며 제목 뒤에서 쪽의 내용 상자를 가득 채워 인쇄됩니다. 제목은 종이색 띠 위에 놓이므로 어떤 그림 위에서도 읽힙니다. Word가 담을 수 없으므로 SVG는 거부합니다.

PDF의 목차 쪽 번호는 문서를 각각 인쇄해서 측정한 정확한 값입니다. Word의 목차는 살아 있는 목차 필드여서 Word가 문서를 열 때 필드를 갱신하면 채워지고, 그 전까지 다른 뷰어는 쪽 번호 없이 제목만 보여 줍니다. `contents.pageNumbers: false`는 측정용 인쇄와 쪽 번호 열을 두 형식 모두에서 생략합니다.

### 쪽

용지는 A4 세로에 여백 20mm(아래쪽은 22mm)가 기본이며, 쪽을 나누는 형식은 모두 같은 `page` 옵션을 읽습니다.

```js
await buildExport({
  sourceRoot: "docs",
  outDir: "out",
  formats: ["pdf", "docx"],
  page: {
    paper: "Letter",
    margin: { top: "25mm" },
    header: "{title}",
    footer: { left: "{date}", right: "{page} / {pages}" },
    date: "2026-09-16",
    breakBefore: 1,
    linkUrls: true,
  },
})
```

길이에는 `mm`, `cm`, `in`, `pt`, `px`를 쓸 수 있고 단위 없는 수는 밀리미터입니다. 모든 길이를 한 번에 밀리미터로 바꾸므로 PDF와 Word가 같은 쪽을 배치합니다.

`header`와 `footer`는 PDF가 여백에 인쇄하고 Word 파일이 머리글과 바닥글로 갖는 러닝 라인입니다. `{page}`, `{pages}`, `{title}`, `{date}`를 쓸 수 있고, 가운데에 놓는 문자열 하나로 주거나 `left`, `center`, `right` 자리로 나눠 줄 수 있으며, `false`면 인쇄하지 않습니다. `{date}`는 `page.date`로 직접 준 날짜만 출력합니다. cudoc는 시계를 읽지 않으므로 같은 입력이 언제나 같은 결과를 냅니다.

러닝 라인에는 제한이 둘 있습니다. 15mm보다 좁은 여백에는 러닝 라인이 들어가지 않으므로, 잘린 머리글을 내는 대신 오류로 알립니다. 현재 절 이름을 보여 주는 러닝 헤더는 Chrome이 그 CSS 기능을 구현하지 않아 만들 수 없으므로, 문서별 파일의 헤더는 그 문서 제목이고 한 권으로 묶은 파일의 헤더는 묶음 제목입니다.

나머지 `page` 옵션은 쪽 나누기, 주소 인쇄, 넓은 표를 정합니다.

- `breakBefore: 1`은 1수준 제목 앞에서, `2`는 2수준 제목 앞에서도 새 쪽을 시작하며 `3`까지 지정할 수 있습니다. 묶은 파일에서 문서는 이미 새 쪽에서 시작합니다.
- `linkUrls: true`는 종이로 읽는 독자를 위해 외부 링크의 주소를 링크 글자 뒤에 인쇄합니다.
- `authoredBreaks: false`는 쪽을 나누는 출력이 ` ```cudoc-pagebreak ` 펜스를 무시하게 합니다. 저자가 다른 용지 크기를 기준으로 나누기를 넣어 둔 경우에 씁니다.
- `wideTables: { minColumns: 6 }`은 열이 그 수 이상인 모든 표를 PDF와 Word에서 똑같이 가로 쪽 하나에 따로 놓습니다. 지정하지 않으면 넓은 표는 세로 쪽의 폭에 맞춰 줄어듭니다. 문서의 맨 첫 블록인 표와 다른 표의 셀 안에 있는 표는 세로 쪽에 그대로 남습니다.
- 가로 쪽을 따로 받는 표 바로 앞이나 뒤의 `cudoc-pagebreak` 펜스는 그 쪽이 이미 거기서 시작하고 끝나므로 버리고, 문서를 여는 펜스도 문서가 이미 새 쪽에서 시작하므로 버립니다. 다른 자리의 나누기는 그대로 남습니다.

### PDF를 만드는 방식

사이트는 브라우저 설치 여부와 무관하게 인쇄용 HTML을 항상 씁니다. 페이지 옆에 `<문서>.print.html`과 `<묶음>.print.html`이 놓이고 `cudoc-print.css`가 함께 생기며, 단일 페이지는 PDF를 요청했을 때만 인쇄용 HTML을 씁니다. 이 파일은 직접 열어서 인쇄할 수 있습니다. `pdf`를 요청하면 cudoc이 그 파일들을 헤드리스 Chromium으로 한 브라우저 세션에서 인쇄합니다.

브라우저는 패키지와 함께 설치되며, 전체 브라우저 묶음이 아니라 187MB짜리 헤드리스 셸 하나만 받습니다. 설치 때 내려받지 않게 하려면 `CUDOC_SKIP_BROWSER_DOWNLOAD=1`을 지정합니다(빈 값, `0`, 소문자 그대로의 `false`가 아닌 값이면 건너뛰며 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`도 같습니다). 나중에 설치하려면 `npx cudoc-export install-browser`를 실행합니다.

npm 12 이상은 프로젝트가 승인한 의존성의 설치 스크립트만 실행하므로, 그 환경에서는 `npm install-scripts approve cudoc-export`를 실행하고 다시 설치하거나, 어느 경우에나 동작하는 `npx cudoc-export install-browser`를 씁니다. 브라우저 없이 PDF를 요청하면 그 설치 명령을 알리는 오류로 끝나며, 그 실행은 아무것도 쓰지 않고 이전 출력이 그대로 남습니다. `pdf`를 빼고 실행하면 인쇄용 HTML을 쓰므로 직접 인쇄할 수 있습니다. 이미 설치된 브라우저를 쓰려면 그 경로를 `pdf.executablePath`로 지정합니다.

### 쪽을 나누는 출력의 링크

[하이퍼링크 동작 선택](#하이퍼링크-동작-선택)의 링크 정책은 인쇄용 HTML, PDF, Word 파일에도 사이트와 똑같이 적용되며, 형식마다 같은 대상을 자기 방식으로 적습니다.

| 링크                   | 묶은 파일                    | 문서별 파일, `relative`                              | `host`            | `none` |
| ---------------------- | ---------------------------- | ---------------------------------------------------- | ----------------- | ------ |
| 내보낸 다른 문서       | 파일 안에서 이동             | 옆 파일 `<id>.pdf` 또는 `<id>.docx`, 프래그먼트 없이 | 배포된 페이지 URL | 제거   |
| 같은 문서의 프래그먼트 | 파일 안에서 이동             | 파일 안에서 이동                                     | 파일 안에서 이동  | 제거   |
| `private` 문서         | `host`이면 배포된 페이지 URL | 거부: 그 페이지가 어느 출력에도 없음                 | 배포된 페이지 URL | 제거   |
| 외부 URL               | 유지                         | 유지                                                 | 유지              | 제거   |

한 권으로 묶은 파일에 들지 않는 게시 문서, 곧 번역본이나 내비게이션이 빼 둔 홈으로 가는 링크는 그 사이트 페이지를, `host`에서는 배포된 페이지를 가리킵니다. 문서별 파일이 프래그먼트를 버리는 이유는 PDF 뷰어도 Word도 다른 파일 안의 제목을 안정적으로 가리키지 못하기 때문입니다. 프래그먼트는 `host`를 포함한 모든 정책에서 파일 안에 머무릅니다. 종이 위에서 그 대상은 웹사이트가 아니라 뒷쪽입니다.

`host`와 `linkUrls: true`를 함께 쓰면 묶은 파일에서 다른 문서로 가는 링크도 그 문서 자체의 PDF처럼 PDF에서 글자 뒤에 배포 주소를 인쇄합니다. 그래서 각 문서가 묶은 파일에서도 단독일 때와 같은 쪽수를 차지하고 목차의 번호가 맞습니다.

### Word가 담는 것과 담지 못하는 것

Word 문서는 이름 붙은 스타일로만 꾸밉니다. 제목, 본문, 인용, 코드, 표, 캡션, 각주, 머리글·바닥글, 표지, 목차, 그리고 콜아웃 타입마다 각자의 스타일이 있습니다. 본문의 어떤 요소도 색, 글꼴, 크기, 음영, 테두리를 직접 갖지 않습니다. 그래서 받는 사람이 Word의 스타일 창에서 문서 전체 디자인을 바꿀 수 있고, 전달받은 문서를 자기 조직의 양식에 맞출 수 있습니다.

예외는 표의 셀 하나입니다. OOXML은 구분선과 음영을 셀 속성에 두므로, 표는 사이트와 같이 머리글 아래 구분선, 행 사이의 연한 구분선, 본문 행 하나 건너 음영, 세로선 없음으로 표현합니다. 격자는 내용 폭 전체를 열에 고르게 나누며, 머리글이 최소 폭을 요구하는 열만 그 폭을 지킵니다. 그래서 Pages나 Quick Look처럼 격자로 표를 배치하는 뷰어에서도 표가 Word에서와 같은 폭으로 보입니다.

문서의 각 부분이 Word에서 무엇이 되고 무엇을 버리는지는 다음과 같습니다.

| 문서에 있는 것                                    | Word에서                                                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 제목                                              | Word 자체의 제목 스타일이 되어 탐색 창과 목차 필드가 동작합니다                                                             |
| 각주                                              | Word 각주가 됩니다. Word 각주는 문단만 담으므로 각주 안의 표는 버리고 `dropped-footnote-table`로 알립니다                   |
| 참조형 링크                                       | 정의를 따라 해석합니다                                                                                                      |
| 최상위 번호 목록                                  | 시작 번호를 유지합니다                                                                                                      |
| 작업 목록 항목                                    | ☑ 또는 ☐로 시작합니다                                                                                                       |
| MDX 문서에서 HTML로 쓴 표                         | 행과 열 병합을 유지합니다                                                                                                   |
| 표 셀 안의 `<br>`                                 | `.md`와 MDX 모두에서 줄바꿈이 됩니다                                                                                        |
| `.md` 문서의 그 밖의 raw HTML(HTML 표 포함)       | 버리고 `dropped-html`로 알립니다                                                                                            |
| `<details>`                                       | 펼친 상태로 나갑니다                                                                                                        |
| 트리 임베드                                       | `print` 단계까지의 중첩 목록이 됩니다                                                                                       |
| SVG 이미지                                        | 대체 텍스트가 되고 `image-as-text`로 알립니다. `docx`가 래스터 대체본을 요구하는데 cudoc에는 래스터라이저가 없기 때문입니다 |
| `javascript:`, `vbscript:`, `data:`, `file:` 링크 | 글자만 남기고 링크는 버리며 `unsafe-link`로 알립니다                                                                        |
| 정규화를 거치고도 남은 컴포넌트                   | HTML 출력이 렌더러 없는 컴포넌트를 거부하듯 거부합니다. 단, `docx.components`에 Word 렌더러를 지정하면 그것을 씁니다        |

버릴 때마다 결과의 `diagnostics`와 CLI의 표준 오류에 문서 이름과 함께 알립니다.

사이트 디자인 가운데 다음 네 가지는 Word로 건너가지 못하며, 비슷하게 흉내 내지 않고 그대로 버립니다.

- 둥근 모서리: OOXML 테두리는 직각뿐입니다.
- 읽기 폭 제한: 페이지 여백으로 한 번만 표현합니다.
- 다크 테마: `.docx`는 테마 한 벌만 담습니다.
- CSS 폰트 스택: Word는 문자 체계마다 글꼴 하나만 쓰므로 `tokens.word`의 글꼴(기본값은 Windows와 macOS의 Office가 모두 설치하는 Calibri, Consolas, Malgun Gothic)을 씁니다. 그래서 Word가 없는 웹 폰트를 임의로 바꿔 넣는 대신 지정한 글꼴로 열립니다.

`tokens.word`는 양식의 간격도 갖습니다. 문단 뒤·제목 앞·블록 앞뒤·목록 항목 뒤 간격, 목록·인용 들여쓰기, 상자·셀의 안쪽 여백이 각각 키 하나입니다. 그래서 Word에서 문서가 지나치게 헐겁거나 빽빽하면 사이트를 건드리지 않고 조정할 수 있습니다. 키와 기본값, 각 키가 적용되는 자리는 [Word 양식](./api-reference/adapters.ko.md#word-양식)에 정리되어 있습니다.

`css` 옵션은 HTML 페이지에만 닿습니다. 인쇄용 HTML과 그것으로 만드는 PDF는 `tokens`로 스타일을 정하고 Word는 CSS를 읽지 않으므로, 형식을 가로질러 유지해야 하는 것은 `tokens`로 지정합니다.

Word 작성기에만 해당하는 선택 세 가지는 `docx` 아래에 둡니다.

```js
import { Paragraph, TextRun } from "docx"

await buildExport({
  sourceRoot: "docs",
  outDir: "out",
  formats: ["docx"],
  docx: {
    rawHtml: "text", // raw HTML을 버리지 않고 코드 블록으로 남깁니다
    calloutStyle: "table", // 콜아웃을 음영 있는 셀 하나에 담습니다
    components: {
      ProductMark: () => [new TextRun({ text: "Product", bold: true })],
      Steps: (node) => [new Paragraph({ text: `${node.children.length}단계` })],
    },
  },
})
```

`rawHtml: "text"`는 HTML 소스를 코드 블록으로 쓰고, 각 경우를 `dropped-html` 대신 `html-as-text`로 보고합니다. `calloutStyle: "table"`은 사이트의 상자에 더 가깝지만, 색조와 선이 이름 붙은 스타일이 아니라 셀 자체의 속성에 들어가는 대가가 있습니다.

컴포넌트 렌더러는 노드를 받아 `docx` 객체를 돌려줍니다. 컴포넌트가 블록 자리에 있으면 문단과 표를, 글 안에 있으면 런을 돌려주며, 인라인 자리에서 문단을 돌려주면 오류입니다. [자산과 사용자 컴포넌트](#자산과-사용자-컴포넌트)의 `renderOptions.components`에 대응하는 Word 쪽 짝입니다.

## 하이퍼링크 동작 선택

`links`(또는 `--links`)가 출력의 모든 하이퍼링크를 어떻게 처리할지 정하며, 정책은 세 가지 중 하나입니다.

| `links` / `--links` | 동작                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `relative` (기본값) | 문서를 로컬 `.html` 파일로 연결하고 로컬 링크 파일을 복사합니다. 외부 URL은 유지합니다.                                                     |
| `host`              | 내부 하이퍼링크를 기본 사이트의 배포 경로로 연결합니다. HTTPS, `mailto:` 같은 외부 URL은 유지합니다. `hostUrl` / `--host-url`이 필수입니다. |
| `none`              | 외부 URL을 포함한 모든 하이퍼링크를 제거하고 텍스트·중첩 서식·이미지는 유지합니다.                                                          |

이 정책은 작성한 링크, raw HTML, 임베드한 절과 표, 생성된 내비게이션·각주에 모두 적용합니다. 페이지 옆의 목차는 `relative`와 `host`에서 페이지 안을 가리키며, `none`은 다른 링크와 같이 목차 링크도 제거합니다. 로컬 이미지와 스타일은 모든 정책에서 유지합니다. `none`은 클릭 가능한 앵커를 제거할 뿐 스타일시트의 `<link>` 같은 렌더링 자원은 두며, 제거한 하이퍼링크에서만 참조하는 파일은 복사하지 않습니다.

출력에 없는 대상은 정책마다 다음과 같이 처리하며, 빌드를 멈출 때는 그 자원과 자원을 담은 문서를 알립니다.

| 대상                                                                                                                                 | `relative`                                         | `host`                                                  | `none`                       |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------- | ---------------------------- |
| 모든 수집 루트와 모든 `assetDirs` 루트를 벗어나서 복사해 올 곳이 없는 로컬 이미지, 스타일시트, 그 밖의 렌더링 자원                   | 빌드를 멈춥니다                                    | 빌드를 멈춥니다                                         | 빌드를 멈춥니다              |
| 그런 파일로 가는 하이퍼링크                                                                                                          | 파일을 복사해야 하므로 빌드를 멈춥니다             | 다른 로컬 경로처럼 배포 주소를 기준으로 해석합니다      | 제거합니다                   |
| 같은 도메인에서 다른 애플리케이션이 담당하는 `/sdk/js/start` 같은 경로로, `externalPaths`(또는 반복하는 `--external-path`)에 적은 것 | 쓴 그대로 둡니다                                   | 쓴 그대로 둡니다                                        | 다른 외부 URL처럼 제거합니다 |
| `private`로 수집한 문서로 가는 링크                                                                                                  | 오류입니다. 그 페이지가 출력에 없기 때문입니다     | 묶은 파일을 포함한 모든 출력에서 배포 주소를 가리킵니다 | 다른 링크처럼 제거합니다     |
| 루트, `assetDirs` 디렉터리, 심볼릭 링크를 거쳐 비공개 문서의 파일에 닿는 이미지나 `<iframe src>` 같은 자원                           | 자원은 세 정책 모두에서 복사하므로 빌드를 멈춥니다 | 빌드를 멈춥니다                                         | 빌드를 멈춥니다              |

`host`에서는 `hostUrl`에 기본 경로까지 포함한 전체 배포 URL을 지정합니다. `hostUrl`이 `https://docs.example.com/project/`이고 수집된 문서 경로가 `/docs/start`이면 `start.md#setup`과 `/docs/start#setup` 모두 `https://docs.example.com/project/docs/start#setup`이 되고, 이미 기본 경로가 포함된 문서 경로에는 `/project/`를 중복 추가하지 않습니다. 쿼리와 프래그먼트는 유지하고, 프래그먼트만 있는 링크는 배포된 현재 문서를 가리키며, 그 밖의 로컬 경로는 배포 URL과 현재 문서 경로를 기준으로 해석합니다.

소스 파일처럼 수집하지 않은 파일로 가는 링크는 `sourceLinks`를 지정하면 `relative`와 `host` 모두에서 저장소의 그 파일을 엽니다. → [문서가 아닌 파일](#문서가-아닌-파일)

커스텀 slug와 문서 경로는 수집기에서 기본 사이트의 URL에 맞춥니다. HTML 내보내기는 호스트 설정에서 라우팅을 추론하지 않습니다. `links`는 내보낸 하이퍼링크의 동작이며 수집 단계의 문법 정규화 옵션인 `syntax.link`와 별개입니다.

## 사이트 설정

`site.config.mjs`를 작성합니다.

```js
export default {
  sourceRoot: "docs",
  outDir: "site",
  title: "제품 문서",
  navigation: "docs/nav.yml",
  locales: { en: "English", ko: "한국어" },
  header: {
    links: [{ title: "GitHub", url: "https://github.com/owner/repo" }],
  },
  toc: { depth: 3 },
  syntax: { headingAnchor: "cudoc", callout: "cudoc" },
  links: "relative",
  // css: ["theme/brand.css"],
}
```

```sh
npx cudoc-export build --config site.config.mjs
```

설정 파일은 JSON이나 YAML(`.json`, `.yml`, `.yaml`)로도 쓸 수 있으며, ES 모듈이 필요한 것은 콜백 옵션인 `renderOptions`, `docx.components`, `extractors`뿐입니다. 설정 안의 경로는 명령을 실행한 디렉터리를 기준으로 읽고, cudoc이 모르는 옵션은 오류이므로 철자를 틀린 키가 조용히 넘어가지 않습니다. 위 설정은 Markdown을 직접 수집합니다. 기존 호스트 라이브러리를 재사용하려면 `library`를 추가하고 `syntax` 같은 수집 옵션은 제거합니다.

### 내비게이션

`navigation`은 왼쪽 목록이면서 사이트가 게시하는 범위이기도 합니다. 내비게이션에 없고 `hidden`에도 없는 문서는 어떤 형식으로도 쓰지 않으므로, 초안은 사이트에서도 PDF와 Word 파일에서도 똑같이 빠집니다. 예외는 홈 페이지 하나이며, 내비게이션에 있든 없든 게시합니다. `navigation`을 지정하지 않으면 모든 문서를 폴더별로, `index.md`를 맨 앞에 두고 나열합니다. 결과의 `omitted`가 빠진 문서와 그 이유를 알려 줍니다.

내비게이션은 YAML 파일에 쓰고 그 경로를 지정하거나, 같은 항목을 설정에 직접 씁니다.

```yaml
# docs/nav.yml
items:
  - index.md # 파일: 그 문서 하나
  - guides # 폴더: 안의 모든 문서, 하위 폴더는 그룹으로
  - folder: reference # 설정을 붙인 폴더
    title: { en: Reference, ko: 레퍼런스 }
    page: README.md # 폴더 제목을 누르면 열리는 문서
    exclude: [draft-*.md] # 이 폴더에서 뺄 문서
    order: [overview, ...] # 이것을 먼저, 나머지는 제목 순
    depth: 1 # 그룹으로 그릴 단계 수, 더 깊은 문서는 한 목록으로 나열
    collapsed: true # 그룹이 닫힌 채로 시작
  - title: Tools # 항목 묶음, 쓴 순서 그대로
    items: [cli.md, api.md]
  - title: Status # 외부 링크
    url: https://status.example.com/
hidden: # 게시하지만 목록에는 넣지 않음
  - legal/privacy.md
```

- 문서는 `guide.md`처럼 확장자까지 씁니다. 확장자가 없는 이름은 폴더이고, `.`은 컬렉션 전체입니다.
- 문서는 한 번만 나열됩니다. 문서를 직접 지정한 항목이 그 문서를 끌어올 폴더보다 우선합니다. 같은 문서를 두 번 지정하거나 `private` 문서를 지정하면 파일과 줄 번호를 알려 주는 오류가 납니다.
- 폴더 안에서는 [트리 임베드](./embedding.ko.md#어느-문서가-어디에-달리는가)와 같이 `setup.md`가 옆의 `setup/` 폴더를 대표하고, 그런 파일이 없으면 `setup/index.md`가 대표합니다. 대표하는 문서가 없는 폴더는 폴더 이름을 단 그룹이 됩니다. `README.md`는 `page`로 지정했을 때만 폴더를 대표합니다.
- 폴더의 항목은 제목 순으로 정렬합니다. `order`는 앞에 둘 이름을 나열하고 `...`은 나열하지 않은 나머지 전부를 뜻하므로, `[..., changelog]`는 이름 하나를 맨 뒤로 보냅니다.
- 아무것도 가리키지 않는 `order`나 `exclude`의 이름과 번역이 없는 문서는 결과의 `diagnostics`(`unmatched-navigation-order`, `unmatched-navigation-exclude`, `missing-translation`)와 표준 오류로 알립니다.
- 사이트가 게시하지 않는 문서로 가는 링크는 `relative` 링크에서 오류입니다. 가리키는 페이지가 존재하지 않게 되기 때문이며, 오류 메시지가 그 문서와 해결 방법을 알려 줍니다.

[예시의 내비게이션](../examples/export/showcase/nav.yml)과 [문서 사이트의 내비게이션](../docs-site/nav.yml)도 이렇게 썼습니다.

### 언어

`locales`는 문서를 쓴 언어를 기본 언어부터 나열합니다.

```js
locales: { en: "English", ko: "한국어" }
```

기본 언어의 파일에는 접미사가 없고, 다른 언어의 파일은 `.<코드>.md`로 끝납니다. 그래서 `guide.ko.md`는 `guide.md`의 한국어판입니다. 내비게이션은 기본 언어의 파일로 씁니다. 언어마다 번역본으로 자기 목록을 그리고, 번역이 없는 문서는 그 언어의 목록에서 뺍니다.

모든 페이지는 헤더의 드롭다운 메뉴에서 다른 언어로 쓴 같은 문서로 연결하고, 번역이 없으면 그 언어의 홈으로 연결합니다. 이 메뉴는 스크립트 없이 동작하며, 메뉴 밖을 누르면 닫힙니다. 페이지의 `<html lang>`은 그 언어의 코드이며, 문서의 frontmatter `lang`이 `ko-KR`처럼 코드를 더 구체적으로 지정하면 그 값을 씁니다. 파일 이름이 이미 언어를 정하므로, 다른 언어를 지정한 frontmatter는 오류입니다.

언어마다 다른 접미사와, 페이지의 조작 요소에 쓸 고유한 문구를 줄 수 있습니다. `{ ja: { label: "日本語", suffix: ".jp", ui: { documents: "ドキュメント" } } }`처럼 씁니다. cudoc에는 영어와 한국어 문구가 들어 있고, 다른 언어가 지정하지 않은 문구는 영어로 표시합니다. 키 목록은 [어댑터 레퍼런스](./api-reference/adapters.ko.md#사이트-구성)에 있습니다. 한 권으로 묶은 파일에는 기본 언어의 문서를 담고, `granularity`가 `documents`나 `both`이면 번역본은 각자 PDF와 Word 파일로 씁니다.

### 홈, 헤더, 목차

사이트는 `index.md`에서 열리거나, `home: "README.md"`처럼 `home`이 지정한 문서에서 열립니다. 그 문서는 `index.html`로, 번역본은 `index.<코드>.html`로 씁니다. 홈 문서는 모든 언어에 있어야 합니다. 다른 문서를 홈으로 지정한 상태에서 `index.md`가 함께 있으면 둘 다 `index.html`로 쓰이게 되므로 거부합니다. 둘 다 없으면 내비게이션을 나열하는 시작 페이지를 생성합니다.

`header.links`는 사이트 제목 옆에 링크를 더합니다. 각 링크의 `title`에는 내비게이션 제목처럼 언어마다 다른 글자를 지정할 수 있습니다. 오른쪽 목차는 `toc.depth`가 지정한 단계까지의 제목을 나열하며, 2부터 6까지 지정할 수 있고 기본값은 6입니다. `toc: false`는 모든 페이지에서 목차를 빼고, frontmatter의 `toc: false`는 그 페이지에서만 뺍니다. 나열할 제목이 없는 페이지에는 목차가 없으며, 홈 문서도 다른 페이지처럼 목차를 표시합니다.

### 모양

기본 스타일은 사용자의 라이트·다크 시스템 설정을 따르며, 그 동작에 스크립트가 필요하지 않고 모든 색을 두 테마가 함께 정의하는 사용자 정의 속성에 담습니다.

`themeSwitch: true`(또는 `--theme-switch`)를 켜면 헤더에 라이트와 다크를 고르는 테마 메뉴가 생깁니다. 브라우저의 기본 컨트롤이 아니라 언어 메뉴와 같은 모양의 드롭다운입니다. 사용자가 고르기 전에는 페이지가 시스템 설정을 따르고 메뉴가 그 설정이 어느 쪽인지 보여 주며, 고른 값은 브라우저가 기억합니다. 메모 런타임 외에 사이트가 읽는 cudoc의 유일한 스크립트이며, 기본 출력에는 들어가지 않습니다.

`css`에는 스타일시트 하나나 목록을 지정하며, 기본 스타일 뒤에 읽힙니다. 사이트는 각 파일을 `cudoc-css/` 아래의 별도 파일로 연결하고, 그 파일이 불러오는 이미지나 글꼴은 파일 내용에서 딴 이름으로 `cudoc-css/files/`에 복사합니다. 단일 페이지는 스타일시트의 내용과 그 파일들을 인라인으로 품습니다. 디자인을 바꾸려면 규칙을 다시 쓰지 말고 사용자 정의 속성을 재정의합니다. 전체 토큰 목록은 [어댑터 레퍼런스](./api-reference/adapters.ko.md#내보내기)에 있습니다.

```css
/* theme/brand.css, 기본 스타일 뒤에 읽힙니다 */
:root {
  --accent: #7c4dff;
  --accent-soft: #ece7fb;
  --measure: 78ch;
  --font-sans: "Inter", system-ui, sans-serif;
}
/* 독자가 themeSwitch로 라이트를 고른 페이지에는 적용하지 않습니다. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --accent: #b39dff;
    --accent-soft: #2a2244;
  }
}
/* themeSwitch를 켰다면 라이트 시스템에서 다크를 고를 수 있으므로,
   다크 값을 여기에도 반복합니다. */
:root[data-theme="dark"] {
  --accent: #b39dff;
  --accent-soft: #2a2244;
}
```

**직접 쓴 스크립트.** `scripts`에는 JavaScript 파일 하나나 목록을 지정하며, cudoc의 스크립트 다음에 읽힙니다. 사이트는 각 파일을 `cudoc-js/`에 복사해 모든 페이지의 `<body>` 끝에서 `<script defer>`로 읽고, 단일 페이지는 그 텍스트를 같은 자리에 품습니다. 모듈 스크립트는 `file://`에서 읽히지 않으므로 파일은 클래식 스크립트여야 하고, 스크립트를 읽는 페이지는 `themeSwitch`와 같은 Content-Security-Policy를 받아 플러그인, `<base>`, 폼 전송, fetch 요청을 허용하지 않습니다. 문서 페이지의 `<main>`은 `data-cudoc-document`에 문서를 밝히므로 스크립트가 어느 페이지에서 도는지 압니다. → [사용자 스크립트](./api-reference/adapters.ko.md#사용자-스크립트)

**좁은 화면에서.** 목차 열은 1024px에서 빠지고, 768px에서는 왼쪽 아래의 둥근 버튼이 사이드바를 페이지 위의 패널로 열며, 그동안 휠과 스와이프는 페이지가 아니라 패널을 스크롤합니다. 배경이나 패널의 닫기 줄을 누르면 패널이 닫히고, 다른 페이지를 열어도 닫힙니다. 버튼과 배경, 닫기 줄은 체크박스 하나의 레이블이라 어느 것도 스크립트가 필요하지 않습니다. 터치 화면에서는 접는 줄이 2.75rem 이상의 높이를 갖고, 목록의 체크박스는 한 줄에서 2.75rem을 차지하며, 넓은 표는 페이지를 넓히지 않고 안에서 스크롤합니다. → [사용자 스크립트](./api-reference/adapters.ko.md#사용자-스크립트)

### 문서가 아닌 파일

가이드는 소스 파일, 예시의 설정 파일, 예시 결과를 모아 둔 폴더처럼 페이지가 아닌 것으로 링크할 때가 많습니다. 이런 파일이 어디에 있는지는 옵션 두 개로 알려 줍니다.

```js
export default {
  roots: [{ dir: "docs", base: "docs" }],
  outDir: "site",
  sourceLinks: {
    root: ".",
    url: "https://github.com/owner/repo/blob/v1.2.0/",
  },
  mounts: [{ from: "examples/output", to: "examples" }],
}
```

`sourceLinks`는 `root` 아래에 있지만 수집하지 않은 파일로 가는 링크를, `url` 뒤에 그 파일 경로를 붙인 주소로 보냅니다. 그래서 `[CLI](../src/cli.ts#L10)`는 GitHub에서 그 커밋의 파일로 열립니다. 라이브러리의 경로를 `root` 기준으로 읽으므로, 위 예시는 문서를 `docs`라는 기준 경로 아래에 수집합니다. `relative`와 `host`에 똑같이 적용하며, 이 방법으로 `private` 문서의 파일에 링크하면 오류입니다.

`mounts`는 각 폴더를 그대로 출력에 복사하고, `from` 안으로 가는 모든 링크를 `to` 아래의 복사본으로 바꿉니다. 마운트는 `relative` 링크를 쓰는 사이트의 일부이며, 단일 페이지와 `host`·`none` 링크에서는 거부합니다. 수집 루트, 자산 디렉터리, 라이브러리, 다른 마운트와 겹치는 마운트도 거부합니다.

문서 사이트도 이렇게 소스 파일에 링크하고 내보내기 예시를 게시합니다. 문서 사이트의 [설정](../docs-site/site.config.mjs)에서 볼 수 있습니다.

## 자산과 사용자 컴포넌트

소스 기준 상대 경로 이미지는 수집 루트(`sourceRoot`, 또는 수집에 쓴 것과 같은 `roots` 목록)에서 찾습니다. `assetDirs: ["public", "static"]`(또는 반복하는 `--asset-dir`)는 URL 루트에 대응하는 자산 디렉터리를 더하므로 `/img/logo.svg`를 `public/img/logo.svg`에서 복사할 수 있고, `hostUrl`을 설정하면 `/project/img/logo.svg`처럼 배포 기본 경로가 포함된 자산 경로도 처리합니다.

참조한 로컬 이미지와 스타일은 하이퍼링크가 `host`·`none`이어도 복사한 뒤 상대 경로로 연결하며, `srcset`의 각 후보, 동영상의 `poster`, `<object>`의 `data`, 인라인 SVG의 `<image>`나 `<use>`가 가리키는 파일도 같습니다. 여러 페이지와 형식이 같은 파일을 써도 한 번만 복사합니다. 직접 작성한 외부 리소스는 외부 주소를 유지합니다.

정규화한 호스트 고유 콜아웃·제목·링크·표는 수집한 AST에서 렌더링하며, React·Vue 컴포넌트 코드를 실행하지는 않습니다. AST에 사용자 컴포넌트가 남아 있으면 ESM 설정 또는 `buildSite` API에서 HTML 콜백을 지정합니다.

```js
const renderOptions = {
  components: {
    ProductMark: () => '<strong class="product-mark">Product</strong>',
  },
}
```

이 `renderOptions`를 사이트 옵션에 추가합니다. 콜백은 HTML을 반환하며, 반환한 HTML의 링크에도 선택한 정책이 적용됩니다. 노드와 자식 인자는 [렌더링 계약](./api-reference/document.ko.md#컴포넌트와-렌더링)에 있습니다. 지원하지 않는 컴포넌트는 누락시키지 않고 오류로 보고하며, 소스 HTML과 렌더러 출력은 cudoc이 정화하지 않습니다.

## 내보낸 사이트에서 피드백 받기

`mode: "annotate"`(또는 `--mode annotate`)는 작은 리뷰 메모 런타임을 실은 페이지를 써서, 페이지를 받은 사람이 틀린 문장이나 빠진 단계를 돌려보낼 수 있게 합니다. 다른 모드에는 런타임이 실리지 않으며, 기본 출력에는 스크립트가 전혀 없습니다.

```js
export default {
  sourceRoot: "docs",
  outDir: "review",
  mode: "annotate",
  documents: ["guide.md"],
}
```

기본값에서는 문서마다 단일 페이지가 되고, 스타일을 품듯이 런타임도 품으므로 파일로 보낼 수 있습니다([단일 페이지가 품는 것](#단일-페이지가-품는-것) 참고). 독자가 정적 호스트에서 여는 리뷰라면 `annotate.target: "hosted"`로 페이지 옆에 런타임을 둔 사이트를 씁니다.

```js
export default {
  sourceRoot: "docs",
  outDir: "review-site",
  mode: "annotate",
  annotate: {
    target: "hosted",
    reviewId: "guide-review-2026-10",
    inbox: {
      github: {
        repo: "owner/docs",
        template: "cudoc-review.yml",
        field: "notes",
      },
    },
  },
}
```

이때는 `reviewId`가 필수입니다. 각 독자의 브라우저에 저장되는 이 리뷰의 메모에 붙는 이름이므로, 사이트를 다시 빌드해도 메모가 유지되고 같은 호스트의 다른 리뷰와 섞이지 않습니다. 단일 페이지는 이 값을 지정하지 않으면 제목과 문서 목록으로 이름을 만듭니다.

**받는 사람이 하는 일.** 메모는 선택 영역이나 블록에 답니다. 글자를 선택해 선택 영역 옆의 메모 버튼을 누르거나, 문단·목록 항목·표 행·코드 블록에 마우스를 올려 옆에 나타나는 `+`를 누르고 메모를 적습니다. 메모 버튼은 다른 곳을 누르거나, Escape를 누르거나, 선택을 해제하면 사라지며, 키보드에서는 Tab으로 버튼에 갈 수 있습니다.

오른쪽 아래의 말풍선 버튼이 이 페이지의 메모 개수를 보여 주고 패널을 엽니다. 패널은 메모를 인용문과 함께 나열하며, 메모는 수정·답글·해결·삭제할 수 있고, 맨 위의 이름 입력란은 선택 사항입니다. 패널은 머리에서 다른 언어를 고르지 않는 한 영어이고, 기본값으로 사이드바를 가리는 대신 본문 폭을 좁힙니다. 두 설정은 브라우저가 기억합니다.

끝나면 짧은 목록이라면 **공유 토큰 복사**를 누르고, 그렇지 않으면 _더 보기_를 열어 **메모 내려받기**(`<페이지>.annotations.json`)나 **메모 내장 사본 저장**(`<페이지>.annotated.html`)을 택합니다. 단일 페이지의 사본은 어느 폴더에서든 스타일과 메모를 갖춘 채 열리고, 호스팅 페이지의 사본은 원본과 같은 폴더에 있어야 스타일을 불러옵니다. 브라우저가 허용하면 메모는 다음 방문까지 브라우저에 남지만, Firefox는 로컬 파일에서는 허용하지 않으므로 닫기 전에 내려받아야 합니다.

**호스팅 리뷰에서 메모 보내기.** 정적 호스트는 아무것도 받을 수 없으므로, 메모는 독자가 이미 사용하는 서비스를 거쳐 전달됩니다. `inbox.github`를 지정하면 패널의 **GitHub에서 제출 작성**이 먼저 무엇을 보내는지 알려 줍니다. 메모 본문, 인용한 구절, 독자의 이름이 주소에 담겨 GitHub로 가고, 공개 저장소라면 이슈도 공개됩니다. 그다음 저장소의 새 이슈 페이지를 열어 이슈 양식의 `field`(기본값 `notes`)에 메모를 채워 두고, 독자는 그 페이지에서 이슈를 제출합니다.

예시 [이슈 양식](../examples/export/review/cudoc-review.yml)을 저장소의 `.github/ISSUE_TEMPLATE/`에 복사하고 `template`에 그 이름을 지정합니다. 메모가 주소에 담을 수 있는 6,000자를 넘으면 대신 JSON 파일로 내려받으므로, 그 파일을 이슈에 첨부합니다.

**저자가 하는 일.** 돌아온 `.json`(또는 `.annotated.html`)을 자기 사이트 사본에서 _더 보기_ 아래의 불러오기 버튼으로 읽어 들이거나, 돌아온 토큰을 자기 사본의 주소 끝에 붙입니다. 그러면 메모가 작성된 자리에 나타나고, 그 뒤 문서가 바뀌었다면 "위치 불확실"이나 "위치를 찾지 못함"으로 표시됩니다. 오는 도중 메모 부분이 손상된 사본도 열리며, 메모를 불러오지 못했다고 알리고 그 메모는 보여 주지 않습니다.

`cudoc-export annotations`는 메모를 원문 줄에 대응시키므로, 원문에서 처리할 때 씁니다.

```sh
npx cudoc-export annotations review.annotations.json --library .cudoc/documents --out review.md
```

이 명령은 Markdown 보고서를 씁니다. 메모마다 문서, 절 제목, 원문 줄 번호와 그 줄의 내용, 리뷰어의 글이 들어갑니다. 공유 토큰은 이슈에서 받은 것을 포함해 파일 대신, 또는 파일과 함께 `--token '<토큰>'`으로 넘기고, `--json`은 같은 사실을 JSON으로 냅니다. [예시로 만든 보고서](../examples/export/review-samples/report.md)에서 보고서의 형태를 볼 수 있습니다.

보고서는 사실만 적습니다. 자체 지시문이 없으므로 어시스턴트에게 보내는 자기 프롬프트 아래에 그대로 붙일 수 있고, 리뷰어의 글은 요청이 아니라 데이터로 라벨이 붙어 있습니다. 그것으로 무엇을 할지는 사용자의 프롬프트에 남습니다.

**공유 전에 알아 둘 것.** 공유하기 전과 돌아온 파일을 열기 전에 알아 둘 사실 다섯 가지입니다.

- 런타임에 네트워크 접근이 없고 페이지도 그것을 금지하므로(`connect-src 'none'`) 페이지는 아무것도 업로드하지 않으며, 밖으로 나가는 길은 독자가 직접 열어 제출하는 GitHub 페이지뿐입니다. 호스팅 배포에는 `default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'; frame-ancestors 'none'`과 같은 Content-Security-Policy 헤더를 더합니다. `style-src-attr`는 `tableColumnWidths`가 열에 쓰는 `min-width`처럼 페이지가 담은 `style` 속성을 지킵니다.
- 공유 토큰에는 메모 본문과 이름이 주소에 그대로 들어가며 패널이 그 사실을 알립니다. 로컬 파일에서는 사용자의 경로가 드러나지 않도록 `#cudoc-notes=…` 부분만 복사합니다.
- 브라우저에 저장되는 메모에는 인용한 구절이 포함됩니다.
- 돌아온 `.annotated.html`은 다른 사람이 만든 HTML 파일입니다. 코드를 실행할 수 있는 첨부 파일을 여는 것과 같이 다루거나, 대신 `.json`을 불러옵니다.
- `cudoc-embed`로 끌어온 글은 임베드한 문서의 Markdown에 없으므로 그 위의 메모는 "찾지 못함"으로 보고됩니다.

파일 형식, 앵커링 규칙, 보고서의 계약은 [어댑터 레퍼런스](./api-reference/adapters.ko.md#주석)에 있습니다.

## 공유와 배포

사이트는 디렉터리입니다. `site/index.html`을 열거나, `site/` 전체를 다른 컴퓨터에 복사하거나, 정적 호스트에 업로드합니다. 공유 디렉터리 안에서 탐색하려면 `relative`, 기본 사이트로 연결하려면 `host`, 클릭 가능한 링크 없이 읽으려면 `none`을 고르며, 스타일시트와 복사한 로컬 자산은 어느 쪽이든 상대 경로를 씁니다.

생성된 사이트 기본 구조에는 클라이언트 fetch, JavaScript, CDN이 필요하지 않습니다. `themeSwitch: true`와 호스팅 리뷰는 각각 로컬 스크립트를 더하지만 네트워크 접근은 여전히 없고, `scripts`는 사용자가 직접 쓴 파일을 로컬에서 읽으며 그 파일은 `connect`가 지정한 서버에만 닿습니다. 페이지 하나만 건네려면 `mode: "standalone"`으로 씁니다. 그 파일 하나가 페이지 전체입니다.

문서 페이지마다 `<meta name="description">`이 들어갑니다. 문서의 front matter `description`이거나, 없으면 링크만 나열하거나 이미지만 든 문단이 아닌 첫 문단을 160자 안에서 자른 글입니다.

`siteUrl`(`--site-url`)은 사이트를 게시할 주소를 기본 경로까지 포함해 빌드에 알립니다. 지정하면 사이트 페이지마다 자기 주소를 `<link rel="canonical">`로 밝히고, 여러 언어로 있는 문서 페이지는 언어별 버전을 `hreflang`으로 나열하며, `sitemap.xml`이 모든 페이지를 나열합니다. 빌드가 만들어 언어별 문서를 나열하는 홈에는 canonical 링크만 있고 설명과 `hreflang`은 없습니다. `siteUrl`은 이 사이트의 주소이며 기본 사이트의 `hostUrl`과 다르고, `mode: "site"`에만 적용됩니다. 단일 페이지와 리뷰 페이지는 자기 주소가 없으므로, 다른 모드에서 지정하면 오류입니다.

```js
export default {
  sourceRoot: "docs",
  outDir: "site",
  siteUrl: "https://docs.example.com/manual/",
}
```

출력을 갱신하려면 다시 빌드합니다. `outDir`는 소스·라이브러리·자산 디렉터리와 분리하고 cudoc 전용 출력 디렉터리를 씁니다. 빌드가 실패하면 이전 출력을 그대로 두고, 성공하면 출력 전체를 교체하므로 이전 모드나 이전 페이지의 파일이 남지 않습니다.

`library`를 생략하면 문서 라이브러리를 별도로 출력하며 기본 경로는 출력 디렉터리의 부모 아래 `.cudoc/documents`입니다(`site` → `.cudoc/documents`). `library`를 지정하면 그 입력은 변경하지 않습니다.

## 실제 환경에서 확인할 사항

내보내기가 스스로 검증하지 않는 것은 공유 전에 다음 네 가지로 확인합니다.

- 수집한 경로·커스텀 slug·배포 기본 경로와 `hostUrl`이 기본 사이트의 실제 배포 URL에 맞는지 확인합니다. 생성기는 링크를 변환하지만 원격 URL의 접근 가능 여부를 검사하지 않습니다.
- 출력 디렉터리 전체를 다른 위치에 복사한 뒤 독자가 사용하는 브라우저에서 `file://`로 엽니다. 탐색·이미지·스타일·임베드 표·인쇄를 확인합니다. 단일 페이지는 빈 폴더에 하나만 두고 열어 보고, 옆에 아무것도 필요 없어야 한다면 `strict: true`로 빌드합니다.
- 호스트 고유 위젯과 자산을 확인합니다. 동적 React·Vue 코드는 별도 HTML 렌더러가 필요합니다. `css` 파일의 `url()`이 가리키는 파일은 복사하거나 인라인으로 품지만 `@import`는 거부하므로, 스타일시트를 각각 `css`에 나열합니다.
- 기본 사이트와 HTML 출력 디렉터리를 분리합니다. 문서 변경 후 다시 수집·준비하고 출력합니다. 내비게이션은 무엇을 쓸지 정할 뿐 문서 안에 담긴 내용의 공개 권한을 거르지 않으므로, 공유 전에 내비게이션이 게시하는 범위와 결과의 `omitted` 목록을 검토합니다.

저장소의 [호스트 라이브러리 출력 검사](../tests/built/html-export.test.ts)는 다섯 실제 호스트 라이브러리에 세 링크 정책을 적용하고, 소스·라이브러리·기본 사이트의 모든 출력 파일을 해시로 비교해 변경되지 않았는지 검증합니다.

코드에서 쓰는 API는 [buildSite 옵션과 동작](./api-reference/adapters.ko.md#내보내기)에 있습니다.
