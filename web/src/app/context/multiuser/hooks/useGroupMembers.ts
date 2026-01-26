/**
 * useGroupMembers Hook
 * 
 * Manages group member operations.
 */

import { useCallback } from 'react';
import { User } from 'firebase/auth';
import { financeClient } from '@/lib/financeService';
import { localRoleToProto } from '../mappers';

interface UseGroupMembersOptions {
  user: User | null;
  onMemberUpdated?: () => Promise<void>;
}

interface UseGroupMembersReturn {
  inviteUserToGroup: (groupId: string, email: string, role?: 'admin' | 'member') => Promise<void>;
  removeMemberFromGroup: (groupId: string, userId: string) => Promise<void>;
  updateMemberRole: (groupId: string, userId: string, role: 'admin' | 'member' | 'viewer') => Promise<void>;
}

export function useGroupMembers({ user, onMemberUpdated }: UseGroupMembersOptions): UseGroupMembersReturn {
  const inviteUserToGroup = useCallback(async (
    groupId: string, 
    email: string, 
    role: 'admin' | 'member' = 'member'
  ): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    await financeClient.inviteToGroup({
      groupId,
      inviterId: user.uid,
      inviteeEmail: email,
      role: localRoleToProto[role],
    });
  }, [user]);

  const removeMemberFromGroup = useCallback(async (groupId: string, userId: string): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    await financeClient.removeFromGroup({ groupId, userId });
    await onMemberUpdated?.();
  }, [user, onMemberUpdated]);

  const updateMemberRole = useCallback(async (
    groupId: string, 
    userId: string, 
    role: 'admin' | 'member' | 'viewer'
  ): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    await financeClient.updateMemberRole({
      groupId,
      userId,
      newRole: localRoleToProto[role],
    });
    await onMemberUpdated?.();
  }, [user, onMemberUpdated]);

  return {
    inviteUserToGroup,
    removeMemberFromGroup,
    updateMemberRole,
  };
}
