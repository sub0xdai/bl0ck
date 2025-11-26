import { useState } from 'react';
import {
  CHAIN_UI_CONFIGS,
  SupportedChain,
  isEVMChain,
  isSolanaChain
} from '../../../constants/chains';

interface ChainSelectorProps {
  value: SupportedChain;
  onChange: (chain: SupportedChain) => void;
  className?: string;
}

export function ChainSelector({ value, onChange, className = '' }: ChainSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const evmChains = Object.values(CHAIN_UI_CONFIGS).filter(config =>
    isEVMChain(config.id)
  );

  const solanaChains = Object.values(CHAIN_UI_CONFIGS).filter(config =>
    isSolanaChain(config.id)
  );

  const selectedConfig = CHAIN_UI_CONFIGS[value];

  const handleSelect = (chain: SupportedChain) => {
    onChange(chain);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      {/* Selected Chain Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-card border border-border rounded-lg hover:bg-accent transition-colors"
      >
        <div className="flex items-center gap-2">
          {selectedConfig.icon && (
            <img
              src={selectedConfig.icon}
              alt={selectedConfig.name}
              className="w-5 h-5"
            />
          )}
          <span className="font-medium text-sm">{selectedConfig.displayName}</span>
        </div>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-lg shadow-lg z-50">
          {/* EVM Chains Section */}
          <div className="p-2 border-b border-border">
            <div className="text-xs font-semibold text-muted-foreground px-2 py-1">
              EVM Chains
            </div>
            {evmChains.map((config) => (
              <button
                key={config.id}
                onClick={() => handleSelect(config.id)}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-accent transition-colors ${
                  value === config.id ? 'bg-accent' : ''
                }`}
              >
                <img
                  src={config.icon}
                  alt={config.name}
                  className="w-5 h-5"
                />
                <span className="text-sm">{config.displayName}</span>
              </button>
            ))}
          </div>

          {/* Solana Chains Section */}
          <div className="p-2">
            <div className="text-xs font-semibold text-muted-foreground px-2 py-1">
              Solana
            </div>
            {solanaChains.map((config) => (
              <button
                key={config.id}
                onClick={() => handleSelect(config.id)}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-accent transition-colors ${
                  value === config.id ? 'bg-accent' : ''
                }`}
              >
                <img
                  src={config.icon}
                  alt={config.name}
                  className="w-5 h-5"
                />
                <span className="text-sm">{config.displayName}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
