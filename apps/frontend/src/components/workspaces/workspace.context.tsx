'use client';

import {
  createContext,
  type FC,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import useSWR, { type KeyedMutator } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  parseProductWorkspace,
  parseProductWorkspaces,
  type ProductWorkspace,
} from '@gitroom/frontend/components/workspace-analytics/workspace-analytics.types';

const workspaceStorageKey = (organizationId: string) =>
  `postiz.selected-product-workspace.${organizationId}`;

type ProductWorkspaceContextValue = {
  readonly workspaces: readonly ProductWorkspace[];
  readonly selectedWorkspaceId: string;
  readonly selectedWorkspace?: ProductWorkspace;
  readonly isLoading: boolean;
  readonly selectWorkspace: (workspaceId: string) => void;
  readonly createWorkspace: (name: string) => Promise<ProductWorkspace | null>;
  readonly deleteWorkspace: (workspaceId: string) => Promise<void>;
  readonly assignChannel: (
    workspaceId: string,
    integrationId: string
  ) => Promise<void>;
  readonly removeChannel: (
    workspaceId: string,
    integrationId: string
  ) => Promise<void>;
  readonly mutateWorkspaces: KeyedMutator<readonly ProductWorkspace[]>;
};

const ProductWorkspaceContext = createContext<
  ProductWorkspaceContextValue | undefined
>(undefined);

export const ProductWorkspaceProvider: FC<{
  readonly organizationId: string;
  readonly children: ReactNode;
}> = ({ organizationId, children }) => {
  const fetch = useFetch();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');

  const loadWorkspaces = useCallback(async () => {
    return parseProductWorkspaces(
      await (await fetch('/workspace-analytics/workspaces')).json()
    );
  }, [fetch]);

  const {
    data: workspaces = [],
    isLoading,
    mutate: mutateWorkspaces,
  } = useSWR('product-workspaces', loadWorkspaces, {
    revalidateOnFocus: false,
  });

  const selectWorkspace = useCallback(
    (workspaceId: string) => {
      setSelectedWorkspaceId(workspaceId);
      localStorage.setItem(workspaceStorageKey(organizationId), workspaceId);
    },
    [organizationId]
  );

  useEffect(() => {
    if (!workspaces.length) {
      return;
    }

    const savedWorkspaceId = localStorage.getItem(
      workspaceStorageKey(organizationId)
    );
    const selectedStillExists = workspaces.some(
      (workspace) => workspace.id === selectedWorkspaceId
    );
    const savedWorkspace = workspaces.find(
      (workspace) => workspace.id === savedWorkspaceId
    );
    const nextWorkspaceId = selectedStillExists
      ? selectedWorkspaceId
      : savedWorkspace?.id || workspaces[0].id;

    if (nextWorkspaceId !== selectedWorkspaceId) {
      selectWorkspace(nextWorkspaceId);
    }
  }, [organizationId, selectWorkspace, selectedWorkspaceId, workspaces]);

  const createWorkspace = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        return null;
      }

      const created = parseProductWorkspace(
        await (
          await fetch('/workspace-analytics/workspaces', {
            method: 'POST',
            body: JSON.stringify({ name: trimmed }),
          })
        ).json()
      );
      selectWorkspace(created.id);
      await mutateWorkspaces();
      return created;
    },
    [fetch, mutateWorkspaces, selectWorkspace]
  );

  const assignChannel = useCallback(
    async (workspaceId: string, integrationId: string) => {
      await fetch(`/workspace-analytics/workspaces/${workspaceId}/channels`, {
        method: 'POST',
        body: JSON.stringify({ integrationId }),
      });
      await mutateWorkspaces();
    },
    [fetch, mutateWorkspaces]
  );

  const removeChannel = useCallback(
    async (workspaceId: string, integrationId: string) => {
      await fetch(
        `/workspace-analytics/workspaces/${workspaceId}/channels/${integrationId}`,
        {
          method: 'DELETE',
        }
      );
      await mutateWorkspaces();
    },
    [fetch, mutateWorkspaces]
  );

  const deleteWorkspace = useCallback(
    async (workspaceId: string) => {
      await fetch(`/workspace-analytics/workspaces/${workspaceId}`, {
        method: 'DELETE',
      });
      const refreshedWorkspaces = (await mutateWorkspaces()) || [];
      const nextWorkspace = refreshedWorkspaces.find(
        (workspace) => workspace.id !== workspaceId
      );

      if (selectedWorkspaceId === workspaceId) {
        if (nextWorkspace) {
          selectWorkspace(nextWorkspace.id);
        } else {
          setSelectedWorkspaceId('');
          localStorage.removeItem(workspaceStorageKey(organizationId));
        }
      }
    },
    [fetch, mutateWorkspaces, organizationId, selectedWorkspaceId, selectWorkspace]
  );

  const selectedWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ||
      workspaces[0],
    [selectedWorkspaceId, workspaces]
  );

  const value = useMemo(
    () => ({
      workspaces,
      selectedWorkspaceId: selectedWorkspace?.id || '',
      selectedWorkspace,
      isLoading,
      selectWorkspace,
      createWorkspace,
      deleteWorkspace,
      assignChannel,
      removeChannel,
      mutateWorkspaces,
    }),
    [
      assignChannel,
      removeChannel,
      createWorkspace,
      deleteWorkspace,
      isLoading,
      mutateWorkspaces,
      selectWorkspace,
      selectedWorkspace,
      workspaces,
    ]
  );

  return (
    <ProductWorkspaceContext.Provider value={value}>
      {children}
    </ProductWorkspaceContext.Provider>
  );
};

export const useProductWorkspace = () => {
  const context = useContext(ProductWorkspaceContext);
  if (!context) {
    throw new Error('useProductWorkspace must be used inside ProductWorkspaceProvider');
  }
  return context;
};
