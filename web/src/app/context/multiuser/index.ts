/**
 * MultiUser Finance Module
 * 
 * Barrel exports for clean imports.
 * 
 * Usage:
 *   import { useMultiUserFinance, FinanceGroup, GroupMember } from '@/app/context/multiuser';
 */

// Context and provider
export { 
  MultiUserFinanceProvider, 
  useMultiUserFinance 
} from './Provider';

// Types
export type { 
  FinanceGroup, 
  GroupMember, 
  GroupIncome, 
  InviteLink,
  GroupRole,
  InviteLinkRole,
} from './types';

// Individual hooks for advanced use cases
export {
  useGroups,
  useGroupExpenses,
  useGroupIncomes,
  useInviteLinks,
  useGroupMembers,
  useGroupAnalytics,
} from './hooks';

// Mappers for external use
export {
  mapProtoGroupToLocal,
  mapProtoInviteLinkToLocal,
  protoRoleToLocal,
  localRoleToProto,
} from './mappers';
