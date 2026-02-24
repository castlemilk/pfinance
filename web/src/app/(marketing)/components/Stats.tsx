'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';

const stats = [
  {
    value: 1000,
    suffix: '+',
    label: 'Active Users',
    description: 'People tracking their finances',
  },
  {
    value: 500,
    suffix: 'K+',
    label: 'Transactions Tracked',
    description: 'Expenses logged and categorized',
  },
  {
    value: 4.9,
    suffix: '/5',
    label: 'User Rating',
    description: 'Average satisfaction score',
    decimals: 1,
  },
  {
    value: 99.9,
    suffix: '%',
    label: 'Uptime',
    description: 'Reliable and always available',
    decimals: 1,
  },
];

function AnimatedCounter({
  value,
  suffix = '',
  decimals = 0,
  inView,
}: {
  value: number;
  suffix?: string;
  decimals?: number;
  inView: boolean;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) return;

    const duration = 2000;
    const steps = 60;
    const increment = value / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current = Math.min(value, current + increment);
      setCount(current);

      if (step >= steps) {
        setCount(value);
        clearInterval(timer);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value, inView]);

  return (
    <span>
      {count.toFixed(decimals)}
      {suffix}
    </span>
  );
}

export default function Stats() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section ref={ref} className="py-20 sm:py-24 relative skeu-surface">
      <div className="absolute inset-0 bg-card/50" />
      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="text-center"
            >
              {/* Inset display panel */}
              <div className="skeu-inset rounded-xl p-5 mb-3 mx-auto max-w-[200px]">
                {/* Scanline effect overlay */}
                <div className="relative overflow-hidden rounded-lg">
                  <div className="text-3xl sm:text-4xl lg:text-5xl font-bold text-primary font-mono tracking-tight">
                    <AnimatedCounter
                      value={stat.value}
                      suffix={stat.suffix}
                      decimals={stat.decimals}
                      inView={inView}
                    />
                  </div>
                  {/* Subtle scanline */}
                  <div
                    className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.06]"
                    style={{
                      backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, currentColor 2px, currentColor 3px)',
                    }}
                  />
                </div>
              </div>
              <div className="text-lg font-semibold mb-1 skeu-emboss">{stat.label}</div>
              <div className="text-sm text-muted-foreground">{stat.description}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
