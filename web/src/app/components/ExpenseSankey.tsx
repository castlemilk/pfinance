'use client';

import { useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { ParentSize } from '@visx/responsive';
import { Group } from '@visx/group';
import { scaleOrdinal } from '@visx/scale';
import { Text } from '@visx/text';
import { hierarchy, Tree } from '@visx/hierarchy';
import { ExpenseCategory, IncomeFrequency } from '../types';

// Define colors for each category
const categoryColors = [
  '#0EA5E9', // Blue
  '#10B981', // Green
  '#F59E0B', // Yellow
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#F97316', // Orange
  '#6366F1', // Indigo
  '#14B8A6', // Teal
  '#6B7280', // Gray
];

// Type definitions for hierarchical data
interface TreeNode {
  name: string;
  value?: number;
  children?: TreeNode[];
}

interface ExpenseSankeyProps {
  displayPeriod: IncomeFrequency;
}

export default function ExpenseSankey({ displayPeriod }: ExpenseSankeyProps) {
  const { getExpenseSummary, getTotalExpenses } = useFinance();
  const expenseSummary = getExpenseSummary();
  const totalExpenses = getTotalExpenses();
  
  // Convert expenses to the selected frequency
  const convertedExpenses = useMemo(() => {
    return expenseSummary.map(expense => {
      const annualAmount = expense.totalAmount;
      const convertedAmount = 
        displayPeriod === 'weekly' ? annualAmount / 52 :
        displayPeriod === 'fortnightly' ? annualAmount / 26 :
        displayPeriod === 'monthly' ? annualAmount / 12 :
        annualAmount;
      
      return {
        ...expense,
        totalAmount: convertedAmount
      };
    });
  }, [expenseSummary, displayPeriod]);
  
  // Convert total expenses to the selected frequency
  const convertedTotalExpenses = useMemo(() => {
    return displayPeriod === 'weekly' ? totalExpenses / 52 :
           displayPeriod === 'fortnightly' ? totalExpenses / 26 :
           displayPeriod === 'monthly' ? totalExpenses / 12 :
           totalExpenses;
  }, [totalExpenses, displayPeriod]);
  
  // Format currency based on amount
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: amount < 10 ? 2 : 0
    }).format(amount);
  };
  
  // Prepare data for tree visualization (simplified Sankey)
  const treeData = useMemo(() => {
    if (convertedExpenses.length === 0) return null;
    
    const data: TreeNode = {
      name: 'Total',
      value: convertedTotalExpenses,
      children: convertedExpenses.map(item => ({
        name: item.category,
        value: item.totalAmount,
      })),
    };
    
    return data;
  }, [convertedExpenses, convertedTotalExpenses]);
  
  // Create color scale and node color helper
  const colorScale = useMemo(
    () => scaleOrdinal<string, string>({
      domain: convertedExpenses.map(d => d.category),
      range: categoryColors,
    }),
    [convertedExpenses]
  );
  
  // Helper to get color safely
  const getColor = (name: string): string => {
    if (name === 'Total') return '#999999';
    return colorScale(name as ExpenseCategory) || '#6B7280'; // Default to gray if not found
  };
  
  if (!treeData || convertedExpenses.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-center text-muted-foreground">
          No expense data to visualize yet.
        </p>
      </div>
    );
  }
  
  return (
    <div>
      <div className="text-center mb-2 text-sm text-muted-foreground">
        Showing {displayPeriod} expenses
      </div>
      <ParentSize>
        {({ width }) => {
          const height = 400;
          const margin = { top: 40, left: 40, right: 120, bottom: 40 };
          const innerWidth = width - margin.left - margin.right;
          const innerHeight = height - margin.top - margin.bottom;
          
          // Create hierarchical data structure
          const root = hierarchy(treeData);
          
          return (
            <svg width={width} height={height}>
              <rect width={width} height={height} fill="transparent" />
              <Group top={margin.top} left={margin.left}>
                <Tree
                  root={root}
                  size={[innerHeight, innerWidth]}
                  separation={(a, b) => (a.parent === b.parent ? 1 : 2) / a.depth}
                >
                  {tree => (
                    <Group>
                      {/* Draw links between parent and children */}
                      {tree.links().map((link, i) => (
                        <line
                          key={`link-${i}`}
                          x1={link.source.y}
                          y1={link.source.x}
                          x2={link.target.y}
                          y2={link.target.x}
                          stroke={getColor(link.target.data.name)}
                          strokeWidth={Math.max(1, (link.target.data.value || 0) / convertedTotalExpenses * 20)}
                          opacity={0.6}
                          strokeLinecap="round"
                        />
                      ))}
                      
                      {/* Draw nodes */}
                      {tree.descendants().map((node, i) => {
                        const isRoot = i === 0;
                        return (
                          <Group key={`node-${i}`} top={node.x} left={node.y}>
                            <circle
                              r={isRoot ? 20 : 15}
                              fill={isRoot ? '#999999' : getColor(node.data.name)}
                              opacity={0.8}
                            />
                            <Text
                              dx={isRoot ? -60 : 20}
                              dy={5}
                              fontSize={12}
                              fontWeight="bold"
                              textAnchor={isRoot ? 'end' : 'start'}
                            >
                              {`${node.data.name} (${formatCurrency(node.data.value || 0)})`}
                            </Text>
                          </Group>
                        );
                      })}
                    </Group>
                  )}
                </Tree>
              </Group>
            </svg>
          );
        }}
      </ParentSize>
    </div>
  );
} 