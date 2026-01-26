'use client';

/**
 * MultiUserFinanceContext - Backward Compatibility Layer
 * 
 * This file re-exports from the new modular structure at ./multiuser/
 * for backward compatibility with existing imports.
 * 
 * New code should import directly from '@/app/context/multiuser'
 * 
 * @deprecated Import from './multiuser' instead
 */

// Re-export everything from the new modular structure
export {
  MultiUserFinanceProvider,
  useMultiUserFinance,
} from './multiuser';

export type {
  FinanceGroup,
  GroupMember,
  GroupIncome,
  InviteLink,
} from './multiuser';
