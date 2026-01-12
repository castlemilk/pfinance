'use client';

import { useMemo, useCallback } from 'react';
import { useFinance } from '../context/FinanceContext';
import { IncomeFrequency } from '../types';
import { ParentSize } from '@visx/responsive';
import { Group } from '@visx/group';
import { Sankey } from '@visx/sankey';
import { Bar } from '@visx/shape';
import { useTooltip, defaultStyles } from '@visx/tooltip';
import { Text } from '@visx/text';

// Import from the new metrics layer
import { useSankeyData } from '../metrics/hooks/useVisualizationData';
import { formatCurrency, getCurrencyForCountry } from '../metrics/utils/currency';
import { getPeriodLabel } from '../metrics/utils/period';
import { SankeyNode, SankeyLink } from '../metrics/types';

interface TooltipData {
  name: string;
  value: number;
  percentage: number;
  color: string;
  type?: string;
  sourceName?: string;
  targetName?: string;
}

interface FinanceFlowDiagramProps {
  displayPeriod: IncomeFrequency;
}

export default function FinanceFlowDiagram({ displayPeriod }: FinanceFlowDiagramProps) {
  const { incomes, expenses, taxConfig } = useFinance();
  
  // Use the new Sankey data hook
  const { sankeyDiagram, periodLabel, hasData } = useSankeyData(
    incomes,
    expenses,
    taxConfig,
    { displayPeriod }
  );

  const currency = getCurrencyForCountry(taxConfig.country);

  // Setup tooltip
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip
  } = useTooltip<TooltipData>();

  // Format amount to currency
  const formatAmount = useCallback((amount: number) => {
    return formatCurrency(amount, currency, { maximumFractionDigits: 0 });
  }, [currency]);

  // Format percentage
  const formatPercentage = useCallback((percentage: number) => {
    return `${percentage.toFixed(1)}%`;
  }, []);

  // If no data, show a message
  if (!hasData || sankeyDiagram.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-[600px] text-muted-foreground">
        No financial data to visualize. Add income and expenses to see the flow diagram.
      </div>
    );
  }

  // Extract nodes and links from the pre-computed data
  const { nodes, links } = sankeyDiagram;

  return (
    <div className="w-full overflow-hidden">
      <style jsx global>{`
        .sankey-node:hover {
          opacity: 0.8;
        }
        .sankey-link:hover {
          opacity: 0.5;
        }
      `}</style>
      
      <div className="mb-2 text-sm text-muted-foreground">
        Showing {displayPeriod} flow of funds
      </div>
      
      <ParentSize debounceTime={10}>
        {({ width }) => {
          // Set a minimum height
          const diagramHeight = 500;
          const margin = { top: 20, left: 20, right: 20, bottom: 20 };
          const innerWidth = width - margin.left - margin.right;
          const innerHeight = diagramHeight - margin.top - margin.bottom;
          
          // Create simple data object in format required by Sankey
          const sankeyData = {
            nodes: nodes.map(node => ({ 
              name: node.name 
            })),
            links: links.map(link => ({ 
              source: link.sourceName,
              target: link.targetName,
              value: link.value
            }))
          };

          // Create a map for quick node lookup
          const nodeMap = new Map(nodes.map((node, idx) => [node.name, idx]));
          
          return (
            <>
              <svg width={width} height={diagramHeight}>
                <rect width={width} height={diagramHeight} fill="transparent" />
                <Group left={margin.left} top={margin.top}>
                  <Sankey
                    root={sankeyData}
                    size={[innerWidth, innerHeight]}
                    nodeWidth={40}
                    nodePadding={20}
                    nodeId={d => d.name}
                  >
                    {({ graph, createPath }) => {
                      if (!graph || !graph.links || !graph.nodes) {
                        return null;
                      }

                      return (
                        <Group>
                          {graph.links.map((graphLink, i) => {
                            // Find the original link data
                            const originalLink = links[i];
                            const linkColor = originalLink?.color || '#aaa';
                            
                            const sourceName = originalLink?.sourceName || '';
                            const targetName = originalLink?.targetName || '';
                            const percentage = originalLink?.percentage || 0;
                            const value = originalLink?.value || 0;
                            
                            return (
                              <Group key={`link-${i}`}>
                                <path
                                  d={createPath(graphLink) || ''}
                                  fill="none"
                                  stroke={linkColor}
                                  strokeWidth={Math.max(2, graphLink.width || 0)}
                                  strokeOpacity={0.6}
                                  onMouseEnter={(event: React.MouseEvent) => {
                                    showTooltip({
                                      tooltipData: {
                                        name: `${sourceName} → ${targetName}`,
                                        value,
                                        percentage,
                                        color: linkColor,
                                        type: 'link',
                                        sourceName,
                                        targetName
                                      },
                                      tooltipLeft: event.clientX,
                                      tooltipTop: event.clientY
                                    });
                                  }}
                                  onMouseLeave={() => hideTooltip()}
                                />
                              </Group>
                            );
                          })}
                          
                          {graph.nodes.map((graphNode, i) => {
                            // Find the original node data
                            const originalNode = nodes[i];
                            const name = originalNode?.name || '';
                            const color = originalNode?.color || '#333';
                            const amount = originalNode?.amount || 0;
                            const percentage = originalNode?.percentage || 0;
                            const type = originalNode?.type || '';
                            
                            // Height-based font size for better readability on small nodes
                            const nodeHeight = (graphNode.y1 || 0) - (graphNode.y0 || 0);
                            const fontSize = nodeHeight < 30 ? 8 : nodeHeight < 50 ? 10 : 11;
                            const valuesFontSize = fontSize - 2;
                            
                            return (
                              <Group key={`node-${i}`}>
                                <Bar
                                  x={graphNode.x0 || 0}
                                  y={graphNode.y0 || 0}
                                  width={(graphNode.x1 || 0) - (graphNode.x0 || 0)}
                                  height={(graphNode.y1 || 0) - (graphNode.y0 || 0)}
                                  fill={color}
                                  rx={4}
                                  className="sankey-node"
                                  onMouseEnter={(event: React.MouseEvent) => {
                                    showTooltip({
                                      tooltipData: {
                                        name,
                                        value: amount,
                                        percentage,
                                        color,
                                        type
                                      },
                                      tooltipLeft: event.clientX,
                                      tooltipTop: event.clientY
                                    });
                                  }}
                                  onMouseLeave={() => hideTooltip()}
                                />
                                
                                {/* Add text labels */}
                                <Text
                                  x={(graphNode.x0 || 0) + ((graphNode.x1 || 0) - (graphNode.x0 || 0)) / 2}
                                  y={(graphNode.y0 || 0) + ((graphNode.y1 || 0) - (graphNode.y0 || 0)) / 2 - 8}
                                  width={Math.min(100, (graphNode.x1 || 0) - (graphNode.x0 || 0) - 4)}
                                  textAnchor="middle"
                                  verticalAnchor="middle"
                                  fill="white"
                                  fontSize={fontSize}
                                  fontWeight="bold"
                                  style={{ wordWrap: 'break-word', whiteSpace: 'normal' }}
                                >
                                  {name.length > 12 ? `${name.substring(0, 10)}...` : name}
                                </Text>
                                <Text
                                  x={(graphNode.x0 || 0) + ((graphNode.x1 || 0) - (graphNode.x0 || 0)) / 2}
                                  y={(graphNode.y0 || 0) + ((graphNode.y1 || 0) - (graphNode.y0 || 0)) / 2 + 8}
                                  width={(graphNode.x1 || 0) - (graphNode.x0 || 0)}
                                  textAnchor="middle"
                                  verticalAnchor="middle"
                                  fill="white"
                                  fontSize={valuesFontSize}
                                >
                                  {formatAmount(amount)}
                                </Text>
                                {nodeHeight > 40 && (
                                  <Text
                                    x={(graphNode.x0 || 0) + ((graphNode.x1 || 0) - (graphNode.x0 || 0)) / 2}
                                    y={(graphNode.y0 || 0) + ((graphNode.y1 || 0) - (graphNode.y0 || 0)) / 2 + 22}
                                    width={(graphNode.x1 || 0) - (graphNode.x0 || 0)}
                                    textAnchor="middle"
                                    verticalAnchor="middle"
                                    fill="white"
                                    fontSize={valuesFontSize - 1}
                                  >
                                    {periodLabel}
                                  </Text>
                                )}
                              </Group>
                            );
                          })}
                        </Group>
                      );
                    }}
                  </Sankey>
                </Group>
              </svg>
              
              {tooltipOpen && tooltipData && (
                <div
                  style={{
                    ...defaultStyles,
                    position: 'absolute',
                    top: tooltipTop,
                    left: tooltipLeft,
                    backgroundColor: 'var(--background)',
                    color: 'var(--foreground)',
                    border: '1px solid var(--border)',
                    borderRadius: '0.375rem',
                    padding: '0.5rem',
                    fontSize: '0.75rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                  }}
                >
                  <div style={{ fontWeight: 'bold' }}>{tooltipData.name}</div>
                  <div style={{ color: tooltipData.color }}>
                    {formatAmount(tooltipData.value)} 
                    <span className="text-muted-foreground text-xs ml-1">
                      {periodLabel}
                    </span>
                    <span className="ml-1">({formatPercentage(tooltipData.percentage)})</span>
                  </div>
                  {tooltipData.type === 'link' && tooltipData.sourceName && tooltipData.targetName && (
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '0.7rem', marginTop: '0.25rem' }}>
                      {formatPercentage(tooltipData.percentage)} of total income flows from {tooltipData.sourceName} to {tooltipData.targetName}
                    </div>
                  )}
                  {tooltipData.type === 'expense-subcategory' && (
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '0.7rem', marginTop: '0.25rem' }}>
                      This represents all {tooltipData.name} expenses calculated on a {displayPeriod} basis
                    </div>
                  )}
                </div>
              )}
            </>
          );
        }}
      </ParentSize>
      <div className="text-xs text-muted-foreground mt-2">
        The flow diagram shows how income is distributed across expenses, taxes, and savings on a {displayPeriod} basis.
      </div>
    </div>
  );
} 
