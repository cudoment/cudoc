---
title: 시작하기
lang: ko
---

# 시작하기 (#getting-started)

키를 발급받고 요청을 한 번 보내면 첫 응답을 확인할 수 있습니다. 모든 호출은
헤더에 키를 담은 HTTPS 요청이며, 설치할 SDK는 없습니다.

## 키 발급 (#key)

키는 프로젝트마다 발급되며, 프로젝트가 읽을 수 있는 관측소 범위를 가집니다.

| 종류   | 접두사      | 용도                                                        |
| ------ | ----------- | ----------------------------------------------------------- |
| 운영   | `nlk_live_` | 실제 관측소를 읽고 프로젝트 요금제의 사용량에 포함됩니다.   |
| 테스트 | `nlk_test_` | 가상 관측소 `TEST-01`만 읽으며 사용량 제한을 받지 않습니다. |

> [!IMPORTANT] 키를 브라우저에 두지 마세요
> 키는 프로젝트의 모든 권한을 가집니다. 자체 백엔드에서 Northlight를 호출하고
> 결과만 전달하세요.

## 요청 보내기 (#request)

`Authorization` 헤더에 키를 담고 관측소 코드로 요청합니다.

```sh
curl -H "Authorization: Bearer $NORTHLIGHT_KEY" \
  "https://api.northlight.example/v1/weather/current?station=OSL-01"
```

응답 필드와 오류 코드는 영어 [레퍼런스](reference/endpoints.md)에 있습니다.
