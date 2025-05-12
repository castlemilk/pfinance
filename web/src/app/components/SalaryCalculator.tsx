'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { IncomeFrequency, TaxSettings } from '../types';
import { useFinance } from '../context/FinanceContext';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getTaxSystem, calculateTaxWithBrackets } from '../constants/taxSystems';
import SalaryBreakdownChart from '../components/SalaryBreakdownChart';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InfoIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { v4 as uuidv4 } from 'uuid';

type FormData = {
  salary: string;
  frequency: IncomeFrequency;
  voluntarySuper: string;
  isProratedHours: boolean;
  proratedHours: string;
  proratedFrequency: IncomeFrequency;
  packagingCap: number;
};

type OvertimeEntry = {
  id: string;
  hours: string;
  rate: string;
  frequency: IncomeFrequency;
  includeSuper: boolean;
};

type FringeBenefitEntry = {
  id: string;
  description: string;
  amount: string;
  frequency: IncomeFrequency;
  type: "taxable" | "exempt";
  reportable: boolean;
};

type SalarySacrificeEntry = {
  id: string;
  description: string;
  amount: string;
  frequency: IncomeFrequency;
  isTaxDeductible: boolean;
};

const ATO_PERSONAL_SUPER_CONTRIBUTION_LIMIT = 30000;
const ATO_PERSONAL_SUPER_CONTRIBUTION_URL = "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/how-to-save-more-in-your-super/personal-super-contributions"

// FBT rate and cap
const FBT_RATE = 0.47;
// For NFPs and charities - used in tooltips to explain FBT exemption caps
const FBT_EXEMPT_CAP_INFO = "Some organizations (like NFPs and charities) may have an FBT exemption cap that varies by organization.";
const ATO_FBT_URL = "https://www.ato.gov.au/rates/fbt/";
const ATO_SALARY_SACRIFICE_URL = "https://www.ato.gov.au/individuals/income-and-deductions/income-you-must-declare/salary-and-wages/salary-sacrifice-arrangements/";

// Common salary packaging caps reference (not used programmatically, just for the tooltip)
const COMMON_PACKAGING_CAPS = [
  { value: 15899, label: "Public hospital/health promotion charity" },
  { value: 18550, label: "Public benevolent institution" },
  { value: 30000, label: "FBT-exempt organizations" },
  { value: 17000, label: "Other NFPs" }
];

// Add constants for student loan repayment
const ATO_STUDENT_LOAN_URL = "https://www.ato.gov.au/tax-rates-and-codes/study-and-training-support-loans-rates-and-repayment-thresholds";

// Define the HELP/STSL repayment thresholds and rates for 2023-24
const HELP_REPAYMENT_THRESHOLDS = [
  { min: 0, max: 51550, rate: 0 },
  { min: 51550, max: 59518, rate: 0.01 },
  { min: 59519, max: 63089, rate: 0.02 },
  { min: 63090, max: 66875, rate: 0.025 },
  { min: 66876, max: 70888, rate: 0.03 },
  { min: 70889, max: 75140, rate: 0.035 },
  { min: 75141, max: 79649, rate: 0.04 },
  { min: 79650, max: 84429, rate: 0.045 },
  { min: 84430, max: 89494, rate: 0.05 },
  { min: 89495, max: 94865, rate: 0.055 },
  { min: 94866, max: 100557, rate: 0.06 },
  { min: 100558, max: 106591, rate: 0.065 },
  { min: 106592, max: 112990, rate: 0.07 },
  { min: 112991, max: 119769, rate: 0.075 },
  { min: 119770, max: 126955, rate: 0.08 },
  { min: 126956, max: 134572, rate: 0.085 },
  { min: 134573, max: 142646, rate: 0.09 },
  { min: 142647, max: 151204, rate: 0.095 },
  { min: 151205, max: Infinity, rate: 0.10 }
];

// Add constants for Medicare levy
const ATO_MEDICARE_LEVY_URL = "https://www.ato.gov.au/individuals/medicare-and-private-health-insurance/medicare-levy/";
const MEDICARE_LEVY_RATE = 0.02; // 2%

export function SalaryCalculator() {
  const { taxConfig, updateTaxConfig } = useFinance();
  const [taxSettings, setTaxSettings] = useState<TaxSettings>({
    includeSuper: true,
    superRate: 11.5,
    includeMedicare: true,
    medicareExemption: false,
    includeSeniorOffset: false,
    includeStudentLoan: false,
    studentLoanRate: 2,
    includeDependentChildren: false,
    includeSpouse: false,
    includePrivateHealth: false,
    includeVoluntarySuper: false,
  });
  const [overtimeEntries, setOvertimeEntries] = useState<OvertimeEntry[]>([]);
  const [fringeBenefits, setFringeBenefits] = useState<FringeBenefitEntry[]>([]);
  const [salarySacrifices, setSalarySacrifices] = useState<SalarySacrificeEntry[]>([]);

  const form = useForm<FormData>({
    defaultValues: {
      salary: '105000',
      frequency: 'annually',
      voluntarySuper: '0',
      isProratedHours: false,
      proratedHours: '38',
      proratedFrequency: 'weekly',
      packagingCap: 15899,
    },
  });

  const watchedSalary = form.watch('salary');
  const watchedFrequency = form.watch('frequency');
  const isProratedHours = form.watch('isProratedHours');
  const proratedHours = form.watch('proratedHours');
  const proratedFrequency = form.watch('proratedFrequency');
  
  const calculatorRef = useRef<HTMLDivElement>(null);
  
  // Convert salary to annual amount for calculations
  const annualSalary = useMemo(() => {
    const numericSalary = parseFloat(watchedSalary) || 0;
    let salary = numericSalary;
    
    if (watchedFrequency === 'weekly') {
      salary = numericSalary * 52;
    } else if (watchedFrequency === 'fortnightly') {
      salary = numericSalary * 26;
    } else if (watchedFrequency === 'monthly') {
      salary = numericSalary * 12;
    }
    
    // Apply pro-rata calculation if enabled
    if (isProratedHours) {
      const hours = parseFloat(proratedHours) || 0;
      // Standard hours varies based on the frequency
      const standardHours = proratedFrequency === 'weekly' ? 38 : 76; // 38 * 2 for fortnightly
      const proRataRatio = hours / standardHours;
      
      return salary * proRataRatio;
    }
    
    return salary;
  }, [watchedSalary, watchedFrequency, isProratedHours, proratedHours, proratedFrequency]);

  // Calculate total overtime
  const totalOvertimeAmount = useMemo(() => {
    return overtimeEntries.reduce((total, entry) => {
      const hours = parseFloat(entry.hours) || 0;
      const rate = parseFloat(entry.rate) || 0;
      
      let amount = hours * rate;
      
      // Convert to annual amount based on frequency
      if (entry.frequency === 'weekly') {
        amount = amount * 52;
      } else if (entry.frequency === 'fortnightly') {
        amount = amount * 26;
      } else if (entry.frequency === 'monthly') {
        amount = amount * 12;
      }
      
      return total + amount;
    }, 0);
  }, [overtimeEntries]);

  // Calculate total income (salary + overtime)
  const totalAnnualIncome = useMemo(() => {
    return annualSalary + totalOvertimeAmount;
  }, [annualSalary, totalOvertimeAmount]);

  // Calculate salary sacrifice
  const salarySacrificeCalculation = useMemo(() => {
    const totalSalarySacrifice = salarySacrifices.reduce((total, ss) => {
      const amount = parseFloat(ss.amount) || 0;
      
      // Convert to annual amount
      let annualAmount = amount;
      if (ss.frequency === 'weekly') {
        annualAmount = amount * 52;
      } else if (ss.frequency === 'fortnightly') {
        annualAmount = amount * 26;
      } else if (ss.frequency === 'monthly') {
        annualAmount = amount * 12;
      }
      
      return total + annualAmount;
    }, 0);
    
    const taxDeductibleSacrifice = salarySacrifices
      .filter(ss => ss.isTaxDeductible)
      .reduce((total, ss) => {
        const amount = parseFloat(ss.amount) || 0;
        
        // Convert to annual amount
        let annualAmount = amount;
        if (ss.frequency === 'weekly') {
          annualAmount = amount * 52;
        } else if (ss.frequency === 'fortnightly') {
          annualAmount = amount * 26;
        } else if (ss.frequency === 'monthly') {
          annualAmount = amount * 12;
        }
        
        return total + annualAmount;
      }, 0);
    
    // Get the current packaging cap from the form
    const packagingCap = form.watch('packagingCap');
    
    // Calculate remaining annual packaging cap
    const remainingPackagingCap = Math.max(0, packagingCap - totalSalarySacrifice);
    
    // Calculate potential tax savings from salary sacrifice
    // This is a more accurate estimate based on tax brackets
    let estimatedTaxSavings = 0;
    if (taxDeductibleSacrifice > 0) {
      const taxSystem = getTaxSystem(taxConfig.country);
      const taxWithoutSacrifice = calculateTaxWithBrackets(totalAnnualIncome, taxSystem.brackets);
      const taxWithSacrifice = calculateTaxWithBrackets(totalAnnualIncome - taxDeductibleSacrifice, taxSystem.brackets);
      estimatedTaxSavings = taxWithoutSacrifice - taxWithSacrifice;
    }
    
    // Calculate annual cash benefit (sacrifice minus tax savings)
    const netCashBenefit = taxDeductibleSacrifice - estimatedTaxSavings;
    
    return {
      totalSalarySacrifice,
      taxDeductibleSacrifice,
      nonTaxDeductibleSacrifice: totalSalarySacrifice - taxDeductibleSacrifice,
      remainingPackagingCap,
      estimatedTaxSavings,
      netCashBenefit,
      packagingCap
    };
  }, [salarySacrifices, form, totalAnnualIncome, taxConfig.country]);

  // Calculate the taxable income with improved tax handling
  const taxableIncome = useMemo(() => {
    // Start with base salary + overtime
    let taxable = totalAnnualIncome;
    
    // Subtract tax deductible salary sacrifice
    // For NFP/Charity workers, this is typically up to the capped amount
    taxable -= salarySacrificeCalculation.taxDeductibleSacrifice;
    
    // Subtract concessional super contributions (handled separately)
    if (taxSettings.includeVoluntarySuper) {
      const volSuper = parseFloat(form.watch('voluntarySuper')) || 0;
      taxable -= volSuper;
    }
    
    return Math.max(0, taxable);
  }, [totalAnnualIncome, salarySacrificeCalculation.taxDeductibleSacrifice, taxSettings.includeVoluntarySuper, form]);

  // Calculate income tax using the tax brackets based on taxable income
  const incomeTax = useMemo(() => {
    const taxSystem = getTaxSystem(taxConfig.country);
    
    // Calculate actual tax on the reduced taxable income
    const calculatedTax = calculateTaxWithBrackets(taxableIncome, taxSystem.brackets);
    
    // Calculate what tax would have been without deductions for debugging
    const preSacrificeTax = calculateTaxWithBrackets(totalAnnualIncome, taxSystem.brackets);
    const taxSavings = preSacrificeTax - calculatedTax;
    
    // Log some debug information to verify calculations
    if (salarySacrificeCalculation.taxDeductibleSacrifice > 0) {
      console.log({
        grossIncome: totalAnnualIncome,
        taxableIncome,
        sacrifice: salarySacrificeCalculation.taxDeductibleSacrifice,
        preSacrificeTax,
        calculatedTax,
        taxSavings,
        netBenefit: salarySacrificeCalculation.taxDeductibleSacrifice - taxSavings
      });
    }
    
    return calculatedTax;
  }, [taxableIncome, totalAnnualIncome, taxConfig.country, salarySacrificeCalculation.taxDeductibleSacrifice]);

  // Calculate Medicare Levy (2% of taxable income)
  const medicareLevy = useMemo(() => {
    // No Medicare levy if private health insurance is selected or exemption applies
    if (!taxSettings.includeMedicare || taxSettings.medicareExemption || taxSettings.includePrivateHealth) {
      return 0;
    }
    // Calculate Medicare on reduced taxable income (after salary sacrifice)
    return taxableIncome * MEDICARE_LEVY_RATE;
  }, [taxableIncome, taxSettings.includeMedicare, taxSettings.medicareExemption, taxSettings.includePrivateHealth]);

  // Calculate student loan repayment using ATO thresholds
  const studentLoanRepayment = useMemo(() => {
    if (!taxSettings.includeStudentLoan) return 0;
    
    // Find the applicable repayment rate based on income
    const repaymentThreshold = HELP_REPAYMENT_THRESHOLDS.find(
      threshold => taxableIncome >= threshold.min && taxableIncome <= threshold.max
    );
    
    if (!repaymentThreshold) return 0;
    
    return taxableIncome * repaymentThreshold.rate;
  }, [taxableIncome, taxSettings.includeStudentLoan]);

  // Calculate fringe benefits
  const fringeBenefitsCalculation = useMemo(() => {
    const taxableFBT = fringeBenefits
      .filter(fb => fb.type === "taxable")
      .reduce((total, fb) => {
        const amount = parseFloat(fb.amount) || 0;
        
        // Convert to annual amount
        let annualAmount = amount;
        if (fb.frequency === 'weekly') {
          annualAmount = amount * 52;
        } else if (fb.frequency === 'fortnightly') {
          annualAmount = amount * 26;
        } else if (fb.frequency === 'monthly') {
          annualAmount = amount * 12;
        }
        
        return total + annualAmount;
      }, 0);
    
    const exemptFBT = fringeBenefits
      .filter(fb => fb.type === "exempt")
      .reduce((total, fb) => {
        const amount = parseFloat(fb.amount) || 0;
        
        // Convert to annual amount
        let annualAmount = amount;
        if (fb.frequency === 'weekly') {
          annualAmount = amount * 52;
        } else if (fb.frequency === 'fortnightly') {
          annualAmount = amount * 26;
        } else if (fb.frequency === 'monthly') {
          annualAmount = amount * 12;
        }
        
        return total + annualAmount;
      }, 0);
    
    // Calculate reportable fringe benefits amount (RFBA)
    // For taxable FBT, the reportable amount is grossed up by FBT rate
    const reportableFBT = fringeBenefits
      .filter(fb => fb.reportable)
      .reduce((total, fb) => {
        const amount = parseFloat(fb.amount) || 0;
        
        // Convert to annual amount
        let annualAmount = amount;
        if (fb.frequency === 'weekly') {
          annualAmount = amount * 52;
        } else if (fb.frequency === 'fortnightly') {
          annualAmount = amount * 26;
        } else if (fb.frequency === 'monthly') {
          annualAmount = amount * 12;
        }
        
        // If taxable, gross up the amount
        if (fb.type === "taxable") {
          annualAmount = annualAmount * (1 / (1 - FBT_RATE));
        }
        
        return total + annualAmount;
      }, 0);
    
    return {
      taxableFBT,
      exemptFBT,
      reportableFBT,
      totalFBT: taxableFBT + exemptFBT
    };
  }, [fringeBenefits]);

  // Calculate superannuation
  const superannuation = useMemo(() => {
    if (!taxSettings.includeSuper) return 0;
    
    // Calculate super on base salary
    let totalSuper = annualSalary * (taxSettings.superRate / 100);
    
    // Add super on overtime if applicable
    overtimeEntries.forEach(entry => {
      if (entry.includeSuper) {
        const hours = parseFloat(entry.hours) || 0;
        const rate = parseFloat(entry.rate) || 0;
        
        let overtimeAmount = hours * rate;
        
        // Convert to annual
        if (entry.frequency === 'weekly') {
          overtimeAmount = overtimeAmount * 52;
        } else if (entry.frequency === 'fortnightly') {
          overtimeAmount = overtimeAmount * 26;
        } else if (entry.frequency === 'monthly') {
          overtimeAmount = overtimeAmount * 12;
        }
        
        totalSuper += overtimeAmount * (taxSettings.superRate / 100);
      }
    });
    
    return totalSuper;
  }, [annualSalary, totalOvertimeAmount, taxSettings.includeSuper, taxSettings.superRate, overtimeEntries]);

  // Calculate base remaining cap before voluntary contributions
  const baseRemainingCap = useMemo((): number => {
    const baseSuper = superannuation;
    const maxCap = ATO_PERSONAL_SUPER_CONTRIBUTION_LIMIT;
    return Math.max(0, maxCap - baseSuper);
  }, [superannuation]);

  // Calculate voluntary super contribution
  const voluntarySuper = useMemo((): number => {
    if (!taxSettings.includeVoluntarySuper) return 0;
    const value = parseFloat(form.watch('voluntarySuper')) || 0;
    return Math.min(value, baseRemainingCap);
  }, [form.watch('voluntarySuper'), taxSettings.includeVoluntarySuper, baseRemainingCap]);

  // Calculate tax savings from voluntary super
  const voluntarySuperTaxSavings = useMemo((): number => {
    if (!taxSettings.includeVoluntarySuper) return 0;
    
    // Calculate based on marginal tax rate (this is a simplified approximation)
    // A more accurate approach would calculate based on tax brackets
    const marginalRate = 0.325; // Approximately 32.5% marginal rate
    const superTaxRate = 0.15;  // Super contributions are taxed at 15%
    return voluntarySuper * (marginalRate - superTaxRate);
  }, [voluntarySuper, taxSettings.includeVoluntarySuper]);

  // Calculate net income
  const netIncome = useMemo(() => {
    // Start with base income
    let net = totalAnnualIncome;
    
    // Subtract income tax (which is already calculated on the reduced taxable income)
    net -= incomeTax;
    
    // Subtract Medicare levy 
    net -= medicareLevy;
    
    // Subtract student loan repayment
    net -= studentLoanRepayment;
    
    // Subtract voluntary super contribution
    if (taxSettings.includeVoluntarySuper) {
      const volSuper = parseFloat(form.watch('voluntarySuper')) || 0;
      net -= volSuper;
    }
    
    // Subtract salary sacrifice - this amount goes to the package card
    // This is money you don't receive as cash in hand, but it's still yours
    // Just delivered through a different mechanism (package card)
    net -= salarySacrificeCalculation.totalSalarySacrifice;
    
    // Log for debugging purposes
    console.log('Net income calculation:', {
      totalAnnualIncome,
      incomeTax,
      medicareLevy,
      studentLoanRepayment,
      voluntarySuper: taxSettings.includeVoluntarySuper ? parseFloat(form.watch('voluntarySuper')) || 0 : 0,
      salarySacrifice: salarySacrificeCalculation.totalSalarySacrifice,
      estimatedTaxSavings: salarySacrificeCalculation.estimatedTaxSavings,
      result: net
    });
    
    return Math.max(0, net);
  }, [
    totalAnnualIncome, 
    incomeTax, 
    medicareLevy, 
    studentLoanRepayment, 
    taxSettings.includeVoluntarySuper, 
    form,
    salarySacrificeCalculation
  ]);

  // Calculate remaining concessional cap after voluntary contributions
  const remainingConcessionalCap = useMemo((): number => {
    return Math.max(0, baseRemainingCap - voluntarySuper);
  }, [baseRemainingCap, voluntarySuper]);

  // Format amount to currency
  const formatCurrency = (amount: number) => {
    // Get currency code from tax system
    const currencyCode = getTaxSystem(taxConfig.country).currency;
    
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Convert annual amounts to the selected frequency for display
  const convertToFrequency = (annualAmount: number, frequency: IncomeFrequency): number => {
    if (frequency === 'weekly') {
      return annualAmount / 52;
    } else if (frequency === 'fortnightly') {
      return annualAmount / 26;
    } else if (frequency === 'monthly') {
      return annualAmount / 12;
    }
    return annualAmount;
  };

  // Create a breakdowns object to show all relevant values in different frequencies
  const breakdowns = useMemo(() => {
    const frequencies: IncomeFrequency[] = ['weekly', 'fortnightly', 'monthly', 'annually'];
    
    return frequencies.map(frequency => ({
      frequency,
      grossIncome: convertToFrequency(totalAnnualIncome, frequency),
      baseSalary: convertToFrequency(annualSalary, frequency),
      overtime: convertToFrequency(totalOvertimeAmount, frequency),
      tax: convertToFrequency(incomeTax, frequency),
      medicare: convertToFrequency(medicareLevy, frequency),
      studentLoan: convertToFrequency(studentLoanRepayment, frequency),
      netIncome: convertToFrequency(netIncome, frequency),
      superannuation: convertToFrequency(superannuation, frequency),
      voluntarySuper: convertToFrequency(voluntarySuper, frequency),
      fringeBenefits: convertToFrequency(fringeBenefitsCalculation.totalFBT, frequency),
      reportableFBT: convertToFrequency(fringeBenefitsCalculation.reportableFBT, frequency),
      salarySacrifice: convertToFrequency(salarySacrificeCalculation.totalSalarySacrifice, frequency),
      taxDeductibleSacrifice: convertToFrequency(salarySacrificeCalculation.taxDeductibleSacrifice, frequency),
    }));
  }, [
    totalAnnualIncome, 
    annualSalary, 
    totalOvertimeAmount, 
    incomeTax, 
    medicareLevy, 
    studentLoanRepayment, 
    netIncome, 
    superannuation, 
    voluntarySuper,
    fringeBenefitsCalculation,
    salarySacrificeCalculation
  ]);

  // Add a function to get the current student loan repayment rate as a percentage
  const getStudentLoanRate = () => {
    if (!taxSettings.includeStudentLoan) return '0%';
    
    const repaymentThreshold = HELP_REPAYMENT_THRESHOLDS.find(
      threshold => taxableIncome >= threshold.min && taxableIncome <= threshold.max
    );
    
    if (!repaymentThreshold) return '0%';
    
    return `${(repaymentThreshold.rate * 100).toFixed(1)}%`;
  };

  // Reset calculator
  const resetCalculator = () => {
    form.reset({
      salary: '105000',
      frequency: 'annually',
      voluntarySuper: '0',
      isProratedHours: false,
      proratedHours: '38',
      proratedFrequency: 'weekly',
      packagingCap: 15899,
    });
    setTaxSettings({
      includeSuper: true,
      superRate: 11.5,
      includeMedicare: true,
      medicareExemption: false,
      includeSeniorOffset: false,
      includeStudentLoan: false,
      studentLoanRate: 0,
      includeDependentChildren: false,
      includeSpouse: false,
      includePrivateHealth: false,
      includeVoluntarySuper: false,
    });
    setOvertimeEntries([]);
    setFringeBenefits([]);
    setSalarySacrifices([]);
  };

  const handleTaxSettingChange = (setting: keyof TaxSettings, value: boolean | number) => {
    setTaxSettings(prev => ({
      ...prev,
      [setting]: value
    }));
  };

  // Handle adding a new overtime entry
  const addOvertimeEntry = () => {
    const newEntry: OvertimeEntry = {
      id: uuidv4(),
      hours: '1',
      rate: '20.00',
      frequency: 'weekly',
      includeSuper: true
    };
    setOvertimeEntries(prev => [...prev, newEntry]);
  };

  // Handle removing an overtime entry
  const removeOvertimeEntry = (id: string) => {
    setOvertimeEntries(prev => prev.filter(entry => entry.id !== id));
  };

  // Handle updating an overtime entry
  const updateOvertimeEntry = (id: string, field: keyof OvertimeEntry, value: string | boolean) => {
    setOvertimeEntries(prev => prev.map(entry => 
      entry.id === id ? { ...entry, [field]: value } : entry
    ));
  };

  // Generate summary text for pro-rata hours
  const getProrataHoursSummary = () => {
    if (!isProratedHours) return null;
    
    const hours = parseFloat(proratedHours) || 0;
    const standardHours = proratedFrequency === 'weekly' ? 38 : 76; // 38 * 2 for fortnightly
    const percentage = Math.round((hours / standardHours) * 100);
    
    return `You work ${hours} hours ${proratedFrequency} or ${percentage}% prorata`;
  };

  // Export as PDF
  const handleDownload = async () => {
    if (!calculatorRef.current) return;

    try {
      // toast({
      //   title: "Preparing PDF...",
      //   description: "Please wait while we generate your report",
      // });
      alert("Preparing PDF... Please wait while we generate your report");

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
      
      // toast({
      //   title: "PDF Downloaded",
      //   description: "Your salary report has been saved",
      // });
      alert("PDF Downloaded! Your salary report has been saved");
    } catch (error) {
      console.error('Error generating PDF:', error);
      // toast({
      //   title: "Export Failed",
      //   description: "There was an error creating your PDF",
      //   variant: "destructive",
      // });
      alert("Export Failed: There was an error creating your PDF");
    }
  };

  // Share link with encoded data
  const handleShareLink = () => {
    try {
      // Create data object with all relevant state
      const shareData = {
        salary: watchedSalary,
        frequency: watchedFrequency,
        taxSettings,
        country: taxConfig.country,
      };
      
      // Encode the data as a base64 string
      const encodedData = btoa(JSON.stringify(shareData));
      
      // Create the URL with the data as a query parameter
      const shareableUrl = `${window.location.origin}${window.location.pathname}?calculator=${encodedData}`;
      
      // Copy to clipboard
      navigator.clipboard.writeText(shareableUrl);
      
      // toast({
      //   title: "Link Copied!",
      //   description: "Shareable link has been copied to clipboard",
      // });
      alert("Link Copied! Shareable link has been copied to clipboard");
    } catch (error) {
      console.error('Error creating share link:', error);
      // toast({
      //   title: "Sharing Failed",
      //   description: "There was an error creating your share link",
      //   variant: "destructive",
      // });
      alert("Sharing Failed: There was an error creating your share link");
    }
  };

  // Print the calculator
  const handlePrint = () => {
    window.print();
  };

  // Load calculator state from URL parameters
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const calculatorParam = urlParams.get('calculator');
        
        if (calculatorParam) {
          const decodedData = JSON.parse(atob(calculatorParam));
          
          // Update form values
          form.setValue('salary', decodedData.salary);
          form.setValue('frequency', decodedData.frequency);
          
          // Update tax settings
          if (decodedData.taxSettings) {
            setTaxSettings(decodedData.taxSettings);
          }
          
          // Update country if needed
          if (decodedData.country && decodedData.country !== taxConfig.country) {
            updateTaxConfig({ country: decodedData.country });
          }
          
          // toast({
          //   title: "Calculator Loaded",
          //   description: "The shared calculator settings have been loaded",
          // });
          alert("Calculator Loaded: The shared calculator settings have been loaded");
          
          // Remove the parameter from the URL to avoid reloading on refresh
          const newUrl = window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);
        }
      } catch (error) {
        console.error('Error loading shared calculator:', error);
      }
    }
  }, []);

  // Add an effect to disable Medicare levy when private health is selected
  useEffect(() => {
    if (taxSettings.includePrivateHealth && taxSettings.includeMedicare) {
      setTaxSettings(prev => ({
        ...prev,
        includeMedicare: false
      }));
    }
  }, [taxSettings.includePrivateHealth]);

  // Fringe Benefits handlers
  const addFringeBenefit = () => {
    const newEntry: FringeBenefitEntry = {
      id: uuidv4(),
      description: 'Car Benefit',
      amount: '1000',
      frequency: 'annually',
      type: 'taxable',
      reportable: true
    };
    setFringeBenefits(prev => [...prev, newEntry]);
  };

  const removeFringeBenefit = (id: string) => {
    setFringeBenefits(prev => prev.filter(entry => entry.id !== id));
  };

  const updateFringeBenefit = (id: string, field: keyof FringeBenefitEntry, value: string | boolean | "taxable" | "exempt") => {
    setFringeBenefits(prev => prev.map(entry => 
      entry.id === id ? { ...entry, [field]: value } : entry
    ));
  };

  // Salary Sacrifice handlers
  const addSalarySacrifice = () => {
    const newEntry: SalarySacrificeEntry = {
      id: uuidv4(),
      description: 'Salary Package',
      amount: salarySacrifices.length === 0 ? '611' : '110',  // First one is main package, second could be a meal card
      frequency: 'fortnightly',
      isTaxDeductible: true
    };
    setSalarySacrifices(prev => [...prev, newEntry]);
  };

  const removeSalarySacrifice = (id: string) => {
    setSalarySacrifices(prev => prev.filter(entry => entry.id !== id));
  };

  const updateSalarySacrifice = (id: string, field: keyof SalarySacrificeEntry, value: string | boolean) => {
    setSalarySacrifices(prev => prev.map(entry => 
      entry.id === id ? { ...entry, [field]: value } : entry
    ));
  };

  return (
    <div className="flex flex-col space-y-6 SalaryCalculator" ref={calculatorRef}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle>Income</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={resetCalculator} 
                    className="text-xs"
                  >
                    Reset Calculator
                  </Button>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium">Tax Year:</span>
                    <span className="text-sm">2024 - 25</span>
                  </div>
                </div>

                {/* Pro-rata / Part-time hours switch */}
                <div className="flex items-center space-x-2 py-2">
                  <Switch 
                    id="prorata-switch"
                    checked={form.watch('isProratedHours')}
                    onCheckedChange={(checked) => form.setValue('isProratedHours', checked)}
                  />
                  <Label htmlFor="prorata-switch" className="font-medium">Pro-rata / Part-time hours</Label>
                </div>

                {/* Pro-rata hours settings */}
                {isProratedHours && (
                  <div className="p-4 bg-muted/40 rounded-md space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm">Hours</Label>
                        <Input
                          type="number"
                          value={proratedHours}
                          onChange={(e) => form.setValue('proratedHours', e.target.value)}
                          className="mt-1"
                          min="1"
                          max="168"
                        />
                      </div>
                      <div>
                        <Label className="text-sm">each</Label>
                        <Select
                          value={proratedFrequency}
                          onValueChange={(value) => form.setValue('proratedFrequency', value as IncomeFrequency)}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Week</SelectItem>
                            <SelectItem value="fortnightly">Fortnight</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {getProrataHoursSummary() && (
                      <div className="flex items-center text-xs text-muted-foreground gap-1">
                        <span>{getProrataHoursSummary()}</span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">
                                <InfoIcon size={14} />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-80">
                              <p>Pro-rata calculation is based on standard full-time hours:</p>
                              <ul className="list-disc pl-4 mt-1">
                                <li>38 hours per week</li>
                                <li>76 hours per fortnight</li>
                              </ul>
                              <p className="mt-2">Your salary will be adjusted proportionally based on the hours you work.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="salary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Annual salary</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="1000"
                          min="0"
                          placeholder="Enter your gross salary"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="frequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pay Cycle</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="fortnightly">Fortnightly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="annually">Annually</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* OVERTIME SECTION */}
                <div className="mt-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-semibold uppercase">OVERTIME</h3>
                  </div>
                  
                  {overtimeEntries.map((entry) => (
                    <div key={entry.id} className="space-y-3 p-4 border border-border rounded-md">
                      <div className="flex justify-between items-center mb-2">
                        <div className="text-sm font-medium">Overtime</div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => removeOvertimeEntry(entry.id)}
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2Icon className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs">Hours</Label>
                          <Input
                            type="number"
                            value={entry.hours}
                            onChange={(e) => updateOvertimeEntry(entry.id, 'hours', e.target.value)}
                            className="mt-1 h-8 text-sm"
                            min="0"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Rate</Label>
                          <Input
                            type="number"
                            value={entry.rate}
                            onChange={(e) => updateOvertimeEntry(entry.id, 'rate', e.target.value)}
                            className="mt-1 h-8 text-sm"
                            min="0"
                            step="0.01"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <Label className="text-xs">Per</Label>
                        <Select
                          value={entry.frequency}
                          onValueChange={(value) => updateOvertimeEntry(entry.id, 'frequency', value)}
                        >
                          <SelectTrigger className="mt-1 h-8 text-sm">
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Week</SelectItem>
                            <SelectItem value="fortnightly">Fortnight</SelectItem>
                            <SelectItem value="monthly">Month</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="mt-2 flex justify-between items-center">
                        <Label htmlFor={`overtime-super-${entry.id}`} className="text-xs">
                          Include Superannuation
                        </Label>
                        <Switch 
                          id={`overtime-super-${entry.id}`}
                          checked={entry.includeSuper}
                          onCheckedChange={(checked) => updateOvertimeEntry(entry.id, 'includeSuper', checked)}
                        />
                      </div>
                      
                      <div className="text-xs text-muted-foreground">
                        {formatCurrency(parseFloat(entry.hours) * parseFloat(entry.rate) || 0)} per {entry.frequency}
                      </div>
                    </div>
                  ))}
                  
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={addOvertimeEntry}
                  >
                    <PlusIcon className="h-4 w-4 mr-2" />
                    ADD OVERTIME
                  </Button>
                </div>

                {/* FRINGE BENEFITS SECTION */}
                <div className="mt-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-semibold uppercase">FRINGE BENEFITS</h3>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">
                            <InfoIcon size={14} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-80">
                          <p>Fringe benefits are non-cash benefits provided to employees in addition to salary.</p>
                          <p className="mt-2">Examples include company cars, private health insurance, and expense accounts.</p>
                          <p className="mt-2">Many fringe benefits are subject to Fringe Benefits Tax (FBT) which is paid by the employer but may affect your reportable income.</p>
                          <p className="mt-2">{FBT_EXEMPT_CAP_INFO}</p>
                          <a 
                            href={ATO_FBT_URL} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline mt-2 block"
                          >
                            ATO: Fringe Benefits Tax
                          </a>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  
                  {fringeBenefits.map((entry) => (
                    <div key={entry.id} className="space-y-3 p-4 border border-border rounded-md">
                      <div className="flex justify-between items-center mb-2">
                        <div className="text-sm font-medium">Fringe Benefit</div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => removeFringeBenefit(entry.id)}
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2Icon className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div>
                        <Label className="text-xs">Description</Label>
                        <Input
                          type="text"
                          value={entry.description}
                          onChange={(e) => updateFringeBenefit(entry.id, 'description', e.target.value)}
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs">Amount</Label>
                          <Input
                            type="number"
                            value={entry.amount}
                            onChange={(e) => updateFringeBenefit(entry.id, 'amount', e.target.value)}
                            className="mt-1 h-8 text-sm"
                            min="0"
                            step="0.01"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Frequency</Label>
                          <Select
                            value={entry.frequency}
                            onValueChange={(value) => updateFringeBenefit(entry.id, 'frequency', value)}
                          >
                            <SelectTrigger className="mt-1 h-8 text-sm">
                              <SelectValue placeholder="Select frequency" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="fortnightly">Fortnightly</SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="annually">Annually</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs">Type</Label>
                          <Select
                            value={entry.type}
                            onValueChange={(value) => updateFringeBenefit(entry.id, 'type', value as "taxable" | "exempt")}
                          >
                            <SelectTrigger className="mt-1 h-8 text-sm">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="taxable">Taxable</SelectItem>
                              <SelectItem value="exempt">Exempt</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end pb-1">
                          <div className="flex items-center space-x-2">
                            <Switch 
                              id={`fbt-reportable-${entry.id}`}
                              checked={entry.reportable}
                              onCheckedChange={(checked) => updateFringeBenefit(entry.id, 'reportable', checked)}
                            />
                            <Label htmlFor={`fbt-reportable-${entry.id}`} className="text-xs">
                              Reportable
                            </Label>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={addFringeBenefit}
                  >
                    <PlusIcon className="h-4 w-4 mr-2" />
                    ADD FRINGE BENEFIT
                  </Button>
                </div>

                {/* SALARY SACRIFICE SECTION */}
                <div className="mt-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-semibold uppercase">SALARY SACRIFICE</h3>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">
                            <InfoIcon size={14} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-80">
                          <p>Salary sacrificing allows you to redirect part of your pre-tax salary toward benefits like car leases or additional super.</p>
                          <p className="mt-2">Tax-deductible sacrifices reduce your taxable income.</p>
                          <p className="mt-2">Many NFPs and charities offer salary packaging with caps that vary by organization type.</p>
                          <a 
                            href={ATO_SALARY_SACRIFICE_URL} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline mt-2 block"
                          >
                            ATO: Salary Sacrifice Arrangements
                          </a>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  
                  {/* Packaging Cap Selection */}
                  <div className="bg-muted/30 p-3 rounded-md">
                    <div className="flex justify-between items-center mb-2">
                      <Label className="text-sm">Salary Packaging Cap</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">
                              <InfoIcon size={14} />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-80">
                            <p>Common salary packaging caps:</p>
                            <ul className="list-disc pl-4 mt-1">
                              {COMMON_PACKAGING_CAPS.map((cap) => (
                                <li key={cap.value}>{cap.label}: ${cap.value.toLocaleString()}</li>
                              ))}
                            </ul>
                            <p className="mt-2">Enter your organization&apos;s specific cap amount.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">$</span>
                      <Input
                        type="number"
                        value={form.watch('packagingCap')}
                        onChange={(e) => form.setValue('packagingCap', parseInt(e.target.value) || 0)}
                        className="h-8 text-sm"
                        min="0"
                        step="100"
                        placeholder="Enter packaging cap"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => form.setValue('packagingCap', 15899)}
                        className="text-xs"
                      >
                        Default
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Set to 0 for no cap, or enter your organization&apos;s specific cap amount
                    </p>
                  </div>
                  
                  {/* Show summary information if there are salary sacrifices */}
                  {salarySacrifices.length > 0 && (
                    <div className="bg-muted/30 p-3 rounded-md text-sm">
                      <div className="flex justify-between">
                        <span>Annual cap:</span>
                        <span className="font-medium">{formatCurrency(salarySacrificeCalculation.packagingCap)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Used:</span>
                        <span className="font-medium">{formatCurrency(salarySacrificeCalculation.totalSalarySacrifice)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Remaining:</span>
                        <span className="font-medium">{formatCurrency(salarySacrificeCalculation.remainingPackagingCap)}</span>
                      </div>
                      <div className="mt-3 pt-2 border-t">
                        <div className="flex justify-between text-green-600">
                          <span>Tax savings:</span>
                          <span className="font-medium">{formatCurrency(salarySacrificeCalculation.estimatedTaxSavings)}</span>
                        </div>
                        <div className="flex justify-between text-green-600">
                          <span>Tax savings per fortnight:</span>
                          <span className="font-medium">{formatCurrency(salarySacrificeCalculation.estimatedTaxSavings / 26)}</span>
                        </div>
                        
                        {/* Direct salary packaging payment breakdown */}
                        <div className="mt-3 pt-2 border-t">
                          <div className="text-xs uppercase font-medium text-muted-foreground mb-2">SALARY PACKAGE BREAKDOWN</div>
                          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-sm space-y-2">
                            <div className="flex justify-between">
                              <span className="font-medium">Package amount:</span>
                              <span className="font-medium">{formatCurrency(salarySacrificeCalculation.totalSalarySacrifice)}</span>
                            </div>
                            <div className="flex justify-between text-green-600">
                              <span>Plus tax savings:</span>
                              <span>{formatCurrency(salarySacrificeCalculation.estimatedTaxSavings)}</span>
                            </div>
                            <div className="flex justify-between font-medium pt-1 border-t">
                              <span>Total benefit:</span>
                              <span>{formatCurrency(salarySacrificeCalculation.totalSalarySacrifice + salarySacrificeCalculation.estimatedTaxSavings)}</span>
                            </div>
                            <div className="text-xs text-muted-foreground pt-2">
                              Your salary package provides two benefits: (1) the direct package amount and (2) tax savings from reduced taxable income.
                            </div>
                          </div>

                          <div className="text-xs uppercase font-medium text-muted-foreground mt-4 mb-2">PACKAGE PAYMENT DETAILS</div>
                          {salarySacrifices.map((entry) => {
                            const amount = parseFloat(entry.amount) || 0;
                            return (
                              <div key={entry.id} className="flex justify-between">
                                <span>{entry.description}:</span>
                                <span className="font-medium">
                                  {formatCurrency(amount)} per {entry.frequency}
                                </span>
                              </div>
                            );
                          })}
                          
                          {/* Tax savings per period */}
                          <div className="flex justify-between text-green-600">
                            <span>Plus tax savings:</span>
                            <span className="font-medium">
                              {formatCurrency(salarySacrificeCalculation.estimatedTaxSavings / 26)} per fortnight
                            </span>
                          </div>
                          
                          {/* Total effective payment - direct payments plus tax savings */}
                          <div className="flex justify-between font-medium mt-2">
                            <span>Total effective payment:</span>
                            <span>
                              {formatCurrency(
                                salarySacrifices.reduce((total, entry) => {
                                  const entryAmount = parseFloat(entry.amount) || 0;
                                  if (entry.frequency === 'fortnightly') {
                                    return total + entryAmount;
                                  } else if (entry.frequency === 'weekly') {
                                    return total + (entryAmount * 2);
                                  } else if (entry.frequency === 'monthly') {
                                    return total + (entryAmount / 2.167);
                                  } else { // annually
                                    return total + (entryAmount / 26);
                                  }
                                }, 0) + (salarySacrificeCalculation.estimatedTaxSavings / 26)
                              )} per fortnight
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex justify-between font-medium mt-3">
                          <span>Total annual benefit:</span>
                          <span>{formatCurrency(salarySacrificeCalculation.totalSalarySacrifice + salarySacrificeCalculation.estimatedTaxSavings)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {salarySacrifices.map((entry) => (
                    <div key={entry.id} className="space-y-3 p-4 border border-border rounded-md">
                      <div className="flex justify-between items-center mb-2">
                        <div className="text-sm font-medium">Salary Sacrifice</div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => removeSalarySacrifice(entry.id)}
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2Icon className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div>
                        <Label className="text-xs">Description</Label>
                        <Input
                          type="text"
                          value={entry.description}
                          onChange={(e) => updateSalarySacrifice(entry.id, 'description', e.target.value)}
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs">Amount</Label>
                          <Input
                            type="number"
                            value={entry.amount}
                            onChange={(e) => updateSalarySacrifice(entry.id, 'amount', e.target.value)}
                            className="mt-1 h-8 text-sm"
                            min="0"
                            step="0.01"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Frequency</Label>
                          <Select
                            value={entry.frequency}
                            onValueChange={(value) => updateSalarySacrifice(entry.id, 'frequency', value)}
                          >
                            <SelectTrigger className="mt-1 h-8 text-sm">
                              <SelectValue placeholder="Select frequency" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="fortnightly">Fortnightly</SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="annually">Annually</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <Label htmlFor={`tax-deductible-${entry.id}`} className="text-xs">
                          Tax Deductible
                        </Label>
                        <Switch 
                          id={`tax-deductible-${entry.id}`}
                          checked={entry.isTaxDeductible}
                          onCheckedChange={(checked) => updateSalarySacrifice(entry.id, 'isTaxDeductible', checked)}
                        />
                      </div>
                      
                      {/* Show equivalent fortnightly/annual amount */}
                      <div className="text-xs text-muted-foreground space-y-1">
                        {entry.frequency !== 'fortnightly' && (
                          <div>
                            Equals {formatCurrency(
                              entry.frequency === 'weekly' ? parseFloat(entry.amount) * 2 :
                              entry.frequency === 'monthly' ? parseFloat(entry.amount) / 2.167 :
                              parseFloat(entry.amount) / 26
                            )} per fortnight
                          </div>
                        )}
                        {entry.frequency !== 'annually' && (
                          <div>
                            Equals {formatCurrency(
                              entry.frequency === 'weekly' ? parseFloat(entry.amount) * 52 :
                              entry.frequency === 'fortnightly' ? parseFloat(entry.amount) * 26 :
                              parseFloat(entry.amount) * 12
                            )} per year
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={addSalarySacrifice}
                    disabled={salarySacrificeCalculation.remainingPackagingCap <= 0 && salarySacrificeCalculation.packagingCap > 0}
                  >
                    <PlusIcon className="h-4 w-4 mr-2" />
                    ADD SALARY SACRIFICE
                  </Button>
                </div>

                <div className="space-y-3 mt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Switch 
                        checked={taxSettings.includeSuper} 
                        onCheckedChange={(checked) => handleTaxSettingChange('includeSuper', checked)} 
                      />
                      <span className="text-sm font-medium">Salary includes Superannuation</span>
                    </div>
                    {taxSettings.includeSuper && (
                      <div className="flex items-center space-x-2">
                        <span className="text-sm">at</span>
                        <Input
                          type="number"
                          value={taxSettings.superRate}
                          onChange={(e) => handleTaxSettingChange('superRate', parseFloat(e.target.value) || 0)}
                          className="w-16 h-8 text-xs"
                          step="0.5"
                          min="0"
                          max="50"
                        />
                        <span className="text-sm">%</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Switch 
                        checked={taxSettings.includeStudentLoan} 
                        onCheckedChange={(checked) => handleTaxSettingChange('includeStudentLoan', checked)} 
                      />
                      <span className="text-sm font-medium">Student loan</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">
                              <InfoIcon size={14} />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-80">
                            <p>Repayment rates are based on the ATO&apos;s official thresholds for HELP, FEE-HELP, TSL, SSL, SFSS.</p>
                            <p className="mt-2">Rates range from 1% to 10% of your income depending on your salary.</p>
                            <a 
                              href={ATO_STUDENT_LOAN_URL} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline mt-2 block"
                            >
                              ATO: Study and Training Support Loans rates
                            </a>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    {taxSettings.includeStudentLoan && (
                      <div className="text-xs text-muted-foreground flex justify-between">
                        <span>HELP, FEE-HELP, TSL, SSL, SFSS</span>
                        <span>Current rate: {getStudentLoanRate()}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Switch 
                        checked={taxSettings.includeMedicare} 
                        onCheckedChange={(checked) => handleTaxSettingChange('includeMedicare', checked)} 
                        disabled={taxSettings.includePrivateHealth}
                      />
                      <span className="text-sm font-medium">Medicare levy</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">
                              <InfoIcon size={14} />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-80">
                            <p>The Medicare levy is 2% of your taxable income, on top of the tax you pay on your taxable income.</p>
                            <p className="mt-2">You may not need to pay the levy if you&apos;re a foreign resident or meet certain medical requirements.</p>
                            <a 
                              href={ATO_MEDICARE_LEVY_URL} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline mt-2 block"
                            >
                              ATO: Medicare levy
                            </a>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>

                  {taxSettings.includeMedicare && (
                    <div className="flex items-center justify-between pl-8">
                      <div className="flex items-center space-x-2">
                        <Switch 
                          checked={taxSettings.medicareExemption} 
                          onCheckedChange={(checked) => handleTaxSettingChange('medicareExemption', checked)} 
                        />
                        <span className="text-sm">Medicare exemption</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Switch 
                        checked={taxSettings.includePrivateHealth} 
                        onCheckedChange={(checked) => handleTaxSettingChange('includePrivateHealth', checked)} 
                      />
                      <span className="text-sm font-medium">Private healthcare</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">
                              <InfoIcon size={14} />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-80">
                            <p>Having eligible private health insurance may exempt you from the Medicare levy surcharge.</p>
                            <p className="mt-2">For simplicity, selecting this option will remove the Medicare levy from calculations.</p>
                            <a 
                              href="https://www.ato.gov.au/individuals/medicare-and-private-health-insurance/medicare-levy-surcharge/" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline mt-2 block"
                            >
                              ATO: Medicare levy surcharge
                            </a>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="voluntary-super"
                        checked={taxSettings.includeVoluntarySuper}
                        onCheckedChange={(checked) => handleTaxSettingChange('includeVoluntarySuper', checked)}
                        aria-label="Voluntary Superannuation"
                      />
                      <Label htmlFor="voluntary-super">Voluntary Superannuation</Label>
                    </div>
                  </div>

                  {taxSettings.includeVoluntarySuper && (
                    <div className="pl-8 space-y-4">
                      <div className="flex items-center space-x-4">
                        <Input
                          type="number"
                          value={form.watch('voluntarySuper')}
                          onChange={(e) => {
                            const newValue = Math.min(parseFloat(e.target.value) || 0, baseRemainingCap);
                            form.setValue('voluntarySuper', newValue.toString());
                          }}
                          className="w-32 h-8 text-xs"
                          min="0"
                          max={baseRemainingCap}
                          step="100"
                          aria-label="Voluntary super contribution"
                        />
                        <span className="text-sm text-muted-foreground">
                          Remaining cap: {formatCurrency(remainingConcessionalCap)}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <Slider
                          value={[parseFloat(form.watch('voluntarySuper')) || 0]}
                          max={baseRemainingCap}
                          min={0}
                          step={100}
                          onValueChange={(value) => {
                            form.setValue('voluntarySuper', value[0].toString());
                          }}
                          className="w-full"
                          aria-label="Voluntary super contribution slider"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{formatCurrency(0)}</span>
                          <span>{formatCurrency(baseRemainingCap)}</span>
                        </div>
                      </div>
                      {voluntarySuperTaxSavings > 0 && (
                        <div className="text-sm text-green-500 flex items-center">
                          Estimated tax savings: {formatCurrency(voluntarySuperTaxSavings)}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="ml-1 cursor-help">
                                  <InfoIcon size={14} />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-80">
                                <p>Concessional super contributions are taxed at 15% instead of your marginal tax rate.</p>
                                <p className="mt-2">This can result in significant tax savings, especially for higher income earners.</p>
                                <a 
                                  href={ATO_PERSONAL_SUPER_CONTRIBUTION_URL} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-blue-500 hover:underline mt-2 block"
                                >
                                  ATO: Learn more about concessional contributions
                                </a>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Form>
          </CardContent>
        </Card>

        {/* Summary Section */}
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <Tabs defaultValue="annually" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="weekly">Weekly</TabsTrigger>
                  <TabsTrigger value="fortnightly">Fortnightly</TabsTrigger>
                  <TabsTrigger value="monthly">Monthly</TabsTrigger>
                  <TabsTrigger value="annually">Annually</TabsTrigger>
                </TabsList>
                
                {breakdowns.map((breakdown) => (
                  <TabsContent key={breakdown.frequency} value={breakdown.frequency} className="space-y-4 pt-4">
                    {/* Pay section */}
                    <div className="bg-muted/50 p-4 rounded-lg">
                      <h3 className="text-sm font-medium mb-2">Pay</h3>
                      <div className="flex justify-between items-center">
                        <span className="text-xl font-bold">{formatCurrency(breakdown.grossIncome)}</span>
                        <span className="text-sm text-muted-foreground">
                          including 
                          {taxSettings.includeSuper ? ` ${formatCurrency(breakdown.superannuation)} super` : ' no super'}
                        </span>
                      </div>
                    </div>
                    
                    {/* Base Salary */}
                    <div className="flex justify-between items-center text-sm">
                      <span>Base Salary</span>
                      <span className="font-medium">{formatCurrency(breakdown.baseSalary)}</span>
                    </div>
                    
                    {/* Overtime */}
                    {breakdown.overtime > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span>Overtime</span>
                        <span className="font-medium">{formatCurrency(breakdown.overtime)}</span>
                      </div>
                    )}
                    
                    {/* Fringe Benefits */}
                    {breakdown.fringeBenefits > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span>Fringe Benefits</span>
                        <span className="font-medium">{formatCurrency(breakdown.fringeBenefits)}</span>
                      </div>
                    )}
                    
                    {/* Taxable Income Section */}
                    <div className="mt-3 pt-2 border-t">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-medium">Gross Income</span>
                        <span className="font-medium">{formatCurrency(breakdown.grossIncome)}</span>
                      </div>
                      
                      {/* Salary Sacrifice Deductions */}
                      {breakdown.taxDeductibleSacrifice > 0 && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="flex items-center">
                            ▼ Salary Sacrifice (Tax Deductible)
                          </span>
                          <span className="font-medium text-red-500">
                            {formatCurrency(breakdown.taxDeductibleSacrifice)}
                          </span>
                        </div>
                      )}
                      
                      {/* Voluntary Super */}
                      {taxSettings.includeVoluntarySuper && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="flex items-center">
                            ▼ Voluntary Super
                          </span>
                          <span className="font-medium text-red-500">
                            {formatCurrency(breakdown.voluntarySuper)}
                          </span>
                        </div>
                      )}
                      
                      {/* Taxable Income after deductions */}
                      <div className="flex justify-between items-center text-sm font-medium">
                        <span>Taxable Income</span>
                        <span>{formatCurrency(
                          breakdown.grossIncome - 
                          (breakdown.taxDeductibleSacrifice || 0) - 
                          (taxSettings.includeVoluntarySuper ? breakdown.voluntarySuper : 0)
                        )}</span>
                      </div>
                    </div>
                    
                    {/* Tax Section */}
                    <div className="mt-3 pt-2 border-t">
                      {/* Tax */}
                      <div className="flex justify-between items-center text-sm">
                        <span className="flex items-center">
                          ▼ Income Tax
                        </span>
                        <span className="font-medium text-red-500">
                          {formatCurrency(breakdown.tax)}
                        </span>
                      </div>
                    
                      {/* Medicare levy */}
                      {taxSettings.includeMedicare && !taxSettings.medicareExemption && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="flex items-center">
                            ▼ Medicare levy (2%)
                          </span>
                          <span className="font-medium text-red-500">
                            {formatCurrency(breakdown.medicare)}
                          </span>
                        </div>
                      )}
                      
                      {/* Student loan */}
                      {taxSettings.includeStudentLoan && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="flex items-center">
                            ▼ Student loan ({getStudentLoanRate()})
                          </span>
                          <span className="font-medium text-red-500">
                            {formatCurrency(breakdown.studentLoan)}
                          </span>
                        </div>
                      )}
                      
                      {/* Non-tax deductible Salary Sacrifice */}
                      {(breakdown.salarySacrifice - breakdown.taxDeductibleSacrifice) > 0 && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="flex items-center">
                            ▼ Salary Sacrifice (Non-Deductible)
                          </span>
                          <span className="font-medium text-red-500">
                            {formatCurrency(breakdown.salarySacrifice - breakdown.taxDeductibleSacrifice)}
                          </span>
                        </div>
                      )}
                      
                      {/* Total Deductions */}
                      <div className="flex justify-between items-center text-sm font-medium">
                        <span>Total Deductions</span>
                        <span className="text-red-500">{formatCurrency(
                          breakdown.tax + 
                          breakdown.medicare + 
                          breakdown.studentLoan +
                          (breakdown.salarySacrifice - breakdown.taxDeductibleSacrifice)
                        )}</span>
                      </div>
                    </div>
                    
                    {/* Net Income */}
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Net Income</span>
                        <span className="font-bold">{formatCurrency(breakdown.netIncome)}</span>
                      </div>
                      {salarySacrificeCalculation.totalSalarySacrifice > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          This is your cash-in-hand after tax and salary packaging deductions
                        </div>
                      )}
                    </div>
                    
                    {/* Add effective income if using salary packaging */}
                    {salarySacrificeCalculation.totalSalarySacrifice > 0 && (
                      <div className="mt-3 pt-1">
                        <div className="flex justify-between items-center text-green-600">
                          <span className="font-medium">Package Card Amount</span>
                          <span className="font-medium">{formatCurrency(convertToFrequency(salarySacrificeCalculation.totalSalarySacrifice, breakdown.frequency))}</span>
                        </div>
                        <div className="flex justify-between items-center font-medium mt-2">
                          <span>Total Effective Income</span>
                          <span>{formatCurrency(breakdown.netIncome + convertToFrequency(salarySacrificeCalculation.totalSalarySacrifice, breakdown.frequency))}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Your total effective income includes both cash and package card amounts
                        </div>
                      </div>
                    )}
                    
                    {/* Reportable information section */}
                    {(breakdown.reportableFBT > 0 || breakdown.superannuation > 0) && (
                      <div className="mt-3 pt-3 border-t space-y-2">
                        <div className="text-xs font-medium text-muted-foreground">REPORTABLE AMOUNTS</div>
                        
                        {/* Reportable FBT */}
                        {breakdown.reportableFBT > 0 && (
                          <div className="flex justify-between items-center text-sm">
                            <span>Reportable Fringe Benefits</span>
                            <span className="font-medium">{formatCurrency(breakdown.reportableFBT)}</span>
                          </div>
                        )}
                        
                        {/* Superannuation */}
                        <div className="flex justify-between items-center text-sm">
                          <span>Superannuation Contribution</span>
                          <span className="font-medium">{formatCurrency(breakdown.superannuation)}</span>
                        </div>
                        
                        {/* Total Package */}
                        <div className="flex justify-between items-center text-sm font-medium">
                          <span>Total Package Value</span>
                          <span>{formatCurrency(
                            breakdown.grossIncome + 
                            breakdown.superannuation + 
                            breakdown.fringeBenefits
                          )}</span>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          </CardContent>
        </Card>
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
                grossIncome={totalAnnualIncome}
                tax={incomeTax}
                medicare={medicareLevy}
                studentLoan={studentLoanRepayment}
                superannuation={superannuation}
                voluntarySuper={voluntarySuper}
                overtime={totalOvertimeAmount}
                fringeBenefits={fringeBenefitsCalculation.totalFBT}
                salarySacrifice={salarySacrificeCalculation.nonTaxDeductibleSacrifice}
              />
            </div>
            <div className="w-full md:w-1/2 space-y-4">
              <div className="rounded-lg border p-4">
                <h3 className="text-sm font-medium mb-2">Tax Band</h3>
                <div className="h-16 relative w-full bg-gray-200 rounded-md overflow-hidden">
                  <div className="absolute inset-0 flex">
                    {/* Tax band visualization would go here */}
                    <div className="bg-blue-100 h-full" style={{ width: '18%' }}>
                      <div className="text-[10px] p-1">0%</div>
                    </div>
                    <div className="bg-blue-200 h-full" style={{ width: '27%' }}>
                      <div className="text-[10px] p-1">19%</div>
                    </div>
                    <div className="bg-blue-300 h-full" style={{ width: '30%' }}>
                      <div className="text-[10px] p-1">32.5%</div>
                    </div>
                    <div className="bg-blue-400 h-full" style={{ width: '15%' }}>
                      <div className="text-[10px] p-1">37%</div>
                    </div>
                    <div className="bg-blue-500 h-full" style={{ width: '10%' }}>
                      <div className="text-[10px] p-1">45%</div>
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1 text-[10px]">
                    <span>$0</span>
                    <span>$18,200</span>
                    <span>$45,000</span>
                    <span>$120,000</span>
                    <span>$180,000</span>
                  </div>
                </div>
              </div>
              
              <div className="rounded-lg border p-4">
                <h3 className="text-sm font-medium mb-2">Superannuation Band</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-xs">
                    <span>Concessional Cap</span>
                    <span>${annualSalary > 27500 ? '27,500' : (annualSalary).toFixed(0)}</span>
                  </div>
                </div>
              </div>
              
              <div className="rounded-lg border p-4">
                <h3 className="text-sm font-medium mb-2">Income Range</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-xs">
                    <span>70th percentile</span>
                  </div>
                  <div className="h-4 relative w-full bg-gray-200 rounded-full overflow-hidden">
                    <div className="absolute inset-0 flex">
                      <div className="bg-emerald-500 h-full" style={{ width: `${(totalAnnualIncome / 200000) * 100}%` }}></div>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>less</span>
                    <span>more</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <span className="text-sm text-muted-foreground">
            Year-To-Date: Calculated total pay this year
          </span>
          <div className="flex gap-4">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <span className="mr-2">↓</span> Download
            </Button>
            <Button variant="outline" size="sm" onClick={handleShareLink}>
              <span className="mr-2">↗</span> Share Link
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <span className="mr-2">🖨️</span> Print
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
} 