'use client';

import {
  PiggyBank,
  Wallet,
  TrendingUp,
  CreditCard,
  Target,
  Calculator,
  BarChart3,
  Coins,
  Shield,
  Landmark
} from 'lucide-react';

interface BlogPostImageProps {
  title: string;
  category: string;
  className?: string;
}

const categoryConfig: Record<string, {
  gradient: string;
  icon: React.ElementType;
  pattern: string;
}> = {
  budgeting: {
    gradient: 'from-amber-500 via-orange-500 to-yellow-500',
    icon: Calculator,
    pattern: 'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.1) 0%, transparent 50%)',
  },
  saving: {
    gradient: 'from-emerald-500 via-green-500 to-teal-500',
    icon: PiggyBank,
    pattern: 'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.15) 0%, transparent 50%)',
  },
  'expense tracking': {
    gradient: 'from-blue-500 via-indigo-500 to-purple-500',
    icon: Wallet,
    pattern: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.1) 0%, transparent 60%)',
  },
  debt: {
    gradient: 'from-rose-500 via-red-500 to-orange-500',
    icon: CreditCard,
    pattern: 'radial-gradient(circle at 30% 70%, rgba(255,255,255,0.12) 0%, transparent 50%)',
  },
  investing: {
    gradient: 'from-violet-500 via-purple-500 to-fuchsia-500',
    icon: TrendingUp,
    pattern: 'radial-gradient(circle at 70% 30%, rgba(255,255,255,0.1) 0%, transparent 50%)',
  },
  goals: {
    gradient: 'from-cyan-500 via-blue-500 to-indigo-500',
    icon: Target,
    pattern: 'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.15) 0%, transparent 50%)',
  },
  general: {
    gradient: 'from-slate-500 via-gray-500 to-zinc-500',
    icon: BarChart3,
    pattern: 'radial-gradient(circle at 50% 80%, rgba(255,255,255,0.1) 0%, transparent 50%)',
  },
};

export default function BlogPostImage({ title, category, className = '' }: BlogPostImageProps) {
  const config = categoryConfig[category.toLowerCase()] || categoryConfig.general;
  const Icon = config.icon;

  return (
    <div
      className={`relative w-full h-full bg-gradient-to-br ${config.gradient} overflow-hidden ${className}`}
      style={{ backgroundImage: config.pattern }}
    >
      {/* Decorative circles */}
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-white/10 blur-2xl" />

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `linear-gradient(to right, white 1px, transparent 1px),
                           linear-gradient(to bottom, white 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />

      {/* Center icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative">
          {/* Glow effect */}
          <div className="absolute inset-0 blur-xl bg-white/30 rounded-full scale-150" />
          <Icon className="relative w-16 h-16 text-white/90 drop-shadow-lg" strokeWidth={1.5} />
        </div>
      </div>

      {/* Floating decorative icons */}
      <div className="absolute top-4 left-4 opacity-20">
        <Coins className="w-6 h-6 text-white" />
      </div>
      <div className="absolute bottom-4 right-4 opacity-20">
        <Shield className="w-6 h-6 text-white" />
      </div>
      <div className="absolute top-4 right-4 opacity-15">
        <Landmark className="w-5 h-5 text-white" />
      </div>

      {/* Bottom gradient for text readability if needed */}
      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/20 to-transparent" />
    </div>
  );
}
