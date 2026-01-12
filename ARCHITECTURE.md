# PFinance Architecture Documentation

## Overview

PFinance is a modern, full-stack personal finance application built with Next.js 15, TypeScript, and Firebase. It features AI-powered transaction analysis, multi-user collaboration, and comprehensive financial tracking capabilities.

## Table of Contents

- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Frontend Architecture](#frontend-architecture)
- [State Management](#state-management)
- [Authentication & Authorization](#authentication--authorization)
- [Data Layer](#data-layer)
- [AI Integration](#ai-integration)
- [Component Architecture](#component-architecture)
- [Testing Strategy](#testing-strategy)
- [Performance Considerations](#performance-considerations)
- [Security Measures](#security-measures)
- [Deployment & Infrastructure](#deployment--infrastructure)

## Technology Stack

### Frontend
- **Framework**: Next.js 15 with App Router
- **Runtime**: React 19 with TypeScript 5
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: React Context API
- **Forms**: React Hook Form with Zod validation
- **Charts**: Recharts for data visualization

### Backend & Services
- **Authentication**: Firebase Auth
- **Database**: Firestore (NoSQL document database)
- **AI Services**: OpenAI GPT-4o and GPT-4o Vision
- **File Processing**: PDF processing with OpenAI Assistants API

### Development & Tooling
- **Build System**: Next.js with TypeScript
- **Testing**: Jest with React Testing Library
- **Linting**: ESLint with TypeScript rules
- **Package Manager**: npm
- **Development**: Hot reload with Next.js dev server

## Project Structure

```
pfinance/
├── web/                          # Frontend application
│   ├── src/
│   │   ├── app/                  # Next.js App Router
│   │   │   ├── components/       # Feature components
│   │   │   ├── context/         # React Context providers
│   │   │   ├── utils/           # Utility functions & AI services
│   │   │   ├── types/           # TypeScript type definitions
│   │   │   ├── constants/       # App constants & configuration
│   │   │   └── __tests__/       # Component tests
│   │   ├── components/ui/       # Reusable UI components (shadcn/ui)
│   │   ├── lib/                 # Core libraries & services
│   │   └── gen/                 # Generated protobuf files
│   ├── public/                  # Static assets
│   └── coverage/                # Test coverage reports
└── backend/                     # Go backend (gRPC services)
    ├── cmd/server/              # Main server application
    ├── internal/                # Internal packages
    │   ├── auth/               # Authentication middleware
    │   ├── service/            # Business logic
    │   └── store/              # Data access layer
    └── proto/                   # Protocol buffer definitions
```

## Frontend Architecture

### App Router Architecture

The application uses Next.js 15's App Router with the following structure:

```typescript
// Core application layout
app/
├── layout.tsx                   # Root layout with providers
├── page.tsx                     # Main dashboard page
├── globals.css                  # Global styles
└── components/                  # Feature components
```

### Component Organization

Components are organized by feature and responsibility:

1. **Feature Components** (`app/components/`): Business logic components
2. **UI Components** (`components/ui/`): Reusable design system components
3. **Layout Components**: Page layouts and structure
4. **Utility Components**: Shared functionality

## State Management

### Context Architecture

The application uses a hierarchical context structure:

```typescript
// Context hierarchy
<AuthProvider>           // User authentication state
  <FinanceProvider>      // Individual finance data
    <MultiUserFinanceProvider>  // Group finance features
      <App />
    </MultiUserFinanceProvider>
  </FinanceProvider>
</AuthProvider>
```

### Context Responsibilities

#### AuthContext
```typescript
interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
}
```

#### FinanceContext
```typescript
interface FinanceContextType {
  expenses: Expense[];
  incomes: Income[];
  addExpense: (description: string, amount: number, category: ExpenseCategory, frequency: ExpenseFrequency) => void;
  addExpenses: (expenses: ExpenseInput[]) => void;
  getTotalExpenses: () => number;
  getTotalIncome: () => number;
  // ... additional methods
}
```

#### MultiUserFinanceContext
```typescript
interface MultiUserFinanceContextType {
  groups: FinanceGroup[];
  activeGroup: FinanceGroup | null;
  groupExpenses: GroupExpense[];
  createGroup: (name: string) => Promise<void>;
  inviteUserToGroup: (groupId: string, email: string) => Promise<void>;
  // ... group management methods
}
```

### Data Flow Patterns

1. **Top-Down Data Flow**: Data flows from contexts to components
2. **Event-Driven Updates**: User actions trigger context updates
3. **Optimistic Updates**: UI updates immediately with rollback on failure
4. **Real-time Sync**: Firestore listeners for collaborative features

## Authentication & Authorization

### Firebase Auth Integration

```typescript
// Authentication flow
1. User signs in → Firebase Auth
2. Auth state change → AuthContext update
3. ID Token retrieved → Stored for API calls
4. User object available throughout app
```

### AI Feature Authorization

AI-powered features require authentication:

```typescript
// Auth gating pattern
const { user } = useAuth();

// PDF Processing & Smart Categorization
if (!user) {
  return <PromotionalUI />; // Encourage sign-in
}

// Feature enabled for authenticated users
return <AIFeature />;
```

### Security Patterns

1. **Client-side Auth Checks**: UI-level protection
2. **API Token Validation**: Backend verification
3. **Firestore Security Rules**: Database-level protection
4. **Environment Variable Protection**: Sensitive data isolation

## Data Layer

### Dual Storage Strategy

The application employs a hybrid storage approach:

#### Local Storage (Individual Use)
```typescript
// For personal finance data when not authenticated
localStorage.setItem('finance-data', JSON.stringify(data));
```

#### Firestore (Collaborative Features)
```typescript
// For multi-user features and data persistence
const expensesRef = collection(db, 'expenses');
const groupsRef = collection(db, 'financeGroups');
```

### Data Models

#### Core Entities
```typescript
interface Expense {
  id: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  frequency: ExpenseFrequency;
  date?: string;
  userId?: string;
}

interface Income {
  id: string;
  source: string;
  amount: number;
  frequency: IncomeFrequency;
  userId?: string;
}

interface FinanceGroup {
  id: string;
  name: string;
  createdBy: string;
  members: GroupMember[];
  memberIds: string[];
  createdAt: Date;
}
```

### Data Synchronization

1. **Real-time Updates**: Firestore onSnapshot listeners
2. **Conflict Resolution**: Last-write-wins with timestamp
3. **Offline Handling**: Local storage fallback
4. **Data Migration**: Seamless transition between storage types

## AI Integration

### OpenAI Services Architecture

The application integrates multiple AI capabilities:

#### Smart Categorization
```typescript
class EnhancedSmartCategorization {
  // GPT-4o powered transaction categorization
  // Historical learning from user corrections
  // Confidence scoring and alternatives
}
```

#### PDF Processing
```typescript
class EnhancedPdfProcessor {
  // GPT-4o Assistants API for bank statement extraction
  // Fallback to GPT-4o Vision for image-based PDFs
  // Structured transaction data extraction
}
```

#### Report Generation
```typescript
class EnhancedReportGenerator {
  // AI-powered financial insights
  // Automated report generation
  // Multiple export formats
}
```

### AI Service Patterns

1. **Progressive Enhancement**: Basic functionality without AI
2. **Fallback Strategies**: Rule-based alternatives
3. **Learning Integration**: User feedback improves accuracy
4. **Error Handling**: Graceful degradation on API failures

## Component Architecture

### Design System Integration

The application uses shadcn/ui for consistent design:

```typescript
// Component structure
components/ui/
├── button.tsx          # Base button component
├── card.tsx           # Container component
├── dialog.tsx         # Modal functionality
├── form.tsx           # Form controls
├── table.tsx          # Data display
└── ...               # Additional UI components
```

### Component Patterns

#### Feature Components
```typescript
// Pattern: Container + Presentation
const FeatureComponent = () => {
  const { data, actions } = useContext();
  return <PresentationComponent data={data} {...actions} />;
};
```

#### Hooks Pattern
```typescript
// Custom hooks for business logic
const useFinancialData = () => {
  const { expenses, incomes } = useFinance();
  return useMemo(() => ({
    totalExpenses: calculateTotal(expenses),
    netIncome: calculateNet(incomes, expenses)
  }), [expenses, incomes]);
};
```

### Component Hierarchy

```
Dashboard (Root)
├── Header (Auth controls)
├── TabsContainer
│   ├── FinanceSummary
│   ├── ExpenseManagement
│   │   ├── ExpenseForm
│   │   ├── ExpenseList
│   │   └── ExpenseVisualization
│   ├── IncomeManagement
│   ├── TransactionImport (AI-powered)
│   ├── ReportGenerator
│   └── GroupManager (Multi-user)
└── AuthModal
```

## Testing Strategy

### Current Test Coverage

```typescript
// Component Tests
src/app/__tests__/
├── ExpenseList.test.tsx
├── ExpenseListSelection.test.tsx
└── SalaryCalculator.test.tsx

src/app/components/__tests__/
└── SalaryCalculator.test.tsx

src/app/context/__tests__/
├── AuthContext.test.tsx
└── MultiUserFinanceContext.test.tsx
```

### Testing Patterns

#### Context Testing
```typescript
// Mock providers for isolated testing
const renderWithProviders = (component) => {
  return render(
    <MockAuthProvider>
      <MockFinanceProvider>
        {component}
      </MockFinanceProvider>
    </MockAuthProvider>
  );
};
```

#### Component Testing
```typescript
// Integration-style component tests
describe('ExpenseList', () => {
  it('displays expenses correctly', () => {
    renderWithProviders(<ExpenseList />);
    expect(screen.getByText('Total Expenses')).toBeInTheDocument();
  });
});
```

### Test Infrastructure

- **Framework**: Jest with React Testing Library
- **Mocking**: Firebase Auth and Firestore mocks
- **Coverage**: HTML reports generated in `coverage/`
- **CI Integration**: Tests run on every commit

## Performance Considerations

### Optimization Strategies

1. **Code Splitting**: Next.js automatic code splitting
2. **Lazy Loading**: Dynamic imports for heavy components
3. **Memoization**: React.memo and useMemo for expensive operations
4. **Virtual Scrolling**: For large transaction lists
5. **Image Optimization**: Next.js Image component

### Bundle Analysis

```bash
# Analyze bundle size
npm run build
npm run analyze
```

### Performance Monitoring

- **Web Vitals**: Core Web Vitals tracking
- **Error Tracking**: Console error monitoring
- **Loading States**: Comprehensive loading indicators

## Security Measures

### Client-Side Security

1. **Input Validation**: Zod schemas for all forms
2. **XSS Prevention**: React's built-in protection
3. **CSRF Protection**: Firebase Auth tokens
4. **Environment Variables**: `.env.local` for sensitive data

### Data Protection

1. **Firestore Rules**: Server-side access control
2. **API Key Management**: Local storage only
3. **User Data Isolation**: Per-user data segregation
4. **Audit Logging**: Transaction history tracking

### AI Security

1. **API Key Protection**: Never stored on server
2. **Content Filtering**: Input sanitization for AI services
3. **Rate Limiting**: OpenAI API usage controls
4. **Data Privacy**: No sensitive data in AI prompts

## Deployment & Infrastructure

### Build Configuration

```typescript
// next.config.mjs
const nextConfig = {
  experimental: {
    appDir: true,
    serverComponentsExternalPackages: []
  },
  eslint: {
    ignoreDuringBuilds: false
  }
};
```

### Environment Setup

```bash
# Required environment variables
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

### Deployment Targets

1. **Vercel**: Frontend deployment with automatic builds
2. **Firebase Hosting**: Alternative hosting option
3. **Docker**: Containerized deployment option

## Development Workflow

### Getting Started

```bash
# Installation
npm install

# Development
npm run dev

# Testing
npm run test
npm run test:watch

# Type Checking
npm run type-check

# Building
npm run build
```

### Code Quality

1. **TypeScript**: Strict type checking
2. **ESLint**: Code style enforcement
3. **Prettier**: Code formatting
4. **Husky**: Pre-commit hooks

## Future Considerations

### Scalability Enhancements

1. **State Management**: Consider Zustand or Redux Toolkit for complex state
2. **Database**: Evaluate PostgreSQL for complex queries
3. **Microservices**: Split backend into focused services
4. **CDN**: Implement global content delivery

### Feature Roadmap

1. **Mobile App**: React Native implementation
2. **Advanced Analytics**: Machine learning insights
3. **Third-party Integrations**: Bank API connections
4. **Collaboration**: Enhanced team features

This architecture provides a solid foundation for a scalable, maintainable personal finance application with room for future growth and enhancement.