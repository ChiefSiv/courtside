import { useState } from 'react'
import BettingAnalysis from './BettingAnalysis'
import MatchupAnalysis from './MatchupAnalysis'
import PlayerReportCard from './PlayerReportCard'
import StatLeaders from './StatLeaders'
import './index.css'
import './App.css'

export default function App() {
  const [page, setPage] = useState('betting')
  return (
    <div>
      <div className="header">
        <div className="logo"><span className="logo-dot"></span> CourtSide</div>
        <nav className="nav">
          <button className={`nav-btn ${page === 'betting' ? 'active' : ''}`} onClick={() => setPage('betting')}>Player Prop Analysis</button>
          <button className={`nav-btn ${page === 'matchup' ? 'active' : ''}`} onClick={() => setPage('matchup')}>Matchup Analysis</button>
          <button className={`nav-btn ${page === 'player' ? 'active' : ''}`} onClick={() => setPage('player')}>Player Report Card</button>
          <button className={`nav-btn ${page === 'leaders' ? 'active' : ''}`} onClick={() => setPage('leaders')}>Stat Leaders</button>
        </nav>
      </div>
      <div className="main">
        {page === 'betting' && <BettingAnalysis />}
        {page === 'matchup' && <MatchupAnalysis />}
        {page === 'player' && <PlayerReportCard />}
        {page === 'leaders' && <StatLeaders />}
      </div>
    </div>
  )
}