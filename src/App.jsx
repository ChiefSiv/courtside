import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserProvider } from './context/UserProvider.jsx'

import BettingAnalysis from './BettingAnalysis'
import MatchupAnalysis from './MatchupAnalysis'
import PlayerReportCard from './PlayerReportCard'
import StatLeaders from './StatLeaders'
import { BestBetsPage }    from './BestBetsPage.jsx'
import { PerformancePage } from './PerformancePage.jsx'
import { MethodologyPage } from './MethodologyPage.jsx'

import './index.css'
import './App.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 2 } },
})

function AppContent() {
  const [page, setPage] = useState('bestBets')

  return (
    <div>
      <div className="header">
        <div className="logo"><span className="logo-dot"></span> CourtSide</div>
        <nav className="nav">
          <button className={`nav-btn ${page === 'bestBets' ? 'active' : ''}`} onClick={() => setPage('bestBets')}>
            Best Bets
            <span style={{ fontSize: '0.6rem', fontWeight: 700, background: '#3b82f6', color: '#fff', padding: '1px 5px', borderRadius: 99, marginLeft: 5, textTransform: 'uppercase' }}>New</span>
          </button>
          <button className={`nav-btn ${page === 'betting' ? 'active' : ''}`} onClick={() => setPage('betting')}>Player Prop Analysis</button>
          <button className={`nav-btn ${page === 'matchup' ? 'active' : ''}`} onClick={() => setPage('matchup')}>Matchup Analysis</button>
          <button className={`nav-btn ${page === 'player' ? 'active' : ''}`} onClick={() => setPage('player')}>Player Report Card</button>
          <button className={`nav-btn ${page === 'leaders' ? 'active' : ''}`} onClick={() => setPage('leaders')}>Stat Leaders</button>
        </nav>
      </div>
      <div className="main">
        {page === 'bestBets'    && <BestBetsPage onNavigate={setPage} />}
        {page === 'betting'     && <BettingAnalysis />}
        {page === 'matchup'     && <MatchupAnalysis />}
        {page === 'player'      && <PlayerReportCard />}
        {page === 'leaders'     && <StatLeaders />}
        {page === 'performance' && <PerformancePage />}
        {page === 'methodology' && <MethodologyPage />}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <AppContent />
      </UserProvider>
    </QueryClientProvider>
  )
}