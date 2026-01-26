'use client';

import { useForm } from 'react-hook-form';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthWithAdminContext';
import { useMultiUserFinance } from '../context/MultiUserFinanceContext';
import { 
  ExpenseCategory, 
  ExpenseFrequency,
  SplitType,
  ExpenseAllocation
} from '@/gen/pfinance/v1/types_pb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, DollarSign, Percent } from 'lucide-react';

type FormData = {
  description: string;
  amount: string;
  category: ExpenseCategory;
  frequency: ExpenseFrequency;
  paidByUserId: string;
  splitType: SplitType;
  selectedMembers: string[];
  customAllocations: { [userId: string]: number };
};

interface GroupExpenseFormProps {
  groupId: string;
  onSuccess?: () => void;
}

export default function GroupExpenseForm({ groupId, onSuccess }: GroupExpenseFormProps) {
  const { user } = useAuth();
  const { activeGroup, addGroupExpense } = useMultiUserFinance();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  
  const form = useForm<FormData>({
    defaultValues: {
      description: '',
      amount: '',
      category: ExpenseCategory.UNSPECIFIED,
      frequency: ExpenseFrequency.ONCE,
      paidByUserId: user?.uid || '',
      splitType: SplitType.EQUAL,
      selectedMembers: [],
      customAllocations: {},
    },
  });

  const amount = parseFloat(form.watch('amount') || '0');

  useEffect(() => {
    if (user && activeGroup) {
      // Default to all members selected for equal split
      const allMemberIds = activeGroup.members.map(m => m.userId);
      setSelectedMembers(allMemberIds);
      form.setValue('selectedMembers', allMemberIds);
      form.setValue('paidByUserId', user.uid);
    }
  }, [user, activeGroup, form]);

  const onSubmit = async (data: FormData) => {
    if (!user || !activeGroup) return;

    setLoading(true);
    try {
      // Prepare allocations based on split type
      let allocations: ExpenseAllocation[] = [];
      
      switch (data.splitType) {
        case SplitType.EQUAL:
          const equalAmount = parseFloat(data.amount) / selectedMembers.length;
          allocations = selectedMembers.map(userId => new ExpenseAllocation({
            userId,
            amount: equalAmount,
            percentage: 0,
            shares: 0,
            isPaid: false,
            paidAt: undefined,
          }));
          break;
          
        case SplitType.AMOUNT:
          allocations = Object.entries(data.customAllocations).map(([userId, amount]) => new ExpenseAllocation({
            userId,
            amount,
            percentage: 0,
            shares: 0,
            isPaid: false,
            paidAt: undefined,
          }));
          break;
          
        case SplitType.PERCENTAGE:
          allocations = Object.entries(data.customAllocations).map(([userId, percentage]) => new ExpenseAllocation({
            userId,
            amount: (parseFloat(data.amount) * percentage) / 100,
            percentage,
            shares: 0,
            isPaid: false,
            paidAt: undefined,
          }));
          break;
      }

      // Use the context's addGroupExpense function which handles refresh
      await addGroupExpense(
        groupId,
        data.description,
        parseFloat(data.amount),
        data.category,
        data.frequency,
        data.paidByUserId,
        data.splitType,
        allocations
      );
      
      // Show success toast
      toast({
        title: "Expense created",
        description: `Successfully added expense: ${data.description}`,
      });
      
      form.reset();
      onSuccess?.();
    } catch (error) {
      console.error('Failed to create expense:', error);
      
      // Show error toast
      toast({
        variant: "destructive",
        title: "Failed to create expense",
        description: error instanceof Error ? error.message : "Please try again later",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMemberToggle = (memberId: string, checked: boolean) => {
    const newSelection = checked 
      ? [...selectedMembers, memberId]
      : selectedMembers.filter(id => id !== memberId);
    
    setSelectedMembers(newSelection);
    form.setValue('selectedMembers', newSelection);
  };

  const categories = Object.entries(ExpenseCategory)
    .filter(([name, value]) => typeof value === 'number' && value !== ExpenseCategory.UNSPECIFIED && name !== '')
    .map(([key, value]) => ({
      value: value as ExpenseCategory,
      label: key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' ')
    }));

  const frequencies = Object.entries(ExpenseFrequency)
    .filter(([name, value]) => typeof value === 'number' && value !== ExpenseFrequency.UNSPECIFIED && name !== '')
    .map(([key, value]) => ({
      value: value as ExpenseFrequency,
      label: key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' ')
    }));

  if (!activeGroup) {
    return <div>No active group selected</div>;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Add Group Expense</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="description"
                rules={{ required: 'Description is required' }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Dinner at restaurant" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="amount"
                rules={{ 
                  required: 'Amount is required',
                  pattern: {
                    value: /^\d+(\.\d{1,2})?$/,
                    message: 'Please enter a valid amount'
                  }
                }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Amount</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        defaultValue={field.value.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((category) => (
                            <SelectItem key={category.value} value={category.value.toString()}>
                              {category.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="frequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Frequency</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        defaultValue={field.value.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {frequencies.map((freq) => (
                            <SelectItem key={freq.value} value={freq.value.toString()}>
                              {freq.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Who Paid */}
            <FormField
              control={form.control}
              name="paidByUserId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paid By</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Who paid for this expense?" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {activeGroup.members.map((member) => (
                        <SelectItem key={member.userId} value={member.userId}>
                          {member.displayName} {member.userId === user?.uid && '(You)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Split Type */}
            <FormField
              control={form.control}
              name="splitType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Split Method</FormLabel>
                  <Tabs
                    value={field.value.toString()}
                    onValueChange={(value) => field.onChange(parseInt(value))}
                  >
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value={SplitType.EQUAL.toString()}>
                        <Users className="w-4 h-4 mr-2" />
                        Equal
                      </TabsTrigger>
                      <TabsTrigger value={SplitType.AMOUNT.toString()}>
                        <DollarSign className="w-4 h-4 mr-2" />
                        Amount
                      </TabsTrigger>
                      <TabsTrigger value={SplitType.PERCENTAGE.toString()}>
                        <Percent className="w-4 h-4 mr-2" />
                        Percentage
                      </TabsTrigger>
                    </TabsList>

                    {/* Equal Split */}
                    <TabsContent value={SplitType.EQUAL.toString()} className="mt-4">
                      <div className="space-y-3">
                        <FormDescription>
                          Select members to split the expense equally
                        </FormDescription>
                        {activeGroup.members.map((member) => (
                          <div key={member.userId} className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id={`member-${member.userId}`}
                                checked={selectedMembers.includes(member.userId)}
                                onCheckedChange={(checked) => 
                                  handleMemberToggle(member.userId, checked === true)
                                }
                              />
                              <label
                                htmlFor={`member-${member.userId}`}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                {member.displayName}
                              </label>
                            </div>
                            <Badge variant="secondary">
                              ${amount > 0 && selectedMembers.length > 0 
                                ? (amount / selectedMembers.length).toFixed(2) 
                                : '0.00'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    {/* Amount Split */}
                    <TabsContent value={SplitType.AMOUNT.toString()} className="mt-4">
                      <div className="space-y-3">
                        <FormDescription>
                          Enter specific amounts for each member
                        </FormDescription>
                        {activeGroup.members.map((member) => (
                          <div key={member.userId} className="flex items-center space-x-3">
                            <label className="text-sm font-medium flex-1">
                              {member.displayName}
                            </label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              className="w-24"
                              value={form.watch(`customAllocations.${member.userId}`) || ''}
                              onChange={(e) => {
                                const allocations = form.getValues('customAllocations');
                                allocations[member.userId] = parseFloat(e.target.value) || 0;
                                form.setValue('customAllocations', allocations);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    {/* Percentage Split */}
                    <TabsContent value={SplitType.PERCENTAGE.toString()} className="mt-4">
                      <div className="space-y-3">
                        <FormDescription>
                          Enter percentage for each member (must total 100%)
                        </FormDescription>
                        {activeGroup.members.map((member) => (
                          <div key={member.userId} className="flex items-center space-x-3">
                            <label className="text-sm font-medium flex-1">
                              {member.displayName}
                            </label>
                            <div className="flex items-center space-x-1">
                              <Input
                                type="number"
                                step="1"
                                min="0"
                                max="100"
                                placeholder="0"
                                className="w-20"
                                value={form.watch(`customAllocations.${member.userId}`) || ''}
                                onChange={(e) => {
                                  const allocations = form.getValues('customAllocations');
                                  allocations[member.userId] = parseFloat(e.target.value) || 0;
                                  form.setValue('customAllocations', allocations);
                                }}
                              />
                              <span className="text-sm">%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabsContent>
                  </Tabs>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating Expense...' : 'Create Expense'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}