import { useState, useRef, useEffect, useCallback } from 'react'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

async function apiFetch(path) {
  const res = await fetch(`/api${path}`)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

const STAT_LABELS = {
  pts: 'Points', reb: 'Rebounds', ast: 'Assists',
  stl: 'Steals', blk: 'Blocks', turnover: 'Turnovers', fg3m: '3-pointers made'
}

export default function BettingAnalysis() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [player, setPlayer] = useState(null)
  const [stat, setStat] = useState('pts')
  const [season, setSeason] = useState('2024')
  const [nGames, setNGames] = useState(20)
  const [maxGames, setMaxGames] = useState(82)
  const [allGames, setAllGames] = useState([])
  const [loading, setLoading] = useState(false)
  const [customLine, setCustomLine] = useState('')
  const chartRef = useRef(null)
  const chartInstance = useRef(null)
  const donutRef = useRef(null)
  const donutInstance = useRef(null)
  const searchTimer = useRef(null)

  const loadData = useCallback(async (selectedPlayer, selectedSeason) => {
    setLoading(true)
    setAllGames([])
    setCustomLine('')
    try {
      let all = [], cursor = null
      for (let i = 0; i < 5; i++) {
        const url = `/nba/v1/stats?player_ids[]=${selectedPlayer.id}&seasons[]=${selectedSeason}&per_page=100${cursor ? '&cursor=' + cursor : ''}`
        const d = await apiFetch(url)
        all = all.concat(d.data)
        if (!d.meta?.next_cursor) break
        cursor = d.meta.next_cursor
      }
      const clean = all
        .filter(g => g.game?.status === 'Final' && g.min && g.min !== '0:00' && g.min !== '00')
        .sort((a, b) => new Date(b.game.date) - new Date(a.game.date))
      setAllGames(clean)
      setMaxGames(clean.length)
      setNGames(prev => Math.min(prev, clean.length))
    } catch(err) { console.error(err) }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (player) loadData(player, season)
  }, [player, season, loadData])

  async function searchPlayers(q) {
    if (!q) { setResults([]); return }
    try {
      const d = await apiFetch(`/nba/v1/players/active?search=${encodeURIComponent(q)}&per_page=8`)
      setResults(d.data)
    } catch(err) { setResults([]) }
  }

  function onQueryChange(e) {
    setQuery(e.target.value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => searchPlayers(e.target.value), 350)
  }

  function selectPlayer(p) {
    setPlayer(p)
    setQuery(`${p.first_name} ${p.last_name}`)
    setResults([])
  }

  const clampedN = Math.min(nGames, maxGames)
  const games = allGames.slice(0, clampedN)
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

  function getThresholds() {
    if (!vals.length) return []
    const max = Math.max(...vals)
    const lines = []
    for (let v = 0.5; v <= Math.min(max + 2, 60); v += 1) lines.push(Math.round(v * 2) / 2)
    return lines
      .filter(l => { const p = vals.filter(v => v > l).length / vals.length; return p > 0.05 && p < 0.95 })
      .filter(l => Math.abs(l - avg) < 5)
      .slice(0, 8)
  }

  const thresholds = getThresholds()

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
          { type: 'line', label: 'Avg', data: chartVals.map(() => avg), borderColor: '#e24b4a', borderWidth: 2, pointRadius: 0, borderDash: [5, 4], tension: 0, fill: false }
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
  }, [vals, avg, stat, games])

  useEffect(() => {
    if (vals.length && customLine === '') setCustomLine(avg.toFixed(1))
  }, [avg, vals.length, customLine])

  useEffect(() => {
    if (!donutRef.current || customPct === null) return
    if (donutInstance.current) donutInstance.current.destroy()
    const color = customPct >= 65 ? '#3b6d11' : customPct >= 45 ? '#854f0b' : '#a32d2d'
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
        responsive: true,
        maintainAspectRatio: false,
        cutout: '75%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      }
    })
  }, [customPct])

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: '0.5rem', alignItems: 'flex-end', width: '100%' }}>
        <div className="ctrl-group search-wrap">
          <div className="ctrl-label">Player</div>
          <input type="text" value={query} onChange={onQueryChange} placeholder="Search player…" />
          {results.length > 0 && (
            <div className="search-results">
              {results.map(p => (
                <div key={p.id} className="search-result-item" onClick={() => selectPlayer(p)}>
                  {p.first_name} {p.last_name}{' '}
                  <span style={{ color: '#999', fontSize: 11 }}>{p.team?.abbreviation}</span>
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
        <div className="ctrl-group" style={{ flex: 1 }}>
          <div className="ctrl-label">Last N games</div>
          <div className="n-row">
            <input type="range" min="5" max={maxGames} step="1" value={clampedN}
              onChange={e => setNGames(parseInt(e.target.value))} />
            <span>{clampedN}</span>
          </div>
        </div>
        <div className="ctrl-group">
          <div className="ctrl-label">Season</div>
          <select value={season} onChange={e => setSeason(e.target.value)} style={{ width: 100, minWidth: 0 }}>
            <option value="2025">2025–26</option>
            <option value="2024">2024–25</option>
            <option value="2023">2023–24</option>
            <option value="2022">2022–23</option>
          </select>
        </div>
      </div>

      {!player && <p className="empty">Search for a player to get started.</p>}
      {loading && <p className="loading">Loading game log…</p>}

      {!loading && vals.length > 0 && <>
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
          <div className="chart-legend" style={{ marginBottom: 4 }}>
            <div className="legend-item">
              <div className="legend-swatch" style={{ background: '#378add' }}></div>
              {STAT_LABELS[stat]} per game
            </div>
            <div className="legend-item">
              <div className="legend-swatch" style={{ background: '#e24b4a', height: 3, marginTop: 3, borderRadius: 0 }}></div>
              Season avg ({avg.toFixed(1)})
            </div>
          </div>
          <div style={{ position: 'relative', width: '100%', height: 200 }}>
            <canvas ref={chartRef}></canvas>
          </div>
        </div>

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
                  const color = pct >= 65 ? '#3b6d11' : pct >= 45 ? '#854f0b' : '#a32d2d'
                  return (
                    <tr key={line}>
                      <td style={{ fontWeight: 500 }}>Over {line}</td>
                      <td style={{ color: '#3b6d11' }}>{hit}</td>
                      <td style={{ color: '#993c1d' }}>{miss}</td>
                      <td className="r">
                        <div className="pct-bar-wrap">
                          {pct.toFixed(0)}%
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
                <div style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center', lineHeight: 1.2
                }}>
                  <div style={{
                    fontSize: 26, fontWeight: 700,
                    color: customPct >= 65 ? '#3b6d11' : customPct >= 45 ? '#854f0b' : '#a32d2d'
                  }}>
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
                  <div style={{
                    marginTop: 6, fontSize: 12, fontWeight: 700,
                    color: '#185fa5', background: '#e6f1fb',
                    borderRadius: 20, padding: '3px 10px',
                    display: 'inline-block'
                  }}>
                    {hitStreak} game hit streak
                  </div>
                ) : (
                  <div style={{
                    marginTop: 6, fontSize: 12, fontWeight: 700,
                    color: '#a32d2d', background: '#fcebeb',
                    borderRadius: 20, padding: '3px 10px',
                    display: 'inline-block'
                  }}>
                    0 — missed last game
                  </div>
                )}
              </div>
            </>}

            </div>
        </div>

        {customPct !== null && vals.length > 0 && (
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