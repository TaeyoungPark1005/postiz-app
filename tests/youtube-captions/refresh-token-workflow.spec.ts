const getIntegrationsById = jest.fn();
const refreshToken = jest.fn();
const sleep = jest.fn();

jest.mock('@temporalio/workflow', () => ({
  proxyActivities: () => ({ getIntegrationsById, refreshToken }),
  sleep: (...args: unknown[]) => sleep(...args),
}));

import { refreshTokenWorkflow } from '@gitroom/orchestrator/workflows/refresh.token.workflow';

describe('refreshTokenWorkflow', () => {
  it('refreshes an already expired integration instead of abandoning its workflow', async () => {
    const expiredIntegration = {
      id: 'integration-1',
      organizationId: 'org-1',
      tokenExpiration: new Date('2020-01-01T00:00:00.000Z'),
      deletedAt: null,
      inBetweenSteps: false,
      refreshNeeded: false,
    };

    getIntegrationsById
      .mockResolvedValueOnce(expiredIntegration)
      .mockResolvedValueOnce(expiredIntegration)
      .mockResolvedValueOnce({ ...expiredIntegration, refreshNeeded: true });

    await expect(
      refreshTokenWorkflow({ organizationId: 'org-1', integrationId: 'integration-1' })
    ).resolves.toBe(false);

    expect(refreshToken).toHaveBeenCalledWith(expiredIntegration);
    expect(sleep).not.toHaveBeenCalled();
  });
});
