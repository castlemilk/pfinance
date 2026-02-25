'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SkeuButton } from '@/components/ui/skeu-button';
import { SkeuToggle } from '@/components/ui/skeu-toggle';

const plans = [
  {
    name: 'Free',
    description: 'Perfect for getting started with personal finance tracking.',
    price: { monthly: 0, annual: 0 },
    features: [
      'Expense tracking',
      'Basic budgets (3 categories)',
      'Monthly reports',
      'Single user',
      'Data export',
    ],
    cta: 'Get Started',
    popular: false,
  },
  {
    name: 'Pro',
    description: 'Everything you need for serious financial management.',
    price: { monthly: 9, annual: 7 },
    features: [
      'Everything in Free',
      'Unlimited budgets',
      'Advanced reports & analytics',
      'Multi-user groups (up to 10)',
      'AI-powered categorization',
      'Bank statement import',
      'Budget notifications',
      'Priority support',
      'API access',
    ],
    cta: 'Start Pro Trial',
    popular: true,
  },
];

export default function Pricing() {
  const [isAnnual, setIsAnnual] = useState(true);

  return (
    <section id="pricing" className="py-20 sm:py-32 relative skeu-surface">
      <div className="absolute inset-0 bg-muted/30" />
      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium text-primary mb-4 skeu-inset"
          >
            Pricing
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl sm:text-4xl font-bold tracking-tight mb-4 skeu-emboss"
          >
            Simple, <span className="text-primary">Transparent</span> Pricing
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-lg text-muted-foreground"
          >
            Start free and upgrade when you need more features.
          </motion.p>
        </div>

        {/* Skeuomorphic Billing Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-center gap-4 mb-12"
        >
          <span className={cn('text-sm font-medium', !isAnnual ? 'text-foreground' : 'text-muted-foreground')}>
            Monthly
          </span>
          <SkeuToggle
            checked={isAnnual}
            onCheckedChange={setIsAnnual}
            variant="primary"
          />
          <span className={cn('text-sm font-medium', isAnnual ? 'text-foreground' : 'text-muted-foreground')}>
            Annual
            <span className="ml-1.5 text-xs text-primary font-semibold">Save 22%</span>
          </span>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className={cn(
                'relative skeu-card p-8 overflow-hidden',
                plan.popular && 'ring-2 ring-primary/50'
              )}
            >
              {/* Pro card glow */}
              {plan.popular && (
                <div className="absolute -inset-[1px] rounded-[inherit] -z-10"
                  style={{
                    background: 'linear-gradient(135deg, var(--primary), var(--chart-2), var(--primary))',
                    filter: 'blur(8px)',
                    opacity: 0.15,
                  }}
                />
              )}

              {/* Popular Badge - glossy ribbon */}
              {plan.popular && (
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-10">
                  <span
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold text-primary-foreground"
                    style={{
                      background: 'linear-gradient(180deg, color-mix(in oklch, var(--primary) 100%, white 15%) 0%, var(--primary) 60%, color-mix(in oklch, var(--primary) 100%, black 10%) 100%)',
                      boxShadow: '0 2px 8px color-mix(in oklch, var(--primary) 40%, transparent), inset 0 1px 0 color-mix(in oklch, white 25%, transparent)',
                    }}
                  >
                    <Sparkles className="w-3 h-3" />
                    Most Popular
                  </span>
                </div>
              )}

              {/* Plan Header */}
              <div className="mb-6 pt-2">
                <h3 className="text-xl font-bold mb-2 skeu-emboss">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </div>

              {/* Price in inset display */}
              <div className="mb-6">
                <div className="skeu-inset rounded-lg px-4 py-3 inline-block">
                  <span className="text-4xl font-bold font-mono">
                    ${isAnnual ? plan.price.annual : plan.price.monthly}
                  </span>
                  {plan.price.monthly > 0 && (
                    <span className="text-muted-foreground">/month</span>
                  )}
                </div>
                {isAnnual && plan.price.annual > 0 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Billed annually (${plan.price.annual * 12}/year)
                  </p>
                )}
              </div>

              {/* CTA - Skeuomorphic button */}
              <Link href={plan.popular ? '/personal/billing/' : '/personal/'} className="block mb-8">
                <SkeuButton
                  variant={plan.popular ? 'primary' : 'outline'}
                  size="lg"
                  className="w-full"
                >
                  {plan.cta}
                </SkeuButton>
              </Link>

              {/* Features - embossed checkmarks */}
              <ul className="space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <div
                      className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5"
                      style={{
                        background: 'linear-gradient(135deg, color-mix(in oklch, var(--primary) 20%, transparent), color-mix(in oklch, var(--primary) 10%, transparent))',
                        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.08), 0 1px 0 color-mix(in oklch, white 15%, transparent)',
                      }}
                    >
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Bottom Note */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="text-center text-sm text-muted-foreground mt-12"
        >
          All plans include a 14-day free trial. No credit card required.
        </motion.p>
      </div>
    </section>
  );
}
