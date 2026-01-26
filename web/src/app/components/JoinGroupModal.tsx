'use client';

import { useState, useEffect } from 'react';
import { useMultiUserFinance, FinanceGroup, InviteLink } from '../context/MultiUserFinanceContext';
import { useAuth } from '../context/AuthWithAdminContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { 
  Users, 
  Loader2, 
  Check, 
  AlertCircle,
  UserPlus
} from 'lucide-react';

interface JoinGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCode?: string;
}

export default function JoinGroupModal({ open, onOpenChange, initialCode }: JoinGroupModalProps) {
  const { user } = useAuth();
  const { getInviteLinkByCode, joinGroupByCode, setActiveGroup } = useMultiUserFinance();
  const { toast } = useToast();

  const [code, setCode] = useState(initialCode || '');
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ link: InviteLink; group: FinanceGroup } | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setCode(initialCode || '');
      setError(null);
      setPreview(null);
    }
  }, [open, initialCode]);

  // Auto-lookup when code changes
  useEffect(() => {
    const lookupCode = async () => {
      if (code.length < 8) {
        setPreview(null);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await getInviteLinkByCode(code);
        if (result) {
          setPreview(result);
        } else {
          setError('Invalid or expired invite code');
          setPreview(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to verify code');
        setPreview(null);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(lookupCode, 500);
    return () => clearTimeout(debounce);
  }, [code, getInviteLinkByCode]);

  const handleJoin = async () => {
    if (!user) {
      setError('You must be logged in to join a group');
      return;
    }

    setJoining(true);
    try {
      const group = await joinGroupByCode(code);
      setActiveGroup(group);
      toast({
        title: 'Joined group',
        description: `You are now a member of ${group.name}`,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join group');
    } finally {
      setJoining(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      // Try to extract code from URL or use directly
      const codeMatch = text.match(/code=([A-Z0-9]{8})/i) || text.match(/^[A-Z0-9]{8}$/i);
      if (codeMatch) {
        setCode(codeMatch[1] || codeMatch[0]);
      } else {
        setCode(text.trim().toUpperCase());
      }
    } catch {
      toast({
        variant: 'destructive',
        title: 'Failed to paste',
        description: 'Please paste the code manually',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Join a Group
          </DialogTitle>
          <DialogDescription>
            Enter an invite code to join a shared finance group
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Code Input */}
          <div className="space-y-2">
            <Label htmlFor="inviteCode">Invite Code</Label>
            <div className="flex gap-2">
              <Input
                id="inviteCode"
                placeholder="ABCD1234"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="font-mono text-center text-lg tracking-wider"
                maxLength={8}
              />
              <Button variant="outline" onClick={handlePaste}>
                Paste
              </Button>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Error State */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Group Preview */}
          {preview && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold">{preview.group.name}</h4>
                    {preview.group.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {preview.group.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary">
                        <Users className="h-3 w-3 mr-1" />
                        {preview.group.members.length} members
                      </Badge>
                      <Badge variant="outline">
                        {preview.link.defaultRole}
                      </Badge>
                    </div>
                  </div>
                  <Check className="h-5 w-5 text-green-500" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Login Required Notice */}
          {!user && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You must be logged in to join a group
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleJoin} 
            disabled={!preview || joining || !user}
          >
            {joining ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Joining...
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4 mr-2" />
                Join Group
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
