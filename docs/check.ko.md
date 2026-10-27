# 참조 검사

[English](./check.md) | **한국어** · [전체 가이드](./README.ko.md)

`cudoc check`는 해석되지 않는 참조(링크, 앵커, 이미지, 임베드)와 쓴 그대로 그려지지 않는 표를 한 번에 모두 보고합니다.

빌드는 깨진 링크를 하나씩 거부합니다. 하나 고치고 다시 빌드하면 그다음 것이 나옵니다. 검사는 문서 집합 전체를 훑어 한꺼번에 출력하며, 아무 산출물도 쓰지 않습니다.

```sh
cudoc check --config cudoc.config.mjs
```

빌드와 같은 코드로 해석하므로, 이 검사가 통과시킨 참조는 빌드도 해석할 수 있는 참조입니다. 다만 Next.js와 Eleventy에서 `.md` 파일로 거는 링크는 예외입니다. 검사는 그 링크를 해당 문서로 받아들이지만, 이 두 호스트는 링크를 쓴 그대로 둡니다([Next.js](./next.ko.md#nextjs에서-알아-둘-점), [Eleventy](./eleventy.ko.md#eleventy에서-알아-둘-점)).

## 빌드에 넣기

검사는 수집과 사이트 빌드 사이에 둡니다. 마지막 수집이 출력한 라이브러리를 읽을 뿐 수집은 하지 않으므로, 설정에는 그 라이브러리와 문서가 어디 있는지만 적습니다. `outDir`(기본 `.cudoc/documents`), 그리고 이미지 같은 파일을 디스크에서 찾을 `sourceRoot` 또는 `roots`입니다. 이 값이 없으면 수집된 문서도 파일도 가리키지 않는 링크도 보고하지 않습니다.

`cudoc collect`를 쓴다면 수집이 이미 읽는 설정 파일이 그대로 쓰입니다. 자체 `collect.mjs` 스크립트로 수집하는 호스트는 같은 디렉터리를 적은 설정을 검사에 줍니다.

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

해석할 수 없는 임베드는 검사가 보기 전에 `cudoc collect`를 멈춥니다. 수집은 무엇이든 출력하기 전에 모든 임베드를 해석하므로, 없는 원본이나 절, 파싱되지 않는 블록, 순환이 있으면 멈춥니다. 그런 임베드를 파일과 블록 번호와 함께 한 메시지에 모두 적은 뒤 아무것도 출력하지 않으며, 검사는 마지막으로 출력에 성공한 라이브러리를 읽습니다. 아래 표의 임베드 오류는 `buildDocuments`가 출력하는 것처럼 임베드 없이 수집한 라이브러리와 [`checkReferences`](#프로그래밍-방식)에 넘긴 라이브러리에서 검사가 보고하는 항목입니다.

## 무엇을 보고하는가

모든 문제는 다음 코드 가운데 하나와 심각도를 가집니다.

| 코드                          | 심각도 | 의미                                                                                                                           |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `missing-document`            | 오류   | 로컬 링크가 수집된 문서도 파일도 가리키지 않음                                                                                 |
| `missing-anchor`              | 오류   | 문서는 있으나 그 앵커가 없음                                                                                                   |
| `missing-asset`               | 오류   | 이미지 파일이 어느 수집 루트에도 자산 디렉터리에도 없음                                                                        |
| `missing-embed-source`        | 오류   | 임베드가 수집되지 않은 문서를, 또는 트리가 나열할 문서가 없는 폴더를 가리킴                                                    |
| `missing-embed-anchor`        | 오류   | 임베드 대상 문서는 있으나 그 절이나 선택한 절이 없음                                                                           |
| `duplicate-anchor`            | 오류   | 한 문서의 제목 둘이 같은 앵커를 선언함                                                                                         |
| `empty-anchor`                | 오류   | id 없는 앵커 표기가 제목 글자에 남음                                                                                           |
| `invalid-embed-spec`          | 오류   | 임베드 블록이 파싱되지 않거나 없는 키를 씀                                                                                     |
| `cyclic-embed`                | 오류   | 임베드가 자신을 다시 임베드하는 내용을 복사해 끝나지 않음                                                                      |
| `unmatched-embed-replacement` | 경고   | `replace` 규칙이 바꿀 대상을 찾지 못함                                                                                         |
| `unreplaceable-embed-section` | 오류   | 다른 블록 안의 절 가운데 원문만 따로 읽으면 그 절이 아닌 절에 `replace` 규칙을 씀                                              |
| `empty-embed-cell`            | 경고   | 정의한 표 열이 어느 행에서 아무것도 찾지 못함                                                                                  |
| `imported-embed-component`    | 오류   | 원본 파일이 스스로 import한 컴포넌트를 임베드가 복사함                                                                         |
| `unstable-anchor-link`        | 경고   | 문서 순서에 따라 움직이는 자동 생성 앵커를 링크가 가리킴                                                                       |
| `unportable-embed-component`  | 경고   | HTML 내보내기가 렌더링할 수 없는 컴포넌트를 임베드가 복사함                                                                    |
| `unmatched-tree-order`        | 경고   | 트리의 `order`가 첫 층의 어느 줄도 가리키지 않음                                                                               |
| `table-column-count`          | 오류   | 표의 행이 구분 행보다 셀이 많거나 적음. 머리 행이 다르면 아예 표가 되지 않음                                                   |
| `table-unclosed-code`         | 오류   | 표 셀의 코드 스팬이 닫히지 않음. 대개 그 안의 `\|`가 셀을 나눈 경우                                                            |
| `path-case-mismatch`          | 오류   | 링크나 이미지가 문서·파일을 다른 대소문자로 가리켜 대소문자를 무시하는 디스크에서만 찾아짐                                     |
| `missing-translation`         | 경고   | `translations`를 쓸 때, 다른 언어로 된 대응 문서가 없음                                                                        |
| `translation-anchor-mismatch` | 경고   | `translations`를 쓸 때, 번역 문서에 있는 명시 앵커가 이 문서에 없음                                                            |
| `translation-visibility`      | 경고   | `translations`를 쓸 때, 공개 문서의 번역 문서가 비공개임                                                                       |
| `invalid-anchor-format`       | 경고   | `anchorPattern`을 쓸 때, 명시 앵커가 그 패턴에 맞지 않음                                                                       |
| `missing-title`               | 경고   | `requireTitle`을 쓸 때, 문서에 글자가 있는 `#` 제목도 frontmatter `title`도 없음                                               |
| `empty-alt`                   | 경고   | `requireAlt`를 쓸 때, 이미지에 대체 텍스트가 없음                                                                              |
| `unused-asset`                | 경고   | `unusedAssets`를 쓸 때, 어느 문서도 링크하거나 보여 주지 않는 파일                                                             |
| `undefined-variable`          | 오류   | `variables`를 쓸 때, `(=이름)` 표지가 수집에 정의된 어떤 변수도 가리키지 않아 쓴 그대로 보임                                   |
| `undefined-link-reference`    | 경고   | `linkReferences`를 쓸 때, 전체·축약 참조가 아무도 정의하지 않은 레이블을 가리켜 글자로 보임                                    |
| `unmatched-table-note`        | 경고   | 표 주석을 읽을 때, `X*` 같은 셀 표지에 맞는 주석이 표 아래에 없거나, 표지를 쓰는 표 아래에 어느 셀도 가리키지 않는 주석이 있음 |

외부 URL은 범위 밖입니다. `https://example.com`에 도달할 수 있는지 확인하는 것은 실패 양상이 다른 네트워크 작업이고, 별도 도구가 담당할 일입니다.

자기 사이트를 절대 URL로 쓴 링크는 외부 링크가 아닙니다. 사이트의 출처를 `siteOrigins`에 적어 두면 `https://docs.example.com/guide#setup`을 `/guide#setup`으로 보고 문서, 앵커, 파일을 똑같이 검사합니다.

문서 사이트 옆에서 다른 애플리케이션이 담당하는 같은 도메인의 경로(`/sdk/js/start` 같은 경로)는 그 접두어를 `externalPaths`에 적어 두면 범위 밖이 됩니다. 적어 두지 않으면 문서 누락으로 보고하는데, 검사기가 그 페이지의 존재를 달리 알 방법이 없기 때문입니다.

앵커는 제목의 id이거나, `<a id="legacy"></a>`처럼 raw HTML 요소에 쓴 `id`입니다. 호스트가 ASCII가 아닌 조각을 퍼센트 인코딩해서 쓰더라도, 인코딩한 조각과 풀어 쓴 조각은 같은 앵커에 맞습니다.

상대 링크는 디스크가 아니라 라이브러리 좌표에서 해석됩니다. `sourceRoot` 하나면 둘이 같고, [루트](./api-reference/node.ko.md#수집)가 여럿이면 `../../terms/token.md` 같은 링크는 기준 경로가 디렉터리 이름과 같을 때에만 한 루트에서 다른 루트로 건너갑니다. `/terms/token.md` 같은 루트 상대 링크는 기준 경로 아래의 문서를 곧바로 가리키므로 언제나 동작합니다.

## 출력 읽기

보고서는 문제를 문서별로 묶어 위치, 심각도, 코드, 쓴 그대로의 참조를 적고, 그 아래에 설명과 검사기의 제안을 붙입니다.

```
guide.md
  3:14  error   missing-anchor       reference.md#limit
        reference has no anchor #limit
        available: #reference, #limits, #authentication, #retry
        did you mean: reference.md#limits
  3:46  error   path-case-mismatch   Reference.md#retry
        Reference.md#retry names reference in different letter case. It resolves on a case-insensitive disk such as macOS's and fails on a case-sensitive one, as most servers are.
        did you mean: reference.md#retry
   7:1  error   table-column-count   | `id|key` | string |
        this row has 3 cells where the table has 2, so the last one is dropped. Remove the extra cells, add the column to every row, or escape a | that belongs to the text as \|.
   7:3  error   table-unclosed-code  `id
        a | inside this code span splits the cell, as it does anywhere in a table row, so the span never closes and its backticks show. Write the pipe as \|.

4 errors in 1 of 2 documents
```

`available`은 대상 문서가 실제로 가진 앵커를 모두 나열합니다. `did you mean`은 참조가 가장 그럴듯하게 의도한 대상을 링크를 쓴 방식 그대로 덧붙이는데, 철자가 충분히 가까운 대상이 있을 때에만 나옵니다. 오타나 대소문자 차이에는 답이 있지만 제목을 바꾼 경우에는 대개 가까운 이름이 없으므로, 그때는 전체 목록에서 고릅니다. 없는 문서나 이미지도 실제로 있는 문서와 이미지 파일 가운데에서 같은 방식으로 제안합니다. 파일 이름에 공백이 있으면 `start%20here.md`처럼 이스케이프해서 제안하므로, 제안을 그대로 링크 대상으로 쓸 수 있습니다.

각 문서의 항목은 파일에 나오는 순서대로 나열하며, 좌표는 원본 Markdown에서 나옵니다. 수집은 저장된 트리에서 위치 정보를 의도적으로 제거합니다. 저장된 AST가 파일을 고치는 순간 낡아 버리는 좌표를 들고 있으면 안 되기 때문이며, 그래서 검사기는 원본 스냅샷에서 참조를 찾습니다. 한 문서에 같은 참조가 여러 번 있으면 코드 밖에서 처음 나온 곳을 보고합니다.

## 표

잘못 쓴 표는 빌드를 실패시키지 않습니다. 파서는 구분 행의 셀 수만큼만 셀을 남기고, 짧은 행은 빈 셀로 채우며, 머리 행과 구분 행의 셀 수가 다르면 표 전체를 문단으로 만듭니다. 검사기는 호스트가 쓰는 Markdown 파서(micromark 또는 사이트의 markdown-it)로 원문을 직접 파싱합니다. 그래서 인용 블록, 목록 항목, 컨테이너 안의 표도 페이지와 같게 읽고, 페이지가 이미 흡수해 버린 문제도 찾아냅니다. → [표를 읽는 방식](./api-reference/node.ko.md#참조-검사)

모든 호스트는 `\|`로 이스케이프하지 않은 `|`마다 행을 나누며, 코드 스팬 안이라고 해서 예외가 아닙니다. 따라서 셀에 쓴 `` `a|b` ``는 셀 두 개가 되고, 각 셀에는 닫히지 않는 백틱이 하나씩 남습니다.

```md
| Field | Type |
| ----- | ---- |
| `id   | key` | string |
```

이 행은 셀이 세 개인 행과 파이프가 나눈 코드 스팬으로 두 번 보고되지만, 원인은 하나이므로 `` `id\|key` ``로 씁니다. 펜스 코드 블록 안과 frontmatter의 글자는 표로 보지 않습니다.

## 대소문자

`Guide.md`와 `guide.md`는 macOS와 Windows에서는 같은 파일이고, 대부분의 사이트가 돌아가는 서버에서는 다른 파일입니다. 그래서 대상과 대소문자만 다른 링크는 작성하는 동안에는 동작하다가 배포하면 깨집니다. `path-case-mismatch`는 문서, 이미지, 파일을 가리키는 이런 링크를 어느 디스크에서든 보고하고, 대상의 실제 표기를 제안으로 붙입니다.

## 번역

문서가 쓰인 언어를 각 언어의 문서가 가진 라이브러리 경로 접두어나 id 접미사와 함께 나열하면, 검사기는 그 접두어와 접미사를 떼었을 때 같은 문서끼리 비교합니다.

```js
export default {
  sourceRoot: "docs",
  check: {
    translations: [
      { code: "ko", prefix: "ko/" },
      { code: "en", prefix: "en/" },
    ],
  },
}
```

`guide.md` 옆에 `guide.ko.md`를 두는 구성이라면 `[{ code: "en" }, { code: "ko", suffix: ".ko" }]`로 씁니다. 접두어와 접미사가 모두 없는 언어는 하나만 둘 수 있으며, 다른 언어에 속하지 않는 문서를 모두 받습니다.

비교 결과로 세 가지를 보고합니다. 대응 문서가 없는 문서는 `missing-translation`입니다. `#setup`을 들고 언어를 바꾸는 링크는 그 앵커가 없는 페이지에서 맨 위로 가므로, 한쪽에 있는 명시 앵커가 다른 쪽에 없으면 그 앵커가 없는 문서에 `translation-anchor-mismatch`를 보고합니다. 공개 문서의 대응 문서가 비공개이면 `translation-visibility`입니다. 번역이 진행 중인 상태는 흔하므로 셋 모두 경고이며, 빌드가 어디까지 허용할지는 `--strict`나 `ignore`로 정합니다.

## unstable-anchor 경고

제목이 겹치면 두 번째 제목의 자동 생성 앵커에 접미사가 붙습니다.

```md
## 개요 → #개요

## 개요 → #개요-1
```

**`#개요-1`을 가리키는 링크는 그 위에 `## 개요`를 하나 더 넣어도 깨지지 않습니다. 접미사가 밀리므로 조용히 다른 절을 가리킵니다.** 모든 호스트가 이렇게 하며, 링크가 여전히 유효하므로 나중에는 어떤 검사기로도 잡을 수 없습니다.

그래서 경고는 잡을 수 있는 유일한 시점인 링크를 작성한 시점에, 접미사를 뗀 앵커도 함께 있을 때에만 울립니다. `## Version 2`는 제목 글자 자체로 `#version-2`를 만들고, 무엇도 이 앵커를 밀어내지 않습니다. 대상 제목에 명시적 앵커를 달면 이 문제는 아예 발생하지 않습니다.

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

`find`가 아무것도 찾지 못한 `replace` 규칙은 아무것도 실패시키지 않습니다. `replace`는 가져온 복사본을 그 페이지에 맞게 손보는 기능이므로, 임베드는 다르게 쓰일 것을 전제로 작성된 자리에 원본의 표현을 그대로 보여 줍니다. 대개 원본 쪽 표현이 바뀌었는데 이쪽 규칙이 남아 있는 경우입니다.

```
guide.md
  6:12  warning unmatched-embed-replacement was reworded away
        replacement 1 found no "was reworded away" in what this embed copies from reference, so nothing was changed. The source may have been reworded; literal rules are case-sensitive.
```

**선택된 절 어디에서도** 맞지 않은 규칙만 보고합니다. 규칙 목록은 선택된 절 전부에 적용되므로, `depth: 2`로 여러 절을 고른 상태에서 한 절만 겨냥한 규칙은 나머지 절에서 아무것도 찾지 못하는 것이 정상입니다. 규칙은 해석기가 적용하는 방식 그대로, 순서대로 앞 규칙의 결과에 대고 확인합니다. → [찾기·바꾸기](./embedding.ko.md#찾기바꾸기)

## 빈 셀 경고

[열을 직접 정의한](./embedding.ko.md#열을-직접-정의하기) 표 임베드는 좌표 위치의 표, 첫 문단, 상위 제목처럼 모든 행이 가져야 할 것을 적어 둡니다. 절에 그것이 없으면 해석기는 빈 셀을 렌더링하고 아무것도 실패하지 않으므로, 검사기가 어느 열, 어느 행이 왜 비었는지 알려 줍니다.

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

임베드 블록은 YAML입니다. 파싱되지 않거나 cudoc에 없는 키를 쓴 블록은 블록 기준이 아니라 파일 기준 줄 번호와 함께 보고됩니다.

```
guide.md
  3:1  error   invalid-embed-spec   embed block 1
       replace[0]: unknown key "regexp". Known keys: find, replace, regex, flags
```

블록, `select`, 각 `replace` 규칙의 세 계층 모두에서 모르는 키를 거부합니다. 무시되는 키는 조용히 실패하기 때문입니다. `regex`를 `regexp`로 잘못 쓰면 정규식이 문자열로 취급되어 아무것도 찾지 못합니다.

## cyclic-embed 오류

복사한 절이 첫 번째 절을 다시 복사해 오는 무언가를 임베드하면 그 임베드는 끝나지 않습니다. 검사기는 임베드의 `replace` 규칙이 절을 다시 쓴 뒤, 해석기가 전개하는 방식대로 복사되는 모든 절 안의 임베드를 따라가며, 연쇄에 참여하는 펜스마다 그 연쇄를 보고합니다. 다음은 `guide.md`가 `reference.md#limits`를 임베드하고, 그 절이 `guide.md` 전체를 임베드하는 경우입니다.

```
guide.md
  3:1  error   cyclic-embed         embed block 1
       embed block 1 never finishes: reference#limits -> guide#* -> reference#limits. Each embed copies content that embeds the next, back to the first.

reference.md
  5:1  error   cyclic-embed         embed block 1
       embed block 1 never finishes: guide#* -> reference#limits -> guide#*. Each embed copies content that embeds the next, back to the first.

2 errors in 2 of 2 documents
```

`#*`는 문서 전체입니다. 더 좁은 절을 임베드하거나, 공유하는 글을 어느 쪽도 임베드하지 않는 문서로 옮겨 연쇄를 끊습니다.

## imported-component 오류

원본 파일이 스스로 `import`한 컴포넌트는 복사본이 놓이는 문서에서 렌더링되지 않습니다. import 문은 그 파일에 남고, 임베드하는 문서에는 그 이름의 바인딩이 없으므로 페이지가 렌더링되지 않습니다. 호스트가 이름을 알고 있는 컴포넌트는 임베드된 절 안에서도 그대로 동작하는데, MDX 호스트가 복사본을 자기 컴포넌트 매핑으로 렌더링하기 때문입니다. 이 오류는 같은 복사본이 일으키는 이식성 경고 옆에 함께 보고됩니다.

```
guide.md
  4:11  warning unportable-embed-component widget.mdx#live
        this embed copies <Chart> out of widget. Neither this host nor standalone HTML export can render them. Keep embedded sections to Markdown, or pass a renderer for each name.
  4:11  error   imported-embed-component widget.mdx#live
        this embed copies <Chart> out of widget, which imports it in its own file. guide has no such import, so the spliced copy cannot render it. Provide the component through the host's shared components, import it in guide as well, or move it out of the embedded section.
```

호스트의 공용 컴포넌트(`mdx-components.tsx`, `MDXProvider`, 테마)로 제공하거나, 임베드하는 문서에서도 import하거나, 임베드되는 절 밖으로 옮깁니다. 임베드하는 문서가 같은 이름을 import하면 보고하지 않습니다.

## unportable-component 경고

임베드는 컴포넌트를 다른 문서로 실어 나르고, 그 문서에서는 HTML 내보내기가 한 번도 건네받은 적 없는 이름을 렌더링해야 합니다. 컴포넌트를 소유한 문서 안에서는 그 컴포넌트를 등록한 호스트가 렌더링하므로 문제가 없습니다.

`widget.mdx`에 컴포넌트가 있고 `guide.md`가 그 절을 임베드하는 경우입니다.

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

검사 대상은 소스 문서 전체가 아니라 임베드가 실제로 복사하게 될 범위입니다. `select`나 `includeChildren: false`로 그 컴포넌트가 빠지거나 `replace` 규칙이 그 컴포넌트를 글로 바꾸면 경고도 울리지 않고, `render: { type: table }` 임베드는 제목 글자만 이동하므로 아예 건너뜁니다. 검사기는 다시 쓴 사본을 독립 컴파일러로 컴파일하며, `{#id}` 제목이 있는 Docusaurus MDX처럼 컴파일할 수 없는 사본은 추측하지 않고 검사에서 뺍니다.

해결 방법은 두 가지입니다. 하나는 임베드하는 절을 Markdown으로만 쓰는 방법이며, 애초에 사실을 재사용할 수 있게 하는 것이 바로 이 방식입니다. 다른 하나는 HTML 내보내기와 컴포넌트가 모두 필요할 때 내보내기에 이름마다 렌더러를 넘기는 방법입니다.

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

수집 설정 안의 `check`는 다음 옵션을 받습니다.

| 옵션            | 효과                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------- |
| `ignore`        | 결과에서 아예 제외할 코드 목록                                                               |
| `assetDirs`     | 이미지 탐색 경로 추가. 호스트의 `public`이나 `static`에 맞춤                                 |
| `externalPaths` | 같은 도메인에서 다른 앱이 담당하는 루트 상대 접두어(`/sdk` 등). 그 아래 링크는 검사하지 않음 |
| `siteOrigins`   | 사이트를 제공하는 출처(`https://docs.example.com` 등). 그 출처의 절대 URL도 검사함           |
| `translations`  | `{ code, prefix?, suffix? }` 형태의 언어 목록. [위](#번역)처럼 번역 문서를 비교함            |
| `anchorPattern` | 모든 명시 앵커가 전체로 맞아야 하는 정규식(`[a-z0-9]+(?:-[a-z0-9]+)*` 등)                    |
| `requireTitle`  | 글자가 있는 `#` 제목도 frontmatter `title`도 없는 문서를 보고함                              |
| `requireAlt`    | 대체 텍스트가 없는 이미지를 보고함                                                           |
| `unusedAssets`  | 작업 디렉터리 기준 글롭 패턴(`public/img/**` 등). 아무것도 참조하지 않는 파일을 보고함       |
| `withoutBase`   | 루트 상대 경로에서 배포 기준 경로를 떼는 함수. 함수이므로 `.mjs` 설정에서만 줄 수 있음       |
| `sourceRoot`    | 라이브러리 자체의 루트를 덮어씀. 디렉터리가 여럿이면 `roots`가 같은 역할                     |

명령줄에는 플래그 두 개가 더 있습니다.

| 플래그          | 효과                                |
| --------------- | ----------------------------------- |
| `--format json` | CI나 에디터를 위해 전체 결과를 출력 |
| `--strict`      | 경고도 `1`로 종료                   |

## 프로그래밍 방식

`checkReferences`는 넘겨받은 라이브러리에 같은 검사를 실행하고, `formatCheckResult`는 그 결과를 명령줄이 출력하는 형식 그대로 씁니다.

```js
import { checkReferences } from "@cudoment/cudoc/node/check"
import { formatCheckResult } from "@cudoment/cudoc/node/report"

const result = checkReferences(library, { ignore: ["unstable-anchor-link"] })
if (result.issues.length) console.log(formatCheckResult(result))
```

감시와 함께 쓸 때 유용합니다. `cudoc collect --watch`가 실행하는 [`watchDocuments`](./api-reference/node.ko.md#감시)는 회차마다 `onPass`로 결과를 알려 주므로, 사이트는 거기서 그 회차의 라이브러리를 검사할 수 있습니다. → [Node API 레퍼런스](./api-reference/node.ko.md#참조-검사)

## 편집기에서

`cudoc lsp`는 같은 검사를 표준 입출력의 언어 서버로 제공하므로, 언어 서버를 실행할 수 있는 편집기라면 어디서나 쓸 수 있습니다.

```sh
cudoc lsp --config cudoc.config.mjs
```

편집기가 연결될 때와 저장할 때마다 `cudoc collect`가 읽는 설정으로 라이브러리를 `cudoc collect --watch`처럼 증분 수집하고, 설정의 `check` 옵션으로 검사합니다. 각 문제는 해당 파일의 해당 줄에 표시되며, 검사가 제안하는 수정(비슷한 문서 이름, 변수, 대소문자)은 참조 부분만 바꾸는 빠른 수정으로 제공됩니다. `translations`를 설정하면 `cudoc/counterpart` 요청이 문서의 다른 언어 버전을 반환하므로, 번역본을 옆에 여는 명령을 만들 수 있습니다.

설정으로는 사이트가 수집할 때 쓰는 설정을 컴파일러까지 그대로 넘깁니다. Next.js에서는 가이드의 `cudoc.config.mjs`가 그 설정입니다. Docusaurus, Nextra, VitePress, Eleventy 가이드의 `cudoc.config.mjs`는 검사만 설정하므로, 수집 스크립트의 설정 전체를 `compiler`와 `compilerId`까지 포함해 기본 export로 내보내고 그 옆에 `check` 옵션을 둔 `.mjs` 모듈을 `cudoc lsp`에 넘깁니다.

서버는 수집이 늘 그렇듯 `outDir`에 라이브러리를 쓰므로, 사이트 빌드는 편집기가 마지막으로 검사한 라이브러리를 읽습니다. 검사 전용 파일을 넘기면 그 컴파일러가 라이브러리를 수집한 컴파일러와 다르므로, 서버는 사이트가 읽는 라이브러리를 바꾸지 않고 아무것도 수집하지 않은 채 두 컴파일러를 밝힌 오류를 기록합니다. 이 거부는 `outDir`에 그 라이브러리가 있어야 동작합니다. 새로 클론했거나 `.cudoc`을 지운 뒤에는 서버가 받은 파일로 수집하므로, 사이트를 먼저 한 번 빌드합니다.

## 하지 않는 것

다음 세 가지는 검사 밖에 있습니다.

- **외부 링크 도달성 확인.** 위에 적은 대로 범위 밖입니다.
- **저장하지 않은 글의 검사.** 검사는 디스크의 파일을 읽으므로, `cudoc check`와 마찬가지로 편집기에서도 저장할 때 실행됩니다. 편집기 밖에서 변경마다 검사하려면 `onPass`에서 `checkReferences`를 부릅니다.
- **스스로 고치기.** 보고만 하며, 가까운 대상이 있으면 그럴듯한 수정안을 함께 보여 주고 편집기는 이를 빠른 수정으로 제공합니다. 적용 여부는 작성자의 판단입니다.
