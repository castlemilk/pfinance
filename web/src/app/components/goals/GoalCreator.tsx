'use client';

import { useState } from 'react';
import { useGoals, GoalType, CreateGoalParams } from '../../context/GoalContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import {
  PiggyBank,
  CreditCard,
  Wallet,
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
} from 'lucide-react';

interface GoalCreatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoalCreated?: () => void;
}

type Step = 'type' | 'details' | 'amount' | 'timeline' | 'confirm';

const goalTypeOptions: { type: GoalType; icon: typeof PiggyBank; title: string; description: string }[] = [
  {
    type: 'savings',
    icon: PiggyBank,
    title: 'Savings Goal',
    description: 'Save towards a target amount for a purchase, emergency fund, or investment.',
  },
  {
    type: 'debt_payoff',
    icon: CreditCard,
    title: 'Debt Payoff',
    description: 'Track progress paying off credit cards, loans, or other debts.',
  },
  {
    type: 'spending_limit',
    icon: Wallet,
    title: 'Spending Limit',
    description: 'Set a maximum spending limit for a category to stay on budget.',
  },
];

const goalIcons = ['🎯', '🏠', '🚗', '✈️', '💰', '📱', '🎓', '💍', '🏥', '🎁', '🛍️', '🔧'];
const goalColors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function GoalCreator({ open, onOpenChange, onGoalCreated }: GoalCreatorProps) {
  const { createGoal } = useGoals();
  const [step, setStep] = useState<Step>('type');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [goalType, setGoalType] = useState<GoalType>('savings');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [initialAmount, setInitialAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [icon, setIcon] = useState('🎯');
  const [color, setColor] = useState('#10b981');

  const resetForm = () => {
    setStep('type');
    setGoalType('savings');
    setName('');
    setDescription('');
    setTargetAmount('');
    setInitialAmount('');
    setTargetDate('');
    setIcon('🎯');
    setColor('#10b981');
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      const params: CreateGoalParams = {
        name,
        description: description || undefined,
        goalType,
        targetAmount: parseFloat(targetAmount) || 0,
        initialAmount: parseFloat(initialAmount) || 0,
        startDate: new Date(),
        targetDate: new Date(targetDate),
        icon,
        color,
      };

      const goal = await createGoal(params);

      if (goal) {
        handleClose();
        onGoalCreated?.();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps: Step[] = ['type', 'details', 'amount', 'timeline', 'confirm'];
  const currentStepIndex = steps.indexOf(step);

  const canProceed = () => {
    switch (step) {
      case 'type':
        return true;
      case 'details':
        return name.trim().length > 0;
      case 'amount':
        return parseFloat(targetAmount) > 0;
      case 'timeline':
        return targetDate && new Date(targetDate) > new Date();
      case 'confirm':
        return true;
      default:
        return false;
    }
  };

  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setStep(steps[nextIndex]);
    }
  };

  const goBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setStep(steps[prevIndex]);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 'type':
        return (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>What type of goal?</DialogTitle>
              <DialogDescription>
                Choose the type of financial goal you want to track.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3">
              {goalTypeOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = goalType === option.type;

                return (
                  <Card
                    key={option.type}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      isSelected ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => setGoalType(option.type)}
                  >
                    <CardContent className="flex items-start gap-4 p-4">
                      <div className={`p-2 rounded-lg ${isSelected ? 'bg-primary/20' : 'bg-muted'}`}>
                        <Icon className={`h-6 w-6 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold">{option.title}</h4>
                        <p className="text-sm text-muted-foreground">{option.description}</p>
                      </div>
                      {isSelected && <Check className="h-5 w-5 text-primary" />}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );

      case 'details':
        return (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Goal Details</DialogTitle>
              <DialogDescription>
                Give your goal a name and optional description.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Goal Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Emergency Fund, Vacation, New Car"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Add any details about your goal..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Icon</Label>
                <div className="flex flex-wrap gap-2">
                  {goalIcons.map((emoji) => (
                    <Button
                      key={emoji}
                      variant={icon === emoji ? 'default' : 'outline'}
                      size="sm"
                      className="w-10 h-10 text-lg"
                      onClick={() => setIcon(emoji)}
                    >
                      {emoji}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex flex-wrap gap-2">
                  {goalColors.map((c) => (
                    <button
                      key={c}
                      className={`w-8 h-8 rounded-full transition-all ${
                        color === c ? 'ring-2 ring-offset-2 ring-primary' : ''
                      }`}
                      style={{ backgroundColor: c }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 'amount':
        return (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Set Your Target</DialogTitle>
              <DialogDescription>
                How much do you want to {goalType === 'debt_payoff' ? 'pay off' : 'save'}?
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="targetAmount">Target Amount *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="targetAmount"
                    type="number"
                    placeholder="10,000"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    className="pl-7"
                    min="0"
                    step="100"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="initialAmount">
                  Starting Amount (optional)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="initialAmount"
                    type="number"
                    placeholder="0"
                    value={initialAmount}
                    onChange={(e) => setInitialAmount(e.target.value)}
                    className="pl-7"
                    min="0"
                    step="100"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  If you've already made progress, enter the current amount.
                </p>
              </div>
            </div>
          </div>
        );

      case 'timeline':
        return (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Set Your Timeline</DialogTitle>
              <DialogDescription>
                When do you want to achieve this goal?
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="targetDate">Target Date *</Label>
                <Input
                  id="targetDate"
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>

              {targetDate && parseFloat(targetAmount) > 0 && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-primary">
                      <Sparkles className="h-4 w-4" />
                      <span className="font-medium">Daily savings needed</span>
                    </div>
                    <div className="mt-2 text-2xl font-bold">
                      ${calculateDailyRate().toFixed(2)}/day
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {calculateDaysRemaining()} days to reach your goal
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        );

      case 'confirm':
        return (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Review Your Goal</DialogTitle>
              <DialogDescription>
                Make sure everything looks good before creating your goal.
              </DialogDescription>
            </DialogHeader>

            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: `${color}20` }}
                  >
                    <span className="text-2xl">{icon}</span>
                  </div>
                  <div>
                    <h4 className="font-semibold">{name}</h4>
                    <p className="text-sm text-muted-foreground capitalize">
                      {goalType.replace('_', ' ')}
                    </p>
                  </div>
                </div>

                {description && (
                  <p className="text-sm text-muted-foreground">{description}</p>
                )}

                <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                  <div>
                    <div className="text-sm text-muted-foreground">Target Amount</div>
                    <div className="font-semibold">${parseFloat(targetAmount).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Starting Amount</div>
                    <div className="font-semibold">${(parseFloat(initialAmount) || 0).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Target Date</div>
                    <div className="font-semibold">{new Date(targetDate).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Daily Target</div>
                    <div className="font-semibold">${calculateDailyRate().toFixed(2)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  const calculateDailyRate = () => {
    if (!targetDate || !targetAmount) return 0;
    const days = calculateDaysRemaining();
    const remaining = parseFloat(targetAmount) - (parseFloat(initialAmount) || 0);
    return days > 0 ? remaining / days : 0;
  };

  const calculateDaysRemaining = () => {
    if (!targetDate) return 0;
    const target = new Date(targetDate);
    const now = new Date();
    return Math.max(1, Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 pb-4">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all ${
                i <= currentStepIndex ? 'bg-primary' : 'bg-muted'
              } ${i === currentStepIndex ? 'w-8' : 'w-2'}`}
            />
          ))}
        </div>

        {renderStepContent()}

        <DialogFooter className="flex justify-between sm:justify-between">
          {currentStepIndex > 0 ? (
            <Button variant="outline" onClick={goBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          ) : (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}

          {step === 'confirm' ? (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="animate-spin mr-2">⏳</span>
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Create Goal
            </Button>
          ) : (
            <Button onClick={goNext} disabled={!canProceed()}>
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
