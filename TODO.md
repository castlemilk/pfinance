# PFinance TODO - Code Review Action Items

Generated: 2026-02-01

## Priority Legend
- **P0 (CRITICAL)**: Security vulnerabilities, must fix before production
- **P1 (HIGH)**: Important issues affecting functionality or maintainability
- **P2 (MEDIUM)**: Improvements that reduce tech debt
- **P3 (LOW)**: Nice-to-have enhancements

---

## P0: CRITICAL SECURITY FIXES

### Backend Authorization (COMPLETED ✅)

- [x] **Add user ownership validation to ALL RPC methods**
  - File: `backend/internal/service/finance_service.go`
  - ✅ FIXED: All 40+ RPC methods now verify `req.Msg.UserId == claims.UID` using `auth.RequireAuth()` and `auth.RequireUserAccess()`

- [x] **Add group membership validation to ALL group operations**
  - File: `backend/internal/service/finance_service.go`
  - ✅ FIXED: All group operations now call `auth.IsGroupMember()` before allowing access
  - ✅ Admin operations check `auth.IsGroupAdminOrOwner()`

- [x] **Fix GetUser/UpdateUser to prevent unauthorized access**
  - File: `backend/internal/service/finance_service.go`
  - ✅ FIXED: Users can only access their own profile

- [x] **Add permission checks to invitation operations**
  - ✅ FIXED: InviteToGroup verifies admin/owner role
  - ✅ FIXED: AcceptInvitation verifies email matches
  - ✅ FIXED: DeclineInvitation verifies email matches
  - ✅ FIXED: CreateInviteLink/DeactivateInviteLink verify admin/owner
  - ✅ FIXED: JoinGroupByLink verifies authenticated claims

- [x] **Create helper functions for authorization**
  - File: `backend/internal/auth/helpers.go` (NEW)
  - ✅ Created: `RequireAuth()`, `RequireUserAccess()`, `IsGroupMember()`, `GetUserRoleInGroup()`, `IsGroupAdminOrOwner()`, `CanModifyGroupMember()`, `CanInviteToGroup()`
  - ✅ Tests: `backend/internal/auth/helpers_test.go` (all pass)

- [ ] **Add production guards to dev auth bypass**
  - File: `backend/cmd/server/main.go:33-34,60-63`
  - Issue: `SKIP_AUTH=true` could be accidentally set in production
  - Fix: Add explicit environment check preventing auth bypass outside development

### Frontend Security (COMPLETED ✅)

- [x] **Add production guards to admin impersonation mode**
  - File: `web/src/app/context/AdminContext.tsx`
  - ✅ FIXED: Added `process.env.NODE_ENV === 'development'` checks to:
    - Keyboard shortcut handler (Ctrl+Shift+A)
    - LocalStorage loading of impersonated user
    - `switchToUser` function
    - Context value returns (isAdminMode, impersonatedUser, availableTestUsers)

---

## P1: HIGH PRIORITY ISSUES

### Backend API Completeness (PARTIALLY COMPLETED)

- [x] **Add missing GetExpense RPC**
  - Files: `proto/pfinance/v1/finance_service.proto`, `backend/internal/service/finance_service.go`
  - ✅ FIXED: Added `GetExpense` RPC with proper authorization (user ownership or group membership)

- [x] **Add missing GetIncome RPC**
  - ✅ FIXED: Added `GetIncome` RPC with proper authorization (user ownership or group membership)

- [ ] **Implement pagination in List methods**
  - Issue: `page_token` defined in proto but not implemented (4 TODOs in service)
  - Affected: ListExpenses (L96), ListGroups (L346), ListInvitations (L369), ListBudgets (L655)

- [ ] **Replace `double` with proper money type**
  - Files: `proto/pfinance/v1/types.proto` (18 fields)
  - Issue: Binary floating-point inappropriate for financial calculations
  - Options: `google.type.Money`, `int64 amount_cents`, or custom `Decimal` type

### Frontend Auth Fixes (PARTIALLY COMPLETED)

- [x] **Implement token refresh logic**
  - File: `web/src/lib/financeService.ts`
  - ✅ FIXED: Added automatic token refresh with retry on auth errors
    - `getAuthToken(forceRefresh)` accepts optional force refresh parameter
    - Interceptor catches `unauthenticated` errors and retries with refreshed token

- [ ] **Fix auth initialization race condition**
  - File: `web/src/app/context/AuthWithAdminContext.tsx:82-96`
  - Issue: 5-second timeout might fire before auth listener is registered
  - Fix: Move timeout inside `.then()` block

- [ ] **Add Firebase initialization error boundary**
  - File: `web/src/lib/firebase.ts:31-47`
  - Issue: Silent failure when Firebase config missing, app continues with broken auth
  - Fix: Show prominent error banner when Firebase fails to initialize

- [ ] **Standardize route protection**
  - Issue: Shared routes check auth, personal routes don't
  - Fix: Add consistent auth guards or make distinction explicit in UI

---

## P2: MEDIUM PRIORITY - CODE QUALITY

### Backend Refactoring

- [ ] **Extract pagination helper function**
  - File: `backend/internal/service/finance_service.go`
  - Pattern appears 9 times: `if pageSize <= 0 { pageSize = 100 }`
  - Saves ~27 lines

- [ ] **Extract date range conversion helper**
  - Pattern appears twice in ListExpenses and ListIncomes
  - Saves ~16 lines

- [ ] **Abstract collection name determination**
  - File: `backend/internal/store/firestore.go`
  - Pattern appears 9 times: `if groupId != "" { collection = "groupExpenses" }`
  - Create `GetCollection(baseType string, hasGroupID bool) string` helper

- [ ] **Create query builder for Firestore**
  - File: `backend/internal/store/firestore.go`
  - Similar query building in 8 List methods
  - Saves ~200 lines

- [ ] **Create generic filtering for MemoryStore**
  - File: `backend/internal/store/memory.go`
  - Similar filter logic in ListExpenses, ListIncomes, ListBudgets
  - Saves ~90 lines

- [ ] **Improve error code usage**
  - File: `backend/internal/service/finance_service.go`
  - Only 2 connect error codes used (Unauthenticated, PermissionDenied)
  - Add: CodeNotFound, CodeInvalidArgument, CodeAlreadyExists, CodeFailedPrecondition

- [ ] **Extract business logic from store layer**
  - `GetBudgetProgress` (94 lines) and `calculateBudgetPeriod` (54 lines) should be in domain layer
  - `GetMemberBalances` calculation (75 lines) should be in domain layer

### Frontend Refactoring

- [ ] **Create generic CRUD hook**
  - Files: `useExpenses.ts` (245 lines), `useIncomes.ts` (197 lines)
  - 85% identical code between expense and income hooks
  - Potential savings: ~350 lines

- [ ] **Create generic form component**
  - Files: `ExpenseForm.tsx`, `IncomeForm.tsx`
  - 80%+ shared structure
  - Potential savings: ~200 lines

- [ ] **Create generic table component**
  - Files: `ExpenseList.tsx`, `IncomeList.tsx`
  - Same table structure, edit/delete dialogs
  - Potential savings: ~300 lines

- [ ] **Consolidate type definitions**
  - Issue: Local types in `types/index.ts` duplicate proto types
  - Fix: Use proto types directly from `@/gen/pfinance/v1/`
  - Removes ~50 lines of types + ~100 lines of mapping objects

- [x] **Remove duplicate "Enhanced" components**
  - ✅ FIXED: Deleted `GroupSelector.tsx` (keeping `EnhancedGroupSelector.tsx`)
  - ✅ FIXED: Deleted `EnhancedReportGenerator.tsx` (keeping `ReportGenerator.tsx`)
  - `TransactionImport.tsx` vs `EnhancedTransactionImport.tsx` - still to review

- [ ] **Fix context provider memory leaks**
  - File: `web/src/app/context/FinanceContext.tsx:393-423`
  - `loadData` in dependency array is recreated on every render
  - Potential for excessive re-renders

---

## P3: LOW PRIORITY - ENHANCEMENTS

### API Enhancements

- [ ] Add batch update/delete operations
- [ ] Add search/filter RPCs with full-text search
- [ ] Add aggregate/statistics RPCs (GetUserSummary, GetSpendingTrends)
- [ ] Add soft delete support with restore capability
- [ ] Add audit metadata (created_by, updated_by, version)
- [ ] Add protoc-gen-validate rules to proto definitions
- [ ] Create typed response messages for delete operations

### Frontend Enhancements

- [ ] Add global error boundary for auth failures
- [ ] Improve offline support with sync queue
- [ ] Add optimistic updates for better UX
- [ ] Standardize error handling with typed ConnectErrors

### Documentation

- [ ] Document invitation vs invite link use cases
- [ ] Document split type allocation rules
- [ ] Add API versioning strategy

---

## Metrics Summary

| Category | Issues Found | Lines to Reduce |
|----------|--------------|-----------------|
| Security (P0) | 15+ critical | - |
| API Gaps (P1) | 6 | - |
| Backend Duplication | 12 patterns | ~500 lines |
| Frontend Duplication | 8 patterns | ~1200 lines |
| **Total Potential Reduction** | - | **~2000 lines** |

---

## Quick Wins (< 30 min each)

1. Add pagination helper function (5 min)
2. Add date range converter (5 min)
3. Add production guard to admin mode (10 min)
4. Remove duplicate Enhanced* components (10 min)
5. Add collection name helper (15 min)

## Verification Commands

```bash
# Run backend tests after auth fixes
cd backend && go test ./internal/service -v

# Check for unauthorized access patterns
grep -rn "req.Msg.UserId" backend/internal/service/

# Find duplicate patterns
grep -rn "pageSize <= 0" backend/
grep -rn "collection := " backend/internal/store/firestore.go

# Frontend type duplicates
grep -rn "ExpenseCategory" web/src/app/types/
```
