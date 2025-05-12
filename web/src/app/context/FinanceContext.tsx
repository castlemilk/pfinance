'use client';

import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { 
  Expense, 
  ExpenseCategory, 
  ExpenseSummary, 
  Income, 
  IncomeFrequency, 
  TaxConfig,
  TaxStatus,
  Deduction
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import { getTaxSystem, calculateTaxWithBrackets } from '../constants/taxSystems';

// Interface for serialized data from localStorage
interface SerializedExpense {
  id: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  frequency: IncomeFrequency;
  date: string; // Date is stored as string in JSON
}

interface SerializedIncome {
  id: string;
  source: string;
  amount: number;
  frequency: IncomeFrequency;
  taxStatus: TaxStatus;
  deductions?: Deduction[];
  date: string; // Date is stored as string in JSON
}

interface FinanceContextType {
  // Expense related methods
  expenses: Expense[];
  addExpense: (description: string, amount: number, category: ExpenseCategory, frequency?: IncomeFrequency) => void;
  addExpenses: (newExpenses: Array<{description: string, amount: number, category: ExpenseCategory, frequency?: IncomeFrequency}>) => void;
  updateExpense: (id: string, description: string, amount: number, category: ExpenseCategory, frequency: IncomeFrequency) => void;
  deleteExpense: (id: string) => void;
  deleteExpenses: (ids: string[]) => void;
  getExpenseSummary: () => ExpenseSummary[];
  getTotalExpenses: () => number;
  
  // Income related methods
  incomes: Income[];
  addIncome: (source: string, amount: number, frequency: IncomeFrequency, taxStatus: TaxStatus, deductions?: Deduction[]) => void;
  updateIncome: (id: string, source: string, amount: number, frequency: IncomeFrequency, taxStatus: TaxStatus, deductions?: Deduction[]) => void;
  deleteIncome: (id: string) => void;
  getTotalIncome: (period?: IncomeFrequency) => number;
  getNetIncome: (period?: IncomeFrequency) => number;
  
  // Tax related methods
  taxConfig: TaxConfig;
  updateTaxConfig: (config: Partial<TaxConfig>) => void;
  calculateTax: (amount: number) => number;
}

const defaultTaxConfig: TaxConfig = {
  enabled: true,
  country: 'simple',
  taxRate: 20,
  includeDeductions: true
};

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [taxConfig, setTaxConfig] = useState<TaxConfig>(defaultTaxConfig);

  // Load data from local storage on component mount
  useEffect(() => {
    // Load expenses
    const savedExpenses = localStorage.getItem('expenses');
    if (savedExpenses) {
      try {
        const parsedExpenses = JSON.parse(savedExpenses) as SerializedExpense[];
        const expensesWithDateObjects = parsedExpenses.map((expense: SerializedExpense) => ({
          ...expense,
          date: new Date(expense.date)
        }));
        setExpenses(expensesWithDateObjects);
      } catch (error) {
        console.error('Failed to parse expenses from localStorage:', error);
      }
    }

    // Load incomes
    const savedIncomes = localStorage.getItem('incomes');
    if (savedIncomes) {
      try {
        const parsedIncomes = JSON.parse(savedIncomes) as SerializedIncome[];
        const incomesWithDateObjects = parsedIncomes.map((income: SerializedIncome) => ({
          ...income,
          date: new Date(income.date)
        }));
        setIncomes(incomesWithDateObjects);
      } catch (error) {
        console.error('Failed to parse incomes from localStorage:', error);
      }
    }

    // Load tax configuration
    const savedTaxConfig = localStorage.getItem('taxConfig');
    if (savedTaxConfig) {
      try {
        const parsedTaxConfig = JSON.parse(savedTaxConfig) as TaxConfig;
        setTaxConfig(parsedTaxConfig);
      } catch (error) {
        console.error('Failed to parse tax config from localStorage:', error);
      }
    }
  }, []);

  // Save expenses to local storage whenever they change
  useEffect(() => {
    localStorage.setItem('expenses', JSON.stringify(expenses));
  }, [expenses]);

  // Save incomes to local storage whenever they change
  useEffect(() => {
    localStorage.setItem('incomes', JSON.stringify(incomes));
  }, [incomes]);

  // Save tax config to local storage whenever it changes
  useEffect(() => {
    localStorage.setItem('taxConfig', JSON.stringify(taxConfig));
  }, [taxConfig]);

  // Expense related methods
  const addExpense = (description: string, amount: number, category: ExpenseCategory, frequency: IncomeFrequency = 'monthly') => {
    console.log('FinanceContext: Adding single expense:', description, amount, category);
    const newExpense: Expense = {
      id: uuidv4(),
      description,
      amount,
      category,
      frequency,
      date: new Date(),
    };
    setExpenses(prevExpenses => [...prevExpenses, newExpense]);
  };

  // Batch add multiple expenses at once to avoid race conditions
  const addExpenses = (newExpenses: Array<{description: string, amount: number, category: ExpenseCategory, frequency?: IncomeFrequency}>) => {
    console.log('FinanceContext: Adding batch of expenses:', newExpenses.length);
    
    setExpenses(prevExpenses => {
      const expensesToAdd = newExpenses.map(exp => ({
        id: uuidv4(),
        description: exp.description,
        amount: exp.amount,
        category: exp.category,
        frequency: exp.frequency || 'monthly',
        date: new Date()
      }));
      
      return [...prevExpenses, ...expensesToAdd];
    });
    
    console.log('FinanceContext: Batch add completed');
  };

  const updateExpense = (id: string, description: string, amount: number, category: ExpenseCategory, frequency: IncomeFrequency) => {
    setExpenses(prevExpenses => 
      prevExpenses.map(expense => 
        expense.id === id 
          ? { ...expense, description, amount, category, frequency }
          : expense
      )
    );
  };

  const deleteExpense = (id: string) => {
    setExpenses(prevExpenses => prevExpenses.filter(expense => expense.id !== id));
  };

  const deleteExpenses = (ids: string[]) => {
    setExpenses(prevExpenses => prevExpenses.filter(expense => !ids.includes(expense.id)));
  };

  const getTotalExpenses = () => {
    return expenses.reduce((total, expense) => {
      // Convert to annual amount based on frequency
      const annualAmount = 
        expense.frequency === 'weekly' ? expense.amount * 52 :
        expense.frequency === 'fortnightly' ? expense.amount * 26 :
        expense.frequency === 'monthly' ? expense.amount * 12 :
        expense.amount;
      
      return total + annualAmount;
    }, 0);
  };

  const getExpenseSummary = (): ExpenseSummary[] => {
    const totalAmount = getTotalExpenses();
    
    // Group expenses by category, converting to annual amounts
    const categorySums = expenses.reduce((acc, expense) => {
      // Convert to annual amount based on frequency
      const annualAmount = 
        expense.frequency === 'weekly' ? expense.amount * 52 :
        expense.frequency === 'fortnightly' ? expense.amount * 26 :
        expense.frequency === 'monthly' ? expense.amount * 12 :
        expense.amount;
      
      acc[expense.category] = (acc[expense.category] || 0) + annualAmount;
      return acc;
    }, {} as Record<ExpenseCategory, number>);
    
    // Convert to array of ExpenseSummary objects
    return Object.entries(categorySums).map(([category, amount]) => ({
      category: category as ExpenseCategory,
      totalAmount: amount,
      percentage: totalAmount > 0 ? (amount / totalAmount) * 100 : 0,
    }));
  };

  // Income related methods
  const addIncome = (
    source: string, 
    amount: number, 
    frequency: IncomeFrequency, 
    taxStatus: TaxStatus, 
    deductions?: Deduction[]
  ) => {
    const newIncome: Income = {
      id: uuidv4(),
      source,
      amount,
      frequency,
      taxStatus,
      deductions,
      date: new Date(),
    };
    setIncomes([...incomes, newIncome]);
  };

  const updateIncome = (id: string, source: string, amount: number, frequency: IncomeFrequency, taxStatus: TaxStatus, deductions?: Deduction[]) => {
    setIncomes(prevIncomes => 
      prevIncomes.map(income => 
        income.id === id 
          ? { ...income, source, amount, frequency, taxStatus, deductions }
          : income
      )
    );
  };

  const deleteIncome = (id: string) => {
    setIncomes(incomes.filter(income => income.id !== id));
  };

  // Convert income amount to annual equivalent based on frequency
  const annualizeIncome = (income: Income): number => {
    switch (income.frequency) {
      case 'weekly':
        return income.amount * 52;
      case 'fortnightly':
        return income.amount * 26;
      case 'monthly':
        return income.amount * 12;
      case 'annually':
        return income.amount;
      default:
        return income.amount;
    }
  };

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

  // Calculate total income for a given period
  const getTotalIncome = (period: IncomeFrequency = 'annually'): number => {
    const annualTotal = incomes.reduce((total, income) => {
      return total + annualizeIncome(income);
    }, 0);
    
    return convertAmountToFrequency(annualTotal, period);
  };

  // Tax calculation methods
  const updateTaxConfig = (config: Partial<TaxConfig>) => {
    console.log("Updating tax config:", config);
    setTaxConfig(prevConfig => {
      const newConfig = {
        ...prevConfig,
        ...config
      };
      // Save to localStorage immediately
      localStorage.setItem('taxConfig', JSON.stringify(newConfig));
      return newConfig;
    });
  };

  const calculateTax = (amount: number): number => {
    // If tax is disabled or the amount is zero or negative, return zero tax
    if (!taxConfig.enabled || amount <= 0) return 0;
    
    // Use the simple flat rate calculation for backward compatibility
    if (taxConfig.country === 'simple') {
      return (amount * taxConfig.taxRate) / 100;
    }
    
    // Use progressive tax brackets for country-specific systems
    const taxSystem = getTaxSystem(taxConfig.country);
    
    // Use custom brackets if provided, otherwise use the country's standard brackets
    const brackets = taxConfig.customBrackets || taxSystem.brackets;
    
    return calculateTaxWithBrackets(amount, brackets);
  };

  // Calculate net income after tax for a given period
  const getNetIncome = (period: IncomeFrequency = 'annually'): number => {
    const totalIncome = getTotalIncome(period);
    
    // If tax is disabled, simply return the total income without any tax calculation
    if (!taxConfig.enabled) return totalIncome;
    
    // For progressive tax systems, we need to annualize the income
    // because tax brackets are defined for annual income
    let annualIncome: number;
    if (period === 'annually') {
      annualIncome = totalIncome;
    } else if (period === 'monthly') {
      annualIncome = totalIncome * 12;
    } else if (period === 'fortnightly') {
      annualIncome = totalIncome * 26;
    } else { // weekly
      annualIncome = totalIncome * 52;
    }
    
    // Calculate total tax deductible amount
    let annualTaxableIncome = annualIncome;
    
    if (taxConfig.includeDeductions) {
      const deductibleAmount = incomes.reduce((total, income) => {
        if (!income.deductions) return total;
        
        const annualDeductions = income.deductions
          .filter(d => d.isTaxDeductible)
          .reduce((sum, d) => sum + d.amount, 0);
        
        // Convert deductions to annual if needed
        let annualDeductionsTotal;
        if (income.frequency === 'annually') {
          annualDeductionsTotal = annualDeductions;
        } else if (income.frequency === 'monthly') {
          annualDeductionsTotal = annualDeductions * 12;
        } else if (income.frequency === 'fortnightly') {
          annualDeductionsTotal = annualDeductions * 26;
        } else { // weekly
          annualDeductionsTotal = annualDeductions * 52;
        }
        
        return total + annualDeductionsTotal;
      }, 0);
      
      annualTaxableIncome = Math.max(0, annualIncome - deductibleAmount);
    }
    
    // Calculate tax based on annual amount
    const annualTax = calculateTax(annualTaxableIncome);
    
    // Convert annual tax back to requested period
    let periodTax;
    if (period === 'annually') {
      periodTax = annualTax;
    } else if (period === 'monthly') {
      periodTax = annualTax / 12;
    } else if (period === 'fortnightly') {
      periodTax = annualTax / 26;
    } else { // weekly
      periodTax = annualTax / 52;
    }
    
    // Debug: Log the tax calculation details
    console.log("Tax calculation:", {
      country: taxConfig.country,
      period,
      totalIncome,
      annualIncome,
      annualTaxableIncome,
      annualTax,
      periodTax,
      effectiveRate: annualIncome > 0 ? (annualTax / annualIncome) * 100 : 0
    });
    
    return totalIncome - periodTax;
  };

  return (
    <FinanceContext.Provider value={{ 
      // Expense methods
      expenses, 
      addExpense, 
      addExpenses,
      updateExpense,
      deleteExpense,
      deleteExpenses,
      getExpenseSummary,
      getTotalExpenses,
      
      // Income methods
      incomes,
      addIncome,
      updateIncome,
      deleteIncome,
      getTotalIncome,
      getNetIncome,
      
      // Tax methods
      taxConfig,
      updateTaxConfig,
      calculateTax
    }}>
      {children}
    </FinanceContext.Provider>
  );
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (context === undefined) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return context;
} 