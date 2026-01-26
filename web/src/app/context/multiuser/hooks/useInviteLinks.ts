/**
 * useInviteLinks Hook
 * 
 * Manages group invite link operations.
 */

import { useCallback } from 'react';
import { User } from 'firebase/auth';
import { financeClient } from '@/lib/financeService';
import { GroupRole } from '@/gen/pfinance/v1/types_pb';
import { FinanceGroup, InviteLink } from '../types';
import { mapProtoGroupToLocal, mapProtoInviteLinkToLocal } from '../mappers';

interface UseInviteLinksOptions {
  user: User | null;
  onGroupJoined?: (group: FinanceGroup) => void;
}

interface UseInviteLinksReturn {
  createInviteLink: (groupId: string, maxUses?: number, expiresInDays?: number) => Promise<InviteLink>;
  getInviteLinkByCode: (code: string) => Promise<{ link: InviteLink; group: FinanceGroup } | null>;
  joinGroupByCode: (code: string) => Promise<FinanceGroup>;
  listInviteLinks: (groupId: string) => Promise<InviteLink[]>;
  deactivateInviteLink: (linkId: string) => Promise<void>;
}

export function useInviteLinks({ user, onGroupJoined }: UseInviteLinksOptions): UseInviteLinksReturn {
  const createInviteLink = useCallback(async (
    groupId: string, 
    maxUses: number = 0, 
    expiresInDays: number = 7
  ): Promise<InviteLink> => {
    if (!user) throw new Error('User must be authenticated');

    const response = await financeClient.createInviteLink({
      groupId,
      createdBy: user.uid,
      defaultRole: GroupRole.MEMBER,
      maxUses,
      expiresInDays,
    });

    if (response.inviteLink) {
      return mapProtoInviteLinkToLocal(response.inviteLink);
    }
    throw new Error('Failed to create invite link');
  }, [user]);

  const getInviteLinkByCode = useCallback(async (code: string): Promise<{ link: InviteLink; group: FinanceGroup } | null> => {
    try {
      const response = await financeClient.getInviteLinkByCode({ code });
      if (response.inviteLink && response.group) {
        return {
          link: mapProtoInviteLinkToLocal(response.inviteLink),
          group: mapProtoGroupToLocal(response.group),
        };
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const joinGroupByCode = useCallback(async (code: string): Promise<FinanceGroup> => {
    if (!user) throw new Error('User must be authenticated');

    const response = await financeClient.joinGroupByLink({
      code,
      userId: user.uid,
      userEmail: user.email || '',
      displayName: user.displayName || user.email || '',
    });

    if (response.group) {
      const joinedGroup = mapProtoGroupToLocal(response.group);
      onGroupJoined?.(joinedGroup);
      return joinedGroup;
    }
    throw new Error('Failed to join group');
  }, [user, onGroupJoined]);

  const listInviteLinks = useCallback(async (groupId: string): Promise<InviteLink[]> => {
    const response = await financeClient.listInviteLinks({
      groupId,
      includeInactive: false,
      pageSize: 100,
    });
    return response.inviteLinks.map(mapProtoInviteLinkToLocal);
  }, []);

  const deactivateInviteLink = useCallback(async (linkId: string): Promise<void> => {
    await financeClient.deactivateInviteLink({ linkId });
  }, []);

  return {
    createInviteLink,
    getInviteLinkByCode,
    joinGroupByCode,
    listInviteLinks,
    deactivateInviteLink,
  };
}
