# 릴리스 노트

[English](./release-notes.md) | **한국어** · [전체 가이드](./README.ko.md)

이 페이지는 버전마다 바뀐 내용을 최신 버전부터 정리합니다. 여덟 패키지는 모두 같은 버전 번호를 공유하며, 수 버전, 부 버전, 주 버전이 각각 무엇을 바꿀 수 있는지는 [지원 버전](./README.ko.md#지원-버전)에 있습니다.

## 1.1.0

HTML 내보내기가 사용자의 스크립트를 싣고 사이트를 휴대전화에 맞게 배치하며, 호스트 사이트의 트리 임베드는 손가락으로 누르기 쉬워집니다.

- `scripts`는 내보낸 페이지가 cudoc의 스크립트 다음에 읽을 로컬 JavaScript 파일을 지정합니다. 사이트는 파일을 `cudoc-js/` 아래에 복사해 `<body>` 끝에서 `<script defer>`로 읽고, 단일 페이지는 그 텍스트를 품습니다. 이런 페이지는 `themeSwitch`와 같은 Content-Security-Policy를 받고 `data-cudoc-document`에 문서 id를 적으며, 기본 출력에는 여전히 스크립트가 없습니다. → [직접 쓴 스크립트](./export.ko.md#모양), [사용자 스크립트](./api-reference/adapters.ko.md#사용자-스크립트)
- 폭이 768px 이하인 화면에서는 내보낸 사이트의 사이드바가 머리글의 메뉴 버튼 뒤로 접힙니다. 이 버튼은 체크박스의 레이블이라 스크립트 없이 사이드바를 엽니다. 터치 화면에서는 접는 줄과 그룹의 요약 줄이 2.75rem 이상의 높이를 갖고, 목록의 체크박스는 한 줄에서 2.75rem을 차지합니다. → [모양](./export.ko.md#모양)
- `@cudoment/cudoc/styles.css`는 트리 임베드의 접는 줄에 터치 화면에서 같은 높이를 주고, 긴 줄은 넘치지 않게 줄바꿈합니다.
- 목록 항목 안에 쓴 `data-*` 속성은 내보낸 페이지에 쓴 그대로 남으며, 이제 테스트가 이를 보장하므로 소비자의 훅이 조용히 사라지지 않습니다.
- 폭이 768px 이하인 화면에서는 내보낸 사이트의 사이드바에서 시작한 스와이프가 페이지를 스크롤합니다. 지금까지는 사이드바가 스크롤할 수 없는 스크롤 상자로 남아 그런 스와이프가 아무것도 움직이지 못했고, 내비게이션이 길면 화면에 스와이프할 곳이 남지 않았습니다. 사이드바는 화면보다 긴 단어를 옆으로 스크롤하지 않고 줄바꿈합니다.
- 내보낸 사이트의 본문 옆에 놓인 사이드바나 목차 열에서 시작한 휠과 스와이프는 그 열이 짧거나 이미 끝까지 스크롤되었으면 페이지를 스크롤합니다. 지금까지는 두 열이 그런 동작을 페이지로 넘기지 않아 아무것도 움직이지 않았습니다.

## 1.0.0

첫 안정 릴리스입니다. 이제 [API 레퍼런스](./api-reference/README.ko.md)가 문서화한 공개 import, 옵션, 문법, 명령, 진단 코드, 저장 형식은 주 버전에서만 바뀝니다. 부 버전은 이 범위를 넓히고, 수 버전은 결함을 고칩니다([지원 버전](./README.ko.md#지원-버전)).

- 탭: `tab="…"` 레이블을 붙인 펜스와 `> [!TAB] 레이블` 인용 블록을 이어서 쓰면 하나의 그룹이 되고, `syntax.tabs`가 호스트 문법을 받으면 Docusaurus의 `Tabs`/`TabItem`, Nextra의 `Tabs`/`Tabs.Tab`, `docs` 프로필의 `Tabs`/`TabsContent`, VitePress의 `::: code-group`도 같은 그룹이 됩니다. 페이지는 스크립트 없이 탭으로 보여 주고, `docs` 호스트는 자체 `Tabs`와 `TabsContent`로 그리며, `tabElements`로 다른 컴포넌트를 지정할 수 있고, 인쇄, PDF, Word는 모든 탭을 레이블과 함께 차례로 씁니다. → [탭](./syntax.ko.md#탭)
- 코드 블록에 제목과 강조 줄을 붙일 수 있으며(`title="retry.js" {2,4-5}`), Docusaurus, Nextra의 `.mdx` 페이지, `docs` 프로필에는 각자의 제목 속성을 넘기고 그 밖의 렌더러는 제목 아래에 블록을 감쌉니다. 내보내기는 HTML, PDF, Word에서 줄을 강조하고, `syntax.codeMeta`는 호스트 고유 형식도 읽습니다. → [코드 블록 제목](./syntax.ko.md#코드-블록-제목과-강조-줄)
- `variables`는 작성자가 `(=name)`을 쓰는 모든 곳을 값 표 하나로 바꾸고, `linkReferences`는 모든 문서가 함께 쓰는 링크 레이블을 한 번만 정의합니다. → [변수](./syntax.ko.md#변수), [공유 링크 참조](./syntax.ko.md#공유-링크-참조)
- `^^`나 `>>`만 담은 표 셀은 위쪽이나 왼쪽 셀과 합쳐지고, `syntax.tableNote`는 `docs` 프로필의 `Footnote`처럼 표 뒤의 표지 문단을 그 표의 주석으로 모읍니다. `docs` 호스트는 이 주석을 다시 자기 `Footnote`로 그립니다. → [표 셀 병합](./syntax.ko.md#표-셀-병합), [표 주석](./syntax.ko.md#표-주석)
- `cudoc check`는 원문에서 표를 읽고(`table-column-count`, `table-unclosed-code`), 대소문자를 구분하지 않는 디스크에서만 열리는 링크(`path-case-mismatch`), 변수, 공유 참조, 표 주석, `siteOrigins`에 주소를 적은 사이트로 거는 절대 주소 링크를 검사합니다. 가장 가까운 실제 대상을 `did you mean`으로 알려 주고, 텍스트 보고서는 문서마다 문제를 위치 순서로 정렬하며, 요청하면 번역, 앵커 형식, 제목, 대체 텍스트, 쓰지 않는 파일도 검사합니다. → [참조 검사](./check.ko.md)
- `cudoc lsp`는 이 검사를 편집기의 언어 서버로 실행합니다. 저장할 때마다 검사하고, 제안한 수정을 빠른 수정으로 제공하며, `cudoc/counterpart`로 문서의 번역본을 찾습니다. → [편집기에서](./check.ko.md#편집기에서)
- 수집은 페이지마다 제목과 설명을 담은 `pages.json`을 쓰고, `imageSizes`를 켜면 페이지가 보여 주는 로컬 이미지의 크기를 담은 `images.json`도 씁니다. 내보낸 사이트 페이지에는 `<meta name="description">`이 들어가고, `siteUrl`(`--site-url`)을 주면 canonical 주소, `hreflang` 번역 링크, `sitemap.xml`도 만듭니다. → [라이브러리 파일](./api-reference/node.ko.md#라이브러리-파일), [공유와 배포](./export.ko.md#공유와-배포)
- `syntax`의 모든 기능이 `off`를 받습니다. `off`인 기능은 문법을 쓴 글자 그대로 두고 호스트 고유 형식도 정규화하지 않으므로, 사이트는 표 셀 안의 목록처럼 쓰지 않는 기능을 끌 수 있습니다. → [기능별 문법 선택](./syntax.ko.md#기능별-문법-선택)
- 제목을 자체 컴포넌트로 그리는 파이프라인(`cudoc-remark`의 `headingMetadata`, `badge`, `tableCellList`)도 이제 그 밖의 기능은 `syntax`로 고를 수 있으며, 그 설정은 Markdown 페이지에 적용됩니다. 같은 기능을 두 방식으로 함께 지정할 때만 거부합니다. → [cudoc-remark](./api-reference/adapters.ko.md#remark)
- 화면에만 그리고 저장하지 않는 마크업은 `@cudoment/cudoc/present`가 맡습니다. `@cudoment/cudoc/node/image-size`와 `@cudoment/cudoc/node/lsp`가 새 진입점이고, `documentTitle`, `documentDescription`, `frontmatterOf`가 `@cudoment/cudoc/query`에, `decodeCharacterReferences`, `referencedCharacter`, `readableText`, `normalizeLabel`, `parseCodeMeta`, `resolveVariables`, `replaceVariables`, `resolveLinkReferences`가 `@cudoment/cudoc/document`에 추가되었고 `visibleHeadingText`가 선택적 읽기 함수를 받으며, `RenderOptions.highlight`는 코드 노드를 받습니다.
- 문서 사이트가 모든 호스트 예제를 그 호스트가 빌드한 그대로 `demos/` 아래에 공개하며, 예제는 같은 Markdown 파일 두 개를 Next.js, Docusaurus, Nextra, VitePress, Eleventy가 렌더링한 결과입니다. 각 페이지는 호스트 버전을 밝히고 빌드에 쓴 Markdown 원문과 가이드, 예제 코드로 연결되며, 가이드와 패키지 README도 해당 호스트의 데모로 연결됩니다. → [호스트별 데모](./README.ko.md#호스트별-데모)
- 지원 버전에 표시한 날짜에 새 프로젝트로 설치해 확인한 조합을 함께 적고, 선언한 범위가 허용하더라도 지원하지 않는 조합(zod 4.4 이상과 함께 쓰는 Nextra 4.6.1, Turbopack으로 빌드하는 Nextra, markdown-it 15)을 밝힙니다. Nextra 가이드는 유지할 Nextra 릴리스와 Next.js 16에서 빌드하는 방법을, Next.js와 Eleventy 가이드는 두 호스트에서 `.md` 파일로 거는 링크가 쓴 그대로 남는다는 점을 설명합니다. → [지원 버전](./README.ko.md#지원-버전)
- 내보낸 페이지는 긴 인라인 코드를 본문 열 안에서 줄바꿈합니다. 지금까지는 옆의 목차 아래로 넘어가고 휴대전화에서 페이지를 가로로 넓혔습니다.
- VitePress에서 `&copy;`나 `&nbsp;` 같은 문자 참조가 본문과 콜아웃 제목에서 VitePress만 쓸 때처럼 해당 문자로 보입니다. 지금까지는 쓴 그대로 보였습니다.
- VitePress에서 참조로 쓴 중괄호(`&#123;`)는 참조 그대로 남겨 Vue가 `{{`를 보간으로 읽지 않으며, 표 셀 안의 목록도 마찬가지입니다. 페이지 제목, 설명, 내보내기의 목차, Word 본문에서는 이 참조를 중괄호로 읽습니다. `[[toc]]` 레이블, 임베드 표의 제목, 탭 레이블처럼 cudoc이 문자열로 페이지에 쓰는 글자는 VitePress 자체의 `[[toc]]`처럼 참조를 그대로 유지하므로, 중괄호 대신 참조 표기가 보입니다.
- VitePress 라이브러리로 만든 Word 파일은 제목마다 붙은 고정 링크를 쓰지 않습니다. 이전에는 이 링크를 빈 링크로 쓰면서 `dropped-html` 경고를 내거나, `rawHtml: "text"`에서는 코드로 썼습니다.
- 제목은 `(@…)` 표지, `Anchor`의 `badge`, `Badge` 컴포넌트, VitePress `<Badge>` 중 어느 것으로 쓴 배지든 `data.cudoc.badge`에 기록하므로, `getHeadingBadge`가 모든 형식을 읽습니다.
- `library`를 주지 않으면 `cudoc dataset`이 `inputDir`가 속한 라이브러리를 읽습니다. 따라서 수집 결과에서 바로 만든 데이터셋에는 비공개 문서가 들어가지 않고, scope도 루트 기준 경로를 따릅니다. → [AST 데이터셋](./dataset.ko.md#포함할-콘텐츠-선택)
- `invalid-anchor-format`은 같은 표지를 앞서 적은 코드 예시가 아니라 제목에 위치하며, 빈 `exclude`, `private`, `unusedAssets` 패턴은 그 옵션 이름을 밝힙니다.
- 내보낸 페이지 옆의 목차는 링크를 유지하는 모든 정책에서 페이지 안을 가리킵니다. 이전에는 `host`에서 배포된 페이지를 가리켜, 오프라인으로 보낸 단일 페이지의 독자가 사이트로 이동했습니다.
- PDF는 형제 파일을 `reference/limits.pdf`처럼 상대 주소로 링크합니다. 지금까지는 브라우저가 이런 링크를 인쇄한 머신의 임시 작업 디렉터리를 가리키는 절대 `file:` URL로 써서, 출력을 게시하면 링크가 깨지고 그 머신의 경로가 드러났습니다.

업그레이드할 때 확인할 사항:

- cudoc에는 Node.js 22 이상이 필요합니다. Node.js 20은 2026-04-30에 지원이 끝났으며, 지속적 통합은 이제 Node.js 22, 24, 26에서 실행합니다.
- 셀 병합, 코드 제목, 탭은 기본으로 켜져 있습니다. `^^`나 `>>`만 담은 표 셀은 병합되므로 글자로 남기려면 `\^\^`처럼 이스케이프하거나 코드로 씁니다. 펜스의 `title="…"`은 이제 제목을 그리므로, 이 메타를 직접 읽는 사이트는 `syntax.codeMeta: "host"`로 설정하고, 예전에는 알 수 없는 콜아웃으로 보고하던 `[!TAB]`으로 시작하는 인용 블록은 이제 탭입니다.
- 검사가 더 많이 보고합니다. `table-column-count`, `table-unclosed-code`, `path-case-mismatch`, 그리고 `variables`를 설정한 경우의 `undefined-variable`은 오류이므로, `cudoc check`를 실행하는 빌드는 지금까지 조용히 잘못 그려지던 표나 링크 때문에 실패할 수 있습니다. 참조형 링크와 이미지는 지금까지 markdown-it 호스트에서만 검사했지만, 이제 모든 호스트에서 정의를 따라가 검사합니다.
- 문제의 `reference`와 그 값을 담는 `cudoc check --format json`은 호스트가 저장한 형태가 아니라 원문에 쓴 그대로의 링크를 담습니다. 예를 들어 호스트가 `guide`로 저장했어도 `./guide.md`를 담습니다. 이 글자로 문제를 맞춰 보는 도구는 이제 원문의 표기를 읽어야 합니다.
- cudoc의 클래스를 다시 꾸미는 사이트 스타일시트는 `@cudoment/cudoc/styles.css`와 내보내기가 꾸미는 `cudoc-code`, `cudoc-code-title`, `cudoc-table-note`, `cudoc-tab*` 클래스도 함께 다루는 것이 좋습니다. Word 파일에는 문단 스타일 `CudocCodeTitle`, `CudocCodeHighlighted`, `CudocTabLabel`, `CudocTableNote`가 새로 생겼으므로, 스타일을 바꾼 템플릿도 이 스타일을 함께 다루는 것이 좋습니다.
- cudoc 다음에 오는 remark 플러그인을 위해 frontmatter를 트리에 그대로 남깁니다. 지금까지는 Nextra 페이지에서 frontmatter가 사라져 Nextra가 첫 제목으로 페이지 제목을 정하고 `sidebarTitle` 같은 설정을 무시했고, cudoc 뒤에 둔 remark-mdx-frontmatter도 frontmatter를 찾지 못했습니다.
- 지금까지는 Docusaurus와 Nextra 라이브러리에 frontmatter가 저장되지 않아, 내보내기의 제목과 설명이 frontmatter가 없는 페이지처럼 읽었습니다. cudoc 버전이 라이브러리 설정에 들어가므로, 이전에 수집한 모든 라이브러리는 처음부터 다시 수집합니다.
- 이제 사용자 `transforms`는 페이지의 `yaml` 노드도 만나고, 내보낸 AST(`@cudoment/cudoc/embed`)는 기본으로 `yaml`·`toml` 노드를 버립니다(`DEFAULT_DROPPED_NODE_TYPES`).
- Nextra 지원 범위는 이후의 모든 4.x가 아니라 빌드되는 버전, 즉 4.6.0과 zod를 4.4 미만으로 고정한 4.6.1입니다. Nextra 사이트는 4.6.0을 유지하거나 4.6.1에서 `overrides`에 `"zod": "4.3.6"`을 추가하고, Next.js 16에서는 `next dev --webpack`과 `next build --webpack`을 씁니다.
- cudoc이 정규화하는 Docusaurus·Nextra 페이지에서는 `promoteAnchorIds`가 제목 안에 쓴 `<Anchor>`의 id를 제목에 더 이상 주지 않습니다. 그 id는 `headingAnchor`가 호스트 문법을 받는 동안 정규화가 전과 같이 읽습니다.
- 내보낸 페이지와 그 내비게이션 항목, 머리글은 `documentTitle`이 읽는 문서 제목을 씁니다. 비어 있지 않은 frontmatter `title`, 없으면 호스트가 어디에 두었든 첫 `#` 제목, 그것도 없으면 깊이와 관계없이 첫 제목입니다. 0.9.0은 비어 있는 `title`도 썼고, 없으면 최상위에 있는 깊이와 관계없는 첫 제목을 썼습니다.
- `cudoc-export/print`는 `writePrintOutputs`, `printStylesheet`, `fillVolumePageNumbers`, `resolveVolumeOptions`, `volumeId`, `printFileName`과 상수, 타입만 내보냅니다. `namespaceIds`, `localizeAssets`, `urlPath`처럼 인쇄 HTML이 페이지마다 거치는 단계는 이제 내부용입니다.
- 컴파일 진단 `duplicate-heading-id`는 다른 컴파일 진단과 같은 표기인 `DUPLICATE_HEADING_ID`가 되었습니다. `ignoreDiagnostics`에 이 코드를 적었다면 새 코드로 바꿉니다.
- Word 파일은 `file:` 링크를 `javascript:` 링크처럼 글자로만 남기고 `unsafe-link`로 보고합니다. 독자의 컴퓨터나 네트워크에 있는 파일을 열 수 있기 때문입니다.
- `cudoc lsp`는 `outDir`의 라이브러리를 수집한 컴파일러나 호스트가 설정과 다르면, 사이트 빌드가 읽는 라이브러리를 바꾸지 않도록 아무것도 수집하지 않고 둘을 밝힌 오류를 기록합니다.
- `cudoc-export`는 내부용이던 `LinkTarget`, `StagingContext`, `InternalOptions`와 이 타입을 받던 `buildSite` 시그니처를 더 이상 내보내지 않습니다. `buildSite`는 `SiteOptions`를 받아 `SiteResult`를 돌려주며, `afterStaging`과 `printOutputs`는 알 수 없는 옵션으로 거부합니다.
- 호스트 사이트에서 `danger`와 `error`를 읽어 들인 `caution` 콜아웃은 내보내기처럼 빨간색입니다. 지금까지 `@cudoment/cudoc/styles.css`는 이 콜아웃을 경고처럼 호박색으로 그렸습니다.
- 기준 경로가 있는 라이브러리의 `documents` 디렉터리로 만든 데이터셋은 이제 기준 경로 다음 조각을 scope로 씁니다. 첫 경로 조각을 scope로 쓰려면 AST를 다른 곳에 복사합니다.
- `buildExport`는 `page`, `page.margin`, `pdf`, `docx`, `volume.cover`, `volume.contents`, `tokens`에 없는 키와 `portrait`·`landscape`가 아닌 `page.orientation`, 호출자가 넘긴 `afterStaging`·`printOutputs`를 거부합니다. 이전에는 모두 무시했습니다.
- 언어별 `header.links` 제목은 내비게이션 제목과 같이 `locales`가 있어야 하며 그 코드만 쓸 수 있습니다.
- 가이드를 따른 Docusaurus 사이트는 `serialize-javascript` 고정값을 [GHSA-m5mm-p8h7-m29v](https://github.com/advisories/GHSA-m5mm-p8h7-m29v)를 고친 7.1.3으로 올립니다.
- Nextra 4.6.0과 zod를 고정한 Nextra 4.6.1 모두 [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)를 고친 zod 4.6.6보다 오래된 zod를 쓰며, Nextra 4.6.1은 zod 4.6.6과 함께 빌드되지 않습니다. `npm audit`는 이 권고를 zod 4.3.6 고정에서만 보고하고, Nextra 4.6.0이 담은 zod 4.0 베타에서는 보고하지 않습니다. 가이드는 cudoc이 검증했고 override 없이 빌드되는 4.6.0을 권합니다.

## 0.9.0

Eleventy의 frontmatter를 `gray-matter` 없이 읽고, 내보낸 홈 페이지가 목차를 표시하며, 언어 메뉴와 테마 메뉴가 드롭다운이 되고, 예제를 Next.js 16.4.2, Nextra 4.6.0, Eleventy 3.1.7에서 검증합니다.

- `cudoc-eleventy`가 더 이상 `gray-matter`에 의존하지 않고 Eleventy의 gray-matter와 같은 규칙으로 frontmatter를 분리하므로, 수집 단계에서도 Eleventy가 렌더링하는 본문을 그대로 렌더링합니다. YAML frontmatter는 다른 호스트와 같은 YAML 파서로, `---json` frontmatter는 JSON으로 읽습니다. → [markdown-it 내부 동작](./api-reference/adapters.ko.md#markdown-it)
- `MarkdownItHost`의 `frontmatter` 훅이 두 번째 인수로 수집 중인 문서의 `id`와 `filePath`를 받습니다.
- Docusaurus 가이드가 기존 `overrides`에 `postcss-selector-parser` 7.1.6과 `tinypool` 2.2.0을 더해 고정합니다.
- 예제는 Next.js 16.4.2, Next.js 15.5.28 기반의 Nextra 4.6.0, Eleventy 3.1.7에서 검증합니다. Eleventy 3.1.7의 의존성에는 Eleventy 3.1.6에서 `npm audit`가 보고하는 보안 권고가 없습니다. → [지원 버전](./README.ko.md#지원-버전)
- 내보낸 사이트의 홈 문서도 다른 페이지처럼 오른쪽에 목차를 표시합니다. 나열할 제목이 없는 페이지는 빈 목차 열을 그리지 않고, 생성된 랜딩 페이지는 사이드바의 좁은 열 대신 화면 폭 전체를 씁니다. → [홈, 헤더, 목차](./export.ko.md#홈-헤더-목차)
- 언어 메뉴는 페이지의 언어를 보여 주고 다른 언어를 펼쳐 보이는 드롭다운이 되었고, 테마 메뉴도 브라우저의 기본 select 대신 같은 드롭다운을 씁니다. 두 메뉴 모두 사이트의 색으로 그려지고, 메뉴 밖을 누르면 스크립트 없이 닫히며, `themeSwitch`를 켜면 Escape로도 닫힙니다.

업그레이드할 때 확인할 사항:

- frontmatter를 JavaScript(`---js`)로 쓴 Eleventy 페이지는 frontmatter를 실행하는 대신 파일 경로를 알리며 수집에 실패합니다. YAML로 바꿔 써야 합니다.
- Eleventy 페이지의 frontmatter는 다른 호스트와 마찬가지로 YAML 1.2로 읽습니다. 날짜는 날짜 값이 아니라 작성한 텍스트 그대로 수집되고, `<<`는 병합이 아닌 일반 키로 읽히며, 매핑이 아닌 frontmatter는 파일 경로를 알리며 수집에 실패합니다.
- 가이드를 따라 만든 Docusaurus 사이트는 새 `overrides` 두 개를 더하고 다시 설치합니다.
- Next.js는 이제 예제가 검증하는 16.4부터 지원합니다. Next.js 16.3을 쓰는 사이트는 계속 지원을 받으려면 16.4 이상으로 올려야 합니다.
- 언어 링크(`.languages ul`, `.languages a`)나 테마 select(`.theme-switch select`)의 모양을 바꾸던 `css` 파일은 이제 `.menu > summary`와 `.menu-list`의 항목을 대상으로 고쳐 씁니다.

## 0.8.0

HTML 내보내기에 세 모드(`site`, `standalone`, `annotate`), 호스팅하는 리뷰, `navigation` 파일, `locales`, `css` 목록, 라이트·다크 테마 메뉴가 생기고, cudoc 문서가 `cudoc-export`로 만든 웹사이트가 됩니다.

- HTML 내보내기에 세 가지 모드가 생겼습니다. 기본값인 `mode: "site"`는 사이트를 쓰고, `mode: "standalone"`은 문서마다 스타일, 그림, 테마 메뉴를 품은 HTML 파일 하나를 써서 첨부 파일로 보내고 어느 폴더에서든 열 수 있게 하며, `mode: "annotate"`는 리뷰 메모를 받는 페이지를 씁니다.
- 단일 페이지를 쓸 때 `documents`(`--document`)로 쓸 페이지를 고르고, 단일 페이지 실행은 페이지마다 바깥에서 필요로 하는 것을 `dependencies`와 표준 오류로 알려 주며, `strict`(`--strict`)를 켜면 무엇이든 필요한 페이지가 있을 때 실패합니다. → [HTML의 세 가지 형태](./export.ko.md#html의-세-가지-형태)
- 리뷰를 호스팅할 수 있으며, `annotate.target: "hosted"`는 메모 런타임을 페이지 옆에 둔 사이트를 쓰고 꼭 지정해야 하는 `reviewId`로 리뷰마다 메모를 따로 보관합니다. `annotate.inbox.github`를 지정하면 메모를 채운 저장소의 이슈 양식을 여는 _GitHub에서 제출 작성_ 버튼이 생기고, 단일 페이지를 메모와 함께 저장한 사본은 어느 폴더에서든 스타일과 메모를 갖춘 채 열립니다. → [피드백 받기](./export.ko.md#내보낸-사이트에서-피드백-받기)
- `navigation`은 YAML 파일이나 목록으로 쓰며, 파일 항목은 그 문서 하나, 폴더 항목은 그 안의 모든 문서이고 `exclude`, `order`, `page`, `depth`, `collapsed`로 다듬으며, 그룹과 외부 링크도 넣을 수 있습니다. `hidden`은 목록에 보이지 않게 문서를 게시하고, 내비게이션이 나열한 문서와 홈 페이지가 곧 모든 형식이 게시하는 것이며, 결과의 `omitted`가 빠진 문서와 그 이유를 알려 줍니다. → [내비게이션](./export.ko.md#내비게이션)
- `locales`는 `guide.md`의 한국어판 `guide.ko.md`처럼 파일 접미사로 찾는 언어를 더합니다. 언어마다 자기 내비게이션, 홈, 언어 메뉴를 그리고, cudoc이 갖고 있지 않은 언어의 화면 문구는 `ui`로 지정합니다. `home`, `header.links`, `toc`가 나머지 틀을 정하고, `sourceLinks`와 `mounts`는 문서가 아닌 파일로 가는 링크를 저장소나 사이트에 복사한 폴더로 보냅니다.
- `css`에 목록을 줄 수 있습니다. 사이트는 파일마다 `cudoc-css/` 아래에 따로 연결하고 그 파일이 불러오는 것을 옆에 복사하며, 단일 페이지는 내용을 페이지 안에 담습니다.
- 테마 전환은 시스템, 라이트, 다크를 차례로 바꾸던 버튼에서 라이트와 다크 중에 고르는 메뉴로 바뀌었습니다. 고르기 전에는 페이지가 시스템 설정을 따르고 메뉴가 그 설정이 어느 쪽인지 보여 줍니다. 문구는 페이지의 언어를 따르며, `ui`에서 `system` 문구는 빠졌습니다.
- 떠 있는 메모 버튼은 다른 곳을 누르거나, Escape를 누르거나, 선택을 해제하면 사라집니다. 키보드로 선택했다면 Tab으로 버튼에 갈 수 있습니다.
- 묶음 파일에는 기본 언어의 문서가 내비게이션 순서로, 그다음 `hidden` 문서가 들어가며, `volume.order`가 지정한 문서를 앞으로 옮깁니다. 번역본은 각자의 PDF와 Word 파일로 씁니다.
- cudoc 문서가 이제 [웹사이트](https://cudoment.github.io/cudoc/index.ko.html)로도 제공됩니다. `cudoc-export`가 README와 `docs/`로 만들고, 내보내기 예시를 가이드 옆에 함께 게시합니다. 게시 워크플로는 릴리스의 모든 패키지가 그 커밋에서 npm에 올라가고 태그까지 붙은 뒤에 사이트를 배포하며, 수동 실행에서 롤백을 요청하지 않는 한 새 버전 위에 옛 버전을 올리지 않습니다.
- 주석 보고서는 라이브러리 경로를 작업 디렉터리 기준의 상대 경로로 출력하고, 저장한 리뷰 페이지는 32 MiB까지 불러올 수 있습니다.
- `@cudoment/cudoc/node/library`가 `globToRegExp`와 `globMatcher`를, `@cudoment/cudoc/node/resolve-embed`가 `compareNames`, `documentName`, `nfc`를 export합니다.

업그레이드할 때 확인할 사항:

- `annotations: true`와 `--annotations`는 없어졌습니다. 대신 `mode: "annotate"`(`--mode annotate`)를 쓰며, 기본으로 단일 페이지를 씁니다. 예전 옵션처럼 사이트 전체에 런타임을 실으려면 `annotate.target: "hosted"`와 `reviewId`를 지정합니다.
- 내비게이션 항목은 문서를 확장자까지 적고(`guide.md`), 확장자가 없는 이름은 폴더입니다. 내비게이션에 없는 문서를 더 이상 뒤에 덧붙이지 않으므로, 목록에 넣거나 `hidden`에 적거나 `navigation`을 빼서 모든 문서를 나열하게 합니다. `relative` 링크에서 사이트가 게시하지 않는 문서로 가는 링크는 오류입니다.
- `buildSite`와 `buildExport`는 모르는 옵션을 받으면 그 이름을 들어 거부합니다.
- `css` 파일은 `cudoc.css` 뒤에 덧붙이지 않고, 별도 파일로 `cudoc.css` 다음에 연결합니다.
- 홈 페이지에는 목차 열이 없고, 헤더의 사이트 제목은 내비게이션의 첫 문서가 아니라 그 언어의 홈으로 연결됩니다.
- GitHub Pages의 루트에는 내보내기 쇼케이스 대신 문서 사이트가 열리고, 쇼케이스는 `showcase/`로 옮겼습니다.

## 0.7.0

`render: { type: tree }` 임베드가 폴더의 문서를 접히는 트리로 그리고, `resolveTree`가 그 줄을 데이터로 돌려주며, 트리의 `order`가 아무것도 가리키지 않으면 `cudoc check`가 경고하고, 사본 안의 사본은 링크마다 경로를 한 번만 조정합니다.

- [`render: { type: tree }` 임베드](./embedding.ko.md#문서-트리-그리기)가 폴더가 문서를 품은 모양대로 문서를 나열합니다. `X.md` 아래에 폴더 `X/`의 문서를, 폴더의 `index.md` 아래에 나머지 문서를 두고, `headings`를 쓰면 문서의 절도 그 아래에 둡니다. 줄마다 연결된 제목과 요약을 보이고, 단계는 모든 호스트와 독립 HTML에서 스크립트 없이 열리는 `details`로 접으며, 인쇄 HTML, PDF, Word에서는 `print` 단계까지 중첩 목록으로 펼쳐 씁니다.
- `resolveTree`가 같은 줄을 데이터로 돌려줍니다. 같은 라이브러리와 명세에는 같은 결과를 내므로, 트리를 자기 형식으로 쓰는 프로그램이 쓸 수 있습니다. `buildEmbedTree`는 받은 줄을 렌더링합니다.
- 트리에서는 추출기가 계산하는 줄을 `node`로 함께 받고, 그 아래 줄은 이미 채워져 있으므로 열 하나로 하위 단계의 합계를 낼 수 있습니다.
- `cudoc check`는 트리의 `order`가 첫 층의 아무것도 가리키지 않으면 `unmatched-tree-order` 경고를 내고, 트리의 없는 폴더나 문서는 다른 임베드와 같이 보고합니다.
- `@cudoment/cudoc/styles.css`와 내보낸 사이트는 트리를 개요 모양으로 그리며, 호스트가 직접 쓴 `details`에 입히는 상자 모양은 씌우지 않습니다.
- 사본 안의 사본은 링크마다 경로를 한 번만 조정합니다. `routes`가 어떤 문서에 다른 문서의 경로를 주어도, 중첩된 사본, 요약 표, 트리의 링크가 다른 문서의 경로로 바뀌지 않고 처음 받은 경로를 유지합니다. 수집 범위 밖으로 올라가는 상대 경로도 계속 같은 파일을 가리킵니다.

## 0.6.0

지원 버전을 문서로 정리했고, `cudoc-docusaurus`와 `cudoc-eleventy`가 지원하는 호스트 버전을 선언하며, 호스트 가이드마다 릴리스 전에 새 프로젝트에서 따라 해 보고, 수집, `cudoc check`, 임베드, 내보내기, Word에 아래의 수정이 들어갑니다. 0.5에서 올릴 때 바뀌는 호출도 여기에 적었습니다.

- 모든 변경을 검증하는 호스트 버전과, 1.0.0 전까지 부 버전과 수 버전이 각각 호환을 유지하는 범위를 [지원 버전](./README.ko.md#지원-버전)에 정리했습니다.
- `cudoc-docusaurus`는 `@docusaurus/core` `^3.10.0`을, `cudoc-eleventy`는 `@11ty/eleventy` `^3.1.0`을 피어로 선언합니다. 각 어댑터가 지원하는 버전부터이므로, npm은 지원하는 호스트 옆에만 어댑터를 설치합니다. 사이트가 선언한 범위가 허용하면 호스트를 올리고, 그렇지 않으면 `ERESOLVE`로 거부합니다.
- 호스트 가이드마다 요구하는 파일을 모두 보여 주고 그 파일이 가져오는 패키지를 모두 설치하며, 릴리스 전에 새 프로젝트에서 단계대로 따라 해 봅니다. VitePress와 Eleventy의 설치 명령에서는 어댑터가 함께 설치하는 `cudoc-markdown-it`을 뺐습니다.
- Docusaurus와 Nextra 가이드는 예제처럼, `npm audit`이 보안 권고를 보고하는 호스트 의존성을 수정판으로 고정합니다. 가이드대로 만든 사이트가 예제에 없는 권고를 보고하면 가이드 검사가 실패합니다. Next.js 예제와 가이드는 `next/og`의 심각한(critical) 보안 권고를 고친 Next.js 16.3.8로 검증합니다.
- 강제로 종료된 빌드를 복구할 때는 cudoc이 붙인 이름에 cudoc의 소유 표시가 정확히 들어 있는 디렉터리만 옮기거나 지우므로, 다른 사람이 출력 옆에 둔 디렉터리는 그대로 남습니다. 지울 수 없는 잔여물이 있으면 게시가 실패하되 잠금은 풀립니다.
- 다른 루트 안에 있는 루트가 자기 파일을 가집니다. 각 파일은 안쪽 루트의 기준 경로로 한 번만 수집되고, 심볼릭 링크로 설정한 루트는 실제 경로로 맞추며, 그렇게 한 디렉터리를 두 번 나열하면 거부합니다.
- Word 표에서 위 셀이 행을 병합하면 헤더 셀의 `min-width`가 그 셀이 실제로 놓인 열에 적용됩니다.
- README와 데이터셋 가이드가 데이터셋을 실제 모습대로 설명합니다. 문서는 수집한 그대로이고, 임베드는 원본을 가리키는 블록으로 남으며, 중복 제거는 하지 않습니다.
- `routeSuffix`가 `""`나 `"/"`이면 `index.md`가 `/docs/index`가 아니라 `/docs/`처럼 디렉터리의 경로를 받으므로, 그 설정에서 `guide/index.md` 옆에 `guide.md`가 있으면 이제 `duplicate document route`로 실패합니다. `..`를 포함해 디렉터리로 가는 링크는 `cudoc check`, 임베드된 내용, 내보내기에서 모두 그 디렉터리의 index 문서에 닿으며, `guide/`는 `guide.md`가 옆에 있어도 index 문서를 가리킵니다.
- Docusaurus가 자체 이미지 요소로 바꾸는 Markdown 이미지를 페이지를 수집할 때 기록하므로, 임베드와 `cudoc check`와 내보내기가 모두 이를 이미지로 다룹니다. 자산으로 검사하고 복사하며 Word에도 그리고, 이를 임베드하는 다른 디렉터리의 페이지는 링크한 로컬 파일과 마찬가지로 자기 디렉터리에서 본 경로로 이미지 파일을 require합니다.
- 가이드가 보여 주는 Docusaurus 수집기는 사이트 빌드와 같이 루트 기준 이미지를 `static`에서 찾고, `createCompilerCapture`의 새 `aliases` 옵션으로 `@site/static/…`로 쓴 이미지를 사이트가 서비스하는 주소로 기록합니다.
- 임베드한 구역의 raw HTML은 이미 경로를 조정하던 `href`, `src`처럼 `poster`, `data`, `srcset`, `xlink:href` 경로도 임베드하는 페이지 기준으로 옮기므로, 내보내기가 그 구역이 불러오는 자산을 모두 찾습니다.
- 내보내기는 복사한 파일의 경로를 URL로 적으므로, 공백, 쉼표, `%`, `#`, `?`가 든 파일 이름도 `src`와 `srcset` 모두에서 불러오고, 그런 파일로 가는 링크도 사이트, 인쇄 HTML, Word 모두에서 그 파일에 닿습니다.
- `links: "host"`에서 `private` 문서로 가는 링크는 문서별 파일에서처럼 묶은 인쇄 HTML, PDF, Word에서도 배포 주소를 가리킵니다. 묶은 파일에 없는 앵커나 북마크로 바꾸지 않습니다.
- 자원이 `private` 문서의 파일에 닿으면 그 경로가 루트이든 `assetDirs` 디렉터리이든 심볼릭 링크이든, 모든 정책에서 내보내기를 멈춥니다. 문서의 원문을 출력에 복사하지 않습니다.
- 임베드한 절 안에서 수집 범위 밖으로 올라가는 상대 경로는 루트에서 잘려 다른 파일을 가리키는 대신, 임베드하는 페이지에서도 같은 파일을 가리킵니다.
- VitePress와 Eleventy에서 이미지의 대체 텍스트는 remark 호스트와 같이 레이블을 코드와 엔터티까지 포함한 일반 텍스트로 읽은 값입니다. Eleventy는 이 값을 비워 두었습니다.
- 설정 해시에 `@cudoment/cudoc` 버전이 들어가므로, 업그레이드한 뒤 처음 하는 수집은 `cudoc collect --watch`를 포함해 이전 릴리스가 만든 트리를 재사용하지 않고 모든 문서를 다시 컴파일합니다. 업그레이드한 뒤에는 다시 수집해야 합니다. 이전 릴리스가 기록한 라이브러리는 읽을 때 그대로 쓰입니다.
- 임베드에 대해서는 `cudoc check`가 `available`에 제목 id만 제시합니다. raw HTML이 선언한 id는 구역을 시작하지 않기 때문입니다. `no sections matched` 메시지에는 문서 이름을 한 번만 적습니다.
- `cudoc check`는 원문을 Markdown(`.mdx`는 MDX)으로 파싱하고 각 펜스를 글자로 블록과 대조하여 임베드 펜스를 찾습니다. 따라서 더 긴 펜스나 들여쓴 코드 예제 안에 보여 준 `cudoc-embed` 펜스가 뒤에 오는 임베드의 줄을 가져가지 않고, 인용문·콜아웃·목록 항목 안의 임베드도 자기 줄을 유지하며, 열은 줄의 처음부터 셉니다. 호스트가 Markdown과 다르게 읽는 블록에는 글자가 다른 블록의 줄을 붙이지 않고 위치를 비워 둡니다.
- `cudoc-eleventy`를 `eleventyConfig.addPlugin`에 넘기면 markdown-it 안에서 실패하지 않고, `createMarkdownRenderer`를 `setLibrary`에 넘기라고 안내합니다.
- `cudoc check`는 `collect`가 쓴 라이브러리를 읽기만 하고 아무것도 쓰지 않으므로, 검사가 `embeds.json`을 다시 만들거나 지우지 않습니다. 수집한 뒤에 실행해야 합니다.
- 라이브러리와 준비된 임베드를 함께 게시하므로, 수집이나 감시 회차가 실패해도 마지막으로 성공한 한 쌍이 그대로 남습니다. 두 번째로 쓰려는 프로세스는 출력을 쥐고 있는 프로세스를 밝히며 거부되고, 비정상 종료한 실행이 남긴 잠금은 복구됩니다.
- `cudoc collect`가 준비할 수 없는 임베드를 파일과 블록 번호와 함께 한 메시지에 모두 적고, cudoc 자체 오류는 스택 없이 출력합니다.
- `cudoc check`가 자기 자신을 포함하는 임베드를 보고하고(`cyclic-embed`), 원시 HTML에 선언된 id를 앵커로 인정하며, 잘못된 `%`가 든 링크를 멈추지 않고 보고합니다. 임베드 원본을 빌드와 똑같이 해석하고, 원본에 적은 절 옆의 `select`도 빌드와 똑같이 적용하며, 임베드의 사본을 `replace` 규칙이 다시 쓴 뒤의 모습으로 읽습니다. 따라서 실제로 복사되는 내용을 검사하고 빌드가 실패하는 곳에서 함께 실패합니다.
- VitePress와 Eleventy에서 `cudoc collect`가 front matter가 있는 문서에 내는 진단이 본문 기준 줄이 아니라 파일 기준 줄을 가리킵니다.
- VitePress와 Eleventy에서 `\r\n` 줄 끝으로 저장한 문서도 `\n`으로 저장한 문서와 똑같이 수집하고 임베드하고 치환합니다. 이전에는 수집이 `cannot map processed Markdown back to source`로 멈췄지만, 이제 위치와 절 범위가 markdown-it이 읽는 텍스트가 아니라 파일 자체의 텍스트를 가리키고, 라이브러리를 기준으로 렌더링하는 페이지도 그 문서와 대응시킵니다. Eleventy 사이트도 이런 페이지를 다른 템플릿 엔진이 고쳐 쓴 것으로 보고 거부하지 않으며, `cudoc-markdown-it`은 markdown-it이 읽는 방식대로 읽은 원문과, 그 offset을 원문 기준으로 되돌리는 함수를 함께 돌려주는 `markdownItText`를 export합니다.
- id가 같은 제목 두 개가 임베드될 때 각자 자기 절을 가지며, 중복은 여전히 보고됩니다. 그런 id에 쓴 `replace` 규칙은 첫 번째 절을 두 번 치환하지 않고 거부됩니다.
- 제목이 다른 블록 안에 있는 절에 쓴 `replace` 규칙은 그 절의 원문을 따로 읽었을 때의 글자를 치환합니다. 목록 항목의 표시와 들여쓰기는 떼어 내므로 목록 항목 안의 절은 모든 호스트에서 수집한 구조대로 치환됩니다.
- 바깥 블록의 일부가 원문에 남는 경우(인용문이나 콜아웃의 `>`, 각주의 들여쓰기, 마지막 절 뒤에 오는 컴포넌트나 `:::` 컨테이너의 닫는 줄)에는 규칙이 일치하든 안 하든 이유를 알리는 메시지와 함께 거부합니다. `cudoc check`는 그 경우를 `unreplaceable-embed-section`으로 보고하며, 규칙 없이 임베드하면 그 절은 그대로 들어갑니다.
- 임베드된 내용 안에서 앵커나 쿼리만 적은 링크가 그 내용을 가져온 문서를 가리킵니다.
- `cudoc collect --watch`가 디렉터리의 이름이 바뀌거나 삭제될 때도 다시 수집하며, 감시기 오류로 프로세스를 끝내지 않고 그 오류를 `onError`에 넘깁니다.
- VitePress와 Eleventy에서 cudoc이 바꾸지 않는 것은 호스트가 직접 렌더링하며, 코드 강조, `<script setup>`과 `<style>` 블록, 이모지, `[[toc]]`, 코드 그룹, 사이트 자체 컨테이너가 여기에 속하고 컨테이너 안의 내용은 cudoc이 그대로 읽습니다. 다른 제목에 적힌 id와 같은 값으로 slug되는 제목은 번호를 붙여 구분하고, `[[toc]]`는 cudoc이 정한 id로 연결됩니다. VitePress `rewrites`가 동작하고, `<!--@include-->`와 임베드를 함께 쓰는 페이지는 명확한 메시지와 함께 실패하며, 진단은 출력되거나 `onDiagnostic`으로 전달됩니다.
- Docusaurus가 cudoc이 정한 제목 id를 그대로 유지하므로 `(#v1.2)`가 그곳에서도 `v1.2`로 남습니다. Nextra는 여전히 모든 id를 슬러그로 바꾸며, 영문 소문자·숫자·하이픈으로 된 id는 모든 호스트에서 같습니다.
- 어댑터가 스스로 정해야 하는 옵션(Docusaurus와 Nextra의 `host`, `headingIds`, `toc`, markdown-it의 `components`)을 무시하지 않고 거부합니다.
- 0.5에서 올릴 때는 다음 호출이 바뀝니다. `createHostPlugins(options, adapter, host)`는 세 번째 인자로 호스트(`"docusaurus"` 또는 `"nextra"`)를 반드시 받습니다. `/transforms/table-cell-list/index`처럼 `/transforms/table-cell-list`와 `/transforms/table-column-layout` 아래의 경로는 더 이상 해석되지 않고, `render` 없이 호출한 `tokensToAst`는 callout이 아닌 컨테이너를 callout으로 읽지 않고 오류를 발생시킵니다.
- 0.5에서 올릴 때는 다음 결과도 바뀝니다. `readPreparedEmbeds`는 호출 사이에 공유하는 캐시 객체 하나를 반환하므로 블록을 고치기 전에 복사해야 하고, 인쇄 파이프라인은 자산을 `data.cudocAsset`이 아니라 `AssetMark` 목록인 `data.cudocAssets`로 표시합니다. 묶은 파일 안에서 문서의 앵커는 `cudoc-` 뒤에 `idToken(id)`를 붙인 값이므로, id에 `/`가 든 문서로 가는 인쇄 HTML 링크가 바뀌어 `#cudoc-guide%2Fstart`는 `#cudoc-guide_2f_start`가 됩니다.
- `@cudoment/cudoc/transforms/table-cell-list`와 `/transforms/table-column-layout`이 명시된 진입점이 되었고, `cudoc-remark`는 `remark-gfm`, `remark-mdx`, `remark-parse`를 설치하지 않습니다. 타입 선언에 필요한 타입 패키지가 의존성에 들어가며, markdown-it 어댑터의 `@types/markdown-it`은 선택적 피어로 남습니다. 모든 패키지가 `./package.json`을 내보내고, `snapshotSource`는 더 이상 `@cudoment/cudoc/node/library`에서 내보내지 않습니다.
- `pt`로 적거나 단위 없이 밀리미터로 적은 용지와 여백 길이가 PDF에서도 Word와 같은 크기로 인쇄되고, ASCII 밖의 제목 id도 묶은 파일 안에서 연결됩니다. 묶은 다른 문서로 가는 링크는 `linkUrls`에서 배포 주소를 인쇄하면서도 목차 쪽 번호를 어긋나게 하지 않으며, `srcset`, `poster`, `<object>`, SVG 이미지 자산도 복사됩니다. `srcset`은 브라우저처럼 읽으므로 data URL은 쉼표를 그대로 지키고 빈 후보는 건너뛰며, Word 링크는 퍼센트 인코딩된 앵커를 디코딩해 제목의 북마크에 닿습니다.
- Word가 MDX 속 HTML 표의 행 병합을 브라우저가 그리는 대로 행 그룹 안에서 `rowspan="0"`까지 포함해 옮기고, 최상위 순서 목록의 시작 번호, 작업 체크 상자, 셀 안의 줄바꿈도 옮기며, 각주에서 빼는 표를 보고하고, `javascript:` 링크 대상을 버립니다.
- `CAUTION` callout이 Word에서처럼 HTML과 PDF에서도 위험 색으로 그려지고, PDF 머리글과 바닥글이 글꼴, 크기, 색을 디자인 토큰에서 가져옵니다.
- 가로 쪽을 받는 넓은 표 바로 옆에 직접 넣은 페이지 나누기가 사이에 HTML 주석이 있든 없든 PDF와 Word에 빈 쪽을 남기지 않으며, 문서를 여는 나누기는 두 형식 모두 버리므로 문서 시작 북마크와 첫 블록의 세로 쪽이 유지됩니다.
- 검토 메모는 ISO 8601 날짜만 받아 UTC로 저장합니다. 손상된 저장본, 잘못된 공유 링크, 크기 제한을 넘는 파일은 패널을 멈추지 않고 메시지를 보여 줍니다.
- `CUDOC_SKIP_BROWSER_DOWNLOAD=0`이나 `false`는 브라우저 설치를 건너뛰지 않고 설치합니다. Playwright 자체 변수처럼 값을 그대로 비교하므로 `FALSE`는 건너뜁니다.

## 0.5.0

HTML 사이트 옆에 PDF와 Word 출력이 생기고, 묶음 파일, `page` 설정 하나, 리뷰 메모, 테마 전환이 함께 들어갑니다. MDX 호스트에서는 임베드된 절이 페이지가 컴파일될 때 접합되고, 표 임베드가 열을 직접 정의하며, `roots`가 여러 디렉터리를 하나의 라이브러리로 수집하고, `cudoc collect --watch`가 변경마다 다시 수집하며, `cudoc-html`은 `cudoc-export`가 됩니다.

- HTML 사이트와 나란히 PDF와 Word를 내보냅니다. 호출 한 번, 디자인 토큰 한 벌에서 나옵니다.
- `cudoc-pagebreak` 펜스가 페이지를 나누는 형식에서 쪽을 넘기고 사이트에서는 아무것도 보이지 않습니다.
- 문서 집합을 한 권으로 묶은 파일로도 내보내며, 문서 사이 링크가 그 안에서 해석되고 PDF와 Word 모두 표지와 목차로 시작합니다.
- `page` 설정 하나로 PDF와 Word가 같은 용지, 머리글과 바닥글, 제목 앞 쪽 나누기, 넓은 표의 가로 쪽, 인쇄된 링크 주소를 갖습니다.
- `annotations: true`를 켜면 HTML 사이트에 메모 런타임이 실립니다. 파일을 받은 사람이 글자나 블록을 골라 메모를 남기고 파일이나 공유 토큰으로 돌려줄 수 있고, `cudoc-export annotations`가 그 메모를 원문 줄 번호가 붙은 사실 기록 보고서로 정리합니다.
- `themeSwitch: true`를 켜면 HTML 사이트 머리글에 시스템·라이트·다크 버튼이 생기고 선택을 브라우저가 기억합니다. 켜지 않으면 기본 스타일이 스크립트 없이 시스템 설정을 따릅니다.
- MDX 호스트에서는 임베드된 절이 페이지가 컴파일될 때 접합되므로, 그 안의 컴포넌트는 호스트 자신의 컴포넌트 매핑으로 렌더링되고 코드 블록은 호스트의 강조기에 닿습니다. 임베드 플러그인은 더 이상 HTML 문자열을 렌더링하지 않고 `cudoc-remark/runtime`은 없어졌으며, `cudoc-remark/loader`가 재수집을 개발 서버와 빌드 캐시에 알립니다. `cudoc check`가 원본 파일에 import가 남아 있는 복사된 컴포넌트를 보고합니다.
- 표 임베드가 열을 직접 정의합니다. 각 셀의 글자가 어디서 오는지(절 제목, 첫 문단, 상위 제목, 절 안 표의 셀, 또는 수집 설정에 등록한 함수), 무엇으로 연결되는지, 어느 폭을 유지해야 하는지를 적을 수 있고, 정의한 열이 비워 둔 셀을 `cudoc check`가 모두 보고합니다.
- `roots: [{ dir, base }]`로 여러 디렉터리를 하나의 라이브러리로 수집하며 각각 자기 URL 접두어 아래에 놓입니다. `/docs/…`와 `/terms/…` 링크, 임베드 원본, 내보내기가 모두 같은 문서를 가리킵니다. `exclude`는 문서가 아닌 파일을 빼고, `private`는 내부용 문서를 수집·검사는 하되 내보내기와 데이터셋에서 빼며, `externalPaths`는 같은 도메인에서 다른 애플리케이션이 담당하는 경로를 검사기와 내보내기에 알립니다.
- `tableColumnWidths`가 표 열에 헤더 글자 기준으로 최소 폭을 지정합니다. 절마다 또는 전체에 적용할 수 있어 저자가 쓴 표의 셀에 `<div style>`을 넣을 필요가 없고, HTML 사이트, 쪽을 나누는 형식, Word가 모두 이 값을 따릅니다.
- `ignoreDiagnostics`가 프로젝트가 감수하기로 정한 진단 코드를 조용히 하고, `loadLibrary(…, { cache: true })`가 수집이 바뀌기 전까지 서버가 불러온 라이브러리를 요청 사이에 재사용하게 합니다. 저장된 트리를 읽는 소비자가 `cudocAstVersion: 1`에서 의존할 수 있는 사항을 문서로 적었습니다.
- `cudoc collect --watch`가 문서가 바뀔 때마다 다시 수집하며, 원문이 바뀐 문서만 컴파일하고 그 문서를 읽는 임베드만 다시 해석합니다. `previous` 라이브러리나 준비 결과를 넘기면 어떤 수집기든 같은 절약을 얻고, 컴파일에 실패한 문서는 라이브러리를 깨뜨리는 대신 메시지로 남습니다.
- `cudoc-html`을 `cudoc-export`로 바꿨습니다. 이 패키지가 만드는 것에 맞춘 이름입니다.

## 0.4.0

`cudoc check`가 생기고, 임베드 문제와 제목 ID 중복이 진단으로 보고되며, 문서를 호스트 선택 중심으로 재편했습니다.

- `cudoc check`가 문서 집합 전체의 깨진 링크, 앵커, 이미지, 임베드를 한 번에 찾습니다. 명령줄로도 함수로도 쓸 수 있습니다.
- 임베드의 문제를 조용히 넘기지 않고 보고합니다. 렌더링할 수 없는 컴포넌트, 아무것도 찾지 못한 `replace` 규칙, 모르는 키, 파싱되지 않는 블록이며 각각 문서와 줄 번호를 알려 줍니다.
- 제목 ID가 겹칠 때 수집을 멈추지 않고 진단으로 보고합니다.
- 문서를 호스트 선택 중심으로 재편했습니다.

## 0.3.0

Eleventy를 지원하고, 독립 HTML과 호스트 스타일시트를 재정의 가능한 토큰 위에 다시 세워 다크 테마를 갖췄습니다.

- Eleventy를 지원합니다. VitePress와 공유하는 markdown-it 계층 위에 올렸습니다.
- 독립 HTML과 호스트 스타일시트를 재정의 가능한 토큰 위에 다시 세우고 다크 테마를 갖췄습니다.

## 0.2.0

공통 문서 정규화, 절 임베드, AST 데이터셋, VitePress 지원, 독립 HTML 내보내기가 생겼습니다.

- 공통 문서 정규화, 절 임베드, AST 데이터셋을 더했습니다.
- VitePress를 지원하고, 어느 호스트에든 함께 붙일 수 있는 독립 HTML 내보내기를 더했습니다.

## 0.1.0

공통 AST 코어가 `@cudoment/cudoc`으로 옮겨 갑니다.

- 공통 AST 코어를 `@cudoment/cudoc` 안으로 옮기고, Node 진입점과 나란히 브라우저에서 안전한 API를 두었습니다.
