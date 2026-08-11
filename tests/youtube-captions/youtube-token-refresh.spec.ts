import 'reflect-metadata';

jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: {
    createStorage: () => ({ uploadSimple: jest.fn() }),
  },
}));

jest.mock(
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  () => ({ IntegrationManager: class IntegrationManager {} })
);

import { IntegrationRepository } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.repository';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { YoutubeProvider } from '@gitroom/nestjs-libraries/integrations/social/youtube.provider';

describe('YouTube OAuth refresh durability', () => {
  it('starts the token refresh workflow after a YouTube connection', async () => {
    const start = jest.fn().mockResolvedValue('workflow-started');
    const service = new RefreshIntegrationService(
      {} as any,
      {} as any,
      {
        client: {
          getRawClient: () => ({ workflow: { start } }),
        },
      } as any
    );

    await service.startRefreshWorkflow(
      'org-1',
      'integration-1',
      new YoutubeProvider()
    );

    expect(start).toHaveBeenCalledWith('refreshTokenWorkflow', {
      workflowId: 'refresh_integration-1',
      args: [{ integrationId: 'integration-1', organizationId: 'org-1' }],
      taskQueue: 'main',
      workflowIdConflictPolicy: 'TERMINATE_EXISTING',
    });
  });

  it('keeps the stored refresh token when a reconnect response omits one', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'integration-1' });
    const repository = new IntegrationRepository(
      { model: { integration: { upsert } } } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );

    await repository.createOrUpdateIntegration(
      undefined,
      false,
      'org-1',
      'YouTube channel',
      undefined,
      'social',
      'channel-1',
      'youtube',
      'new-access-token',
      undefined,
      3600
    );

    expect(upsert.mock.calls[0][0].update).not.toHaveProperty('refreshToken');
  });
});
