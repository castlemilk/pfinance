'use client';

import { useReducer, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  getCurrentAustralianFY,
} from '../../constants/taxDeductions';
import { TaxClassificationResult, TaxExportFormat } from '@/gen/pfinance/v1/finance_service_pb';
import { TaxCalculation, TaxDeductionSummary } from '@/gen/pfinance/v1/types_pb';
import { ConfigureStep } from './steps/ConfigureStep';
import { ClassifyStep } from './steps/ClassifyStep';
import { ReviewStep } from './steps/ReviewStep';
import { DeductionsStep } from './steps/DeductionsStep';
import { CalculateStep } from './steps/CalculateStep';
import { ExportStep } from './steps/ExportStep';

// ============================================================================
// Types
// ============================================================================

export type Step = 'configure' | 'classify' | 'review' | 'deductions' | 'calculate' | 'export';

const STEPS: { id: Step; label: string }[] = [
  { id: 'configure', label: 'Configure' },
  { id: 'classify', label: 'Classify' },
  { id: 'review', label: 'Review' },
  { id: 'deductions', label: 'Deductions' },
  { id: 'calculate', label: 'Calculate' },
  { id: 'export', label: 'Export' },
];

export interface ClassifyResult {
  processed: number;
  autoApplied: number;
  needsReview: number;
  skipped: number;
}

export interface WizardState {
  step: Step;
  financialYear: string;
  occupation: string;
  hasHelpDebt: boolean;
  medicareExemption: boolean;
  privateHealth: boolean;
  taxWithheld: number;
  classifyResult: ClassifyResult | null;
  classifyResults: TaxClassificationResult[];
  reviewedCount: number;
  taxSummary: TaxCalculation | null;
  deductionSummaries: TaxDeductionSummary[];
}

// ============================================================================
// Actions
// ============================================================================

export type WizardAction =
  | { type: 'SET_STEP'; step: Step }
  | { type: 'SET_FINANCIAL_YEAR'; value: string }
  | { type: 'SET_OCCUPATION'; value: string }
  | { type: 'SET_HAS_HELP_DEBT'; value: boolean }
  | { type: 'SET_MEDICARE_EXEMPTION'; value: boolean }
  | { type: 'SET_PRIVATE_HEALTH'; value: boolean }
  | { type: 'SET_TAX_WITHHELD'; value: number }
  | { type: 'SET_CLASSIFY_RESULT'; result: ClassifyResult; results: TaxClassificationResult[] }
  | { type: 'SET_REVIEWED_COUNT'; count: number }
  | { type: 'SET_TAX_SUMMARY'; summary: TaxCalculation; deductions: TaxDeductionSummary[] }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' };

function getStepIndex(step: Step): number {
  return STEPS.findIndex(s => s.id === step);
}

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step };
    case 'SET_FINANCIAL_YEAR':
      return { ...state, financialYear: action.value };
    case 'SET_OCCUPATION':
      return { ...state, occupation: action.value };
    case 'SET_HAS_HELP_DEBT':
      return { ...state, hasHelpDebt: action.value };
    case 'SET_MEDICARE_EXEMPTION':
      return { ...state, medicareExemption: action.value };
    case 'SET_PRIVATE_HEALTH':
      return { ...state, privateHealth: action.value };
    case 'SET_TAX_WITHHELD':
      return { ...state, taxWithheld: action.value };
    case 'SET_CLASSIFY_RESULT':
      return { ...state, classifyResult: action.result, classifyResults: action.results };
    case 'SET_REVIEWED_COUNT':
      return { ...state, reviewedCount: action.count };
    case 'SET_TAX_SUMMARY':
      return { ...state, taxSummary: action.summary, deductionSummaries: action.deductions };
    case 'NEXT_STEP': {
      const idx = getStepIndex(state.step);
      if (idx < STEPS.length - 1) {
        return { ...state, step: STEPS[idx + 1].id };
      }
      return state;
    }
    case 'PREV_STEP': {
      const idx = getStepIndex(state.step);
      if (idx > 0) {
        return { ...state, step: STEPS[idx - 1].id };
      }
      return state;
    }
    default:
      return state;
  }
}

// ============================================================================
// Step Indicator
// ============================================================================

function StepIndicator({ currentStep }: { currentStep: Step }) {
  const currentIndex = getStepIndex(currentStep);

  return (
    <div className="flex items-center justify-between w-full mb-8">
      {STEPS.map((step, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isUpcoming = i > currentIndex;

        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            {/* Step circle + label */}
            <div className="flex flex-col items-center">
              <div
                className={`
                  flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-medium transition-colors
                  ${isCompleted ? 'bg-primary border-primary text-primary-foreground' : ''}
                  ${isCurrent ? 'border-primary bg-primary/10 text-primary' : ''}
                  ${isUpcoming ? 'border-muted-foreground/30 text-muted-foreground/50' : ''}
                `}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={`
                  mt-1.5 text-xs font-medium hidden sm:block
                  ${isCurrent ? 'text-primary' : ''}
                  ${isUpcoming ? 'text-muted-foreground/50' : ''}
                  ${isCompleted ? 'text-muted-foreground' : ''}
                `}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div
                className={`
                  flex-1 h-0.5 mx-2 mt-[-1rem] sm:mt-0
                  ${i < currentIndex ? 'bg-primary' : 'bg-muted-foreground/20'}
                `}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function TaxReviewWizard() {
  const router = useRouter();

  const [state, dispatch] = useReducer(wizardReducer, {
    step: 'configure',
    financialYear: getCurrentAustralianFY(),
    occupation: '',
    hasHelpDebt: false,
    medicareExemption: false,
    privateHealth: false,
    taxWithheld: 0,
    classifyResult: null,
    classifyResults: [],
    reviewedCount: 0,
    taxSummary: null,
    deductionSummaries: [],
  });

  const currentIndex = getStepIndex(state.step);
  const isFirstStep = currentIndex === 0;
  const isLastStep = currentIndex === STEPS.length - 1;

  const canProceed = useCallback((): boolean => {
    switch (state.step) {
      case 'configure':
        return true; // FY has a default
      case 'classify':
        return state.classifyResult !== null;
      case 'review':
        return true; // Can skip review
      case 'deductions':
        return true;
      case 'calculate':
        return true;
      case 'export':
        return true;
      default:
        return false;
    }
  }, [state.step, state.classifyResult]);

  const handleNext = useCallback(() => {
    dispatch({ type: 'NEXT_STEP' });
  }, []);

  const handleBack = useCallback(() => {
    if (isFirstStep) {
      router.push('/personal/tax');
    } else {
      dispatch({ type: 'PREV_STEP' });
    }
  }, [isFirstStep, router]);

  const renderStep = () => {
    switch (state.step) {
      case 'configure':
        return <ConfigureStep state={state} dispatch={dispatch} />;
      case 'classify':
        return <ClassifyStep state={state} dispatch={dispatch} />;
      case 'review':
        return <ReviewStep state={state} dispatch={dispatch} />;
      case 'deductions':
        return <DeductionsStep state={state} dispatch={dispatch} />;
      case 'calculate':
        return <CalculateStep state={state} dispatch={dispatch} />;
      case 'export':
        return <ExportStep state={state} dispatch={dispatch} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Tax Review Wizard</h1>
          <p className="text-muted-foreground">
            Walk through your FY {state.financialYear} finances step by step to prepare your tax return.
          </p>
        </div>

        {/* Step indicator */}
        <StepIndicator currentStep={state.step} />

        {/* Step content */}
        <div className="min-h-[400px]">
          {renderStep()}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t">
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {isFirstStep ? 'Back to Tax' : 'Back'}
          </Button>

          {!isLastStep && (
            <Button onClick={handleNext} disabled={!canProceed()}>
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
