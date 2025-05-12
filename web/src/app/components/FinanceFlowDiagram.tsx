'use client';

import { useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { IncomeFrequency } from '../types';
import { ParentSize } from '@visx/responsive';
import { Group } from '@visx/group';
import { Sankey } from '@visx/sankey';
import { LinkHorizontal, Bar } from '@visx/shape';
import { scaleOrdinal } from '@visx/scale';
import { useTooltip, defaultStyles } from '@visx/tooltip';
import { Text } from '@visx/text';

interface TooltipData {
  name: string;
  value: number;
  percentage: number;
  color: string;
  type?: string;
  sourceName?: string;
  targetName?: string;
}

interface FinanceFlowDiagramProps {
  displayPeriod: IncomeFrequency;
}

// Define our custom node object with additional properties for display
interface SimpleSankeyNode {
  name: string;
  type?: string;
  amount?: number;
  percentage?: number;
  color?: string;
}

// Define our custom link object
interface SimpleSankeyLink {
  source: number;
  target: number;
  value: number;
  sourceName?: string;
  targetName?: string;
  sourceAmount?: number;
  targetAmount?: number;
  percentage?: number;
  color?: string;
}

// Main component
export default function FinanceFlowDiagram({ displayPeriod }: FinanceFlowDiagramProps) {
  const { 
    getTotalIncome, 
    getNetIncome, 
    getTotalExpenses, 
    taxConfig,
    incomes,
    getExpenseSummary
  } = useFinance();

  // Setup tooltip
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip
  } = useTooltip<TooltipData>();

  // Convert annual amount to specified frequency
  const convertAmountToFrequency = (annualAmount: number, targetFrequency: IncomeFrequency): number => {
    switch (targetFrequency) {
      case 'weekly':
        return annualAmount / 52;
      case 'fortnightly':
        return annualAmount / 26;
      case 'monthly':
        return annualAmount / 12;
      case 'annually':
        return annualAmount;
      default:
        return annualAmount;
    }
  };

  const totalIncome = getTotalIncome(displayPeriod);
  const netIncome = getNetIncome(displayPeriod);
  const expenseSummary = getExpenseSummary();
  const totalExpenses = getTotalExpenses();
  
  // Calculate adjusted expenses based on the display period
  const adjustedExpenses = convertAmountToFrequency(totalExpenses, displayPeriod);
  
  const savingsAmount = netIncome - adjustedExpenses;
  const taxAmount = totalIncome - netIncome;

  // Format amount to currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Format percentage
  const formatPercentage = (percentage: number) => {
    return `${percentage.toFixed(1)}%`;
  };

  // Scale income and expense amounts by frequency
  const scaleAmountByFrequency = (amount: number, frequency: IncomeFrequency): number => {
    // Convert to annual amount
    const annualAmount = 
      frequency === 'weekly' ? amount * 52 :
      frequency === 'fortnightly' ? amount * 26 :
      frequency === 'monthly' ? amount * 12 :
      amount;
    
    // Convert to target period
    return displayPeriod === 'weekly' ? annualAmount / 52 :
      displayPeriod === 'fortnightly' ? annualAmount / 26 :
      displayPeriod === 'monthly' ? annualAmount / 12 :
      annualAmount;
  };

  // Prepare data for Sankey diagram
  const { nodes, links } = useMemo(() => {
    // Calculate total income for percentage
    const totalIncomeAmount = totalIncome || 1;
    
    // Color scales
    const incomeColorScale = scaleOrdinal({
      domain: incomes.map(i => i.source),
      range: ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe']
    });
    
    const expenseColorScale = scaleOrdinal({
      domain: ['Expenses', 'Food', 'Housing', 'Transportation', 'Entertainment', 'Healthcare', 'Utilities', 'Shopping', 'Education', 'Travel', 'Other'],
      range: ['#ef4444', '#f87171', '#fca5a5', '#fee2e2', '#fecaca', '#fda4af', '#f43f5e', '#fb7185', '#fda4af', '#fda4af', '#fda4af']
    });
    
    const savingsColorScale = scaleOrdinal({
      domain: ['Savings', 'Investments', 'Cash', 'Retirement'],
      range: ['#22c55e', '#4ade80', '#86efac', '#bbf7d0']
    });
    
    // Create nodes array and node map
    const nodes: SimpleSankeyNode[] = [];
    const nodeMap = new Map<string, number>();
    
    // Process incomes
    const sortedIncomes = [...incomes].sort((a, b) => 
      scaleAmountByFrequency(b.amount, b.frequency) - scaleAmountByFrequency(a.amount, a.frequency)
    );

    // Add income nodes
    sortedIncomes.forEach((income, idx) => {
      const scaledAmount = scaleAmountByFrequency(income.amount, income.frequency);
      const percentage = (scaledAmount / totalIncomeAmount) * 100;
      
      const node = {
        name: income.source,
        type: 'income',
        amount: scaledAmount,
        percentage,
        color: incomeColorScale(income.source)
      };
      
      nodes.push(node);
      nodeMap.set(income.source, idx);
    });

    // Add tax node if enabled
    if (taxConfig.enabled && taxAmount > 0) {
      const taxNode = {
        name: 'Tax',
        type: 'tax',
        amount: taxAmount,
        percentage: (taxAmount / totalIncomeAmount) * 100,
        color: '#f97316' // Orange
      };
      
      nodes.push(taxNode);
      nodeMap.set('Tax', nodes.length - 1);
    }
    
    // Add intermediate expense category node
    if (adjustedExpenses > 0) {
      const expensesNode = {
        name: 'Expenses',
        type: 'expense-category',
        amount: adjustedExpenses,
        percentage: (adjustedExpenses / totalIncomeAmount) * 100,
        color: expenseColorScale('Expenses')
      };
      
      nodes.push(expensesNode);
      nodeMap.set('Expenses', nodes.length - 1);
    }
    
    // Add intermediate savings category node
    if (savingsAmount > 0) {
      const savingsNode = {
        name: 'Savings',
        type: 'savings-category',
        amount: savingsAmount,
        percentage: (savingsAmount / totalIncomeAmount) * 100,
        color: savingsColorScale('Savings')
      };
      
      nodes.push(savingsNode);
      nodeMap.set('Savings', nodes.length - 1);
      
      // Add savings sub-categories (example categories - adjust as needed)
      const savingsSubCategories = [
        { name: 'Investments', amount: savingsAmount * 0.4 },
        { name: 'Cash', amount: savingsAmount * 0.3 },
        { name: 'Retirement', amount: savingsAmount * 0.3 }
      ];
      
      savingsSubCategories.forEach(subCategory => {
        const node = {
          name: subCategory.name,
          type: 'savings-subcategory',
          amount: subCategory.amount,
          percentage: (subCategory.amount / totalIncomeAmount) * 100,
          color: savingsColorScale(subCategory.name)
        };
        
        nodes.push(node);
        nodeMap.set(subCategory.name, nodes.length - 1);
      });
    }
    
    // Group expense data by category
    const expensesByCategory = new Map<string, { totalAmount: number, expenses: Array<{ name: string, amount: number }> }>();
    
    // Initialize expense categories
    ['Food', 'Housing', 'Transportation', 'Entertainment', 'Healthcare', 'Utilities', 'Shopping', 'Education', 'Travel', 'Other'].forEach(category => {
      expensesByCategory.set(category, { totalAmount: 0, expenses: [] });
    });
    
    // Populate expense categories
    expenseSummary.forEach(expense => {
      const annualAmount = expense.totalAmount;
      const scaledAmount = convertAmountToFrequency(annualAmount, displayPeriod);
      
      // Map expense category to standard categories
      let category = expense.category;
      if (!expensesByCategory.has(category)) {
        category = 'Other';
      }
      
      const categoryData = expensesByCategory.get(category);
      if (categoryData) {
        categoryData.totalAmount += scaledAmount;
        categoryData.expenses.push({ name: expense.category, amount: scaledAmount });
      }
    });
    
    // Add expense category nodes
    expensesByCategory.forEach((categoryData, category) => {
      if (categoryData.totalAmount > 0) {
        const node = {
          name: category,
          type: 'expense-subcategory',
          amount: categoryData.totalAmount,
          percentage: (categoryData.totalAmount / totalIncomeAmount) * 100,
          color: expenseColorScale(category)
        };
        
        nodes.push(node);
        nodeMap.set(category, nodes.length - 1);
        
        // Add individual expense items for larger categories (optional)
        // You could add individual expense items here if needed
      }
    });
    
    // Create links
    const links: SimpleSankeyLink[] = [];
    
    // Create tax links
    if (taxConfig.enabled && taxAmount > 0) {
      sortedIncomes.forEach(income => {
        // Skip post-tax income - these already have tax deducted
        if (income.taxStatus === 'postTax') return;
        
        const scaledAmount = scaleAmountByFrequency(income.amount, income.frequency);
        // Calculate pre-tax income total for proper distribution
        const preTaxTotal = sortedIncomes
          .filter(inc => inc.taxStatus === 'preTax')
          .reduce((sum, inc) => sum + scaleAmountByFrequency(inc.amount, inc.frequency), 0);
        
        // Distribute tax proportionally to pre-tax income
        const taxPortion = preTaxTotal > 0 ? (scaledAmount / preTaxTotal) * taxAmount : 0;
        
        if (taxPortion <= 0) return;
        
        const sourceIdx = nodeMap.get(income.source) ?? 0;
        const targetIdx = nodeMap.get('Tax') ?? 0;
        
        links.push({
          source: sourceIdx,
          target: targetIdx,
          value: taxPortion,
          sourceName: income.source,
          targetName: 'Tax',
          sourceAmount: scaledAmount,
          targetAmount: taxAmount,
          percentage: (taxPortion / totalIncomeAmount) * 100,
          color: incomeColorScale(income.source)
        });
      });
    }
    
    // Create expense category links
    if (adjustedExpenses > 0) {
      // Link from income to expenses category
      sortedIncomes.forEach(income => {
        const scaledAmount = scaleAmountByFrequency(income.amount, income.frequency);
        // For post-tax income, we don't need to subtract tax as it's already deducted
        const effectiveAmount = income.taxStatus === 'postTax' ? scaledAmount : scaledAmount * (1 - (taxAmount / totalIncomeAmount));
        const expensesPortion = (effectiveAmount / (totalIncomeAmount - taxAmount)) * adjustedExpenses;
        
        if (expensesPortion <= 0) return;
        
        const sourceIdx = nodeMap.get(income.source) ?? 0;
        const targetIdx = nodeMap.get('Expenses') ?? 0;
        
        links.push({
          source: sourceIdx,
          target: targetIdx,
          value: expensesPortion,
          sourceName: income.source,
          targetName: 'Expenses',
          sourceAmount: scaledAmount,
          targetAmount: adjustedExpenses,
          percentage: (expensesPortion / totalIncomeAmount) * 100,
          color: incomeColorScale(income.source)
        });
      });
      
      // Link from expenses category to expense subcategories
      expensesByCategory.forEach((categoryData, category) => {
        if (categoryData.totalAmount > 0) {
          const sourceIdx = nodeMap.get('Expenses') ?? 0;
          const targetIdx = nodeMap.get(category) ?? 0;
          
          links.push({
            source: sourceIdx,
            target: targetIdx,
            value: categoryData.totalAmount,
            sourceName: 'Expenses',
            targetName: category,
            sourceAmount: adjustedExpenses,
            targetAmount: categoryData.totalAmount,
            percentage: (categoryData.totalAmount / totalIncomeAmount) * 100,
            color: expenseColorScale('Expenses')
          });
        }
      });
    }
    
    // Create savings category links
    if (savingsAmount > 0) {
      // Link from income to savings category
      sortedIncomes.forEach(income => {
        const scaledAmount = scaleAmountByFrequency(income.amount, income.frequency);
        // For post-tax income, we don't need to subtract tax as it's already deducted
        const effectiveAmount = income.taxStatus === 'postTax' ? scaledAmount : scaledAmount * (1 - (taxAmount / totalIncomeAmount));
        const savingsPortion = (effectiveAmount / (totalIncomeAmount - taxAmount)) * savingsAmount;
        
        if (savingsPortion <= 0) return;
        
        const sourceIdx = nodeMap.get(income.source) ?? 0;
        const targetIdx = nodeMap.get('Savings') ?? 0;
        
        links.push({
          source: sourceIdx,
          target: targetIdx,
          value: savingsPortion,
          sourceName: income.source,
          targetName: 'Savings',
          sourceAmount: scaledAmount,
          targetAmount: savingsAmount,
          percentage: (savingsPortion / totalIncomeAmount) * 100,
          color: incomeColorScale(income.source)
        });
      });
      
      // Link from savings category to savings subcategories
      const savingsSubCategories = [
        { name: 'Investments', amount: savingsAmount * 0.4 },
        { name: 'Cash', amount: savingsAmount * 0.3 },
        { name: 'Retirement', amount: savingsAmount * 0.3 }
      ];
      
      savingsSubCategories.forEach(subCategory => {
        const sourceIdx = nodeMap.get('Savings') ?? 0;
        const targetIdx = nodeMap.get(subCategory.name) ?? 0;
        
        links.push({
          source: sourceIdx,
          target: targetIdx,
          value: subCategory.amount,
          sourceName: 'Savings',
          targetName: subCategory.name,
          sourceAmount: savingsAmount,
          targetAmount: subCategory.amount,
          percentage: (subCategory.amount / totalIncomeAmount) * 100,
          color: savingsColorScale('Savings')
        });
      });
    }
    
    return { nodes, links, nodeMap };
  }, [incomes, expenseSummary, totalIncome, taxAmount, savingsAmount, adjustedExpenses, displayPeriod, taxConfig]);

  // If no data, show a message
  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-[600px] text-muted-foreground">
        No financial data to visualize. Add income and expenses to see the flow diagram.
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden">
      <style jsx global>{`
        .sankey-node:hover {
          opacity: 0.8;
        }
        .sankey-link:hover {
          opacity: 0.5;
        }
      `}</style>
      
      <div className="mb-2 text-sm text-muted-foreground">
        Showing {displayPeriod} flow of funds
      </div>
      
      <ParentSize debounceTime={10}>
        {({ width }) => {
          // Set a minimum height
          const diagramHeight = 500;
          const margin = { top: 20, left: 20, right: 20, bottom: 20 };
          const innerWidth = width - margin.left - margin.right;
          const innerHeight = diagramHeight - margin.top - margin.bottom;
          
          // Create simple data object in format required by Sankey
          const sankeyData = {
            nodes: nodes.map(node => ({ 
              name: node.name 
            })),
            links: links.map(link => ({ 
              source: nodes[link.source]?.name || '',
              target: nodes[link.target]?.name || '',
              value: link.value
            }))
          };
          
          return (
            <>
              <svg width={width} height={diagramHeight}>
                <rect width={width} height={diagramHeight} fill="transparent" />
                <Group left={margin.left} top={margin.top}>
                  <Sankey
                    root={sankeyData}
                    size={[innerWidth, innerHeight]}
                    nodeWidth={40}
                    nodePadding={20}
                    nodeId={d => d.name}
                  >
                    {({ graph, createPath }) => {
                      if (!graph || !graph.links || !graph.nodes) {
                        return null;
                      }

                      return (
                        <Group>
                          {graph.links.map((link, i) => {
                            const linkColor = links[i]?.color || '#aaa';
                            
                            const sourceName = links[i]?.sourceName || '';
                            const targetName = links[i]?.targetName || '';
                            const percentage = links[i]?.percentage || 0;
                            const value = links[i]?.value || 0;
                            
                            return (
                              <Group key={`link-${i}`}>
                                <path
                                  d={createPath(link) || ''}
                                  fill="none"
                                  stroke={linkColor}
                                  strokeWidth={Math.max(2, link.width || 0)}
                                  strokeOpacity={0.6}
                                  onMouseEnter={(event: React.MouseEvent) => {
                                    showTooltip({
                                      tooltipData: {
                                        name: `${sourceName} → ${targetName}`,
                                        value,
                                        percentage,
                                        color: linkColor,
                                        type: 'link',
                                        sourceName,
                                        targetName
                                      },
                                      tooltipLeft: event.clientX,
                                      tooltipTop: event.clientY
                                    });
                                  }}
                                  onMouseLeave={() => hideTooltip()}
                                />
                              </Group>
                            );
                          })}
                          
                          {graph.nodes.map((node, i) => {
                            const name = nodes[i]?.name || '';
                            const color = nodes[i]?.color || '#333';
                            const amount = nodes[i]?.amount || 0;
                            const percentage = nodes[i]?.percentage || 0;
                            const type = nodes[i]?.type || '';
                            
                            // Height-based font size for better readability on small nodes
                            const nodeHeight = (node.y1 || 0) - (node.y0 || 0);
                            const fontSize = nodeHeight < 30 ? 8 : nodeHeight < 50 ? 10 : 11;
                            const valuesFontSize = fontSize - 2;
                            
                            return (
                              <Group key={`node-${i}`}>
                                <Bar
                                  x={node.x0 || 0}
                                  y={node.y0 || 0}
                                  width={(node.x1 || 0) - (node.x0 || 0)}
                                  height={(node.y1 || 0) - (node.y0 || 0)}
                                  fill={color}
                                  rx={4}
                                  className="sankey-node"
                                  onMouseEnter={(event: React.MouseEvent) => {
                                    showTooltip({
                                      tooltipData: {
                                        name,
                                        value: amount,
                                        percentage,
                                        color,
                                        type
                                      },
                                      tooltipLeft: event.clientX,
                                      tooltipTop: event.clientY
                                    });
                                  }}
                                  onMouseLeave={() => hideTooltip()}
                                />
                                
                                {/* Add text labels */}
                                <Text
                                  x={(node.x0 || 0) + ((node.x1 || 0) - (node.x0 || 0)) / 2}
                                  y={(node.y0 || 0) + ((node.y1 || 0) - (node.y0 || 0)) / 2 - 8}
                                  width={Math.min(100, (node.x1 || 0) - (node.x0 || 0) - 4)}
                                  textAnchor="middle"
                                  verticalAnchor="middle"
                                  fill="white"
                                  fontSize={fontSize}
                                  fontWeight="bold"
                                  style={{ wordWrap: 'break-word', whiteSpace: 'normal' }}
                                >
                                  {name.length > 12 ? `${name.substring(0, 10)}...` : name}
                                </Text>
                                <Text
                                  x={(node.x0 || 0) + ((node.x1 || 0) - (node.x0 || 0)) / 2}
                                  y={(node.y0 || 0) + ((node.y1 || 0) - (node.y0 || 0)) / 2 + 8}
                                  width={(node.x1 || 0) - (node.x0 || 0)}
                                  textAnchor="middle"
                                  verticalAnchor="middle"
                                  fill="white"
                                  fontSize={valuesFontSize}
                                >
                                  {formatCurrency(amount)}
                                </Text>
                                {nodeHeight > 40 && (
                                  <Text
                                    x={(node.x0 || 0) + ((node.x1 || 0) - (node.x0 || 0)) / 2}
                                    y={(node.y0 || 0) + ((node.y1 || 0) - (node.y0 || 0)) / 2 + 22}
                                    width={(node.x1 || 0) - (node.x0 || 0)}
                                    textAnchor="middle"
                                    verticalAnchor="middle"
                                    fill="white"
                                    fontSize={valuesFontSize - 1}
                                  >
                                    {displayPeriod === 'annually' ? 'per year' : 
                                     displayPeriod === 'monthly' ? 'per month' : 
                                     displayPeriod === 'fortnightly' ? 'per fortnight' : 
                                     'per week'}
                                  </Text>
                                )}
                              </Group>
                            );
                          })}
                        </Group>
                      );
                    }}
                  </Sankey>
                </Group>
              </svg>
              
              {tooltipOpen && tooltipData && (
                <div
                  style={{
                    ...defaultStyles,
                    position: 'absolute',
                    top: tooltipTop,
                    left: tooltipLeft,
                    backgroundColor: 'var(--background)',
                    color: 'var(--foreground)',
                    border: '1px solid var(--border)',
                    borderRadius: '0.375rem',
                    padding: '0.5rem',
                    fontSize: '0.75rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                  }}
                >
                  <div style={{ fontWeight: 'bold' }}>{tooltipData.name}</div>
                  <div style={{ color: tooltipData.color }}>
                    {formatCurrency(tooltipData.value)} 
                    <span className="text-muted-foreground text-xs ml-1">
                      {displayPeriod === 'annually' ? 'per year' : 
                       displayPeriod === 'monthly' ? 'per month' : 
                       displayPeriod === 'fortnightly' ? 'per fortnight' : 
                       'per week'}
                    </span>
                    <span className="ml-1">({formatPercentage(tooltipData.percentage)})</span>
                  </div>
                  {tooltipData.type === 'link' && tooltipData.sourceName && tooltipData.targetName && (
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '0.7rem', marginTop: '0.25rem' }}>
                      {formatPercentage(tooltipData.percentage)} of total income flows from {tooltipData.sourceName} to {tooltipData.targetName}
                    </div>
                  )}
                  {tooltipData.type === 'expense-subcategory' && (
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '0.7rem', marginTop: '0.25rem' }}>
                      This represents all {tooltipData.name} expenses calculated on a {displayPeriod} basis
                    </div>
                  )}
                </div>
              )}
            </>
          );
        }}
      </ParentSize>
      <div className="text-xs text-muted-foreground mt-2">
        The flow diagram shows how income is distributed across expenses, taxes, and savings on a {displayPeriod} basis.
      </div>
    </div>
  );
} 