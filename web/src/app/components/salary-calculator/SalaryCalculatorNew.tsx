/**
 * SalaryCalculator - Refactored main component
 * 
 * Uses modular sub-components for cleaner organization:
 * - IncomeSection: Core salary inputs
 * - ExtraSettings: Accordion-based settings sections
 * - SummaryPanel: Results display
 */

'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { TaxSettings, IncomeFrequency } from '@/app/types';
import { useFinance } from '@/app/context/FinanceContext';
import { useAuth } from '@/app/context/AuthWithAdminContext';
import { financeClient } from '@/lib/financeService';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getTaxSystem, TaxYear, TaxCategory, DEFAULT_TAX_YEAR, DEFAULT_TAX_CATEGORY } from '@/app/constants/taxSystems';


// Local imports
import { SalaryFormData, OvertimeEntry, FringeBenefitEntry, SalarySacrificeEntry, NovatedLeaseEntry } from './types';
import { DEFAULT_FORM_VALUES, DEFAULT_TAX_SETTINGS } from './constants';
import { useSalaryCalculations } from './hooks';
import { IncomeSection } from './IncomeSection';
import { ExtraSettings, DEFAULT_DEDUCTIONS, DeductionsData, DEFAULT_FAMILY_BENEFITS, FamilyBenefitsData } from './ExtraSettings';
import { SummaryPanel } from './SummaryPanel';
import { PresetSelector, Preset, PresetType } from './PresetSelector';
import { TaxYearSelector } from './TaxYearSelector';
import dynamic from 'next/dynamic';
import { toAnnualAmount } from './utils';
import { Download, Printer, Share2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  buildSalaryReportViewModel,
  buildSalaryReportText,
  buildShareUrl,
  decodeSharePayload,
  defaultReportFilename,
  generateSalaryPdf,
  type ReportInput,
  type ReportMetricTone,
  type ReportSection,
} from './report';

const SalaryBreakdownChart = dynamic(() => import('../SalaryBreakdownChart'), { ssr: false });

export function SalaryCalculatorNew() {
  const { taxConfig, updateTaxConfig, addIncome, updateIncome, incomes } = useFinance();
  const { user } = useAuth();
  const { toast } = useToast();
  const calculatorRef = useRef<HTMLDivElement>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stateSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Hydration guard: don't auto-save state until we've finished loading.
  // Otherwise the empty initial state would clobber the saved state in the
  // brief window before load completes.
  const [stateLoaded, setStateLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Form state
  const form = useForm<SalaryFormData>({
    defaultValues: DEFAULT_FORM_VALUES,
  });

  // Tax settings state
  const [taxSettings, setTaxSettings] = useState<TaxSettings>(DEFAULT_TAX_SETTINGS);

  // Entry states
  const [overtimeEntries, setOvertimeEntries] = useState<OvertimeEntry[]>([]);
  const [fringeBenefits, setFringeBenefits] = useState<FringeBenefitEntry[]>([]);
  const [salarySacrifices, setSalarySacrifices] = useState<SalarySacrificeEntry[]>([]);
  const [novatedLeases, setNovatedLeases] = useState<NovatedLeaseEntry[]>([]);
  const [deductions, setDeductions] = useState<DeductionsData>(DEFAULT_DEDUCTIONS);
  const [familyBenefits, setFamilyBenefits] = useState<FamilyBenefitsData>(DEFAULT_FAMILY_BENEFITS);
  const [studentLoanBalance, setStudentLoanBalance] = useState<number>(0);

  // Preset state
  const [currentPreset, setCurrentPreset] = useState<PresetType | undefined>('standard');

  // Tax year state
  const [taxYear, setTaxYear] = useState<TaxYear>(DEFAULT_TAX_YEAR);

  // Tax category state
  const [taxCategory, setTaxCategory] = useState<TaxCategory>(DEFAULT_TAX_CATEGORY);

  // Watch form values
  const watchedSalary = form.watch('salary');
  const watchedFrequency = form.watch('frequency');
  const watchedInputMode = form.watch('salaryInputMode');
  const voluntarySuper = form.watch('voluntarySuper');
  const packagingCap = form.watch('packagingCap');
  const isProratedHours = form.watch('isProratedHours');
  const proratedHours = form.watch('proratedHours');
  const proratedFrequency = form.watch('proratedFrequency');

  // Calculate target net annual if input mode is 'net'
  const targetNetAnnual = useMemo(() => {
    if (watchedInputMode === 'net' && parseFloat(watchedSalary) > 0) {
      return toAnnualAmount(parseFloat(watchedSalary), watchedFrequency);
    }
    return undefined;
  }, [watchedInputMode, watchedSalary, watchedFrequency]);

  // Use the calculation hook
  const calculations = useSalaryCalculations({
    baseSalary: parseFloat(watchedSalary) || 0,
    frequency: watchedFrequency,
    isProratedHours,
    proratedHours: parseFloat(proratedHours) || 0,
    proratedFrequency,
    overtimeEntries,
    salarySacrifices,
    fringeBenefits,
    taxSettings,
    taxCountry: taxConfig.country,
    taxYear,
    taxCategory,
    voluntarySuper: parseFloat(voluntarySuper) || 0,
    packagingCap,
    inputMode: watchedInputMode,
    targetNetAnnual,
  });

  // Format currency helper
  const formatCurrency = useCallback((amount: number) => {
    const currencyCode = getTaxSystem(taxConfig.country, taxYear, taxCategory).currency;
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(amount);
  }, [taxConfig.country, taxYear, taxCategory]);

  // Auto-save salary as income with debouncing
  useEffect(() => {
    // Only auto-save if there's a valid salary amount
    const annualSalary = calculations.annualSalary;
    if (annualSalary <= 0) return;

    // Clear any pending save
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Debounce the save to avoid excessive API calls
    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        // Check if we already have a 'Salary' income entry
        const existingSalaryIncome = incomes.find(i => i.source === 'Salary');
        
        if (existingSalaryIncome) {
          // Update existing salary income
          await updateIncome(
            existingSalaryIncome.id,
            'Salary',
            annualSalary,
            'annually',
            'preTax',
            undefined
          );
          console.log('[SalaryCalculator] Auto-updated salary income:', annualSalary);
        } else {
          // Create new salary income
          await addIncome(
            'Salary',
            annualSalary,
            'annually',
            'preTax',
            undefined
          );
          console.log('[SalaryCalculator] Auto-saved new salary income:', annualSalary);
        }
      } catch (error) {
        console.error('[SalaryCalculator] Failed to auto-save salary:', error);
      }
    }, 1000); // 1 second debounce

    // Cleanup on unmount or when salary changes
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [calculations.annualSalary, incomes, addIncome, updateIncome]);

  // Tax setting change handler
  const handleTaxSettingChange = useCallback((setting: keyof TaxSettings, value: boolean | number) => {
    setTaxSettings(prev => ({ ...prev, [setting]: value }));
  }, []);

  // Reset calculator
  const resetCalculator = useCallback(() => {
    form.reset(DEFAULT_FORM_VALUES);
    setTaxSettings(DEFAULT_TAX_SETTINGS);
    setOvertimeEntries([]);
    setFringeBenefits([]);
    setSalarySacrifices([]);
    setNovatedLeases([]);
    setDeductions(DEFAULT_DEDUCTIONS);
    setFamilyBenefits(DEFAULT_FAMILY_BENEFITS);
    setStudentLoanBalance(0);
    setCurrentPreset('standard');
    setTaxCategory(DEFAULT_TAX_CATEGORY);
  }, [form]);

  // Handle preset selection
  const handlePresetSelect = useCallback((preset: Preset) => {
    // Apply tax settings
    setTaxSettings(prev => ({
      ...prev,
      ...preset.taxSettings,
    }));

    // Apply form defaults
    if (preset.formDefaults.frequency) {
      form.setValue('frequency', preset.formDefaults.frequency);
    }
    if (preset.formDefaults.packagingCap !== undefined) {
      form.setValue('packagingCap', preset.formDefaults.packagingCap);
    }

    // Apply salary sacrifices if provided
    if (preset.salarySacrifices) {
      setSalarySacrifices(preset.salarySacrifices);
    } else {
      setSalarySacrifices([]);
    }

    // Update current preset
    setCurrentPreset(preset.id);
  }, [form]);

  // Voluntary super change handler
  const handleVoluntarySuperChange = useCallback((value: string) => {
    const newValue = Math.min(parseFloat(value) || 0, calculations.baseRemainingCap);
    form.setValue('voluntarySuper', newValue.toString());
  }, [form, calculations.baseRemainingCap]);

  // Packaging cap change handler
  const handlePackagingCapChange = useCallback((cap: number) => {
    form.setValue('packagingCap', cap);
  }, [form]);

  // Handle private health insurance affecting Medicare
  useEffect(() => {
    if (taxSettings.includePrivateHealth && taxSettings.includeMedicare) {
      setTaxSettings(prev => ({ ...prev, includeMedicare: false }));
    }
  }, [taxSettings.includePrivateHealth, taxSettings.includeMedicare]);

  // ── Persistent calculator state per logged-in user ──────────────────
  //
  // On mount (and whenever the user changes), load any previously-saved
  // calculator snapshot from the backend and rehydrate every input. While
  // unauthenticated, the calculator works as before but nothing persists.
  //
  // Then on any state change (debounced 1s), serialise the snapshot and
  // PUT it to the backend. The hydration guard prevents the empty initial
  // state from overwriting the loaded one in the brief gap between mount
  // and load-complete.
  useEffect(() => {
    if (!user) {
      setStateLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await financeClient.getSalaryCalculatorState({});
        if (cancelled) return;
        if (res.stateJson) {
          try {
            const saved = JSON.parse(res.stateJson);
            // Form fields
            if (saved.salary !== undefined) form.setValue('salary', saved.salary);
            if (saved.frequency) form.setValue('frequency', saved.frequency);
            if (saved.salaryInputMode) form.setValue('salaryInputMode', saved.salaryInputMode);
            if (saved.voluntarySuper !== undefined) form.setValue('voluntarySuper', saved.voluntarySuper);
            if (saved.packagingCap !== undefined) form.setValue('packagingCap', saved.packagingCap);
            if (saved.isProratedHours !== undefined) form.setValue('isProratedHours', saved.isProratedHours);
            if (saved.proratedHours !== undefined) form.setValue('proratedHours', saved.proratedHours);
            if (saved.proratedFrequency) form.setValue('proratedFrequency', saved.proratedFrequency);
            // Setting state
            if (saved.taxSettings) setTaxSettings(saved.taxSettings);
            if (saved.taxYear) setTaxYear(saved.taxYear);
            if (saved.taxCategory) setTaxCategory(saved.taxCategory);
            if (saved.currentPreset) setCurrentPreset(saved.currentPreset);
            if (saved.studentLoanBalance !== undefined) setStudentLoanBalance(saved.studentLoanBalance);
            // Array entries
            if (Array.isArray(saved.overtimeEntries)) setOvertimeEntries(saved.overtimeEntries);
            if (Array.isArray(saved.fringeBenefits)) setFringeBenefits(saved.fringeBenefits);
            if (Array.isArray(saved.salarySacrifices)) setSalarySacrifices(saved.salarySacrifices);
            if (Array.isArray(saved.novatedLeases)) setNovatedLeases(saved.novatedLeases);
            // Nested objects
            if (saved.deductions) setDeductions(saved.deductions);
            if (saved.familyBenefits) setFamilyBenefits(saved.familyBenefits);
            if (res.updatedAt) {
              const d = new Date(Number(res.updatedAt.seconds) * 1000);
              setSavedAt(d);
            }
          } catch (parseErr) {
            console.error('[SalaryCalculator] Failed to parse saved state JSON:', parseErr);
          }
        }
      } catch (err) {
        console.error('[SalaryCalculator] Failed to load saved state:', err);
      } finally {
        if (!cancelled) setStateLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only run on user change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  // Auto-save calculator state (debounced) whenever any input changes.
  useEffect(() => {
    if (!user || !stateLoaded) return;

    if (stateSaveTimeoutRef.current) {
      clearTimeout(stateSaveTimeoutRef.current);
    }
    stateSaveTimeoutRef.current = setTimeout(async () => {
      try {
        const snapshot = {
          salary: watchedSalary,
          frequency: watchedFrequency,
          salaryInputMode: watchedInputMode,
          voluntarySuper,
          packagingCap,
          isProratedHours,
          proratedHours,
          proratedFrequency,
          taxSettings,
          taxYear,
          taxCategory,
          currentPreset,
          studentLoanBalance,
          overtimeEntries,
          fringeBenefits,
          salarySacrifices,
          novatedLeases,
          deductions,
          familyBenefits,
        };
        const res = await financeClient.saveSalaryCalculatorState({
          stateJson: JSON.stringify(snapshot),
        });
        if (res.updatedAt) {
          setSavedAt(new Date(Number(res.updatedAt.seconds) * 1000));
        }
        setSaveError(null);
      } catch (err) {
        console.error('[SalaryCalculator] Failed to save state:', err);
        setSaveError(err instanceof Error ? err.message : 'Save failed');
      }
    }, 1000);

    return () => {
      if (stateSaveTimeoutRef.current) {
        clearTimeout(stateSaveTimeoutRef.current);
      }
    };
  }, [
    user, stateLoaded,
    watchedSalary, watchedFrequency, watchedInputMode,
    voluntarySuper, packagingCap, isProratedHours, proratedHours, proratedFrequency,
    taxSettings, taxYear, taxCategory, currentPreset, studentLoanBalance,
    overtimeEntries, fringeBenefits, salarySacrifices, novatedLeases,
    deductions, familyBenefits,
  ]);

  // Load calculator state from URL parameters
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const calculatorParam = urlParams.get('calculator');
      if (!calculatorParam) return;

      const decoded = decodeSharePayload(calculatorParam) as
        | (Record<string, unknown> & {
            salary?: string;
            frequency?: SalaryFormData['frequency'];
            salaryInputMode?: SalaryFormData['salaryInputMode'];
            voluntarySuper?: string;
            packagingCap?: number;
            isProratedHours?: boolean;
            proratedHours?: string;
            proratedFrequency?: SalaryFormData['proratedFrequency'];
            taxSettings?: TaxSettings;
            country?: typeof taxConfig.country;
            taxYear?: TaxYear;
            taxCategory?: TaxCategory;
            studentLoanBalance?: number;
            salarySacrifices?: SalarySacrificeEntry[];
            overtimeEntries?: OvertimeEntry[];
            fringeBenefits?: FringeBenefitEntry[];
            novatedLeases?: NovatedLeaseEntry[];
            deductions?: DeductionsData;
            familyBenefits?: FamilyBenefitsData;
          })
        | null;
      if (!decoded) return;

      if (decoded.salary !== undefined) form.setValue('salary', decoded.salary);
      if (decoded.frequency)            form.setValue('frequency', decoded.frequency);
      if (decoded.salaryInputMode)      form.setValue('salaryInputMode', decoded.salaryInputMode);
      if (decoded.voluntarySuper !== undefined) form.setValue('voluntarySuper', decoded.voluntarySuper);
      if (decoded.packagingCap !== undefined)   form.setValue('packagingCap', decoded.packagingCap);
      if (decoded.isProratedHours !== undefined) form.setValue('isProratedHours', decoded.isProratedHours);
      if (decoded.proratedHours !== undefined) form.setValue('proratedHours', decoded.proratedHours);
      if (decoded.proratedFrequency)    form.setValue('proratedFrequency', decoded.proratedFrequency);
      if (decoded.taxSettings)          setTaxSettings(decoded.taxSettings);
      if (decoded.taxYear)              setTaxYear(decoded.taxYear);
      if (decoded.taxCategory)          setTaxCategory(decoded.taxCategory);
      if (decoded.studentLoanBalance !== undefined) setStudentLoanBalance(decoded.studentLoanBalance);
      if (Array.isArray(decoded.salarySacrifices)) setSalarySacrifices(decoded.salarySacrifices);
      if (Array.isArray(decoded.overtimeEntries))  setOvertimeEntries(decoded.overtimeEntries);
      if (Array.isArray(decoded.fringeBenefits))   setFringeBenefits(decoded.fringeBenefits);
      if (Array.isArray(decoded.novatedLeases))    setNovatedLeases(decoded.novatedLeases);
      if (decoded.deductions)            setDeductions(decoded.deductions);
      if (decoded.familyBenefits)        setFamilyBenefits(decoded.familyBenefits);

      if (decoded.country && decoded.country !== taxConfig.country) {
        updateTaxConfig({ country: decoded.country });
      }

      // Clean URL once we've consumed the payload.
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
      console.error('Error loading shared calculator:', error);
    }
  }, [form, taxConfig.country, updateTaxConfig]);

  // ── Export handlers ─────────────────────────────────────────────
  const buildReportInput = useCallback(() => ({
    generatedAt: new Date(),
    userName: user?.displayName ?? null,
    userEmail: user?.email ?? null,
    taxCountry: taxConfig.country,
    taxYear,
    taxCategory,
    breakdowns: calculations.breakdowns,
    taxSettings,
    salaryInputMode: watchedInputMode,
    salaryInputFrequency: watchedFrequency,
    isProratedHours,
    proratedHours,
    proratedFrequency,
    salarySacrificeCalculation: calculations.salarySacrificeCalculation,
    salarySacrifices,
    overtimeEntries,
    fringeBenefits,
    novatedLeases,
    deductions,
    familyBenefits,
    superannuation: calculations.superannuation,
    taxableIncome: calculations.taxableIncome,
    medicareLevy: calculations.medicareLevy,
    voluntarySuperContribution: calculations.voluntarySuperContribution,
    voluntarySuperTaxSavings: calculations.voluntarySuperTaxSavings,
    baseRemainingCap: calculations.baseRemainingCap,
    remainingConcessionalCap: calculations.remainingConcessionalCap,
    studentLoanBalance,
    studentLoanRate: calculations.studentLoanRate,
  }), [
    user, taxConfig.country, taxYear, taxCategory,
    calculations.breakdowns, calculations.salarySacrificeCalculation,
    calculations.superannuation, calculations.taxableIncome,
    calculations.medicareLevy, calculations.voluntarySuperContribution,
    calculations.voluntarySuperTaxSavings, calculations.baseRemainingCap,
    calculations.remainingConcessionalCap, calculations.studentLoanRate,
    taxSettings, watchedInputMode, watchedFrequency, isProratedHours,
    proratedHours, proratedFrequency, salarySacrifices, overtimeEntries,
    fringeBenefits, novatedLeases, deductions, familyBenefits, studentLoanBalance,
  ]);

  const handleDownload = useCallback(async () => {
    try {
      const input = buildReportInput();
      const blob = await generateSalaryPdf(input);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultReportFilename(input.generatedAt);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke a tick later so Safari has a chance to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({
        title: 'Salary report downloaded',
        description: a.download,
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Could not generate PDF',
        variant: 'destructive',
      });
    }
  }, [buildReportInput, toast]);

  const handleShareLink = useCallback(async () => {
    try {
      const input = buildReportInput();
      const text = buildSalaryReportText(input);
      const url = buildShareUrl({
        origin: window.location.origin,
        pathname: window.location.pathname,
        salary: watchedSalary,
        frequency: watchedFrequency,
        salaryInputMode: watchedInputMode,
        voluntarySuper,
        packagingCap,
        isProratedHours,
        proratedHours,
        proratedFrequency,
        taxSettings,
        taxCountry: taxConfig.country,
        taxYear,
        taxCategory,
        studentLoanBalance,
        salarySacrifices,
        overtimeEntries,
        fringeBenefits,
        novatedLeases,
        deductions,
        familyBenefits,
      });

      // Native share (mobile, supported desktop browsers) gets the rich
      // text + a return URL so a tap re-opens the calculator.
      const nav = window.navigator as Navigator & {
        share?: (data: ShareData) => Promise<void>;
        canShare?: (data: ShareData) => boolean;
      };
      const sharePayload: ShareData = {
        title: 'My salary breakdown',
        text,
        url,
      };

      if (nav.share && (!nav.canShare || nav.canShare(sharePayload))) {
        await nav.share(sharePayload);
        return;
      }

      // Clipboard fallback. Copy the formatted text + URL so it pastes
      // cleanly into iMessage / Slack / email.
      await navigator.clipboard.writeText(`${text}\n\nOpen in calculator: ${url}`);
      toast({
        title: 'Copied to clipboard',
        description: 'Salary summary and shareable link are ready to paste.',
      });
    } catch (error) {
      // AbortError = user cancelled the share sheet; not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Error creating share link:', error);
      toast({
        title: 'Share failed',
        description: error instanceof Error ? error.message : 'Could not share',
        variant: 'destructive',
      });
    }
  }, [
    buildReportInput, watchedSalary, watchedFrequency, taxSettings,
    taxConfig.country, taxYear, taxCategory,
    watchedInputMode, voluntarySuper, packagingCap, isProratedHours,
    proratedHours, proratedFrequency, studentLoanBalance,
    salarySacrifices, overtimeEntries, fringeBenefits, novatedLeases,
    deductions, familyBenefits, toast,
  ]);

  // Print: temporarily mark <body> so the print stylesheet hides the
  // app shell and reveals the print-only header.
  const handlePrint = useCallback(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    body.classList.add('print-salary-report');
    const cleanup = () => {
      body.classList.remove('print-salary-report');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    // Belt-and-braces: some browsers don't fire afterprint reliably.
    setTimeout(cleanup, 5000);
    window.print();
  }, []);

  const printReportInput = useMemo(() => buildReportInput(), [buildReportInput]);

  return (
    <div className="print-root" ref={calculatorRef}>
      <SalaryPrintReport input={printReportInput} />

      <div className="salary-screen-content flex min-w-0 flex-col space-y-6">
        <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left Column - Inputs (hidden in printed report) */}
          <div className="min-w-0 space-y-6" data-no-print="true">
            {/* Preset and Tax Year Selectors */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <PresetSelector
                currentPreset={currentPreset}
                onPresetSelect={handlePresetSelect}
              />
              <TaxYearSelector
                value={taxYear}
                onChange={setTaxYear}
              />
            </div>

            {/* Persistence status — only when signed in. */}
            {user && (
              <div className="text-xs text-muted-foreground">
                {saveError ? (
                  <span className="text-red-500">Couldn&apos;t save: {saveError}</span>
                ) : savedAt ? (
                  <span>Saved to your account · {savedAt.toLocaleTimeString()}</span>
                ) : stateLoaded ? (
                  <span>Changes will save automatically</span>
                ) : (
                  <span>Loading your saved settings…</span>
                )}
              </div>
            )}

          {/* Income Card */}
          <Card>
            <CardContent className="pt-6">
              <IncomeSection
                form={form}
                onReset={resetCalculator}
                formatCurrency={formatCurrency}
                annualSalary={calculations.annualSalary}
              />
            </CardContent>
          </Card>

          {/* Extra Settings Card */}
          <Card>
            <CardContent className="pt-6">
              <ExtraSettings
                taxSettings={taxSettings}
                onTaxSettingChange={handleTaxSettingChange}
                taxCategory={taxCategory}
                onTaxCategoryChange={setTaxCategory}
                taxYear={taxYear}
                overtimeEntries={overtimeEntries}
                onOvertimeEntriesChange={setOvertimeEntries}
                fringeBenefits={fringeBenefits}
                onFringeBenefitsChange={setFringeBenefits}
                novatedLeases={novatedLeases}
                onNovatedLeasesChange={setNovatedLeases}
                salarySacrifices={salarySacrifices}
                onSalarySacrificesChange={setSalarySacrifices}
                packagingCap={packagingCap}
                onPackagingCapChange={handlePackagingCapChange}
                salarySacrificeCalculation={calculations.salarySacrificeCalculation}
                voluntarySuper={voluntarySuper}
                onVoluntarySuperChange={handleVoluntarySuperChange}
                baseRemainingCap={calculations.baseRemainingCap}
                remainingConcessionalCap={calculations.remainingConcessionalCap}
                voluntarySuperTaxSavings={calculations.voluntarySuperTaxSavings}
                superannuation={calculations.superannuation}
                deductions={deductions}
                onDeductionsChange={setDeductions}
                familyBenefits={familyBenefits}
                onFamilyBenefitsChange={setFamilyBenefits}
                medicareLevy={calculations.medicareLevy}
                studentLoanRepayment={calculations.studentLoanRepayment}
                studentLoanRate={calculations.studentLoanRate}
                studentLoanBalance={studentLoanBalance}
                onStudentLoanBalanceChange={setStudentLoanBalance}
                taxableIncome={calculations.taxableIncome}
                formatCurrency={formatCurrency}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Summary */}
        <div className="min-w-0">
          <SummaryPanel
            breakdowns={calculations.breakdowns}
            taxSettings={taxSettings}
            salarySacrificeCalculation={calculations.salarySacrificeCalculation}
            salarySacrifices={salarySacrifices}
            superannuation={calculations.superannuation}
            studentLoanRate={calculations.studentLoanRate}
            lito={calculations.lito}
            formatCurrency={formatCurrency}
          />
        </div>
      </div>

      {/* Visualization Section */}
      <Card>
        <CardHeader>
          <CardTitle>Income Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex min-w-0 flex-col gap-6 md:flex-row">
            <div className="min-w-0 w-full md:w-1/2">
              <SalaryBreakdownChart
                grossIncome={calculations.totalAnnualIncome}
                tax={calculations.incomeTax}
                medicare={calculations.medicareLevy}
                studentLoan={calculations.studentLoanRepayment}
                superannuation={calculations.superannuation}
                voluntarySuper={calculations.voluntarySuperContribution}
                overtime={calculations.totalOvertimeAmount}
                fringeBenefits={calculations.fringeBenefitsCalculation.totalFBT}
                salarySacrifice={calculations.salarySacrificeCalculation.nonTaxDeductibleSacrifice}
              />
            </div>
            <div className="min-w-0 w-full space-y-4 md:w-1/2">
              {/* Tax Band Visualization */}
              <div className="rounded-lg border p-4">
                <h3 className="text-sm font-medium mb-3">Tax Brackets</h3>
                <div className="h-12 relative w-full bg-muted rounded-md overflow-hidden">
                  <div className="absolute inset-0 flex">
                    <div className="bg-emerald-100 dark:bg-emerald-900/30 h-full" style={{ width: '18%' }}>
                      <div className="text-[9px] p-1 text-emerald-900 dark:text-emerald-200">0%</div>
                    </div>
                    <div className="bg-emerald-200 dark:bg-emerald-800/40 h-full" style={{ width: '27%' }}>
                      <div className="text-[9px] p-1 text-emerald-900 dark:text-emerald-200">19%</div>
                    </div>
                    <div className="bg-amber-200 dark:bg-amber-700/50 h-full" style={{ width: '30%' }}>
                      <div className="text-[9px] p-1 text-amber-900 dark:text-amber-100">32.5%</div>
                    </div>
                    <div className="bg-orange-300 dark:bg-orange-600/60 h-full" style={{ width: '15%' }}>
                      <div className="text-[9px] p-1 text-orange-900 dark:text-orange-100">37%</div>
                    </div>
                    <div className="bg-red-400 dark:bg-red-500/70 h-full" style={{ width: '10%' }}>
                      <div className="text-[9px] p-1 text-white">45%</div>
                    </div>
                  </div>
                  {/* Income marker */}
                  <div 
                    className="absolute top-0 bottom-0 w-0.5 bg-black dark:bg-white z-10"
                    style={{ 
                      left: `${Math.min(100, (calculations.taxableIncome / 200000) * 100)}%`,
                      boxShadow: '0 0 4px rgba(0,0,0,0.5)'
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>$0</span>
                  <span>$18.2k</span>
                  <span>$45k</span>
                  <span>$120k</span>
                  <span>$180k</span>
                  <span>$200k+</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Your taxable income: {formatCurrency(calculations.taxableIncome)}
                </div>
              </div>

              {/* Income Percentile */}
              <div className="rounded-lg border p-4">
                <h3 className="text-sm font-medium mb-3">Income Percentile</h3>
                <div className="h-4 relative w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (calculations.totalAnnualIncome / 200000) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Lower</span>
                  <span>Higher</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between" data-no-print="true">
          <span className="text-sm text-muted-foreground">
            Tax Year: {taxYear}
          </span>
          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto">
            <Button variant="outline" size="sm" onClick={handleDownload} className="w-full justify-center sm:w-auto">
              <Download className="h-4 w-4" aria-hidden="true" />
              Download PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleShareLink} className="w-full justify-center sm:w-auto">
              <Share2 className="h-4 w-4" aria-hidden="true" />
              Share
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} className="w-full justify-center sm:w-auto">
              <Printer className="h-4 w-4" aria-hidden="true" />
              Save as PDF
            </Button>
          </div>
        </CardFooter>
      </Card>
      </div>
    </div>
  );
}

function SalaryPrintReport({ input }: { input: ReportInput }) {
  const model = buildSalaryReportViewModel(input);
  const annualSection = model.detailSections.find(section => section.title === 'Annual breakdown');
  const secondarySections = model.detailSections.filter(section => section.title !== 'Annual breakdown');

  return (
    <section className="salary-print-report" data-testid="salary-print-report">
      <header className="salary-print-header">
        <div>
          <p className="salary-print-kicker">PFinance</p>
          <h1>{model.title}</h1>
          <p className="salary-print-meta">
            Generated {model.generatedDate} · {model.taxSystemLabel} · {model.taxYear}
          </p>
          {model.preparedFor && (
            <p className="salary-print-prepared">Prepared for {model.preparedFor}</p>
          )}
        </div>
        <div className="salary-print-rate">
          <span>Effective tax</span>
          <strong>{model.effectiveTaxRate}</strong>
        </div>
      </header>

      <div className="salary-print-hero">
        <div className="salary-print-hero-main">
          <span>Annual take-home pay</span>
          <strong>{model.heroCards[0]?.value}</strong>
        </div>
        <div className="salary-print-metrics">
          {model.heroCards.slice(1).map((metric) => (
            <div key={metric.label} className={`salary-print-metric ${toneClass(metric.tone)}`}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="salary-print-columns">
        {annualSection && <PrintSection section={annualSection} />}
        <PrintSection
          section={{
            title: 'Take-home by pay frequency',
            rows: model.frequencyRows,
          }}
        />
      </div>

      {secondarySections.length > 0 && (
        <div className="salary-print-section-grid">
          {secondarySections.map((section) => (
            <PrintSection key={section.title} section={section} compact />
          ))}
        </div>
      )}

      <footer className="salary-print-footer">
        <strong>Total package value: {model.totalPackageValue}</strong>
        <span>
          Estimate only. Tax settings and thresholds can change; confirm details before making financial decisions.
        </span>
      </footer>
    </section>
  );
}

function PrintSection({ section, compact = false }: { section: ReportSection; compact?: boolean }) {
  return (
    <section className={compact ? 'salary-print-section compact' : 'salary-print-section'}>
      <h2>{section.title}</h2>
      <div className="salary-print-rows">
        {section.rows.map((row) => (
          <div key={`${section.title}-${row.label}-${row.value}`} className="salary-print-row">
            <div>
              <span>{row.label}</span>
              {row.note && <em>{row.note}</em>}
            </div>
            <strong className={toneClass(row.tone)}>{row.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function toneClass(tone?: ReportMetricTone): string {
  switch (tone) {
    case 'positive':
      return 'tone-positive';
    case 'negative':
      return 'tone-negative';
    case 'accent':
      return 'tone-accent';
    default:
      return 'tone-neutral';
  }
}
