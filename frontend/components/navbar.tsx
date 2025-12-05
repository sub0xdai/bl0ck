"use client"

import { useState } from "react"
import { Menu, X, Github, ExternalLink } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

const LINKTREE_URL = "https://linktr.ee/bl0ck_"
const GITHUB_URL = "https://github.com/sub0xdai/bl0ck"

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const linaUrl = process.env.NEXT_PUBLIC_LINA_URL || "https://app.lina4rmdabl0ck.xyz"

  const NavLinks = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-2 text-gray-300 hover:text-white transition ${mobile ? "w-full py-3 px-4 hover:bg-white/5 rounded-lg" : ""
          }`}
        onClick={() => mobile && setIsOpen(false)}
      >
        <Github className="w-4 h-4" />
        GitHub
      </a>
      <a
        href={LINKTREE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-2 text-gray-300 hover:text-white transition ${mobile ? "w-full py-3 px-4 hover:bg-white/5 rounded-lg" : ""
          }`}
        onClick={() => mobile && setIsOpen(false)}
      >
        <ExternalLink className="w-4 h-4" />
        Socials
      </a>
      <a
        href={linaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition ${mobile ? "w-full text-center mt-4" : ""
          }`}
        onClick={() => mobile && setIsOpen(false)}
      >
        Launch Lina
      </a>
    </>
  )

  return (
    <nav className="backdrop-blur-md bg-black/40 border-b border-white/10">
      <div className="w-full px-4 sm:px-8 py-4 flex items-center justify-between">
        <div className="text-white font-bold text-xl">BL0CK</div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-6">
          <NavLinks />
        </div>

        {/* Mobile Menu Trigger */}
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <button
              className="md:hidden p-2 text-white hover:bg-white/10 rounded-lg transition"
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6" />
            </button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="bg-black/95 border-white/10 text-white"
          >
            <SheetHeader>
              <SheetTitle className="text-white text-left">Menu</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-2 mt-8">
              <NavLinks mobile />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  )
}
