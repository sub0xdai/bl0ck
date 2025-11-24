export default function Navbar() {
  return (
    <nav className="backdrop-blur-md bg-black/40 border-b border-white/10">
      <div className="w-full px-8 py-4 flex items-center justify-between">
        <div className="text-white font-bold text-xl">BL0CK</div>
        <div className="flex items-center gap-6">
          <a href="#" className="text-gray-300 hover:text-white transition">
            Features
          </a>
          <a href="#" className="text-gray-300 hover:text-white transition">
            Pricing
          </a>
          <a href="#" className="text-gray-300 hover:text-white transition">
            Docs
          </a>
          <button className="px-4 py-2 bg-white text-black rounded-lg font-semibold hover:bg-gray-100 transition">
            Sign In
          </button>
        </div>
      </div>
    </nav>
  )
}
