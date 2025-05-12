'use client';

import React from 'react';
import { Button } from '@/components/ui/button';

type VisualizationType = 'pie' | 'sankey';

interface ChartToggleProps {
  activeType: VisualizationType;
  onToggle: (type: VisualizationType) => void;
}

export default function ChartToggle({ activeType, onToggle }: ChartToggleProps) {
  return (
    <div className="flex justify-center space-x-2 mb-4">
      <Button
        variant={activeType === 'pie' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onToggle('pie')}
      >
        Pie Chart
      </Button>
      <Button
        variant={activeType === 'sankey' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onToggle('sankey')}
      >
        Flow Diagram
      </Button>
    </div>
  );
} 