'use client';

import { motion } from 'framer-motion';
import {
  Wallet,
  PieChart,
  Users,
  Brain,
  Bell,
  Shield,
} from 'lucide-react';

const features = [
  {
    icon: Wallet,
    title: 'Expense Tracking',
    description: 'Log expenses quickly with smart categorization. Track recurring payments and one-time purchases effortlessly.',
    color: 'text-primary',
    glowVar: 'var(--primary)',
  },
  {
    icon: PieChart,
    title: 'Beautiful Insights',
    description: 'Visualize your spending patterns with stunning charts. Understand where your money goes at a glance.',
    color: 'text-chart-2',
    glowVar: 'var(--chart-2)',
  },
  {
    icon: Users,
    title: 'Multi-User Groups',
    description: 'Collaborate with family or roommates. Share expenses, split costs, and manage household finances together.',
    color: 'text-chart-3',
    glowVar: 'var(--chart-3)',
  },
  {
    icon: Brain,
    title: 'AI-Powered',
    description: 'Smart categorization learns your habits. Import bank statements with AI that understands your transactions.',
    color: 'text-chart-4',
    glowVar: 'var(--chart-4)',
  },
  {
    icon: Bell,
    title: 'Budget Alerts',
    description: 'Set spending limits and get notified before you overspend. Stay on track with personalized alerts.',
    color: 'text-chart-5',
    glowVar: 'var(--chart-5)',
  },
  {
    icon: Shield,
    title: 'Privacy First',
    description: 'Your financial data stays secure. Bank-level encryption with optional local-only storage.',
    color: 'text-secondary',
    glowVar: 'var(--secondary)',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
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
    <section id="features" className="py-20 sm:py-32 skeu-surface relative">
      {/* Subtle textured background */}
      <div className="absolute inset-0 bg-muted/30" />

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium text-primary mb-4 skeu-inset"
          >
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
            <span className="text-primary">Master Your Money</span>
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

        {/* Features Grid - Skeuomorphic Cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="group relative skeu-card p-6 overflow-hidden"
            >
              {/* Glossy shine overlay */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                <div
                  className="absolute -top-1/2 -left-1/2 w-full h-full rotate-12"
                  style={{
                    background: 'linear-gradient(180deg, color-mix(in oklch, white 6%, transparent) 0%, transparent 60%)',
                  }}
                />
              </div>

              {/* Icon in embossed circular well */}
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300"
                style={{
                  background: `linear-gradient(135deg, color-mix(in oklch, ${feature.glowVar} 15%, transparent), color-mix(in oklch, ${feature.glowVar} 8%, transparent))`,
                  boxShadow: `inset 0 2px 4px rgba(0,0,0,0.08), inset 0 -1px 0 color-mix(in oklch, white 15%, transparent), 0 1px 2px rgba(0,0,0,0.05)`,
                }}
              >
                <feature.icon className={`w-6 h-6 ${feature.color}`} />
              </div>

              {/* Content */}
              <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors skeu-emboss">
                {feature.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed relative z-10">
                {feature.description}
              </p>

              {/* Bottom glow accent on hover */}
              <div
                className="absolute inset-x-0 bottom-0 h-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-b-lg"
                style={{
                  background: `linear-gradient(90deg, transparent, ${feature.glowVar}, transparent)`,
                  filter: 'blur(1px)',
                }}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
