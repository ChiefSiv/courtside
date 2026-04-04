import { useState } from 'react'
import BettingAnalysis from './BettingAnalysis'
import MatchupAnalysis from './MatchupAnalysis'
import PlayerReportCard from './PlayerReportCard'
import StatLeaders from './StatLeaders'
import './index.css'
import './App.css'

export default function App() {
  const [page, setPage] = useState('leaders')
  return (
    <div>
      <div className="header">
        <div className="logo"><span className="logo-dot"></span> CourtSide</div>
        <nav className="nav">
          <button className={`nav-btn ${page === 'player' ? 'active' : ''}`} onClick={() => setPage('player')}>Player report card</button>
          <button className={`nav-btn ${page === 'leaders' ? 'active' : ''}`} onClick={() => setPage('leaders')}>Stat leaders</button>
          <button className={`nav-btn ${page === 'betting' ? 'active' : ''}`} onClick={() => setPage('betting')}>Betting analysis</button>
          <button className={`nav-btn ${page === 'matchup' ? 'active' : ''}`} onClick={() => setPage('matchup')}>Matchup analysis</button>
        </nav>
      </div>
      <div className="main">
        {page === 'player' && <PlayerReportCard />}
        {page === 'leaders' && <StatLeaders />}
        {page === 'betting' && <BettingAnalysis />}
        {page === 'matchup' && <MatchupAnalysis />}
      </div>
    </div>
  )
}