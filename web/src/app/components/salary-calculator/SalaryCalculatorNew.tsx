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

const SalaryBreakdownChart = dynamic(() => import('../SalaryBreakdownChart'), { ssr: false });

export function SalaryCalculatorNew() {
  const { taxConfig, updateTaxConfig, addIncome, updateIncome, incomes } = useFinance();
  const calculatorRef = useRef<HTMLDivElement>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Load calculator state from URL parameters
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const calculatorParam = urlParams.get('calculator');

        if (calculatorParam) {
          const decodedData = JSON.parse(atob(calculatorParam));

          form.setValue('salary', decodedData.salary);
          form.setValue('frequency', decodedData.frequency);

          if (decodedData.taxSettings) {
            setTaxSettings(decodedData.taxSettings);
          }

          if (decodedData.country && decodedData.country !== taxConfig.country) {
            updateTaxConfig({ country: decodedData.country });
          }

          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (error) {
        console.error('Error loading shared calculator:', error);
      }
    }
  }, [form, taxConfig.country, updateTaxConfig]);

  // Export handlers
  const handleDownload = async () => {
    if (!calculatorRef.current) return;

    try {
      const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);
      const canvas = await html2canvas(calculatorRef.current, {
        scale: 2,
        logging: false,
        useCORS: true,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`salary-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  const handleShareLink = () => {
    try {
      const shareData = {
        salary: watchedSalary,
        frequency: watchedFrequency,
        taxSettings,
        country: taxConfig.country,
      };

      const encodedData = btoa(JSON.stringify(shareData));
      const shareableUrl = `${window.location.origin}${window.location.pathname}?calculator=${encodedData}`;

      navigator.clipboard.writeText(shareableUrl);
      alert('Link copied to clipboard!');
    } catch (error) {
      console.error('Error creating share link:', error);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col space-y-6" ref={calculatorRef}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Inputs */}
        <div className="space-y-6">
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
        <div>
          <SummaryPanel
            breakdowns={calculations.breakdowns}
            taxSettings={taxSettings}
            salarySacrificeCalculation={calculations.salarySacrificeCalculation}
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
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-1/2">
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
            <div className="w-full md:w-1/2 space-y-4">
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
        <CardFooter className="flex justify-between flex-wrap gap-2">
          <span className="text-sm text-muted-foreground">
            Tax Year: {taxYear}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              Download
            </Button>
            <Button variant="outline" size="sm" onClick={handleShareLink}>
              Share
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              Print
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
