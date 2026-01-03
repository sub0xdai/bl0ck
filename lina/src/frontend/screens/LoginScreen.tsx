import type { WalletAuthState } from '../hooks/useWalletAuth';
import { Button } from '../components/ui/button';
import { useTranslation } from 'react-i18next';

interface LoginScreenProps {
  /** Optional message to display (e.g., "Session expired") */
  message?: string;
  /** Auth state passed from parent (AuthGate) */
  auth: WalletAuthState;
}

/**
 * LoginScreen - Full-page wallet authentication
 *
 * This is NOT a modal overlay - it's a complete gate.
 * The main app is never rendered until auth succeeds.
 *
 * Flow:
 * 1. User clicks "Connect Wallet" -> AppKit modal with wallet choices
 * 2. User selects wallet (MetaMask, Phantom, etc.)
 * 3. User clicks "Sign In" -> SIWE signature request
 * 4. User signs -> authenticated
 */
export function LoginScreen({ message, auth }: LoginScreenProps) {
  const { t } = useTranslation('login');

  const {
    isConnected,
    walletAddress,
    chain,
    isAuthenticating,
    error,
    connect,
    signIn,
    disconnect,
  } = auth;

  // No auto-sign-in - user must explicitly click to sign

  // Format wallet address for display
  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <h1 className="text-5xl font-display tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>

        {/* Card Container */}
        <div className="bg-card border border-border rounded-lg p-6 space-y-6">
          {/* Session expired / error messages */}
          {message && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 p-3 rounded text-sm text-yellow-500 text-center">
              {message}
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 p-3 rounded text-sm text-red-500 text-center">
              {error}
            </div>
          )}

          {/* Connected State - Waiting for signature */}
          {isConnected && (
            <div className="space-y-4">
              <div className="text-center space-y-3">
                {/* Connected indicator */}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-xs text-green-500 uppercase tracking-wider">
                    {t('connected')}
                  </span>
                </div>

                {/* Wallet address */}
                <p className="text-sm font-mono text-muted-foreground">
                  {formatAddress(walletAddress || '')}
                </p>

                {/* Chain */}
                {chain && (
                  <p className="text-xs text-muted-foreground uppercase">
                    {chain === 'evm' ? t('chains.ethereum') : t('chains.solana')}
                  </p>
                )}
              </div>

              {/* Sign in button */}
              <Button
                onClick={signIn}
                className="w-full"
                size="lg"
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
                    {t('signIn.signing')}
                  </span>
                ) : (
                  t('signIn.button')
                )}
              </Button>

              {/* Change wallet button */}
              <Button
                onClick={disconnect}
                variant="outline"
                className="w-full"
                size="sm"
                disabled={isAuthenticating}
              >
                {t('signIn.changeWallet')}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                {t('signIn.noGas')}
                <br />
                {t('signIn.noGasExtra')}
              </p>
            </div>
          )}

          {/* Not Connected - Show connect button */}
          {!isConnected && (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                {/* Wallet icon */}
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

                <h2 className="text-lg font-medium">{t('connectWallet.title')}</h2>
                <p className="text-sm text-muted-foreground">
                  {t('connectWallet.description')}
                </p>
              </div>

              {/* Connect button */}
              <Button onClick={connect} className="w-full" size="lg">
                {t('connectWallet.button')}
              </Button>

              {/* Supported wallets */}
              <div className="flex items-center justify-center gap-6 pt-2">
                <WalletIcon name="MetaMask" letter="M" />
                <WalletIcon name="Coinbase" letter="C" />
                <WalletIcon name="WalletConnect" letter="W" />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-xs text-center text-muted-foreground">
          {t('footer')}
        </p>
      </div>
    </div>
  );
}

/** Small wallet icon component */
function WalletIcon({ name, letter }: { name: string; letter: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
        <span className="text-sm font-bold text-muted-foreground">{letter}</span>
      </div>
      <span className="text-[10px] text-muted-foreground">{name}</span>
    </div>
  );
}

export default LoginScreen;
