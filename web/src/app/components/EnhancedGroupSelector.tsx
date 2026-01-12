'use client';

import { useState } from 'react';
import { useMultiUserFinance } from '../context/MultiUserFinanceContext';
import { useAuth } from '../context/AuthWithAdminContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Plus, 
  Users, 
  Settings, 
  ChevronDown, 
  UserPlus,
  DollarSign,
  Calendar,
  Check
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';

export default function EnhancedGroupSelector() {
  const { user } = useAuth();
  const { groups, activeGroup, setActiveGroup, createGroup } = useMultiUserFinance();
  const { toast } = useToast();
  const router = useRouter();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showManageDialog, setShowManageDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const handleGroupChange = (group: typeof activeGroup) => {
    if (group && group.id !== activeGroup?.id) {
      setActiveGroup(group);
      toast({
        title: "Group switched",
        description: `Now viewing ${group.name}`,
      });
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      toast({
        variant: "destructive",
        title: "Group name required",
        description: "Please enter a name for the group",
      });
      return;
    }

    setCreating(true);
    try {
      const groupId = await createGroup(newGroupName, newGroupDescription);
      toast({
        title: "Group created",
        description: `Successfully created group: ${newGroupName}`,
      });
      
      // Close dialog and reset form
      setShowCreateDialog(false);
      setNewGroupName('');
      setNewGroupDescription('');
      
      // The context will automatically update with the new group
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to create group",
        description: error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleManageGroups = () => {
    setShowManageDialog(false);
    router.push('/shared/groups');
  };

  const getGroupInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (!user) {
    return null;
  }

  return (
    <>
      <div className="w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 border-b">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">Shared Finance</h2>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="min-w-[200px] justify-between">
                  {activeGroup ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {getGroupInitials(activeGroup.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{activeGroup.name}</span>
                    </div>
                  ) : (
                    <span>Select a group</span>
                  )}
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[300px]">
                <DropdownMenuLabel>Your Finance Groups</DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                {groups.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No groups yet. Create one to get started!
                  </div>
                ) : (
                  groups.map((group) => (
                    <DropdownMenuItem
                      key={group.id}
                      onClick={() => handleGroupChange(group)}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {getGroupInitials(group.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="font-medium">{group.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {group.members.length} member{group.members.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                        {activeGroup?.id === group.id && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))
                )}
                
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowCreateDialog(true)}
                  className="cursor-pointer"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create new group
                </DropdownMenuItem>
                {activeGroup && (
                  <DropdownMenuItem
                    onClick={() => setShowManageDialog(true)}
                    className="cursor-pointer"
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Manage current group
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {activeGroup && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <Users className="h-3 w-3" />
                {activeGroup.members.length}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/shared/groups')}
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Create Group Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create Finance Group</DialogTitle>
            <DialogDescription>
              Create a new group to track shared expenses with friends, family, or roommates.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                placeholder="e.g., Household Expenses, Trip to Japan"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                disabled={creating}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="group-description">Description (Optional)</Label>
              <Textarea
                id="group-description"
                placeholder="What is this group for?"
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                disabled={creating}
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateGroup} disabled={creating}>
              {creating ? 'Creating...' : 'Create Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Manage Dialog */}
      <Dialog open={showManageDialog} onOpenChange={setShowManageDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{activeGroup?.name}</DialogTitle>
            <DialogDescription>
              Quick overview and actions for this group
            </DialogDescription>
          </DialogHeader>
          
          {activeGroup && (
            <div className="space-y-4 py-4">
              {/* Members */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-medium">Members</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowManageDialog(false);
                        router.push('/shared/groups');
                      }}
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Invite
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {activeGroup.members.map((member) => (
                      <div key={member.userId} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {member.displayName.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{member.displayName}</p>
                            <p className="text-xs text-muted-foreground">{member.email}</p>
                          </div>
                        </div>
                        {member.role === 'owner' && (
                          <Badge variant="secondary" className="text-xs">Owner</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card>
                <CardContent className="pt-6">
                  <h4 className="text-sm font-medium mb-4">Quick Stats</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Created</p>
                      <p className="text-sm font-medium">
                        <Calendar className="inline h-3 w-3 mr-1" />
                        {activeGroup.createdAt ? new Date(activeGroup.createdAt as any).toLocaleDateString() : 'Unknown'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Currency</p>
                      <p className="text-sm font-medium">
                        <DollarSign className="inline h-3 w-3 mr-1" />
                        USD
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowManageDialog(false)}
            >
              Close
            </Button>
            <Button onClick={handleManageGroups}>
              Full Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}