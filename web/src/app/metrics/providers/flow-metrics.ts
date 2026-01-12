/**
 * Flow Metrics Provider
 * 
 * Provides computation functions for flow diagram data:
 * - Sankey diagram nodes and links
 * - Income allocation visualization
 * - Cash flow analysis
 */

import { 
  Income, 
  Expense, 
  ExpenseCategory,
  IncomeFrequency,
  TaxConfig
} from '../../types';
import {
  SankeyNode,
  SankeyLink,
  SankeyDiagramData,
  FinanceMetrics,
} from '../types';
import { toAnnual, fromAnnual, getPeriodLabel } from '../utils/period';
import { formatCurrency, getCurrencyForCountry } from '../utils/currency';
import { 
  getCategoryColor, 
  getIncomeColor, 
  TAX_COLOR,
  EXPENSE_FLOW_COLORS,
  SAVINGS_COLORS,
} from '../utils/colors';

/**
 * Input for flow metrics computation
 */
export interface FlowMetricsInput {
  incomes: Income[];
  expenses: Expense[];
  taxConfig: TaxConfig;
  /** Pre-computed finance metrics for efficiency */
  financeMetrics?: FinanceMetrics;
}

/**
 * Options for flow metrics computation
 */
export interface FlowMetricsOptions {
  displayPeriod: IncomeFrequency;
  currency?: string;
  /** Include savings sub-categories */
  includeSavingsBreakdown?: boolean;
  /** Maximum expense categories to show */
  maxExpenseCategories?: number;
}

/**
 * Standard expense categories
 */
const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Food', 'Housing', 'Transportation', 'Entertainment', 
  'Healthcare', 'Utilities', 'Shopping', 'Education', 'Travel', 'Other'
];

/**
 * Savings sub-categories for visualization
 */
const SAVINGS_SUB_CATEGORIES = [
  { name: 'Investments', percentage: 0.4, color: SAVINGS_COLORS.investments },
  { name: 'Cash', percentage: 0.3, color: SAVINGS_COLORS.cash },
  { name: 'Retirement', percentage: 0.3, color: SAVINGS_COLORS.retirement },
];

/**
 * Compute Sankey diagram data
 */
export function computeSankeyDiagramData(
  input: FlowMetricsInput,
  options: FlowMetricsOptions
): SankeyDiagramData {
  const { incomes, expenses, taxConfig } = input;
  const { displayPeriod, includeSavingsBreakdown = true, maxExpenseCategories = 10 } = options;
  const currency = options.currency ?? getCurrencyForCountry(taxConfig.country);

  // Calculate totals
  const totalAnnualIncome = incomes.reduce(
    (sum, income) => sum + toAnnual(income.amount, income.frequency),
    0
  );
  
  const totalAnnualExpenses = expenses.reduce(
    (sum, expense) => sum + toAnnual(expense.amount, expense.frequency),
    0
  );

  // Calculate pre-tax income for tax calculation
  const preTaxAnnualIncome = incomes
    .filter(i => i.taxStatus === 'preTax')
    .reduce((sum, i) => sum + toAnnual(i.amount, i.frequency), 0);

  // Calculate tax
  let totalTax = 0;
  if (taxConfig.enabled && preTaxAnnualIncome > 0) {
    if (taxConfig.country === 'simple') {
      totalTax = (preTaxAnnualIncome * taxConfig.taxRate) / 100;
    } else {
      // Import tax calculation
      const { getTaxSystem, calculateTaxWithBrackets } = require('../../constants/taxSystems');
      const taxSystem = getTaxSystem(taxConfig.country);
      const brackets = taxConfig.customBrackets ?? taxSystem.brackets;
      totalTax = calculateTaxWithBrackets(preTaxAnnualIncome, brackets);
    }
  }

  // Calculate net income and savings
  const netIncome = totalAnnualIncome - totalTax;
  const savingsAmount = netIncome - totalAnnualExpenses;

  // Convert to display period
  const convertToDisplay = (annual: number) => fromAnnual(annual, displayPeriod);
  const formatAmount = (amount: number) => formatCurrency(amount, currency);

  // Build nodes
  const nodes: SankeyNode[] = [];
  const nodeMap = new Map<string, number>();

  // Helper to add a node
  const addNode = (
    id: string,
    name: string,
    type: SankeyNode['type'],
    annualAmount: number,
    color: string
  ) => {
    const displayAmount = convertToDisplay(annualAmount);
    nodes.push({
      id,
      name,
      type,
      amount: displayAmount,
      percentage: totalAnnualIncome > 0 ? (annualAmount / totalAnnualIncome) * 100 : 0,
      color,
      formattedAmount: formatAmount(displayAmount),
    });
    nodeMap.set(id, nodes.length - 1);
  };

  // Add income nodes
  const sortedIncomes = [...incomes].sort(
    (a, b) => toAnnual(b.amount, b.frequency) - toAnnual(a.amount, a.frequency)
  );

  sortedIncomes.forEach((income, index) => {
    const annualAmount = toAnnual(income.amount, income.frequency);
    addNode(
      `income-${income.id}`,
      income.source,
      'income',
      annualAmount,
      getIncomeColor(index)
    );
  });

  // Add tax node if applicable
  if (taxConfig.enabled && totalTax > 0) {
    addNode('tax', 'Tax', 'tax', totalTax, TAX_COLOR);
  }

  // Add expenses category node
  if (totalAnnualExpenses > 0) {
    addNode(
      'expenses',
      'Expenses',
      'expense-category',
      totalAnnualExpenses,
      EXPENSE_FLOW_COLORS.category
    );

    // Group expenses by category
    const expensesByCategory = new Map<ExpenseCategory, number>();
    expenses.forEach(expense => {
      const annualAmount = toAnnual(expense.amount, expense.frequency);
      const existing = expensesByCategory.get(expense.category) ?? 0;
      expensesByCategory.set(expense.category, existing + annualAmount);
    });

    // Add expense sub-category nodes
    const sortedCategories = Array.from(expensesByCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxExpenseCategories);

    sortedCategories.forEach(([category, annualAmount]) => {
      if (annualAmount > 0) {
        addNode(
          `expense-${category}`,
          category,
          'expense-subcategory',
          annualAmount,
          getCategoryColor(category)
        );
      }
    });
  }

  // Add savings category node
  if (savingsAmount > 0) {
    addNode(
      'savings',
      'Savings',
      'savings-category',
      savingsAmount,
      SAVINGS_COLORS.category
    );

    // Add savings sub-categories if enabled
    if (includeSavingsBreakdown) {
      SAVINGS_SUB_CATEGORIES.forEach(subCat => {
        const subAmount = savingsAmount * subCat.percentage;
        addNode(
          `savings-${subCat.name.toLowerCase()}`,
          subCat.name,
          'savings-subcategory',
          subAmount,
          subCat.color
        );
      });
    }
  }

  // Build links
  const links: SankeyLink[] = [];

  // Helper to add a link
  const addLink = (
    sourceId: string,
    targetId: string,
    annualValue: number,
    color: string
  ) => {
    const displayValue = convertToDisplay(annualValue);
    if (displayValue <= 0) return;

    const sourceNode = nodes.find(n => n.id === sourceId);
    const targetNode = nodes.find(n => n.id === targetId);

    links.push({
      source: sourceId,
      target: targetId,
      value: displayValue,
      percentage: totalAnnualIncome > 0 ? (annualValue / totalAnnualIncome) * 100 : 0,
      color,
      sourceName: sourceNode?.name ?? sourceId,
      targetName: targetNode?.name ?? targetId,
    });
  };

  // Create income -> tax links (only for pre-tax income)
  if (taxConfig.enabled && totalTax > 0) {
    sortedIncomes.forEach((income, index) => {
      if (income.taxStatus === 'postTax') return;

      const incomeAnnual = toAnnual(income.amount, income.frequency);
      const taxPortion = preTaxAnnualIncome > 0
        ? (incomeAnnual / preTaxAnnualIncome) * totalTax
        : 0;

      if (taxPortion > 0) {
        addLink(
          `income-${income.id}`,
          'tax',
          taxPortion,
          getIncomeColor(index)
        );
      }
    });
  }

  // Calculate after-tax income for each source
  const afterTaxIncomes = sortedIncomes.map((income, index) => {
    const incomeAnnual = toAnnual(income.amount, income.frequency);
    let afterTax = incomeAnnual;
    
    if (income.taxStatus === 'preTax' && taxConfig.enabled && preTaxAnnualIncome > 0) {
      const taxPortion = (incomeAnnual / preTaxAnnualIncome) * totalTax;
      afterTax = incomeAnnual - taxPortion;
    }
    
    return { income, afterTax, index };
  });

  const totalAfterTax = afterTaxIncomes.reduce((sum, { afterTax }) => sum + afterTax, 0);

  // Create income -> expenses links
  if (totalAnnualExpenses > 0 && totalAfterTax > 0) {
    afterTaxIncomes.forEach(({ income, afterTax, index }) => {
      const expensesPortion = (afterTax / totalAfterTax) * totalAnnualExpenses;
      
      if (expensesPortion > 0) {
        addLink(
          `income-${income.id}`,
          'expenses',
          expensesPortion,
          getIncomeColor(index)
        );
      }
    });

    // Create expenses -> expense subcategory links
    const expensesByCategory = new Map<ExpenseCategory, number>();
    expenses.forEach(expense => {
      const annualAmount = toAnnual(expense.amount, expense.frequency);
      const existing = expensesByCategory.get(expense.category) ?? 0;
      expensesByCategory.set(expense.category, existing + annualAmount);
    });

    expensesByCategory.forEach((annualAmount, category) => {
      if (annualAmount > 0 && nodeMap.has(`expense-${category}`)) {
        addLink(
          'expenses',
          `expense-${category}`,
          annualAmount,
          EXPENSE_FLOW_COLORS.category
        );
      }
    });
  }

  // Create income -> savings links
  if (savingsAmount > 0 && totalAfterTax > 0) {
    afterTaxIncomes.forEach(({ income, afterTax, index }) => {
      const savingsPortion = (afterTax / totalAfterTax) * savingsAmount;
      
      if (savingsPortion > 0) {
        addLink(
          `income-${income.id}`,
          'savings',
          savingsPortion,
          getIncomeColor(index)
        );
      }
    });

    // Create savings -> savings subcategory links
    if (includeSavingsBreakdown) {
      SAVINGS_SUB_CATEGORIES.forEach(subCat => {
        const subAmount = savingsAmount * subCat.percentage;
        addLink(
          'savings',
          `savings-${subCat.name.toLowerCase()}`,
          subAmount,
          SAVINGS_COLORS.category
        );
      });
    }
  }

  return {
    nodes,
    links,
    periodLabel: getPeriodLabel(displayPeriod),
  };
}

/**
 * Get nodes by type
 */
export function getNodesByType(
  sankeyData: SankeyDiagramData,
  type: SankeyNode['type']
): SankeyNode[] {
  return sankeyData.nodes.filter(node => node.type === type);
}

/**
 * Get links for a specific node
 */
export function getLinksForNode(
  sankeyData: SankeyDiagramData,
  nodeId: string,
  direction: 'incoming' | 'outgoing' | 'both' = 'both'
): SankeyLink[] {
  return sankeyData.links.filter(link => {
    if (direction === 'incoming') return link.target === nodeId;
    if (direction === 'outgoing') return link.source === nodeId;
    return link.source === nodeId || link.target === nodeId;
  });
}

/**
 * Calculate flow through a specific node
 */
export function calculateNodeFlow(
  sankeyData: SankeyDiagramData,
  nodeId: string
): { incoming: number; outgoing: number; net: number } {
  const incoming = sankeyData.links
    .filter(link => link.target === nodeId)
    .reduce((sum, link) => sum + link.value, 0);
  
  const outgoing = sankeyData.links
    .filter(link => link.source === nodeId)
    .reduce((sum, link) => sum + link.value, 0);

  return {
    incoming,
    outgoing,
    net: incoming - outgoing,
  };
}
