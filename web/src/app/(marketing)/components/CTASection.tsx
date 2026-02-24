'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';

export default function CTASection() {
  return (
    <section className="py-20 sm:py-32 relative overflow-hidden skeu-surface">
      {/* Rich textured gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-background to-chart-2/8" />

      {/* Animated glow orb */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px]">
        <motion.div
          animate={{ scale: [0.9, 1.1, 0.9], opacity: [0.2, 0.35, 0.2] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/20 to-chart-2/20 blur-[80px]"
        />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto text-center"
        >
          {/* Glossy badge with shimmer */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <span
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium text-primary mb-6 skeu-inset relative overflow-hidden"
            >
              <Sparkles className="w-4 h-4 relative z-10" />
              <span className="relative z-10">Start for free today</span>
              {/* Shimmer sweep */}
              <motion.span
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 3, repeat: Infinity, repeatDelay: 2, ease: 'easeInOut' }}
                className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-primary/10 to-transparent"
              />
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 skeu-emboss"
          >
            Ready to Transform Your{' '}
            <span className="text-primary">Financial Future?</span>
          </motion.h2>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="text-lg sm:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto"
          >
            Join thousands of users who have already taken control of their finances.
            No credit card required to get started.
          </motion.p>

          {/* Hero CTA Button - large and prominent */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
            className="relative inline-block"
          >
            {/* Glow halo behind button */}
            <motion.div
              animate={{ opacity: [0.3, 0.6, 0.3], scale: [0.95, 1.05, 0.95] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -inset-4 bg-primary/20 rounded-2xl blur-xl"
            />
            <Link href="/personal/income/">
              <button className="relative skeu-button px-10 py-4 text-lg font-bold rounded-xl flex items-center gap-3 group">
                Get Started Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </Link>
          </motion.div>

          {/* Trust indicators - embossed style */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 text-sm text-muted-foreground"
          >
            {['Free forever plan', 'No credit card required', 'Setup in 2 minutes'].map((text) => (
              <span key={text} className="flex items-center gap-2">
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, color-mix(in oklch, var(--chart-2) 25%, transparent), color-mix(in oklch, var(--chart-2) 12%, transparent))',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.08), 0 1px 0 color-mix(in oklch, white 12%, transparent)',
                  }}
                >
                  <svg className="w-3 h-3 text-chart-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
                {text}
              </span>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
