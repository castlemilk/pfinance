'use client';

import { useState, useEffect } from 'react';
import { useMultiUserFinance, InviteLink } from '../context/MultiUserFinanceContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { 
  Link2, 
  Copy, 
  Check, 
  Trash2, 
  Plus,
  Clock,
  Users,
  Loader2
} from 'lucide-react';

interface InviteLinkGeneratorProps {
  groupId: string;
}

export default function InviteLinkGenerator({ groupId }: InviteLinkGeneratorProps) {
  const { createInviteLink, listInviteLinks, deactivateInviteLink } = useMultiUserFinance();
  const { toast } = useToast();
  
  const [inviteLinks, setInviteLinks] = useState<InviteLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  
  // Create options
  const [maxUses, setMaxUses] = useState<string>('0');
  const [expiresInDays, setExpiresInDays] = useState<string>('7');

  // Load existing invite links
  useEffect(() => {
    const loadLinks = async () => {
      try {
        const links = await listInviteLinks(groupId);
        setInviteLinks(links);
      } catch (err) {
        console.error('Failed to load invite links:', err);
      } finally {
        setLoading(false);
      }
    };
    loadLinks();
  }, [groupId, listInviteLinks]);

  const handleCreateLink = async () => {
    setCreating(true);
    try {
      const link = await createInviteLink(
        groupId, 
        parseInt(maxUses) || 0, 
        parseInt(expiresInDays) || 0
      );
      setInviteLinks(prev => [link, ...prev]);
      setShowCreateDialog(false);
      toast({
        title: 'Invite link created',
        description: 'Share the link with people you want to invite',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Failed to create invite link',
        description: err instanceof Error ? err.message : 'Please try again',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivateLink = async (linkId: string) => {
    try {
      await deactivateInviteLink(linkId);
      setInviteLinks(prev => prev.filter(l => l.id !== linkId));
      toast({
        title: 'Link deactivated',
        description: 'The invite link is no longer valid',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Failed to deactivate link',
        description: err instanceof Error ? err.message : 'Please try again',
      });
    }
  };

  const copyToClipboard = async (link: InviteLink) => {
    const url = `${window.location.origin}/shared/join?code=${link.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLinkId(link.id);
      setTimeout(() => setCopiedLinkId(null), 2000);
      toast({
        title: 'Copied to clipboard',
        description: 'Share this link with people you want to invite',
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Failed to copy',
        description: 'Please copy the link manually',
      });
    }
  };

  const getExpiryText = (link: InviteLink) => {
    if (!link.expiresAt) return 'Never expires';
    const now = new Date();
    const expiry = new Date(link.expiresAt);
    if (expiry < now) return 'Expired';
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
  };

  const getUsageText = (link: InviteLink) => {
    if (link.maxUses === 0) return `${link.currentUses} uses`;
    return `${link.currentUses}/${link.maxUses} uses`;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Invite Links
              </CardTitle>
              <CardDescription>
                Create shareable links to invite people to your group
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Link
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {inviteLinks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Link2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No active invite links</p>
              <p className="text-sm">Create a link to invite people to your group</p>
            </div>
          ) : (
            <div className="space-y-3">
              {inviteLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                        {link.code}
                      </code>
                      <Badge variant={link.isActive ? 'default' : 'secondary'}>
                        {link.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {getExpiryText(link)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {getUsageText(link)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(link)}
                    >
                      {copiedLinkId === link.id ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeactivateLink(link.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Link Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Invite Link</DialogTitle>
            <DialogDescription>
              Configure options for the new invite link
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="maxUses">Maximum Uses</Label>
              <Select value={maxUses} onValueChange={setMaxUses}>
                <SelectTrigger id="maxUses">
                  <SelectValue placeholder="Select max uses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Unlimited</SelectItem>
                  <SelectItem value="1">1 use</SelectItem>
                  <SelectItem value="5">5 uses</SelectItem>
                  <SelectItem value="10">10 uses</SelectItem>
                  <SelectItem value="25">25 uses</SelectItem>
                  <SelectItem value="50">50 uses</SelectItem>
                  <SelectItem value="100">100 uses</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiresIn">Expires In</Label>
              <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                <SelectTrigger id="expiresIn">
                  <SelectValue placeholder="Select expiry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="0">Never</SelectItem>
                </SelectContent>
              </Select>
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
            <Button onClick={handleCreateLink} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Link'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
