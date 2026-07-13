'use client';

import { AnalyticsWorkspace } from '@/app/components/analytics/AnalyticsWorkspace';
import { useMultiUserFinance } from '@/app/context/MultiUserFinanceContext';

export default function SharedAnalyticsPage() {
  const { activeGroup } = useMultiUserFinance();

  if (!activeGroup) {
    return (
      <section
        aria-labelledby="shared-analytics-empty-heading"
        className="rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <h2
          id="shared-analytics-empty-heading"
          className="text-balance text-xl font-semibold text-foreground"
        >
          Choose a group to view analytics
        </h2>
        <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
          Use the group selector above to choose or create a shared finance
          group. Its income, spending, and attention signals will stay isolated
          from your personal finances.
        </p>
      </section>
    );
  }

  return (
    <AnalyticsWorkspace
      scope={{
        kind: 'group',
        groupId: activeGroup.id,
        groupName: activeGroup.name.trim() || 'Group',
        members: activeGroup.members.map((member) => ({
          userId: member.userId,
          displayName: member.displayName,
          email: member.email,
        })),
      }}
    />
  );
}
