import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from './supabaseClient'
 
const STAT_COLS = [
  { key: 'gp',      label: 'GP',   decimals: 0 },
  { key: 'min',     label: 'MIN',  decimals: 1 },
  { key: 'pts',     label: 'PTS',  decimals: 1 },
  { key: 'reb',     label: 'REB',  decimals: 1 },
  { key: 'ast',     label: 'AST',  decimals: 1 },
  { key: 'stl',     label: 'STL',  decimals: 1 },
  { key: 'blk',     label: 'BLK',  decimals: 1 },
  { key: 'turnover',label: 'TOV',  decimals: 1 },
  { key: 'fg3m',    label: '3PM',  decimals: 1 },
]
 
function calcFD(s) {
  return (s.pts ?? 0) + (s.reb ?? 0) * 1.2 + (s.ast ?? 0) * 1.5 +
    (s.stl ?? 0) * 3 + (s.blk ?? 0) * 3 - (s.turnover ?? 0)
}
 
function parseMin(minStr) {
  if (!minStr) return 0
  if (minStr.includes(':')) {
    const [m, s] = minStr.split(':').map(Number)
    return m + s / 60
  }
  return parseFloat(minStr) || 0
}
 
export default function StatLeaders() {
  const [season, setSeason]     = useState('2025')
  const [gameType, setGameType] = useState('all')
  const [homeAway, setHomeAway] = useState('all')
  const [sortCol, setSortCol]   = useState('pts')
  const [minMPG, setMinMPG]     = useState(20)
  const [minGP, setMinGP]       = useState(20)
  const [rawStats, setRawStats] = useState([])
  const [loading, setLoading]   = useState(false)
  const [status, setStatus]     = useState('')
 
  const loadData = useCallback(async () => {
    setLoading(true)
    setRawStats([])
    setStatus('Loading games…')
 
    try {
      // Get all Final games for this season (paginated)
      let gamePages = []
      let gFrom = 0
      while (true) {
        const { data: page, error: gErr } = await supabase
          .from('games')
          .select('id, postseason, home_team_id, visitor_team_id')
          .eq('season', parseInt(season))
          .eq('status', 'Final')
          .range(gFrom, gFrom + 999)
        if (gErr) throw gErr
        if (!page.length) break
        gamePages = gamePages.concat(page)
        if (page.length < 1000) break
        gFrom += 1000
      }
 
      // Build game info map
      const gameInfoMap = {}
      for (const g of gamePages) gameInfoMap[g.id] = g
 
      // Fetch all player stats for this season (paginated)
      setStatus('Loading player stats…')
      let allStats = []
      let from = 0
      const pageSize = 1000
      while (true) {
        const { data: page, error: sErr } = await supabase
          .from('player_stats')
          .select('player_id, player_first_name, player_last_name, player_position, team_abbreviation, team_id, game_id, min, pts, reb, ast, stl, blk, turnover, fg3m')
          .eq('season', parseInt(season))
          .range(from, from + pageSize - 1)
        if (sErr) throw sErr
        if (!page.length) break
        allStats = allStats.concat(page)
        if (page.length < pageSize) break
        from += pageSize
      }
 
      // Attach game info to each stat row, filter out DNPs
      const withGame = allStats
        .filter(s => s.min && s.min !== '0:00' && s.min !== '00' && s.min !== '0')
        .map(s => ({ ...s, gameInfo: gameInfoMap[s.game_id] }))
        .filter(s => s.gameInfo)
 
      setRawStats(withGame)
      setStatus('')
    } catch (err) {
      console.error(err)
      setStatus('Failed to load: ' + err.message)
    }
    setLoading(false)
  }, [season])
 
  useEffect(() => { loadData() }, [loadData])
 
  // ── Apply game type + home/away + aggregate client-side ──────────────────
  const rows = useMemo(() => {
    const filtered = rawStats.filter(s => {
      const g = s.gameInfo
      if (gameType === 'regular' && g.postseason) return false
      if (gameType === 'playoffs' && !g.postseason) return false
      if (homeAway === 'home' && g.home_team_id !== s.team_id) return false
      if (homeAway === 'away' && g.visitor_team_id !== s.team_id) return false
      return true
    })
 
    const playerMap = {}
    for (const s of filtered) {
      if (!s.player_id) continue
      if (!playerMap[s.player_id]) {
        playerMap[s.player_id] = {
          player_id: s.player_id,
          name: `${s.player_first_name} ${s.player_last_name}`,
          position: s.player_position,
          team: s.team_abbreviation,
          gp: 0, min: 0,
          pts: 0, reb: 0, ast: 0,
          stl: 0, blk: 0, turnover: 0, fg3m: 0,
        }
      }
      const p = playerMap[s.player_id]
      p.gp++
      p.min      += parseMin(s.min)
      p.pts      += s.pts ?? 0
      p.reb      += s.reb ?? 0
      p.ast      += s.ast ?? 0
      p.stl      += s.stl ?? 0
      p.blk      += s.blk ?? 0
      p.turnover += s.turnover ?? 0
      p.fg3m     += s.fg3m ?? 0
    }
 
    return Object.values(playerMap).map(p => ({
      ...p,
      min:      p.min      / p.gp,
      pts:      p.pts      / p.gp,
      reb:      p.reb      / p.gp,
      ast:      p.ast      / p.gp,
      stl:      p.stl      / p.gp,
      blk:      p.blk      / p.gp,
      turnover: p.turnover / p.gp,
      fg3m:     p.fg3m     / p.gp,
      fd: calcFD({
        pts: p.pts/p.gp, reb: p.reb/p.gp, ast: p.ast/p.gp,
        stl: p.stl/p.gp, blk: p.blk/p.gp, turnover: p.turnover/p.gp
      }),
    }))
  }, [rawStats, gameType, homeAway])
 
  const filtered = rows.filter(r => r.gp >= minGP && r.min >= minMPG)
 
  const sorted = [...filtered].sort((a, b) => {
    const aVal = sortCol === 'fd' ? a.fd : (a[sortCol] ?? 0)
    const bVal = sortCol === 'fd' ? b.fd : (b[sortCol] ?? 0)
    return bVal - aVal
  })
 
  const thStyle = (key) => ({
    padding: '5px 6px',
    textAlign: 'center',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    color: sortCol === key ? '#185fa5' : '#888',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    borderBottom: sortCol === key ? '2px solid #185fa5' : '2px solid transparent',
    userSelect: 'none',
  })
 
  return (
    <div>
      <div className="ctrl-bar" style={{ marginBottom: '0.6rem', alignItems: 'flex-start' }}>
        <div className="ctrl-group">
          <div className="ctrl-label">Season</div>
          <select value={season} onChange={e => setSeason(e.target.value)}>
            <option value="2025">2025–26</option>
            <option value="2024">2024–25</option>
            <option value="2023">2023–24</option>
            <option value="2022">2022–23</option>
            <option value="2021">2021–22</option>
            <option value="2020">2020–21</option>
          </select>
        </div>
        <div className="ctrl-group">
          <div className="ctrl-label">Game type</div>
          <select value={gameType} onChange={e => setGameType(e.target.value)}>
            <option value="all">Full season</option>
            <option value="regular">Regular season</option>
            <option value="playoffs">Playoffs</option>
          </select>
        </div>
        <div className="ctrl-group">
          <div className="ctrl-label">Home / Away</div>
          <select value={homeAway} onChange={e => setHomeAway(e.target.value)}>
            <option value="all">All games</option>
            <option value="home">Home only</option>
            <option value="away">Away only</option>
          </select>
        </div>
        <div className="ctrl-group">
          <div className="ctrl-label">Sort by</div>
          <select value={sortCol} onChange={e => setSortCol(e.target.value)}>
            {STAT_COLS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            <option value="fd">FD pts</option>
          </select>
        </div>
        <div className="ctrl-group" style={{ flex: 1 }}>
          <div className="ctrl-label">Min MPG</div>
          <div className="n-row">
            <input type="range" min="0" max="40" step="1" value={minMPG}
              onChange={e => setMinMPG(parseInt(e.target.value))} />
            <span>{minMPG}</span>
          </div>
        </div>
        <div className="ctrl-group" style={{ flex: 1 }}>
          <div className="ctrl-label">Min GP</div>
          <div className="n-row">
            <input type="range" min="0" max="82" step="1" value={minGP}
              onChange={e => setMinGP(parseInt(e.target.value))} />
            <span>{minGP}</span>
          </div>
        </div>
      </div>
 
      {loading && <p className="loading">{status}</p>}
      {!loading && status && <p className="empty">{status}</p>}
      {!loading && !status && filtered.length === 0 && rows.length > 0 && (
        <p className="empty">No players match filters. Try lowering Min MPG or Min GP.</p>
      )}
 
      {!loading && sorted.length > 0 && <>
        <p style={{ fontSize: 12, color: '#888', marginBottom: '0.5rem' }}>{sorted.length} players</p>
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table className="stat-leaders-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <th style={{ padding: '5px 5px', textAlign: 'left', color: '#888', fontSize: 11, width: 24 }}>#</th>
                <th style={{ padding: '5px 8px', textAlign: 'left', color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap', minWidth: 140 }}>Player</th>
                <th style={{ padding: '5px 6px', textAlign: 'left', color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Team</th>
                <th style={{ padding: '5px 6px', textAlign: 'left', color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Pos</th>
                {STAT_COLS.map(c => (
                  <th key={c.key} onClick={() => setSortCol(c.key)} 
                    className={c.key !== sortCol ? 'hide-mobile' : ''}
                    style={thStyle(c.key)}>{c.label}</th>
                ))}
                <th onClick={() => setSortCol('fd')} className={sortCol !== 'fd' ? 'hide-mobile' : ''} style={thStyle('fd')}>FD pts</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
                <tr key={row.player_id ?? i}
                  style={{ 
                    borderBottom: '1px solid #eee',
                    background: i === 0 ? '#fffbe6' : i === 1 ? '#f0f0f0' : i === 2 ? '#fdf3e7' : ''
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = i === 0 ? '#fff3c4' : i === 1 ? '#e4e4e4' : i === 2 ? '#fae8d0' : '#fafafa'}
                  onMouseLeave={e => e.currentTarget.style.background = i === 0 ? '#fffbe6' : i === 1 ? '#f5f5f5' : i === 2 ? '#fdf3e7' : ''}>
                  <td style={{ padding: '5px 5px', fontSize: 11, fontWeight: i < 3 ? 700 : 400, color: i === 0 ? '#b8860b' : i === 1 ? '#888' : i === 2 ? '#cd7f32' : '#bbb' }}>{i + 1}</td>
                  <td style={{ padding: '5px 8px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    {row.name}
                  </td>
                  <td style={{ padding: '5px 6px', color: '#888', fontSize: 11 }}>{row.team ?? '–'}</td>
                  <td style={{ padding: '5px 6px', color: '#888', fontSize: 11 }}>{row.position ?? '–'}</td>
                  {STAT_COLS.map(c => (
                    <td key={c.key} 
                      className={c.key !== sortCol ? 'hide-mobile' : ''}
                      style={{ padding: '5px 6px', paddingRight: 16, textAlign: 'right', fontWeight: sortCol === c.key ? 500 : 400, color: sortCol === c.key ? '#111' : '#555' }}>
                      {c.key === 'gp' ? row.gp : (row[c.key] ?? 0).toFixed(c.decimals)}
                    </td>
                  ))}
                  <td className={sortCol !== 'fd' ? 'hide-mobile' : ''} style={{ padding: '5px 6px', textAlign: 'right', fontWeight: sortCol === 'fd' ? 500 : 400, color: sortCol === 'fd' ? '#185fa5' : '#555' }}>
                    {row.fd.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
    </div>
  )
}