/**
 * MultiUser Finance Module - Proto Mappers
 * 
 * Utilities for mapping between protobuf types and local types.
 */

import {
  FinanceGroup as ProtoFinanceGroup,
  GroupRole,
  GroupInviteLink,
  IncomeFrequency as ProtoIncomeFrequency,
} from '@/gen/pfinance/v1/types_pb';
import { FinanceGroup, GroupMember, InviteLink, GroupIncome } from './types';

// ============================================================================
// Role Mappings
// ============================================================================

export const protoRoleToLocal: Record<GroupRole, GroupMember['role']> = {
  [GroupRole.UNSPECIFIED]: 'member',
  [GroupRole.VIEWER]: 'viewer',
  [GroupRole.MEMBER]: 'member',
  [GroupRole.ADMIN]: 'admin',
  [GroupRole.OWNER]: 'owner',
};

export const localRoleToProto: Record<GroupMember['role'], GroupRole> = {
  'viewer': GroupRole.VIEWER,
  'member': GroupRole.MEMBER,
  'admin': GroupRole.ADMIN,
  'owner': GroupRole.OWNER,
};

// ============================================================================
// Income Frequency Mappings
// ============================================================================

export const incomeFrequencyToProto: Record<GroupIncome['frequency'], ProtoIncomeFrequency> = {
  'weekly': ProtoIncomeFrequency.WEEKLY,
  'fortnightly': ProtoIncomeFrequency.FORTNIGHTLY,
  'monthly': ProtoIncomeFrequency.MONTHLY,
  'annually': ProtoIncomeFrequency.ANNUALLY,
};

export const protoToIncomeFrequency: Record<ProtoIncomeFrequency, GroupIncome['frequency']> = {
  [ProtoIncomeFrequency.UNSPECIFIED]: 'monthly',
  [ProtoIncomeFrequency.WEEKLY]: 'weekly',
  [ProtoIncomeFrequency.FORTNIGHTLY]: 'fortnightly',
  [ProtoIncomeFrequency.MONTHLY]: 'monthly',
  [ProtoIncomeFrequency.ANNUALLY]: 'annually',
};

// ============================================================================
// Entity Mappers
// ============================================================================

export function mapProtoGroupToLocal(proto: ProtoFinanceGroup): FinanceGroup {
  return {
    id: proto.id,
    name: proto.name,
    description: proto.description,
    ownerId: proto.ownerId,
    memberIds: proto.memberIds,
    members: proto.members.map(m => ({
      userId: m.userId,
      email: m.email,
      displayName: m.displayName,
      role: protoRoleToLocal[m.role],
      joinedAt: m.joinedAt?.toDate() ?? new Date(),
    })),
    createdAt: proto.createdAt?.toDate() ?? new Date(),
    updatedAt: proto.updatedAt?.toDate() ?? new Date(),
  };
}

export function mapProtoInviteLinkToLocal(proto: GroupInviteLink): InviteLink {
  return {
    id: proto.id,
    groupId: proto.groupId,
    code: proto.code,
    createdBy: proto.createdBy,
    defaultRole: protoRoleToLocal[proto.defaultRole] as 'member' | 'admin' | 'viewer',
    maxUses: proto.maxUses,
    currentUses: proto.currentUses,
    expiresAt: proto.expiresAt?.toDate(),
    isActive: proto.isActive,
    createdAt: proto.createdAt?.toDate() ?? new Date(),
  };
}
