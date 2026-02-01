import { test as base, expect } from '@playwright/test';

/**
 * Extended test fixture with common utilities for PFinance E2E tests
 */

// User credentials for testing
export const testUser = {
  email: 'test@example.com',
  password: 'testPassword123!',
  uid: 'test-user-id',
};

// Test data factories
export const testData = {
  expense: {
    description: 'Test Expense',
    amount: 100.00,
    category: 'Food',
  },
  income: {
    description: 'Test Income',
    amount: 5000.00,
    source: 'Salary',
  },
  group: {
    name: 'Test Group',
    description: 'A test group for E2E testing',
  },
};

// Extended test fixture
export const test = base.extend<{
  // Add custom fixtures here
}>({
  // Custom fixtures can be added here
});

// Page Object Models
export class DashboardPage {
  constructor(private page: import('@playwright/test').Page) {}

  async goto() {
    await this.page.goto('/');
  }

  async expectLoaded() {
    // Wait for the dashboard to load
    await expect(this.page).toHaveURL('/');
  }
}

export class ExpensesPage {
  constructor(private page: import('@playwright/test').Page) {}

  async goto() {
    await this.page.goto('/personal/expenses');
  }

  async addExpense(description: string, amount: number, category: string) {
    // Fill expense form
    await this.page.getByLabel(/description/i).fill(description);
    await this.page.getByLabel(/amount/i).fill(amount.toString());
    await this.page.getByLabel(/category/i).selectOption(category);
    await this.page.getByRole('button', { name: /add expense/i }).click();
  }

  async expectExpenseVisible(description: string) {
    await expect(this.page.getByText(description)).toBeVisible();
  }
}

export class IncomePage {
  constructor(private page: import('@playwright/test').Page) {}

  async goto() {
    await this.page.goto('/personal/income');
  }
}

export class BudgetsPage {
  constructor(private page: import('@playwright/test').Page) {}

  async goto() {
    await this.page.goto('/personal/budgets');
  }
}

export class GroupsPage {
  constructor(private page: import('@playwright/test').Page) {}

  async goto() {
    await this.page.goto('/groups');
  }
}

export { expect };
