import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Shared primitives for public marketing calculators.
 *
 * Every tool page repeats the same three shapes: a labelled numeric input
 * with an optional hint, a two-column input/results shell, and a headline
 * result stat. These primitives encode that once so each calculator file
 * carries only its own maths and copy.
 */

export function CalcField({
  id,
  label,
  hint,
  className,
  ...inputProps
}: {
  id: string;
  label: string;
  hint?: string;
  className?: string;
} & Omit<React.ComponentProps<typeof Input>, 'id'>) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" {...inputProps} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function CalcPanel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function CalcLayout({
  inputs,
  results,
}: {
  inputs: React.ReactNode;
  results: React.ReactNode;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(300px,1fr)_minmax(0,2fr)]">
      <div className="space-y-4">{inputs}</div>
      <div className="min-w-0 space-y-5">{results}</div>
    </div>
  );
}

export function ResultStat({
  label,
  value,
  sub,
  testId,
  emphasize = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  testId?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        emphasize ? 'border-primary/40 bg-primary/5' : 'bg-muted/40'
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn('mt-1 font-bold tracking-tight', emphasize ? 'text-2xl sm:text-3xl' : 'text-xl')}
        data-testid={testId}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
