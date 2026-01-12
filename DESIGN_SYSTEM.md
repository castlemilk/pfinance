# PFinance Design System Documentation

## Overview

PFinance uses a modern, accessible design system built on top of shadcn/ui components and Tailwind CSS. The design emphasizes clarity, usability, and consistency across all financial features.

## Table of Contents

- [Design Principles](#design-principles)
- [Color System](#color-system)
- [Typography](#typography)
- [Component Library](#component-library)
- [Layout System](#layout-system)
- [Icons & Iconography](#icons--iconography)
- [Spacing & Sizing](#spacing--sizing)
- [Interactive States](#interactive-states)
- [Accessibility](#accessibility)
- [Component Patterns](#component-patterns)

## Design Principles

### 1. **Clarity First**
- Financial data must be immediately understandable
- Clear visual hierarchy guides user attention
- Consistent labeling and terminology

### 2. **Trust & Security**
- Visual cues indicate secure operations
- Clear feedback for user actions
- Transparent handling of sensitive data

### 3. **Progressive Enhancement**
- Core functionality works without advanced features
- AI features clearly marked and promoted
- Graceful degradation for unsupported features

### 4. **Accessibility by Default**
- WCAG 2.1 AA compliance
- Keyboard navigation support
- Screen reader optimization

## Color System

### Primary Colors

```css
/* Brand Colors */
--primary: 222.2 84% 4.9%;           /* Primary brand color */
--primary-foreground: 210 40% 98%;   /* Text on primary */

/* Semantic Colors */
--success: 142.1 76.2% 36.3%;        /* Success states */
--warning: 47.9 95.8% 53.1%;         /* Warning states */
--destructive: 0 84.2% 60.2%;        /* Error states */
--info: 221.2 83.2% 53.3%;           /* Info states */
```

### Neutral Palette

```css
/* Background Colors */
--background: 0 0% 100%;              /* Main background */
--card: 0 0% 100%;                    /* Card backgrounds */
--muted: 210 40% 96%;                 /* Muted backgrounds */

/* Text Colors */
--foreground: 222.2 84% 4.9%;         /* Primary text */
--muted-foreground: 215.4 16.3% 46.9%; /* Secondary text */

/* Border Colors */
--border: 214.3 31.8% 91.4%;          /* Default borders */
--input: 214.3 31.8% 91.4%;           /* Input borders */
```

### Financial Data Colors

```css
/* Category Colors */
.category-food { @apply bg-green-100 text-green-800; }
.category-housing { @apply bg-blue-100 text-blue-800; }
.category-transportation { @apply bg-yellow-100 text-yellow-800; }
.category-entertainment { @apply bg-purple-100 text-purple-800; }
.category-healthcare { @apply bg-red-100 text-red-800; }
.category-utilities { @apply bg-indigo-100 text-indigo-800; }
.category-shopping { @apply bg-pink-100 text-pink-800; }
.category-education { @apply bg-cyan-100 text-cyan-800; }
.category-travel { @apply bg-orange-100 text-orange-800; }
.category-other { @apply bg-gray-100 text-gray-800; }

/* Financial State Colors */
.positive-amount { @apply text-green-600; }
.negative-amount { @apply text-red-600; }
.neutral-amount { @apply text-gray-600; }
```

## Typography

### Font System

```css
/* Font Family */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

/* Font Sizes */
.text-xs { font-size: 0.75rem; line-height: 1rem; }
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }
.text-base { font-size: 1rem; line-height: 1.5rem; }
.text-lg { font-size: 1.125rem; line-height: 1.75rem; }
.text-xl { font-size: 1.25rem; line-height: 1.75rem; }
.text-2xl { font-size: 1.5rem; line-height: 2rem; }
.text-3xl { font-size: 1.875rem; line-height: 2.25rem; }
```

### Typography Hierarchy

#### Headings
```tsx
// Page Title
<h1 className="text-3xl font-bold">Income & Expense Tracker</h1>

// Section Title
<h2 className="text-2xl font-semibold">Financial Summary</h2>

// Card Title
<h3 className="text-lg font-medium">Monthly Expenses</h3>

// Subsection
<h4 className="text-base font-medium">Transaction Details</h4>
```

#### Body Text
```tsx
// Primary Text
<p className="text-base text-foreground">Main content text</p>

// Secondary Text
<p className="text-sm text-muted-foreground">Supporting information</p>

// Small Text
<span className="text-xs text-muted-foreground">Metadata and labels</span>
```

#### Financial Data
```tsx
// Currency Display
<span className="text-lg font-semibold text-green-600">$1,234.56</span>

// Percentage
<span className="text-sm font-medium text-red-600">-12.5%</span>

// Account Balance
<div className="text-2xl font-bold text-foreground">$10,250.00</div>
```

## Component Library

### Core Components

#### Button
```tsx
// Primary Action
<Button className="bg-primary text-primary-foreground">
  Add Expense
</Button>

// Secondary Action
<Button variant="outline">
  Cancel
</Button>

// Destructive Action
<Button variant="destructive">
  Delete
</Button>
```

#### Card
```tsx
// Standard Card
<Card>
  <CardHeader>
    <CardTitle>Expense Summary</CardTitle>
    <CardDescription>Monthly breakdown</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

#### Form Controls
```tsx
// Input Field
<Input
  type="number"
  placeholder="Enter amount"
  className="text-right"
/>

// Select Dropdown
<Select>
  <SelectTrigger>
    <SelectValue placeholder="Choose category" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="food">Food</SelectItem>
    <SelectItem value="housing">Housing</SelectItem>
  </SelectContent>
</Select>

// Switch Toggle
<Switch
  checked={enabled}
  onCheckedChange={setEnabled}
/>
```

### Financial Components

#### Amount Display
```tsx
// Currency formatter
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

// Usage
<span className="font-semibold text-green-600">
  {formatCurrency(1234.56)}
</span>
```

#### Category Badge
```tsx
<Badge className={getCategoryColor(category)}>
  {category}
</Badge>
```

#### Progress Indicator
```tsx
<div className="space-y-2">
  <div className="flex justify-between text-sm">
    <span>Food</span>
    <span>$450 / $500</span>
  </div>
  <Progress value={90} className="h-2" />
</div>
```

### Data Display Components

#### Table
```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Date</TableHead>
      <TableHead>Description</TableHead>
      <TableHead className="text-right">Amount</TableHead>
      <TableHead>Category</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {transactions.map(transaction => (
      <TableRow key={transaction.id}>
        <TableCell>{formatDate(transaction.date)}</TableCell>
        <TableCell>{transaction.description}</TableCell>
        <TableCell className="text-right font-semibold">
          {formatCurrency(transaction.amount)}
        </TableCell>
        <TableCell>
          <Badge className={getCategoryColor(transaction.category)}>
            {transaction.category}
          </Badge>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

## Layout System

### Grid System
```tsx
// Main dashboard layout
<div className="container mx-auto px-4 py-8">
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {/* Content cards */}
  </div>
</div>

// Responsive grid
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  {/* Metric cards */}
</div>
```

### Flex Layouts
```tsx
// Header layout
<div className="flex items-center justify-between mb-8">
  <h1 className="text-3xl font-bold">Dashboard</h1>
  <div className="flex items-center gap-4">
    {/* User controls */}
  </div>
</div>

// Form layout
<div className="flex flex-col space-y-4">
  {/* Form fields */}
</div>
```

### Container Sizes
```css
/* Container widths */
.container { max-width: 1200px; }

/* Content sections */
.section-narrow { max-width: 600px; }
.section-standard { max-width: 800px; }
.section-wide { max-width: 1000px; }
```

## Icons & Iconography

### Icon Library
Using Lucide React icons for consistency and accessibility.

#### Financial Icons
```tsx
import {
  DollarSign,      // Currency/money
  TrendingUp,      // Growth/positive
  TrendingDown,    // Decline/negative
  PieChart,        // Analytics
  BarChart3,       // Reports
  CreditCard,      // Payments
  Receipt,         // Transactions
  Wallet,          // Personal finance
} from 'lucide-react';
```

#### Interface Icons
```tsx
import {
  Plus,            // Add actions
  Pencil,          // Edit actions
  Trash2,          // Delete actions
  Settings,        // Configuration
  User,            // Profile
  Lock,            // Security
  Eye,             // Visibility
  Download,        // Export
  Upload,          // Import
} from 'lucide-react';
```

#### AI Feature Icons
```tsx
import {
  Brain,           // AI features
  Sparkles,        // Enhanced features
  Robot,           // Automation
  Zap,             // Smart actions
} from 'lucide-react';
```

### Icon Usage Patterns
```tsx
// Icon with text
<Button>
  <Plus className="w-4 h-4 mr-2" />
  Add Expense
</Button>

// Icon-only button
<Button size="icon" variant="outline">
  <Pencil className="w-4 h-4" />
  <span className="sr-only">Edit</span>
</Button>

// Status indicator
<div className="flex items-center gap-2">
  <CheckCircle2 className="w-4 h-4 text-green-600" />
  <span>Completed</span>
</div>
```

## Spacing & Sizing

### Spacing Scale
```css
/* Tailwind spacing scale */
.space-1 { margin: 0.25rem; }    /* 4px */
.space-2 { margin: 0.5rem; }     /* 8px */
.space-3 { margin: 0.75rem; }    /* 12px */
.space-4 { margin: 1rem; }       /* 16px */
.space-6 { margin: 1.5rem; }     /* 24px */
.space-8 { margin: 2rem; }       /* 32px */
.space-12 { margin: 3rem; }      /* 48px */
```

### Component Sizing
```tsx
// Button sizes
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>

// Input sizes
<Input className="h-8" />  // Small
<Input className="h-10" /> // Default
<Input className="h-12" /> // Large
```

## Interactive States

### Hover States
```css
/* Button hover */
.btn-primary:hover {
  background-color: hsl(var(--primary) / 0.9);
}

/* Card hover */
.card-interactive:hover {
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}
```

### Focus States
```css
/* Focus ring */
.focus-visible:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
```

### Loading States
```tsx
// Button loading
<Button disabled>
  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  Processing...
</Button>

// Skeleton loading
<div className="animate-pulse">
  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
</div>
```

## Accessibility

### ARIA Labels
```tsx
// Descriptive labels
<Button aria-label="Add new expense">
  <Plus className="w-4 h-4" />
</Button>

// Status announcements
<div role="status" aria-live="polite">
  {successMessage}
</div>
```

### Keyboard Navigation
```tsx
// Focus management
<Dialog>
  <DialogTrigger asChild>
    <Button>Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogClose asChild>
      <Button variant="outline">Close</Button>
    </DialogClose>
  </DialogContent>
</Dialog>
```

### Screen Reader Support
```tsx
// Descriptive text for charts
<div className="chart-container">
  <PieChart data={data} />
  <div className="sr-only">
    Expense breakdown: Food 40%, Housing 30%, Transportation 20%, Other 10%
  </div>
</div>
```

## Component Patterns

### Form Pattern
```tsx
const ExpenseForm = () => {
  const form = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input placeholder="Enter description" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Add Expense</Button>
      </form>
    </Form>
  );
};
```

### Data Display Pattern
```tsx
const DataCard = ({ title, value, trend, icon: Icon }) => (
  <Card>
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      {trend && (
        <div className="mt-4 flex items-center">
          <TrendingUp className="h-4 w-4 text-green-600" />
          <span className="text-sm text-green-600 ml-1">{trend}</span>
        </div>
      )}
    </CardContent>
  </Card>
);
```

### Modal Pattern
```tsx
const ConfirmDialog = ({ open, onOpenChange, onConfirm, title, description }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={onConfirm}>
          Confirm
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
```

### Loading Pattern
```tsx
const LoadingWrapper = ({ loading, children, skeleton }) => {
  if (loading) {
    return skeleton || <DefaultSkeleton />;
  }
  
  return children;
};
```

## Dark Mode Support

### CSS Variables
```css
/* Light theme */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
}

/* Dark theme */
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 210 40% 98%;
}
```

### Theme Toggle
```tsx
const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
};
```

This design system ensures consistency, accessibility, and maintainability across the entire PFinance application while providing clear guidelines for future development.