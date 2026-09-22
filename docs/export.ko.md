# 내보내기

[English](./export.md) | **한국어** · [전체 가이드](./README.ko.md)

`cudoc-export`는 수집한 문서 집합을 독립된 배포 산출물로 내보냅니다. 현재 만들어 내는 형식은 정적 HTML 사이트이며, cudoc의 Markdown 문법 확장과 문서 임베드를 활용하는 선택적 추가 출력입니다. Next.js, Docusaurus, Nextra, VitePress, Eleventy를 기본 문서 호스트로 유지하면서 `cudoc-export`로 같은 수집 문서와 준비된 임베드를 재사용합니다. 호스트를 바꾸거나 별도 문서 사본을 관리할 필요가 없으며, 다른 호스트 없이 단독으로 사용할 수도 있습니다. 정적 서버에 배포하거나 디스크에서 바로 열 수 있으며 별도 애플리케이션 구조를 만들 필요가 없습니다.

## 빈 디렉터리에서 첫 사이트 만들기

Node.js 20 이상과 npm만 있으면 됩니다. 사이트도 프레임워크도 설정 파일도 필요 없습니다.

```sh
npm install @cudoment/cudoc cudoc-export
```

문서 두 개를 만듭니다. 사실은 `docs/reference.md` 한 곳에 둡니다.

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

`site/index.html`을 열어 보세요. 문서 탐색과 제목 목차를 갖춘 사이트가 나오고, 요약 표의 각 행은 `reference.html`의 해당 절로 이어집니다. 문서를 고치고 같은 명령을 한 번 더 실행하면 그 문서를 가져다 쓰는 페이지가 전부 따라 바뀝니다.

`site/` 디렉터리를 통째로 건네주셔도 되고 아무 정적 호스트에나 올리셔도 됩니다. 출력물에는 서버도 번들러도 CDN도 필요 없어서 `file://`로 열어도 그대로 동작합니다.

생성기는 문서를 수집하고 임베드를 처리한 뒤 HTML, 스타일, 로컬 자산을 출력합니다. 문서 탐색, 제목 목차, 콜아웃, 가로로 스크롤되는 표, 코드 강조가 함께 들어갑니다.

## 완성 예시

아래의 옵션 하나하나를 상상하지 않고 산출물에서 직접 볼 수 있도록, 완성된 내보내기 결과 한 벌이 저장소에 들어 있습니다. 가상의 날씨 API를 다루는 문서 여섯 개가 [`examples/export/showcase/`](../examples/export/showcase/)에 있고, [`showcase.config.mjs`](../examples/export/showcase.config.mjs)가 이를 [`examples/export/showcase-output/`](../examples/export/showcase-output/)으로 내보냅니다. 묶음 파일은 [`northlight-handbook.pdf`](../examples/export/showcase-output/northlight-handbook.pdf)로, 같은 묶음의 Word 판은 [`northlight-handbook.docx`](../examples/export/showcase-output/northlight-handbook.docx)로 바로 열 수 있고, 사이트는 저장소를 디스크에 받은 뒤 그 디렉터리의 `index.html`을 열면 됩니다.

문서들은 작성자가 Markdown으로 쓰는 것만 씁니다. 명시적 앵커와 배지, 등록한 `success` 타입을 포함한 알림, 긴 열을 나누는 배치 규칙이 붙은 표 셀 안의 목록, 각 엔드포인트의 메서드와 경로를 레퍼런스에서 읽어 개요 페이지의 요약 표로 만드는 임베드, `replace`로 문맥에 맞게 고쳐 쓴 임베드 절, 각주, 이미지, 열이 일곱인 표, `cudoc-pagebreak` 펜스입니다. 설정은 세 형식을 두 단위로 모두 내보내고, 표지 이미지와 쪽 번호가 붙은 목차, 고정된 `date`를 쓰는 머리글과 바닥글, 2수준 제목마다 쪽 나누기, 링크 주소 인쇄, 열이 여섯 이상인 표의 가로 쪽, 설명 열의 최소 폭, 메모 런타임과 테마 전환 버튼을 켜고, `tokens`로 세 산출물 모두에 닿는 강조색을 지정합니다.

예시는 `examples/export`를 설치한 뒤 그 안에서 `npm run showcase`로 다시 만들고, `tests/scripts/export-showcase.mjs`가 커밋된 텍스트 산출물이 현재 패키지의 결과와 다르면 실패하므로 릴리스보다 뒤처지지 않습니다.

## 기존 사이트와 함께 생성

먼저 [호스트 가이드](./README.ko.md#사이트에-설치하기)의 수집기를 실행합니다. 실제 호스트 컴파일러의 결과를 수집하고 임베드를 준비해야 합니다. 해당 프로젝트에 `cudoc-export`을 설치하고 `site.config.mjs`를 작성합니다.

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

수집 이후에는 기본 사이트 빌드와 HTML 생성을 어느 순서로 실행해도 됩니다. `library`는 저장된 AST, 호스트의 제목 ID, 문서 경로, 준비된 임베드를 재사용하며 비동기 호스트에서 컴파일한 치환 결과도 포함합니다. 수집 라이브러리를 다시 만들거나 수정하지 않고 읽기만 합니다. 기본 사이트와 HTML은 출력 디렉터리를 분리합니다.

문법, 컴포넌트 의미 매핑, 컴파일러 설정은 수집기에서 관리합니다. `library`를 지정한 HTML 설정에는 이러한 옵션을 중복 지정하지 않습니다. 문서·경로·컴파일러 설정을 바꾸면 다시 수집하고 임베드를 준비합니다. HTML은 현재 편집 중인 파일이 아닌 수집된 스냅샷을 사용합니다. 임베드 없는 문서는 준비 파일이 없어도 되지만 임베드가 있으면 준비 파일이 필요합니다.

수집 후 명령 하나로 실행할 수도 있습니다.

```sh
npx cudoc-export build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/ --asset-dir public
```

## PDF와 Word

같은 수집 문서를 PDF와 Word로도 내보냅니다. 호출 한 번이면 됩니다.

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

`granularity`가 한 번 실행에서 무엇을 만들지 정합니다. `documents`는 문서마다
파일 하나를, `volume`은 모든 문서를 내비게이션 순서로 담은 파일 하나를 쓰고,
`both`는 둘 다 씁니다. 두 가지가 모두 있는 이유는 문서 사이를 잇는 링크가 한 권으로
묶은 파일 안에서만 앵커로 해석되기 때문입니다. 문서별 출력에서는 옆 파일을 가리킵니다.

모든 형식이 같은 디자인 토큰을 읽습니다. 그래서 PDF는 두 번째 디자인이 아니라
사이트 스타일시트를 인쇄한 결과이고, Word는 같은 팔레트와 글자 크기 단계와 간격을
Word 스타일로 번역해 받습니다. `tokens`는 [사이트 설정](#사이트-설정)을 참고하세요.

### 한 권으로 묶은 파일

묶은 파일은 제목을 실은 표지로 시작하고, 문서마다 시작 쪽을 적은 목차가 이어지며,
그 뒤에 문서들이 내비게이션 순서로 각각 새 쪽에서 시작합니다. `volume`이 파일 이름과
이 앞부분을 정합니다.

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
  },
})
```

`cover.image`는 로컬 PNG, JPEG, GIF, BMP 파일이며 제목 뒤에서 쪽의 내용 상자를 가득
채워 인쇄됩니다. 제목은 종이색 띠 위에 놓이므로 어떤 그림 위에서도 읽힙니다. Word가
담을 수 없기 때문에 SVG는 거부합니다. PDF의 목차 쪽 번호는 문서를 각각 인쇄해서
측정한 정확한 값이고, Word의 목차는 살아 있는 목차 필드여서 Word가 문서를 열 때
필드를 갱신하면 채워집니다. 그 전까지 다른 뷰어는 쪽 번호 없이 제목만 보여 줍니다.
`contents.pageNumbers: false`로 두면 측정용 인쇄와 쪽 번호 열을 두 형식 모두에서
생략합니다.

### 쪽

용지는 A4 세로에 20mm 여백이 기본이며, 쪽을 나누는 형식은 모두 같은 `page` 옵션을
읽습니다.

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

`header`와 `footer`는 PDF가 여백에 인쇄하고 Word 파일이 머리글과 바닥글로 갖는
러닝 라인입니다. `{page}`, `{pages}`, `{title}`, `{date}`를 쓸 수 있고, 가운데에 놓는
문자열 하나로 주거나 `left`, `center`, `right` 자리로 나눠 줄 수 있으며, `false`면
인쇄하지 않습니다. `{date}`는 `page.date`로 직접 준 날짜만 출력합니다. cudoc는
시계를 읽지 않으므로 같은 입력이 언제나 같은 결과를 냅니다. 15mm보다 좁은 여백에는
러닝 라인이 들어가지 않으므로, 잘린 머리글을 내는 대신 오류로 알립니다. 현재 절
이름을 보여 주는 러닝 헤더는 만들 수 없습니다. Chrome이 그 CSS 기능을 구현하지
않기 때문입니다. 그래서 문서별 파일의 헤더는 그 문서 제목이고, 한 권으로 묶은
파일의 헤더는 묶음 제목입니다.

`breakBefore: 1`은 1수준 제목 앞에서, `2`는 2수준 제목 앞에서도 새 쪽을 시작하며
`3`까지 지정할 수 있습니다. 묶은 파일에서 문서는 이미 새 쪽에서 시작합니다.
`linkUrls: true`는 종이로 읽는 독자를 위해 외부 링크의 주소를 링크 글자 뒤에
인쇄합니다. `authoredBreaks: false`는 쪽을 나누는 출력이 ` ```cudoc-pagebreak `
펜스를 무시하게 합니다. 저자가 다른 용지 크기를 기준으로 나누기를 넣어 둔 경우에
씁니다. `wideTables: { minColumns: 6 }`은 열이 그 수 이상인 모든 표를 PDF와
Word에서 똑같이 가로 쪽 하나에 따로 놓습니다. 지정하지 않으면 넓은 표는 세로
쪽의 폭에 맞춰 줄어듭니다. 문서의 맨 첫 블록인 표와 다른 표의 셀 안에 있는 표는
세로 쪽에 그대로 남습니다.

### PDF를 만드는 방식

cudoc는 브라우저 설치 여부와 무관하게 인쇄용 HTML을 항상 씁니다. 사이트 옆에
`<문서>.print.html`과 `<묶음>.print.html`이 놓이고 `cudoc-print.css`가 함께 생깁니다.
직접 열어서 인쇄해도 됩니다. `pdf`를 요청하면 cudoc가 그 파일들을 헤드리스
Chromium으로 한 브라우저 세션에서 인쇄합니다.

브라우저는 패키지와 함께 설치되며, 전체 브라우저 묶음이 아니라 187MB짜리 헤드리스
셸 하나만 받습니다. 설치 때 내려받지 않게 하려면 `CUDOC_SKIP_BROWSER_DOWNLOAD=1`을
지정하고, 나중에 설치하려면 `npx cudoc-export install-browser`를 실행하세요. 브라우저
없이 PDF를 요청하면 cudoc가 그 사실과 설치 명령을 알려 주며, 인쇄용 HTML은 이미
디스크에 있습니다. 이미 설치된 브라우저를 쓰려면 그 경로를 `pdf.executablePath`로
지정하세요.

### 쪽을 나누는 출력의 링크

[하이퍼링크 동작 선택](#하이퍼링크-동작-선택)의 링크 정책은 인쇄용 HTML과 PDF와
Word 파일에도 사이트와 똑같이 적용되며, 형식마다 같은 대상을 자기 방식으로 적습니다.

| 링크                   | 묶은 파일        | 문서별 파일, `relative`                              | `host`            | `none` |
| ---------------------- | ---------------- | ---------------------------------------------------- | ----------------- | ------ |
| 수집된 다른 문서       | 파일 안에서 이동 | 옆 파일 `<id>.pdf` 또는 `<id>.docx`, 프래그먼트 없이 | 배포된 페이지 URL | 제거   |
| 같은 문서의 프래그먼트 | 파일 안에서 이동 | 파일 안에서 이동                                     | 파일 안에서 이동  | 제거   |
| 외부 URL               | 유지             | 유지                                                 | 유지              | 제거   |

문서별 파일이 프래그먼트를 버리는 이유는 PDF 뷰어도 Word도 다른 파일 안의 제목을
안정적으로 가리키지 못하기 때문입니다. 프래그먼트는 `host`를 포함한 모든 정책에서
파일 안에 머무릅니다. 종이 위에서 그 대상은 웹사이트가 아니라 뒷쪽입니다.

### Word가 담는 것과 담지 못하는 것

Word 문서는 제목과 본문과 인용과 코드와 표와 캡션과 각주, 머리글과 바닥글, 표지와
목차, 그리고 콜아웃 타입마다 이름 붙은 스타일을 선언합니다. 본문의 어떤 요소도 색과
글꼴과 크기와 음영과 테두리를 직접 갖지 않습니다. 의도한 설계입니다. 받는 사람이
Word의 스타일 창에서 문서 전체 디자인을 바꿀 수 있고, 전달받은 문서를 자기 조직의
양식에 맞출 수 있기 때문입니다. 제목은 Word 자체의 제목 스타일이 되어 탐색 창과
목차 필드가 동작하고, 각주는 Word 각주가 되며, 참조형 링크는 정의를 따라 해석됩니다.
예외는 표의 셀 하나입니다. OOXML은 구분선과 음영을 셀 속성에 두므로, 표는 사이트와
같이 머리글 아래 구분선, 행 사이의 연한 구분선, 본문 행 하나 건너 음영, 세로선 없음으로
표현하고, 격자에 실제 열 폭을 적어 두어 Pages나 Quick Look처럼 격자로 표를 배치하는
뷰어에서도 Word와 같은 표가 보이게 합니다.

다음은 Word로 건너가지 못하며, 비슷하게 흉내 내지 않고 그대로 버립니다. 둥근
모서리(OOXML 테두리는 직각뿐), 읽기 폭 제한(페이지 여백으로 한 번만 표현), 다크
테마(`.docx`는 한 벌만 담습니다), 그리고 CSS 폰트 스택입니다. Word는 문자 체계마다
글꼴 하나만 쓰므로 `tokens.word`의 글꼴(기본값은 Windows와 macOS의 Office가 모두
설치하는 Calibri, Consolas, Malgun Gothic)을 씁니다. 그래서 Word가 없는 웹 폰트를
임의로 바꿔 넣는 대신 지정한 글꼴로 열립니다. 같은 묶음이 양식의 간격도 갖고
있습니다. 문단 뒤, 제목 앞, 블록 앞뒤, 목록 항목 뒤 간격과 목록·인용 들여쓰기, 상자와
셀의 안쪽 여백이 각각 키 하나이므로, Word에서 문서가 너무 헐겁거나 빽빽하면 사이트를
건드리지 않고 조정할 수 있습니다. 키와 기본값, 각 키가 적용되는 자리는
[Word 양식](./api-reference/adapters.ko.md#word-양식)에 정리되어 있습니다. `css` 옵션은
HTML과 PDF에만 닿습니다. Word는 CSS를 읽지 않으므로, 형식을
가로질러 유지해야 하는 것은 `tokens`로 지정하세요. SVG 이미지는 대체 텍스트가 됩니다.
`docx`가 래스터 대체본을 요구하는데 cudoc에는 래스터라이저가 없기 때문이며, 이 대체는
`image-as-text`로 보고합니다.
`<details>`는 펼친 상태로 나갑니다. Markdown 문서의 raw HTML은 버리며, 버릴 때마다
결과의 `diagnostics`와 CLI의 표준 오류에 문서 이름과 함께 알립니다. 정규화를 거치고도
남은 컴포넌트는 거부합니다. HTML 출력이 렌더러 없는 컴포넌트를 거부하는 것과
같습니다. 단, `docx.components`에 그 컴포넌트의 Word 렌더러를 지정하면 그것을 씁니다.

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

`rawHtml: "text"`는 HTML 소스를 코드 블록으로 쓰고, 각 경우를 `dropped-html`
대신 `html-as-text`로 보고합니다. `calloutStyle: "table"`은 사이트의 상자에 더
가깝지만, 색조와 선이 이름 붙은 스타일이 아니라 셀 자체의 속성에 들어가는 대가가
있습니다. 컴포넌트 렌더러는 노드를 받아 `docx` 객체를 돌려줍니다. 컴포넌트가
블록 자리에 있으면 문단과 표를, 글 안에 있으면 런을 돌려주며, 인라인 자리에서
문단을 돌려주면 오류입니다. [자산과 사용자 컴포넌트](#자산과-사용자-컴포넌트)의
`renderOptions.components`에 대응하는 Word 쪽 짝입니다.

## 하이퍼링크 동작 선택

| `links` / `--links` | 동작                                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `relative` (기본값) | 문서를 로컬 `.html` 파일로 연결하고 로컬 링크 파일을 복사합니다. 외부 URL은 유지합니다.                                                   |
| `host`              | 내부 하이퍼링크를 기본 사이트의 배포 경로로 연결합니다. HTTPS, `mailto:` 등 외부 URL은 유지합니다. `hostUrl` / `--host-url`이 필수입니다. |
| `none`              | 외부 URL을 포함한 모든 하이퍼링크를 제거하고 텍스트·중첩 서식·이미지는 유지합니다.                                                        |

모든 수집 루트와 모든 `assetDirs` 루트를 벗어나는 로컬 링크는 어떤 정책에서도 해석할 수 없으므로 빌드가 실패하며, 그 링크와 링크를 담고 있는 문서를 함께 알려 줍니다. 같은 도메인에서 다른 애플리케이션이 담당하는 경로(`/sdk/js/start` 등)는 `externalPaths`(또는 반복하는 `--external-path`)에 적어 두면 어느 정책에서도 쓴 그대로 남습니다. `private`로 수집한 문서로 가는 링크는 그 페이지가 출력에 없으므로 `relative`와 `none`에서는 오류이고, `host`에서는 배포 주소를 가리킵니다. 작성한 링크, raw HTML, 임베드 본문·표, 생성된 탐색 메뉴·목차·각주에 모두 적용합니다. 로컬 이미지와 스타일은 모든 모드에서 유지합니다. `none`은 클릭 가능한 앵커를 제거하며 스타일시트의 `<link>` 같은 렌더링 자원은 유지합니다. 제거한 하이퍼링크에서만 참조하는 파일은 복사하지 않습니다.

`host`에서는 기본 경로까지 포함한 전체 배포 URL을 지정합니다. 예를 들어 `hostUrl`이 `https://docs.example.com/project/`이고 수집된 문서 경로가 `/docs/start`이면 `start.md#setup`과 `/docs/start#setup` 모두 `https://docs.example.com/project/docs/start#setup`으로 연결합니다. 이미 기본 경로가 포함된 문서 경로에는 `/project/`를 중복 추가하지 않습니다. 쿼리와 프래그먼트는 유지하고, `#setup` 같은 링크는 배포된 현재 문서로 연결합니다. 그 밖의 내부 경로는 배포 URL과 현재 문서 경로를 기준으로 해석합니다.

커스텀 slug와 문서 경로는 수집기에서 기본 사이트의 URL에 맞춥니다. HTML 생성기가 호스트 설정에서 라우팅을 자동 추론하지는 않습니다. `links`는 생성된 HTML의 하이퍼링크 동작이며 수집 단계의 문법 정규화 옵션인 `syntax.link`와 별개입니다.

## 사이트 설정

`site.config.mjs`를 작성합니다.

```js
export default {
  sourceRoot: "docs",
  outDir: "site",
  title: "제품 문서",
  navigation: ["index", "reference"],
  syntax: { headingAnchor: "cudoc", callout: "cudoc" },
  links: "relative",
  // css: "./custom.css",
}
```

```sh
npx cudoc-export build --config site.config.mjs
```

`navigation`에는 확장자 없는 문서 ID를 지정합니다. 지정한 문서가 먼저 나오고 나머지가 뒤에 이어집니다. `css`는 기본 스타일 뒤에 로컬 CSS 파일을 추가합니다. `index.md`가 없으면 시작 페이지를 생성합니다. JSON 설정도 사용할 수 있습니다.

기본 스타일은 사용자의 라이트·다크 시스템 설정을 따르며, 그 동작에 스크립트가 필요하지 않고 모든 색을 두 테마가 함께 정의하는 사용자 정의 속성에 담고 있습니다. `themeSwitch: true`(또는 `--theme-switch`)를 켜면 머리글에 시스템·라이트·다크 버튼이 생기고 선택을 브라우저가 기억합니다. 주석 외에 사이트가 읽는 유일한 작은 스크립트이며, 기본 출력에는 들어가지 않습니다. 디자인을 바꾸려면 규칙을 다시 쓰지 말고 그 속성만 재정의하는 파일을 `css`에 지정합니다. 전체 토큰 목록은 [어댑터 레퍼런스](./api-reference/adapters.ko.md#내보내기)에 있습니다.

```css
/* custom.css, 기본 스타일 뒤에 덧붙습니다 */
:root {
  --accent: #7c4dff;
  --accent-soft: #ece7fb;
  --measure: 78ch;
  --font-sans: "Inter", system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
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

위 설정은 Markdown을 직접 수집합니다. 기존 호스트 라이브러리를 재사용하려면 `library`를 추가하고 `syntax` 같은 수집 옵션은 제거합니다.

## 자산과 사용자 컴포넌트

소스 기준 상대 경로 이미지는 수집 루트(`sourceRoot`, 또는 수집에 쓴 것과 같은 `roots` 목록)에서 찾습니다. URL 루트에 대응하는 추가 자산 디렉터리는 `assetDirs: ["public", "static"]` 또는 반복 가능한 `--asset-dir`로 지정합니다. 예를 들어 `/img/logo.svg`는 `public/img/logo.svg`에서 복사할 수 있습니다. `hostUrl`을 설정하면 `/project/img/logo.svg`처럼 배포 기본 경로가 포함된 자산 경로도 처리합니다. 참조한 로컬 이미지와 스타일은 `host`·`none`에서도 복사한 뒤 상대 경로로 연결하며, 직접 작성한 외부 리소스는 외부 주소를 유지합니다.

정규화된 호스트의 알림·제목·링크·표는 수집한 AST에서 렌더링합니다. React·Vue 컴포넌트 코드를 실행하지는 않습니다. AST에 사용자 컴포넌트가 남아 있으면 ESM 설정 또는 `buildSite` API에서 HTML 콜백을 지정합니다.

```js
const renderOptions = {
  components: {
    ProductMark: () => '<strong class="product-mark">Product</strong>',
  },
}
```

이 `renderOptions`를 사이트 옵션에 추가합니다. 콜백은 HTML을 반환하며, 반환한 HTML의 링크에도 선택한 정책이 적용됩니다. 노드와 자식 인자는 [렌더링 계약](./api-reference/document.ko.md#컴포넌트와-렌더링)을 참고하세요. 지원하지 않는 컴포넌트는 누락시키지 않고 오류로 보고합니다. 소스 HTML과 렌더러 출력은 cudoc이 정화하지 않습니다.

## 내보낸 사이트에서 피드백 받기

내보낸 사이트를 받은 사람은 무언가를 돌려보내야 할 때가 많습니다. 틀린 문장, 빠진 단계 같은 것입니다. `annotations: true`(또는 `--annotations`)를 켜면 사이트에 작은 메모 런타임이 실리고, 그 외에는 아무것도 바뀌지 않습니다. 기본 출력은 여전히 스크립트를 담지 않습니다.

```js
export default {
  sourceRoot: "docs",
  outDir: "site",
  annotations: true,
}
```

**받은 사람이 하는 일.** 글자를 선택해 메모 버튼을 누르거나, 문단·목록 항목·표 행·코드 블록에 마우스를 올려 옆에 나타나는 `+`를 누르고 메모를 적습니다. 오른쪽 아래의 말풍선 버튼이 이 페이지의 메모 개수를 보여 주고 패널을 엽니다. 패널은 메모를 인용문과 함께 나열하며, 메모는 수정·답글·해결·삭제할 수 있습니다. 맨 위의 이름 입력란은 선택 사항입니다. 끝나면 짧은 목록이라면 **공유 토큰 복사**를 누르고, 그렇지 않으면 *더 보기*를 열어 **메모 내려받기**(`<페이지>.annotations.json`)나 **메모 내장 사본 저장**(`<페이지>.annotated.html`, 원본과 같은 폴더에 두면 메모가 제자리에 보이는 상태로 열림)을 택합니다. 패널은 머리에서 다른 언어를 고르지 않는 한 영어이고, 기본값으로 사이드바를 가리는 대신 본문 폭을 좁힙니다. 두 설정은 브라우저가 기억합니다. 브라우저가 허용하면 메모는 다음 방문까지 브라우저에 남지만, Firefox는 로컬 파일에 대해 허용하지 않으므로 닫기 전에 내려받으세요.

**저자가 하는 일.** 돌아온 `.json`(또는 `.annotated.html`)을 자기 사이트 사본에서 _더 보기_ 아래의 불러오기 버튼으로 읽어 들이거나, 돌아온 토큰을 자기 사본의 주소 끝에 붙이면 메모가 작성된 자리에 나타나고, 그 뒤 문서가 바뀌었다면 "위치 불확실"이나 "위치를 찾지 못함"으로 표시됩니다. 원문에서 처리하려면 다음을 실행합니다.

```sh
npx cudoc-export annotations review.annotations.json --library .cudoc/documents --out review.md
```

이 명령은 Markdown 보고서를 씁니다. 메모마다 문서, 절 제목, 원문 줄 번호와 그 줄의 내용, 리뷰어의 글이 들어갑니다. 공유 토큰은 파일 대신, 또는 파일과 함께 `--token '<토큰>'`으로 넘깁니다. 보고서는 사실만 적습니다. 자체 지시문이 없으므로 어시스턴트에게 보내는 자기 프롬프트 아래에 그대로 붙일 수 있고, 리뷰어의 글은 요청이 아니라 데이터로 라벨이 붙어 있습니다. 그것으로 무엇을 할지는 사용자의 프롬프트에 남습니다. `--json`은 같은 사실을 JSON으로 냅니다.

**공유 전에 알아 둘 것.** 돌아온 `.annotated.html`은 다른 사람이 만든 HTML 파일입니다. 코드를 실행할 수 있는 첨부 파일을 여는 것과 같이 다루고, 대신 `.json`을 불러오세요. 공유 토큰에는 메모 본문과 이름이 주소에 그대로 들어가며 패널이 그 사실을 알립니다. 로컬 파일에서는 사용자의 경로가 드러나지 않도록 `#cudoc-notes=…` 부분만 복사합니다. 브라우저에 저장되는 메모에는 인용한 구절이 포함됩니다. 어디에도 업로드하지 않습니다. 런타임에 네트워크 접근이 없고 페이지도 그것을 금지합니다(`connect-src 'none'`). 호스팅 배포에는 `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'; frame-ancestors 'none'`과 같은 Content-Security-Policy 헤더를 더하세요. `cudoc-embed`로 끌어온 글은 임베드한 문서의 Markdown에 없으므로 그 위의 메모는 "찾지 못함"으로 보고됩니다. 파일 형식, 앵커링 규칙, 보고서의 계약은 [어댑터 레퍼런스](./api-reference/adapters.ko.md#주석)에 있습니다.

## 공유와 배포

`site/index.html`을 열거나, `site/` 전체를 다른 컴퓨터에 복사하거나, 정적 호스트에 업로드합니다. 공유 디렉터리 안에서 탐색하려면 `relative`, 기본 사이트로 연결하려면 `host`, 클릭 가능한 링크 없이 읽으려면 `none`을 사용합니다. CSS와 복사한 로컬 자산은 상대 경로를 사용합니다. 생성된 사이트 기본 구조에는 클라이언트 fetch, JavaScript, CDN이 필요하지 않습니다. `annotations: true`를 켜면 로컬 스크립트 하나가 더해지지만 네트워크 접근은 여전히 없습니다. 모든 자산을 한 HTML 파일에 넣는 방식이 아닌 디렉터리 출력입니다.

사이트를 갱신하려면 다시 빌드합니다. `outDir`는 소스·라이브러리·자산 디렉터리와 분리하고 cudoc 전용 출력 디렉터리를 사용하세요. 임시 디렉터리에서의 사이트 생성에 실패하면 이전 사이트를 유지합니다. `library`를 생략하면 문서 라이브러리를 별도 출력하며 기본 경로는 사이트 디렉터리의 부모 아래 `.cudoc/documents`입니다. `library`를 지정하면 해당 입력은 변경하지 않습니다.

## 실제 환경에서 확인할 사항

- 수집한 경로·커스텀 slug·배포 기본 경로와 `hostUrl`이 기본 사이트의 실제 배포 URL에 맞는지 확인합니다. 생성기는 링크를 변환하지만 원격 URL의 접근 가능 여부를 검사하지 않습니다.
- 출력 디렉터리 전체를 다른 위치에 복사한 뒤 독자가 사용하는 브라우저에서 `file://`로 엽니다. 탐색·이미지·스타일·임베드 표·인쇄를 확인합니다. 단일 파일 번들은 아닙니다.
- 호스트 고유 위젯과 자산을 확인합니다. 동적 React·Vue 코드는 별도 HTML 렌더러가 필요하며 CSS import·`url()` 의존성과 반응형 `srcset` 자원은 재귀적으로 묶지 않습니다.
- 기본 사이트와 HTML 출력 디렉터리를 분리합니다. 문서 변경 후 다시 수집·준비하고 출력합니다. 공유 전 포함 문서와 스코프를 검토합니다. HTML 출력은 공개 권한 필터가 아닙니다.

저장소의 [호스트 라이브러리 출력 검사](../tests/built/html-export.test.ts)는 다섯 실제 호스트 라이브러리에 세 링크 정책을 적용하고, 소스·라이브러리·기본 사이트의 모든 출력 파일을 해시로 비교해 변경되지 않았는지 검증합니다.

코드에서 사용하려면 [buildSite 옵션과 동작](./api-reference/adapters.ko.md#내보내기)을 참고하세요.
