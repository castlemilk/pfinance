'use client';

import { useRef, useCallback, useMemo } from 'react';
import { create } from '@bufbuild/protobuf';
import { financeClient } from '@/lib/financeService';
import type {
  ExtractedTransaction,
  CorrectionRecord,
  FieldCorrection,
} from '@/gen/pfinance/v1/types_pb';
import {
  CorrectionFieldType,
  ExpenseCategory,
  CorrectionRecordSchema,
  FieldCorrectionSchema,
} from '@/gen/pfinance/v1/types_pb';

/**
 * Internal representation of accumulated corrections for a single transaction.
 * Field corrections are keyed by CorrectionFieldType to deduplicate —
 * only the latest correction per field is kept.
 */
interface TransactionCorrections {
  fieldCorrections: Map<CorrectionFieldType, { originalValue: string; correctedValue: string }>;
  originalMerchant: string;
  correctedMerchant: string;
  originalCategory: ExpenseCategory;
  correctedCategory: ExpenseCategory;
  originalConfidence: number;
}

/**
 * Hook for tracking user corrections to extracted transactions and submitting
 * them to the backend via the SubmitCorrections RPC.
 *
 * Corrections are accumulated in a ref (no re-renders on each change) and
 * built into CorrectionRecord protobuf messages when retrieved or submitted.
 *
 * @param originalTransactions - The original extracted transactions to track corrections against.
 */
export function useCorrectionTracking(originalTransactions: ExtractedTransaction[]) {
  // Use a ref to accumulate corrections without causing re-renders on every keystroke.
  // We use a separate state-based counter to drive `hasCorrections` reactivity.
  const correctionsRef = useRef<Map<string, TransactionCorrections>>(new Map());
  // Monotonically increasing version counter — bumped on every mutation so that
  // consumers who depend on `hasCorrections` get updated values.
  const versionRef = useRef(0);

  // Build a lookup map from transaction ID to the original transaction.
  const txLookup = useMemo(() => {
    const map = new Map<string, ExtractedTransaction>();
    for (const tx of originalTransactions) {
      map.set(tx.id, tx);
    }
    return map;
  }, [originalTransactions]);

  /**
   * Ensure we have a TransactionCorrections entry for the given transaction.
   * Initialises merchant/category from the original transaction if available.
   */
  const ensureEntry = useCallback(
    (txId: string): TransactionCorrections => {
      let entry = correctionsRef.current.get(txId);
      if (!entry) {
        const originalTx = txLookup.get(txId);
        entry = {
          fieldCorrections: new Map(),
          originalMerchant: originalTx?.normalizedMerchant ?? '',
          correctedMerchant: '',
          originalCategory: originalTx?.suggestedCategory ?? ExpenseCategory.UNSPECIFIED,
          correctedCategory: ExpenseCategory.UNSPECIFIED,
          originalConfidence: originalTx?.confidence ?? 0,
        };
        correctionsRef.current.set(txId, entry);
      }
      return entry;
    },
    [txLookup],
  );

  /**
   * Track a generic field-level correction.
   */
  const trackChange = useCallback(
    (txId: string, field: CorrectionFieldType, originalValue: string, newValue: string): void => {
      if (originalValue === newValue) return;
      const entry = ensureEntry(txId);
      entry.fieldCorrections.set(field, {
        originalValue,
        correctedValue: newValue,
      });
      versionRef.current += 1;
    },
    [ensureEntry],
  );

  /**
   * Convenience method for tracking merchant name corrections.
   * Also records the merchant at the record level for the backend
   * merchant-mapping learning pipeline.
   */
  const trackMerchantChange = useCallback(
    (txId: string, originalMerchant: string, correctedMerchant: string): void => {
      if (originalMerchant === correctedMerchant) return;
      const entry = ensureEntry(txId);
      entry.originalMerchant = originalMerchant;
      entry.correctedMerchant = correctedMerchant;
      entry.fieldCorrections.set(CorrectionFieldType.MERCHANT, {
        originalValue: originalMerchant,
        correctedValue: correctedMerchant,
      });
      versionRef.current += 1;
    },
    [ensureEntry],
  );

  /**
   * Convenience method for tracking category corrections.
   * Stores enum values at the record level and also adds a field-level
   * correction entry using the enum numeric values as strings.
   */
  const trackCategoryChange = useCallback(
    (txId: string, originalCategory: ExpenseCategory, correctedCategory: ExpenseCategory): void => {
      if (originalCategory === correctedCategory) return;
      const entry = ensureEntry(txId);
      entry.originalCategory = originalCategory;
      entry.correctedCategory = correctedCategory;
      entry.fieldCorrections.set(CorrectionFieldType.CATEGORY, {
        originalValue: String(originalCategory),
        correctedValue: String(correctedCategory),
      });
      versionRef.current += 1;
    },
    [ensureEntry],
  );

  /**
   * Build CorrectionRecord protobuf messages from the accumulated corrections.
   */
  const getCorrections = useCallback((): CorrectionRecord[] => {
    const records: CorrectionRecord[] = [];

    correctionsRef.current.forEach((entry, txId) => {
      // Skip entries with no actual field corrections
      if (entry.fieldCorrections.size === 0) return;

      const fieldCorrections: FieldCorrection[] = [];
      entry.fieldCorrections.forEach((correction, fieldType) => {
        fieldCorrections.push(
          create(FieldCorrectionSchema, {
            field: fieldType,
            originalValue: correction.originalValue,
            correctedValue: correction.correctedValue,
          }),
        );
      });

      const originalTx = txLookup.get(txId);

      records.push(
        create(CorrectionRecordSchema, {
          transactionId: txId,
          corrections: fieldCorrections,
          originalMerchant: entry.originalMerchant,
          correctedMerchant: entry.correctedMerchant,
          originalCategory: entry.originalCategory,
          correctedCategory: entry.correctedCategory,
          originalConfidence: originalTx?.confidence ?? entry.originalConfidence,
        }),
      );
    });

    return records;
  }, [txLookup]);

  /**
   * Submit all accumulated corrections to the backend.
   * Returns the number of processed corrections and updated merchant mappings.
   */
  const submitCorrections = useCallback(
    async (userId: string): Promise<{ processedCount: number; merchantMappingsUpdated: number }> => {
      const corrections = getCorrections();
      if (corrections.length === 0) {
        return { processedCount: 0, merchantMappingsUpdated: 0 };
      }

      const response = await financeClient.submitCorrections({
        userId,
        corrections,
      });

      // Clear accumulated corrections after successful submission
      correctionsRef.current.clear();
      versionRef.current += 1;

      return {
        processedCount: response.processedCount,
        merchantMappingsUpdated: response.merchantMappingsUpdated,
      };
    },
    [getCorrections],
  );

  /**
   * Whether there are any pending corrections to submit.
   * This reads from the ref directly — it is accurate at call time but
   * will not trigger a re-render on its own. Components that need reactive
   * updates should call `getCorrections().length > 0` instead.
   */
  const hasCorrections = correctionsRef.current.size > 0;

  return {
    trackChange,
    trackMerchantChange,
    trackCategoryChange,
    getCorrections,
    submitCorrections,
    hasCorrections,
  };
}
