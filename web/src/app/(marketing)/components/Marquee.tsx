'use client';

import { ReactNode } from 'react';

interface MarqueeProps {
  children: ReactNode;
  speed?: number;
  pauseOnHover?: boolean;
  className?: string;
}

export default function Marquee({ children, speed = 30, pauseOnHover = true, className = '' }: MarqueeProps) {
  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{ maskImage: 'linear-gradient(to right, transparent, black 5%, black 95%, transparent)' }}
    >
      <div
        className={`flex gap-6 w-max ${pauseOnHover ? 'hover:[animation-play-state:paused]' : ''}`}
        style={{
          animation: `marqueeScroll ${speed}s linear infinite`,
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          contain: 'layout style paint',
        }}
      >
        {children}
        {children}
      </div>
    </div>
  );
}
