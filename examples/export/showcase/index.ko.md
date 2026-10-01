---
title: Northlight 날씨 API
lang: ko
---

# Northlight 날씨 API (#northlight)

Northlight는 북유럽 해안의 기상 관측소 네트워크에서 현재 날씨, 단기 예보,
관측 기록을 제공합니다. 이 안내서는 영어 문서와 같은 폴더에 있는 한국어
번역입니다. 파일 이름의 `.ko` 접미사가 번역 관계를 정하므로, 헤더의 언어
전환과 왼쪽 목록이 이 페이지를 영어 페이지와 짝지어 보여 줍니다.

> [!NOTE] 번역 범위
> 한국어로 옮긴 문서는 이 개요와 [시작하기](getting-started.ko.md)입니다.
> 레퍼런스는 영어 원문만 있으므로 한국어 목록에는 나타나지 않고, 빌드는
> 이를 `missing-translation` 진단으로 알립니다.

## 엔드포인트 한눈에 보기 (#endpoints)

아래 표는 영어 레퍼런스의 각 절에서 메서드와 경로를 읽어 옵니다. 레퍼런스가
바뀌면 이 표도 함께 바뀝니다.

```cudoc-embed
sources: [reference/endpoints.md]
select:
  depth: 2
render:
  type: table
  columns:
    - { header: 엔드포인트, value: title, link: section, minWidth: 10rem }
    - { header: 메서드, value: { row: 1, column: 0 }, minWidth: 5rem }
    - { header: 경로, value: { row: 1, column: 1 }, minWidth: 13rem }
```
