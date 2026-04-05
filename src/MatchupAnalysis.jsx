import { useState, useRef, useEffect, useCallback } from 'react'
import { Chart, registerables } from 'chart.js'
import { supabase } from './supabaseClient'
Chart.register(...registerables)
 
const NBA_TEAMS = [
  { id: 1, full_name: 'Atlanta Hawks' },
  { id: 2, full_name: 'Boston Celtics' },
  { id: 3, full_name: 'Brooklyn Nets' },
  { id: 4, full_name: 'Charlotte Hornets' },
  { id: 5, full_name: 'Chicago Bulls' },
  { id: 6, full_name: 'Cleveland Cavaliers' },
  { id: 7, full_name: 'Dallas Mavericks' },
  { id: 8, full_name: 'Denver Nuggets' },
  { id: 9, full_name: 'Detroit Pistons' },
  { id: 10, full_name: 'Golden State Warriors' },
  { id: 11, full_name: 'Houston Rockets' },
  { id: 12, full_name: 'Indiana Pacers' },
  { id: 13, full_name: 'LA Clippers' },
  { id: 14, full_name: 'Los Angeles Lakers' },
  { id: 15, full_name: 'Memphis Grizzlies' },
  { id: 16, full_name: 'Miami Heat' },
  { id: 17, full_name: 'Milwaukee Bucks' },
  { id: 18, full_name: 'Minnesota Timberwolves' },
  { id: 19, full_name: 'New Orleans Pelicans' },
  { id: 20, full_name: 'New York Knicks' },
  { id: 21, full_name: 'Oklahoma City Thunder' },
  { id: 22, full_name: 'Orlando Magic' },
  { id: 23, full_name: 'Philadelphia 76ers' },
  { id: 24, full_name: 'Phoenix Suns' },
  { id: 25, full_name: 'Portland Trail Blazers' },
  { id: 26, full_name: 'Sacramento Kings' },
  { id: 27, full_name: 'San Antonio Spurs' },
  { id: 28, full_name: 'Toronto Raptors' },
  { id: 29, full_name: 'Utah Jazz' },
  { id: 30, full_name: 'Washington Wizards' },
]
 
const STAT_LABELS = {
  pts: 'PTS', reb: 'REB', ast: 'AST',
  stl: 'STL', blk: 'BLK', turnover: 'TOV', fg3m: '3PM'
}
 
const ALL_STATS = ['pts', 'reb', 'ast', 'stl', 'blk', 'turnover', 'fg3m']
 
const POS_GROUPS = {
  Guards: p => p === 'G' || p === 'G-F',
  Wings:  p => p === 'F' || p === 'F-G' || p === 'F-C',
  Bigs:   p => p === 'C' || p === 'C-F',
}
 
function calcAvg(arr) {
  if (!arr.length) return null
  return arr.reduce((a, b) => a + b, 0) / arr.length
}
 
function getGrade(pct) {
  if (pct >= 15) return { grade: 'A', color: '#3b6d11', bg: '#edf7e1', label: 'Easiest' }
  if (pct >= 5)  return { grade: 'B', color: '#5a8a1f', bg: '#f0f7e6', label: 'Easy' }
  if (pct >= -5) return { grade: 'C', color: '#185fa5', bg: '#e6f1fb', label: 'Neutral' }
  if (pct >= -15)return { grade: 'D', color: '#854f0b', bg: '#fef3e2', label: 'Tough' }
  return { grade: 'F', color: '#a32d2d', bg: '#fcebeb', label: 'Toughest' }
}
 
function calcPerGameByGroup(rows, posTest, statKey) {
  const byGameTeam = {}
  for (const s of rows) {
    if (!posTest(s.player_position)) continue
    const key = `${s.game_id}__${s.team_id}`
    byGameTeam[key] = (byGameTeam[key] ?? 0) + (s[statKey] ?? 0)
  }
  const vals = Object.values(byGameTeam)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}
 
const chartInstances = { Guards: { current: null }, Wings: { current: null }, Bigs: { current: null } }
 
export default function MatchupAnalysis() {
  const [teamId, setTeamId] = useState('1')
  const [stat, setStat] = useState('pts')
  const [season, setSeason] = useState('2024')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [groupData, setGroupData] = useState(null)
  const [leagueAvgs, setLeagueAvgs] = useState(null)
  const [topPlayers, setTopPlayers] = useState([])
  const [multiStatData, setMultiStatData] = useState(null)
  const [leagueTeamData, setLeagueTeamData] = useState(null)
 
  const guardsRef = useRef(null)
  const wingsRef = useRef(null)
  const bigsRef = useRef(null)
  const leagueChartRef = useRef(null)
  const leagueChartInst = useRef(null)
  const chartRefs = { Guards: guardsRef, Wings: wingsRef, Bigs: bigsRef }
  
  const loadData = useCallback(async () => {
    if (!teamId) return
    setLoading(true)
    setGroupData(null)
    setLeagueAvgs(null)
    setTopPlayers([])
    setMultiStatData(null)
    setStatus('Loading games…')
 
    try {
      const tid = parseInt(teamId)
 
      // ── 1. Get this team's last 30 games ──────────────────────────────────
      const { data: teamGames, error: gErr } = await supabase
        .from('games')
        .select('id, date')
        .eq('season', parseInt(season))
        .eq('status', 'Final')
        .or(`home_team_id.eq.${tid},visitor_team_id.eq.${tid}`)
        .order('date', { ascending: false })
        .limit(30)
 
      if (gErr) throw new Error(gErr.message)
      if (!teamGames.length) {
        setStatus('No completed games found.')
        setLoading(false)
        return
      }
 
      const oppGameIds = teamGames.map(g => g.id)
      const gameIdsSortedByDate = oppGameIds
 
      // ── 2. Get opponent stats for those 30 games ───────────────────────────
      setStatus('Loading opponent stats…')
      const { data: oppRaw, error: oErr } = await supabase
        .from('player_stats')
        .select('*')
        .in('game_id', oppGameIds)
        .neq('team_id', tid)
 
      if (oErr) throw new Error(oErr.message)
      const oppStats = oppRaw.filter(s => s.min && s.min !== '0:00' && s.min !== '00')
 
      // ── 3. Get full season stats for league baseline (paginated) ───────────
      setStatus('Loading league baseline…')
      let leagueStats = []
      let from = 0
      const pageSize = 1000
      while (true) {
        const { data: page, error: lErr } = await supabase
          .from('player_stats')
          .select('game_id, team_id, team_abbreviation, player_position, pts, reb, ast, stl, blk, turnover, fg3m')
          .eq('season', parseInt(season))
          .range(from, from + pageSize - 1)
 
        if (lErr) throw new Error(lErr.message)
        if (!page.length) break
        leagueStats = leagueStats.concat(page)
        if (page.length < pageSize) break
        from += pageSize
      }
 
      // ── 4. Calculate group stats ───────────────────────────────────────────
      setStatus('Calculating…')
      const oppByGroup = {}
      const leagueByGroup = {}
      for (const [group, test] of Object.entries(POS_GROUPS)) {
        oppByGroup[group] = calcPerGameByGroup(oppStats, test, stat)
        leagueByGroup[group] = calcPerGameByGroup(leagueStats, test, stat)
      }
 
      // ── 5. Top players vs this team ────────────────────────────────────────
      const playerMap = {}
      for (const s of oppStats) {
        const name = s.player_first_name ? `${s.player_first_name} ${s.player_last_name}` : null
        if (!name) continue
        if (!playerMap[name]) playerMap[name] = { name, games: 0, totals: {} }
        playerMap[name].games++
        for (const st of ALL_STATS) {
          playerMap[name].totals[st] = (playerMap[name].totals[st] ?? 0) + (s[st] ?? 0)
        }
      }
      const topList = Object.values(playerMap)
        .map(p => ({ ...p, avg: p.totals[stat] / p.games }))
        .filter(p => p.games >= 2)
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 5)
 
      // ── 6. League team rankings ────────────────────────────────────────────
      const gameTeamTotals = {}
      for (const s of leagueStats) {
        if (!s.team_id || !s.game_id) continue
        const key = `${s.game_id}__${s.team_id}`
        if (!gameTeamTotals[key]) gameTeamTotals[key] = { teamId: s.team_id, gameId: s.game_id, abbr: s.team_abbreviation, total: 0 }
        gameTeamTotals[key].total += s[stat] ?? 0
      }
      const gameMap = {}
      for (const e of Object.values(gameTeamTotals)) {
        if (!gameMap[e.gameId]) gameMap[e.gameId] = []
        gameMap[e.gameId].push(e)
      }
      const gamesByTeam = {}
      for (const teams of Object.values(gameMap)) {
        if (teams.length !== 2) continue
        const [a, b] = teams
        const aKey = a.abbr ?? String(a.teamId)
        const bKey = b.abbr ?? String(b.teamId)
        if (!gamesByTeam[aKey]) gamesByTeam[aKey] = []
        if (!gamesByTeam[bKey]) gamesByTeam[bKey] = []
        gamesByTeam[aKey].push(b.total)
        gamesByTeam[bKey].push(a.total)
      }
      const teamRankings = Object.entries(gamesByTeam)
        .map(([name, vals]) => ({ name, avg: calcAvg(vals) ?? 0 }))
        .filter(t => t.avg > 0)
        .sort((a, b) => b.avg - a.avg)
      
      setGroupData(oppByGroup)
      setLeagueAvgs(leagueByGroup)
      setMultiStatData({ oppStats, leagueStats, gameIdsSortedByDate })
      setLeagueTeamData(teamRankings)
      setTopPlayers(topList)
      setStatus('')
    } catch (err) {
      console.error(err)
      setStatus('Failed to load: ' + err.message)
    }
    setLoading(false)
  }, [teamId, stat, season])
 
  useEffect(() => {
    if (teamId) loadData()
  }, [teamId, stat, season, loadData])
 
  useEffect(() => {
    if (!groupData || !leagueAvgs) return
    for (const group of Object.keys(POS_GROUPS)) {
      const ref = chartRefs[group].current
      if (!ref) continue
      if (chartInstances[group].current) chartInstances[group].current.destroy()
      const oppVal = groupData[group] ?? 0
      const lgVal = leagueAvgs[group] || 1
      const pct = parseFloat(((oppVal - lgVal) / lgVal * 100).toFixed(1))
      const color = pct >= 5 ? '#3b6d11' : pct <= -5 ? '#e24b4a' : '#378add'
      chartInstances[group].current = new Chart(ref, {
        type: 'bar',
        data: {
          labels: [group],
          datasets: [{ data: [pct], backgroundColor: color, borderRadius: 4, barThickness: 56 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 12 } } },
            y: { ticks: { font: { size: 11 }, callback: v => parseFloat(v.toFixed(1)) + '%' }, grid: { color: 'rgba(0,0,0,0.06)' } }
          }
        }
      })
    }
  }, [groupData, leagueAvgs])
 
  useEffect(() => {
    if (!leagueTeamData || !leagueChartRef.current) return
    if (leagueChartInst.current) leagueChartInst.current.destroy()
    const labels = leagueTeamData.map(t => t.name)
    const data = leagueTeamData.map(t => parseFloat(t.avg.toFixed(1)))
    const NBA_ABBR = {
      1:'ATL',2:'BOS',3:'BKN',4:'CHA',5:'CHI',6:'CLE',7:'DAL',8:'DEN',9:'DET',
      10:'GSW',11:'HOU',12:'IND',13:'LAC',14:'LAL',15:'MEM',16:'MIA',17:'MIL',
      18:'MIN',19:'NOP',20:'NYK',21:'OKC',22:'ORL',23:'PHI',24:'PHX',25:'POR',
      26:'SAC',27:'SAS',28:'TOR',29:'UTA',30:'WAS'
    }
    const selectedAbbr = NBA_ABBR[parseInt(teamId)] ?? ''
    const colors = leagueTeamData.map(t => t.name === selectedAbbr ? '#185fa5' : '#b5d4f4')
    leagueChartInst.current = new Chart(leagueChartRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderRadius: 3 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
          y: { beginAtZero: true, ticks: { font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.06)' } }
        }
      }
    })
  }, [leagueTeamData, teamId])
 
  const selectedTeam = NBA_TEAMS.find(t => String(t.id) === teamId)
 
  let bestMatchup = null, worstMatchup = null
  if (groupData && leagueAvgs) {
    const entries = Object.keys(POS_GROUPS).map(group => ({
      group,
      pct: (leagueAvgs[group] && groupData[group]) ? (groupData[group] - leagueAvgs[group]) / leagueAvgs[group] * 100 : 0
    }))
    bestMatchup = entries.reduce((a, b) => a.pct > b.pct ? a : b)
    worstMatchup = entries.reduce((a, b) => a.pct < b.pct ? a : b)
  }
 
  return (
    <div>
      <div className="ctrl-bar" style={{ marginBottom: '0.5rem' }}>
        <div className="ctrl-group">
          <div className="ctrl-label">Opponent team</div>
          <select value={teamId} onChange={e => setTeamId(e.target.value)} style={{ minWidth: 200 }}>
            {NBA_TEAMS.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        </div>
        <div className="ctrl-group">
          <div className="ctrl-label">Stat</div>
          <select value={stat} onChange={e => setStat(e.target.value)}>
            {Object.entries(STAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
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
      </div>
 
      {loading && (
        <div className="loading">
          <p>{status}</p>
        </div>
      )}
      {!loading && status && <p className="empty">{status}</p>}
 
      {!loading && groupData && leagueAvgs && <>
        <div className="grade-grid" style={{ gap: 8, marginBottom: '0.5rem' }}>
          {Object.keys(POS_GROUPS).map(group => {
            const pct = (leagueAvgs[group] && groupData[group]) ? (groupData[group] - leagueAvgs[group]) / leagueAvgs[group] * 100 : 0
            const { grade, color, bg, label } = getGrade(pct)
            return (
              <div key={group} className="chart-card" style={{ textAlign: 'center', padding: '0.6rem', marginBottom: 0 }}>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{group}</div>
                <div style={{ fontSize: 36, fontWeight: 800, color, lineHeight: 1.1, marginTop: 4 }}>{grade}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color, background: bg, borderRadius: 20, padding: '2px 8px', display: 'inline-block', marginTop: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{pct >= 0 ? '+' : ''}{pct.toFixed(1)}% vs avg</div>
              </div>
            )
          })}
          <div className="chart-card">
            {bestMatchup && (
              <div>
                <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.4px' }}>Best target</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: bestMatchup.pct >= 5 ? '#3b6d11' : bestMatchup.pct >= -5 ? '#185fa5' : '#a32d2d' }}>{bestMatchup.group}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{bestMatchup.pct >= 0 ? '+' : ''}{bestMatchup.pct.toFixed(1)}% vs avg</div>
              </div>
            )}
            {worstMatchup && (
              <div>
                <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.4px' }}>Avoid</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: worstMatchup.pct >= 5 ? '#3b6d11' : worstMatchup.pct >= -5 ? '#185fa5' : '#a32d2d' }}>{worstMatchup.group}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{worstMatchup.pct >= 0 ? '+' : ''}{worstMatchup.pct.toFixed(1)}% vs avg</div>
              </div>
            )}
          </div>
        </div>
 
        <div className="chart-grid">
          {Object.keys(POS_GROUPS).map(group => (
            <div key={group} className="chart-card" style={{ marginBottom: 0 }}>
              <div className="chart-title">{group} — % vs league avg ({STAT_LABELS[stat]})</div>
              <div style={{ position: 'relative', width: '100%', height: 130 }}>
                <canvas ref={chartRefs[group]}></canvas>
              </div>
            </div>
          ))}
        </div>
 
        <div className="bottom-grid">
          {multiStatData && (() => {
            const { oppStats: opp, leagueStats: lg, gameIdsSortedByDate } = multiStatData
            const windows = [
              { label: 'Last 5', games: 5 },
              { label: 'Last 10', games: 10 },
              { label: 'Last 15', games: 15 },
              { label: 'Last 30', games: 30 },
            ]
 
            return (
              <div className="chart-card" style={{ marginBottom: 0, padding: '0.6rem 0.75rem' }}>
                <div className="chart-title">Defensive trend — {STAT_LABELS[stat]} allowed vs league avg</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #eee' }}>
                      <th style={{ textAlign: 'left', padding: '4px 6px', color: '#888', fontSize: 11 }}>Position</th>
                      {windows.map(w => (
                        <th key={w.label} className={`trend-col-${w.games}`} style={{ textAlign: 'right', padding: '4px 6px', color: '#888', fontSize: 11 }}>{w.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(POS_GROUPS).map(([group, test]) => {
                      const lgByGameTeam = {}
                      for (const s of lg) {
                        if (!test(s.player_position) || !s.game_id || !s.team_id) continue
                        const key = `${s.game_id}__${s.team_id}`
                        lgByGameTeam[key] = (lgByGameTeam[key] ?? 0) + (s[stat] ?? 0)
                      }
                      const lgAvg = calcAvg(Object.values(lgByGameTeam))
 
                      return (
                        <tr key={group} style={{ borderBottom: '1px solid #f5f5f5' }}>
                          <td style={{ padding: '6px 6px', fontWeight: 700, color: '#555' }}>{group}</td>
                          {windows.map(w => {
                            const windowGameIds = gameIdsSortedByDate.slice(0, w.games)
                            const oppByGameTeam = {}
                            for (const s of opp) {
                              if (!windowGameIds.includes(s.game_id) || !test(s.player_position)) continue
                              if (!s.game_id || !s.team_id) continue
                              const key = `${s.game_id}__${s.team_id}`
                              oppByGameTeam[key] = (oppByGameTeam[key] ?? 0) + (s[stat] ?? 0)
                            }
                            const oppAvg = calcAvg(Object.values(oppByGameTeam))
                            if (oppAvg === null) return (
                              <td key={w.label} className={`trend-col-${w.games}`} style={{ padding: '6px 6px', textAlign: 'right', color: '#ccc', fontSize: 11 }}>n/a</td>
                            )
                            const pct = lgAvg ? (oppAvg - lgAvg) / lgAvg * 100 : 0
                            const color = pct >= 5 ? '#3b6d11' : pct <= -5 ? '#a32d2d' : '#555'
                            const arrow = pct >= 5 ? '↑' : pct <= -5 ? '↓' : '–'
                            return (
                              <td key={w.label} className={`trend-col-${w.games}`} style={{ padding: '6px 6px', textAlign: 'right', color, fontWeight: Math.abs(pct) >= 5 ? 700 : 400 }}>
                                {arrow} {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>
                  ↑ green = easier matchup · ↓ red = tougher · trend shows if defense is improving or declining
                </div>
              </div>
            )
          })()}
 
          <div className="chart-card" style={{ marginBottom: 0, padding: '0.6rem 0.75rem' }}>
            <div className="chart-title">Top {STAT_LABELS[stat]} scorers vs {selectedTeam?.full_name}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <th style={{ textAlign: 'left', padding: '4px 6px', color: '#888', fontSize: 11 }}>Player</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px', color: '#888', fontSize: 11 }}>GP</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px', color: '#888', fontSize: 11 }}>Avg {STAT_LABELS[stat]}</th>
                </tr>
              </thead>
              <tbody>
                {topPlayers.map((p, i) => (
                  <tr key={p.name} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '4px 6px', fontWeight: 500 }}>
                      {i === 0 && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#378add', marginRight: 6, verticalAlign: 'middle' }}></span>}
                      {p.name}
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', color: '#888' }}>{p.games}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700, color: '#185fa5' }}>{p.avg.toFixed(1)}</td>
                  </tr>
                ))}
                {topPlayers.length === 0 && (
                  <tr><td colSpan={3} style={{ padding: '8px 6px', color: '#aaa', fontSize: 12 }}>Not enough data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
 
        {leagueTeamData && (
          <div className="chart-card" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            <div className="chart-title">All teams — avg {STAT_LABELS[stat]} allowed (worst to best)</div>
            <div style={{ position: 'relative', width: '100%', height: 160 }}>
              <canvas ref={leagueChartRef}></canvas>
            </div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
              Blue = selected team · Based on full season · Left = easiest matchup
            </div>
          </div>
        )}
 
        <p style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>
          Based on last 30 games vs full-season league average · Green = easier matchup · Red = tougher matchup
        </p>
      </>}
    </div>
  )
}