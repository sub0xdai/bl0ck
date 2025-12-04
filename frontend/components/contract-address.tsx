"use client"

import { useState } from "react"
import { Copy, Check } from "lucide-react"

// Leave empty until launch, then add the contract address
const CONTRACT_ADDRESS: string = "HmACjJzZ7RBU3VK2jevFrTJuKEX8W4GSGDE7sLb4pump"

export default function ContractAddress() {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!CONTRACT_ADDRESS) return
    await navigator.clipboard.writeText(CONTRACT_ADDRESS)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20">
      <div className="flex flex-col items-center gap-2">
        <span className="text-white/40 text-xs uppercase tracking-widest">
          $BL0CK Contract Address
        </span>
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-black/60 backdrop-blur-md border border-white/10">
          {CONTRACT_ADDRESS ? (
            <>
              <code className="text-white/80 text-sm font-mono">
                {CONTRACT_ADDRESS.slice(0, 6)}...{CONTRACT_ADDRESS.slice(-4)}
              </code>
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition"
                aria-label="Copy address"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </>
          ) : (
            <span className="text-white/40 text-sm font-mono">TBA</span>
          )}
        </div>
      </div>
    </div>
  )
}
