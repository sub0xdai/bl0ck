"use client"

import { useState, useEffect } from "react"
import { X } from "lucide-react"
import Image from "next/image"

export default function FloatingGif() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 15000)
    return () => clearTimeout(timer)
  }, [])

  if (!isVisible) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={() => setIsVisible(false)}
    >
      <div
        className="relative animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setIsVisible(false)}
          className="absolute -top-3 -right-3 z-10 p-2 rounded-full bg-black/80 border border-white/20 text-white hover:bg-black hover:scale-110 transition-all"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
          <Image
            src="/assets/lina-bounce.gif"
            alt="Lina"
            width={480}
            height={640}
            unoptimized
            priority
          />
        </div>
      </div>
    </div>
  )
}
