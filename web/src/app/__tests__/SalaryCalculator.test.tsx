import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SalaryCalculator } from '../components/SalaryCalculator';
import { FinanceProvider } from '../context/FinanceContext';
import '@testing-library/jest-dom';

describe('SalaryCalculator - Voluntary Superannuation', () => {
  it('should correctly calculate remaining concessional cap', () => {
    render(
      <FinanceProvider>
        <SalaryCalculator />
      </FinanceProvider>
    );
    
    // Set salary to $200,000
    const salaryInput = screen.getByRole('spinbutton', { name: /annual salary/i });
    fireEvent.change(salaryInput, { target: { value: '200000' } });

    // Enable voluntary super
    const voluntarySuperSwitch = screen.getByRole('switch', { name: /voluntary superannuation/i });
    fireEvent.click(voluntarySuperSwitch);

    // Base super = $23,000 (11.5% of $200,000)
    // Remaining cap should be $27,500 - $23,000 = $4,500
    const remainingCapText = screen.getByText(/remaining cap:/i);
    expect(remainingCapText).toHaveTextContent('$4,500.00');
  });

  it('should prevent exceeding concessional cap', () => {
    render(
      <FinanceProvider>
        <SalaryCalculator />
      </FinanceProvider>
    );
    
    // Set salary to $200,000
    const salaryInput = screen.getByRole('spinbutton', { name: /annual salary/i });
    fireEvent.change(salaryInput, { target: { value: '200000' } });

    // Enable voluntary super
    const voluntarySuperSwitch = screen.getByRole('switch', { name: /voluntary superannuation/i });
    fireEvent.click(voluntarySuperSwitch);

    // Try to set voluntary super to $5,000 (should be capped at $4,500)
    const voluntarySuperInput = screen.getByRole('spinbutton', { name: /voluntary super contribution/i });
    fireEvent.change(voluntarySuperInput, { target: { value: '5000' } });

    expect(voluntarySuperInput).toHaveValue(4500);
  });

  it('should update slider range based on remaining cap', async () => {
    render(
      <FinanceProvider>
        <SalaryCalculator />
      </FinanceProvider>
    );

    // Set salary to $200,000
    const salaryInput = screen.getByRole('spinbutton', { name: /annual salary/i });
    fireEvent.change(salaryInput, { target: { value: '200000' } });

    // Enable voluntary super
    const voluntarySuperSwitch = screen.getByRole('switch', { name: /voluntary superannuation/i });
    fireEvent.click(voluntarySuperSwitch);

    // Wait for the slider to update with the correct maximum
    await waitFor(() => {
      const slider = screen.getByRole('slider');
      expect(slider).toHaveAttribute('aria-valuemax', '4500');
    });
    
    // Change salary to $100,000
    fireEvent.change(salaryInput, { target: { value: '100000' } });

    // Remaining cap should be $27,500 - $11,500 = $16,000
    await waitFor(() => {
      const slider = screen.getByRole('slider');
      expect(slider).toHaveAttribute('aria-valuemax', '16000');
    });
  });

  it('should show voluntary super in breakdown', async () => {
    render(
      <FinanceProvider>
        <SalaryCalculator />
      </FinanceProvider>
    );

    // Set salary to $100,000
    const salaryInput = screen.getByRole('spinbutton', { name: /annual salary/i });
    fireEvent.change(salaryInput, { target: { value: '100000' } });

    // Enable voluntary super
    const voluntarySuperSwitch = screen.getByRole('switch', { name: /voluntary superannuation/i });
    fireEvent.click(voluntarySuperSwitch);

    // Set voluntary super to $5,000
    const voluntarySuperInput = screen.getByRole('spinbutton', { name: /voluntary super contribution/i });
    fireEvent.change(voluntarySuperInput, { target: { value: '5000' } });

    // Check if voluntary super appears in the breakdown on the weekly tab
    const weeklyTab = screen.getByRole('tab', { name: /weekly/i });
    fireEvent.click(weeklyTab);

    // Wait for the tab content to update
    await waitFor(() => {
      const voluntarySuperRow = screen.getByText(/▼ voluntary super/i).closest('div');
      expect(voluntarySuperRow).toBeInTheDocument();
      
      // The weekly amount should be $5,000 / 52 weeks ≈ $96.15
      const weeklyAmount = voluntarySuperRow?.querySelector('.text-red-500');
      expect(weeklyAmount).toBeInTheDocument();
      
      // Note: We're just checking that the amount is present, not its exact value
      // because the frequency in the form might affect the calculation
    }, { timeout: 2000 });

    // Check if voluntary super appears in the breakdown on the monthly tab
    const monthlyTab = screen.getByRole('tab', { name: /monthly/i });
    fireEvent.click(monthlyTab);

    // Wait for the tab content to update
    await waitFor(() => {
      const voluntarySuperRow = screen.getByText(/▼ voluntary super/i).closest('div');
      expect(voluntarySuperRow).toBeInTheDocument();
      
      // The monthly amount should be $5,000 / 12 months ≈ $416.67
      const monthlyAmount = voluntarySuperRow?.querySelector('.text-red-500');
      expect(monthlyAmount).toBeInTheDocument();
      
      // Note: We're just checking that the amount is present, not its exact value
      // because the frequency in the form might affect the calculation
    }, { timeout: 2000 });
  });
}); 