import { TemporalModule } from 'nestjs-temporal-core';
import { socialIntegrationList } from '@gitroom/nestjs-libraries/integrations/integration.manager';

/**
 * ACTIVE_PLATFORMS 로 기동할 Temporal 워커를 실제 사용하는 플랫폼으로 좁힌다.
 *
 * 기본값(미설정)은 지원 플랫폼 전체(34종 중 하이픈 없는 27종)를 띄우는 upstream
 * 동작이다. SaaS 로서는 맞지만, 셀프호스트에서는 계정이 하나도 없는 플랫폼까지
 * 워커를 띄우면서 각자 2.86MB 워크플로우 번들을 webpack 으로 빌드한다.
 * 라즈베리파이(4코어/7.6GB)에서 이게 메모리를 고갈시켜 orchestrator 가 반복
 * 크래시했고, 발행 워크플로우가 videos.insert() 도중 죽어 DB 에 결과를 쓰지
 * 못한 채 재시작되면서 YouTube 에 같은 영상이 10 번 중복 업로드됐다
 * (2026-07-28 사고).
 *
 * ⚠️ 라우팅 키는 providerIdentifier 가 아니라 그 하이픈 앞부분이다
 * (posts.service.ts: `providerIdentifier.split('-')[0].toLowerCase()`).
 * 따라서 instagram-standalone 을 쓰면 `instagram` 을, linkedin-page 를 쓰면
 * `linkedin` 을 넣어야 한다. 여기서 빠진 플랫폼은 워커가 없어 발행이 QUEUE 에
 * 영원히 쌓이므로, 채널을 새로 연결하면 이 값도 함께 갱신할 것.
 *
 * 예: ACTIVE_PLATFORMS=youtube,tiktok,threads,instagram
 */
const resolveActivePlatforms = (): string[] | null => {
  const raw = (process.env.ACTIVE_PLATFORMS || '').trim();
  if (!raw) {
    // 미설정이면 좁히지 않는다 — 설정을 깜빡했을 때 발행이 조용히 멈추는 것보다
    // 느리더라도 동작하는 쪽이 안전하다.
    return null;
  }

  const list = raw
    .split(',')
    .map((p) => p.trim().split('-')[0].toLowerCase())
    .filter(Boolean);

  // 'main' 은 스케줄링 등 공용 워크플로우용이라 항상 필요하다.
  return list.length ? Array.from(new Set(['main', ...list])) : null;
};

export const getTemporalModule = (
  isWorkers: boolean,
  path?: string,
  activityClasses?: any[]
) => {
  const activePlatforms = resolveActivePlatforms();

  const workers = !isWorkers
    ? []
    : [{ identifier: 'main', maxConcurrentJob: undefined }, ...socialIntegrationList]
        .filter((f) => f.identifier.indexOf('-') === -1)
        .filter(
          (f) =>
            !activePlatforms || activePlatforms.includes(f.identifier.toLowerCase())
        )
        .map((integration) => ({
          taskQueue: integration.identifier.split('-')[0],
          workflowsPath: path!,
          activityClasses: activityClasses!,
          autoStart: true,
          ...(integration.maxConcurrentJob
            ? {
                workerOptions: {
                  maxConcurrentActivityTaskExecutions: integration.maxConcurrentJob,
                },
              }
            : {}),
        }));

  if (isWorkers) {
    // 워커 하나당 워크플로우 번들을 따로 빌드하므로, 어떤 큐가 떴는지 남겨두면
    // "발행이 QUEUE 에서 안 넘어간다" 는 사고를 즉시 판별할 수 있다.
    console.log(
      `[temporal] workers(${workers.length}): ${workers
        .map((w) => w.taskQueue)
        .join(', ')}` +
        (activePlatforms
          ? ` — ACTIVE_PLATFORMS 로 제한됨`
          : ` — ACTIVE_PLATFORMS 미설정, 전체 기동`)
    );
  }

  return TemporalModule.register({
    isGlobal: true,
    connection: {
      address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
      ...process.env.TEMPORAL_TLS === 'true' ? {tls: true} : {},
      ...process.env.TEMPORAL_API_KEY ? {apiKey: process.env.TEMPORAL_API_KEY} : {},
      namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    },
    taskQueue: 'main',
    logLevel: 'error',
    ...(isWorkers ? { workers } : {}),
  });
};
