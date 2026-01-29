'use client';

import { useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { ParentSize } from '@visx/responsive';
import { Sankey } from '@visx/sankey';
import { scaleOrdinal } from '@visx/scale';
import { ExpenseCategory, IncomeFrequency } from '../types';

// Define colors for categories and main nodes
const categoryColors = [
  '#0EA5E9', // Blue (Food)
  '#10B981', // Green (Housing)
  '#F59E0B', // Yellow (Transport)
  '#EF4444', // Red (Entertainment)
  '#8B5CF6', // Purple (Health)
  '#EC4899', // Pink (Utilities)
  '#F97316', // Orange (Shopping)
  '#6366F1', // Indigo (Education)
  '#14B8A6', // Teal (Travel)
  '#6B7280', // Gray (Other)
];

interface ExpenseSankeyProps {
  displayPeriod: IncomeFrequency;
}

export default function ExpenseSankey({ displayPeriod }: ExpenseSankeyProps) {
  const { getExpenseSummary, getTotalExpenses, getTotalIncome } = useFinance();
  
  const expenseSummary = getExpenseSummary();
  const totalExpenses = getTotalExpenses();
  // Get monthly income by default from context, need to adjust calculation if needed
  // getTotalIncome accepts a frequency argument
  const totalIncome = getTotalIncome(displayPeriod); 

  // Convert expenses to the selected frequency
  // expenseSummary always returns annual amounts
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
  
  // Calculate derived values for the flow
  const convertedTotalExpenses = useMemo(() => {
    return convertedExpenses.reduce((sum, item) => sum + item.totalAmount, 0);
  }, [convertedExpenses]);

  // Savings is Income - Expenses
  // If expenses > income, savings is 0 (or we could show deficit, but Sankey handles positive flows best)
  const savings = Math.max(0, totalIncome - convertedTotalExpenses);
  
  // If income is less than expenses, we artificially bump income for the visual to balance
  const effectiveTotalIncome = Math.max(totalIncome, convertedTotalExpenses);
  const isDeficit = totalIncome < convertedTotalExpenses;

  // Prepare Sankey Data
  const data = useMemo(() => {
    const nodes: { name: string }[] = [];
    const links: { source: number; target: number; value: number }[] = [];

    // Node 0: Income Source
    nodes.push({ name: isDeficit ? 'Total Funding (Deficit)' : 'Total Income' });
    
    // Node 1: Expenses Pool
    nodes.push({ name: 'Expenses' });

    // Node 2 (Optional): Savings
    if (savings > 0) {
      nodes.push({ name: 'Savings' });
    }

    // Add links from Income
    // Link to Expenses
    links.push({ source: 0, target: 1, value: convertedTotalExpenses });
    
    // Link to Savings (if any)
    if (savings > 0) {
      links.push({ source: 0, target: 2, value: savings });
    }

    // Category Nodes start index
    const categoryStartIndex = nodes.length;

    // Add Category Nodes and Links from Expenses Pool
    convertedExpenses.forEach((expense, index) => {
      nodes.push({ name: expense.category });
      links.push({ 
        source: 1, // From Expenses Pool
        target: categoryStartIndex + index, 
        value: expense.totalAmount 
      });
    });

    return { nodes, links };
  }, [effectiveTotalIncome, convertedTotalExpenses, savings, convertedExpenses, isDeficit]);

  // Color scale
  const colorScale = scaleOrdinal({
    domain: ['Total Income', 'Total Funding (Deficit)', 'Expenses', 'Savings', ...convertedExpenses.map(d => d.category)],
    range: ['#10B981', '#EF4444', '#F59E0B', '#3B82F6', ...categoryColors],
  });

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (convertedTotalExpenses === 0 && totalIncome === 0) {
     return (
      <div className="flex justify-center items-center h-64">
        <p className="text-center text-muted-foreground">
          No data to visualize. Add income or expenses to see the flow.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="text-center mb-2 text-sm text-muted-foreground">
        Flow: Income → Expenses/Savings → Categories ({displayPeriod})
      </div>
      <div className="flex-1 min-h-[400px]">
        <ParentSize>
          {({ width, height }) => (
            <Sankey
              root={data}
              size={[width, height]}
              nodeWidth={15}
              nodePadding={10}
              extent={[[1, 1], [width - 1, height - 6]]}
            >
              {({ graph }) => (
                <svg width={width} height={height}>
                  <defs>
                   {/* Gradients could go here */}
                  </defs>
                  
                  {/* Links */}
                  <g>
                    {graph.links.map((link: any, i: number) => (
                      <path
                        key={`link-${i}`}
                        d={link.path || ''}
                        stroke={link.source.name === 'Total Income' || link.source.name === 'Total Funding (Deficit)' 
                          ? colorScale(link.target.name ?? '') 
                          : colorScale(link.target.name ?? '')}
                        strokeWidth={Math.max(1, link.width || 1)}
                        strokeOpacity={0.25}
                        fill="none"
                        onMouseEnter={(e: React.MouseEvent<SVGPathElement>) => {
                           e.currentTarget.style.strokeOpacity = '0.5';
                        }}
                        onMouseLeave={(e: React.MouseEvent<SVGPathElement>) => {
                           e.currentTarget.style.strokeOpacity = '0.25';
                        }}
                      >
                        <title>{`${link.source.name} → ${link.target.name}: ${formatCurrency(link.value)}`}</title>
                      </path>
                    ))}
                  </g>

                  {/* Nodes */}
                  <g>
                    {graph.nodes.map((node, i) => (
                      <g key={`node-${i}`}>
                        <rect
                          x={node.x0}
                          y={node.y0}
                          width={Math.max(0, (node.x1 || 0) - (node.x0 || 0))}
                          height={Math.max(0, (node.y1 || 0) - (node.y0 || 0))}
                          fill={colorScale(node.name ?? '')}
                          stroke="#fff"
                        />
                        <text
                          x={(node.x0 || 0) < width / 2 ? (node.x1 || 0) + 6 : (node.x0 || 0) - 6}
                          y={((node.y1 || 0) + (node.y0 || 0)) / 2}
                          dy=".35em"
                          fontSize={12}
                          fontWeight="500"
                          textAnchor={(node.x0 || 0) < width / 2 ? 'start' : 'end'}
                          className="fill-foreground text-xs pointer-events-none"
                        >
                          {node.name}
                        </text>
                        {/* Value label below name */}
                        <text
                          x={(node.x0 || 0) < width / 2 ? (node.x1 || 0) + 6 : (node.x0 || 0) - 6}
                          y={((node.y1 || 0) + (node.y0 || 0)) / 2 + 14}
                          dy=".35em"
                          fontSize={10}
                          className="fill-muted-foreground pointer-events-none"
                           textAnchor={(node.x0 || 0) < width / 2 ? 'start' : 'end'}
                        >
                          {formatCurrency(node.value || 0)}
                        </text>
                         <title>
                          {`${node.name}\n${formatCurrency(node.value || 0)}`}
                        </title>
                      </g>
                    ))}
                  </g>
                </svg>
              )}
            </Sankey>
          )}
        </ParentSize>
      </div>
    </div>
  );
} 