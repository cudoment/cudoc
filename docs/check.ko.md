# 참조 검사

[English](./check.md) | **한국어** · [전체 가이드](./README.ko.md)

`cudoc check`는 수집된 라이브러리를 읽어 해석되지 않는 참조를 한 번에 전부 보고합니다. 링크, 앵커, 이미지, 임베드가 대상입니다.

빌드는 이미 깨진 링크를 거부합니다. 그래서 **찾는** 용도로는 나쁩니다. 하나 고치고 다시 빌드하면 그다음 것이 나오기 때문입니다. 검사는 문서 집합 전체를 훑어 한꺼번에 출력하며, 아무 산출물도 쓰지 않습니다.

```sh
cudoc check --config cudoc.config.mjs
```

빌드와 같은 코드로 해석하므로, 이 검사가 괜찮다고 한 참조는 빌드도 해석할 수 있는 참조입니다.

## 빌드에 넣기

수집과 사이트 빌드 사이에 두십시오. 수집 결과를 읽으므로 별도 설정 파일이 필요 없습니다.

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "check": "cudoc check --config cudoc.config.mjs",
    "build": "npm run collect && npm run check && docusaurus build"
  }
}
```

오류가 있으면 `1`로 종료합니다. 경고는 `--strict`를 붙이지 않는 한 종료 코드를 바꾸지 않습니다.

## 무엇을 보고하는가

| 코드                          | 심각도 | 의미                                                     |
| ----------------------------- | ------ | -------------------------------------------------------- |
| `missing-document`            | 오류   | 로컬 링크가 수집된 문서도 파일도 가리키지 않음           |
| `missing-anchor`              | 오류   | 문서는 있으나 그 앵커가 없음                             |
| `missing-asset`               | 오류   | 이미지 파일이 `sourceRoot`에도 자산 디렉터리에도 없음    |
| `missing-embed-source`        | 오류   | 임베드가 수집되지 않은 문서를 가리킴                     |
| `missing-embed-anchor`        | 오류   | 임베드 대상 문서는 있으나 그 절이 없음                   |
| `duplicate-anchor`            | 오류   | 한 문서의 제목 둘이 같은 앵커를 선언함                   |
| `empty-anchor`                | 오류   | id 없는 앵커 표기가 제목 글자에 남음                     |
| `invalid-embed-spec`          | 오류   | 임베드 블록이 파싱되지 않거나 없는 키를 씀               |
| `unmatched-embed-replacement` | 경고   | `replace` 규칙이 바꿀 대상을 찾지 못함                   |
| `unstable-anchor-link`        | 경고   | 문서 순서에 따라 움직이는 자동 생성 앵커를 링크가 가리킴 |
| `unportable-embed-component`  | 경고   | 독립 HTML이 렌더링할 수 없는 컴포넌트를 임베드가 복사함  |

외부 URL은 범위 밖입니다. `https://example.com`에 도달할 수 있는지 확인하는 것은 실패 양상이 다른 네트워크 작업이고, 별도 도구가 담당할 일입니다.

## 출력 읽기

```
docs/guide.md
   4:14  error   missing-anchor       reference.md#limit
         reference has no anchor #limit
         available: #limits, #authentication, #retry, #backoff (+2 more)
   6:12  warning unstable-anchor-link reference.md#overview-1
         #overview-1 in reference is generated from a repeated heading; …

1 error, 1 warning in 1 of 14 documents
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

그래서 경고는 잡을 수 있는 유일한 시점, 즉 링크를 작성한 시점에 울립니다. 대상 제목에 명시적 앵커를 달면 이 문제는 아예 발생하지 않습니다.

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
   6:12  warning unmatched-embed-replacement was reworded away
         replacement 1 found no "was reworded away" in what this embed copies
         from reference, so nothing was changed. …
```

규칙 목록은 선택된 절 전부에 적용되므로, `depth: 2`로 여러 절을 고른 상태에서 한 절만 겨냥한 규칙은 나머지 절에서 아무것도 찾지 못하는 것이 정상입니다. 그래서 **선택된 절 어디에서도** 맞지 않은 규칙만 보고합니다. 규칙은 해석기가 적용하는 방식 그대로, 순서대로 앞 규칙의 결과에 대고 확인합니다. → [찾기·바꾸기](./embedding.ko.md#찾기바꾸기)

## 파싱되지 않는 임베드 블록

임베드 블록은 YAML입니다. 파싱되지 않거나 cudoc에 없는 키를 쓴 블록은, 블록 기준이 아니라 **파일 기준 줄 번호**와 함께 보고됩니다.

```
   8:12  error   invalid-embed-spec   embed block 1
         replace[0]: unknown key "regexp". Known keys: find, replace, regex, flags
```

`regex`를 `regexp`로 잘못 쓴 경우가 예전에는 조용히 통과했습니다. 정규식이 문자열로 취급되어 아무것도 찾지 못한 채로 말입니다. 이제 블록과 `select`와 각 `replace` 규칙, 세 계층 모두에서 모르는 키를 거부합니다.

## unportable-component 경고

컴포넌트는 그것을 소유한 문서 안에서는 문제가 없습니다. 그 컴포넌트를 등록한 호스트가 렌더링해 주기 때문입니다. 임베드는 상황을 바꿉니다. 복사본이 다른 문서에 놓이고, 그다음 독립 HTML 내보내기가 한 번도 건네받은 적 없는 이름을 렌더링해야 합니다.

`widget.mdx`에 컴포넌트가 있고 `guide.md`가 그 절을 임베드한다고 하겠습니다.

````md
```cudoc-embed
sources: [widget.mdx#live]
```
````

사이트는 `Chart`를 등록해 두었으므로 이 페이지를 렌더링합니다. `cudoc-html`에는 그런 등록부가 없으므로 거부합니다.

```
cudoc: no portable renderer for Chart at line ?
```

경고는 이 실패를 내보내기 시점에서 검사 시점으로 옮기고, 어떤 컴포넌트인지 이름을 알려 줍니다.

```
   4:11  warning unportable-embed-component widget.mdx#live
         this embed copies <Chart> out of widget. …
```

검사 대상은 소스 문서 전체가 아니라 **임베드가 실제로 복사하게 될 범위**입니다. `select`나 `includeChildren: false`로 그 컴포넌트가 빠지면 경고도 울리지 않고, `render: { type: table }` 임베드는 제목 글자만 이동하므로 아예 건너뜁니다.

해결 방법은 두 가지입니다. 임베드하는 절을 Markdown으로만 유지하시는 편이 좋습니다. 애초에 사실을 재사용 가능하게 만드는 것이 이 기능의 목적이기 때문입니다. 독립 HTML과 컴포넌트가 둘 다 필요하시다면, 내보내기 쪽에 이름별 렌더러를 넘기실 수 있습니다.

```js
renderDocument(tree, { components: { Chart: (node) => "<figure>…</figure>" } })
```

독립 HTML을 내보낼 일이 없는 프로젝트라면 끌 수 있습니다.

```js
export default {
  sourceRoot: "docs",
  check: { ignore: ["unportable-embed-component"] },
}
```

## 옵션

수집 설정 안의 `check`입니다.

| 옵션         | 효과                                                         |
| ------------ | ------------------------------------------------------------ |
| `ignore`     | 결과에서 아예 제외할 코드 목록                               |
| `assetDirs`  | 이미지 탐색 경로 추가. 호스트의 `public`이나 `static`에 맞춤 |
| `sourceRoot` | 라이브러리 자체의 소스 루트를 덮어씀                         |

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

사이트에 이미 감시 기능이 있을 때 유용합니다. cudoc은 자체 수집 감시를 제공하지 않습니다. 수집이 호스트 컴파일러를 호출하기 때문에 키 입력마다 돌리기에는 비용이 큽니다. 원본을 이미 감시하고 계신 사이트라면 수집 뒤에 이 함수를 부르시면 됩니다. [Node API 레퍼런스](./api-reference/node.ko.md#참조-검사)를 참고하십시오.

## 하지 않는 것

- **외부 링크 도달성 확인.** 위에 적은 대로 범위 밖입니다.
- **수집 감시.** `checkReferences`는 함수이고, 감시는 호출하는 쪽의 몫입니다.
- **자동 수정.** 보고만 합니다. 편집은 작성자의 판단입니다.
