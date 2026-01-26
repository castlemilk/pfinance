/**
 * useTaxConfig Hook
 * 
 * Manages tax configuration state and persistence.
 */

import { useState, useCallback, useEffect } from 'react';
import { User } from 'firebase/auth';
import { financeClient } from '@/lib/financeService';
import { TaxConfig } from '@/app/types';
// import { TaxCountry as ProtoTaxCountry } from '@/gen/pfinance/v1/types_pb';
import { taxCountryToProto, protoToTaxCountry } from '../mappers';

const defaultTaxConfig: TaxConfig = {
  enabled: true,
  country: 'simple',
  taxRate: 20,
  includeDeductions: true
};

interface UseTaxConfigOptions {
  user: User | null;
  effectiveUserId: string;
  useApi: boolean;
  getStorageKey: (key: string) => string;
}

interface UseTaxConfigReturn {
  taxConfig: TaxConfig;
  setTaxConfig: React.Dispatch<React.SetStateAction<TaxConfig>>;
  updateTaxConfig: (config: Partial<TaxConfig>) => void;
  loadTaxConfig: () => Promise<TaxConfig>;
}

export function useTaxConfig({
  // user,
  effectiveUserId,
  useApi,
  getStorageKey,
}: UseTaxConfigOptions): UseTaxConfigReturn {
  const [taxConfig, setTaxConfig] = useState<TaxConfig>(defaultTaxConfig);

  // Load tax config from API
  const loadTaxConfig = useCallback(async (): Promise<TaxConfig> => {
    if (!useApi || !effectiveUserId) {
      return taxConfig;
    }

    try {
      const response = await financeClient.getTaxConfig({
        userId: effectiveUserId,
      });
      if (response.taxConfig) {
        const loadedConfig: TaxConfig = {
          enabled: response.taxConfig.enabled,
          country: protoToTaxCountry[response.taxConfig.country],
          taxRate: response.taxConfig.taxRate,
          includeDeductions: response.taxConfig.includeDeductions,
        };
        setTaxConfig(loadedConfig);
        return loadedConfig;
      }
    } catch {
      // Tax config may not exist, use default
      console.debug('[TaxConfig] No tax config found, using default');
    }
    return taxConfig;
  }, [useApi, effectiveUserId, taxConfig]);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(getStorageKey('taxConfig'), JSON.stringify(taxConfig));
  }, [taxConfig, getStorageKey]);

  const updateTaxConfig = useCallback((config: Partial<TaxConfig>) => {
    setTaxConfig(prev => {
      const newConfig = { ...prev, ...config };
      localStorage.setItem(getStorageKey('taxConfig'), JSON.stringify(newConfig));
      
      // Update API in background if authenticated
      if (useApi && effectiveUserId) {
        financeClient.updateTaxConfig({
          userId: effectiveUserId,
          taxConfig: {
            enabled: newConfig.enabled,
            country: taxCountryToProto[newConfig.country],
            taxRate: newConfig.taxRate,
            includeDeductions: newConfig.includeDeductions,
          },
        }).catch(err => console.error('Failed to update tax config on server:', err));
      }
      
      return newConfig;
    });
  }, [useApi, effectiveUserId, getStorageKey]);

  return {
    taxConfig,
    setTaxConfig,
    updateTaxConfig,
    loadTaxConfig,
  };
}
