"use client"

import { useState, useEffect, useCallback } from "react"
import { X } from "lucide-react"
import Image from "next/image"

export default function FloatingGif() {
  const [isVisible, setIsVisible] = useState(false)

  const schedulePopup = useCallback(() => {
    return setTimeout(() => setIsVisible(true), 15000)
  }, [])

  useEffect(() => {
    const timer = schedulePopup()
    return () => clearTimeout(timer)
  }, [schedulePopup])

  const handleClose = () => {
    setIsVisible(false)
    schedulePopup()
  }

  if (!isVisible) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-300"
      onClick={handleClose}
    >
      {/* Background image layer */}
      <div
        className="absolute inset-0 bg-cover bg-center blur-[2px]"
        style={{
          backgroundImage: "url('/assets/lina-pool.png')",
          filter: "brightness(0.3) blur(2px)",
        }}
      />
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
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
