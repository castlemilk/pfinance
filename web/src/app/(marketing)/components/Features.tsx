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
    bgColor: 'bg-primary/10',
  },
  {
    icon: PieChart,
    title: 'Beautiful Insights',
    description: 'Visualize your spending patterns with stunning charts. Understand where your money goes at a glance.',
    color: 'text-chart-2',
    bgColor: 'bg-chart-2/10',
  },
  {
    icon: Users,
    title: 'Multi-User Groups',
    description: 'Collaborate with family or roommates. Share expenses, split costs, and manage household finances together.',
    color: 'text-chart-3',
    bgColor: 'bg-chart-3/10',
  },
  {
    icon: Brain,
    title: 'AI-Powered',
    description: 'Smart categorization learns your habits. Import bank statements with AI that understands your transactions.',
    color: 'text-chart-4',
    bgColor: 'bg-chart-4/10',
  },
  {
    icon: Bell,
    title: 'Budget Alerts',
    description: 'Set spending limits and get notified before you overspend. Stay on track with personalized alerts.',
    color: 'text-chart-5',
    bgColor: 'bg-chart-5/10',
  },
  {
    icon: Shield,
    title: 'Privacy First',
    description: 'Your financial data stays secure. Bank-level encryption with optional local-only storage.',
    color: 'text-secondary',
    bgColor: 'bg-secondary/10',
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
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: 'easeOut',
    },
  },
};

export default function Features() {
  return (
    <section id="features" className="py-20 sm:py-32 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-block text-sm font-medium text-primary mb-4"
          >
            Features
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl sm:text-4xl font-bold tracking-tight mb-4"
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

        {/* Features Grid */}
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
              className="group relative bg-card border border-border/50 rounded-xl p-6 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
            >
              {/* Icon */}
              <div className={`${feature.bgColor} w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                <feature.icon className={`w-6 h-6 ${feature.color}`} />
              </div>

              {/* Content */}
              <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">
                {feature.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {feature.description}
              </p>

              {/* Hover Accent */}
              <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
