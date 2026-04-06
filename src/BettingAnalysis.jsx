import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Chart, registerables } from 'chart.js'
import { supabase } from './supabaseClient'
Chart.register(...registerables)
 
const STAT_LABELS = {
  pts: 'Points', reb: 'Rebounds', ast: 'Assists',
  stl: 'Steals', blk: 'Blocks', turnover: 'Turnovers', fg3m: '3-pointers made'
}
 
const STAT_KEYS = Object.keys(STAT_LABELS)

const PROP_LINES = {
    pts:      [5,10,15,20,25,30,35,40,45],
    ast:      [2,4,6,8,10,12,14],
    reb:      [4,6,8,10,12,14,16],
    stl:      [1,2,3,4],
    blk:      [1,2,3,4],
    fg3m:     [1,2,3,4,5,6,7,8],
    turnover: [1,2,3,4,5],
  }

export default function BettingAnalysis() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [player, setPlayer] = useState(null)
  const [stat, setStat] = useState('pts')
  const [season, setSeason] = useState('2025')
  const [nGames, setNGames] = useState(10)
  const [gameType, setGameType] = useState('all')   // 'all' | 'regular' | 'playoffs'
  const [homeAway, setHomeAway] = useState('all')   // 'all' | 'home' | 'away'
  const [loading, setLoading] = useState(false)
  const [customLine, setCustomLine] = useState('')
  const [rawGames, setRawGames] = useState([])      // all games for this player/season from Supabase
 
  const chartRef = useRef(null)
  const chartInstance = useRef(null)
  const donutRef = useRef(null)
  const donutInstance = useRef(null)
  const searchTimer = useRef(null)
 
  // ── Player search ────────────────────────────────────────────────────────
  async function searchPlayers(q) {
    if (!q) { setResults([]); return }
    try {
      const { data, error } = await supabase
        .from('player_stats')
        .select('player_id, player_first_name, player_last_name, team_abbreviation')
        .ilike('player_last_name', `%${q}%`)
        .eq('season', parseInt(season))
        .limit(50)
      if (error) throw error
      // Deduplicate by player_id
      const seen = new Set()
      const unique = (data || []).filter(p => {
        if (seen.has(p.player_id)) return false
        seen.add(p.player_id)
        return true
      }).slice(0, 8)
      setResults(unique)
    } catch (err) { setResults([]) }
  }
 
  function onQueryChange(e) {
    setQuery(e.target.value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => searchPlayers(e.target.value), 350)
  }
 
  function selectPlayer(p) {
    setPlayer(p)
    setQuery(`${p.player_first_name} ${p.player_last_name}`)
    setResults([])
  }
 
  // ── Load all games for player/season from Supabase ───────────────────────
  const loadData = useCallback(async () => {
    if (!player) return
    setLoading(true)
    setRawGames([])
    setCustomLine('')
    try {
      // Get all stat rows for this player this season
      const { data: stats, error: sErr } = await supabase
        .from('player_stats')
        .select('game_id, pts, reb, ast, stl, blk, turnover, fg3m, team_id, min')
        .eq('player_id', player.player_id)
        .eq('season', parseInt(season))
      if (sErr) throw sErr
 
      // Filter out DNPs
      const validStats = (stats || []).filter(s => s.min && s.min !== '0:00' && s.min !== '00')
      if (!validStats.length) { setRawGames([]); setLoading(false); return }
 
      // Get game details for these game IDs
      const gameIds = validStats.map(s => s.game_id)
      const { data: games, error: gErr } = await supabase
        .from('games')
        .select('id, date, postseason, home_team_id, visitor_team_id')
        .in('id', gameIds)
        .eq('status', 'Final')
        .order('date', { ascending: false })
      if (gErr) throw gErr
 
      // Join stats with games
      const gameMap = {}
      for (const g of games) gameMap[g.id] = g
 
      const joined = validStats
        .map(s => ({ ...s, game: gameMap[s.game_id] }))
        .filter(s => s.game)
        .sort((a, b) => new Date(b.game.date) - new Date(a.game.date))
 
      setRawGames(joined)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }, [player, season])
 
  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (rawGames.length > 0) setNGames(rawGames.length)
  }, [rawGames.length])
 
  // ── Apply filters client-side ─────────────────────────────────────────────
  const filteredGames = useMemo(() => {
    let games = rawGames
    if (gameType === 'regular') games = games.filter(g => !g.game.postseason)
    if (gameType === 'playoffs') games = games.filter(g => g.game.postseason)
    if (homeAway === 'home') games = games.filter(g => g.game.home_team_id === g.team_id)
    if (homeAway === 'away') games = games.filter(g => g.game.visitor_team_id === g.team_id)
    return games
  }, [rawGames, gameType, homeAway])
 
  const maxGames = filteredGames.length
  const clampedN = Math.min(nGames, maxGames)

  const games = filteredGames.slice(0, clampedN)
  const vals = games.map(g => g[stat] ?? 0)
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  const sortedVals = [...vals].sort((a, b) => a - b)
  const median = sortedVals[Math.floor(sortedVals.length / 2)] ?? 0
 
  const customPct = vals.length && customLine !== ''
    ? vals.filter(v => v > parseFloat(customLine)).length / vals.length * 100
    : null
  const customHits = vals.length && customLine !== ''
    ? vals.filter(v => v > parseFloat(customLine)).length
    : null
  const hitStreak = (() => {
    if (!vals.length || customLine === '') return 0
    const line = parseFloat(customLine)
    let streak = 0
    for (const v of vals) {
      if (v > line) streak++
      else break
    }
    return streak
  })()
 
  // ── Thresholds table ──────────────────────────────────────────────────────
  
  function getThresholds() {
  return PROP_LINES[stat] ?? []
  }
  const thresholds = getThresholds()
 
  // ── Best bet ──────────────────────────────────────────────────────────────
  const bestBet = useMemo(() => {
    if (!thresholds.length || !vals.length) return null
    const candidates = thresholds
      .map(line => ({
        line,
        hits: vals.filter(v => v > line).length,
        pct: vals.filter(v => v > line).length / vals.length * 100
      }))
      .filter(c => c.pct >= 80)
    if (!candidates.length) return null
    // Return the highest line that still hits 80%+
    return candidates.reduce((a, b) => a.line > b.line ? a : b)
  }, [thresholds, vals])
 
  // ── Bar chart ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current || !vals.length) return
    if (chartInstance.current) chartInstance.current.destroy()
    const labels = games.map(g => {
      const d = new Date(g.game.date + 'T12:00:00')
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }).reverse()
    const chartVals = [...vals].reverse()
    chartInstance.current = new Chart(chartRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { type: 'bar', label: STAT_LABELS[stat], data: chartVals, backgroundColor: '#b5d4f4', borderColor: '#378add', borderWidth: 1, borderRadius: 3 },
          { type: 'line', label: 'Avg', data: chartVals.map(() => avg), borderColor: '#e24b4a', borderWidth: 2, pointRadius: 0, borderDash: [5, 4], tension: 0, fill: false },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 15 } },
          y: { beginAtZero: true, ticks: { font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.06)' } }
        }
      }
    })
  }, [vals, avg, stat, games, customLine])
 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (vals.length) setCustomLine(avg.toFixed(1))
  }, [stat, season, gameType, homeAway, player])
 
  // ── Donut chart ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!donutRef.current || customPct === null) return
    if (donutInstance.current) donutInstance.current.destroy()
    const color = customPct >= 80 ? '#3b6d11' : customPct >= 60 ? '#854f0b' : '#a32d2d'
    donutInstance.current = new Chart(donutRef.current, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [customPct, 100 - customPct],
          backgroundColor: [color, '#f0f0f0'],
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '75%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      }
    })
  }, [customPct])
 
  const selectedName = player ? `${player.player_first_name} ${player.player_last_name}` : ''
 
  return (
    <div>
      {/* ── Controls ── */}
      <div className="ctrl-bar" style={{ marginBottom: '0.5rem' }}>
        <div className="ctrl-group search-wrap">
          <div className="ctrl-label">Player</div>
          <input type="text" value={query} onChange={onQueryChange} placeholder="Search player…" />
          {results.length > 0 && (
            <div className="search-results">
              {results.map(p => (
                <div key={p.player_id} className="search-result-item" onClick={() => selectPlayer(p)}>
                  {p.player_first_name} {p.player_last_name}{' '}
                  <span style={{ color: '#999', fontSize: 11 }}>{p.team_abbreviation}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="ctrl-group">
          <div className="ctrl-label">Stat</div>
          <select value={stat} onChange={e => setStat(e.target.value)}>
            {Object.entries(STAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="ctrl-group">
          <div className="ctrl-label">Season</div>
          <select value={season} onChange={e => setSeason(e.target.value)} style={{ minWidth: 100 }}>
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
        <div className="ctrl-group" style={{ flex: 1 }}>
          <div className="ctrl-label">Last N games</div>
          <div className="n-row">
            <input type="range" min="5" max={Math.max(maxGames, 5)} step="1" value={clampedN}
              onChange={e => setNGames(parseInt(e.target.value))} />
            <span>{clampedN}</span>
          </div>
        </div>
      </div>
 
      {!player && <p className="empty">Search for a player to get started.</p>}
      {loading && <p className="loading">Loading game log…</p>}
      {!loading && player && maxGames === 0 && <p className="empty">No games found for the selected filters.</p>}
 
      {!loading && vals.length > 0 && <>
 
        {/* ── Best bet card ── */}
        {bestBet ? (
          <div className="chart-card" style={{ marginBottom: '0.4rem', padding: '0.6rem 1rem', background: '#edf7e1', borderColor: '#3b6d11' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#3b6d11', textTransform: 'uppercase', letterSpacing: '0.4px' }}>⭐ Best bet</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#3b6d11' }}>
                {selectedName} Over {bestBet.line} {STAT_LABELS[stat]}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#3b6d11', background: 'white', borderRadius: 20, padding: '2px 10px' }}>
                {bestBet.pct.toFixed(0)}% hit rate
              </div>
              <div style={{ fontSize: 12, color: '#5a8a1f' }}>
                {bestBet.hits} of {vals.length} games · last {clampedN} games
              </div>
            </div>
          </div>
        ) : (
          <div className="chart-card" style={{ marginBottom: '0.4rem', padding: '0.6rem 1rem', background: '#fcebeb', borderColor: '#a32d2d' }}>
            <div style={{ fontSize: 13, color: '#a32d2d', fontWeight: 600 }}>
              No best bet found — no line hits 80%+ in the last {clampedN} games
            </div>
          </div>
        )}
 
        {/* ── Bar chart ── */}
        <div className="chart-card" style={{ marginBottom: '0.4rem', padding: '0.5rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.3rem', flexWrap: 'wrap', gap: 8 }}>
            <div className="chart-title" style={{ marginBottom: 0 }}>
              {STAT_LABELS[stat]} by game — last {games.length} games
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#888' }}>
              <span>Avg <strong style={{ color: '#111' }}>{avg.toFixed(1)}</strong></span>
              <span>Median <strong style={{ color: '#111' }}>{median.toFixed(1)}</strong></span>
              <span>High <strong style={{ color: '#111' }}>{Math.max(...vals)}</strong></span>
              <span>Low <strong style={{ color: '#111' }}>{Math.min(...vals)}</strong></span>
            </div>
          </div>
          <div style={{ position: 'relative', width: '100%', height: 180 }}>
            <canvas ref={chartRef}></canvas>
          </div>
        </div>
 
        {/* ── Table + Custom line ── */}
        <div className="bottom-section" style={{ marginTop: '0.4rem' }}>
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Hit</th>
                  <th>Miss</th>
                  <th className="r">Hit %</th>
                </tr>
              </thead>
              <tbody>
                {thresholds.map(line => {
                  const hit = vals.filter(v => v > line).length
                  const miss = vals.length - hit
                  const pct = hit / vals.length * 100
                  const isBest = bestBet && bestBet.line === line
                  const color = pct >= 80 ? '#3b6d11' : pct >= 60 ? '#854f0b' : '#a32d2d'
                  return (
                    <tr key={line} style={{ background: isBest ? '#edf7e1' : 'transparent' }}>
                      <td style={{ fontWeight: isBest ? 700 : 500 }}>
                        {isBest && <span style={{ marginRight: 4 }}>⭐</span>}
                        Over {line}
                      </td>
                      <td style={{ color: '#3b6d11', fontWeight: isBest ? 700 : 400 }}>{hit}</td>
                      <td style={{ color: '#993c1d' }}>{miss}</td>
                      <td className="r">
                        <div className="pct-bar-wrap">
                          <span style={{ fontWeight: isBest ? 700 : 400 }}>{pct.toFixed(0)}%</span>
                          <div className="pct-bar">
                            <div className="pct-fill" style={{ width: pct.toFixed(0) + '%', background: color }}></div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
 
          <div className="custom-line-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', boxSizing: 'border-box' }}>
            <div className="ctrl-label" style={{ marginBottom: 8, alignSelf: 'flex-start' }}>Custom line</div>
            <div className="line-input-row" style={{ alignSelf: 'flex-start' }}>
              <input type="number" value={customLine} step="0.5" min="0"
                style={{ width: 90, fontSize: 16, fontWeight: 700 }}
                onChange={e => setCustomLine(e.target.value)} />
              <span style={{ fontSize: 13, color: '#888' }}>{STAT_LABELS[stat]}</span>
            </div>
 
            {customPct !== null && <>
              <div style={{ position: 'relative', width: 140, height: 140, margin: '8px auto 0' }}>
                <canvas ref={donutRef}></canvas>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', lineHeight: 1.2 }}>
                  <div style={{ fontSize: 26, fontWeight: 700, color: customPct >= 80 ? '#3b6d11' : customPct >= 60 ? '#854f0b' : '#a32d2d' }}>
                    {customPct.toFixed(0)}%
                  </div>
                  <div style={{ fontSize: 11, color: '#888' }}>hit rate</div>
                </div>
              </div>
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <div style={{ fontSize: 12, color: '#888' }}>
                  {customHits} of {vals.length} games over {customLine}
                </div>
                {hitStreak > 0 ? (
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: '#185fa5', background: '#e6f1fb', borderRadius: 20, padding: '3px 10px', display: 'inline-block' }}>
                    {hitStreak} game hit streak
                  </div>
                ) : (
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: '#a32d2d', background: '#fcebeb', borderRadius: 20, padding: '3px 10px', display: 'inline-block' }}>
                    0 — missed last game
                  </div>
                )}
              </div>
            </>}
          </div>
        </div>
 
        {/* ── Recent form dots ── */}
        {customPct !== null && (
          <div className="chart-card" style={{ marginTop: '0.4rem', padding: '0.6rem 1rem' }}>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600, marginBottom: 10 }}>
              Recent form vs {customLine}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {vals.map((v, i) => {
                const hit = v > parseFloat(customLine)
                return (
                  <div key={i} title={`${v}`} style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: hit ? '#c0dd97' : '#f7c1c1',
                    border: `2px solid ${hit ? '#3b6d11' : '#a32d2d'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700,
                    color: hit ? '#27500a' : '#791f1f',
                    flexShrink: 0,
                  }}>
                    {v}
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 11, color: '#888' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#c0dd97', border: '1.5px solid #3b6d11' }}></div> Over
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f7c1c1', border: '1.5px solid #a32d2d' }}></div> Under
              </span>
              <span style={{ marginLeft: 'auto' }}>most recent first</span>
            </div>
          </div>
        )}
      </>}
    </div>
  )
}