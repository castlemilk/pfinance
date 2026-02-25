'use client';

import { useState } from 'react';
import { SkeuButton } from '@/components/ui/skeu-button';
import { AlertTriangle, Check, X } from 'lucide-react';
import { getInstrumentBadgeStyle } from '../../constants/theme';

interface DuplicateInfo {
  description: string;
  amount: number;
  date: string;
  matchScore: number;
  matchReason: string;
}

interface ConfirmationCardProps {
  action: string;
  message: string;
  details?: Record<string, unknown>;
  expenses?: Array<{ description: string; amount: number; date: string; category: string }>;
  changes?: Record<string, { from: unknown; to: unknown }>;
  duplicates?: DuplicateInfo[];
  duplicateWarning?: string;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationCard({ action, message, details, expenses, changes, duplicates, duplicateWarning, disabled = false, onConfirm, onCancel }: ConfirmationCardProps) {
  // UX-08: initialize responded from disabled prop and keep it in sync
  const [responded, setResponded] = useState(disabled);
  // If disabled changes (e.g. from historical load), update responded
  if (disabled && !responded) setResponded(true);

  const isDelete = action.includes('delete');

  const handleConfirm = () => {
    setResponded(true);
    onConfirm();
  };

  const handleCancel = () => {
    setResponded(true);
    onCancel();
  };

  return (
    <div className={`overflow-hidden rounded-lg border-2 ${isDelete ? 'border-destructive/50' : 'border-primary/50'}`}>
      <div className={`px-3 py-2 border-b flex items-center gap-2 ${isDelete ? 'bg-destructive/10 border-destructive/20' : 'bg-primary/10 border-primary/20'}`}>
        <AlertTriangle className={`w-3.5 h-3.5 ${isDelete ? 'text-destructive' : 'text-primary'}`} />
        <span className="text-xs font-semibold font-mono uppercase tracking-wide">Confirmation Required</span>
      </div>

      <div className="p-3 space-y-2">
        <p className="text-sm font-medium">{message}</p>

        {/* Show details for create */}
        {details && (
          <div className="text-xs space-y-1 text-muted-foreground">
            {Object.entries(details).map(([key, val]) => (
              <div key={key} className="flex justify-between">
                <span className="capitalize">{key}:</span>
                <span className="font-mono font-medium text-foreground">
                  {key === 'amount' ? `$${Number(val).toFixed(2)}` : String(val)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Show changes for update */}
        {changes && Object.keys(changes).length > 0 && (
          <div className="text-xs space-y-1">
            {Object.entries(changes).map(([field, { from, to }]) => (
              <div key={field} className="flex items-center gap-1.5">
                <span className="capitalize text-muted-foreground">{field}:</span>
                <span
                  className="text-[10px] px-1.5 py-0 rounded-full line-through opacity-60"
                  style={getInstrumentBadgeStyle('#8B8378')}
                >
                  {String(from)}
                </span>
                <span className="text-muted-foreground">&rarr;</span>
                <span
                  className="text-[10px] px-1.5 py-0 rounded-full font-medium"
                  style={getInstrumentBadgeStyle('#87A96B')}
                >
                  {String(to)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Show expense list for batch delete */}
        {expenses && expenses.length > 0 && (
          <div className="skeu-inset divide-y divide-primary/5 rounded-lg text-xs max-h-[150px] overflow-y-auto">
            {expenses.map((e, i) => (
              <div key={i} className="px-2.5 py-1.5 flex justify-between">
                <span>{e.description}</span>
                <span className="font-mono font-medium text-primary">${e.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Duplicate warning */}
        {duplicates && duplicates.length > 0 && (
          <div className="border border-amber-500/50 bg-amber-500/10 rounded-lg p-2 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              {duplicateWarning || `${duplicates.length} similar expense${duplicates.length > 1 ? 's' : ''} found`}
            </div>
            <div className="text-xs space-y-0.5 text-muted-foreground">
              {duplicates.map((d, i) => (
                <div key={i} className="flex justify-between">
                  <span className="truncate">{d.description} ({d.date})</span>
                  <span className="font-mono font-medium shrink-0 ml-2">${d.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <SkeuButton
            size="sm"
            variant={isDelete ? 'destructive' : 'primary'}
            onClick={handleConfirm}
            disabled={responded}
            className="flex-1"
            icon={<Check className="w-3.5 h-3.5" />}
          >
            Confirm
          </SkeuButton>
          <SkeuButton
            size="sm"
            variant="outline"
            onClick={handleCancel}
            disabled={responded}
            className="flex-1"
            icon={<X className="w-3.5 h-3.5" />}
          >
            Cancel
          </SkeuButton>
        </div>
      </div>
    </div>
  );
}
