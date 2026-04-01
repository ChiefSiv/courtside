import { useState, useRef, useEffect, useCallback } from 'react'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

async function apiFetch(path) {
  const res = await fetch(`/api${path}`)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

function calcEFG(fgm, fg3m, fga) {
  if (!fga) return 0
  return ((fgm + 0.5 * fg3m) / fga * 100)
}
function calcTS(pts, fga, fta) {
  const denom = 2 * (fga + 0.44 * fta)
  if (!denom) return 0
  return (pts / denom * 100)
}
function calcFDPts(s) {
  return (s.pts ?? 0) + (s.reb ?? 0) * 1.2 + (s.ast ?? 0) * 1.5 +
    (s.stl ?? 0) * 3 + (s.blk ?? 0) * 3 - (s.turnover ?? 0)
}

function computeAvg(sliced) {
  if (!sliced.length) return null
  const fields = ['pts','reb','ast','stl','blk','turnover','oreb','dreb','fgm','fga','fg3m','fg3a','ftm','fta']
  const averaged = {}
  for (const f of fields) {
    const vals = sliced.map(g => g[f]).filter(v => v != null)
    averaged[f] = vals.length ? vals.reduce((a,b) => a+b,0) / vals.length : null
  }
  averaged.fg_pct = averaged.fga ? averaged.fgm / averaged.fga : null
  averaged.fg3_pct = averaged.fg3a ? averaged.fg3m / averaged.fg3a : null
  averaged.ft_pct = averaged.fta ? averaged.ftm / averaged.fta : null
  averaged.games_played = sliced.length
  const totalSecs = sliced.reduce((sum, g) => {
    if (!g.min) return sum
    const p = g.min.split(':')
    return sum + parseInt(p[0]||0)*60 + parseInt(p[1]||0)
  }, 0)
  const avgSecs = Math.round(totalSecs / sliced.length)
  averaged.min = `${Math.floor(avgSecs/60)}:${String(avgSecs%60).padStart(2,'0')}`
  return averaged
}

function computeAdvAvg(sliced) {
  if (!sliced.length) return null
  const fields = ['offensive_rating','defensive_rating','net_rating','usage_percentage','rebound_percentage','assist_percentage','turnover_ratio']
  const averaged = {}
  for (const f of fields) {
    const vals = sliced.map(g => g[f]).filter(v => v != null)
    averaged[f] = vals.length ? vals.reduce((a,b) => a+b,0) / vals.length : null
  }
  return averaged
}

function BarChart({ labels, data, colors, height = 180 }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    const inst = new Chart(ref.current, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 0 } },
          y: { ticks: { font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.06)' }, beginAtZero: true }
        }
      }
    })
    return () => inst.destroy()
  }, [])
  return <div style={{ position: 'relative', width: '100%', height }}><canvas ref={ref}></canvas></div>
}

function DoughnutChart({ labels, data, colors, height = 140 }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    const inst = new Chart(ref.current, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 1 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.toFixed(1)}%` } }
        }
      }
    })
    return () => inst.destroy()
  }, [])
  return <div style={{ position: 'relative', width: '100%', height }}><canvas ref={ref}></canvas></div>
}

export default function PlayerReportCard() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [player, setPlayer] = useState(null)
  const [season, setSeason] = useState('2024')
  const [loading, setLoading] = useState(false)
  const [avg, setAvg] = useState(null)
  const [advAvg, setAdvAvg] = useState(null)
  const [nGames, setNGames] = useState(20)
  const [pendingN, setPendingN] = useState(20)
  const [maxGames, setMaxGames] = useState(82)
  const [chartKey, setChartKey] = useState(0)
  const allGamesRef = useRef([])
  const allAdvGamesRef = useRef([])
  const searchTimer = useRef(null)
  const nGamesTimer = useRef(null)

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

  useEffect(() => {
    if (!allGamesRef.current.length) return
    const sliced = allGamesRef.current.slice(0, nGames)
    setAvg(computeAvg(sliced))
    setChartKey(k => k + 1)
    setAdvAvg(computeAdvAvg(allAdvGamesRef.current.slice(0, nGames)))
  }, [nGames])

  const loadData = useCallback(async (p, s, n) => {
    setLoading(true)
    setAvg(null)
    setAdvAvg(null)
    allGamesRef.current = []
    allAdvGamesRef.current = []
    try {
      let allStats = [], cursor = null
      for (let i = 0; i < 5; i++) {
        const url = `/nba/v1/stats?player_ids[]=${p.id}&seasons[]=${s}&per_page=100${cursor ? '&cursor='+cursor : ''}`
        const d = await apiFetch(url)
        allStats = allStats.concat(d.data)
        if (!d.meta?.next_cursor) break
        cursor = d.meta.next_cursor
      }
      const clean = allStats
        .filter(g => g.game?.status === 'Final' && g.game?.postseason === false && g.min && g.min !== '0:00' && g.min !== '00')
        .sort((a, b) => new Date(b.game.date) - new Date(a.game.date))
      allGamesRef.current = clean
      setMaxGames(clean.length)
      setAvg(computeAvg(clean.slice(0, n)))
      setChartKey(k => k + 1)

      const advRes = await apiFetch(`/nba/v2/stats/advanced?player_ids[]=${p.id}&seasons[]=${s}&per_page=100`)
      const advClean = (advRes.data ?? [])
        .filter(g => g.game?.postseason === false)
        .sort((a, b) => new Date(b.game?.date) - new Date(a.game?.date))
      allAdvGamesRef.current = advClean
      setAdvAvg(computeAdvAvg(advClean.slice(0, n)))
    } catch(err) { console.error(err) }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (player) loadData(player, season, nGames)
  }, [player, season, loadData])

  const efg = avg ? calcEFG(avg.fgm, avg.fg3m, avg.fga) : 0
  const ts = avg ? calcTS(avg.pts, avg.fga, avg.fta) : 0
  const fdPts = avg ? calcFDPts(avg) : 0
  const fg2pct = avg && avg.fga && avg.fg3a
    ? (((avg.fgm - avg.fg3m) / Math.max(avg.fga - avg.fg3a, 1)) * 100) : 0
  const clampedPending = Math.min(pendingN, maxGames)

  const pts2 = avg ? ((avg.fgm ?? 0) - (avg.fg3m ?? 0)) * 2 : 0
  const pts3 = avg ? (avg.fg3m ?? 0) * 3 : 0
  const ptsft = avg ? (avg.ftm ?? 0) : 0
  const ptsTotal = pts2 + pts3 + ptsft || 1

  return (
    <div>
      <div className="ctrl-bar" style={{ marginBottom: '0.5rem' }}>
        <div className="ctrl-group" style={{ position: 'relative' }}>
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
          <div className="ctrl-label">Season</div>
          <select value={season} onChange={e => setSeason(e.target.value)}>
            <option value="2025">2025–26</option>
            <option value="2024">2024–25</option>
            <option value="2023">2023–24</option>
            <option value="2022">2022–23</option>
          </select>
        </div>
        <div className="ctrl-group">
          <div className="ctrl-label">Last N games</div>
          <div className="n-row">
            <input type="range" min="1" max={maxGames} step="1" value={clampedPending}
              onChange={e => {
                const val = parseInt(e.target.value)
                setPendingN(val)
                clearTimeout(nGamesTimer.current)
                nGamesTimer.current = setTimeout(() => setNGames(val), 500)
              }} />
            <span>{clampedPending}</span>
          </div>
        </div>
      </div>

      {!player && <p className="empty">Search for a player to get started.</p>}
      {loading && <p className="loading">Loading player data…</p>}

      {!loading && avg && <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.6rem', flexWrap: 'wrap' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e6f1fb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, color: '#185fa5' }}>
            {player?.first_name?.[0]}{player?.last_name?.[0]}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{player?.first_name} {player?.last_name}</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 1 }}>
              {player?.team?.full_name} · #{player?.jersey_number ?? '–'} · {player?.position ?? '–'}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 24 }}>
            {[{ val: avg.games_played, lbl: 'GP' }, { val: avg.min, lbl: 'MIN' }].map(m => (
              <div key={m.lbl} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{m.val ?? '–'}</div>
                <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{m.lbl}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="chart-card" style={{ marginBottom: '0.5rem' }}>
        <div className="chart-title" style={{ marginBottom: '0.3rem' }}>Box score averages</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 6 }}>
          {[
            { val: avg.pts?.toFixed(1), lbl: 'PTS' },
            { val: avg.reb?.toFixed(1), lbl: 'REB' },
            { val: avg.ast?.toFixed(1), lbl: 'AST' },
            { val: avg.stl?.toFixed(1), lbl: 'STL' },
            { val: avg.blk?.toFixed(1), lbl: 'BLK' },
            { val: avg.turnover?.toFixed(1), lbl: 'TOV' },
            { val: avg.oreb?.toFixed(1), lbl: 'OREB' },
            { val: avg.dreb?.toFixed(1), lbl: 'DREB' },
          ].map(m => (
            <div key={m.lbl} className="metric-card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 'clamp(14px, 2vw, 22px)', fontWeight: 700 }}>{m.val ?? '–'}</div>
              <div className="metric-lbl">{m.lbl}</div>
            </div>
          ))}
        </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 6, marginBottom: '0.5rem' }}>
          <div className="chart-card">
            <div className="chart-title">Shooting efficiency</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { val: ((avg.fg_pct ?? 0) * 100).toFixed(1) + '%', lbl: 'FG%' },
                { val: ((avg.fg3_pct ?? 0) * 100).toFixed(1) + '%', lbl: '3P%' },
                { val: fg2pct.toFixed(1) + '%', lbl: '2P%' },
                { val: ((avg.ft_pct ?? 0) * 100).toFixed(1) + '%', lbl: 'FT%' },
                { val: efg.toFixed(1) + '%', lbl: 'eFG%' },
                { val: ts.toFixed(1) + '%', lbl: 'TS%' },
              ].map(m => (
                <div key={m.lbl} className="metric-card" style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{m.val}</div>
                  <div className="metric-lbl">{m.lbl}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-title">Shooting volume per game</div>
            <BarChart
              key={`vol-${chartKey}`}
              labels={['2PA', '3PA', 'FTA']}
              data={[
                parseFloat(((avg.fga??0)-(avg.fg3a??0)).toFixed(1)),
                parseFloat((avg.fg3a??0).toFixed(1)),
                parseFloat((avg.fta??0).toFixed(1)),
              ]}
              colors={['#b5d4f4','#9fe1cb','#fac775']}
              height={140}
            />
          </div>

          <div className="chart-card">
            <div className="chart-title">Point component share</div>
            <DoughnutChart
              key={`pie-${chartKey}`}
              labels={['2-pointers','3-pointers','Free throws']}
              data={[
                parseFloat((pts2/ptsTotal*100).toFixed(1)),
                parseFloat((pts3/ptsTotal*100).toFixed(1)),
                parseFloat((ptsft/ptsTotal*100).toFixed(1)),
              ]}
              colors={['#b5d4f4','#9fe1cb','#fac775']}
              height={110}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap', fontSize: 11, color: '#888' }}>
              {[['#b5d4f4','2PT'],['#9fe1cb','3PT'],['#fac775','FT']].map(([c,l]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: c }}></div>{l}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 140px) 1fr', gap: 6, marginBottom: '0.5rem', minWidth: 0 }}>
          <div className="chart-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: 100 }}>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 700, marginBottom: 8, textAlign: 'center', whiteSpace: 'nowrap' }}>FanDuel pts / game</div>
            <div style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 700, color: '#185fa5', lineHeight: 1 }}>{fdPts.toFixed(1)}</div>
          </div>
          <div className="chart-card" style={{ minWidth: 0, overflow: 'hidden' }}>
            <div className="chart-title">Fantasy points component breakdown</div>
            <BarChart
              key={`fd-${chartKey}`}
              labels={['PTS','REB','AST','STL','BLK','TOV']}
              data={[
                parseFloat(((avg.pts??0)*1).toFixed(2)),
                parseFloat(((avg.reb??0)*1.2).toFixed(2)),
                parseFloat(((avg.ast??0)*1.5).toFixed(2)),
                parseFloat(((avg.stl??0)*3).toFixed(2)),
                parseFloat(((avg.blk??0)*3).toFixed(2)),
                parseFloat(-((avg.turnover??0)*1).toFixed(2)),
              ]}
              colors={['#b5d4f4','#9fe1cb','#fac775','#cecbf6','#f5c4b3','#f7c1c1']}
              height={100}
            />
          </div>
        </div>

        {advAvg && <>
          <div className="chart-card" style={{ marginBottom: '0.6rem' }}>
          <div className="chart-title" style={{ marginBottom: '0.4rem' }}>Advanced ratings</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 6 }}>
            {[
              { val: advAvg.offensive_rating?.toFixed(1), lbl: 'Off RTG' },
              { val: advAvg.defensive_rating?.toFixed(1), lbl: 'Def RTG' },
              { val: advAvg.net_rating?.toFixed(1), lbl: 'Net RTG' },
              { val: advAvg.usage_percentage?.toFixed(1) + '%', lbl: 'USG%' },
              { val: advAvg.rebound_percentage?.toFixed(1) + '%', lbl: 'REB%' },
              { val: advAvg.assist_percentage?.toFixed(1) + '%', lbl: 'AST%' },
              { val: advAvg.turnover_ratio?.toFixed(1), lbl: 'TOV ratio' },
            ].map(m => (
              <div key={m.lbl} className="metric-card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 'clamp(13px, 1.8vw, 19px)', fontWeight: 700 }}>{m.val ?? '–'}</div>
                <div className="metric-lbl">{m.lbl}</div>
              </div>
            ))}
          </div>
          </div>
        </>}
      </>}

      {!loading && player && !avg && (
        <p className="empty">No data found for this player in {season}–{parseInt(season)+1}. Try a different season.</p>
      )}
    </div>
  )
}