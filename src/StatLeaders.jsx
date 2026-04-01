import { useState, useEffect, useCallback } from 'react'

async function apiFetch(path) {
  const res = await fetch(`/api${path}`)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

const STAT_COLS = [
  { key: 'pts',     label: 'PTS',  decimals: 1 },
  { key: 'reb',     label: 'REB',  decimals: 1 },
  { key: 'ast',     label: 'AST',  decimals: 1 },
  { key: 'stl',     label: 'STL',  decimals: 1 },
  { key: 'blk',     label: 'BLK',  decimals: 1 },
  { key: 'tov',     label: 'TOV',  decimals: 1 },
  { key: 'fg_pct',  label: 'FG%',  decimals: 1, pct: true },
  { key: 'fg3_pct', label: '3P%',  decimals: 1, pct: true },
  { key: 'ft_pct',  label: 'FT%',  decimals: 1, pct: true },
  { key: 'fga',     label: 'FGA',  decimals: 1 },
  { key: 'fg3a',    label: '3PA',  decimals: 1 },
  { key: 'fta',     label: 'FTA',  decimals: 1 },
  { key: 'oreb',    label: 'OREB', decimals: 1 },
  { key: 'dreb',    label: 'DREB', decimals: 1 },
  { key: 'min',     label: 'MIN',  decimals: 1 },
  { key: 'gp',      label: 'GP',   decimals: 0 },
]

function calcFD(s) {
  return (s.pts ?? 0) + (s.reb ?? 0) * 1.2 + (s.ast ?? 0) * 1.5 +
    (s.stl ?? 0) * 3 + (s.blk ?? 0) * 3 - (s.tov ?? 0)
}

function formatVal(val, col) {
  if (val == null || val === '') return '–'
  const num = parseFloat(val)
  if (isNaN(num)) return '–'
  if (col.pct) return (num * 100).toFixed(col.decimals) + '%'
  return num.toFixed(col.decimals)
}

export default function StatLeaders() {
  const [season, setSeason] = useState('2024')
  const [sortCol, setSortCol] = useState('pts')
  const [minMPG, setMinMPG] = useState(20)
  const [minGP, setMinGP] = useState(20)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')

  const loadData = useCallback(async (s) => {
    setLoading(true)
    setRows([])
    try {
      setLoadingMsg('Loading season averages…')
      let avgs = [], cursor = null
      for (let i = 0; i < 8; i++) {
        const url = `/nba/v1/season_averages/general?season=${s}&season_type=regular&type=base&per_page=100${cursor ? '&cursor=' + cursor : ''}`
        const d = await apiFetch(url)
        const batch = d.data ?? []
        avgs = avgs.concat(batch)
        if (!d.meta?.next_cursor || batch.length === 0) break
        cursor = d.meta.next_cursor
      }
      setLoadingMsg('Loading team data…')
      const teamMap = {}
      let pcursor = null
      for (let i = 0; i < 6; i++) {
        const url = `/nba/v1/players/active?per_page=100${pcursor ? '&cursor=' + pcursor : ''}`
        const d = await apiFetch(url)
        for (const p of (d.data ?? [])) teamMap[p.id] = p.team?.abbreviation ?? null
        if (!d.meta?.next_cursor) break
        pcursor = d.meta.next_cursor
      }
      const joined = avgs.map(row => ({
        stats: row.stats ?? {},
        player: row.player ?? {},
        team: teamMap[row.player?.id] ?? '–'
      }))
      setRows(joined)
      setLoadingMsg('')
    } catch(err) {
      console.error(err)
      setLoadingMsg('Failed to load: ' + err.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData(season) }, [season, loadData])

  const filtered = rows.filter(r => {
    const s = r.stats
    return parseFloat(s.gp ?? 0) >= minGP && parseFloat(s.min ?? 0) >= minMPG
  })

  const sorted = [...filtered].sort((a, b) => {
    const aVal = sortCol === 'fd' ? calcFD(a.stats) : parseFloat(a.stats[sortCol] ?? 0)
    const bVal = sortCol === 'fd' ? calcFD(b.stats) : parseFloat(b.stats[sortCol] ?? 0)
    return bVal - aVal
  })

  const thStyle = (key) => ({
    padding: '5px 6px',
    textAlign: 'right',
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
      <div style={{ display: 'flex', gap: 16, marginBottom: '0.6rem', alignItems: 'flex-end', width: '100%' }}>
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

      {loading && <p className="loading">{loadingMsg}</p>}
      {!loading && sorted.length === 0 && rows.length > 0 && (
        <p className="empty">No players match filters. Try lowering Min MPG or Min GP.</p>
      )}

      {!loading && sorted.length > 0 && <>
        <p style={{ fontSize: 12, color: '#888', marginBottom: '0.5rem' }}>{sorted.length} players</p>
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1000 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <th style={{ padding: '5px 5px', textAlign: 'left', color: '#888', fontSize: 11, width: 24 }}>#</th>
                  <th style={{ padding: '5px 8px', textAlign: 'left', color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap', minWidth: 140 }}>Player</th>
                  <th style={{ padding: '5px 6px', textAlign: 'left', color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Team</th>
                  <th style={{ padding: '5px 6px', textAlign: 'left', color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Pos</th>
                  {STAT_COLS.map(c => (
                    <th key={c.key} onClick={() => setSortCol(c.key)} style={thStyle(c.key)}>{c.label}</th>
                  ))}
                  <th onClick={() => setSortCol('fd')} style={thStyle('fd')}>FD pts</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => {
                  const s = row.stats
                  const p = row.player
                  const name = p.first_name ? `${p.first_name} ${p.last_name}` : `Player ${p.id}`
                  const fd = calcFD(s)
                  return (
                    <tr key={p.id ?? i}
                      style={{ borderBottom: '1px solid #eee' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={{ padding: '5px 5px', color: '#bbb', fontSize: 11 }}>{i + 1}</td>
                      <td style={{ padding: '5px 8px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {i < 3 && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#378add', marginRight: 6, verticalAlign: 'middle' }}></span>}
                        {name}
                      </td>
                      <td style={{ padding: '5px 6px', color: '#888', fontSize: 11 }}>{row.team}</td>
                      <td style={{ padding: '5px 6px', color: '#888', fontSize: 11 }}>{p.position ?? '–'}</td>
                      {STAT_COLS.map(c => (
                        <td key={c.key} style={{
                          padding: '5px 6px', textAlign: 'right',
                          fontWeight: sortCol === c.key ? 500 : 400,
                          color: sortCol === c.key ? '#111' : '#555',
                        }}>
                          {formatVal(s[c.key], c)}
                        </td>
                      ))}
                      <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: sortCol === 'fd' ? 500 : 400, color: sortCol === 'fd' ? '#185fa5' : '#555' }}>
                        {fd.toFixed(1)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>}
    </div>
  )
}