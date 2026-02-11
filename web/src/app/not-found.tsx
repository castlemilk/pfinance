'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 overflow-hidden">
      {/* Scanlines overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-10"
        style={{
          background:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 1px, transparent 1px, transparent 3px)',
        }}
      />

      {/* CRT flicker overlay */}
      <div className="pointer-events-none fixed inset-0 z-20 animate-crt-flicker opacity-[0.03] bg-white" />

      {/* CRT screen */}
      <div
        className="relative z-0 w-full max-w-lg p-8 md:p-12 text-center"
        style={{
          borderRadius: '12px',
          boxShadow:
            '0 0 60px rgba(var(--glow-rgb, 200 140 40) / 0.15), inset 0 0 80px rgba(0,0,0,0.3)',
          background: 'rgba(10, 10, 10, 0.9)',
          border: '2px solid rgba(var(--glow-rgb, 200 140 40) / 0.2)',
        }}
      >
        {/* ASCII art 404 */}
        <pre
          className="text-primary font-mono text-xs md:text-sm leading-tight mb-6 select-none"
          style={{
            textShadow: '0 0 10px currentColor, 0 0 20px currentColor',
            filter: 'brightness(1.2)',
          }}
        >
{`
 ██╗  ██╗ ██████╗ ██╗  ██╗
 ██║  ██║██╔═══██╗██║  ██║
 ███████║██║   ██║███████║
 ╚════██║██║   ██║╚════██║
      ██║╚██████╔╝     ██║
      ╚═╝ ╚═════╝      ╚═╝`}
        </pre>

        {/* Signal Lost heading */}
        <h1
          className="text-primary font-mono text-2xl md:text-3xl font-bold mb-2 tracking-widest"
          style={{ textShadow: '0 0 10px currentColor' }}
        >
          SIGNAL LOST
        </h1>

        <p
          className="text-primary/70 font-mono text-sm mb-2"
          style={{ textShadow: '0 0 5px currentColor' }}
        >
          PAGE NOT FOUND
        </p>

        {/* Blinking cursor line */}
        <p className="text-primary/50 font-mono text-xs mb-8">
          <span className="opacity-60">{'>'}</span>{' '}
          <span className="animate-pulse">The requested resource does not exist_</span>
        </p>

        {/* Return button */}
        <Link href="/personal/">
          <Button
            variant="outline"
            className="font-mono text-sm border-primary/40 text-primary hover:bg-primary/10 hover:border-primary/60"
            style={{ textShadow: '0 0 5px currentColor' }}
          >
            {'> RETURN TO DASHBOARD'}
          </Button>
        </Link>

        {/* Terminal status line */}
        <div className="mt-8 pt-4 border-t border-primary/10">
          <p className="text-primary/30 font-mono text-[10px] tracking-wider">
            ERR_404 :: PFINANCE TERMINAL v2.0 :: CONNECTION TERMINATED
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes crt-flicker {
          0%, 100% { opacity: 0.03; }
          50% { opacity: 0.06; }
          75% { opacity: 0.01; }
        }
        .animate-crt-flicker {
          animation: crt-flicker 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
