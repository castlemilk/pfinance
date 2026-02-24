'use client';

import Link from 'next/link';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles, TrendingUp, PiggyBank, CreditCard } from 'lucide-react';

const chartData = [
  { label: 'Mon', value: 40, amount: '$120' },
  { label: 'Tue', value: 65, amount: '$195' },
  { label: 'Wed', value: 45, amount: '$135' },
  { label: 'Thu', value: 80, amount: '$240' },
  { label: 'Fri', value: 55, amount: '$165' },
  { label: 'Sat', value: 90, amount: '$270' },
  { label: 'Sun', value: 70, amount: '$210' },
];

export default function Hero() {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  return (
    <section className="relative overflow-hidden py-20 sm:py-32 lg:py-40">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-chart-2/5" />
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.12, 0.2, 0.12] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-1/4 -left-1/4 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[80px]"
        />
        <motion.div
          animate={{ scale: [1.08, 1, 1.08], opacity: [0.08, 0.15, 0.08] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-1/4 -right-1/4 w-[500px] h-[500px] bg-chart-2/20 rounded-full blur-[80px]"
        />
        <div
          className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(to right, currentColor 1px, transparent 1px),
                             linear-gradient(to bottom, currentColor 1px, transparent 1px)`,
            backgroundSize: '4rem 4rem',
          }}
        />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Column */}
          <div className="text-center lg:text-left">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full skeu-inset text-primary text-sm font-medium mb-6">
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
                  className="absolute bottom-2 left-0 h-3 bg-primary/20 -z-0 rounded-sm"
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
                <button className="skeu-button px-8 py-3 text-base font-semibold rounded-xl flex items-center gap-2 group">
                  Get Started Free
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </Link>
              <Link href="#features">
                <button
                  className="px-8 py-3 text-base font-medium rounded-xl border border-border bg-card/80 hover:bg-muted/80 transition-all duration-200"
                  style={{
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06), inset 0 1px 0 color-mix(in oklch, white 10%, transparent)',
                  }}
                >
                  See How It Works
                </button>
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
                    className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-medium text-muted-foreground border-2 border-background bg-muted"
                    style={{
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    }}
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
            <div className="relative">
              {/* Glow behind */}
              <motion.div
                animate={{ opacity: [0.3, 0.5, 0.3] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -inset-4 bg-gradient-to-r from-primary/10 via-chart-2/10 to-primary/10 rounded-2xl blur-xl"
              />

              {/* Dashboard card */}
              <div className="relative skeu-card overflow-hidden rounded-xl">
                {/* Window chrome */}
                <div className="px-5 py-3.5 border-b border-border/40 flex items-center justify-between bg-muted/20">
                  <div className="flex items-center gap-1.5">
                    {['bg-red-400', 'bg-yellow-400', 'bg-green-400'].map((color, i) => (
                      <div
                        key={i}
                        className={`w-2.5 h-2.5 rounded-full ${color}`}
                        style={{ boxShadow: 'inset 0 -1px 1px rgba(0,0,0,0.15)' }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground/60 font-mono">pfinance.app</span>
                </div>

                {/* Content */}
                <div className="p-5 space-y-4">
                  {/* Stats Row */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Balance', value: '$12,450', icon: CreditCard, color: 'text-primary' },
                      { label: 'Spent', value: '-$2,340', icon: TrendingUp, color: 'text-destructive' },
                      { label: 'Saved', value: '$4,200', icon: PiggyBank, color: 'text-chart-2' },
                    ].map((stat, i) => (
                      <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 + i * 0.1 }}
                        className="skeu-inset rounded-lg p-2.5"
                      >
                        <stat.icon className={`w-3.5 h-3.5 ${stat.color} mb-1`} />
                        <div className={`text-base font-bold ${stat.color}`}>{stat.value}</div>
                        <div className="text-[10px] text-muted-foreground">{stat.label}</div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Interactive Chart */}
                  <div className="skeu-inset rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-muted-foreground">Weekly Spending</span>
                      <AnimatePresence mode="wait">
                        {hoveredBar !== null ? (
                          <motion.span
                            key={hoveredBar}
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 4 }}
                            className="text-xs font-bold text-primary"
                          >
                            {chartData[hoveredBar].label}: {chartData[hoveredBar].amount}
                          </motion.span>
                        ) : (
                          <motion.span
                            key="total"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-xs text-muted-foreground/60"
                          >
                            Hover to explore
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="h-28 flex items-end justify-around gap-2">
                      {chartData.map((bar, i) => (
                        <div
                          key={i}
                          className="flex flex-col items-center gap-1.5 flex-1"
                          onMouseEnter={() => setHoveredBar(i)}
                          onMouseLeave={() => setHoveredBar(null)}
                        >
                          {/* Tooltip */}
                          <AnimatePresence>
                            {hoveredBar === i && (
                              <motion.div
                                initial={{ opacity: 0, y: 4, scale: 0.9 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 4, scale: 0.9 }}
                                transition={{ duration: 0.15 }}
                                className="text-[10px] font-bold text-primary whitespace-nowrap skeu-glass rounded px-1.5 py-0.5"
                              >
                                {bar.amount}
                              </motion.div>
                            )}
                          </AnimatePresence>
                          {/* Bar */}
                          <div className="w-full relative" style={{ height: '80px' }}>
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: `${bar.value}%` }}
                              transition={{ delay: 0.8 + i * 0.06, duration: 0.6, ease: 'easeOut' }}
                              className="absolute bottom-0 inset-x-0 rounded-t cursor-pointer transition-all duration-150"
                              style={{
                                background: hoveredBar === i
                                  ? 'linear-gradient(180deg, var(--primary) 0%, color-mix(in oklch, var(--primary) 80%, black) 100%)'
                                  : 'linear-gradient(180deg, color-mix(in oklch, var(--primary) 80%, white 10%) 0%, color-mix(in oklch, var(--primary) 70%, black) 100%)',
                                boxShadow: hoveredBar === i
                                  ? '0 0 12px color-mix(in oklch, var(--glow-color) 40%, transparent), inset 0 1px 0 color-mix(in oklch, white 25%, transparent)'
                                  : 'inset 0 1px 0 color-mix(in oklch, white 15%, transparent)',
                                transform: hoveredBar === i ? 'scaleX(1.15)' : 'scaleX(1)',
                              }}
                            />
                          </div>
                          {/* Label */}
                          <span className={`text-[10px] transition-colors duration-150 ${hoveredBar === i ? 'text-primary font-semibold' : 'text-muted-foreground/50'}`}>
                            {bar.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Expense List */}
                  <div className="space-y-1.5">
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
                        className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/30 transition-colors cursor-default"
                      >
                        <div>
                          <div className="text-sm font-medium">{expense.name}</div>
                          <div className="text-[10px] text-muted-foreground">{expense.category}</div>
                        </div>
                        <div className="text-sm font-medium text-destructive">{expense.amount}</div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Floating cards */}
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -top-3 -right-3"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.2, duration: 0.5 }}
                className="skeu-card rounded-lg p-2.5 shadow-lg"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-chart-2/15 flex items-center justify-center">
                    <TrendingUp className="w-3.5 h-3.5 text-chart-2" />
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Savings Goal</div>
                    <div className="text-xs font-semibold text-chart-2">84% Complete</div>
                  </div>
                </div>
              </motion.div>
            </motion.div>

            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              className="absolute -bottom-3 -left-3"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.3, duration: 0.5 }}
                className="skeu-card rounded-lg p-2.5 shadow-lg"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">AI Insight</div>
                    <div className="text-xs font-semibold">Spending down 12%</div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
