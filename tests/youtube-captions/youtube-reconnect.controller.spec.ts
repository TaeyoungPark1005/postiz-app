import 'reflect-metadata';

const mockRedisGet = jest.fn();
const mockRedisDel = jest.fn().mockResolvedValue(undefined);

jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {
    get: (...args: unknown[]) => mockRedisGet(...args),
    del: (...args: unknown[]) => mockRedisDel(...args),
  },
}));

jest.mock(
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  () => ({ IntegrationManager: class IntegrationManager {} })
);

import { NoAuthIntegrationsController } from '@gitroom/backend/api/routes/no.auth.integrations.controller';

describe('NoAuthIntegrationsController reconnect token persistence', () => {
  it('persists the provider refresh token and expiry returned by authentication', async () => {
    mockRedisGet.mockImplementation(async (key: string) => {
      const values: Record<string, string | null> = {
        'login:oauth-state': 'code-verifier',
        'organization:oauth-state': 'org-1',
        'refresh:oauth-state': 'youtube-channel-1',
        'onboarding:oauth-state': null,
        'webhookUrl:oauth-state': null,
        'redirect:oauth-state': null,
      };
      return values[key] ?? null;
    });

    const provider = {
      customFields: undefined,
      externalUrl: undefined,
      oneTimeToken: false,
      isBetweenSteps: false,
      isChromeExtension: false,
      authenticate: jest.fn().mockResolvedValue({
        id: 'google-user-1',
        name: 'OAuth account',
        accessToken: 'provider-access-token',
        refreshToken: 'provider-refresh-token',
        expiresIn: 3600,
        picture: 'https://example.com/channel.png',
        username: '@oauth-account',
      }),
      reConnect: jest.fn().mockResolvedValue({
        id: 'youtube-channel-1',
        name: 'Selected YouTube channel',
        accessToken: 'provider-access-token',
        picture: 'https://example.com/channel.png',
        username: '@selected-channel',
      }),
    };
    const integrationManager = {
      getAllowedSocialsIntegrations: jest.fn().mockReturnValue(['youtube']),
      getSocialIntegration: jest.fn().mockReturnValue(provider),
    };
    const integrationService = {
      createOrUpdateIntegration: jest
        .fn()
        .mockResolvedValue({ id: 'integration-1' }),
    };
    const refreshIntegrationService = {
      startRefreshWorkflow: jest.fn().mockResolvedValue(undefined),
    };
    const organizationService = {
      getOrgById: jest.fn().mockResolvedValue({
        id: 'org-1',
        apiKey: 'org-api-key',
        isTrailing: false,
      }),
    };
    const controller = new NoAuthIntegrationsController(
      integrationManager as any,
      integrationService as any,
      refreshIntegrationService as any,
      organizationService as any
    );

    await controller.connectSocialMedia('youtube', {
      state: 'oauth-state',
      code: 'oauth-code',
      timezone: '540',
      refresh: 'youtube-channel-1',
    });

    expect(provider.reConnect).toHaveBeenCalledWith(
      'google-user-1',
      'youtube-channel-1',
      'provider-access-token'
    );
    expect(integrationService.createOrUpdateIntegration).toHaveBeenCalledWith(
      undefined,
      false,
      'org-1',
      'Selected YouTube channel',
      'https://example.com/channel.png',
      'social',
      'youtube-channel-1',
      'youtube',
      'provider-access-token',
      'provider-refresh-token',
      3600,
      '@selected-channel',
      false,
      'youtube-channel-1',
      540,
      undefined
    );
  });
});
