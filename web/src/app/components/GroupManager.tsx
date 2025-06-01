'use client';

import { useState } from 'react';
import { useMultiUserFinance } from '../context/MultiUserFinanceContext';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Plus, 
  Users, 
  Settings, 
  UserPlus, 
  Crown, 
  Shield, 
  User,
  ExternalLink 
} from 'lucide-react';
import { FinanceGroup } from '../context/MultiUserFinanceContext';

export default function GroupManager() {
  const { user } = useAuth();
  const { 
    groups, 
    activeGroup, 
    setActiveGroup, 
    createGroup, 
    inviteUserToGroup,
    leaveGroup,
    getUserOwedAmount,
    getUserOwesAmount,
    loading 
  } = useMultiUserFinance();

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showInviteUser, setShowInviteUser] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: ''
  });
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'member' as 'admin' | 'member'
  });

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createGroup(createForm.name, createForm.description);
      setCreateForm({ name: '', description: '' });
      setShowCreateGroup(false);
    } catch (error) {
      console.error('Failed to create group:', error);
    }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroup) return;
    
    try {
      await inviteUserToGroup(activeGroup.id, inviteForm.email, inviteForm.role);
      setInviteForm({ email: '', role: 'member' });
      setShowInviteUser(false);
    } catch (error) {
      console.error('Failed to invite user:', error);
    }
  };

  const handleLeaveGroup = async (groupId: string) => {
    try {
      await leaveGroup(groupId);
      if (activeGroup?.id === groupId) {
        setActiveGroup(null);
      }
    } catch (error) {
      console.error('Failed to leave group:', error);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="w-4 h-4 text-yellow-500" />;
      case 'admin': return <Shield className="w-4 h-4 text-blue-500" />;
      default: return <User className="w-4 h-4 text-gray-500" />;
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return <div className="text-center p-4">Loading groups...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Active Group Header */}
      {activeGroup && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  {activeGroup.name}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {activeGroup.description}
                </p>
              </div>
              <div className="flex gap-2">
                <Dialog open={showInviteUser} onOpenChange={setShowInviteUser}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <UserPlus className="w-4 h-4 mr-2" />
                      Invite
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Invite User to {activeGroup.name}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleInviteUser} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="invite-email">Email Address</Label>
                        <Input
                          id="invite-email"
                          type="email"
                          value={inviteForm.email}
                          onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                          placeholder="user@example.com"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="invite-role">Role</Label>
                        <Select
                          value={inviteForm.role}
                          onValueChange={(value) => setInviteForm({ ...inviteForm, role: value as 'admin' | 'member' })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="submit" className="w-full">
                        Send Invitation
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Group Members */}
              <div>
                <h4 className="text-sm font-medium mb-2">Members ({activeGroup.members.length})</h4>
                <div className="flex flex-wrap gap-2">
                  {activeGroup.members.map((member) => (
                    <div key={member.userId} className="flex items-center gap-2 p-2 border rounded-lg">
                      <Avatar className="w-6 h-6">
                        <AvatarFallback className="text-xs">
                          {getInitials(member.displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{member.displayName}</span>
                      {getRoleIcon(member.role)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Summary */}
              {user && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 border rounded-lg">
                    <p className="text-sm text-muted-foreground">You are owed</p>
                    <p className="text-lg font-semibold text-green-600">
                      ${getUserOwedAmount(activeGroup.id, user.uid).toFixed(2)}
                    </p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <p className="text-sm text-muted-foreground">You owe</p>
                    <p className="text-lg font-semibold text-red-600">
                      ${getUserOwesAmount(activeGroup.id, user.uid).toFixed(2)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Groups Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Create New Group Card */}
        <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
          <DialogTrigger asChild>
            <Card className="border-dashed border-2 hover:border-primary/50 transition-colors cursor-pointer">
              <CardContent className="flex flex-col items-center justify-center p-6 min-h-[200px]">
                <Plus className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground text-center">
                  Create New Group
                </p>
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Finance Group</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="group-name">Group Name</Label>
                <Input
                  id="group-name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="e.g., Roommates, Family Budget"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="group-description">Description (Optional)</Label>
                <Textarea
                  id="group-description"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="What is this group for?"
                  rows={3}
                />
              </div>
              <Button type="submit" className="w-full">
                Create Group
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Existing Groups */}
        {groups.map((group) => (
          <Card 
            key={group.id} 
            className={`cursor-pointer transition-all ${
              activeGroup?.id === group.id ? 'ring-2 ring-primary' : 'hover:shadow-md'
            }`}
            onClick={() => setActiveGroup(group)}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-base">{group.name}</CardTitle>
                  {group.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {group.description}
                    </p>
                  )}
                </div>
                {activeGroup?.id === group.id && (
                  <Badge variant="default" className="ml-2">
                    Active
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Members</span>
                  <span className="font-medium">{group.members.length}</span>
                </div>
                
                <div className="flex items-center gap-1">
                  {group.members.slice(0, 3).map((member) => (
                    <Avatar key={member.userId} className="w-6 h-6">
                      <AvatarFallback className="text-xs">
                        {getInitials(member.displayName)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {group.members.length > 3 && (
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">
                      +{group.members.length - 3}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveGroup(group);
                    }}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Open
                  </Button>
                  {group.members.find(m => m.userId === user?.uid)?.role !== 'owner' && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLeaveGroup(group.id);
                      }}
                    >
                      Leave
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {groups.length === 0 && (
        <div className="text-center py-8">
          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">No Groups Yet</h3>
          <p className="text-muted-foreground mb-4">
            Create your first finance group to start collaborating on expenses.
          </p>
          <Button onClick={() => setShowCreateGroup(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create First Group
          </Button>
        </div>
      )}
    </div>
  );
}