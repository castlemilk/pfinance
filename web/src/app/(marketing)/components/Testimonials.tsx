'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Quote, Star } from 'lucide-react';
import Marquee from './Marquee';

const testimonials = [
  {
    quote: "PFinance completely changed how I manage my money. The visualizations make it so easy to see where I'm overspending.",
    name: 'Sarah Chen',
    role: 'Software Engineer',
    avatar: 'https://i.pravatar.cc/80?img=1',
    rating: 5,
  },
  {
    quote: "Finally, a finance app that my whole family can use together. Sharing expenses with my partner has never been easier.",
    name: 'Marcus Johnson',
    role: 'Product Manager',
    avatar: 'https://i.pravatar.cc/80?img=3',
    rating: 5,
  },
  {
    quote: "The AI categorization is incredibly accurate. I just import my statements and everything gets sorted automatically.",
    name: 'Emily Rodriguez',
    role: 'Freelance Designer',
    avatar: 'https://i.pravatar.cc/80?img=5',
    rating: 5,
  },
  {
    quote: "Best budgeting tool I've ever used. The CRT theme makes finances feel less boring and actually fun to use!",
    name: 'David Park',
    role: 'Startup Founder',
    avatar: 'https://i.pravatar.cc/80?img=7',
    rating: 5,
  },
  {
    quote: "The group feature is a game changer for our household. We can finally track shared expenses without spreadsheets.",
    name: 'Lisa Thompson',
    role: 'Accountant',
    avatar: 'https://i.pravatar.cc/80?img=9',
    rating: 5,
  },
  {
    quote: "I love the retro aesthetic. It's rare to find an app that's both functional AND has a gorgeous design language.",
    name: 'Alex Rivera',
    role: 'UX Researcher',
    avatar: 'https://i.pravatar.cc/80?img=11',
    rating: 5,
  },
];

function TestimonialCard({ testimonial }: { testimonial: typeof testimonials[0] }) {
  return (
    <div className="crt-card w-[340px] flex-shrink-0">
      {/* CRT bezel top */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="crt-led" />
          <span className="text-[10px] text-muted-foreground/50 font-mono uppercase tracking-wider">
            Review
          </span>
        </div>
        <div className="flex gap-0.5">
          {Array.from({ length: testimonial.rating }).map((_, j) => (
            <Star key={j} className="w-3 h-3 fill-primary text-primary" />
          ))}
        </div>
      </div>

      {/* CRT screen */}
      <div className="crt-screen crt-scanlines crt-curvature m-2.5 p-5">
        {/* Quote icon */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center mb-3"
          style={{
            background: 'linear-gradient(135deg, color-mix(in oklch, var(--primary) 20%, transparent), color-mix(in oklch, var(--primary) 8%, transparent))',
            boxShadow: 'inset 0 -1px 2px rgba(0,0,0,0.1), 0 0 8px color-mix(in oklch, var(--primary) 15%, transparent)',
          }}
        >
          <Quote className="w-4 h-4 text-primary" />
        </div>

        {/* Quote */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          &ldquo;{testimonial.quote}&rdquo;
        </p>

        {/* Author with real avatar */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Image
              src={testimonial.avatar}
              alt={testimonial.name}
              width={40}
              height={40}
              className="w-10 h-10 rounded-full object-cover"
              style={{
                boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.15), 0 0 0 2px color-mix(in oklch, var(--primary) 30%, transparent), 0 2px 8px rgba(0,0,0,0.15)',
              }}
              loading="lazy"
              unoptimized
            />
            {/* Online indicator */}
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-card"
              style={{ boxShadow: '0 0 4px rgba(74, 222, 128, 0.5)' }}
            />
          </div>
          <div>
            <div className="font-semibold text-sm crt-text-glow">{testimonial.name}</div>
            <div className="text-xs text-muted-foreground">{testimonial.role}</div>
          </div>
        </div>
      </div>

      {/* CRT bottom bezel */}
      <div className="flex items-center justify-center px-4 py-1.5 border-t border-border/20">
        <div className="flex gap-1">
          <div className="w-8 h-0.5 rounded-full bg-muted-foreground/10" />
          <div className="w-4 h-0.5 rounded-full bg-muted-foreground/10" />
          <div className="w-6 h-0.5 rounded-full bg-muted-foreground/10" />
        </div>
      </div>
    </div>
  );
}

export default function Testimonials() {
  return (
    <section className="py-20 sm:py-32 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 dot-grid opacity-30" />

      <div className="relative">
        {/* Section Header */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <motion.span
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium text-primary mb-4 skeu-inset"
            >
              <span className="crt-led mr-1" />
              Testimonials
            </motion.span>
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-3xl sm:text-4xl font-bold tracking-tight mb-4 skeu-emboss"
            >
              Loved by <span className="text-primary crt-text-glow">Thousands</span>
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
        </div>

        {/* Infinite Marquee - Row 1 */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="mb-6"
        >
          <Marquee speed={40} pauseOnHover>
            {testimonials.slice(0, 3).map((t) => (
              <TestimonialCard key={t.name} testimonial={t} />
            ))}
          </Marquee>
        </motion.div>

        {/* Infinite Marquee - Row 2 (reverse) */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, duration: 0.8 }}
        >
          <div style={{ direction: 'rtl' }}>
            <Marquee speed={45} pauseOnHover>
              {testimonials.slice(3, 6).map((t) => (
                <TestimonialCard key={t.name} testimonial={t} />
              ))}
            </Marquee>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
