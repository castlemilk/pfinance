'use client';

import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';

interface BlogHeaderProps {
  title?: string;
  description?: string;
}

export default function BlogHeader({
  title = 'Blog',
  description = 'Tips, guides, and insights to help you master your personal finances.',
}: BlogHeaderProps) {
  return (
    <div className="relative overflow-hidden bg-muted/30 py-16 sm:py-24">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-1/2 -left-1/4 w-96 h-96 bg-chart-2/10 rounded-full blur-3xl" />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <BookOpen className="w-4 h-4" />
            Financial Insights
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            {title}
          </h1>
          <p className="text-lg text-muted-foreground">{description}</p>
        </motion.div>
      </div>
    </div>
  );
}
