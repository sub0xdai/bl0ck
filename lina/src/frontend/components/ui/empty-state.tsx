import { cn } from "@/lib/utils";

interface EmptyStateProps {
  type: 'tokens' | 'nfts' | 'transactions' | 'generic';
  chain?: 'evm' | 'solana';
  className?: string;
}

// ASCII art for different empty states
const ASCII_ART = {
  tokens: `
    ╭──────────╮
    │  ◎  ◎  ◎ │
    │ ─────────│
    │   $0.00  │
    ╰──────────╯
  `,
  nfts: `
    ╭──────────╮
    │ ┌──────┐ │
    │ │  ??  │ │
    │ └──────┘ │
    ╰──────────╯
  `,
  transactions: `
    ╭──────────╮
    │ ← · · → │
    │ · · · · │
    │ ← · · → │
    ╰──────────╯
  `,
  generic: `
    ╭──────────╮
    │    ∅     │
    │  empty   │
    ╰──────────╯
  `,
};

const MESSAGES = {
  tokens: {
    evm: 'No EVM tokens found',
    solana: 'No Solana tokens found',
    default: 'No tokens found',
  },
  nfts: {
    default: 'No NFTs in collection',
  },
  transactions: {
    default: 'No transactions yet',
  },
  generic: {
    default: 'Nothing here yet',
  },
};

const SUB_MESSAGES = {
  tokens: 'Fund your wallet to get started',
  nfts: 'Your NFTs will appear here',
  transactions: 'Your activity will show up here',
  generic: 'Check back later',
};

export function EmptyState({ type, chain, className }: EmptyStateProps) {
  const art = ASCII_ART[type] || ASCII_ART.generic;
  const messages = MESSAGES[type] || MESSAGES.generic;
  const message = chain && 'evm' in messages
    ? messages[chain as keyof typeof messages] || messages.default
    : messages.default;
  const subMessage = SUB_MESSAGES[type];

  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-6 text-muted-foreground/50",
      className
    )}>
      <pre className="text-[10px] leading-tight font-mono select-none opacity-40">
        {art.trim()}
      </pre>
      <p className="text-xs mt-2 text-muted-foreground/70">{message}</p>
      <p className="text-[10px] mt-0.5 text-muted-foreground/40">{subMessage}</p>
    </div>
  );
}
