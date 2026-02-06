'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, TrendingUp, PiggyBank, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Hero() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-32 lg:py-40">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Gradient orbs */}
        <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-chart-2/20 rounded-full blur-3xl" />

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.02] dark:opacity-[0.05]"
          style={{
            backgroundImage: `linear-gradient(to right, currentColor 1px, transparent 1px),
                             linear-gradient(to bottom, currentColor 1px, transparent 1px)`,
            backgroundSize: '4rem 4rem',
          }}
        />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Column - Content */}
          <div className="text-center lg:text-left">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
                <Sparkles className="w-4 h-4" />
                AI-Powered Finance Tracking
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
            >
              Take Control of{' '}
              <span className="relative">
                <span className="relative z-10 text-primary">Your Finances</span>
                <motion.span
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 0.8, delay: 0.6 }}
                  className="absolute bottom-2 left-0 h-3 bg-primary/20 -z-0"
                />
              </span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-8"
            >
              Track expenses, manage budgets, and collaborate with your household—all with beautiful visualizations and smart AI insights.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <Link href="/personal/income/">
                <Button size="lg" variant="terminal" className="text-base px-8 group">
                  Get Started Free
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link href="#features">
                <Button size="lg" variant="outline" className="text-base px-8">
                  See How It Works
                </Button>
              </Link>
            </motion.div>

            {/* Social Proof */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mt-10 flex flex-col sm:flex-row items-center gap-6 justify-center lg:justify-start"
            >
              <div className="flex -space-x-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="w-10 h-10 rounded-full border-2 border-background bg-gradient-to-br from-muted to-muted-foreground/20 flex items-center justify-center text-xs font-medium text-muted-foreground"
                  >
                    {String.fromCharCode(64 + i)}
                  </div>
                ))}
              </div>
              <div className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">1,000+</span> users tracking their finances
              </div>
            </motion.div>
          </div>

          {/* Right Column - Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="relative hidden lg:block"
          >
            {/* Main Dashboard Card */}
            <div className="relative">
              {/* Glow effect */}
              <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-chart-2/20 to-primary/20 rounded-2xl blur-xl opacity-60" />

              {/* Dashboard mockup */}
              <div className="relative bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-destructive/60" />
                    <div className="w-3 h-3 rounded-full bg-chart-1/60" />
                    <div className="w-3 h-3 rounded-full bg-chart-2/60" />
                  </div>
                  <span className="text-xs text-muted-foreground">pfinance.app/dashboard</span>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                  {/* Stats Row */}
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Total Balance', value: '$12,450', icon: CreditCard, color: 'text-primary' },
                      { label: 'This Month', value: '-$2,340', icon: TrendingUp, color: 'text-destructive' },
                      { label: 'Savings', value: '$4,200', icon: PiggyBank, color: 'text-chart-2' },
                    ].map((stat, i) => (
                      <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 + i * 0.1 }}
                        className="bg-muted/30 rounded-lg p-3"
                      >
                        <stat.icon className={`w-4 h-4 ${stat.color} mb-1`} />
                        <div className={`text-lg font-bold ${stat.color}`}>{stat.value}</div>
                        <div className="text-xs text-muted-foreground">{stat.label}</div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Chart Placeholder */}
                  <div className="h-32 bg-muted/30 rounded-lg flex items-end justify-around px-4 pb-3 gap-2">
                    {[40, 65, 45, 80, 55, 90, 70].map((height, i) => (
                      <motion.div
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${height}%` }}
                        transition={{ delay: 0.8 + i * 0.05, duration: 0.5, ease: 'easeOut' }}
                        className="w-6 bg-gradient-to-t from-primary to-primary/60 rounded-t"
                      />
                    ))}
                  </div>

                  {/* Expense List */}
                  <div className="space-y-2">
                    {[
                      { name: 'Groceries', amount: '-$156.40', category: 'Food' },
                      { name: 'Netflix', amount: '-$15.99', category: 'Entertainment' },
                      { name: 'Electricity', amount: '-$89.00', category: 'Utilities' },
                    ].map((expense, i) => (
                      <motion.div
                        key={expense.name}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1 + i * 0.1 }}
                        className="flex items-center justify-between py-2 border-b border-border/30 last:border-0"
                      >
                        <div>
                          <div className="text-sm font-medium">{expense.name}</div>
                          <div className="text-xs text-muted-foreground">{expense.category}</div>
                        </div>
                        <div className="text-sm font-medium text-destructive">{expense.amount}</div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Floating Elements */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2, duration: 0.5 }}
              className="absolute -top-4 -right-4 bg-card border border-border/50 rounded-lg p-3 shadow-lg"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-chart-2/20 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-chart-2" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Savings Goal</div>
                  <div className="text-sm font-semibold text-chart-2">84% Complete</div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.3, duration: 0.5 }}
              className="absolute -bottom-4 -left-4 bg-card border border-border/50 rounded-lg p-3 shadow-lg"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">AI Insight</div>
                  <div className="text-sm font-semibold">Spending down 12%</div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
