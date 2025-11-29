import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ArrowRightLeft, Wallet, TrendingUp, Send, Image, History, HelpCircle } from 'lucide-react';

export interface SlashCommand {
  id: string;
  command: string;
  label: string;
  description: string;
  prompt: string;
  icon: React.ElementType;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'swap',
    command: '/swap',
    label: 'Swap',
    description: 'Swap tokens on any chain',
    prompt: 'Help me swap tokens',
    icon: ArrowRightLeft,
  },
  {
    id: 'bridge',
    command: '/bridge',
    label: 'Bridge',
    description: 'Bridge tokens across chains',
    prompt: 'Help me bridge tokens to another chain',
    icon: ArrowRightLeft,
  },
  {
    id: 'balance',
    command: '/balance',
    label: 'Balance',
    description: 'Check wallet balance',
    prompt: 'What is my current wallet balance?',
    icon: Wallet,
  },
  {
    id: 'price',
    command: '/price',
    label: 'Price',
    description: 'Get token price',
    prompt: 'What is the current price of ',
    icon: TrendingUp,
  },
  {
    id: 'send',
    command: '/send',
    label: 'Send',
    description: 'Send tokens to an address',
    prompt: 'Help me send tokens',
    icon: Send,
  },
  {
    id: 'nfts',
    command: '/nfts',
    label: 'NFTs',
    description: 'View your NFT collection',
    prompt: 'Show me my NFTs',
    icon: Image,
  },
  {
    id: 'history',
    command: '/history',
    label: 'History',
    description: 'View transaction history',
    prompt: 'Show my recent transactions',
    icon: History,
  },
  {
    id: 'help',
    command: '/help',
    label: 'Help',
    description: 'Get help with commands',
    prompt: 'What can you help me with?',
    icon: HelpCircle,
  },
];

interface SlashCommandMenuProps {
  isOpen: boolean;
  filter: string;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
}

export function SlashCommandMenu({
  isOpen,
  filter,
  onSelect,
  onClose,
  selectedIndex,
  onSelectedIndexChange,
}: SlashCommandMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Filter commands based on input
  const filteredCommands = SLASH_COMMANDS.filter((cmd) =>
    cmd.command.toLowerCase().startsWith(filter.toLowerCase()) ||
    cmd.label.toLowerCase().includes(filter.toLowerCase().replace('/', ''))
  );

  // Reset selection when filter changes
  useEffect(() => {
    onSelectedIndexChange(0);
  }, [filter, onSelectedIndexChange]);

  // Scroll selected item into view
  useEffect(() => {
    if (menuRef.current && selectedIndex >= 0) {
      const selectedElement = menuRef.current.children[selectedIndex] as HTMLElement;
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen || filteredCommands.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="absolute bottom-full left-0 right-0 mb-1 mx-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50 max-h-64 overflow-y-auto"
    >
      <div className="p-1">
        <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Commands
        </div>
        {filteredCommands.map((cmd, index) => {
          const Icon = cmd.icon;
          return (
            <button
              key={cmd.id}
              onClick={() => onSelect(cmd)}
              onMouseEnter={() => onSelectedIndexChange(index)}
              className={cn(
                "w-full flex items-center gap-3 px-2 py-2 rounded-md text-left transition-colors",
                index === selectedIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50"
              )}
            >
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{cmd.label}</span>
                  <span className="text-xs font-mono text-muted-foreground">{cmd.command}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{cmd.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Hook to manage slash command state
 */
export function useSlashCommands(inputValue: string, setInputValue: (value: string) => void) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Check if we should show the menu
  const shouldShowMenu = inputValue.startsWith('/') && !inputValue.includes(' ');
  const filter = shouldShowMenu ? inputValue : '';

  useEffect(() => {
    setIsOpen(shouldShowMenu);
  }, [shouldShowMenu]);

  const filteredCommands = SLASH_COMMANDS.filter((cmd) =>
    cmd.command.toLowerCase().startsWith(filter.toLowerCase()) ||
    cmd.label.toLowerCase().includes(filter.toLowerCase().replace('/', ''))
  );

  const handleSelect = (command: SlashCommand) => {
    setInputValue(command.prompt);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return false;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
        return true;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return true;
      case 'Tab':
      case 'Enter':
        if (filteredCommands[selectedIndex]) {
          e.preventDefault();
          handleSelect(filteredCommands[selectedIndex]);
          return true;
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        return true;
    }
    return false;
  };

  return {
    isOpen,
    filter,
    selectedIndex,
    setSelectedIndex,
    handleSelect,
    handleKeyDown,
    close: () => setIsOpen(false),
  };
}
