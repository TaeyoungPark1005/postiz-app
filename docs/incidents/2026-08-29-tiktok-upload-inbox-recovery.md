# 2026-08-29 한국사 TikTok UPLOAD/Inbox 복구

## 요약

`한국사 한 장면` TikTok 채널에서 영상 `UPLOAD + SELF_ONLY` 발행이 TikTok Inbox로 전달되지 않고 `invalid_params`로 실패했다.

원인은 Postiz의 영상 UPLOAD 요청이 TikTok의 사진용 `/content/init/` 규격을 사용한 것이었다. 영상 UPLOAD를 공식 영상 Inbox 엔드포인트인 `/inbox/video/init/`로 복구했고, 운영 Raspberry Pi의 orchestrator에 영구 override mount로 반영했다.

복구 후 1·21 사태 영상을 다시 전송했으며 Postiz 상태 `PUBLISHED`, release URL `https://www.tiktok.com/messages?lang=en`을 확인했다.

## 대상

| 항목 | 값 |
|---|---|
| Postiz | `https://postiz.jocoding.io` |
| Public API | `https://postiz.jocoding.io/api/public/v1` |
| API 인증 | `Authorization: <API key>` — `Bearer` 접두사 없음 |
| TikTok 표시명 | `한국사 한 장면` |
| TikTok 프로필 | `hanguksa.jangmyeon` |
| Integration ID | `cmtdvf2r200hjpo853fx09b86` |
| 운영 서버 | Raspberry Pi `openclaw@192.168.123.105` |
| 운영 경로 | `/home/openclaw/postiz-restore` |

API 키, TikTok access token, refresh token, provider client secret은 이 문서에 기록하지 않는다.

## 최초 증상

### 1·21 사태 영상

- 로컬 파일: `episodes/0121-kimshinjo/export/0121-v2.mp4`
- 형식: H.264 + AAC, 720×1280, 75.6초, 약 31MB
- Postiz media ID: `fd048b3f-fe36-4a72-8d4b-7e97574c0ce2`
- Postiz URL: `https://postiz.jocoding.io/uploads/2026/08/29/7cb555388df9bd868d8b27b5ba72cbcc.mp4`
- 같은 파일의 Instagram 발행은 성공: `https://www.instagram.com/reel/DcnPnKVDKt6/`

### 실패 시도

| 시각(KST) | Post ID | 방식 | 결과 |
|---|---|---|---|
| 15:00 | `cmtdvnyar00l3po85evf1e9nx` | `UPLOAD + SELF_ONLY + video_made_with_ai=true` | `ERROR` |
| 15:43 | `cmte0lhlp00lepo85jyhl531a` | `DIRECT_POST + SELF_ONLY` | `ERROR` |
| 15:44 | `cmte0mixr00lfpo85gt0t64ph` | `UPLOAD + SELF_ONLY`, 짧은 본문 | `ERROR` |

Postiz의 사용자용 오류 문구만 보면 첫 번째와 세 번째는 `Invalid request parameters, please check content format`이었다. 운영 DB의 Temporal failure detail에는 TikTok 원문이 다음과 같이 보존돼 있었다.

```text
code: invalid_params
message: Invalid media_type or post_mode
```

실제로 TikTok에 보낸 요청은 다음 형태였다.

```json
{
  "post_info": {
    "title": "박정희 모가지 따러 왔수다",
    "description": "..."
  },
  "post_mode": "MEDIA_UPLOAD",
  "media_type": "VIDEO",
  "source_info": {
    "source": "PULL_FROM_URL",
    "video_url": "https://postiz.jocoding.io/uploads/...mp4"
  }
}
```

15:43 DIRECT_POST 실패는 다른 문제였다. TikTok 원문은 다음과 같았다.

```text
unaudited_client_can_only_post_to_private_accounts
```

`privacy_level=SELF_ONLY`를 보냈더라도 TikTok이 앱을 unaudited client로 판정해 Direct Post 요청을 차단했다. 이 오류는 UPLOAD/Inbox 경로 복구와 별개다.

## 예전 성공 건 대조

2026-08-25~27에 `https://www.tiktok.com/messages?lang=en`으로 끝난 성공 포스트 8건을 운영 DB에서 확인했다.

이 성공 건들은 `한국사 한 장면` 채널이 아니라 모두 `조코헌트(jocohunt)` integration `cmq9cs2k0000bmw7imbqhia78`의 사진 게시물이었다. 따라서 “같은 Postiz 인스턴스에서 Inbox 성공”은 사실이지만 “같은 한국사 채널과 같은 영상 요청 규격으로 성공”한 증거는 아니었다.

## 원인

영상 UPLOAD 경로가 2026-07-30 커밋 `cc25f5f3`에서 다음과 같이 변경돼 있었다.

```text
변경 전: /inbox/video/init/
변경 후: /content/init/ + post_mode=MEDIA_UPLOAD + media_type=VIDEO
```

변경 당시 의도는 TikTok Inbox 초안에 caption을 전달하는 것이었다. 그러나 TikTok의 `/content/init/`에서 `MEDIA_UPLOAD`은 사진 게시용 규격이며 현재 `media_type`은 `PHOTO`만 허용한다. 영상에 `media_type=VIDEO`를 보내면 TikTok이 `Invalid media_type or post_mode`로 거절한다.

TikTok 영상 UPLOAD의 지원 규격은 다음과 같다.

```text
POST /v2/post/publish/inbox/video/init/
scope: video.upload
body: source_info
source: PULL_FROM_URL 또는 FILE_UPLOAD
```

이 영상 Inbox 엔드포인트는 `post_info` caption을 적용하지 않는다. 따라서 현재 우선순위는 다음과 같다.

1. 영상이 TikTok Inbox에 정상 도착해야 한다.
2. 사용자가 TikTok 앱 편집 화면에서 caption·음악·공개 범위를 최종 확인한다.
3. 영상 UPLOAD caption 자동 반영은 별도 지원 API가 생기기 전까지 보장하지 않는다.

## 코드 수정

수정 파일:

```text
libraries/nestjs-libraries/src/integrations/social/tiktok.provider.ts
```

수정 내용:

- 사진 UPLOAD: `/content/init/` 유지
- 영상 UPLOAD: `/inbox/video/init/`로 복구
- 영상 요청에서 `post_mode=MEDIA_UPLOAD`, `media_type=VIDEO` 제거
- 영상 source는 `PULL_FROM_URL`과 `video_url`만 전달
- DIRECT_POST 영상은 `/video/init/` 유지

코드 커밋:

```text
c6e62d2a fix(tiktok): use inbox endpoint for video uploads
branch: fix/tiktok-upload-inbox
```

로컬 검증:

```text
pnpm exec tsc --noEmit --pretty false --project libraries/nestjs-libraries/tsconfig.json
git diff --check
```

두 검증 모두 통과했다.

## 운영 반영

### ARM64 이미지 빌드

GitHub Actions에서 ARM64 이미지를 빌드하고 Docker Hub에 push했다.

- Workflow run: `33240358681`
- 결과: 성공
- 임시 tag: `taeyoung1005/postiz-app:tiktok-upload-inbox-arm64`

Raspberry Pi에서 전체 이미지를 pull하려 했으나 다음 이유로 시간이 오래 걸렸다.

- 기존 Postiz 이미지 크기 약 6.36GB
- 변경된 앱 레이어 압축 크기 약 957MB
- SD카드 기반 스토리지에서 대형 레이어 압축 해제가 느림
- 루트 디스크 사용량이 일시적으로 98%까지 상승

실행 중인 기존 컨테이너와 데이터 볼륨을 유지하기 위해 전체 이미지 교체를 중단하고 unused image/build cache만 정리했다. 최종 루트 디스크는 약 83%, 여유 약 9.5GB로 회복됐다.

### Orchestrator override

전체 이미지 교체 대신 수정된 compiled provider만 운영 호스트에 저장했다.

```text
/home/openclaw/postiz-restore/overrides/tiktok.provider.js
```

`docker-compose.override.yaml`에 다음 read-only mount를 추가했다.

```yaml
- ./overrides/tiktok.provider.js:/app/apps/orchestrator/dist/libraries/nestjs-libraries/src/integrations/social/tiktok.provider.js:ro
```

기존 override 백업:

```text
/home/openclaw/postiz-restore/docker-compose.override.yaml.bak-20260829-tiktok
```

컨테이너 재생성 중 기존 컨테이너가 잠시 `Dead/removing` 상태로 남았지만 새 컨테이너를 기동해 복구했다. DB와 uploads volume은 삭제하거나 변경하지 않았다.

## 중복 20:00 큐 확인

20:00 KST 한국사 TikTok 후보가 두 개 조회됐다.

| Post ID | 상태 | 내용 | 최종 판정 |
|---|---|---|---|
| `cmtdvnyqr00l6po8560b7r2ou` | `QUEUE` 표시 | 짧은 설명 | `deletedAt=2026-08-29 15:32:02 KST`, 실행 workflow 0건 |
| `cmte06e9m00lcpo850p5672u8` | `QUEUE` | 긴 설명 | 유지 대상 |

첫 번째 항목은 DB의 state 문자열은 `QUEUE`로 남아 있지만 이미 soft-delete된 항목이었다. Public API로 다시 삭제하면 HTTP 500이 반환됐으나 `deletedAt`은 이미 설정돼 있었고, Temporal에서 해당 post ID의 실행 중 workflow가 0건임을 확인했다. 실제 20:00 전송 대상은 `cmte06e9m00lcpo850p5672u8` 하나다.

## 1·21 사태 재업로드

기존 media를 재사용해 Public API로 즉시 게시했다.

설정:

```json
{
  "__type": "tiktok",
  "title": "박정희 모가지 따러 왔수다",
  "privacy_level": "SELF_ONLY",
  "duet": false,
  "stitch": false,
  "comment": true,
  "autoAddMusic": "no",
  "brand_content_toggle": false,
  "brand_organic_toggle": false,
  "video_made_with_ai": true,
  "content_posting_method": "UPLOAD"
}
```

결과:

| 항목 | 값 |
|---|---|
| API 응답 | HTTP 201 |
| 새 Post ID | `cmte4mqf20000lge1u97ngpw1` |
| 생성 | 2026-08-29 17:36:43 KST |
| 완료 | 2026-08-29 17:37:37 KST |
| Postiz 상태 | `PUBLISHED` |
| Release URL | `https://www.tiktok.com/messages?lang=en` |

이 release URL과 상태는 TikTok이 `SEND_TO_USER_INBOX`를 반환했다는 뜻이다. TikTok 앱의 프로필 초안(Drafts)이 아니라 `hanguksa.jangmyeon` 계정의 받은편지함/알림에서 열어 편집과 전체공개 전환을 완료해야 한다.

## 최종 검증

운영 검증 결과:

- `postiz` container: running, healthy
- PM2: backend/frontend/orchestrator 모두 online, 새 컨테이너 기준 restart 0
- 내부 포트: `3000`, `3002`, `4200`, `5000` listening
- 외부 `https://postiz.jocoding.io/auth`: HTTP 200
- 무인증 Public API integrations: HTTP 401
- Temporal `tiktok` queue: workflow/activity poller active
- Temporal `tiktok` backlog: 0
- override mount가 orchestrator의 `tiktok.provider.js`에 연결된 것을 확인
- runtime 코드에서 영상 UPLOAD가 `/inbox/video/init/`를 사용하는 것을 확인
- 루트 디스크: 약 83% 사용, 약 9.5GB 여유

## 운영 시 주의사항

1. `UPLOAD` 성공은 TikTok 공개 게시 완료가 아니라 Inbox 전달 완료다.
2. TikTok 앱 로그인 계정이 `hanguksa.jangmyeon`인지 확인한다.
3. 앱에서는 프로필의 Drafts보다 받은편지함/알림을 먼저 확인한다.
4. Inbox 영상은 caption이 비어 있을 수 있으므로 TikTok 앱에서 본문을 다시 확인한다.
5. 영상에 음악을 붙여야 하면 `DIRECT_POST`가 아니라 `UPLOAD`를 사용한다.
6. `DIRECT_POST`는 현재 unaudited client 제한을 받을 수 있다.
7. 향후 정상 ARM64 이미지를 배포할 때도 compose의 provider override가 우선 적용된다. 이미지에 `c6e62d2a` 이후 수정이 포함되면 override를 제거할지 코드와 diff를 비교한 뒤 결정한다.
8. `docker image prune -af`, `docker builder prune -af`는 unused image/build cache만 정리한다. Postiz/PostgreSQL uploads/data volume은 prune하지 않는다.

## 다음 확인

- TikTok 앱 Inbox에서 새 1·21 항목이 보이는지 확인
- 20:00 `cmte06e9m00lcpo850p5672u8`이 `PUBLISHED`와 messages release URL로 전환되는지 확인
- Inbox 편집 화면에서 caption·AI 표기·공개 범위를 확인한 뒤 전체공개
