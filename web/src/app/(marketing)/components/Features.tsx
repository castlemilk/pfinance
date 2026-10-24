'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Wallet,
  PieChart,
  Users,
  Brain,
  Bell,
  Shield,
} from 'lucide-react';
import dynamic from 'next/dynamic';

const WebGLStars = dynamic(() => import('./WebGLStars'), { ssr: false });

const features = [
  {
    icon: Wallet,
    title: 'Expense Tracking',
    description: 'Log expenses quickly with smart categorization. Capture receipts and track recurring payments effortlessly.',
    color: 'text-primary',
    glowVar: 'var(--primary)',
    href: '/features/receipt-scanner/',
  },
  {
    icon: PieChart,
    title: 'Beautiful Insights',
    description: 'Visualize your spending patterns and model your take-home pay with interactive calculators and charts.',
    color: 'text-chart-2',
    glowVar: 'var(--chart-2)',
    href: '/tools/australian-salary-calculator/',
  },
  {
    icon: Users,
    title: 'Multi-User Groups',
    description: 'Collaborate with family or roommates. Share expenses, split costs, and manage household finances together.',
    color: 'text-chart-3',
    glowVar: 'var(--chart-3)',
    href: '/features/household-budgeting/',
  },
  {
    icon: Brain,
    title: 'AI-Powered',
    description: 'Smart categorization learns your habits. Import bank statements with AI that stages and deduplicates transactions.',
    color: 'text-chart-4',
    glowVar: 'var(--chart-4)',
    href: '/features/bank-statement-import/',
  },
  {
    icon: Bell,
    title: 'Budget Alerts',
    description: 'Set spending limits and get notified before you overspend. Plan category budgets that fit your household.',
    color: 'text-chart-5',
    glowVar: 'var(--chart-5)',
    href: '/tools/budget-calculator/',
  },
  {
    icon: Shield,
    title: 'Tax-Ready Records',
    description: 'Keep receipt evidence and ATO deduction categories attached to expenses all year for cleaner tax exports.',
    color: 'text-secondary',
    glowVar: 'var(--secondary)',
    href: '/features/tax-deductions/',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
    },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: 'easeOut' as const,
    },
  },
};

export default function Features() {
  return (
    <section id="features" className="py-20 sm:py-32 relative overflow-hidden">
      {/* WebGL Stars Background */}
      <WebGLStars opacity={0.3} />
      <div className="absolute inset-0 bg-muted/40 dark:bg-background/60" />

      {/* Dot grid overlay */}
      <div className="absolute inset-0 dot-grid opacity-40" />

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium text-primary mb-4 skeu-inset"
          >
            <span className="crt-led mr-1" />
            Features
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl sm:text-4xl font-bold tracking-tight mb-4 skeu-emboss"
          >
            Everything You Need to{' '}
            <span className="text-primary crt-text-glow">Master Your Money</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-lg text-muted-foreground"
          >
            Powerful features designed to make personal finance simple, insightful, and even enjoyable.
          </motion.p>
        </div>

        {/* CRT Monitor Cards Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8"
        >
          {features.map((feature, idx) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              className="group crt-card"
            >
              {/* CRT bezel top — with power LED and label */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <div className="crt-led" style={{ animationDelay: `${idx * 0.5}s` }} />
                  <span className="text-[10px] text-muted-foreground/50 font-mono uppercase tracking-wider">
                    Module {String(idx + 1).padStart(2, '0')}
                  </span>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3].map((dot) => (
                    <div
                      key={dot}
                      className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20"
                    />
                  ))}
                </div>
              </div>

              {/* CRT Screen area */}
              <div className="crt-screen crt-scanlines crt-curvature m-3 p-5"
                style={{ animation: 'crtFlicker 4s ease-in-out infinite', animationDelay: `${idx * 0.3}s` }}
              >
                {/* Icon */}
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300"
                  style={{
                    background: `linear-gradient(135deg, color-mix(in oklch, ${feature.glowVar} 20%, transparent), color-mix(in oklch, ${feature.glowVar} 8%, transparent))`,
                    boxShadow: `inset 0 2px 4px rgba(0,0,0,0.1), 0 0 12px color-mix(in oklch, ${feature.glowVar} 15%, transparent)`,
                  }}
                >
                  <feature.icon className={`w-6 h-6 ${feature.color}`} />
                </div>

                {/* Content */}
                <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors crt-text-glow">
                  <Link href={feature.href} className="hover:underline underline-offset-4">
                    {feature.title}
                  </Link>
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>

              {/* CRT bottom bezel */}
              <div className="flex items-center justify-between px-4 py-2 border-t border-border/20">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-1 rounded-full bg-muted-foreground/10" />
                  <div className="w-4 h-1 rounded-full bg-muted-foreground/10" />
                </div>
                <span className="text-[9px] text-muted-foreground/30 font-mono">PF-{String(idx + 1).padStart(3, '0')}</span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
