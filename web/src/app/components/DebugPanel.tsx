'use client';

/**
 * DebugPanel - Development-only debug tools
 * 
 * Provides user impersonation and group member management for testing shared expenses.
 * Only visible when NEXT_PUBLIC_DEV_MODE=true
 */

import { useState } from 'react';
import { useAuth } from '../context/AuthWithAdminContext';
import { useMultiUserFinance } from '../context/MultiUserFinanceContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Bug, ChevronDown, UserPlus, Users, Copy, Check } from 'lucide-react';

// Predefined test users for easy switching
const TEST_USERS = [
  { id: 'demo-roommate-user', name: 'Demo Roommate', email: 'roommate@demo.local' },
  { id: 'demo-partner-user', name: 'Demo Partner', email: 'partner@demo.local' },
  { id: 'demo-friend-user', name: 'Demo Friend', email: 'friend@demo.local' },
];

interface DebugPanelProps {
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
}

export default function DebugPanel({ position = 'bottom-right' }: DebugPanelProps) {
  const { user } = useAuth();
  const { groups, activeGroup, refreshGroups } = useMultiUserFinance();
  const [isOpen, setIsOpen] = useState(false);
  const [impersonatedUserId, setImpersonatedUserId] = useState<string | null>(null);
  const [customUserId, setCustomUserId] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [newMemberId, setNewMemberId] = useState('');
  const [copied, setCopied] = useState(false);

  // Only show in dev mode
  if (process.env.NEXT_PUBLIC_DEV_MODE !== 'true') {
    return null;
  }

  const positionClasses = {
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
  };

  const currentUserId = impersonatedUserId || user?.uid || 'Not logged in';

  const handleCopyUserId = () => {
    navigator.clipboard.writeText(currentUserId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImpersonateUser = (userId: string) => {
    setImpersonatedUserId(userId);
    // Store in localStorage for persistence
    localStorage.setItem('debug_impersonated_user', userId);
    // Trigger a page reload to apply the impersonation
    window.location.reload();
  };

  const handleClearImpersonation = () => {
    setImpersonatedUserId(null);
    localStorage.removeItem('debug_impersonated_user');
    window.location.reload();
  };

  const handleAddMemberToGroup = async () => {
    if (!activeGroup || !newMemberId.trim()) return;
    
    setAddingMember(true);
    try {
      // Call backend directly with SKIP_AUTH mode
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8111'}/pfinance.v1.FinanceService/AddUserToGroup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: activeGroup.id,
          userId: newMemberId.trim(),
        }),
      });

      if (response.ok) {
        alert(`Added user ${newMemberId} to group ${activeGroup.name}`);
        setNewMemberId('');
        refreshGroups();
      } else {
        const error = await response.text();
        alert(`Failed to add member: ${error}`);
      }
    } catch (err) {
      console.error('Failed to add member:', err);
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setAddingMember(false);
    }
  };

  return (
    <div className={`fixed ${positionClasses[position]} z-50`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="bg-yellow-100 border-yellow-400 hover:bg-yellow-200 text-yellow-800"
          >
            <Bug className="w-4 h-4 mr-2" />
            Debug
            <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <Card className="mt-2 w-80 shadow-lg border-yellow-400">
            <CardHeader className="py-3 bg-yellow-50">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bug className="w-4 h-4" />
                Debug Panel
                <Badge variant="outline" className="ml-auto text-xs">DEV</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {/* Current User Info */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Current User ID</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted p-2 rounded truncate">
                    {currentUserId}
                  </code>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopyUserId}>
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                {impersonatedUserId && (
                  <Badge variant="destructive" className="text-xs">
                    Impersonating
                  </Badge>
                )}
              </div>

              {/* User Impersonation */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="w-3 h-3" />
                  Impersonate User
                </Label>
                <Select onValueChange={handleImpersonateUser}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select test user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TEST_USERS.map((testUser) => (
                      <SelectItem key={testUser.id} value={testUser.id} className="text-xs">
                        {testUser.name} ({testUser.id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <div className="flex gap-2">
                  <Input
                    placeholder="Custom user ID..."
                    value={customUserId}
                    onChange={(e) => setCustomUserId(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => handleImpersonateUser(customUserId)}
                    disabled={!customUserId.trim()}
                  >
                    Go
                  </Button>
                </div>

                {impersonatedUserId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full h-8 text-xs"
                    onClick={handleClearImpersonation}
                  >
                    Clear Impersonation
                  </Button>
                )}
              </div>

              {/* Add Member to Group */}
              {activeGroup && (
                <div className="space-y-2 border-t pt-4">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                    <UserPlus className="w-3 h-3" />
                    Add Member to &quot;{activeGroup.name}&quot;
                  </Label>
                  <div className="flex gap-2">
                    <Select onValueChange={setNewMemberId}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select user..." />
                      </SelectTrigger>
                      <SelectContent>
                        {TEST_USERS.map((testUser) => (
                          <SelectItem key={testUser.id} value={testUser.id} className="text-xs">
                            {testUser.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-8"
                      onClick={handleAddMemberToGroup}
                      disabled={addingMember || !newMemberId}
                    >
                      {addingMember ? '...' : 'Add'}
                    </Button>
                  </div>
                  <Input
                    placeholder="Or enter custom user ID..."
                    value={newMemberId}
                    onChange={(e) => setNewMemberId(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              )}

              {/* Groups Info */}
              <div className="space-y-2 border-t pt-4">
                <Label className="text-xs font-medium text-muted-foreground">Groups ({groups.length})</Label>
                {groups.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No groups loaded</p>
                ) : (
                  <div className="space-y-1">
                    {groups.map((group) => (
                      <div
                        key={group.id}
                        className={`text-xs p-2 rounded ${
                          activeGroup?.id === group.id ? 'bg-primary/10 border' : 'bg-muted'
                        }`}
                      >
                        <div className="font-medium">{group.name}</div>
                        <div className="text-muted-foreground truncate">{group.id}</div>
                        <div className="text-muted-foreground">{group.members.length} members</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
