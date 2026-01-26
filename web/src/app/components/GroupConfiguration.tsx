'use client';

import { useState } from 'react';
import { useMultiUserFinance } from '../context/MultiUserFinanceContext';
import { useAuth } from '../context/AuthWithAdminContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription as DDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import { 
  Crown, 
  Shield, 
  User,
  UserPlus,
  LogOut,
  AlertCircle
} from 'lucide-react';

export default function GroupConfiguration() {
  const { user } = useAuth();
  const { 
    groups, 
    activeGroup, 
    inviteUserToGroup,
    leaveGroup,
    getUserOwedAmount,
    getUserOwesAmount,
  } = useMultiUserFinance();
  
  const { toast } = useToast();
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const handleInviteUser = async () => {
    if (!activeGroup || !inviteEmail.trim()) return;

    setInviting(true);
    try {
      await inviteUserToGroup(activeGroup.id, inviteEmail.trim());
      toast({
        title: "Invitation sent",
        description: `Invited ${inviteEmail} to ${activeGroup.name}`,
      });
      setShowInviteDialog(false);
      setInviteEmail('');
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to send invitation",
        description: error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setInviting(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!activeGroup) return;

    try {
      await leaveGroup(activeGroup.id);
      toast({
        title: "Left group",
        description: `You have left ${activeGroup.name}`,
      });
      setShowLeaveDialog(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to leave group",
        description: error instanceof Error ? error.message : "Please try again",
      });
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

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return (
          <div title="Owner">
            <Crown className="w-4 h-4 text-yellow-600" />
          </div>
        );
      case 'admin':
        return (
          <div title="Admin">
            <Shield className="w-4 h-4 text-blue-600" />
          </div>
        );
      default:
        return (
          <div title="Member">
            <User className="w-4 h-4 text-gray-600" />
          </div>
        );
    }
  };

  if (!user || !activeGroup) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No group selected. Please select a group from the dropdown above.
        </AlertDescription>
      </Alert>
    );
  }

  const isOwner = activeGroup.members.find(m => m.userId === user.uid)?.role === 'owner';
  const isAdmin = activeGroup.members.find(m => m.userId === user.uid)?.role === 'admin';
  const canInvite = isOwner || isAdmin;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Group Configuration</h1>
        <p className="text-muted-foreground">
          Manage members and settings for {activeGroup.name}
        </p>
      </div>

      {/* Group Details */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{activeGroup.name}</CardTitle>
              <CardDescription>
                {activeGroup.description || 'No description provided'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {canInvite && (
                <Button onClick={() => setShowInviteDialog(true)}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Invite Members
                </Button>
              )}
              <Button 
                variant="outline"
                onClick={() => setShowLeaveDialog(true)}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Leave Group
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Financial Summary */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-600">
                  ${getUserOwedAmount(activeGroup.id, user.uid).toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground">You are owed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-red-600">
                  ${getUserOwesAmount(activeGroup.id, user.uid).toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground">You owe</p>
              </CardContent>
            </Card>
          </div>

          {/* Members List */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Members ({activeGroup.members.length})</h3>
            <div className="space-y-2">
              {activeGroup.members.map((member) => (
                <div 
                  key={member.userId} 
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>
                        {getInitials(member.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{member.displayName}</p>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getRoleIcon(member.role)}
                    <Badge variant={member.userId === user.uid ? "default" : "secondary"}>
                      {member.role}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Group Settings */}
          {isOwner && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Group Settings</h3>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">
                    Advanced group settings coming soon...
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Groups List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Finance Groups</CardTitle>
          <CardDescription>
            All groups you&apos;re a member of
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {groups.map((group) => (
              <div 
                key={group.id} 
                className={`p-3 border rounded-lg ${
                  group.id === activeGroup.id ? 'border-primary bg-accent' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{group.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {group.members.length} members
                    </p>
                  </div>
                  {group.id === activeGroup.id && (
                    <Badge>Active</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Members</DialogTitle>
            <DDescription>
              Send an invitation to join {activeGroup.name}
            </DDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="user@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={inviting}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowInviteDialog(false)}
              disabled={inviting}
            >
              Cancel
            </Button>
            <Button onClick={handleInviteUser} disabled={inviting || !inviteEmail.trim()}>
              {inviting ? 'Sending...' : 'Send Invitation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave Group Dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave Group</DialogTitle>
            <DDescription>
              Are you sure you want to leave {activeGroup.name}?
            </DDescription>
          </DialogHeader>
          
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This action cannot be undone. You&apos;ll need a new invitation to rejoin.
            </AlertDescription>
          </Alert>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowLeaveDialog(false)}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleLeaveGroup}
            >
              Leave Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}