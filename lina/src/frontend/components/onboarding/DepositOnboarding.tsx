import { useState } from 'react';
import { Button } from '../ui/button';
import { Copy, Check, Wallet, ArrowRight } from 'lucide-react';
import { useModal } from '../../contexts/ModalContext';

const ONBOARDING_MODAL_ID = 'deposit-onboarding-modal';
const ONBOARDING_DISMISSED_KEY = 'onboarding-dismissed';

interface DepositOnboardingProps {
  evmAddress: string;
  solanaAddress: string;
  isNewUser: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

interface WalletRowProps {
  label: string;
  address: string;
  icon: string;
  copied: boolean;
  onCopy: () => void;
}

function WalletRow({ label, address, icon, copied, onCopy }: WalletRowProps) {
  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';

  return (
    <div className="flex items-center justify-between gap-3 p-4 rounded-lg bg-accent hover:bg-accent/80 transition-colors border border-border/30">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden bg-white">
          <img src={icon} alt={label} className="w-full h-full object-contain" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground font-mono">{shortAddress}</span>
        </div>
      </div>
      <Button
        onClick={onCopy}
        variant="ghost"
        size="sm"
        className="h-9 w-9 p-0 shrink-0 text-muted-foreground hover:text-foreground"
        title="Copy address"
      >
        {copied ? (
          <Check className="w-4 h-4 text-green-500" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </Button>
    </div>
  );
}

export function DepositOnboardingContent({
  evmAddress,
  solanaAddress,
  isNewUser,
  onComplete,
  onSkip,
}: DepositOnboardingProps) {
  const { hideModal } = useModal();
  const [copiedAddress, setCopiedAddress] = useState<'evm' | 'solana' | null>(null);

  const handleCopy = async (address: string, type: 'evm' | 'solana') => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(type);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  const handleSkip = () => {
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, new Date().toISOString());
    hideModal(ONBOARDING_MODAL_ID);
    onSkip();
  };

  const handleComplete = () => {
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, new Date().toISOString());
    hideModal(ONBOARDING_MODAL_ID);
    onComplete();
  };

  return (
    <div className="space-y-6 w-full max-w-md mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <Wallet className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-xl font-semibold">
          {isNewUser ? 'Welcome to Lina' : 'Fund Your Wallets'}
        </h3>
        <p className="text-sm text-muted-foreground">
          {isNewUser
            ? 'Lina manages dedicated wallets for your trading. Deposit funds to get started.'
            : 'Your wallets are empty. Deposit funds to start trading.'}
        </p>
      </div>

      {/* Wallet Addresses */}
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
          Your Agent Wallets
        </p>

        {evmAddress && (
          <WalletRow
            label="EVM (Base, Ethereum, Polygon)"
            address={evmAddress}
            icon="/chains/base.svg"
            copied={copiedAddress === 'evm'}
            onCopy={() => handleCopy(evmAddress, 'evm')}
          />
        )}

        {solanaAddress && (
          <WalletRow
            label="Solana"
            address={solanaAddress}
            icon="/chains/solana.svg"
            copied={copiedAddress === 'solana'}
            onCopy={() => handleCopy(solanaAddress, 'solana')}
          />
        )}
      </div>

      {/* Info */}
      <div className="p-3 rounded-lg bg-muted/50 border border-border/30">
        <p className="text-xs text-muted-foreground">
          These are agent-managed wallets. Transfer crypto from your external wallet or exchange to start trading with Lina.
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <Button onClick={handleComplete} className="w-full gap-2">
          I've Deposited <ArrowRight className="w-4 h-4" />
        </Button>
        <Button onClick={handleSkip} variant="ghost" className="w-full text-muted-foreground">
          Skip for Now
        </Button>
      </div>
    </div>
  );
}

/**
 * Check if onboarding should be shown based on dismissal cooldown
 */
export function shouldShowOnboarding(): boolean {
  const dismissed = localStorage.getItem(ONBOARDING_DISMISSED_KEY);
  if (!dismissed) return true;

  const dismissedAt = new Date(dismissed);
  const hoursSince = (Date.now() - dismissedAt.getTime()) / (1000 * 60 * 60);
  return hoursSince >= 24;
}

export { ONBOARDING_MODAL_ID };
