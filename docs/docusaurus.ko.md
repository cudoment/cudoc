# Docusaurus에서 cudoc 사용하기

[English](./docusaurus.md) | **한국어**

`cudoc-docusaurus` 어댑터를 써서, 빈 프로젝트부터 정적 사이트가 빌드될 때까지 cudoc을 설정하는 과정입니다.

어댑터는 Docusaurus가 헤딩 ID를 부여하기 전에 cudoc 앵커를 반영하고, cudoc이 만드는 컴포넌트를 제공합니다.

아래 내용이 실제로 동작하는 형태는 [`examples/docusaurus`](../examples/docusaurus)에 있습니다.

## 설치

```bash
npm install cudoc-docusaurus
npm install cudoc
```

`cudoc-remark`와 `cudoc`는 의존성으로 함께 설치됩니다.

## 설정

```js
// docusaurus.config.mjs
import { cudocRemarkPlugins } from "cudoc-docusaurus"

const cudocOptions = {
  headingMetadata: { depths: [2, 3, 4] },
  badge: true,
  tableCellList: true,
}

export default {
  title: "Docs",
  url: "https://example.com",
  baseUrl: "/",

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.mjs",
          beforeDefaultRemarkPlugins: cudocRemarkPlugins(cudocOptions),
        },
      },
    ],
  ],

  plugins: ["cudoc-docusaurus"],
}
```

서로 다른 두 가지를 설정하며 둘 다 필요합니다. `beforeDefaultRemarkPlugins`는 문법 변환을 파이프라인에 넣고, `plugins` 항목은 그 변환이 만들어 내는 컴포넌트를 제공하는 테마를 추가합니다.

블로그나 단독 페이지에서도 cudoc 문법을 쓰신다면 `blog`와 `pages` 프리셋 옵션에도 같은 `beforeDefaultRemarkPlugins`를 넣어야 합니다. 콘텐츠 플러그인마다 MDX 파이프라인이 따로 있기 때문입니다.

### `beforeDefaultRemarkPlugins`를 쓰는 이유

Docusaurus는 자체 remark 플러그인에서 헤딩 ID를 부여합니다. ID를 부여할 때 cudoc 앵커를 사용할 수 있도록 `beforeDefaultRemarkPlugins`에 등록하십시오.

`beforeDefaultRemarkPlugins`는 먼저 실행되며, 이것이 cudoc이 필요로 하는 순서입니다.

### `plugins` 항목이 필요한 이유

cudoc은 `Anchor`와 `Badge`를 제공합니다. 기본 표 열 구성은 classic 테마의 기존 HTML 표 매핑을 사용합니다. MDX는 이 요소들을 사이트의 MDX 컴포넌트에서 찾고, 하나라도 없으면 렌더링 시점에 오류를 냅니다.

`plugins`에 `cudoc-docusaurus`를 추가하면 classic 테마의 `MDXComponents` 위에 cudoc의 것이 얹히기 때문에, 스위즐 없이도 이 이름들이 해석됩니다. 이 항목을 빼면 cudoc 문법을 쓰는 첫 문서에서 렌더링이 실패합니다.

## 헤딩 ID

Docusaurus는 헤딩 텍스트를 slug로 바꾸어 ID를 만듭니다. 그대로 두면 헤딩에는 생성된 ID가, 중첩된 앵커에는 cudoc이 만든 ID가 놓이고, 깊은 링크는 브라우저가 먼저 찾은 쪽으로 이동하게 됩니다.

어댑터는 Docusaurus가 헤딩을 보기 전에 각 앵커 ID를 헤딩으로 올립니다. Docusaurus는 `data.hProperties`에 이미 ID가 있으면 그것을 존중하므로, 헤딩과 앵커가 모두 작성자가 지정한 값에 합의하게 됩니다.

```md
## 요청 제한 (#rate-limits)
```

위 문서는 `<h2 id="rate-limits">`로 렌더링됩니다.

다른 방식으로 지정된 ID는 그대로 둡니다. Docusaurus 자체 문법인 `{#custom-id}`도 여기에 해당합니다. cudoc 앵커가 없는 헤딩은 Docusaurus가 만든 ID를 그대로 유지합니다. 호스트 사이의 산출물을 비교하실 때 알아 두실 점인데, 자체 ID를 만들지 않는 호스트에서는 그 자리에 ID가 없기 때문입니다.

`promoteHeadingIds: false`를 넘기면 이 복사를 끕니다. 그 경우 두 ID가 더 이상 합의하지 않으며, 어댑터가 제공하는 `Anchor`는 ID를 렌더링하지 않으므로 직접 `Anchor`를 제공하셔야 합니다.

## 컴포넌트 스타일과 교체

컴포넌트 구현은 `cudoc-remark/components`에서 옵니다. Nextra 어댑터와 순수 Next.js 사이트도 같은 구현을 쓰기 때문에 세 호스트가 같은 마크업을 렌더링합니다. 구현은 의도적으로 단순합니다. 배지는 `span.cudoc-badge`이고, 표 열 구성은 테마의 기존 HTML 표 컴포넌트를 사용합니다. 사이트 CSS에서 스타일을 지정하시면 됩니다.

```css
/* src/css/custom.css */
.cudoc-badge {
  border: 1px solid var(--ifm-color-emphasis-400);
  border-radius: 0.5rem;
  font-size: 0.75em;
  margin-left: 0.35rem;
  padding: 0.05rem 0.4rem;
  vertical-align: middle;
}
```

`Anchor`는 배지만 렌더링합니다. ID는 이미 헤딩에 있고 헤딩 링크는 Docusaurus가 직접 그리므로, 둘 중 어느 것을 다시 렌더링해도 중복이 되기 때문입니다.

스타일을 바꾸는 것이 아니라 컴포넌트 자체를 교체하시려면, 사이트의 `src/theme`에 `MDXComponents`를 두고 어댑터의 것을 아래에 전개하시면 됩니다.

```jsx
// src/theme/MDXComponents/index.jsx
import MDXComponents from "@theme-original/MDXComponents"
import MyBadge from "@site/src/components/MyBadge"

export default { ...MDXComponents, Badge: MyBadge }
```

사이트 자신의 `src/theme`은 언제나 모든 플러그인 테마보다 위에 놓이므로, 여기에서 `@theme-original`은 감싸려는 대상인 어댑터의 구현을 가리킵니다. **플러그인의** 테마 안에서는 같은 별칭이 그 플러그인 자신을 가리키며, 어댑터가 classic 테마에 접근할 때 `@theme-init`을 쓰는 이유도 그것입니다.

## AST 내보내기

```js
import exportAst from "cudoc/embed"

beforeDefaultRemarkPlugins: [
  ...cudocRemarkPlugins(cudocOptions),
  [exportAst, { sourceRoot: "docs", outDir: ".cudoc/ast" }],
],
```

어댑터의 플러그인 뒤에 덧붙이므로, 저장되는 트리는 그 플러그인들이 작업을 마친 뒤의 트리입니다. `docs/showcase.mdx`는 `.cudoc/ast/showcase.json`이 되고, `sourceRoot` 밖의 문서는 건너뜁니다.

`outDir`은 `.gitignore`에 추가하시기 바랍니다.

## 확인

```bash
npm run build
```

빌드가 성공했다는 것만으로 판단하지 마시고 생성된 HTML을 읽어 보시기 바랍니다. 플러그인이 빠져 있어도 페이지는 정상적으로 렌더링되며, 문법만 원문 그대로 화면에 남습니다.

```bash
grep -o '<h2[^>]*id="[^"]*"' build/docs/showcase/index.html
ls .cudoc/ast
```

## 검증한 조합

Docusaurus 3.10.2, React 19.2, Node 20 이상입니다.

연결 방식과 테마 계층 모두 Docusaurus 내부 구현에 기대고 있습니다. 기본 remark 플러그인의 실행 순서, `data.hProperties`를 존중하는 동작, 감싸려는 컴포넌트에 접근하는 `@theme-init`이 그것입니다. 버전을 고정하시고 업그레이드 후에는 다시 빌드해서 확인하시기 바랍니다.

## 문제 해결

**설정을 읽는 중 `Converting circular structure to JSON`이 발생합니다** — Docusaurus는 콘텐츠 플러그인의 옵션을 캐시 파일로 직렬화하는데, 그 안에 직렬화할 수 없는 값이 있습니다.

특별히 이상한 일을 하지 않았는데도 이 오류를 만나는 경로가 하나 있습니다. cudoc 옵션을 별도 모듈에 두면서 같은 객체를 두 번 내보내는 경우입니다.

```js
// cudoc-options.mjs — 이렇게 하지 마시기 바랍니다
export const cudocOptions = {/* ... */}
export default cudocOptions
```

Docusaurus는 설정을 jiti로 읽는데, jiti는 하나의 객체를 두 이름으로 내보내는 모듈을 자기 자신을 참조하는 객체로 만듭니다. 이름 하나로 한 번만 내보내시기 바랍니다.

**`Cannot access '__WEBPACK_DEFAULT_EXPORT__' before initialization`** — 테마 컴포넌트가 자기 자신을 import 하고 있습니다. 플러그인의 테마 안에서 `@theme-original/X`는 그 플러그인의 같은 파일로 해석됩니다. 그 컴포넌트를 처음 제공한 테마는 `@theme-init/X`입니다.

**`Expected component 'Anchor' to be defined`** — `plugins`에 `cudoc-docusaurus`가 빠져 있거나, 스위즐한 `MDXComponents`가 어댑터의 것을 전개하지 않고 대체해 버렸습니다.

**문법이 원문 그대로 화면에 나옵니다** — 플러그인이 `beforeDefaultRemarkPlugins`가 아니라 `remarkPlugins`에 들어가 있거나, 문서는 `blog`나 `pages`에 있는데 플러그인은 `docs` 옵션에만 추가되어 있습니다.
