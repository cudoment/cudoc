# 가이드

호스트별로 빈 프로젝트에서 화면이 나올 때까지 cudoc을 설정하는 과정입니다.

[English](./README.md) | **한국어**

- [`@next/mdx`를 쓰는 Next.js](./next-mdx.ko.md)
- [Docusaurus](./docusaurus.ko.md)
- [Nextra](./nextra.ko.md)
- [다른 문서의 일부를 끼워 넣기](./embedding.ko.md)

문법과 옵션 목록, 각 패키지가 담당하는 일은 [주 README](../README.ko.md)에 정리되어 있습니다. 직접 빌드해서 비교해 볼 수 있는 사이트 세 개는 [`examples/`](../examples)에 있습니다.

## 세 호스트에서 같은 순서로 진행합니다

어느 호스트에서든 설정 과정은 같은 세 단계이고 순서도 같습니다.

1. **플러그인을 연결합니다.** 호스트가 헤딩을 읽기 전에 cudoc의 변환이 먼저 실행되어야 합니다.
2. **컴포넌트를 제공합니다.** cudoc이 만드는 대문자 요소를 MDX가 찾을 수 있어야 하기 때문입니다.
3. **임베딩을 위해 AST를 내보냅니다.** 같은 플러그인 목록 뒤에 `cudoc` 패키지의 `cudoc/embed` 진입점을 덧붙입니다. 읽고 조회하는 과정은 [임베딩 가이드](./embedding.ko.md)를 참고하십시오.

호스트마다 다른 것은 이 세 가지를 받아들이는 방식뿐입니다.

|           | Next.js                                                    | Docusaurus                            | Nextra                                                  |
| --------- | ---------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------- |
| 연결 위치 | `remarkPlugins`에 문자열로 지정                            | `beforeDefaultRemarkPlugins`          | `mdxOptions.remarkPlugins`                              |
| 실행 순서 | 경쟁하는 대상이 없어 자유롭습니다                          | 기본 플러그인보다 **앞**이어야 합니다 | 이미 맨 앞이라 따로 지정할 것이 없습니다                |
| 헤딩 ID   | `cudoc-remark/heading-ids`, 기본 Anchor 사용 시 필요합니다 | 어댑터에 포함되어 있습니다            | 어댑터에 포함되어 있습니다                              |
| 컴포넌트  | `mdx-components`에서 `cudoc-remark/components`를 씁니다    | 어댑터의 테마가 자동으로 제공합니다   | `mdx-components`에서 `cudoc-nextra/components`를 씁니다 |
| 어댑터    | 필요하지 않습니다                                          | `cudoc-docusaurus`                    | `cudoc-nextra`                                          |

컴포넌트 구현은 `cudoc-remark/components` 하나뿐입니다. Nextra 어댑터는 이것을 재수출하고 Docusaurus 테마는 이것을 직접 import 하며, 어느 쪽도 자체 사본을 두지 않습니다. 그래서 같은 문서는 어디에서 빌드하더라도 같은 마크업이 됩니다. 플러그인을 구성하는 함수도 `createHostPlugins` 하나이며, 두 어댑터가 모두 이 함수를 호출합니다.

## Next.js에는 어댑터가 없는 이유

어댑터가 하는 일은 설정된 플러그인 목록을 반환하는 것이고, 그러려면 **호출되어야** 합니다. 그런데 Turbopack은 MDX 설정을 워커에 넘기고, 워커는 함수를 받을 수 없습니다. 그래서 플러그인을 문자열로 지정해서 워커 쪽에서 해석하게 해야 하며, `cudocRemarkPlugins(options)`를 호출하는 방식 자체가 성립하지 않습니다.

이것은 cudoc이 선택한 설계가 아니라 번들러의 제약입니다. Next.js 가이드에서 cudoc 플러그인 두 개를 이름으로 지정하는 것도 그 때문이며, 다른 두 호스트는 함수 하나를 호출합니다. 그 단계를 지나면 나머지는 모두 같습니다.

## 다른 호스트용 어댑터를 만들 때

어댑터를 이루는 요소는 두 가지이고, 그중 호스트마다 달라지는 것은 하나뿐입니다.

`cudoc-remark`의 `createHostPlugins(options, adapter)`가 플러그인 구성을 담당합니다. 변환을 연결하고, 앵커 ID를 헤딩으로 올리고, 잘못된 옵션을 설정 시점에 거부합니다. 여기에 있는 두 어댑터도 이 함수를 호출하고 이름을 붙인 것이 전부입니다.

나머지 하나는 그 호스트가 컴포넌트를 받아들이는 방식입니다. Docusaurus는 테마로, Nextra와 Next.js는 `mdx-components` 파일로 받습니다. 어느 쪽이든 `cudoc-remark/components`를 가리키면 됩니다.
