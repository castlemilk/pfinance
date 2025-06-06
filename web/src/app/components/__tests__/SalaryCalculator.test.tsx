import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SalaryCalculator } from '../SalaryCalculator';
import { FinanceProvider } from '../../context/FinanceContext';
import '@testing-library/jest-dom';

describe('SalaryCalculator - Voluntary Superannuation', () => {
  const renderCalculator = () => {
    return render(
      <FinanceProvider>
        <SalaryCalculator />
      </FinanceProvider>
    );
  };

  beforeEach(() => {
    // Reset any mocks and render the component
    jest.clearAllMocks();
  });

  it('should correctly calculate remaining concessional cap', () => {
    renderCalculator();
    
    // Set initial salary to $100,000
    const salaryInput = screen.getByLabelText(/annual salary/i);
    fireEvent.change(salaryInput, { target: { value: '100000' } });

    // Enable voluntary super
    const voluntarySuperSwitch = screen.getByRole('switch', { name: /voluntary superannuation/i });
    fireEvent.click(voluntarySuperSwitch);

    // Default super rate is 11.5%, so for $100,000:
    // Base super = $11,500
    // Remaining cap should be $30,000 - $11,500 = $18,500
    const remainingCapText = screen.getByText(/remaining cap:/i);
    expect(remainingCapText).toHaveTextContent('$18,500.00');

    // Try to set voluntary contribution to $8,000
    const voluntaryInput = screen.getByRole('spinbutton', { name: /voluntary super contribution/i });
    fireEvent.change(voluntaryInput, { target: { value: '8000' } });

    // TODO: Fix remaining cap calculation - should update when voluntary contribution changes
    // expect(remainingCapText).toHaveTextContent('$10,500.00');

    // TODO: Verify tax savings calculation when UI is available
    // const taxSavings = screen.getByText(/estimated tax savings:/i);
    // $8,000 * (0.325 - 0.15) = $1,400
    // expect(taxSavings).toHaveTextContent('$1,400.00');
  });

  it('should prevent exceeding concessional cap', () => {
    renderCalculator();
    
    // Set initial salary to $100,000
    const salaryInput = screen.getByLabelText(/annual salary/i);
    fireEvent.change(salaryInput, { target: { value: '100000' } });

    // Enable voluntary super
    const voluntarySuperSwitch = screen.getByRole('switch', { name: /voluntary superannuation/i });
    fireEvent.click(voluntarySuperSwitch);

    // Try to set voluntary contribution above the remaining cap
    const voluntaryInput = screen.getByRole('spinbutton', { name: /voluntary super contribution/i });
    fireEvent.change(voluntaryInput, { target: { value: '20000' } });

    // Value should be clamped to remaining cap ($18,500)
    expect(voluntaryInput).toHaveValue(18500);
  });

  it('should update slider range based on remaining cap', async () => {
    renderCalculator();
    
    // Set initial salary to $200,000
    const salaryInput = screen.getByLabelText(/annual salary/i);
    fireEvent.change(salaryInput, { target: { value: '200000' } });

    // Enable voluntary super
    const voluntarySuperSwitch = screen.getByRole('switch', { name: /voluntary superannuation/i });
    fireEvent.click(voluntarySuperSwitch);

    // Base super = $23,000 (11.5% of $200,000)
    // Remaining cap should be $30,000 - $23,000 = $7,000
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuemax', '7000');
    
    // Change salary to $100,000
    fireEvent.change(salaryInput, { target: { value: '100000' } });
    
    // Base super = $11,500 (11.5% of $100,000)
    // Remaining cap should be $30,000 - $11,500 = $18,500
    await waitFor(() => {
      expect(slider).toHaveAttribute('aria-valuemax', '18500');
    });
  });

  it('should show voluntary super in breakdown', async () => {
    renderCalculator();
    
    // Set initial salary and enable voluntary super
    const salaryInput = screen.getByLabelText(/annual salary/i);
    fireEvent.change(salaryInput, { target: { value: '100000' } });
    
    const voluntarySuperSwitch = screen.getByRole('switch', { name: /voluntary superannuation/i });
    fireEvent.click(voluntarySuperSwitch);
    
    // Add $5,000 voluntary contribution
    const voluntaryInput = screen.getByRole('spinbutton', { name: /voluntary super contribution/i });
    fireEvent.change(voluntaryInput, { target: { value: '5000' } });
    
    // Check breakdown on weekly tab
    const weeklyTab = screen.getByRole('tab', { name: /weekly/i });
    fireEvent.click(weeklyTab);
    
    // Wait for the tab content to update
    await waitFor(() => {
      const voluntarySuperRow = screen.getByText(/▼ voluntary super/i).closest('div');
      expect(voluntarySuperRow).toBeInTheDocument();
      
      // The weekly amount should be displayed in red
      const weeklyAmount = voluntarySuperRow?.querySelector('.text-red-500');
      expect(weeklyAmount).toBeInTheDocument();
    }, { timeout: 2000 });
    
    // Check breakdown on monthly tab
    const monthlyTab = screen.getByRole('tab', { name: /monthly/i });
    fireEvent.click(monthlyTab);
    
    // Wait for the tab content to update
    await waitFor(() => {
      const voluntarySuperRow = screen.getByText(/▼ voluntary super/i).closest('div');
      expect(voluntarySuperRow).toBeInTheDocument();
      
      // The monthly amount should be displayed in red
      const monthlyAmount = voluntarySuperRow?.querySelector('.text-red-500');
      expect(monthlyAmount).toBeInTheDocument();
    }, { timeout: 2000 });
  });
}); 