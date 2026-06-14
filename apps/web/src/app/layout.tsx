import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TenderMind — EU Procurement Intelligence for SMEs',
  description: '€420 billion in EU contracts. AI agents that find, analyse, and help you win them.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  )
}
