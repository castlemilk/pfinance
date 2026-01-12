'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { User, Users, Plus } from 'lucide-react';
import { useMultiUserFinance } from '../context/MultiUserFinanceContext';
import { useAuth } from '../context/AuthWithAdminContext';
import BudgetDashboard from './BudgetDashboard';
import ExpenseList from './ExpenseList';
import FinanceSummary from './FinanceSummary';
import GroupExpenseForm from './GroupExpenseForm';
import GroupExpenseList from './GroupExpenseList';

export default function FinanceView() {
  const { user } = useAuth();
  const { 
    groups, 
    activeGroup, 
    setActiveGroup, 
    getUserOwedAmount,
    getUserOwesAmount,
    loading: groupsLoading 
  } = useMultiUserFinance();
  
  const [activeTab, setActiveTab] = useState<'personal' | 'shared'>('personal');

  const handleGroupChange = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    setActiveGroup(group || null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Finance Dashboard</h1>
          <p className="text-muted-foreground">
            Manage your personal and shared finances
          </p>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'personal' | 'shared')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="personal" className="flex items-center space-x-2">
            <User className="h-4 w-4" />
            <span>Personal Finance</span>
          </TabsTrigger>
          <TabsTrigger value="shared" className="flex items-center space-x-2">
            <Users className="h-4 w-4" />
            <span>Shared Finance</span>
            {groups.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {groups.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Personal Finance Tab */}
        <TabsContent value="personal" className="space-y-6">
          <div className="grid gap-6">
            {/* Personal Finance Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <User className="h-5 w-5" />
                  <span>Personal Finance Overview</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FinanceSummary />
              </CardContent>
            </Card>

            {/* Personal Budgets */}
            <BudgetDashboard showGroupBudgets={false} />

            {/* Personal Expenses */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Personal Expenses</CardTitle>
              </CardHeader>
              <CardContent>
                <ExpenseList />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Shared Finance Tab */}
        <TabsContent value="shared" className="space-y-6">
          {groups.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Shared Finance Groups</h3>
                <p className="text-muted-foreground mb-4">
                  Create or join a finance group to start tracking shared expenses and budgets.
                </p>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Finance Group
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Group Selection */}
              <Card>
                <CardHeader>
                  <CardTitle>Shared Finance Groups</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-4">
                    <div className="flex-1">
                      <Select
                        value={activeGroup?.id || ''}
                        onValueChange={handleGroupChange}
                        disabled={groupsLoading}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a finance group" />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              <div className="flex items-center justify-between w-full">
                                <span>{group.name}</span>
                                <Badge variant="outline" className="ml-2">
                                  {group.members.length} member{group.members.length !== 1 ? 's' : ''}
                                </Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button variant="outline">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Group
                    </Button>
                  </div>
                  
                  {activeGroup && (
                    <div className="mt-4 p-4 bg-muted rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{activeGroup.name}</h4>
                          {activeGroup.description && (
                            <p className="text-sm text-muted-foreground">{activeGroup.description}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {activeGroup.members.length} Members
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Created {activeGroup.createdAt.toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Group Content */}
              {activeGroup ? (
                <div className="space-y-6">
                  {/* Group Finance Summary */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <Users className="h-5 w-5" />
                        <span>{activeGroup.name} Overview</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {user && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 border rounded-lg">
                            <p className="text-sm text-muted-foreground">You are owed</p>
                            <p className="text-2xl font-bold text-green-600">
                              ${getUserOwedAmount(activeGroup.id, user.uid).toFixed(2)}
                            </p>
                          </div>
                          <div className="p-4 border rounded-lg">
                            <p className="text-sm text-muted-foreground">You owe</p>
                            <p className="text-2xl font-bold text-red-600">
                              ${getUserOwesAmount(activeGroup.id, user.uid).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Group Budgets */}
                  <BudgetDashboard 
                    showGroupBudgets={true} 
                    financeGroupId={activeGroup.id}
                  />

                  {/* Group Expenses */}
                  <div className="grid gap-6 lg:grid-cols-2">
                    <GroupExpenseForm groupId={activeGroup.id} />
                    <GroupExpenseList groupId={activeGroup.id} />
                  </div>
                </div>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <Users className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Select a Finance Group</h3>
                    <p className="text-muted-foreground">
                      Choose a finance group above to view shared expenses and budgets.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}