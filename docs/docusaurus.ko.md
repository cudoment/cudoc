# Docusaurus

[English](./docusaurus.md) | **한국어** · [전체 가이드](./README.ko.md)

기존 Docusaurus 사이트에서 설치합니다.

```sh
npm install @cudoment/cudoc cudoc-remark cudoc-docusaurus
```

## 문법 설정

기존 설정에 다음 내용을 합칩니다.

```js
import { cudocRemarkPlugins } from "cudoc-docusaurus"

export default {
  // 사이트의 다른 필수 설정은 유지합니다.
  markdown: { format: "detect" },
  presets: [
    [
      "classic",
      {
        docs: {
          path: "docs",
          routeBasePath: "docs",
          beforeDefaultRemarkPlugins: cudocRemarkPlugins({ syntax: {} }),
        },
        theme: { customCss: "./src/css/custom.css" },
      },
    ],
  ],
}
```

`src/css/custom.css`에 추가합니다.

```css
@import "@cudoment/cudoc/styles.css";
```

호스트의 제목 ID와 목차 처리 전에 cudoc 앵커가 존재하도록 `beforeDefaultRemarkPlugins`를 사용합니다. 어댑터는 `host: "docusaurus"`를 설정하고 자동 ID와 목차는 Docusaurus에 맡깁니다. 이 설정에는 cudoc 테마 플러그인이나 컴포넌트 등록이 필요하지 않습니다.

형식 감지는 `.md`를 Markdown, `.mdx`를 MDX로 처리합니다. 호스트 알림과 제목 ID를 cudoc 표기와 함께 허용하려면 `syntax: { headingAnchor: "both", callout: "both" }`를 지정합니다. 지원 표기는 [문법 가이드](./syntax.ko.md)를 참고하세요.

## 임베드 추가

임베드 플러그인을 import하고 호스트 기본 처리 뒤에 실행되는 docs 플러그인의 `remarkPlugins`에 추가합니다.

```js
import embed from "cudoc-remark/embed"

// presets → classic → docs 내부:
remarkPlugins: [[embed, {
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
}]],
```

[Docusaurus 수집기](../examples/docusaurus/collect.mjs)를 사이트의 `collect.mjs`로 사용합니다. 실제 Docusaurus MDX 프로세서를 호출하고 호스트 변환을 캡처한 뒤 임베드를 준비합니다. 예제 의존성 버전에 맞춘 내부 프로세서 진입점을 사용하므로 Docusaurus 버전을 변경할 때 확인해야 합니다.

`sourceRoot`, `outDir`, `routeBase`를 사이트에 맞춥니다. 수집과 렌더링의 문법 옵션 및 호스트 Markdown 설정은 같아야 합니다. 위에서 `both`를 켰다면 수집기의 문서 옵션과 `cudocRemarkPlugins` 호출도 함께 변경합니다. 사용자 slug는 `routes`에 지정하고 관련 설정이 바뀌면 `compilerId`를 갱신합니다.

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "start": "npm run collect && docusaurus start",
    "build": "npm run collect && docusaurus build"
  }
}
```

문서 수정 후 다시 수집하세요. 수집 watcher는 없습니다. 플러그인이 준비된 임베드를 자동으로 삽입합니다. [임베드 가이드](./embedding.ko.md), [실행 사이트](../examples/docusaurus/docusaurus.config.mjs), [어댑터 내부 동작](./api-reference/adapters.ko.md#docusaurus와-nextra)을 참고하세요.

## 독립 HTML도 함께 생성

위 수집과 준비가 끝나면 `cudoc-html`을 설치하고 같은 결과로 공유용 HTML을 추가 생성할 수 있습니다. 기본 사이트와 출력 경로를 분리합니다.

```sh
npm install cudoc-html
npx cudoc-html build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

`--host-url`과 수집된 문서 경로를 실제 배포 URL에 맞춥니다. `--links relative`는 로컬 탐색, `--links none`은 전체 하이퍼링크 제거입니다. 자산 경로와 사용자 컴포넌트 설정은 [독립 HTML 가이드](./html.ko.md)를 참고하세요.
