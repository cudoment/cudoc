# 참조 검사

[English](./check.md) | **한국어** · [전체 가이드](./README.ko.md)

`cudoc check`는 수집된 라이브러리를 읽어 해석되지 않는 참조를 한 번에 전부 보고합니다. 링크, 앵커, 이미지, 임베드가 대상입니다.

빌드는 이미 깨진 링크를 거부합니다. 그래서 **찾는** 용도로는 나쁩니다. 하나 고치고 다시 빌드하면 그다음 것이 나오기 때문입니다. 검사는 문서 집합 전체를 훑어 한꺼번에 출력하며, 아무 산출물도 쓰지 않습니다.

```sh
cudoc check --config cudoc.config.mjs
```

빌드와 같은 코드로 해석하므로, 이 검사가 괜찮다고 한 참조는 빌드도 해석할 수 있는 참조입니다.

## 빌드에 넣기

수집과 사이트 빌드 사이에 두십시오. 마지막 수집이 출력한 라이브러리를 읽을 뿐 수집은 하지 않으므로, 설정에는 그 라이브러리와 문서가 어디 있는지만 적으면 됩니다. `outDir`(기본 `.cudoc/documents`), 그리고 이미지 같은 파일을 디스크에서 확인할 `sourceRoot` 또는 `roots`입니다. 이 값이 없으면 수집된 문서도 파일도 가리키지 않는 링크도 보고하지 않습니다. `cudoc collect`를 쓴다면 수집이 이미 읽는 설정 파일이 그대로 쓰입니다. 자체 `collect.mjs` 스크립트로 수집하는 호스트는 같은 디렉터리를 적은 설정을 검사에 줍니다.

```js
// cudoc.config.mjs: `cudoc check`가 읽고, 라이브러리는 collect.mjs가 씀
export default {
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  check: { assetDirs: ["static"] },
}
```

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "check": "cudoc check --config cudoc.config.mjs",
    "build": "npm run collect && npm run check && docusaurus build"
  }
}
```

오류가 있으면 `1`로 종료합니다. 경고는 `--strict`를 붙이지 않는 한 종료 코드를 바꾸지 않습니다. 수집된 라이브러리가 없으면 검사는 실패하고 먼저 수집하라고 안내합니다.

`cudoc collect`는 무엇이든 출력하기 전에 모든 임베드를 해석하므로, 해석할 수 없는 임베드(없는 원본이나 절, 파싱되지 않는 블록, 순환)가 있으면 수집이 멈춥니다. 이때 수집은 그런 임베드를 파일과 블록 번호와 함께 한 메시지에 모두 적고 아무것도 출력하지 않으며, 검사는 마지막으로 출력에 성공한 라이브러리를 읽습니다. 아래 표의 임베드 오류는 `buildDocuments`가 출력하는 것처럼 임베드 없이 수집한 라이브러리와 [`checkReferences`](#프로그래밍-방식)에 넘긴 라이브러리에서 검사가 보고하는 항목입니다.

## 무엇을 보고하는가

| 코드                          | 심각도 | 의미                                                                              |
| ----------------------------- | ------ | --------------------------------------------------------------------------------- |
| `missing-document`            | 오류   | 로컬 링크가 수집된 문서도 파일도 가리키지 않음                                    |
| `missing-anchor`              | 오류   | 문서는 있으나 그 앵커가 없음                                                      |
| `missing-asset`               | 오류   | 이미지 파일이 어느 수집 루트에도 자산 디렉터리에도 없음                           |
| `missing-embed-source`        | 오류   | 임베드가 수집되지 않은 문서를, 또는 트리가 나열할 문서가 없는 폴더를 가리킴       |
| `missing-embed-anchor`        | 오류   | 임베드 대상 문서는 있으나 그 절이나 선택한 절이 없음                              |
| `duplicate-anchor`            | 오류   | 한 문서의 제목 둘이 같은 앵커를 선언함                                            |
| `empty-anchor`                | 오류   | id 없는 앵커 표기가 제목 글자에 남음                                              |
| `invalid-embed-spec`          | 오류   | 임베드 블록이 파싱되지 않거나 없는 키를 씀                                        |
| `cyclic-embed`                | 오류   | 임베드가 자신을 다시 임베드하는 내용을 복사해 끝나지 않음                         |
| `unmatched-embed-replacement` | 경고   | `replace` 규칙이 바꿀 대상을 찾지 못함                                            |
| `unreplaceable-embed-section` | 오류   | 다른 블록 안의 절 가운데 원문만 따로 읽으면 그 절이 아닌 절에 `replace` 규칙을 씀 |
| `empty-embed-cell`            | 경고   | 정의한 표 열이 어느 행에서 아무것도 찾지 못함                                     |
| `imported-embed-component`    | 오류   | 원본 파일이 스스로 import한 컴포넌트를 임베드가 복사함                            |
| `unstable-anchor-link`        | 경고   | 문서 순서에 따라 움직이는 자동 생성 앵커를 링크가 가리킴                          |
| `unportable-embed-component`  | 경고   | HTML 내보내기가 렌더링할 수 없는 컴포넌트를 임베드가 복사함                       |
| `unmatched-tree-order`        | 경고   | 트리의 `order`가 첫 층의 어느 줄도 가리키지 않음                                  |

외부 URL은 범위 밖입니다. `https://example.com`에 도달할 수 있는지 확인하는 것은 실패 양상이 다른 네트워크 작업이고, 별도 도구가 담당할 일입니다. 문서 사이트 옆에서 다른 애플리케이션이 담당하는 같은 도메인의 경로(`/sdk/js/start` 등)도 그 접두어를 `externalPaths`에 적어 두면 범위 밖이 됩니다. 적어 두지 않으면 문서 누락으로 보고되는데, 검사기가 그 페이지의 존재를 달리 알 방법이 없기 때문입니다.

앵커는 제목의 id이거나, `<a id="legacy"></a>`처럼 raw HTML 요소에 쓴 `id`입니다. 호스트가 ASCII가 아닌 조각을 퍼센트 인코딩해서 쓰더라도, 인코딩한 조각과 풀어 쓴 조각은 같은 앵커에 맞습니다.

상대 링크는 디스크가 아니라 라이브러리 좌표에서 해석됩니다. `sourceRoot` 하나면 둘이 같고, [루트](./api-reference/node.ko.md#수집)가 여럿이면 `../../terms/token.md` 같은 링크는 기준 경로가 디렉터리 이름과 같을 때에만 한 루트에서 다른 루트로 건너갑니다. `/terms/token.md` 같은 루트 상대 링크는 기준 경로 아래의 문서를 곧바로 가리키므로 언제나 동작합니다.

## 출력 읽기

```
guide.md
  3:19  error   missing-anchor       reference.md#limit
        reference has no anchor #limit
        available: #reference, #limits, #authentication, #retry (+3 more)
  5:25  warning unstable-anchor-link reference.md#overview-1
        #overview-1 in reference is generated from a repeated heading; inserting another one above it moves this link to a different section. Give the target heading an explicit anchor.

1 error, 1 warning in 1 of 2 documents
```

`available`은 어떤 것을 의도하셨는지 추측하는 대신 **대상 문서가 실제로 가진 앵커**를 나열합니다. 틀린 추측은 없느니만 못하고, 실무에서 흔한 경우인 제목 변경에서 추측은 정확히 실패합니다.

좌표는 원본 Markdown에서 나옵니다. 수집은 저장된 트리에서 위치 정보를 의도적으로 제거합니다. 저장된 AST가 파일을 고치는 순간 낡아 버리는 좌표를 들고 있으면 안 되기 때문입니다. 그래서 검사기는 원본 스냅샷에서 참조를 찾습니다. 한 문서에 같은 참조가 여러 번 있으면 첫 번째를 보고합니다.

## unstable-anchor 경고

제목이 겹치면 두 번째 제목의 자동 생성 앵커에 접미사가 붙습니다.

```md
## 개요 → #개요

## 개요 → #개요-1
```

모든 호스트가 이렇게 합니다. `#개요-1`을 가리키는 링크가 생기기 전까지는 문제가 없습니다. 그 위에 `## 개요`를 하나 더 넣으면 접미사가 밀립니다. **링크는 깨지지 않습니다. 조용히 다른 절을 가리킵니다.** 이건 나중에 어떤 검사기로도 잡을 수 없습니다. 링크가 여전히 유효하기 때문입니다.

그래서 경고는 잡을 수 있는 유일한 시점, 즉 링크를 작성한 시점에 울립니다. 접미사를 뗀 앵커도 함께 있어야 울립니다. `## Version 2`는 제목 글자 자체로 `#version-2`를 만들고, 무엇도 이 앵커를 밀어내지 않습니다. 대상 제목에 명시적 앵커를 달면 이 문제는 아예 발생하지 않습니다.

```md
## 개요 (#deployment-overview)
```

위험을 감수하기로 한 프로젝트라면 끌 수 있습니다.

```js
export default {
  sourceRoot: "docs",
  check: { ignore: ["unstable-anchor-link"] },
}
```

## unmatched-replacement 경고

`replace`는 가져온 복사본을 그 페이지의 맥락에 맞게 손보는 기능입니다. `find`가 아무것도 찾지 못해도 실패하지 않습니다. 임베드는 원본의 표현을 그대로 실어 나르는데, 그 자리는 다르게 쓰일 것을 전제로 작성된 자리입니다. 대개 원본 쪽 표현이 바뀌었는데 이쪽 규칙이 남아 있는 경우입니다.

```
guide.md
  6:12  warning unmatched-embed-replacement was reworded away
        replacement 1 found no "was reworded away" in what this embed copies from reference, so nothing was changed. The source may have been reworded; literal rules are case-sensitive.
```

규칙 목록은 선택된 절 전부에 적용되므로, `depth: 2`로 여러 절을 고른 상태에서 한 절만 겨냥한 규칙은 나머지 절에서 아무것도 찾지 못하는 것이 정상입니다. 그래서 **선택된 절 어디에서도** 맞지 않은 규칙만 보고합니다. 규칙은 해석기가 적용하는 방식 그대로, 순서대로 앞 규칙의 결과에 대고 확인합니다. → [찾기·바꾸기](./embedding.ko.md#찾기바꾸기)

## 빈 셀 경고

[열을 직접 정의한](./embedding.ko.md#열을-직접-정의하기) 표 임베드는 모든 행이 가져야 할 것을 적어 둡니다. 좌표 위치의 표, 첫 문단, 상위 제목 같은 것입니다. 절에 그것이 없으면 해석기는 빈 셀을 렌더링하고 아무것도 실패하지 않으므로, 검사기가 어느 열, 어느 행이 왜 비었는지 알려 줍니다.

```
guide.md
  4:11  warning empty-embed-cell     /docs/rest-api.md
        column 2 "Method" is empty for the row from docs/rest-api#charge: expected table 0 in docs/rest-api#charge, found 0 tables after skipping those headed "Requirements"
```

매핑으로 쓴 열만 보고합니다. 표로 시작하는 절의 축약형 `summary`가 비는 것은 정상입니다. 설정에 등록되지 않은 추출기를 부르는 열은 대신 `invalid-embed-spec` 오류입니다.

## unmatched-order 경고

[트리](./embedding.ko.md#문서-트리-그리기)의 `order`는 적은 이름을 먼저 둡니다. 첫 층의 어느 줄도 가리키지 않는 항목은 아무것도 옮기지 않고, 트리는 조용히 제목 순서로 남습니다. 그래서 검사기가 그 항목과, 항목이 가리켰을 법한 제목을 함께 알려 줍니다.

```
guides/index.md
  9:11  warning unmatched-tree-order Overveiw
        order names "Overveiw", which is not on the tree's first level, so it moves nothing. An entry matches a document's file name or a line's title.
        available: "Install", "Overview"
```

항목은 확장자를 뺀 문서 파일 이름이나 줄의 제목과 유니코드 NFC로 비교합니다. `...`는 보고하지 않습니다.

## 파싱되지 않는 임베드 블록

임베드 블록은 YAML입니다. 파싱되지 않거나 cudoc에 없는 키를 쓴 블록은, 블록 기준이 아니라 **파일 기준 줄 번호**와 함께 보고됩니다.

```
guide.md
  3:1  error   invalid-embed-spec   embed block 1
       replace[0]: unknown key "regexp". Known keys: find, replace, regex, flags
```

블록과 `select`와 각 `replace` 규칙, 세 계층 모두에서 모르는 키를 거부합니다. 무시되는 키는 조용히 실패하기 때문입니다. `regex`를 `regexp`로 잘못 쓰면 정규식이 문자열로 취급되어 아무것도 찾지 못합니다.

## cyclic-embed 오류

임베드는 절을 복사합니다. 그 절이 첫 번째 절을 다시 복사해 오는 무언가를 임베드하면 복사가 끝나지 않습니다. 검사기는 임베드의 `replace` 규칙이 절을 다시 쓴 뒤, 해석기가 전개하는 방식대로 복사되는 모든 절 안의 임베드를 따라가며, 연쇄에 참여하는 펜스마다 그 연쇄를 보고합니다. `guide.md`가 `reference.md#limits`를 임베드하고, 그 절이 `guide.md` 전체를 임베드하는 경우입니다.

```
guide.md
  3:1  error   cyclic-embed         embed block 1
       embed block 1 never finishes: reference#limits -> guide#* -> reference#limits. Each embed copies content that embeds the next, back to the first.

reference.md
  5:1  error   cyclic-embed         embed block 1
       embed block 1 never finishes: guide#* -> reference#limits -> guide#*. Each embed copies content that embeds the next, back to the first.

2 errors in 2 of 2 documents
```

`#*`는 문서 전체입니다. 더 좁은 절을 임베드하거나, 공유하는 글을 어느 쪽도 임베드하지 않는 문서로 옮겨 연쇄를 끊으십시오.

## imported-component 오류

MDX 호스트는 임베드된 복사본을 자기 컴포넌트 매핑으로 렌더링하므로, 임베드된 절 안의 컴포넌트는 호스트가 그 이름을 알고 있는 한 그대로 동작합니다. 원본 파일이 스스로 `import`한 컴포넌트는 다릅니다. import 문은 그 파일에 남고, 복사본이 놓이는 문서에는 그 이름의 바인딩이 없으므로 페이지가 렌더링되지 않습니다. 이 오류는 같은 복사본이 일으키는 이식성 경고 옆에 함께 보고됩니다.

```
guide.md
  4:11  warning unportable-embed-component widget.mdx#live
        this embed copies <Chart> out of widget. Neither this host nor standalone HTML export can render them. Keep embedded sections to Markdown, or pass a renderer for each name.
  4:11  error   imported-embed-component widget.mdx#live
        this embed copies <Chart> out of widget, which imports it in its own file. guide has no such import, so the spliced copy cannot render it. Provide the component through the host's shared components, import it in guide as well, or move it out of the embedded section.
```

호스트의 공용 컴포넌트(`mdx-components.tsx`, `MDXProvider`, 테마)로 제공하거나, 임베드하는 문서에서도 import하거나, 임베드되는 절 밖으로 옮기십시오. 임베드하는 문서가 같은 이름을 import하면 보고하지 않습니다.

## unportable-component 경고

컴포넌트는 그것을 소유한 문서 안에서는 문제가 없습니다. 그 컴포넌트를 등록한 호스트가 렌더링해 주기 때문입니다. 임베드는 상황을 바꿉니다. 복사본이 다른 문서에 놓이고, 그다음 HTML 내보내기가 한 번도 건네받은 적 없는 이름을 렌더링해야 합니다.

`widget.mdx`에 컴포넌트가 있고 `guide.md`가 그 절을 임베드한다고 하겠습니다.

````md
```cudoc-embed
sources: [widget.mdx#live]
```
````

사이트는 `Chart`를 등록해 두었으므로 이 페이지를 렌더링합니다. `cudoc-export`에는 그런 등록부가 없으므로 거부합니다.

```
cudoc: no portable renderer for Chart at line ?
```

경고는 이 실패를 내보내기 시점에서 검사 시점으로 옮기고, 어떤 컴포넌트인지 이름을 알려 줍니다.

```
guide.md
  4:11  warning unportable-embed-component widget.mdx#live
        this embed copies <Chart> out of widget. Neither this host nor standalone HTML export can render them. Keep embedded sections to Markdown, or pass a renderer for each name.
```

검사 대상은 소스 문서 전체가 아니라 **임베드가 실제로 복사하게 될 범위**입니다. `select`나 `includeChildren: false`로 그 컴포넌트가 빠지거나 `replace` 규칙이 그 컴포넌트를 글로 바꾸면 경고도 울리지 않고, `render: { type: table }` 임베드는 제목 글자만 이동하므로 아예 건너뜁니다. 검사기는 다시 쓴 사본을 독립 컴파일러로 컴파일하며, `{#id}` 제목이 있는 Docusaurus MDX처럼 컴파일할 수 없는 사본은 추측하지 않고 검사에서 뺍니다.

해결 방법은 두 가지입니다. 임베드하는 절을 Markdown으로만 유지하시는 편이 좋습니다. 애초에 사실을 재사용 가능하게 만드는 것이 이 기능의 목적이기 때문입니다. HTML 내보내기와 컴포넌트가 둘 다 필요하시다면, 내보내기 쪽에 이름별 렌더러를 넘기실 수 있습니다.

```js
renderDocument(tree, { components: { Chart: (node) => "<figure>…</figure>" } })
```

HTML을 내보낼 일이 없는 프로젝트라면 끌 수 있습니다.

```js
export default {
  sourceRoot: "docs",
  check: { ignore: ["unportable-embed-component"] },
}
```

## 옵션

수집 설정 안의 `check`입니다.

| 옵션            | 효과                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------- |
| `ignore`        | 결과에서 아예 제외할 코드 목록                                                               |
| `assetDirs`     | 이미지 탐색 경로 추가. 호스트의 `public`이나 `static`에 맞춤                                 |
| `externalPaths` | 같은 도메인에서 다른 앱이 담당하는 루트 상대 접두어(`/sdk` 등). 그 아래 링크는 검사하지 않음 |
| `sourceRoot`    | 라이브러리 자체의 루트를 덮어씀. 디렉터리가 여럿이면 `roots`가 같은 역할                     |

명령줄입니다.

| 플래그          | 효과                                |
| --------------- | ----------------------------------- |
| `--format json` | CI나 에디터를 위해 전체 결과를 출력 |
| `--strict`      | 경고도 `1`로 종료                   |

## 프로그래밍 방식

```js
import { checkReferences } from "@cudoment/cudoc/node/check"
import { formatCheckResult } from "@cudoment/cudoc/node/report"

const result = checkReferences(library, { ignore: ["unstable-anchor-link"] })
if (result.issues.length) console.log(formatCheckResult(result))
```

감시와 함께 쓸 때 유용합니다. `cudoc collect --watch`가 실행하는 [`watchDocuments`](./api-reference/node.ko.md#감시)는 회차마다 `onPass`로 결과를 알려 주므로, 사이트는 거기서 그 회차의 라이브러리를 검사할 수 있습니다. [Node API 레퍼런스](./api-reference/node.ko.md#참조-검사)를 참고하십시오.

## 하지 않는 것

- **외부 링크 도달성 확인.** 위에 적은 대로 범위 밖입니다.
- **자체 일정에 따른 검사.** `cudoc check`는 한 번 실행됩니다. 변경마다 검사하려면 `onPass`에서 `checkReferences`를 부르십시오.
- **자동 수정.** 보고만 합니다. 편집은 작성자의 판단입니다.
