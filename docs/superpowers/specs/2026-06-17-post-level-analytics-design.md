# 게시글별 실적 추적 (Post-level Analytics) — 설계 스펙

- 작성일: 2026-06-17
- 브랜치: `jocoding/workspace-analytics-fork`
- 상태: 설계 승인 대기 → 구현 플랜(writing-plans)으로 이행 예정

## 1. 배경 & 목표

현재 fork의 `workspace-analytics`는 **채널 단위** 집계만 실제로 저장한다. 게시글별 실적(어떤 게시물이 잘 됐는지)을 추적하는 흐름이 비어 있어, 운영자가 "어떤 후킹 문구가 잘 먹히는지", "어떤 시간대에 올린 게 알고리즘이 잘 도는지"를 데이터로 판단할 수 없다.

목표: 발행된 게시물 단위로 성과 지표를 시계열로 수집하고, 이를 기반으로 아래 4개 뷰 + AI 분석을 제공한다.

1. **게시글별 실적 리스트** — 게시물 하나하나의 조회·좋아요·댓글·공유 등을 정렬·비교
2. **채널/플랫폼별 비교** — 같은 워크스페이스 내 채널 간 성과 비교
3. **발행 시간대 분석** — 요일×시간대별 평균 성과(히트맵)로 "언제 올리는 게 좋은지"
4. **후킹 문구 패턴 분석** — 도입부 실적순 정렬 + AI 후킹 유형 분류/인사이트/개선 제안

## 2. 핵심 발견 (재사용 가능한 기존 자산)

이미 존재하여 그대로 재사용한다.

- `Post.releaseId`(플랫폼 측 post id) · `Post.releaseURL` — 발행 성공 시 저장됨. 개별 게시물을 플랫폼에서 다시 조회하는 열쇠.
  - 발행 흐름: `apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.1.ts:168-172` → `posts.repository.ts:392-403`의 `updatePost(...)`.
- provider별 `postAnalytics(integrationId, accessToken, postId, date)` — **11개 provider에 구현됨**: `x · tiktok · youtube · instagram · instagram.standalone · facebook · threads · pinterest · linkedin.page · gmb · dribbble`.
  - 인터페이스: `libraries/nestjs-libraries/src/integrations/social/social.integrations.interface.ts:26-36, 53-57` (`AnalyticsData { label, data:[{total,date}], percentageChange }`).
  - 예) Threads: `threads.provider.ts:534` → `graph.threads.net/v1.0/{postId}/insights?metric=views,likes,replies,reposts,quotes`.
- `AnalyticsMetricSnapshot` 테이블 — `postId`/`campaignId` 컬럼이 이미 존재(`schema.prisma:564-587`). 현재는 `postId`가 항상 `null`로 저장됨.
- `workspace-analytics.service.ts`의 `toSnapshots()`(208-225)·`toSeries()`(227-281)는 `groupBy = total|channel|campaign|post`를 이미 지원. `summary()`(141-206)는 `topPosts`를 반환.
- 프론트 `apps/frontend/src/components/workspace-analytics/*` — `groupBy=post` 옵션과 컨트롤·차트·타입이 이미 자리 잡혀 있음.

### 비어 있는 부분 (이번에 채울 것)

1. `summary()`는 채널 전체 `analytics()`만 호출 → snapshot의 `postId`가 `null`. **게시물 단위 수집기가 없음.**
2. 발행된 게시물마다 `postAnalytics()`를 주기적으로 호출해 `snapshot.postId`를 채우는 흐름이 없음.
3. 후킹 문구·발행 시간대를 집계해 패턴으로 보여주는 인사이트 화면이 없음.

## 3. 아키텍처 개요

```
[발행 워크플로우] ──발행 성공(releaseId 저장)──┐
                                              ├─▶ ① AI 후킹 분류 (1회, gpt-5.4-nano) → Post에 저장
                                              └─▶ ② 분석 수집 타이머 시작 (1h·6h·24h·3d·7d)
                                                        └─ 각 시점: provider.postAnalytics() → snapshot(postId+ageBucket) 저장
[분석 화면] ──▶ 백엔드 집계 API ──▶ DB(snapshot/Post)만 읽음 (빠름)
                                  └─▶ ③ on-demand: AI 인사이트 요약 / 개선 제안 (gpt-5.4-nano)
```

- 3계층 규칙 준수: Controller → Service → Repository (필요 시 Manager 경유). 서버 로직은 `libs/server`(= `libraries/nestjs-libraries`)에, 수집기는 `apps/orchestrator`(Temporal)에 둔다.

## 4. 수집 전략 (확정)

- **게시물 "나이(발행 후 경과시간)" 기준 수집**: 발행 후 **1h · 6h · 24h · 3d · 7d** 시점에 측정하고 종료(게시물당 최대 5회 호출).
- 근거: 모든 게시물이 동일 경과시점(24h·7d) 값을 가져 시간대·후킹 비교가 공정해지고, 오래된 글을 매일 호출하지 않아 API/비용 절약. 발행 초반 급상승 곡선도 자연스럽게 잡힘.
- 구현: 매일 전체 스캔 cron이 아니라 **발행 워크플로우에 분석 수집 타이머를 이어 붙이는** Temporal 워크플로우. `releaseId`/`releaseURL`이 있는 게시물만 대상.
- "매일 전체 cron"은 채택하지 않음 (게시물별 경과시간이 섞여 비교가 오염되고 호출 낭비).

## 5. 데이터 모델 변경 (Prisma)

- `AnalyticsMetricSnapshot`에 **`ageBucket` 컬럼 추가** — enum `H1 | H6 | H24 | D3 | D7`. "발행 후 24h 시점 좋아요" 등 고정시점 비교를 인덱스로 빠르게. `measuredAt`은 그대로 시계열 곡선용. 인덱스: `[postId, canonicalMetric, ageBucket]`.
- `Post`에 **후킹 분류 결과 저장**: `hookType`(enum, nullable) · `hookTypeConfidence`(Float?) · `hookClassifiedAt`(DateTime?). 발행 직후 1회만 채움 → 재호출 없음.
- 후킹 유형 enum 초안: `QUESTION`(질문형) · `NUMBER`(숫자/통계) · `EMPATHY`(공감) · `SHOCK`(충격/반전) · `STORY`(스토리) · `HOWTO`(정보/방법) · `OTHER`.

## 6. 수집기 (Temporal, `apps/orchestrator`)

- 신규 워크플로우(예: `post-analytics-collection`): 입력 = `postId`. 발행 워크플로우 성공 직후 시작.
- 동작: 1h·6h·24h·3d·7d 타이머마다 깨어나 → Post의 `integrationId`로 provider 결정 → 토큰 갱신 후 `postAnalytics(integrationId, token, releaseId, ...)` 호출 → `toSnapshots()`로 정규화하되 **`postId`와 `ageBucket`을 채워** `replaceSnapshots()` 저장. 7d 후 종료.
- provider 메서드가 없거나 빈/실패 데이터를 반환하면 **스킵 + 로그**(기존 커밋 `c89d3f1d`의 빈/실패 로깅 패턴 따름). 구현 시 PolaPop이 실제 쓰는 채널부터 provider별 유효성 점검.

## 7. AI 레이어 (`OpenaiService` 확장)

- 모델명은 상수 한 곳(`HOOK_ANALYSIS_MODEL = 'gpt-5.4-nano'`, 스냅샷 `gpt-5.4-nano-2026-03-17`)으로 분리 → 인사이트/제안 품질이 아쉬우면 상위 모델로 손쉽게 교체. 기본값은 전부 nano.
- 요금 참고: 입력 $0.20 / 출력 $1.25 per 1M tokens. 공식 권장 용도: 분류·추출·랭킹.
- 메서드 3종:
  1. **후킹 유형 분류** — `chat.completions.parse` + structured output(zod): 도입부 → `{ hookType, confidence }`. 발행 직후 수집 워크플로우에서 1회 호출.
  2. **자연어 인사이트 요약** — 워크스페이스+기간의 상·하위 성과 게시물 도입부를 모아 "이런 후킹이 잘 먹힌다"를 한국어로 요약. on-demand.
  3. **후킹 개선 제안** — 주제 입력 시 잘 된 패턴 근거로 도입부 제안 생성. on-demand.

## 8. 백엔드 API (`workspace-analytics.controller` 확장)

- `summary` 확장/보완(모두 DB 집계로 반환):
  - 게시글별 리스트(정렬 + 24h/7d 고정시점 값 포함)
  - 시간대 집계(요일×시간 히트맵용)
  - 후킹 유형별 평균 성과
- AI on-demand 엔드포인트 2개 신규: 인사이트 요약 / 개선 제안. (워크스페이스 권한 체크는 기존 가드 재사용)

## 9. 프론트엔드 (기존 `workspace-analytics` 화면 확장)

기존 탭 안에 뷰 추가. 기존 컴포넌트·`colors.scss`/`global.scss`/Tailwind 규칙 준수, 네이티브 컴포넌트만 사용, SWR + `useFetch`(`libraries/helpers/src/utils/custom.fetch.tsx`), 훅은 rule-of-hooks 준수(개별 훅 분리).

- **게시글별 실적 표**: 도입부(첫 N자) + 채널 + 발행시각 + 24h/7d 지표, 지표순 정렬
- **시간대 히트맵**: 요일×시간 평균 성과
- **후킹 유형 카드**: 유형별 평균 성과 비교 + AI 인사이트 요약 카드 + 개선 제안 영역
- **채널 비교**: 기존 `channelComparison` 활용

## 10. 구현 순서 (단계)

1. **데이터 기반**: 스키마 마이그레이션(`ageBucket`, `Post.hookType*`) + 수집 워크플로우(`postId`/`ageBucket` 채우기) → 게시글별 표·시간대·채널비교 (AI 없이도 동작).
2. **AI 분류**: 후킹 유형 분류(`gpt-5.4-nano`) + 유형별 집계 카드.
3. **AI 인사이트**: 자연어 요약 + 개선 제안(on-demand).

## 11. 검증 (CLAUDE.md 검증 바)

각 단계 종료 시:
- `pnpm exec tsc --noEmit --pretty false --project apps/frontend/tsconfig.json`
- `pnpm exec tsc --noEmit --pretty false --project libraries/nestjs-libraries/tsconfig.json`
- `pnpm run build:frontend`, `pnpm run build:backend`
- (`apps/backend` 단독 tsc의 기존 implicit-any 베이스라인은 무관 에러로 간주)

프로덕션 반영 시: 컨테이너 health, PM2 online/restart 0, `/auth` 200, 미인증 public API 401, 실제 분석 route QA.

## 12. 미해결/추후 결정

- 후킹 유형 enum 7종은 초안 — 실제 게시물로 분류 품질 본 뒤 조정 가능.
- AI 인사이트/제안 결과 캐싱 정책(매번 생성 vs 단기 캐시)은 1차 구현에서 단순 on-demand로 두고, 비용 보고 결정.
- 워크스페이스 미인증 summary 접근이 500 반환하는 기존 품질 이슈는 본 작업 범위 밖(별도 추적).
