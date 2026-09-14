# 독립 HTML 출력

[English](./html.md) | **한국어** · [전체 가이드](./README.ko.md)

독립 HTML은 cudoc의 Markdown 문법 확장과 문서 임베드를 활용하는 선택적 추가 출력 기능입니다. Next.js(MDX), Docusaurus, Nextra, VitePress, Eleventy를 기본 문서 호스트로 유지하면서 `cudoc-html`로 같은 수집 문서와 준비된 임베드를 재사용합니다. 호스트를 바꾸거나 별도 문서 사본을 관리할 필요가 없으며, 다른 호스트 없이 단독으로 사용할 수도 있습니다. 정적 서버에 배포하거나 디스크에서 바로 열 수 있으며 별도 애플리케이션 구조를 만들 필요가 없습니다.

## Markdown에서 생성

```sh
npm install @cudoment/cudoc cudoc-html
npx cudoc-html build docs --out-dir site
```

`docs/` 아래에 `.md` 문서를 작성합니다. 임베드를 포함한 전체 예시는 [시작하기](../README.ko.md#시작하기)를 참고하세요. 생성기는 문서를 수집하고 임베드를 처리한 뒤 HTML, 스타일, 로컬 자산을 출력합니다. 문서 탐색, 제목 목차, 알림, 스크롤 가능한 표, 코드 강조를 제공합니다.

## 기존 사이트와 함께 생성

먼저 [호스트 가이드](./README.ko.md#호스트-선택)의 수집기를 실행합니다. 실제 호스트 컴파일러의 결과를 수집하고 임베드를 준비해야 합니다. 해당 프로젝트에 `cudoc-html`을 설치하고 `site.config.mjs`를 작성합니다.

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
npx cudoc-html build --config site.config.mjs
```

수집 이후에는 기본 사이트 빌드와 HTML 생성을 어느 순서로 실행해도 됩니다. `library`는 저장된 AST, 호스트의 제목 ID, 문서 경로, 준비된 임베드를 재사용하며 비동기 호스트에서 컴파일한 치환 결과도 포함합니다. 수집 라이브러리를 다시 만들거나 수정하지 않고 읽기만 합니다. 기본 사이트와 HTML은 출력 디렉터리를 분리합니다.

문법, 컴포넌트 의미 매핑, 컴파일러 설정은 수집기에서 관리합니다. `library`를 지정한 HTML 설정에는 이러한 옵션을 중복 지정하지 않습니다. 문서·경로·컴파일러 설정을 바꾸면 다시 수집하고 임베드를 준비합니다. HTML은 현재 편집 중인 파일이 아닌 수집된 스냅샷을 사용합니다. 임베드 없는 문서는 준비 파일이 없어도 되지만 임베드가 있으면 준비 파일이 필요합니다.

수집 후 명령 하나로 실행할 수도 있습니다.

```sh
npx cudoc-html build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/ --asset-dir public
```

## 하이퍼링크 동작 선택

| `links` / `--links` | 동작                                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `relative` (기본값) | 문서를 로컬 `.html` 파일로 연결하고 로컬 링크 파일을 복사합니다. 외부 URL은 유지합니다.                                                   |
| `host`              | 내부 하이퍼링크를 기본 사이트의 배포 경로로 연결합니다. HTTPS, `mailto:` 등 외부 URL은 유지합니다. `hostUrl` / `--host-url`이 필수입니다. |
| `none`              | 외부 URL을 포함한 모든 하이퍼링크를 제거하고 텍스트·중첩 서식·이미지는 유지합니다.                                                        |

`sourceRoot`와 모든 `assetDirs` 루트를 벗어나는 로컬 링크는 어떤 정책에서도 해석할 수 없으므로 빌드가 실패하며, 그 링크와 링크를 담고 있는 문서를 함께 알려 줍니다. 작성한 링크, raw HTML, 임베드 본문·표, 생성된 탐색 메뉴·목차·각주에 모두 적용합니다. 로컬 이미지와 스타일은 모든 모드에서 유지합니다. `none`은 클릭 가능한 앵커를 제거하며 스타일시트의 `<link>` 같은 렌더링 자원은 유지합니다. 제거한 하이퍼링크에서만 참조하는 파일은 복사하지 않습니다.

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
npx cudoc-html build --config site.config.mjs
```

`navigation`에는 확장자 없는 문서 ID를 지정합니다. 지정한 문서가 먼저 나오고 나머지가 뒤에 이어집니다. `css`는 기본 스타일 뒤에 로컬 CSS 파일을 추가합니다. `index.md`가 없으면 시작 페이지를 생성합니다. JSON 설정도 사용할 수 있습니다.

기본 스타일은 사용자의 라이트·다크 시스템 설정을 따르며, 그 동작에 스크립트가 필요하지 않고 모든 색을 두 테마가 함께 정의하는 사용자 정의 속성에 담고 있습니다. 디자인을 바꾸려면 규칙을 다시 쓰지 말고 그 속성만 재정의하는 파일을 `css`에 지정합니다. 전체 토큰 목록은 [어댑터 레퍼런스](./api-reference/adapters.ko.md#html)에 있습니다.

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
```

위 설정은 Markdown을 직접 수집합니다. 기존 호스트 라이브러리를 재사용하려면 `library`를 추가하고 `syntax` 같은 수집 옵션은 제거합니다.

## 자산과 사용자 컴포넌트

소스 기준 상대 경로 이미지는 `sourceRoot`에서 찾습니다. URL 루트에 대응하는 추가 자산 디렉터리는 `assetDirs: ["public", "static"]` 또는 반복 가능한 `--asset-dir`로 지정합니다. 예를 들어 `/img/logo.svg`는 `public/img/logo.svg`에서 복사할 수 있습니다. `hostUrl`을 설정하면 `/project/img/logo.svg`처럼 배포 기본 경로가 포함된 자산 경로도 처리합니다. 참조한 로컬 이미지와 스타일은 `host`·`none`에서도 복사한 뒤 상대 경로로 연결하며, 직접 작성한 외부 리소스는 외부 주소를 유지합니다.

정규화된 호스트의 알림·제목·링크·표는 수집한 AST에서 렌더링합니다. React·Vue 컴포넌트 코드를 실행하지는 않습니다. AST에 사용자 컴포넌트가 남아 있으면 ESM 설정 또는 `buildSite` API에서 HTML 콜백을 지정합니다.

```js
const renderOptions = {
  components: {
    ProductMark: () => '<strong class="product-mark">Product</strong>',
  },
}
```

이 `renderOptions`를 사이트 옵션에 추가합니다. 콜백은 HTML을 반환하며, 반환한 HTML의 링크에도 선택한 정책이 적용됩니다. 노드와 자식 인자는 [렌더링 계약](./api-reference/document.ko.md#컴포넌트와-렌더링)을 참고하세요. 지원하지 않는 컴포넌트는 누락시키지 않고 오류로 보고합니다. 소스 HTML과 렌더러 출력은 cudoc이 정화하지 않습니다.

## 공유와 배포

`site/index.html`을 열거나, `site/` 전체를 다른 컴퓨터에 복사하거나, 정적 호스트에 업로드합니다. 공유 디렉터리 안에서 탐색하려면 `relative`, 기본 사이트로 연결하려면 `host`, 클릭 가능한 링크 없이 읽으려면 `none`을 사용합니다. CSS와 복사한 로컬 자산은 상대 경로를 사용합니다. 생성된 사이트 기본 구조에는 클라이언트 fetch, JavaScript, CDN이 필요하지 않습니다. 모든 자산을 한 HTML 파일에 넣는 방식이 아닌 디렉터리 출력입니다.

사이트를 갱신하려면 다시 빌드합니다. `outDir`는 소스·라이브러리·자산 디렉터리와 분리하고 cudoc 전용 출력 디렉터리를 사용하세요. 임시 디렉터리에서의 사이트 생성에 실패하면 이전 사이트를 유지합니다. `library`를 생략하면 문서 라이브러리를 별도 출력하며 기본 경로는 사이트 디렉터리의 부모 아래 `.cudoc/documents`입니다. `library`를 지정하면 해당 입력은 변경하지 않습니다.

## 실제 환경에서 확인할 사항

- 수집한 경로·커스텀 slug·배포 기본 경로와 `hostUrl`이 기본 사이트의 실제 배포 URL에 맞는지 확인합니다. 생성기는 링크를 변환하지만 원격 URL의 접근 가능 여부를 검사하지 않습니다.
- 출력 디렉터리 전체를 다른 위치에 복사한 뒤 독자가 사용하는 브라우저에서 `file://`로 엽니다. 탐색·이미지·스타일·임베드 표·인쇄를 확인합니다. 단일 파일 번들은 아닙니다.
- 호스트 고유 위젯과 자산을 확인합니다. 동적 React·Vue 코드는 별도 HTML 렌더러가 필요하며 CSS import·`url()` 의존성과 반응형 `srcset` 자원은 재귀적으로 묶지 않습니다.
- 기본 사이트와 HTML 출력 디렉터리를 분리합니다. 문서 변경 후 다시 수집·준비하고 출력합니다. 공유 전 포함 문서와 스코프를 검토합니다. HTML 출력은 공개 권한 필터가 아닙니다.

저장소의 [호스트 라이브러리 출력 검사](../scripts/check-html-hosts.mjs)는 다섯 실제 호스트 라이브러리에 세 링크 정책을 적용하고, 소스·라이브러리·기본 사이트의 모든 출력 파일을 해시로 비교해 변경되지 않았는지 검증합니다.

코드에서 사용하려면 [buildSite 옵션과 동작](./api-reference/adapters.ko.md#html)을 참고하세요.
