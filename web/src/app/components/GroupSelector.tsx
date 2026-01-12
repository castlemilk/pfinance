'use client';

import { useState } from 'react';
import { useMultiUserFinance } from '../context/MultiUserFinanceContext';
import { useAuth } from '../context/AuthWithAdminContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Users, Settings } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';

export default function GroupSelector() {
  const { user } = useAuth();
  const { groups, activeGroup, setActiveGroup, createGroup } = useMultiUserFinance();
  const { toast } = useToast();
  const router = useRouter();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const handleGroupChange = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (group) {
      setActiveGroup(group);
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
      
      // Select the new group
      const newGroup = groups.find(g => g.id === groupId);
      if (newGroup) {
        setActiveGroup(newGroup);
      }
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
    router.push('/shared/groups');
  };

  if (!user) {
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-2 p-4 border-b">
        <Users className="w-5 h-5 text-muted-foreground" />
        <Select value={activeGroup?.id || ''} onValueChange={handleGroupChange}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Select a finance group" />
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
            <div className="border-t mt-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={(e) => {
                  e.preventDefault();
                  setShowCreateDialog(true);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create new group
              </Button>
            </div>
          </SelectContent>
        </Select>
        
        {activeGroup && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleManageGroups}
            title="Manage group settings"
          >
            <Settings className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Create Group Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
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
    </>
  );
}