'use client';

import { useMemo, useState, useCallback } from 'react';
import { useFinance } from '../context/FinanceContext';
import { ParentSize } from '@visx/responsive';
import { Sankey } from '@visx/sankey';
import { scaleOrdinal } from '@visx/scale';
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import { IncomeFrequency } from '../types';

// Define colors for categories and main nodes
const categoryColors = [
  '#0EA5E9', // Blue (Food)
  '#10B981', // Green (Housing)
  '#F59E0B', // Yellow (Transport)
  '#EF4444', // Red (Entertainment)
  '#8B5CF6', // Purple (Health)
  '#EC4899', // Pink (Utilities)
  '#F97316', // Orange (Shopping)
  '#6366F1', // Indigo (Education)
  '#14B8A6', // Teal (Travel)
  '#6B7280', // Gray (Other)
];

interface TooltipData {
  name: string;
  value: number;
  percentage: number;
  color: string;
  type: 'link' | 'node';
  sourceName?: string;
  targetName?: string;
}

interface ExpenseSankeyProps {
  displayPeriod: IncomeFrequency;
}

export default function ExpenseSankey({ displayPeriod }: ExpenseSankeyProps) {
  const { getExpenseSummary, getTotalExpenses, getTotalIncome } = useFinance();
  const [activeLink, setActiveLink] = useState<number | null>(null);

  const expenseSummary = getExpenseSummary();
  const totalExpenses = getTotalExpenses();
  const totalIncome = getTotalIncome(displayPeriod);

  // Tooltip
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip
  } = useTooltip<TooltipData>();

  // Convert expenses to the selected frequency
  const convertedExpenses = useMemo(() => {
    return expenseSummary.map(expense => {
      const annualAmount = expense.totalAmount;
      const convertedAmount =
        displayPeriod === 'weekly' ? annualAmount / 52 :
        displayPeriod === 'fortnightly' ? annualAmount / 26 :
        displayPeriod === 'monthly' ? annualAmount / 12 :
        annualAmount;

      return {
        ...expense,
        totalAmount: convertedAmount
      };
    });
  }, [expenseSummary, displayPeriod]);

  const convertedTotalExpenses = useMemo(() => {
    return convertedExpenses.reduce((sum, item) => sum + item.totalAmount, 0);
  }, [convertedExpenses]);

  const savings = Math.max(0, totalIncome - convertedTotalExpenses);
  const effectiveTotalIncome = Math.max(totalIncome, convertedTotalExpenses);
  const isDeficit = totalIncome < convertedTotalExpenses;

  // Prepare Sankey Data
  const data = useMemo(() => {
    const nodes: { name: string }[] = [];
    const links: { source: number; target: number; value: number }[] = [];

    nodes.push({ name: isDeficit ? 'Total Funding (Deficit)' : 'Total Income' });
    nodes.push({ name: 'Expenses' });

    if (savings > 0) {
      nodes.push({ name: 'Savings' });
    }

    links.push({ source: 0, target: 1, value: convertedTotalExpenses });

    if (savings > 0) {
      links.push({ source: 0, target: 2, value: savings });
    }

    const categoryStartIndex = nodes.length;

    convertedExpenses.forEach((expense, index) => {
      nodes.push({ name: expense.category });
      links.push({
        source: 1,
        target: categoryStartIndex + index,
        value: expense.totalAmount
      });
    });

    return { nodes, links };
  }, [effectiveTotalIncome, convertedTotalExpenses, savings, convertedExpenses, isDeficit]);

  // Color scale
  const colorScale = scaleOrdinal({
    domain: ['Total Income', 'Total Funding (Deficit)', 'Expenses', 'Savings', ...convertedExpenses.map(d => d.category)],
    range: ['#10B981', '#EF4444', '#F59E0B', '#3B82F6', ...categoryColors],
  });

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Format percentage
  const formatPercentage = (value: number, total: number) => {
    if (total === 0) return '0%';
    return `${((value / total) * 100).toFixed(1)}%`;
  };

  // Click handlers
  const handleLinkClick = useCallback((index: number) => {
    setActiveLink(prev => prev === index ? null : index);
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setActiveLink(null);
  }, []);

  // Tooltip handlers
  const handleLinkHover = useCallback((event: React.MouseEvent, link: any, color: string) => {
    const coords = localPoint(event);
    showTooltip({
      tooltipData: {
        name: `${link.source.name} → ${link.target.name}`,
        value: link.value,
        percentage: effectiveTotalIncome > 0 ? (link.value / effectiveTotalIncome) * 100 : 0,
        color,
        type: 'link',
        sourceName: link.source.name,
        targetName: link.target.name,
      },
      tooltipLeft: coords?.x ?? 0,
      tooltipTop: coords?.y ?? 0,
    });
  }, [showTooltip, effectiveTotalIncome]);

  const handleNodeHover = useCallback((event: React.MouseEvent, node: any) => {
    const coords = localPoint(event);
    showTooltip({
      tooltipData: {
        name: node.name,
        value: node.value || 0,
        percentage: effectiveTotalIncome > 0 ? ((node.value || 0) / effectiveTotalIncome) * 100 : 0,
        color: colorScale(node.name ?? ''),
        type: 'node',
      },
      tooltipLeft: coords?.x ?? 0,
      tooltipTop: coords?.y ?? 0,
    });
  }, [showTooltip, effectiveTotalIncome, colorScale]);

  if (convertedTotalExpenses === 0 && totalIncome === 0) {
     return (
      <div className="flex justify-center items-center h-64">
        <p className="text-center text-muted-foreground">
          No data to visualize. Add income or expenses to see the flow.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      <div className="text-center mb-2 text-sm text-muted-foreground">
        Flow: Income → Expenses/Savings → Categories ({displayPeriod})
      </div>
      <div className="flex-1 min-h-[400px]">
        <ParentSize>
          {({ width, height }) => (
            <Sankey
              root={data}
              size={[width, height]}
              nodeWidth={15}
              nodePadding={10}
              extent={[[1, 1], [width - 1, height - 6]]}
            >
              {({ graph, createPath }) => {
                // Determine which nodes are connected to the active link
                const activeGraphLink = activeLink !== null ? graph.links[activeLink] : null;
                const activeSourceIndex = activeGraphLink ? (activeGraphLink.source as any).index : null;
                const activeTargetIndex = activeGraphLink ? (activeGraphLink.target as any).index : null;

                const isNodeConnected = (nodeIndex: number) => {
                  if (activeLink === null) return true;
                  return nodeIndex === activeSourceIndex || nodeIndex === activeTargetIndex;
                };

                // Sort links so active one renders last (on top)
                const linkIndices = graph.links.map((_, i) => i);
                if (activeLink !== null) {
                  const idx = linkIndices.indexOf(activeLink);
                  if (idx !== -1) {
                    linkIndices.splice(idx, 1);
                    linkIndices.push(activeLink);
                  }
                }

                // Compute midpoint of active link for the floating label
                let labelX = 0;
                let labelY = 0;
                if (activeGraphLink) {
                  const src = activeGraphLink.source as any;
                  const tgt = activeGraphLink.target as any;
                  labelX = ((src.x1 || 0) + (tgt.x0 || 0)) / 2;
                  labelY = ((activeGraphLink.y0 as number || 0) + (activeGraphLink.y1 as number || 0)) / 2;
                }

                return (
                  <svg width={width} height={height}>
                    <defs>
                      <filter id="link-glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                      </filter>
                      <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                      </filter>
                    </defs>

                    {/* Click background to deselect */}
                    <rect
                      width={width}
                      height={height}
                      fill="transparent"
                      onClick={handleBackgroundClick}
                    />

                    {/* Links */}
                    <g>
                      {linkIndices.map((linkIdx) => {
                        const link = graph.links[linkIdx] as any;
                        const isActive = activeLink === linkIdx;
                        const isDimmed = activeLink !== null && !isActive;
                        const linkColor = colorScale(link.target.name ?? '');

                        const strokeOpacity = isActive ? 0.7 : isDimmed ? 0.06 : 0.25;
                        const extraWidth = isActive ? 2 : 0;

                        return (
                          <path
                            key={`link-${linkIdx}`}
                            d={createPath(link) || ''}
                            stroke={linkColor}
                            strokeWidth={Math.max(1, (link.width || 1) + extraWidth)}
                            strokeOpacity={strokeOpacity}
                            fill="none"
                            filter={isActive ? 'url(#link-glow)' : undefined}
                            style={{
                              cursor: 'pointer',
                              transition: 'stroke-opacity 0.25s ease, stroke-width 0.25s ease, filter 0.25s ease',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLinkClick(linkIdx);
                            }}
                            onMouseMove={(e) => handleLinkHover(e, link, linkColor)}
                            onMouseLeave={() => hideTooltip()}
                          />
                        );
                      })}
                    </g>

                    {/* Nodes */}
                    <g>
                      {graph.nodes.map((node: any, i) => {
                        const connected = isNodeConnected(i);
                        const nodeOpacity = activeLink === null ? 1 : connected ? 1 : 0.25;
                        const nodeColor = colorScale(node.name ?? '');

                        return (
                          <g
                            key={`node-${i}`}
                            style={{
                              transition: 'opacity 0.25s ease',
                              opacity: nodeOpacity,
                            }}
                          >
                            <rect
                              x={node.x0}
                              y={node.y0}
                              width={Math.max(0, (node.x1 || 0) - (node.x0 || 0))}
                              height={Math.max(0, (node.y1 || 0) - (node.y0 || 0))}
                              fill={nodeColor}
                              stroke={connected && activeLink !== null ? nodeColor : '#fff'}
                              strokeWidth={connected && activeLink !== null ? 2 : 1}
                              filter={connected && activeLink !== null ? 'url(#node-glow)' : undefined}
                              rx={2}
                              style={{
                                cursor: 'pointer',
                                transition: 'filter 0.25s ease, stroke 0.25s ease',
                              }}
                              onMouseMove={(e) => handleNodeHover(e, node)}
                              onMouseLeave={() => hideTooltip()}
                            />
                            <text
                              x={(node.x0 || 0) < width / 2 ? (node.x1 || 0) + 6 : (node.x0 || 0) - 6}
                              y={((node.y1 || 0) + (node.y0 || 0)) / 2}
                              dy=".35em"
                              fontSize={12}
                              fontWeight="500"
                              textAnchor={(node.x0 || 0) < width / 2 ? 'start' : 'end'}
                              className="fill-foreground text-xs pointer-events-none"
                              style={{ transition: 'opacity 0.25s ease' }}
                            >
                              {node.name}
                            </text>
                            <text
                              x={(node.x0 || 0) < width / 2 ? (node.x1 || 0) + 6 : (node.x0 || 0) - 6}
                              y={((node.y1 || 0) + (node.y0 || 0)) / 2 + 14}
                              dy=".35em"
                              fontSize={10}
                              className="fill-muted-foreground pointer-events-none"
                              textAnchor={(node.x0 || 0) < width / 2 ? 'start' : 'end'}
                              style={{ transition: 'opacity 0.25s ease' }}
                            >
                              {formatCurrency(node.value || 0)}
                            </text>
                          </g>
                        );
                      })}
                    </g>

                    {/* Floating label on active link */}
                    {activeGraphLink && (
                      <g style={{ pointerEvents: 'none' }}>
                        <rect
                          x={labelX - 80}
                          y={labelY - 32}
                          width={160}
                          height={52}
                          rx={8}
                          fill="var(--card, rgba(0,0,0,0.85))"
                          stroke="var(--border, rgba(255,255,255,0.15))"
                          strokeWidth={1}
                          opacity={0.95}
                        />
                        <text
                          x={labelX}
                          y={labelY - 14}
                          textAnchor="middle"
                          fontSize={11}
                          fontWeight="600"
                          fill="var(--foreground, white)"
                        >
                          {(activeGraphLink.source as any).name} → {(activeGraphLink.target as any).name}
                        </text>
                        <text
                          x={labelX}
                          y={labelY + 6}
                          textAnchor="middle"
                          fontSize={14}
                          fontWeight="700"
                          fill={colorScale((activeGraphLink.target as any).name ?? '')}
                        >
                          {formatCurrency(activeGraphLink.value)}
                        </text>
                        <text
                          x={labelX}
                          y={labelY + 20}
                          textAnchor="middle"
                          fontSize={10}
                          fill="var(--muted-foreground, #999)"
                        >
                          {formatPercentage(activeGraphLink.value, effectiveTotalIncome)} of income
                        </text>
                      </g>
                    )}
                  </svg>
                );
              }}
            </Sankey>
          )}
        </ParentSize>
      </div>

      {/* Tooltip */}
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            ...defaultStyles,
            backgroundColor: 'var(--card, #1a1a2e)',
            color: 'var(--foreground, white)',
            border: '1px solid var(--border, rgba(255,255,255,0.1))',
            borderRadius: '0.5rem',
            padding: '0.5rem 0.75rem',
            fontSize: '0.75rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 50,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{tooltipData.name}</div>
          <div style={{ color: tooltipData.color, fontWeight: 700, fontSize: '0.85rem' }}>
            {formatCurrency(tooltipData.value)}
          </div>
          <div style={{ color: 'var(--muted-foreground, #888)', fontSize: '0.7rem', marginTop: 2 }}>
            {tooltipData.percentage.toFixed(1)}% of total income
          </div>
          {tooltipData.type === 'link' && (
            <div style={{ color: 'var(--muted-foreground, #888)', fontSize: '0.65rem', marginTop: 4, fontStyle: 'italic' }}>
              Click to focus
            </div>
          )}
        </TooltipWithBounds>
      )}
    </div>
  );
}
