'use client';

import { motion } from 'framer-motion';
import { Quote } from 'lucide-react';

const testimonials = [
  {
    quote: "PFinance completely changed how I manage my money. The visualizations make it so easy to see where I'm overspending.",
    name: 'Sarah Chen',
    role: 'Software Engineer',
    avatar: 'SC',
  },
  {
    quote: "Finally, a finance app that my whole family can use together. Sharing expenses with my partner has never been easier.",
    name: 'Marcus Johnson',
    role: 'Product Manager',
    avatar: 'MJ',
  },
  {
    quote: "The AI categorization is incredibly accurate. I just import my statements and everything gets sorted automatically.",
    name: 'Emily Rodriguez',
    role: 'Freelance Designer',
    avatar: 'ER',
  },
];

export default function Testimonials() {
  return (
    <section className="py-20 sm:py-32 relative skeu-surface">
      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium text-primary mb-4 skeu-inset"
          >
            Testimonials
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl sm:text-4xl font-bold tracking-tight mb-4 skeu-emboss"
          >
            Loved by <span className="text-primary">Thousands</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-lg text-muted-foreground"
          >
            See what our users have to say about their experience with PFinance.
          </motion.p>
        </div>

        {/* Testimonials Grid - Embossed note cards */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -3, rotateY: 2, transition: { duration: 0.3 } }}
              className="relative skeu-card p-6 overflow-hidden"
              style={{ perspective: '1000px' }}
            >
              {/* Paper texture corner fold */}
              <div
                className="absolute top-0 right-0 w-8 h-8"
                style={{
                  background: 'linear-gradient(225deg, var(--background) 50%, color-mix(in oklch, var(--border) 50%, transparent) 50%)',
                }}
              />

              {/* Quote Icon - embossed stamp */}
              <div
                className="absolute -top-2 -left-2 w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, color-mix(in oklch, var(--primary) 20%, var(--card)), color-mix(in oklch, var(--primary) 10%, var(--card)))',
                  boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.1), inset 0 1px 1px rgba(255,255,255,0.2), 0 2px 4px rgba(0,0,0,0.08)',
                }}
              >
                <Quote className="w-5 h-5 text-primary" />
              </div>

              {/* Quote Text */}
              <p className="text-muted-foreground mb-6 leading-relaxed pt-4">
                &ldquo;{testimonial.quote}&rdquo;
              </p>

              {/* Author with 3D avatar */}
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-primary-foreground"
                  style={{
                    background: 'linear-gradient(135deg, var(--primary), var(--chart-2))',
                    boxShadow: 'inset 0 -2px 3px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.3), 0 2px 6px rgba(0,0,0,0.12)',
                  }}
                >
                  {testimonial.avatar}
                </div>
                <div>
                  <div className="font-semibold skeu-emboss">{testimonial.name}</div>
                  <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
