export default function Navbar() {
  return (
    <nav className="backdrop-blur-md bg-black/40 border-b border-white/10">
      <div className="w-full px-8 py-4 flex items-center justify-between">
        <div className="text-white font-bold text-xl">BL0CK</div>
        <div className="flex items-center gap-6">
          <a
            href="https://github.com/sub0xdai/bl0ck"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-300 hover:text-white transition"
          >
            GitHub
          </a>
          <a
            href={process.env.NEXT_PUBLIC_LINA_URL || "http://localhost:3000"}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition"
          >
            Launch Lina
          </a>
        </div>
      </div>
    </nav>
  )
}
