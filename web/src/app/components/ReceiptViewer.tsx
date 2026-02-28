'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, Download, ExternalLink } from 'lucide-react';

interface ReceiptViewerProps {
  receiptUrl: string;
  filename?: string;
}

export default function ReceiptViewer({ receiptUrl, filename }: ReceiptViewerProps) {
  const [open, setOpen] = useState(false);

  const isPdf = receiptUrl.toLowerCase().includes('.pdf') || receiptUrl.includes('application/pdf');
  const displayName = filename || 'Receipt';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileText className="w-4 h-4" />
          View Receipt
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {displayName}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex-1 min-h-[400px] max-h-[60vh] overflow-auto rounded-lg border bg-muted/30">
            {isPdf ? (
              <iframe
                src={receiptUrl}
                className="w-full h-full min-h-[400px]"
                title={displayName}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={receiptUrl}
                alt={displayName}
                className="w-full h-auto object-contain"
              />
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" asChild>
              <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
                <ExternalLink className="w-4 h-4" />
                Open in New Tab
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={receiptUrl} download={displayName} className="gap-2">
                <Download className="w-4 h-4" />
                Download
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
