'use client';

import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Expense, ExpenseCategory, ExpenseSummary, ExpenseFrequency } from '../types';
import { v4 as uuidv4 } from 'uuid';

// Interface for serialized expenses from localStorage
interface SerializedExpense {
  id: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: string; // Date is stored as string in JSON
  frequency?: ExpenseFrequency; // Add frequency property
}

interface ExpenseContextType {
  expenses: Expense[];
  addExpense: (description: string, amount: number, category: ExpenseCategory, frequency?: ExpenseFrequency) => void;
  deleteExpense: (id: string) => void;
  getExpenseSummary: () => ExpenseSummary[];
  getTotalExpenses: () => number;
}

const ExpenseContext = createContext<ExpenseContextType | undefined>(undefined);

export function ExpenseProvider({ children }: { children: ReactNode }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // Load expenses from local storage on component mount
  useEffect(() => {
    const savedExpenses = localStorage.getItem('expenses');
    if (savedExpenses) {
      try {
        const parsedExpenses = JSON.parse(savedExpenses) as SerializedExpense[];
        // Convert string dates back to Date objects
        const expensesWithDateObjects = parsedExpenses.map((expense: SerializedExpense) => ({
          ...expense,
          date: new Date(expense.date),
          frequency: expense.frequency || 'monthly' // Default to monthly if not specified
        }));
        setExpenses(expensesWithDateObjects);
      } catch (error) {
        console.error('Failed to parse expenses from localStorage:', error);
      }
    }
  }, []);

  // Save expenses to local storage whenever they change
  useEffect(() => {
    localStorage.setItem('expenses', JSON.stringify(expenses));
  }, [expenses]);

  const addExpense = (description: string, amount: number, category: ExpenseCategory, frequency: ExpenseFrequency = 'monthly') => {
    const newExpense: Expense = {
      id: uuidv4(),
      description,
      amount,
      category,
      date: new Date(),
      frequency,
    };
    setExpenses([...expenses, newExpense]);
  };

  const deleteExpense = (id: string) => {
    setExpenses(expenses.filter(expense => expense.id !== id));
  };

  const getTotalExpenses = () => {
    return expenses.reduce((total, expense) => total + expense.amount, 0);
  };

  const getExpenseSummary = (): ExpenseSummary[] => {
    const totalAmount = getTotalExpenses();
    
    // Group expenses by category
    const categorySums = expenses.reduce((acc, expense) => {
      acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
      return acc;
    }, {} as Record<ExpenseCategory, number>);
    
    // Convert to array of ExpenseSummary objects
    return Object.entries(categorySums).map(([category, amount]) => ({
      category: category as ExpenseCategory,
      totalAmount: amount as number,
      percentage: totalAmount > 0 ? ((amount as number) / totalAmount) * 100 : 0,
    }));
  };

  return (
    <ExpenseContext.Provider value={{ 
      expenses, 
      addExpense, 
      deleteExpense, 
      getExpenseSummary,
      getTotalExpenses
    }}>
      {children}
    </ExpenseContext.Provider>
  );
}

export function useExpenses() {
  const context = useContext(ExpenseContext);
  if (context === undefined) {
    throw new Error('useExpenses must be used within an ExpenseProvider');
  }
  return context;
} 