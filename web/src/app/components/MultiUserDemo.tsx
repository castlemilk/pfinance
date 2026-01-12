'use client';

import { useState, useEffect } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useAuth } from '../context/AuthWithAdminContext';
import { useMultiUserFinance } from '../context/MultiUserFinanceContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  UserPlus, 
  DollarSign, 
  ShoppingCart,
  Info
} from 'lucide-react';

export function MultiUserDemo() {
  const { isAdminMode, availableTestUsers } = useAdmin();
  const { user } = useAuth();
  const { groups, groupExpenses } = useMultiUserFinance();
  const [showInfo, setShowInfo] = useState(true);

  if (!isAdminMode) {
    return null;
  }

  return (
    <div className="space-y-6">
      {showInfo && (
        <Card className="bg-blue-500/10 border-blue-500/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-medium text-blue-700 dark:text-blue-300 mb-2">
                  Multi-User Testing Guide
                </h3>
                <ol className="text-sm text-blue-600 dark:text-blue-400 space-y-1 list-decimal list-inside">
                  <li>Switch between test users using the Admin Panel</li>
                  <li>Create a group as one user (e.g., Alice)</li>
                  <li>Switch to another user (e.g., Bob)</li>
                  <li>Check if Bob can see the group created by Alice</li>
                  <li>Add expenses as different users to test splitting</li>
                </ol>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowInfo(false)}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Current Test User
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user ? (
              <div className="space-y-2">
                <p className="font-medium">{user.displayName}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
                <Badge variant="secondary" className="mt-2">
                  ID: {user.uid}
                </Badge>
              </div>
            ) : (
              <p className="text-muted-foreground">No user selected</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Test Scenario
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm">Admin mode active</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-sm">Using test collections</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-sm">Data isolated from production</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Test Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground mb-4">
            Try these actions to test multi-user functionality:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button variant="outline" className="justify-start">
              <UserPlus className="w-4 h-4 mr-2" />
              Create a Test Group
            </Button>
            <Button variant="outline" className="justify-start">
              <DollarSign className="w-4 h-4 mr-2" />
              Add a Shared Expense
            </Button>
          </div>
        </CardContent>
      </Card>

      {groups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Test Groups</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {groups.map(group => (
                <div key={group.id} className="flex items-center justify-between p-2 border rounded">
                  <div>
                    <p className="font-medium">{group.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {group.members.length} members
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {groupExpenses.filter(e => e.groupId === group.id).length} expenses
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-dashed">
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground">
            💡 <strong>Tip:</strong> Open two browser windows side-by-side, 
            each with a different test user selected, to see real-time updates!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}