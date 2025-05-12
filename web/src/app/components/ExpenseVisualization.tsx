'use client';

import { useState } from 'react';
import ExpenseChart from './ExpenseChart';
import ExpenseSankey from './ExpenseSankey';
import ChartToggle from './ChartToggle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { IncomeFrequency } from '../types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type VisualizationType = 'pie' | 'sankey';

export default function ExpenseVisualization() {
  const [visualizationType, setVisualizationType] = useState<VisualizationType>('pie');
  const [displayPeriod, setDisplayPeriod] = useState<IncomeFrequency>('monthly');
  
  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle>Expense Breakdown</CardTitle>
          <Select
            value={displayPeriod}
            onValueChange={(value: IncomeFrequency) => setDisplayPeriod(value)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="fortnightly">Fortnightly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="annually">Annually</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <div className="px-6 pb-2">
        <ChartToggle 
          activeType={visualizationType} 
          onToggle={setVisualizationType} 
        />
      </div>
      <CardContent>
        <div className="h-[450px]">
          {visualizationType === 'pie' 
            ? <ExpenseChart displayPeriod={displayPeriod} /> 
            : <ExpenseSankey displayPeriod={displayPeriod} />
          }
        </div>
      </CardContent>
    </Card>
  );
} 