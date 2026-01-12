---
name: nextjs-frontend
description: Next.js 15 frontend development guidance for pfinance. Use when working on React components, pages, context providers, styling with Tailwind/shadcn, or integrating with the backend API.
---

# Next.js Frontend Development

This skill covers frontend development patterns for the pfinance web application.

## Project Structure

```
web/src/
├── app/                      # Next.js App Router
│   ├── layout.tsx           # Root layout with providers
│   ├── page.tsx             # Main dashboard
│   ├── globals.css          # Global styles + Tailwind
│   ├── components/          # Feature components
│   │   ├── Dashboard.tsx
│   │   ├── ExpenseForm.tsx
│   │   ├── ExpenseList.tsx
│   │   └── ...
│   ├── context/             # React Context providers
│   │   ├── AuthContext.tsx
│   │   ├── FinanceContext.tsx
│   │   └── MultiUserFinanceContext.tsx
│   ├── utils/               # Utility functions
│   └── types/               # TypeScript types
├── components/ui/           # shadcn/ui components
├── gen/pfinance/v1/        # Generated API types
└── lib/
    ├── firebase.ts         # Firebase client config
    ├── financeService.ts   # API client
    └── utils.ts            # CN utility for classnames
```

## Running the Frontend

```bash
# Development
make dev-frontend
# or
cd web && npm run dev -- -p 1234

# Build
make build-frontend
# or
cd web && npm run build

# Type checking
make type-check
# or
cd web && npm run type-check
```

## Component Patterns

### Feature Component Structure

```tsx
"use client";

import { useState } from "react";
import { useFinance } from "@/app/context/FinanceContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ExpenseManager() {
  const { expenses, addExpense, deleteExpense } = useFinance();
  const [isLoading, setIsLoading] = useState(false);

  const handleAddExpense = async (data: ExpenseFormData) => {
    setIsLoading(true);
    try {
      await addExpense(data);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Expenses</CardTitle>
      </CardHeader>
      <CardContent>
        <ExpenseForm onSubmit={handleAddExpense} isLoading={isLoading} />
        <ExpenseList expenses={expenses} onDelete={deleteExpense} />
      </CardContent>
    </Card>
  );
}
```

### Using Context

```tsx
// Consuming context
import { useAuth } from "@/app/context/AuthContext";
import { useFinance } from "@/app/context/FinanceContext";

function MyComponent() {
  const { user, loading } = useAuth();
  const { expenses, incomes, getTotalExpenses } = useFinance();
  
  if (loading) return <Skeleton />;
  if (!user) return <AuthPrompt />;
  
  return <Dashboard expenses={expenses} />;
}
```

### Form with React Hook Form + Zod

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const expenseSchema = z.object({
  description: z.string().min(1, "Description required"),
  amount: z.number().positive("Amount must be positive"),
  category: z.enum(["food", "transport", "utilities", "other"]),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

export function ExpenseForm({ onSubmit }: { onSubmit: (data: ExpenseFormData) => void }) {
  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { description: "", amount: 0, category: "other" },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* More fields... */}
        <Button type="submit">Add Expense</Button>
      </form>
    </Form>
  );
}
```

## API Integration

### Using the Finance Service Client

```typescript
// lib/financeService.ts provides the client
import { createPromiseClient } from "@bufbuild/connect-web";
import { createConnectTransport } from "@bufbuild/connect-web";
import { FinanceService } from "@/gen/pfinance/v1/finance_service_connect";

const transport = createConnectTransport({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8111",
});

export const financeClient = createPromiseClient(FinanceService, transport);

// Usage in component or context
const expenses = await financeClient.listExpenses({
  userId: user.uid,
  pageSize: 50,
});
```

## Styling with Tailwind + shadcn/ui

### Using the cn() Utility

```tsx
import { cn } from "@/lib/utils";

function Card({ className, variant, children }) {
  return (
    <div className={cn(
      "rounded-lg border bg-card p-4",
      variant === "highlight" && "border-primary bg-primary/5",
      className
    )}>
      {children}
    </div>
  );
}
```

### Adding New shadcn/ui Components

```bash
cd web
npx shadcn@latest add [component-name]
# e.g., npx shadcn@latest add dialog
```

### Dark Mode Support

```tsx
// Use Tailwind dark: variant
<div className="bg-white dark:bg-slate-900">
  <h1 className="text-slate-900 dark:text-white">Title</h1>
</div>
```

## Charting with visx

```tsx
import { Group } from "@visx/group";
import { Bar } from "@visx/shape";
import { scaleLinear, scaleBand } from "@visx/scale";

function ExpenseChart({ data, width, height }) {
  const xScale = scaleBand({
    domain: data.map(d => d.category),
    range: [0, width],
    padding: 0.2,
  });
  
  const yScale = scaleLinear({
    domain: [0, Math.max(...data.map(d => d.amount))],
    range: [height, 0],
  });

  return (
    <svg width={width} height={height}>
      <Group>
        {data.map((d, i) => (
          <Bar
            key={i}
            x={xScale(d.category)}
            y={yScale(d.amount)}
            width={xScale.bandwidth()}
            height={height - yScale(d.amount)}
            fill="#6366f1"
          />
        ))}
      </Group>
    </svg>
  );
}
```

## Testing

```tsx
// Component test
import { render, screen } from "@testing-library/react";
import { ExpenseList } from "@/app/components/ExpenseList";

describe("ExpenseList", () => {
  it("renders expenses", () => {
    const expenses = [
      { id: "1", description: "Coffee", amount: 5, category: "food" },
    ];
    
    render(
      <FinanceProvider initialExpenses={expenses}>
        <ExpenseList />
      </FinanceProvider>
    );
    
    expect(screen.getByText("Coffee")).toBeInTheDocument();
    expect(screen.getByText("$5.00")).toBeInTheDocument();
  });
});
```

## Best Practices

1. **Prefer Server Components** where possible - add `"use client"` only when needed
2. **Use shadcn/ui components** from `@/components/ui/` for consistency
3. **Validate forms with Zod** schemas before submission
4. **Handle loading states** - show skeletons or spinners
5. **Support dark mode** - use Tailwind `dark:` variants
6. **Use visx for charts** - not recharts (project standard)
7. **Type everything** - leverage generated proto types
