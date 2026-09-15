# Nextra

[English](./nextra.md) | **한국어** · [전체 가이드](./README.ko.md)

순서대로 따라가시면 됩니다. 1–3단계는 Markdown 문법 확장을 켭니다. 4–6단계는 문서 임베딩을 더합니다. 한 문서가 다른 문서를 재사용할 수 있게 해 주는 기능입니다. 7단계는 선택 사항입니다.

## 1단계 — 설치

```sh
npm install @cudoment/cudoc cudoc-remark cudoc-nextra
```

## 2단계 — remark 플러그인 등록

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

기존 Nextra 테마 설정과 MDX 컴포넌트 매핑은 그대로 두십시오. Nextra는 설정된 remark 플러그인을 자체 제목 처리보다 먼저 실행하므로, Nextra가 목차를 만들 때 cudoc의 앵커가 이미 자리를 잡고 있습니다.

## 3단계 — 스타일시트 가져오기

루트 레이아웃에서 한 번만 가져옵니다.

```js
import "@cudoment/cudoc/styles.css"
```

cudoc 컴포넌트 매핑은 필요 없습니다.

**문법 확장만 필요하시면 여기서 멈추셔도 됩니다.** 사이트를 실행하면 [Markdown 문법](./syntax.ko.md)의 기능들이 동작합니다. 문서 임베딩이 필요하시면 계속 진행하십시오.

## 4단계 — 임베드 플러그인 추가

어댑터가 넣는 플러그인들 뒤에 붙입니다.

```js
import embed from "cudoc-remark/embed"

remarkPlugins: [
  ...cudocRemarkPlugins({ syntax: {} }),
  [embed, { sourceRoot: "content", outDir: ".cudoc/documents" }],
],
```

## 5단계 — 수집기 추가

[예제 수집기](../examples/nextra/collect.mjs)를 사이트 루트에 `collect.mjs`로 복사하십시오. 네이티브 플러그인 파이프라인과 함께 `nextra/compile`을 호출해서 결과 문서를 포착한 뒤 임베드를 준비합니다.

`sourceRoot`, 문법 설정, 네이티브 컴파일러 옵션, 경로를 콘텐츠 설정에 맞추십시오. **수집과 렌더링은 반드시 일치해야 합니다.** 한쪽을 바꾸면 다른 쪽도 바꿔야 하고, 관련 설정이나 의존성 버전이 바뀌면 `compilerId`를 올리십시오.

## 6단계 — 빌드 전마다 수집 실행

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "check": "cudoc check --config cudoc.config.mjs",
    "dev": "npm run collect && next dev",
    "build": "npm run collect && npm run check && next build"
  }
}
```

수집 감시 기능이 없으므로 Nextra보다 먼저 수집이 돌아야 합니다.

`cudoc check`는 깨진 링크와 앵커, 이미지, 임베드를 한 번에 전부 보고하고 종료 코드를 0이 아닌 값으로 냅니다. 사이트가 생성되기 전에 빌드가 멈춥니다. → [참조 검사](./check.ko.md)

## 7단계 — 독립 HTML도 내보내기 (선택)

```sh
npm install cudoc-html
npx cudoc-html build content --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

소스 디렉터리가 `docs`가 아니라 `content`인 점에 유의하십시오. Nextra 빌드 결과와 수집 데이터는 변경되지 않습니다. → [독립 HTML](./html.ko.md)

---

## 이제 쓸 수 있는 것

| 기능               | 예시                             | 자세히                                          |
| ------------------ | -------------------------------- | ----------------------------------------------- |
| 명시적 제목 앵커   | `## 한도 (#limits)`              | [문법](./syntax.ko.md#앵커와-배지)              |
| 제목 배지          | `## 한도 (#limits) (@New)`       | [문법](./syntax.ko.md#앵커와-배지)              |
| 제목이 있는 콜아웃 | `> [!NOTE] 시작하기 전에`        | [문법](./syntax.ko.md#알림)                     |
| 표 셀 안 중첩 목록 | `- 계정<br />-- 이메일 인증`     | [문법](./syntax.ko.md#표-셀-내부-목록)          |
| 문서 전체 임베드   | `sources: [reference.md]`        | [임베딩](./embedding.ko.md#섹션-가져오기)       |
| 한 절 임베드       | `sources: [reference.md#limits]` | [임베딩](./embedding.ko.md#섹션-가져오기)       |
| 제목 요약 표       | `select: { depth: 2 }`           | [임베딩](./embedding.ko.md#제목-요약-표-만들기) |
| 사본의 문구 치환   | `replace: [{ find, replace }]`   | [임베딩](./embedding.ko.md#찾기바꾸기)          |

## Nextra에서 알아 둘 점

**네이티브 문법과 함께 쓰기.** Nextra의 `[#id]` 앵커와 정적 `<Callout>` 컴포넌트는 그대로 동작합니다. cudoc이 그것들까지 정규화하게 하면 임베드한 사본과 HTML 출력이 같은 의미를 갖게 됩니다.

```js
cudocRemarkPlugins({ syntax: { headingAnchor: "both", callout: "both" } })
```

`both`를 켜실 때는 수집기의 문서 옵션**과** 어댑터 옵션 양쪽을 함께 바꾸셔야 합니다. 지원하는 네이티브 형태는 [문법 가이드](./syntax.ko.md)에 정리되어 있습니다.

**목차는 Nextra가 계속 담당합니다.** 어댑터는 `host: "nextra"`를 설정하고 명시적 id를 승격시킨 뒤, 목차는 Nextra에 맡깁니다.

**정적 컴포넌트는 문서 노드가 되고 동적 컴포넌트는 되지 않습니다.** 정적 `<Callout>`은 이식 가능한 콜아웃으로 정규화됩니다. 이식 가능한 임베드를 렌더링할 때 컴포넌트 코드는 실행되지 않으므로, 내용이 실행 시점 상태에 의존하는 컴포넌트는 다른 문서로 옮겨 갈 수 없습니다.

**`.md`와 `.mdx`의 차이.** 직접 만든 React 컴포넌트는 `.mdx`에 작성하십시오. `.md`는 Markdown으로 남아 `{value}`가 그대로 글자가 됩니다. → [`.md`와 `.mdx` 선택](./README.ko.md#md와-mdx-선택)

## 다음으로

- [문서 임베딩](./embedding.ko.md) — 선택, 다중 소스, 갱신 규칙
- [어댑터 내부 동작](./api-reference/adapters.ko.md#docusaurus와-nextra) — 순서, 캡처, 어댑터가 설정하는 값
- [실행 가능한 예제](../examples/nextra/next.config.mjs) — 동작하는 사이트
