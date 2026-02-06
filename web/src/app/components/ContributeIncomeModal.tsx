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
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { 
  Share2, 
  Users, 
  DollarSign, 
  Loader2,
  Briefcase
} from 'lucide-react';
import { Income as LocalIncome } from '../types';

interface ContributeIncomeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  income: LocalIncome;
  onContributed?: () => void;
}

export default function ContributeIncomeModal({ 
  open, 
  onOpenChange, 
  income,
  onContributed 
}: ContributeIncomeModalProps) {
  const { user } = useAuth();
  const { groups, refreshGroupIncomes } = useMultiUserFinance();
  const { toast } = useToast();

  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [amount, setAmount] = useState<string>(income.amount.toString());
  const [contributing, setContributing] = useState(false);

  const selectedGroup = useMemo(() => 
    groups.find(g => g.id === selectedGroupId), 
    [groups, selectedGroupId]
  );

  const handleContribute = async () => {
    if (!user || !selectedGroup) return;

    setContributing(true);
    try {
      await financeClient.contributeIncomeToGroup({
        sourceIncomeId: income.id,
        targetGroupId: selectedGroupId,
        contributedBy: user.uid,
        amount: parseFloat(amount),
      });

      toast({
        title: 'Income contributed',
        description: `Successfully contributed "${income.source}" to ${selectedGroup.name}`,
      });
      
      // Refresh group incomes to show the new contribution
      await refreshGroupIncomes();
      
      onOpenChange(false);
      onContributed?.();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Failed to contribute income',
        description: err instanceof Error ? err.message : 'Please try again',
      });
    } finally {
      setContributing(false);
    }
  };

  const formatFrequency = (frequency: string): string => {
    const frequencyMap: Record<string, string> = {
      'weekly': 'Weekly',
      'fortnightly': 'Fortnightly',
      'monthly': 'Monthly',
      'annually': 'Annually',
    };
    return frequencyMap[frequency.toLowerCase()] || frequency;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Contribute Income to Group
          </DialogTitle>
          <DialogDescription>
            Share your income with a household or finance group
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Income Summary */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <Briefcase className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium">{income.source}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatFrequency(income.frequency)}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                  ${income.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a group to contribute to" />
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
                <Label htmlFor="amount">Amount to Contribute</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="amount"
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-9"
                    min={0}
                    max={income.amount}
                    step={0.01}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Total income: ${income.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>

              {/* Contribution Preview */}
              <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
                <CardContent className="pt-4">
                  <p className="text-sm font-medium mb-2">Contribution Summary</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Contributing to</span>
                      <span className="font-medium">{selectedGroup.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-medium text-green-600 dark:text-green-400">
                        ${parseFloat(amount || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Contributed by</span>
                      <span className="font-medium">You</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <p className="text-xs text-muted-foreground">
                This income will be added to the group&apos;s total household income and attributed to you as the contributor.
              </p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={contributing}>
            Cancel
          </Button>
          <Button 
            onClick={handleContribute} 
            disabled={!selectedGroupId || contributing || parseFloat(amount) <= 0}
            className="bg-green-600 hover:bg-green-700"
          >
            {contributing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Contributing...
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4 mr-2" />
                Contribute to Group
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
