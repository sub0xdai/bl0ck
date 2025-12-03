import V0ParticleAnimation from "@/components/v0-particle-animation"
import Navbar from "@/components/navbar"
import ContractAddress from "@/components/contract-address"

export default function Home() {
  return (
    <main className="relative min-h-screen bg-black overflow-hidden">
      <div className="fixed inset-0 w-full h-full">
        <V0ParticleAnimation />
      </div>

      <div className="relative z-10">
        <Navbar />
      </div>

      <ContractAddress />
    </main>
  )
}
