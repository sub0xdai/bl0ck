import { Bullet } from '@/components/ui/bullet';
import { Button } from '@/components/ui/button';
import { Sparkles, X, Zap, TrendingUp, Shield, Brain } from 'lucide-react';

interface AboutModalContentProps {
  onClose: () => void;
}

const coreFeatures = [
  {
    icon: TrendingUp,
    title: 'Drift Perpetuals',
    description: 'Automated long/short positions on Solana with configurable leverage and risk controls.',
  },
  {
    icon: Zap,
    title: 'Autonomous Trading',
    description: 'Signal-driven execution cycles that scan markets, assess confidence, and trade without manual input.',
  },
  {
    icon: Shield,
    title: 'Risk Management',
    description: 'Position sizing, max exposure limits, and confidence thresholds to protect your capital.',
  },
  {
    icon: Brain,
    title: 'Market Intelligence',
    description: 'Real-time signals from price action, volume trends, and news sentiment.',
  },
];

const integrations = [
  { name: 'Drift Protocol', desc: 'Solana perps execution' },
  { name: 'CoinGecko', desc: 'Price & volume data' },
  { name: 'Tavily', desc: 'News sentiment' },
  { name: 'Jupiter', desc: 'Price feeds' },
  { name: 'Coinbase CDP', desc: 'EVM wallet ops' },
  { name: 'DeFiLlama', desc: 'TVL analytics' },
];

export function AboutModalContent({ onClose }: AboutModalContentProps) {
  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex justify-end w-full">
        <Button
          variant="ghost"
          size="icon-sm"
          className="z-30 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label="Close about modal"
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="relative flex flex-col text-foreground max-h-[60vh] overflow-x-hidden overflow-y-auto sm:h-[80vh] sm:max-h-[600px] sm:overflow-visible my-4">
        {/* Header */}
        <header className="flex shrink-0 flex-col gap-4 border-b border-border/60 pb-6">
          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <Bullet className="size-2.5" />
            About Lina
          </div>
          <div className="space-y-3">
            <h2 className="text-3xl font-display leading-none sm:text-4xl">
              Autonomous perps trading on Solana.
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Lina executes perpetual trades on Drift Protocol using signal-driven automation.
              Set your risk parameters, enable auto mode, and let her trade.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase text-muted-foreground/80">
              <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/40 bg-purple-500/10 px-3 py-1 font-medium tracking-wider text-purple-400">
                <Sparkles className="size-3" />
                Drift Perps
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1 font-medium tracking-wider text-green-400">
                Autotrading
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1 font-medium tracking-wider">
                Solana
              </span>
            </div>
          </div>
          <div className="flex justify-start">
            <img
              src="/assets/elizaos_badge.svg"
              alt="Powered by ElizaOS"
              className="h-14"
            />
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 space-y-6 py-6 sm:overflow-y-auto">
          {/* Core Features */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              <Bullet className="size-2.5" />
              Core Features
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {coreFeatures.map((item) => (
                <div
                  key={item.title}
                  className="group rounded-lg border border-border/60 bg-background/80 p-4 transition-colors hover:bg-accent/30"
                >
                  <div className="flex items-start gap-3">
                    <item.icon className="mt-0.5 size-4 shrink-0 text-purple-400" />
                    <div className="space-y-1">
                      <h3 className="font-semibold uppercase tracking-wide text-xs text-foreground">
                        {item.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Integrations */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              <Bullet className="size-2.5" />
              Integrations
            </div>
            <div className="flex flex-wrap gap-2">
              {integrations.map((item) => (
                <div
                  key={item.name}
                  className="rounded-md border border-border/60 bg-background/60 px-3 py-2"
                >
                  <span className="text-xs font-semibold text-foreground">{item.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{item.desc}</span>
                </div>
              ))}
            </div>
          </section>

          {/* How It Works */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              <Bullet className="size-2.5" />
              How It Works
            </div>
            <div className="rounded-lg border border-border/60 bg-background/80 p-4 font-mono text-xs text-muted-foreground space-y-1">
              <p><span className="text-purple-400">1.</span> Connect Solana wallet with Drift account</p>
              <p><span className="text-purple-400">2.</span> Click AUTO to enable trading</p>
              <p><span className="text-purple-400">3.</span> Lina scans markets every 5 minutes</p>
              <p><span className="text-purple-400">4.</span> Signals above confidence threshold trigger trades</p>
              <p><span className="text-purple-400">5. </span> Positions appear in header, updates in chat</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
