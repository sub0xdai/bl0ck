import { useEffect, useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { elizaClient } from '../lib/elizaClient';
import { socketManager } from '../lib/socketManager';
import { ChatInterface } from '../components/chat/chat-interface';
import { SidebarProvider, useSidebar } from '../components/ui/sidebar';
import { DashboardSidebar } from '../components/dashboard/sidebar';
import Widget from '../components/dashboard/widget';
import { CDPWalletCard } from '../components/dashboard/cdp-wallet-card';
import CollapsibleNotifications from '../components/dashboard/notifications/collapsible-notifications';
import AccountPage from '../components/dashboard/account/page';
import { MobileHeader } from '../components/dashboard/mobile-header';
import { LoadingPanelProvider, useLoadingPanel } from '../contexts/LoadingPanelContext';
import { ModalProvider, useModal } from '../contexts/ModalContext';
import { AgentWalletProvider, useAgentWallet } from '../contexts/AgentWalletContext';
import { Info } from 'lucide-react';
import { UUID } from '@elizaos/core';
import { AboutModalContent } from '../components/about/about-modal-content';
import {
  DepositOnboardingContent,
  shouldShowOnboarding,
  ONBOARDING_MODAL_ID,
} from '../components/onboarding/DepositOnboarding';

interface MainAppProps {
  /** Authenticated user ID (wallet-derived) */
  userId: string;
  /** Connected wallet address */
  walletAddress: string | null;
  /** Sign out callback */
  onSignOut: () => Promise<void>;
}

interface Channel {
  id: string;
  name: string;
  createdAt?: number;
}

const ABOUT_MODAL_ID = 'about-lina-modal';

/**
 * MainApp - The authenticated application shell
 *
 * Only rendered after successful wallet authentication.
 * Contains the full chat interface, sidebar, and dashboard.
 */
function MainAppInner({ userId, walletAddress, onSignOut }: MainAppProps) {
  const { showLoading, hide } = useLoadingPanel();
  const [connected, setConnected] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(true);
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'chat' | 'account'>('chat');
  const [totalBalance, setTotalBalance] = useState(0);
  const [isLoadingUserProfile, setIsLoadingUserProfile] = useState(true);
  const [isNewChatMode, setIsNewChatMode] = useState(false);

  // Onboarding state
  const [isNewUser, setIsNewUser] = useState(false);
  const [agentEvmAddress, setAgentEvmAddress] = useState<string | null>(null);
  const [agentSolanaAddress, setAgentSolanaAddress] = useState<string | null>(null);

  // Stabilize balance change callback to prevent wallet re-renders
  const handleBalanceChange = useCallback((balance: number) => {
    setTotalBalance(balance);
  }, []);

  // Determine loading state and message
  const getLoadingMessage = (): string[] | null => {
    if (isLoadingUserProfile) {
      return ['Loading Profile...', 'Syncing user profile...'];
    }
    return null;
  };

  const loadingMessage = getLoadingMessage();
  const [userProfile, setUserProfile] = useState<{
    avatarUrl: string;
    displayName: string;
    bio: string;
    email: string;
    walletAddress: string;
    memberSince: string;
  } | null>(null);
  const hasInitialized = useRef(false);

  // Control global loading panel based on app state
  useEffect(() => {
    const loadingPanelId = 'app-loading';

    if (loadingMessage && loadingMessage.length > 0) {
      showLoading('Initializing...', loadingMessage, loadingPanelId);
    } else if (currentView === 'chat' && (!connected || isLoadingChannels || (!activeChannelId && !isNewChatMode))) {
      const message = !connected ? 'Connecting to server...' :
                     isLoadingChannels ? 'Loading channels...' :
                     'Select a chat';
      showLoading('Loading Chat...', message, loadingPanelId);
    } else {
      hide(loadingPanelId);
    }
  }, [loadingMessage, currentView, connected, isLoadingChannels, activeChannelId, isNewChatMode, showLoading, hide]);

  // Fetch the agent list first to get the ID
  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const result = await elizaClient.agents.listAgents();
      return result.agents;
    },
    staleTime: 5 * 60 * 1000,
  });

  const agentId = agentsData?.[0]?.id;

  // Sync user entity whenever userId or agent changes
  useEffect(() => {
    if (!userId || !agentId) {
      setIsLoadingUserProfile(true);
      return;
    }

    const syncUserEntity = async () => {
      try {
        setIsLoadingUserProfile(true);
        setIsNewUser(false); // Reset on each sync
        console.log('[MainApp] Syncing user entity for userId:', userId);

        // Try to get agent wallets (EVM + Solana)
        let evmWalletAddress: string | undefined;
        let solanaWalletAddress: string | undefined;

        // EVM wallet via CDP
        try {
          const wallet = await elizaClient.cdp.getOrCreateWallet(userId);
          evmWalletAddress = wallet.address;
          setAgentEvmAddress(wallet.address);
        } catch (cdpError) {
          console.warn('[MainApp] CDP wallet not available (optional):', cdpError);
        }

        // Solana wallet
        try {
          const solanaWallet = await elizaClient.solana.getWallet(userId);
          solanaWalletAddress = solanaWallet.publicKey;
          setAgentSolanaAddress(solanaWallet.publicKey);
        } catch (solanaError) {
          console.warn('[MainApp] Solana wallet not available (optional):', solanaError);
        }

        const agentWalletAddress = evmWalletAddress;

        // Use the connected wallet address for display
        const displayAddress = walletAddress || agentWalletAddress || '';
        const shortAddress = displayAddress ? `${displayAddress.slice(0, 6)}...${displayAddress.slice(-4)}` : 'User';
        const finalUsername = shortAddress;

        // Try to get existing entity
        let entity;
        try {
          entity = await elizaClient.entities.getEntity(userId as UUID);
          console.log('[MainApp] Found existing user entity in database');
        } catch (error: any) {
          // Entity doesn't exist, create it
          if (error?.status === 404 || error?.code === 'NOT_FOUND') {
            console.log('[MainApp] Creating new user entity in database...');
            setIsNewUser(true); // Mark as new user for onboarding

            entity = await elizaClient.entities.createEntity({
              id: userId as UUID,
              agentId: agentId as UUID,
              names: [finalUsername],
              metadata: {
                avatarUrl: '/avatars/user_krimson.png',
                walletAddress: displayAddress,
                ...(agentWalletAddress && { agentWalletAddress }),
                displayName: finalUsername,
                bio: 'DeFi Enthusiast',
                createdAt: new Date().toISOString(),
              },
            });

            setUserProfile({
              avatarUrl: entity.metadata?.avatarUrl || '/avatars/user_krimson.png',
              displayName: entity.metadata?.displayName || finalUsername,
              bio: entity.metadata?.bio || 'DeFi Enthusiast',
              email: '',
              walletAddress: displayAddress || '',
              memberSince: entity.metadata?.createdAt || new Date().toISOString(),
            });
            setIsLoadingUserProfile(false);
            return;
          }
          throw error;
        }

        // Entity exists, check if metadata needs updating
        const needsUpdate =
          !entity.metadata?.avatarUrl ||
          !entity.metadata?.walletAddress ||
          !entity.metadata?.bio ||
          (displayAddress && entity.metadata?.walletAddress !== displayAddress);

        if (needsUpdate) {
          console.log('[MainApp] Updating user entity metadata...');
          const updated = await elizaClient.entities.updateEntity(userId as UUID, {
            metadata: {
              ...entity.metadata,
              avatarUrl: entity.metadata?.avatarUrl || '/avatars/user_krimson.png',
              walletAddress: displayAddress || entity.metadata?.walletAddress || '',
              ...(agentWalletAddress && { agentWalletAddress }),
              displayName: entity.metadata?.displayName || finalUsername || 'User',
              bio: entity.metadata?.bio || 'DeFi Enthusiast',
              updatedAt: new Date().toISOString(),
            },
          });
          console.log('[MainApp] Updated user entity:', updated);
          entity = updated;
        } else {
          console.log('[MainApp] User entity is up to date');
        }

        setUserProfile({
          avatarUrl: entity.metadata?.avatarUrl || '/avatars/user_krimson.png',
          displayName: entity.metadata?.displayName || finalUsername || 'User',
          bio: entity.metadata?.bio || 'DeFi Enthusiast',
          email: '',
          walletAddress: displayAddress || '',
          memberSince: entity.metadata?.createdAt || new Date().toISOString(),
        });
        setIsLoadingUserProfile(false);
      } catch (error) {
        console.error('[MainApp] Error syncing user entity:', error);
        // Don't block app on entity sync failure - set default profile
        setUserProfile({
          avatarUrl: '/avatars/user_krimson.png',
          displayName: walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'User',
          bio: 'DeFi Enthusiast',
          email: '',
          walletAddress: walletAddress || '',
          memberSince: new Date().toISOString(),
        });
        setIsLoadingUserProfile(false);
      }
    };

    syncUserEntity();
  }, [userId, walletAddress, agentId]);

  // Check if onboarding should be shown (after profile loads)
  const checkOnboarding = useCallback(() => {
    // Only check if we have wallet addresses and not loading
    if (isLoadingUserProfile) return false;
    if (!agentEvmAddress && !agentSolanaAddress) return false;
    if (!shouldShowOnboarding()) return false;

    // Show if new user
    if (isNewUser) return true;

    // Show if zero balance
    return totalBalance === 0;
  }, [isLoadingUserProfile, agentEvmAddress, agentSolanaAddress, isNewUser, totalBalance]);

  // Fetch full agent details (including settings with avatar)
  const { data: agent, isLoading } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: async () => {
      if (!agentId) return null;
      return await elizaClient.agents.getAgent(agentId);
    },
    enabled: !!agentId,
    staleTime: 5 * 60 * 1000,
  });

  // Connect to socket
  useEffect(() => {
    console.log('[MainApp] Connecting socket with userId:', userId);
    const socket = socketManager.connect(userId);

    socket.on('connect', () => {
      setConnected(true);
      console.log('[MainApp] Socket connected to server');
    });

    socket.on('disconnect', () => {
      setConnected(false);
      console.log('[MainApp] Socket disconnected from server');
    });

    return () => {
      console.log('[MainApp] Cleaning up socket connection');
      setConnected(false);
      socketManager.disconnect();
    };
  }, [userId]);

  // Join active channel when it changes
  useEffect(() => {
    console.log('[MainApp] Channel join useEffect triggered:', {
      activeChannelId,
      userId,
      connected,
      isNewChatMode,
      willJoin: !!(activeChannelId && connected && !isNewChatMode)
    });

    if (!activeChannelId || !connected || isNewChatMode) {
      console.log('[MainApp] Skipping channel join - waiting for:', {
        needsChannelId: !activeChannelId,
        needsConnection: !connected,
        isNewChat: isNewChatMode
      });
      return;
    }

    console.log('[MainApp] Joining channel:', activeChannelId, 'with userId as serverId:', userId);
    socketManager.joinChannel(activeChannelId, userId, { isDm: true });

    return () => {
      console.log('[MainApp] Leaving channel:', activeChannelId);
      socketManager.leaveChannel(activeChannelId);
    };
  }, [activeChannelId, userId, connected, isNewChatMode]);

  // Load channels when user ID or agent changes
  useEffect(() => {
    console.log('[MainApp] User ID changed, refreshing chat content...');
    setChannels([]);
    setActiveChannelId(null);
    setIsLoadingChannels(true);
    hasInitialized.current = false;

    async function ensureUserServerAndLoadChannels() {
      if (!agent?.id || !userId) {
        setIsLoadingChannels(false);
        return;
      }

      try {
        // Create message server FIRST
        console.log('[MainApp] Creating message server for user:', userId);
        try {
          const serverResult = await elizaClient.messaging.createServer({
            id: userId as UUID,
            name: `${userId.substring(0, 8)}'s Server`,
            sourceType: 'custom_ui',
            sourceId: userId,
            metadata: {
              createdBy: 'custom_ui',
              userId: userId,
              userType: 'chat_user',
            },
          });
          console.log('[MainApp] Message server created/ensured:', serverResult.id);

          // Associate agent with the user's server
          console.log('[MainApp] Associating agent with user server...');
          try {
            await elizaClient.messaging.addAgentToServer(userId as UUID, agent.id as UUID);
            console.log('[MainApp] Agent associated with user server:', userId);
          } catch (assocError: any) {
            console.warn('[MainApp] Failed to associate agent with server (may already be associated):', assocError.message);
          }
        } catch (serverError: any) {
          console.log('[MainApp] Server creation failed (may already exist):', serverError.message);
        }

        // Load channels from the user-specific server
        const serverIdForQuery = userId;
        console.log('[MainApp] Loading channels from user-specific server:', serverIdForQuery);
        const response = await elizaClient.messaging.getServerChannels(serverIdForQuery as UUID);
        const dmChannels = await Promise.all(
          response.channels
            .map(async (ch: any) => {
              let createdAt = 0;
              if (ch.createdAt instanceof Date) {
                createdAt = ch.createdAt.getTime();
              } else if (typeof ch.createdAt === 'number') {
                createdAt = ch.createdAt;
              } else if (typeof ch.createdAt === 'string') {
                createdAt = Date.parse(ch.createdAt);
              } else if (ch.metadata?.createdAt) {
                if (typeof ch.metadata.createdAt === 'string') {
                  createdAt = Date.parse(ch.metadata.createdAt);
                } else if (typeof ch.metadata.createdAt === 'number') {
                  createdAt = ch.metadata.createdAt;
                }
              }
              return {
                id: ch.id,
                name: ch.name || `Chat ${ch.id.substring(0, 8)}`,
                createdAt: createdAt || Date.now(),
              };
            })
        );

        const sortedChannels = dmChannels.sort((a: Channel, b: Channel) => (b.createdAt || 0) - (a.createdAt || 0));
        setChannels(sortedChannels);

        console.log(`[MainApp] Loaded ${sortedChannels.length} DM channels (sorted by creation time)`);

        if (sortedChannels.length === 0 && !hasInitialized.current) {
          console.log('[MainApp] No channels found, entering new chat mode...');
          hasInitialized.current = true;
          setIsNewChatMode(true);
          setActiveChannelId(null);
        } else if (sortedChannels.length > 0) {
          setActiveChannelId(sortedChannels[0].id);
          setIsNewChatMode(false);
          hasInitialized.current = true;
          console.log(`[MainApp] Auto-selected latest channel: ${sortedChannels[0].name}`);
        }
      } catch (error: any) {
        console.warn('[MainApp] Could not load channels:', error.message);
      } finally {
        setIsLoadingChannels(false);
      }
    }

    ensureUserServerAndLoadChannels();
  }, [agent?.id, userId]);

  const handleNewChat = async () => {
    if (!agent?.id || !userId) return;
    console.log('[MainApp] Entering new chat mode (no channel created yet)');
    setIsNewChatMode(true);
    setActiveChannelId(null);
  };

  const handleChannelSelect = async (newChannelId: string) => {
    if (newChannelId === activeChannelId) return;

    if (activeChannelId) {
      socketManager.leaveChannel(activeChannelId);
    }

    setActiveChannelId(newChannelId);
    setIsNewChatMode(false);
  };

  // Delete a channel
  const handleDeleteChannel = async (channelId: string) => {
    try {
      console.log('[MainApp] Deleting channel:', channelId);

      // Call API to delete channel
      await elizaClient.messaging.deleteChannel(channelId as UUID);

      // Remove from local state
      setChannels((prev: Channel[]) => prev.filter((c) => c.id !== channelId));

      // If deleted channel was active, clear selection
      if (activeChannelId === channelId) {
        socketManager.leaveChannel(channelId);
        setActiveChannelId(null);
        setIsNewChatMode(true);
      }

      console.log('[MainApp] Channel deleted successfully:', channelId);
    } catch (error) {
      console.error('[MainApp] Failed to delete channel:', error);
      // Re-throw so the sidebar can handle the error state
      throw error;
    }
  };

  // Update user profile (avatar, displayName, bio)
  const updateUserProfile = async (updates: {
    avatarUrl?: string;
    displayName?: string;
    bio?: string;
  }) => {
    if (!userId || !userProfile) {
      throw new Error('User not initialized');
    }

    try {
      console.log('[MainApp] Updating user profile:', updates);

      const updated = await elizaClient.entities.updateEntity(userId as UUID, {
        metadata: {
          avatarUrl: updates.avatarUrl ?? userProfile.avatarUrl,
          displayName: updates.displayName ?? userProfile.displayName,
          bio: updates.bio ?? userProfile.bio,
          email: userProfile.email,
          walletAddress: userProfile.walletAddress,
          memberSince: userProfile.memberSince,
          updatedAt: new Date().toISOString(),
        },
      });

      setUserProfile({
        ...userProfile,
        avatarUrl: updated.metadata?.avatarUrl || userProfile.avatarUrl,
        displayName: updated.metadata?.displayName || userProfile.displayName,
        bio: updated.metadata?.bio || userProfile.bio,
      });

      console.log('[MainApp] User profile updated successfully');
    } catch (error) {
      console.error('[MainApp] Failed to update user profile:', error);
      throw error;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground uppercase tracking-wider text-sm font-mono">
            Loading agent...
          </p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-foreground font-mono uppercase tracking-wider">No agent available</p>
          <p className="text-sm text-muted-foreground mt-2 font-mono">
            Please start the server with an agent configured.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AgentWalletProvider userId={userId}>
      <SidebarProvider>
        <AppContent
          agent={agent}
          userId={userId}
          connected={connected}
          channels={channels}
          activeChannelId={activeChannelId}
          isCreatingChannel={isCreatingChannel}
          isNewChatMode={isNewChatMode}
          currentView={currentView}
          userProfile={userProfile}
          totalBalance={totalBalance}
          isLoadingChannels={isLoadingChannels}
          handleNewChat={handleNewChat}
          handleChannelSelect={handleChannelSelect}
          handleBalanceChange={handleBalanceChange}
          setCurrentView={setCurrentView}
          setChannels={setChannels}
          setActiveChannelId={setActiveChannelId}
          setIsNewChatMode={setIsNewChatMode}
          updateUserProfile={updateUserProfile}
          signOut={onSignOut}
          // Onboarding props
          shouldShowOnboarding={checkOnboarding()}
          isNewUser={isNewUser}
          agentEvmAddress={agentEvmAddress}
          agentSolanaAddress={agentSolanaAddress}
        />
      </SidebarProvider>
    </AgentWalletProvider>
  );
}

// Inner component that has access to useSidebar
function AppContent({
  agent,
  userId,
  connected,
  channels,
  activeChannelId,
  isCreatingChannel,
  isNewChatMode,
  currentView,
  userProfile,
  totalBalance,
  isLoadingChannels,
  handleNewChat,
  handleChannelSelect,
  handleBalanceChange,
  setCurrentView,
  setChannels,
  setActiveChannelId,
  setIsNewChatMode,
  updateUserProfile,
  signOut,
  // Onboarding props
  shouldShowOnboarding,
  isNewUser,
  agentEvmAddress,
  agentSolanaAddress,
}: any) {
  const { setOpenMobile } = useSidebar();
  const { showModal, hideModal } = useModal();
  const { refreshAll } = useAgentWallet();
  const hasShownOnboarding = useRef(false);

  useEffect(() => {
    setOpenMobile(false);
  }, [currentView])

  // Show onboarding modal when conditions are met
  useEffect(() => {
    if (shouldShowOnboarding && !hasShownOnboarding.current && (agentEvmAddress || agentSolanaAddress)) {
      hasShownOnboarding.current = true;
      showModal(
        <DepositOnboardingContent
          evmAddress={agentEvmAddress || ''}
          solanaAddress={agentSolanaAddress || ''}
          isNewUser={isNewUser}
          onComplete={() => {
            console.log('[MainApp] Onboarding completed');
          }}
          onSkip={() => {
            console.log('[MainApp] Onboarding skipped');
          }}
        />,
        ONBOARDING_MODAL_ID,
        {
          closeOnBackdropClick: false,
          closeOnEsc: true,
          showCloseButton: false,
          className: 'max-w-md w-full',
        }
      );
    }
  }, [shouldShowOnboarding, agentEvmAddress, agentSolanaAddress, isNewUser, showModal]);

  const handleOpenAbout = () => {
    showModal(
      <AboutModalContent onClose={() => hideModal(ABOUT_MODAL_ID)} />,
      ABOUT_MODAL_ID,
      {
        closeOnBackdropClick: true,
        closeOnEsc: true,
        showCloseButton: false,
        className: 'max-w-5xl w-full',
      }
    );
  };

  const onNewChat = () => {
    handleNewChat();
    setCurrentView('chat');
    setOpenMobile(false);
  };

  const onChannelSelect = (id: string) => {
    handleChannelSelect(id);
    setCurrentView('chat');
    setOpenMobile(false);
  };

  return (
    <>
      {/* Mobile Header */}
      <MobileHeader
        onHomeClick={() => setCurrentView('chat')}
        userId={userId || undefined}
      />

      {/* Desktop Layout - 3 columns */}
      <div className="w-full min-h-[100dvh] lg:min-h-screen grid grid-cols-1 lg:grid-cols-12 gap-gap lg:px-sides">
        {/* Left Sidebar - Chat History */}
        <div className="hidden lg:block col-span-2 top-0 relative">
          <DashboardSidebar
            channels={channels}
            activeChannelId={activeChannelId}
            onChannelSelect={onChannelSelect}
            onDeleteChannel={handleDeleteChannel}
            onNewChat={onNewChat}
            isCreatingChannel={isCreatingChannel}
            userProfile={userProfile}
            onSignOut={signOut}
            onChatClick={() => setCurrentView('chat')}
            onAccountClick={() => setCurrentView('account')}
            onHomeClick={() => setCurrentView('chat')}
          />
        </div>

        {/* Center - Chat Interface / Account */}
        <div className="col-span-1 lg:col-span-7 lg:h-screen lg:overflow-hidden">
          {currentView === 'account' ? (
            <AccountPage
              totalBalance={totalBalance}
              userProfile={userProfile}
              onUpdateProfile={updateUserProfile}
              onSignOut={signOut}
              onBack={() => setCurrentView('chat')}
            />
          ) : (
            <div className="flex flex-col relative w-full gap-1 lg:min-h-0 lg:h-full">
              {/* Header */}
              <div className="flex items-center lg:items-baseline gap-2.5 md:gap-4 px-4 md:px-6 py-3 md:pb-4 lg:pt-7 ring-2 ring-pop sticky top-header-mobile lg:top-0 bg-background z-10">
               <h1 className="text-xl lg:text-4xl font-display leading-none mb-1">
                  CHAT
                </h1>
                <button
                  className="ml-auto rounded-full px-3 py-2 transition-colors hover:bg-accent flex items-center gap-2"
                  title="About"
                  onClick={handleOpenAbout}
                >
                  <Info className="size-4 md:size-5 text-muted-foreground" />
                  <span className="text-sm md:text-base text-muted-foreground uppercase">ABOUT</span>
                </button>
              </div>

              {/* Content Area */}
              <div className="min-h-0 flex-1 flex flex-col gap-8 md:gap-14 px-3 lg:px-6 pt-10 md:pt-6 ring-2 ring-pop bg-background">
                {connected && !isLoadingChannels && (activeChannelId || isNewChatMode) && (
                  <div className="flex-1 min-h-0">
                    <ChatInterface
                      agent={agent}
                      userId={userId}
                      serverId={userId}
                      channelId={activeChannelId}
                      isNewChatMode={isNewChatMode}
                      onChannelCreated={(channelId, channelName) => {
                        const now = Date.now();
                        setChannels((prev: Channel[]) => [
                          {
                            id: channelId,
                            name: channelName,
                            createdAt: now,
                          },
                          ...prev,
                        ]);
                        setActiveChannelId(channelId);
                        setIsNewChatMode(false);
                      }}
                      onActionCompleted={async () => {
                        console.log('[MainApp] Agent action completed - refreshing wallet...');
                        await refreshAll();
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar - Chain Selector & Widget & CDP Wallet & Notifications */}
        <div className="col-span-3 hidden lg:block">
          <div className="space-y-gap py-sides min-h-screen max-h-screen sticky top-0 overflow-visible">
            <Widget />
            <CDPWalletCard userId={userId} walletAddress={userProfile?.walletAddress} onBalanceChange={handleBalanceChange} />
            <CollapsibleNotifications />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * MainApp - Wrapped with providers
 */
export function MainApp(props: MainAppProps) {
  return (
    <LoadingPanelProvider>
      <ModalProvider>
        <MainAppInner {...props} />
      </ModalProvider>
    </LoadingPanelProvider>
  );
}

export default MainApp;
