# Nextra

[English](./nextra.md) | **한국어** · [전체 가이드](./README.ko.md)

기존 Nextra 애플리케이션에서 설치합니다.

```sh
npm install @cudoment/cudoc cudoc-remark cudoc-nextra
```

## 문법 설정

```js
// next.config.mjs
import nextra from "nextra"
import { cudocRemarkPlugins } from "cudoc-nextra"

const withNextra = nextra({
  mdxOptions: {
    format: "detect",
    remarkPlugins: cudocRemarkPlugins({ syntax: {} }),
  },
})

export default withNextra({
  pageExtensions: ["js", "jsx", "ts", "tsx", "md", "mdx"],
})
```

기존 Nextra 테마 설정과 MDX 컴포넌트 매핑은 유지합니다. 루트 layout에서 `@cudoment/cudoc/styles.css`를 한 번 import합니다. cudoc 컴포넌트 매핑은 필요하지 않습니다.

Nextra는 설정한 remark 플러그인을 자체 제목 처리 전에 실행합니다. 어댑터는 `host: "nextra"`를 선택하고 명시적 ID를 제목에 반영하며 목차는 호스트에 맡깁니다. `.mdx`와 `.md` 모두 기본적으로 표준 HTML 의미를 사용하며, `syntax: {}`는 이 선택을 명시합니다.

`[#id]` 앵커와 정적 `<Callout>` 컴포넌트를 cudoc 문법과 함께 허용하려면 `syntax: { headingAnchor: "both", callout: "both" }`를 지정합니다. React 컴포넌트는 `.mdx`에 작성하고 `.md`는 Markdown으로 유지합니다.

## 임베드 추가

어댑터 플러그인 뒤에 임베드 플러그인을 추가합니다.

```js
import embed from "cudoc-remark/embed"

remarkPlugins: [
  ...cudocRemarkPlugins({ syntax: {} }),
  [embed, { sourceRoot: "content", outDir: ".cudoc/documents" }],
],
```

[Nextra 수집기](../examples/nextra/collect.mjs)를 사이트의 `collect.mjs`로 사용합니다. `nextra/compile`의 실제 플러그인 파이프라인을 실행하고 결과 문서를 캡처한 뒤 임베드를 준비합니다.

`sourceRoot`, 문법 설정, 호스트 컴파일러 옵션, 경로를 사이트의 콘텐츠 설정에 맞춥니다. `both`를 켰다면 수집기의 문서 옵션과 어댑터 옵션도 함께 변경합니다. 관련 설정이나 의존성 버전이 바뀌면 `compilerId`를 갱신합니다.

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "dev": "npm run collect && next dev",
    "build": "npm run collect && next build"
  }
}
```

문서를 수정하면 다시 수집합니다. 정적 호스트 컴포넌트는 공통 문서 노드로 변환할 수 있지만, 공통 임베드 렌더링은 동적 컴포넌트 코드를 실행하지 않습니다. [임베드 가이드](./embedding.ko.md), [실행 설정](../examples/nextra/next.config.mjs), [어댑터 내부 동작](./api-reference/adapters.ko.md#docusaurus와-nextra)을 참고하세요.

## 독립 HTML도 함께 생성

위 수집과 준비가 끝나면 `cudoc-html`을 설치하고 같은 결과로 공유용 HTML을 추가 생성할 수 있습니다. 기본 사이트와 출력 경로를 분리합니다.

```sh
npm install cudoc-html
npx cudoc-html build content --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

`--host-url`과 수집된 문서 경로를 실제 배포 URL에 맞춥니다. `--links relative`는 로컬 탐색, `--links none`은 전체 하이퍼링크 제거입니다. 자산 경로와 사용자 컴포넌트 설정은 [독립 HTML 가이드](./html.ko.md)를 참고하세요.
