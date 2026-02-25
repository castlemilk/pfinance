'use client';

import { useMemo } from 'react';

interface GenerativeAvatarProps {
  name: string;
  size?: number;
  className?: string;
  square?: boolean;
}

// djb2 hash — fast, good distribution
function hash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) & 0x7fffffff;
  }
  return h;
}

// Get the nth deterministic value derived from a seed
function pick(seed: number, n: number, max: number): number {
  // Mix seed with index to get varied but deterministic values
  const mixed = hash(seed.toString(36) + '.' + n);
  return mixed % max;
}

// Curated color palettes — retro-inspired, high-contrast, work at small sizes
const PALETTES = [
  ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#2C3E50'], // Coral reef
  ['#F97F51', '#EE5A24', '#0ABDE3', '#10AC84', '#5F27CD'], // Vivid pop
  ['#FDA7DF', '#A29BFE', '#FFEAA7', '#81ECEC', '#6C5CE7'], // Pastel candy
  ['#FF9FF3', '#F368E0', '#48DBFB', '#FF6348', '#FFC048'], // Hot pink sky
  ['#E77F67', '#786FA6', '#63CDDA', '#CF6A87', '#303952'], // Dusk
  ['#FD7272', '#9AECDB', '#EAB543', '#D6A2E8', '#2C3A47'], // Tropical
  ['#FFC312', '#C4E538', '#12CBC4', '#FDA7DF', '#ED4C67'], // Electric
  ['#C44569', '#574B90', '#F78FB3', '#3DC1D3', '#E15F41'], // Berry blitz
];

type ShapeKind = 'circle' | 'half' | 'quarter' | 'triangle' | 'rect' | 'diamond';
const SHAPES: ShapeKind[] = ['circle', 'half', 'quarter', 'triangle', 'rect', 'diamond'];

interface ShapeProps {
  kind: ShapeKind;
  cx: number;
  cy: number;
  r: number;
  fill: string;
  rotation: number;
  opacity: number;
}

function Shape({ kind, cx, cy, r, fill, rotation, opacity }: ShapeProps) {
  const transform = `rotate(${rotation} ${cx} ${cy})`;

  switch (kind) {
    case 'circle':
      return <circle cx={cx} cy={cy} r={r} fill={fill} opacity={opacity} />;
    case 'half':
      return (
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy} Z`}
          fill={fill}
          opacity={opacity}
          transform={transform}
        />
      );
    case 'quarter':
      return (
        <path
          d={`M ${cx} ${cy} L ${cx + r} ${cy} A ${r} ${r} 0 0 0 ${cx} ${cy - r} Z`}
          fill={fill}
          opacity={opacity}
          transform={transform}
        />
      );
    case 'triangle':
      return (
        <polygon
          points={`${cx},${cy - r} ${cx + r * 0.87},${cy + r * 0.5} ${cx - r * 0.87},${cy + r * 0.5}`}
          fill={fill}
          opacity={opacity}
          transform={transform}
        />
      );
    case 'rect':
      return (
        <rect
          x={cx - r * 0.7}
          y={cy - r * 0.7}
          width={r * 1.4}
          height={r * 1.4}
          fill={fill}
          opacity={opacity}
          transform={transform}
        />
      );
    case 'diamond':
      return (
        <polygon
          points={`${cx},${cy - r} ${cx + r * 0.7},${cy} ${cx},${cy + r} ${cx - r * 0.7},${cy}`}
          fill={fill}
          opacity={opacity}
          transform={transform}
        />
      );
  }
}

export function GenerativeAvatar({ name, size = 32, className, square = false }: GenerativeAvatarProps) {
  const data = useMemo(() => {
    const seed = hash(name.toLowerCase().trim());

    // Pick palette
    const palette = PALETTES[seed % PALETTES.length];

    // Background: always the darkest/last color tinted by seed
    const bgColor = palette[pick(seed, 0, palette.length)];

    // Generate 3 layered shapes with decreasing size
    const shapes: ShapeProps[] = [];
    const layers = [
      { sizeRange: [28, 38], opRange: [0.9, 0.95], posRange: [10, 60] },   // Large
      { sizeRange: [18, 28], opRange: [0.8, 0.9],  posRange: [15, 55] },   // Medium
      { sizeRange: [10, 18], opRange: [0.75, 0.85], posRange: [20, 50] },   // Small accent
    ];

    for (let i = 0; i < 3; i++) {
      const layer = layers[i];
      // Ensure each shape gets a different color from the background
      const colorIdx = (pick(seed, 10 + i, palette.length - 1) + 1 + (palette.indexOf(bgColor))) % palette.length;
      shapes.push({
        kind: SHAPES[pick(seed, 20 + i, SHAPES.length)],
        cx: layer.posRange[0] + pick(seed, 30 + i, layer.posRange[1] - layer.posRange[0]),
        cy: layer.posRange[0] + pick(seed, 40 + i, layer.posRange[1] - layer.posRange[0]),
        r: layer.sizeRange[0] + pick(seed, 50 + i, layer.sizeRange[1] - layer.sizeRange[0]),
        fill: palette[colorIdx],
        rotation: pick(seed, 60 + i, 4) * 90 + pick(seed, 70 + i, 45), // snap to ~90° increments + variation
        opacity: layer.opRange[0] + pick(seed, 80 + i, 10) / 100,
      });
    }

    return { bgColor, shapes };
  }, [name]);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      className={className}
      role="img"
      aria-label={`Avatar for ${name}`}
      style={square ? undefined : { borderRadius: '50%' }}
    >
      <rect width={80} height={80} fill={data.bgColor} />
      {data.shapes.map((shape, i) => (
        <Shape key={i} {...shape} />
      ))}
    </svg>
  );
}
