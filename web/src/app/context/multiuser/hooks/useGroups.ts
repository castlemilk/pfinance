/**
 * useGroups Hook
 *
 * Manages group CRUD operations and state.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { User } from 'firebase/auth';
import { financeClient } from '@/lib/financeService';
import { FinanceGroup } from '../types';
import { mapProtoGroupToLocal } from '../mappers';

interface UseGroupsOptions {
  user: User | null;
}

interface UseGroupsReturn {
  groups: FinanceGroup[];
  activeGroup: FinanceGroup | null;
  setActiveGroup: (group: FinanceGroup | null) => void;
  loading: boolean;
  error: string | null;
  createGroup: (name: string, description?: string) => Promise<string>;
  updateGroup: (groupId: string, name: string, description?: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  leaveGroup: (groupId: string) => Promise<void>;
  refreshGroups: () => Promise<void>;
}

interface GroupState {
  userId: string | null;
  groups: FinanceGroup[];
  activeGroup: FinanceGroup | null;
}

const ACTIVE_GROUP_STORAGE_PREFIX = 'pfinance-active-group-';

function getPersistedActiveGroupId(userId: string): string | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage.getItem(`${ACTIVE_GROUP_STORAGE_PREFIX}${userId}`);
  } catch {
    return null;
  }
}

function persistActiveGroupId(userId: string, groupId: string | null): void {
  if (typeof window === 'undefined') return;

  try {
    const key = `${ACTIVE_GROUP_STORAGE_PREFIX}${userId}`;
    if (groupId) {
      window.localStorage.setItem(key, groupId);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

export function useGroups({ user }: UseGroupsOptions): UseGroupsReturn {
  const userId = user?.uid ?? null;
  const [groupState, setGroupState] = useState<GroupState>({
    userId: null,
    groups: [],
    activeGroup: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentUserIdRef = useRef<string | null>(userId);
  const requestSequenceRef = useRef(0);
  const latestRequestRef = useRef<{ userId: string; sequence: number } | null>(null);
  currentUserIdRef.current = userId;

  const refreshGroups = useCallback(async () => {
    const requestUserId = userId;
    if (!requestUserId) {
      if (currentUserIdRef.current === null) {
        setGroupState({ userId: null, groups: [], activeGroup: null });
      }
      return;
    }

    const sequence = ++requestSequenceRef.current;
    latestRequestRef.current = { userId: requestUserId, sequence };

    const isCurrentRequest = () => (
      currentUserIdRef.current === requestUserId
      && latestRequestRef.current?.userId === requestUserId
      && latestRequestRef.current.sequence === sequence
    );

    try {
      const response = await financeClient.listGroups({
        userId: requestUserId,
        pageSize: 100,
      });
      if (!isCurrentRequest()) return;

      const refreshedGroups = response.groups.map(mapProtoGroupToLocal);
      setGroupState(previous => {
        if (!isCurrentRequest()) return previous;

        const currentGroupId = previous.userId === requestUserId
          ? previous.activeGroup?.id
          : undefined;
        const persistedGroupId = getPersistedActiveGroupId(requestUserId);
        const activeGroup = (
          refreshedGroups.find(group => group.id === currentGroupId)
          ?? refreshedGroups.find(group => group.id === persistedGroupId)
          ?? refreshedGroups[0]
          ?? null
        );

        return {
          userId: requestUserId,
          groups: refreshedGroups,
          activeGroup,
        };
      });
      setError(null);
    } catch (err) {
      if (!isCurrentRequest()) return;
      console.error('[useGroups] refreshGroups: Failed to load groups:', err);
      setError(err instanceof Error ? err.message : 'Failed to load groups');
    }
  }, [userId]);

  // Bind all visible group state to the current authenticated user.
  useEffect(() => {
    const effectUserId = userId;
    setGroupState({ userId: effectUserId, groups: [], activeGroup: null });
    setError(null);

    if (!effectUserId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    refreshGroups().finally(() => {
      if (currentUserIdRef.current === effectUserId) {
        setLoading(false);
      }
    });
  }, [userId, refreshGroups]);

  const setActiveGroup = useCallback((group: FinanceGroup | null) => {
    const selectionUserId = userId;
    if (!selectionUserId || currentUserIdRef.current !== selectionUserId) return;

    persistActiveGroupId(selectionUserId, group?.id ?? null);
    setGroupState(previous => ({
      userId: selectionUserId,
      groups: previous.userId === selectionUserId ? previous.groups : [],
      activeGroup: group,
    }));
  }, [userId]);

  const createGroup = useCallback(async (name: string, description?: string): Promise<string> => {
    const requestUserId = userId;
    if (!requestUserId) throw new Error('User must be authenticated');

    const response = await financeClient.createGroup({
      ownerId: requestUserId,
      name,
      description: description || '',
    });

    if (response.group) {
      const newGroup = mapProtoGroupToLocal(response.group);
      if (currentUserIdRef.current === requestUserId) {
        setGroupState(previous => {
          if (previous.userId !== requestUserId) return previous;
          return { ...previous, groups: [...previous.groups, newGroup] };
        });
      }
      return newGroup.id;
    }
    throw new Error('Failed to create group');
  }, [userId]);

  const updateGroup = useCallback(async (groupId: string, name: string, description?: string): Promise<void> => {
    const requestUserId = userId;
    if (!requestUserId) throw new Error('User must be authenticated');

    const response = await financeClient.updateGroup({
      groupId,
      name,
      description: description || '',
    });

    if (response.group && currentUserIdRef.current === requestUserId) {
      const updatedGroup = mapProtoGroupToLocal(response.group);
      setGroupState(previous => {
        if (previous.userId !== requestUserId) return previous;
        return {
          ...previous,
          groups: previous.groups.map(group => group.id === groupId ? updatedGroup : group),
          activeGroup: previous.activeGroup?.id === groupId ? updatedGroup : previous.activeGroup,
        };
      });
    }
  }, [userId]);

  const deleteGroup = useCallback(async (groupId: string): Promise<void> => {
    const requestUserId = userId;
    if (!requestUserId) throw new Error('User must be authenticated');

    await financeClient.deleteGroup({ groupId });
    if (currentUserIdRef.current !== requestUserId) return;

    if (getPersistedActiveGroupId(requestUserId) === groupId) {
      persistActiveGroupId(requestUserId, null);
    }
    setGroupState(previous => {
      if (previous.userId !== requestUserId) return previous;
      return {
        ...previous,
        groups: previous.groups.filter(group => group.id !== groupId),
        activeGroup: previous.activeGroup?.id === groupId ? null : previous.activeGroup,
      };
    });
  }, [userId]);

  const leaveGroup = useCallback(async (groupId: string): Promise<void> => {
    const requestUserId = userId;
    if (!requestUserId) throw new Error('User must be authenticated');

    await financeClient.removeFromGroup({
      groupId,
      userId: requestUserId,
    });
    if (currentUserIdRef.current !== requestUserId) return;

    if (getPersistedActiveGroupId(requestUserId) === groupId) {
      persistActiveGroupId(requestUserId, null);
    }
    setGroupState(previous => {
      if (previous.userId !== requestUserId) return previous;
      return {
        ...previous,
        groups: previous.groups.filter(group => group.id !== groupId),
        activeGroup: previous.activeGroup?.id === groupId ? null : previous.activeGroup,
      };
    });
  }, [userId]);

  const stateBelongsToCurrentUser = groupState.userId === userId;

  return {
    groups: stateBelongsToCurrentUser ? groupState.groups : [],
    activeGroup: stateBelongsToCurrentUser ? groupState.activeGroup : null,
    setActiveGroup,
    loading,
    error,
    createGroup,
    updateGroup,
    deleteGroup,
    leaveGroup,
    refreshGroups,
  };
}
