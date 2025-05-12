import Dashboard from './components/Dashboard';
import { FinanceProvider } from './context/FinanceContext';

export default function Home() {
  return (
    <FinanceProvider>
      <Dashboard />
    </FinanceProvider>
  );
}
