'use client';

import { useState, useMemo } from 'react';
import { useMultiUserFinance } from '../context/MultiUserFinanceContext';
import { useAuth } from '../context/AuthWithAdminContext';
import { financeClient } from '@/lib/financeService';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { 
  Share2, 
  Users, 
  DollarSign, 
  Loader2,
  Split
} from 'lucide-react';
import { SplitType } from '@/gen/pfinance/v1/types_pb';
import { Expense as LocalExpense } from '../types';

interface ContributeExpenseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: LocalExpense;
  onContributed?: () => void;
}

export default function ContributeExpenseModal({ 
  open, 
  onOpenChange, 
  expense,
  onContributed 
}: ContributeExpenseModalProps) {
  const { user } = useAuth();
  const { groups } = useMultiUserFinance();
  const { toast } = useToast();

  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [amount, setAmount] = useState<string>(expense.amount.toString());
  const [splitType, setSplitType] = useState<'equal' | 'full'>('equal');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [contributing, setContributing] = useState(false);

  const selectedGroup = useMemo(() => 
    groups.find(g => g.id === selectedGroupId), 
    [groups, selectedGroupId]
  );

  // Reset selected members when group changes
  const handleGroupChange = (groupId: string) => {
    setSelectedGroupId(groupId);
    const group = groups.find(g => g.id === groupId);
    if (group) {
      // Default to all members selected
      setSelectedMembers(group.memberIds);
    }
  };

  const toggleMember = (userId: string) => {
    setSelectedMembers(prev => 
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const calculateSplit = () => {
    const contributionAmount = parseFloat(amount) || 0;
    if (!selectedGroup || selectedMembers.length === 0) return [];

    if (splitType === 'full') {
      // Full amount assigned to a single person (the contributor owes nothing)
      return selectedMembers.map(userId => ({
        userId,
        amount: userId === user?.uid ? 0 : contributionAmount / (selectedMembers.length - 1 || 1),
      }));
    }

    // Equal split
    const shareAmount = contributionAmount / selectedMembers.length;
    return selectedMembers.map(userId => ({
      userId,
      amount: shareAmount,
    }));
  };

  const splitPreview = calculateSplit();

  const handleContribute = async () => {
    if (!user || !selectedGroup) return;

    setContributing(true);
    try {
      await financeClient.contributeExpenseToGroup({
        sourceExpenseId: expense.id,
        targetGroupId: selectedGroupId,
        contributedBy: user.uid,
        amount: parseFloat(amount),
        splitType: splitType === 'equal' ? SplitType.EQUAL : SplitType.AMOUNT,
        allocatedUserIds: selectedMembers,
      });

      toast({
        title: 'Expense shared',
        description: `Successfully shared "${expense.description}" with ${selectedGroup.name}`,
      });
      onOpenChange(false);
      onContributed?.();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Failed to share expense',
        description: err instanceof Error ? err.message : 'Please try again',
      });
    } finally {
      setContributing(false);
    }
  };

  const getMemberName = (userId: string): string => {
    const member = selectedGroup?.members.find(m => m.userId === userId);
    return member?.displayName || member?.email || userId;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share Expense with Group
          </DialogTitle>
          <DialogDescription>
            Share &quot;{expense.description}&quot; with a finance group
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Expense Summary */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{expense.description}</p>
                  <p className="text-sm text-muted-foreground">
                    {expense.category} • {expense.frequency}
                  </p>
                </div>
                <Badge variant="secondary" className="text-lg">
                  ${expense.amount.toFixed(2)}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Group Selection */}
          <div className="space-y-2">
            <Label>Select Group</Label>
            {groups.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>You&apos;re not a member of any groups</p>
                  <p className="text-sm">Create or join a group first</p>
                </CardContent>
              </Card>
            ) : (
              <Select value={selectedGroupId} onValueChange={handleGroupChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a group to share with" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map(group => (
                    <SelectItem key={group.id} value={group.id}>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {group.name}
                        <Badge variant="outline" className="ml-2">
                          {group.members.length} members
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedGroup && (
            <>
              {/* Amount */}
              <div className="space-y-2">
                <Label htmlFor="amount">Amount to Share</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="amount"
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-9"
                    min={0}
                    max={expense.amount}
                    step={0.01}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Original expense: ${expense.amount.toFixed(2)}
                </p>
              </div>

              {/* Split Type */}
              <div className="space-y-2">
                <Label>Split Method</Label>
                <Select value={splitType} onValueChange={(v) => setSplitType(v as 'equal' | 'full')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equal">
                      <div className="flex items-center gap-2">
                        <Split className="h-4 w-4" />
                        Split equally
                      </div>
                    </SelectItem>
                    <SelectItem value="full">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Full amount (others owe you)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Member Selection */}
              <div className="space-y-2">
                <Label>Split Between</Label>
                <div className="border rounded-lg max-h-40 overflow-y-auto">
                  {selectedGroup.members.map(member => (
                    <label
                      key={member.userId}
                      className="flex items-center gap-3 p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
                    >
                      <Checkbox
                        checked={selectedMembers.includes(member.userId)}
                        onCheckedChange={() => toggleMember(member.userId)}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {member.displayName}
                          {member.userId === user?.uid && (
                            <Badge variant="secondary" className="ml-2 text-xs">You</Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Split Preview */}
              {splitPreview.length > 0 && selectedMembers.length > 0 && (
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm font-medium mb-2">Split Preview</p>
                    <div className="space-y-1">
                      {splitPreview.map(({ userId, amount: splitAmount }) => (
                        <div key={userId} className="flex justify-between text-sm">
                          <span className={userId === user?.uid ? 'font-medium' : ''}>
                            {getMemberName(userId)}
                            {userId === user?.uid && ' (you)'}
                          </span>
                          <span className={splitAmount > 0 ? 'text-red-600' : 'text-green-600'}>
                            {splitAmount > 0 ? `owes $${splitAmount.toFixed(2)}` : 'paid'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={contributing}>
            Cancel
          </Button>
          <Button 
            onClick={handleContribute} 
            disabled={!selectedGroupId || selectedMembers.length === 0 || contributing}
          >
            {contributing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sharing...
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4 mr-2" />
                Share with Group
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
