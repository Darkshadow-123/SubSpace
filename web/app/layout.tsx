import type { Metadata } from 'next'
import './styles.css'

export const metadata: Metadata = {
  title: 'AgentFlow — Secure Multi-Tenant Workflow Orchestration',
  description: 'Production-ready AI workflow orchestration powered by Nhost and Hasura'
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}

