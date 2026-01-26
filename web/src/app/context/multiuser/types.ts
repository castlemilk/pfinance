/**
 * MultiUser Finance Module - Types
 * 
 * Local types for UI convenience, mapped from protobuf types.
 */

export interface FinanceGroup {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  members: GroupMember[];
  memberIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupMember {
  userId: string;
  email: string;
  displayName: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: Date;
}

export interface GroupIncome {
  id: string;
  groupId: string;
  userId: string;
  source: string;
  amount: number;
  frequency: 'weekly' | 'fortnightly' | 'monthly' | 'annually';
  date: Date;
}

export interface InviteLink {
  id: string;
  groupId: string;
  code: string;
  createdBy: string;
  defaultRole: 'member' | 'admin' | 'viewer';
  maxUses: number;
  currentUses: number;
  expiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
}

export type GroupRole = GroupMember['role'];
export type InviteLinkRole = InviteLink['defaultRole'];
