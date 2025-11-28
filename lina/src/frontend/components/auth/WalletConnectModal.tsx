import { useEffect } from 'react';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bullet } from '../ui/bullet';

interface WalletConnectModalProps {
  isOpen: boolean;
}

/**
 * WalletConnectModal - Web3 wallet authentication modal
 *
 * Replaces the CDP-based SignInModal with a wallet-first auth flow:
 * 1. User clicks "Connect Wallet" -> AppKit modal opens
 * 2. User selects wallet (MetaMask, WalletConnect, Coinbase Wallet, etc.)
 * 3. After connecting, user clicks "Sign In" -> SIWE signature request
 * 4. Backend verifies signature and returns JWT
 */
export function WalletConnectModal({ isOpen }: WalletConnectModalProps) {
  const {
    isConnected,
    walletAddress,
    chain,
    isAuthenticated,
    isAuthenticating,
    error,
    connect,
    signIn,
  } = useWalletAuth();

  // Auto sign-in when wallet connects (if not already authenticated)
  useEffect(() => {
    if (isConnected && !isAuthenticated && !isAuthenticating) {
      // Small delay to ensure wallet connection is fully established
      const timer = setTimeout(() => {
        signIn();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isConnected, isAuthenticated, isAuthenticating, signIn]);

  // Don't render if not open or already authenticated
  if (!isOpen || isAuthenticated) return null;

  // Format wallet address for display
  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <Card className="w-full max-w-md mx-4 bg-background">
        <CardHeader className="flex items-center justify-between pl-3 pr-1">
          <CardTitle className="flex items-center gap-2.5 text-sm font-medium uppercase">
            <Bullet />
            Connect Wallet
          </CardTitle>
        </CardHeader>
        <CardContent className="bg-pop space-y-4">
          {/* Error message */}
          {error && (
            <div className="text-xs text-red-500 bg-red-500/10 p-3 rounded border border-red-500/20">
              {error}
            </div>
          )}

          {/* Connected state - waiting for signature */}
          {isConnected && !isAuthenticated && (
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-xs text-green-500 uppercase tracking-wider">Connected</span>
                </div>
                <p className="text-sm font-mono text-muted-foreground">
                  {formatAddress(walletAddress || '')}
                </p>
                {chain && (
                  <p className="text-xs text-muted-foreground uppercase">
                    {chain === 'evm' ? 'Ethereum' : 'Solana'}
                  </p>
                )}
              </div>

              <Button
                onClick={signIn}
                className="w-full font-medium"
                disabled={isAuthenticating}
              >
                {isAuthenticating ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  'Sign Message to Continue'
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Sign a message to verify wallet ownership.
                <br />
                This does not cost any gas.
              </p>
            </div>
          )}

          {/* Not connected - show connect button */}
          {!isConnected && (
            <div className="space-y-4">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    />
                  </svg>
                </div>
                <h2 className="text-lg font-medium">Welcome to Lina</h2>
                <p className="text-sm text-muted-foreground">
                  Connect your wallet to access your AI DeFi agent.
                </p>
              </div>

              <Button onClick={connect} className="w-full font-medium" size="lg">
                Connect Wallet
              </Button>

              <div className="flex items-center justify-center gap-4 pt-2">
                <WalletIcon name="MetaMask" />
                <WalletIcon name="Coinbase" />
                <WalletIcon name="WalletConnect" />
              </div>
            </div>
          )}

          {/* Footer info */}
          <div className="pt-4 border-t border-border">
            <p className="text-xs text-center text-muted-foreground">
              Your keys, your crypto. Lina never has access to your funds.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Small wallet icon component
function WalletIcon({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center">
        <span className="text-xs font-bold text-muted-foreground">
          {name.charAt(0)}
        </span>
      </div>
      <span className="text-[10px] text-muted-foreground">{name}</span>
    </div>
  );
}

export default WalletConnectModal;
