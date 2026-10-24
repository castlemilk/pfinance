'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  saveCalculatorSnapshot,
  type CalculatorTool,
} from '@/lib/calculator-handoff';

interface CalculatorHandoffCtaProps {
  tool: CalculatorTool;
  title: string;
  summary: string;
  metrics: { label: string; value: string }[];
  fields: Record<string, string | number>;
  targetPath: string;
  label?: string;
  disabled?: boolean;
}

export default function CalculatorHandoffCta({
  tool,
  title,
  summary,
  metrics,
  fields,
  targetPath,
  label = 'Use these numbers in PFinance',
  disabled = false,
}: CalculatorHandoffCtaProps) {
  const router = useRouter();

  const handleClick = () => {
    saveCalculatorSnapshot({ tool, title, summary, metrics, fields, targetPath });
    router.push(targetPath);
  };

  return (
    <Button onClick={handleClick} disabled={disabled} className="gap-2">
      {label}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}
