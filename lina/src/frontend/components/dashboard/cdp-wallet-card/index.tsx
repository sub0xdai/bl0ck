import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Bullet } from '../../ui/bullet';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../ui/tooltip';
import { AssetIcon, NFTImage, formatAddress } from '../../ui/asset-icon';
import { EmptyState } from '../../ui/empty-state';
import { Copy, Check } from 'lucide-react';
import { SendModalContent } from './SendModal';
import { SwapModalContent } from './SwapModal';
import { TokenDetailModalContent } from './TokenDetailModal';
import { NFTDetailModalContent } from './NFTDetailModal';
import { FundModalContent } from './FundModal';
import { DriftTab } from './DriftTab';
import { AutotradeTab } from './AutotradeTab';
import { formatTokenBalance, formatUsdValue } from '../../../lib/number-format';
import { cn } from '../../../lib/utils';
import { SUPPORTED_CHAINS, getChainWalletIcon, isSolanaChain } from '../../../constants/chains';
import { useModal } from '../../../contexts/ModalContext';
import { useAgentWallet, type Token, type Transaction } from '../../../contexts/AgentWalletContext';

interface CDPWalletCardProps {
  userId: string;
  onBalanceChange?: (balance: number) => void;
  onActionClick?: () => void;
}

export function CDPWalletCard({ userId, onBalanceChange, onActionClick }: CDPWalletCardProps) {
  const { showModal } = useModal();
  const {
    // State
    evmAddress,
    solanaAddress,
    isLoadingAddresses,
    addressError,
    walletView,
    tokens,
    totalUsdValue,
    isLoadingTokens,
    tokensError,
    nfts,
    isLoadingNfts,
    nftsError,
    transactions,
    isLoadingHistory,
    historyError,
    isRefreshing,

    // Derived
    currentAddress,
    filteredTokens,

    // Actions
    setWalletView,
    syncTokens,
    syncNfts,
    fetchNfts,
    fetchHistory,
  } = useAgentWallet();

  // Local UI state
  const [isCopied, setIsCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'tokens' | 'collections' | 'history' | 'perps' | 'autotrade'>('tokens');

  // Notify parent of balance changes
  useEffect(() => {
    if (onBalanceChange) {
      onBalanceChange(totalUsdValue);
    }
  }, [totalUsdValue, onBalanceChange]);

  // Reset to tokens tab when switching away from Solana (perps and autotrade are Solana-only)
  useEffect(() => {
    if (walletView !== 'solana' && (activeTab === 'perps' || activeTab === 'autotrade')) {
      setActiveTab('tokens');
    }
  }, [walletView, activeTab]);

  // Load data based on active tab (lazy loading)
  useEffect(() => {
    if (activeTab === 'collections' && nfts.length === 0 && !isLoadingNfts && !nftsError) {
      fetchNfts();
    } else if (activeTab === 'history' && transactions.length === 0 && !isLoadingHistory && !historyError) {
      fetchHistory();
    }
  }, [activeTab, nfts.length, isLoadingNfts, nftsError, transactions.length, isLoadingHistory, historyError, fetchNfts, fetchHistory]);

  // Manual refresh handler
  const handleManualRefresh = async () => {
    if (!userId) return;

    if (activeTab === 'tokens') {
      await syncTokens();
    } else if (activeTab === 'collections') {
      await syncNfts();
    } else if (activeTab === 'history') {
      await fetchHistory();
    }
  };

  // Format date
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric'
    });
  };

  // Copy address to clipboard
  const copyAddress = async () => {
    if (!currentAddress) return;
    try {
      await navigator.clipboard.writeText(currentAddress);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  // Group transactions by date
  const groupedTransactions = transactions.reduce<Record<string, Transaction[]>>((groups, tx) => {
    const dateKey = formatDate(tx.timestamp);
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(tx);
    return groups;
  }, {});

  // Order dates by most recent first
  const orderedDates = Object.keys(groupedTransactions).sort((a, b) => {
    const aTime = groupedTransactions[a][0]?.timestamp || 0;
    const bTime = groupedTransactions[b][0]?.timestamp || 0;
    return bTime - aTime;
  });

  // Render helpers using XSS-safe AssetIcon component
  const renderTokenIcon = (token: Token) => (
    <AssetIcon iconUrl={token.icon} symbol={token.symbol} alt={token.symbol} />
  );

  const renderTransactionIcon = (tx: Transaction) => (
    <AssetIcon iconUrl={tx.icon} symbol={tx.asset} alt={tx.asset} />
  );

  return (
    <>
      {/* Preload chain icons */}
      <div className="hidden">
        {SUPPORTED_CHAINS.map((chain) => {
          const chainWalletIcon = getChainWalletIcon(chain);
          return chainWalletIcon ? (
            <img key={chain} src={chainWalletIcon} alt="" />
          ) : null;
        })}
      </div>

      <Card className="max-h-[calc(100vh-2rem)] w-full flex flex-col relative">

        <CardHeader className="flex items-center justify-between pl-3 pr-1 relative z-10">
          <CardTitle className="flex items-center gap-2.5 text-sm font-medium uppercase">
            <Bullet />
            <div className="flex items-center gap-2">
              {/* Wallet View Toggle */}
              <div className="flex items-center bg-muted rounded-md p-0.5 relative">
                <button
                  onClick={() => setWalletView('evm')}
                  className={cn(
                    "px-2 py-1 text-[10px] font-medium rounded transition-all duration-200",
                    walletView === 'evm'
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-primary/30 shadow-primary/20'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  EVM
                </button>
                <button
                  onClick={() => setWalletView('solana')}
                  className={cn(
                    "px-2 py-1 text-[10px] font-medium rounded transition-all duration-200",
                    walletView === 'solana'
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-green-500/30 shadow-green-500/20'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  SOL
                </button>
              </div>
              {/* Wallet Address Display */}
              {isLoadingAddresses ? (
                <span className="text-[10px] text-muted-foreground animate-pulse">Loading...</span>
              ) : currentAddress ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={copyAddress}
                      className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted transition-colors group"
                    >
                      <span className="text-[10px] text-muted-foreground group-hover:text-foreground font-mono transition-colors">
                        {formatAddress(currentAddress)}
                      </span>
                      {isCopied ? (
                        <Check className="w-3 h-3 text-green-500" />
                      ) : (
                        <Copy className="w-3 h-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={4}>
                    <p className="text-xs">Copy Address</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <span className="text-[10px] text-red-400" title={addressError || 'No address available'}>
                  No address
                </span>
              )}
            </div>
          </CardTitle>
          <Button
            onClick={handleManualRefresh}
            disabled={isRefreshing || !userId || isLoadingTokens}
            variant="ghost"
            size="sm"
            className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {isLoadingHistory || isLoadingNfts || isLoadingTokens ? 'Loading...' : isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </CardHeader>
        <CardContent className="bg-accent p-2 flex-1 flex-col overflow-auto relative w-full">
          <div className="space-y-4 bg-background rounded-lg p-3 sm:p-4 border border-border/30 w-full overflow-hidden">
            {/* Error message */}
            {tokensError && (
              <div className="text-xs text-red-500 bg-red-500/10 p-2 rounded border border-red-500/20">
                {tokensError}
              </div>
            )}

            {/* Total Balance - Centered */}
            <div className="flex flex-col items-center gap-3 py-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider cursor-help">
                    Agent Wallet Balance
                  </span>
                </TooltipTrigger>
                <TooltipContent sideOffset={4}>
                  Lina manages this wallet for your trades. Deposit funds here to get started.
                </TooltipContent>
              </Tooltip>
              {isLoadingTokens && tokens.length === 0 ? (
                <div className="h-10 w-32 bg-muted animate-pulse rounded"></div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-mono font-bold">
                    ${formatUsdValue(totalUsdValue)}
                  </span>
                </div>
              )}
            </div>


            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-2">
              <Button
                onClick={() => {
                  onActionClick?.();
                  showModal(
                    <FundModalContent
                      walletAddress={currentAddress || ''}
                      shortAddress={currentAddress ? formatAddress(currentAddress) : ''}
                    />,
                    'fund-modal',
                    { closeOnBackdropClick: true, className: 'max-w-md' }
                  );
                }}
                className="flex-1"
                variant="default"
                size="sm"
                disabled={!currentAddress || isLoadingAddresses}
              >
                Fund
              </Button>
              <Button
                onClick={() => {
                  onActionClick?.();

                  showModal(
                    <SendModalContent
                      tokens={filteredTokens as any}
                      userId={userId}
                      onSuccess={() => {
                        syncTokens();
                      }}
                    />,
                    'send-modal',
                    { closeOnBackdropClick: true, className: 'max-w-xl' }
                  );
                }}
                className="flex-1"
                variant="outline"
                size="sm"
                disabled={filteredTokens.length === 0 || isLoadingTokens}
              >
                Send
              </Button>
              <Button
                onClick={() => {
                  onActionClick?.();

                  showModal(
                    <SwapModalContent
                      tokens={filteredTokens}
                      userId={userId}
                      onSuccess={() => {
                        syncTokens();
                      }}
                    />,
                    'swap-modal',
                    { closeOnBackdropClick: true, className: 'max-w-lg' }
                  );
                }}
                className="flex-1"
                variant="outline"
                size="sm"
                disabled={filteredTokens.length === 0 || isLoadingTokens}
              >
                Swap
              </Button>
            </div>
          </div>

          <div className="mt-2 space-y-4 bg-background rounded-lg p-3 sm:p-4 border border-border/30 w-full overflow-hidden">
            {/* Tabs */}
            <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setActiveTab('tokens')}
                className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'tokens'
                    ? 'text-foreground border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                Tokens
              </button>
              <button
                onClick={() => setActiveTab('collections')}
                className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'collections'
                    ? 'text-foreground border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                Collections
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'history'
                    ? 'text-foreground border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                History
              </button>
              {/* Perps tab - only visible for Solana wallet */}
              {walletView === 'solana' && (
                <button
                  onClick={() => setActiveTab('perps')}
                  className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'perps'
                      ? 'text-foreground border-b-2 border-green-500'
                      : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  Perps
                </button>
              )}
              {/* Autotrade tab - only visible for Solana wallet */}
              {walletView === 'solana' && (
                <button
                  onClick={() => setActiveTab('autotrade')}
                  className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'autotrade'
                      ? 'text-foreground border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  Autotrade
                </button>
              )}
            </div>

            {/* Content */}
            <div className="space-y-2 h-[250px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
              {activeTab === 'tokens' ? (
                isLoadingTokens && filteredTokens.length === 0 ? (
                  // Loading skeletons
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-8 h-8 rounded-full bg-muted animate-pulse"></div>
                        <div className="flex flex-col gap-1">
                          <div className="h-4 w-16 bg-muted animate-pulse rounded"></div>
                          <div className="h-3 w-24 bg-muted animate-pulse rounded"></div>
                        </div>
                      </div>
                      <div className="h-4 w-16 bg-muted animate-pulse rounded"></div>
                    </div>
                  ))
                ) : filteredTokens.length === 0 ? (
                  <EmptyState
                    type="tokens"
                    chain={walletView === 'solana' ? 'solana' : 'evm'}
                  />
                ) : (
                  // Token list
                  filteredTokens.map((token, index) => (
                    <button
                      key={`${token.chain}-${token.contractAddress || token.symbol}-${index}`}
                      onClick={() => {
                        onActionClick?.();
                        showModal(
                          <TokenDetailModalContent token={token as any} />,
                          'token-detail-modal',
                          { closeOnBackdropClick: true, className: 'max-w-2xl' }
                        );
                      }}
                      className="w-full flex items-center justify-between p-2 rounded hover:bg-muted/50 transition-colors min-w-0 cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                          {renderTokenIcon(token)}
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <span className="text-xs sm:text-sm font-medium truncate">{token.symbol}</span>
                            <span className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase font-mono whitespace-nowrap">
                              {token.chain}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground truncate">
                            {formatTokenBalance(token.balanceFormatted)}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs sm:text-sm font-mono shrink-0 ml-2">
                        ${formatUsdValue(token.usdValue)}
                      </span>
                    </button>
                  ))
                )
              ) : activeTab === 'collections' ? (
                // NFT List
                isLoadingNfts ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : nfts.length === 0 ? (
                  <EmptyState type="nfts" />
                ) : (
                  // NFT list
                  nfts.map((nft, index) => (
                    <button
                      key={`${nft.chain}-${nft.contractAddress}-${nft.tokenId}-${index}`}
                      onClick={() => {
                        onActionClick?.();
                        showModal(
                          <NFTDetailModalContent
                            nft={nft}
                            userId={userId}
                            onSuccess={() => {
                              fetchNfts();
                            }}
                          />,
                          'nft-detail-modal',
                          {
                            closeOnBackdropClick: true,
                            className: 'max-w-2xl mx-4 shadow-xl',
                            showCloseButton: false
                          }
                        );
                      }}
                      className="w-full flex items-center gap-2 sm:gap-3 p-2 rounded hover:bg-muted/50 transition-colors min-w-0 cursor-pointer text-left"
                    >
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0 border border-border/30">
                        <NFTImage imageUrl={nft.image} alt={nft.name} />
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <span className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">{nft.name}</span>
                          <span className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase font-mono whitespace-nowrap shrink-0">
                            {nft.chain}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground truncate">
                          {nft.contractName}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground/70 font-mono">
                            #{nft.tokenId}
                          </span>
                          {nft.balance && nft.tokenType === 'ERC1155' && (
                            <>
                              <span className="text-[10px] text-muted-foreground/70">•</span>
                              <span className="text-[10px] text-muted-foreground/70">
                                x{nft.balance}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )
              ) : activeTab === 'history' ? (
                // Transaction History
                isLoadingHistory ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : transactions.length === 0 ? (
                  <EmptyState type="transactions" />
                ) : (
                  <div className="space-y-3">
                    {orderedDates.map((date) => {
                      const txs = groupedTransactions[date];
                      return (
                        <div key={date}>
                          <div className="sticky top-0 bg-background/95  text-[10px] font-mono text-muted-foreground mb-1.5 uppercase tracking-wider border-b border-border/50 pb-1">
                            {date}
                          </div>
                          <div className="space-y-1">
                            {txs.map((tx, index) => {
                              const isReceived = tx.direction === 'received';
                              const amount = parseFloat(tx.value || '0');

                              let amountStr = amount.toFixed(4);
                              if (amountStr.length > 10) {
                                amountStr = amount.toFixed(2);
                              }

                              return (
                                <a
                                  key={`${tx.hash}-${index}`}
                                  href={tx.explorerUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-full flex items-center justify-between p-2 rounded hover:bg-muted/50 transition-colors text-left cursor-pointer"
                                >
                                  <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                                      {renderTransactionIcon(tx)}
                                    </div>
                                    <div className="flex flex-col min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5 sm:gap-2">
                                        <span className="text-xs sm:text-sm font-medium truncate">
                                          {isReceived ? 'Received' : 'Sent'}
                                        </span>
                                        <span className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase font-mono whitespace-nowrap shrink-0">
                                          {tx.chain}
                                        </span>
                                      </div>
                                      <span className="text-xs text-muted-foreground truncate">
                                        {isReceived
                                          ? `From: ${tx.from?.slice(0, 6)}...${tx.from?.slice(-4)}`
                                          : `To: ${tx.to?.slice(0, 6)}...${tx.to?.slice(-4)}`
                                        }
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end shrink-0 ml-2" style={{ maxWidth: '35%', minWidth: 0 }}>
                                    <span className={`text-xs sm:text-sm font-mono font-medium overflow-hidden text-ellipsis whitespace-nowrap w-full text-right ${isReceived ? 'text-green-500' : 'text-red-500'
                                      }`} title={`${isReceived ? '+' : '-'}${amount.toFixed(8)} ${tx.asset}`}>
                                      {isReceived ? '+' : '-'}{amountStr}
                                    </span>
                                    <span className="text-[10px] sm:text-xs text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap w-full text-right" title={tx.asset}>
                                      {tx.asset}
                                    </span>
                                  </div>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : activeTab === 'perps' ? (
                // Drift Perpetuals
                <DriftTab userId={userId} isActive={activeTab === 'perps'} />
              ) : activeTab === 'autotrade' ? (
                // Autotrade Subscription
                <AutotradeTab userId={userId} isActive={activeTab === 'autotrade'} />
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// Add display name for debugging
CDPWalletCard.displayName = 'CDPWalletCard';

// Legacy export for backward compatibility (ref is no longer used)
export type CDPWalletCardRef = {
  refreshTokens: () => Promise<void>;
  refreshNFTs: () => Promise<void>;
  refreshAll: () => Promise<void>;
};
