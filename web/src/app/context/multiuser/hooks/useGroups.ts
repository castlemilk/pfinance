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

export function useGroups({ user }: UseGroupsOptions): UseGroupsReturn {
  const [groups, setGroups] = useState<FinanceGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<FinanceGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const isLoadingRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  const refreshGroups = useCallback(async () => {
    if (!user) {
      console.log('[useGroups] refreshGroups: No user, clearing groups');
      setGroups([]);
      return;
    }
    
    if (isLoadingRef.current) {
      console.log('[useGroups] refreshGroups: Already loading, skipping');
      return;
    }
    isLoadingRef.current = true;

    try {
      console.log('[useGroups] refreshGroups: Calling listGroups with userId:', user.uid);
      const response = await financeClient.listGroups({
        userId: user.uid,
        pageSize: 100,
      });
      console.log('[useGroups] refreshGroups: Got response:', response.groups.length, 'groups');
      console.log('[useGroups] refreshGroups: Raw groups:', JSON.stringify(response.groups.map(g => ({ id: g.id, name: g.name, memberIds: g.memberIds }))));
      setGroups(response.groups.map(mapProtoGroupToLocal));
      setError(null);
    } catch (err) {
      console.error('[useGroups] refreshGroups: Failed to load groups:', err);
      setError(err instanceof Error ? err.message : 'Failed to load groups');
    } finally {
      isLoadingRef.current = false;
    }
  }, [user]);

  // Load groups on mount and when user changes
  useEffect(() => {
    const userId = user?.uid ?? null;
    if (userId === lastUserIdRef.current) {
      return;
    }
    lastUserIdRef.current = userId;
    
    if (user) {
      setLoading(true);
      refreshGroups().finally(() => setLoading(false));
    } else {
      setGroups([]);
      setActiveGroup(null);
    }
  }, [user, refreshGroups]);

  const createGroup = useCallback(async (name: string, description?: string): Promise<string> => {
    if (!user) throw new Error('User must be authenticated');

    const response = await financeClient.createGroup({
      ownerId: user.uid,
      name,
      description: description || '',
    });

    if (response.group) {
      const newGroup = mapProtoGroupToLocal(response.group);
      setGroups(prev => [...prev, newGroup]);
      return newGroup.id;
    }
    throw new Error('Failed to create group');
  }, [user]);

  const updateGroup = useCallback(async (groupId: string, name: string, description?: string): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    const response = await financeClient.updateGroup({
      groupId,
      name,
      description: description || '',
    });

    if (response.group) {
      const updatedGroup = mapProtoGroupToLocal(response.group);
      setGroups(prev => prev.map(g => g.id === groupId ? updatedGroup : g));
      if (activeGroup?.id === groupId) {
        setActiveGroup(updatedGroup);
      }
    }
  }, [user, activeGroup]);

  const deleteGroup = useCallback(async (groupId: string): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    await financeClient.deleteGroup({ groupId });
    setGroups(prev => prev.filter(g => g.id !== groupId));
    if (activeGroup?.id === groupId) {
      setActiveGroup(null);
    }
  }, [user, activeGroup]);

  const leaveGroup = useCallback(async (groupId: string): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    await financeClient.removeFromGroup({
      groupId,
      userId: user.uid,
    });

    setGroups(prev => prev.filter(g => g.id !== groupId));
    if (activeGroup?.id === groupId) {
      setActiveGroup(null);
    }
  }, [user, activeGroup]);

  return {
    groups,
    activeGroup,
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
