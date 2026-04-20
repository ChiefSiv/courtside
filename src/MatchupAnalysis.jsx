import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
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

const NBA_ABBR = {
  1:'ATL',2:'BOS',3:'BKN',4:'CHA',5:'CHI',6:'CLE',7:'DAL',8:'DEN',9:'DET',
  10:'GSW',11:'HOU',12:'IND',13:'LAC',14:'LAL',15:'MEM',16:'MIA',17:'MIL',
  18:'MIN',19:'NOP',20:'NYK',21:'OKC',22:'ORL',23:'PHI',24:'PHX',25:'POR',
  26:'SAC',27:'SAS',28:'TOR',29:'UTA',30:'WAS'
}

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

const WINDOW_OPTIONS = [
  { label: 'Last 5',  value: 5 },
  { label: 'Last 10', value: 10 },
  { label: 'Last 15', value: 15 },
  { label: 'Last 20', value: 20 },
  { label: 'Last 30', value: 30 },
  { label: 'Full season', value: 9999 },
]

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

function getWindowSplits(n) {
  if (n >= 9999) return [10, 20, 41, 82]
  const raw = [
    Math.max(1, Math.round(n * 0.25)),
    Math.max(2, Math.round(n * 0.50)),
    Math.max(3, Math.round(n * 0.75)),
    n
  ]
  const seen = new Set()
  return raw.filter(v => { if (seen.has(v)) return false; seen.add(v); return true })
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
  const [teamId, setTeamId]     = useState('1')
  const [stat, setStat]         = useState('pts')
  const [season, setSeason]     = useState('2025')
  const [window_, setWindow]    = useState(9999)
  const [gameType, setGameType] = useState('all')
  const [homeAway, setHomeAway] = useState('all')
  const [loading, setLoading]   = useState(false)
  const [status, setStatus]     = useState('')
  const [rawData, setRawData]   = useState(null)

  const guardsRef      = useRef(null)
  const wingsRef       = useRef(null)
  const bigsRef        = useRef(null)
  const leagueChartRef = useRef(null)
  const leagueChartInst = useRef(null)
  const chartRefs = { Guards: guardsRef, Wings: wingsRef, Bigs: bigsRef }
  const isMobile = window.innerWidth <= 768
  const barChartHeight = isMobile ? 90 : 110

  const loadData = useCallback(async () => {
    if (!teamId) return
    setLoading(true)
    setRawData(null)
    setStatus('Loading games…')

    try {
      const tid = parseInt(teamId)
      const seasonInt = parseInt(season)

      // 1. Get all Final games for this season — paginated to bypass Supabase row cap
      let allGames = []
      let gFrom = 0
      const gPageSize = 500
      while (true) {
        const { data: page, error: gErr } = await supabase
          .from('games')
          .select('id, date, postseason, home_team_id, visitor_team_id')
          .eq('season', seasonInt)
          .eq('status', 'Final')
          .order('date', { ascending: false })
          .range(gFrom, gFrom + gPageSize - 1)
        if (gErr) throw new Error(gErr.message)
        if (!page.length) break
        allGames = allGames.concat(page)
        if (page.length < gPageSize) break
        gFrom += gPageSize
      }

      console.log('[MatchupAnalysis] allGames loaded:', allGames.length)

      const teamGamesSorted = allGames.filter(g =>
        g.home_team_id === tid || g.visitor_team_id === tid
      )
      console.log('[MatchupAnalysis] team games:', teamGamesSorted.length)

      // 2. Fetch opponent stats for all of team's games
      setStatus('Loading opponent stats…')
      let allOppStats = []
      const teamGameIds = teamGamesSorted.map(g => g.id)
      const chunkSize = 200
      for (let i = 0; i < teamGameIds.length; i += chunkSize) {
        const chunk = teamGameIds.slice(i, i + chunkSize)
        const { data, error } = await supabase
          .from('player_stats')
          .select('*')
          .in('game_id', chunk)
          .neq('team_id', tid)
          .limit(5000)
        if (error) throw new Error(error.message)
        allOppStats = allOppStats.concat(data)
      }
      allOppStats = allOppStats.filter(s => s.min && s.min !== '0:00' && s.min !== '00')
      console.log('[MatchupAnalysis] opp stats rows:', allOppStats.length)

      // 3. Fetch full league stats for baseline (paginated)
      setStatus('Loading league baseline…')
      let allLeagueStats = []
      let from = 0
      const pageSize = 1000
      while (true) {
        const { data: page, error: lErr } = await supabase
          .from('player_stats')
          .select('game_id, team_id, team_abbreviation, player_position, pts, reb, ast, stl, blk, turnover, fg3m')
          .eq('season', seasonInt)
          .range(from, from + pageSize - 1)
        if (lErr) throw new Error(lErr.message)
        if (!page.length) break
        allLeagueStats = allLeagueStats.concat(page)
        if (page.length < pageSize) break
        from += pageSize
      }
      console.log('[MatchupAnalysis] league stats rows:', allLeagueStats.length)

      // 4. Team scoring averages
      const teamGameTotals = {}
      for (const s of allLeagueStats) {
        if (!s.team_id || !s.game_id) continue
        const key = `${s.game_id}__${s.team_id}`
        if (!teamGameTotals[key]) teamGameTotals[key] = { teamId: s.team_id, total: 0 }
        teamGameTotals[key].total += s[stat] ?? 0
      }
      const teamScoresByGame = {}
      for (const e of Object.values(teamGameTotals)) {
        if (!teamScoresByGame[e.teamId]) teamScoresByGame[e.teamId] = []
        teamScoresByGame[e.teamId].push(e.total)
      }
      const teamAvgScores = Object.entries(teamScoresByGame)
        .map(([t, vals]) => ({ teamId: parseInt(t), avg: calcAvg(vals) ?? 0 }))
        .sort((a, b) => b.avg - a.avg)

      // 5. League team rankings
      const gameMapFull = {}
      for (const s of allLeagueStats) {
        if (!s.team_id || !s.game_id) continue
        const key = `${s.game_id}__${s.team_id}`
        if (!gameMapFull[key]) gameMapFull[key] = { teamId: s.team_id, gameId: s.game_id, abbr: s.team_abbreviation, total: 0 }
        gameMapFull[key].total += s[stat] ?? 0
      }
      const gameMapByGame = {}
      for (const e of Object.values(gameMapFull)) {
        if (!gameMapByGame[e.gameId]) gameMapByGame[e.gameId] = []
        gameMapByGame[e.gameId].push(e)
      }
      const gamesByTeam = {}
      for (const teams of Object.values(gameMapByGame)) {
        if (teams.length !== 2) continue
        const [a, b] = teams
        const aKey = a.abbr ?? String(a.teamId)
        const bKey = b.abbr ?? String(b.teamId)
        if (!gamesByTeam[aKey]) gamesByTeam[aKey] = []
        if (!gamesByTeam[bKey]) gamesByTeam[bKey] = []
        gamesByTeam[aKey].push(b.total)
        gamesByTeam[bKey].push(a.total)
      }
      const leagueTeamData = Object.entries(gamesByTeam)
        .map(([name, vals]) => ({ name, avg: calcAvg(vals) ?? 0 }))
        .filter(t => t.avg > 0)
        .sort((a, b) => b.avg - a.avg)

      setRawData({ allOppStats, allLeagueStats, teamGamesSorted, allGames, leagueTeamData, teamAvgScores, tid })
      setStatus('')
    } catch (err) {
      console.error(err)
      setStatus('Failed to load: ' + err.message)
    }
    setLoading(false)
  }, [teamId, season, stat])

  useEffect(() => { loadData() }, [loadData])

  const derived = useMemo(() => {
    if (!rawData) return null
    const { allOppStats, allLeagueStats, teamGamesSorted, allGames, tid } = rawData

    let filteredTeamGames = teamGamesSorted.filter(g => {
      if (gameType === 'regular') return !g.postseason
      if (gameType === 'playoffs') return g.postseason
      return true
    })
    filteredTeamGames = filteredTeamGames.filter(g => {
      if (homeAway === 'home') return g.home_team_id === tid
      if (homeAway === 'away') return g.visitor_team_id === tid
      return true
    })

    const windowedGames = window_ >= 9999 ? filteredTeamGames : filteredTeamGames.slice(0, window_)
    const windowedGameIds = new Set(windowedGames.map(g => g.id))
    const oppStats = allOppStats.filter(s => windowedGameIds.has(s.game_id))

    const leagueGameIds = new Set(
      allGames.filter(g => {
        if (gameType === 'regular') return !g.postseason
        if (gameType === 'playoffs') return g.postseason
        return true
      }).map(g => g.id)
    )
    const leagueStats = allLeagueStats.filter(s => leagueGameIds.has(s.game_id))

    const oppByGroup = {}
    const leagueByGroup = {}
    for (const [group, test] of Object.entries(POS_GROUPS)) {
      oppByGroup[group]    = calcPerGameByGroup(oppStats, test, stat)
      leagueByGroup[group] = calcPerGameByGroup(leagueStats, test, stat)
    }

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
    const topPlayers = Object.values(playerMap)
      .map(p => ({ ...p, avg: p.totals[stat] / p.games }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5)

    const gameIdsSortedByDate = windowedGames.map(g => g.id)

    // League team rankings with per-team window
    const teamGamesMap = {}
    for (const g of allGames) {
      if (gameType === 'regular' && g.postseason) continue
      if (gameType === 'playoffs' && !g.postseason) continue
      const addGame = (t) => {
        if (!teamGamesMap[t]) teamGamesMap[t] = []
        teamGamesMap[t].push(g)
      }
      if (homeAway === 'all') { addGame(g.home_team_id); addGame(g.visitor_team_id) }
      else if (homeAway === 'home') addGame(g.home_team_id)
      else if (homeAway === 'away') addGame(g.visitor_team_id)
    }
    const teamWindowGameIds = {}
    for (const [teamIdStr, games] of Object.entries(teamGamesMap)) {
      const sorted = [...games].sort((a, b) => new Date(b.date) - new Date(a.date))
      const windowed = window_ >= 9999 ? sorted : sorted.slice(0, window_)
      teamWindowGameIds[parseInt(teamIdStr)] = new Set(windowed.map(g => g.id))
    }
    const filteredGameMapFull = {}
    for (const s of allLeagueStats) {
      if (!s.team_id || !s.game_id) continue
      const teamWindow = teamWindowGameIds[s.team_id]
      if (!teamWindow?.has(s.game_id)) continue
      const key = `${s.game_id}__${s.team_id}`
      if (!filteredGameMapFull[key]) filteredGameMapFull[key] = { teamId: s.team_id, gameId: s.game_id, abbr: s.team_abbreviation, total: 0 }
      filteredGameMapFull[key].total += s[stat] ?? 0
    }
    const filteredGameMapByGame = {}
    for (const e of Object.values(filteredGameMapFull)) {
      if (!filteredGameMapByGame[e.gameId]) filteredGameMapByGame[e.gameId] = []
      filteredGameMapByGame[e.gameId].push(e)
    }
    const filteredGamesByTeam = {}
    for (const teams of Object.values(filteredGameMapByGame)) {
      if (teams.length !== 2) continue
      const [a, b] = teams
      const aKey = a.abbr ?? String(a.teamId)
      const bKey = b.abbr ?? String(b.teamId)
      if (!filteredGamesByTeam[aKey]) filteredGamesByTeam[aKey] = []
      if (!filteredGamesByTeam[bKey]) filteredGamesByTeam[bKey] = []
      filteredGamesByTeam[aKey].push(b.total)
      filteredGamesByTeam[bKey].push(a.total)
    }
    const filteredLeagueTeamData = Object.entries(filteredGamesByTeam)
      .map(([name, vals]) => ({ name, avg: calcAvg(vals) ?? 0 }))
      .filter(t => t.avg > 0)
      .sort((a, b) => b.avg - a.avg)

    return { oppByGroup, leagueByGroup, oppStats, leagueStats, topPlayers, gameIdsSortedByDate, leagueTeamData: filteredLeagueTeamData, gamesInWindow: windowedGames.length }
  }, [rawData, gameType, homeAway, window_, stat])

  useEffect(() => {
    if (!derived) return
    const { oppByGroup, leagueByGroup } = derived
    for (const group of Object.keys(POS_GROUPS)) {
      const ref = chartRefs[group].current
      if (!ref) continue
      if (chartInstances[group].current) chartInstances[group].current.destroy()
      const oppVal = oppByGroup[group] ?? 0
      const lgVal  = leagueByGroup[group] || 1
      const pct    = parseFloat(((oppVal - lgVal) / lgVal * 100).toFixed(1))
      chartInstances[group].current = new Chart(ref, {
        type: 'bar',
        data: { labels: [group], datasets: [{ data: [pct], backgroundColor: getGrade(pct).color, borderRadius: 4, barThickness: 56 }] },
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
  }, [derived])

  useEffect(() => {
    if (!derived?.leagueTeamData || !leagueChartRef.current) return
    if (leagueChartInst.current) leagueChartInst.current.destroy()
    const { leagueTeamData } = derived
    const labels = leagueTeamData.map(t => t.name)
    const data   = leagueTeamData.map(t => parseFloat(t.avg.toFixed(1)))
    const selectedAbbr = NBA_ABBR[parseInt(teamId)] ?? ''
    const colors = leagueTeamData.map(t => t.name === selectedAbbr ? '#185fa5' : '#b5d4f4')
    leagueChartInst.current = new Chart(leagueChartRef.current, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 3 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
          y: { beginAtZero: true, ticks: { font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.06)' } }
        }
      }
    })
  }, [derived, teamId])

  const selectedTeam = NBA_TEAMS.find(t => String(t.id) === teamId)

  let bestMatchup = null, worstMatchup = null
  if (derived) {
    const { oppByGroup, leagueByGroup } = derived
    const entries = Object.keys(POS_GROUPS).map(group => ({
      group,
      pct: leagueByGroup[group] ? (oppByGroup[group] - leagueByGroup[group]) / leagueByGroup[group] * 100 : 0
    }))
    bestMatchup  = entries.reduce((a, b) => a.pct > b.pct ? a : b)
    worstMatchup = entries.reduce((a, b) => a.pct < b.pct ? a : b)
  }

  return (
    <div>
      <div className="ctrl-bar" style={{ marginBottom: '0.5rem', gap: 8 }}>
        <div className="ctrl-group">
          <div className="ctrl-label">Opponent team</div>
          <select value={teamId} onChange={e => setTeamId(e.target.value)} style={{ minWidth: 180 }}>
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
            <option value="2021">2021–22</option>
            <option value="2020">2020–21</option>
          </select>
        </div>
        <div className="ctrl-group">
          <div className="ctrl-label">Window</div>
          <select value={window_} onChange={e => setWindow(parseInt(e.target.value))}>
            {WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="ctrl-group">
          <div className="ctrl-label">Game type</div>
          <select value={gameType} onChange={e => setGameType(e.target.value)}>
            <option value="regular">Regular season</option>
            <option value="playoffs">Playoffs</option>
            <option value="all">Full season</option>
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
      </div>

      {loading && <div className="loading"><p>{status}</p></div>}
      {!loading && status && <p className="empty">{status}</p>}

      {!loading && derived && <>
        <div className="grade-grid" style={{ width: '100%' }}>
          {Object.keys(POS_GROUPS).map(group => {
            const opp = derived.oppByGroup[group] ?? 0
            const lg  = derived.leagueByGroup[group] || 1
            const pct = (opp - lg) / lg * 100
            const { grade, color, bg, label } = getGrade(pct)
            return (
              <div key={group} className="chart-card" style={{ textAlign: 'center', padding: '0.6rem', marginBottom: 0 }}>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{group}</div>
                <div style={{ fontSize: 36, fontWeight: 800, color, lineHeight: 1.1, marginTop: 4 }}>{grade}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color, background: bg, borderRadius: 20, padding: '2px 8px', display: 'inline-block', marginTop: 4 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginTop: 4 }}>{opp.toFixed(1)} <span style={{ fontSize: 10, color: '#888', fontWeight: 400 }}>{STAT_LABELS[stat]}/game</span></div>
                <div style={{ fontSize: 12, color, marginTop: 2 }}>{pct >= 0 ? '+' : ''}{pct.toFixed(1)}% vs avg</div>
              </div>
            )
          })}
          <div className="chart-card" style={{ padding: '0.6rem', marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            {bestMatchup && (
              <div>
                <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.4px' }}>Best target</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: getGrade(bestMatchup.pct).color }}>{bestMatchup.group}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{bestMatchup.pct >= 0 ? '+' : ''}{bestMatchup.pct.toFixed(1)}% vs avg</div>
              </div>
            )}
            {worstMatchup && (
              <div>
                <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.4px' }}>Avoid</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: getGrade(worstMatchup.pct).color }}>{worstMatchup.group}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{worstMatchup.pct >= 0 ? '+' : ''}{worstMatchup.pct.toFixed(1)}% vs avg</div>
              </div>
            )}
            <div style={{ fontSize: 10, color: '#bbb', marginTop: 4 }}>{derived.gamesInWindow} games</div>
          </div>
        </div>

        <div className="chart-grid" style={{ width: '100%' }}>
          {Object.keys(POS_GROUPS).map(group => (
            <div key={group} className="chart-card" style={{ marginBottom: 0 }}>
              <div className="chart-title">{group} — % vs league avg ({STAT_LABELS[stat]})</div>
              <div style={{ position: 'relative', width: '100%', height: barChartHeight }}>
                <canvas ref={chartRefs[group]}></canvas>
              </div>
            </div>
          ))}
        </div>

        <div className="bottom-grid">
          {(() => {
            const { oppStats: opp, leagueStats: lg, gameIdsSortedByDate } = derived
            const splits = getWindowSplits(Math.min(window_, derived.gamesInWindow))
            return (
              <div className="chart-card" style={{ marginBottom: 0, padding: '0.6rem 0.75rem' }}>
                <div className="chart-title">Defensive trend — {STAT_LABELS[stat]} allowed vs league avg</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #eee' }}>
                      <th style={{ textAlign: 'left', padding: '4px 6px', color: '#888', fontSize: 11 }}>Position</th>
                      {splits.map(s => (
                        <th key={s} className={`trend-col-${s}`} style={{ textAlign: 'right', padding: '4px 6px', color: '#888', fontSize: 11 }}>Last {s}</th>
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
                          {splits.map(splitN => {
                            const windowGameIds = new Set(gameIdsSortedByDate.slice(0, splitN))
                            const oppByGameTeam = {}
                            for (const s of opp) {
                              if (!windowGameIds.has(s.game_id) || !test(s.player_position) || !s.game_id || !s.team_id) continue
                              const key = `${s.game_id}__${s.team_id}`
                              oppByGameTeam[key] = (oppByGameTeam[key] ?? 0) + (s[stat] ?? 0)
                            }
                            const oppAvg = calcAvg(Object.values(oppByGameTeam))
                            if (oppAvg === null) return (
                              <td key={splitN} className={`trend-col-${splitN}`} style={{ padding: '6px 6px', textAlign: 'right', color: '#ccc', fontSize: 11 }}>n/a</td>
                            )
                            const pct   = lgAvg ? (oppAvg - lgAvg) / lgAvg * 100 : 0
                            const color = pct >= 5 ? '#3b6d11' : pct <= -5 ? '#a32d2d' : '#555'
                            const arrow = pct >= 5 ? '↑' : pct <= -5 ? '↓' : '–'
                            return (
                              <td key={splitN} className={`trend-col-${splitN}`} style={{ padding: '6px 6px', textAlign: 'right', color, fontWeight: Math.abs(pct) >= 5 ? 700 : 400 }}>
                                {arrow} {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>↑ green = easier · ↓ red = tougher · based on {derived.gamesInWindow} games</div>
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
                {derived.topPlayers.map((p, i) => (
                  <tr key={p.name} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '4px 6px', fontWeight: 500 }}>
                      {i === 0 && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#378add', marginRight: 6, verticalAlign: 'middle' }}></span>}
                      {p.name}
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', color: '#888' }}>{p.games}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700, color: '#185fa5' }}>{p.avg.toFixed(1)}</td>
                  </tr>
                ))}
                {derived.topPlayers.length === 0 && (
                  <tr><td colSpan={3} style={{ padding: '8px 6px', color: '#aaa', fontSize: 12 }}>Not enough data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {derived.leagueTeamData && (
          <div className="chart-card" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            <div className="chart-title">All teams — avg {STAT_LABELS[stat]} allowed (worst to best)</div>
            <div style={{ position: 'relative', width: '100%', height: 120 }}>
              <canvas ref={leagueChartRef}></canvas>
            </div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
              Blue = selected team · Full {gameType === 'regular' ? 'regular season' : 'playoffs'} · Left = easiest matchup
            </div>
          </div>
        )}

        <p style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>
          {derived.gamesInWindow} games · {gameType === 'regular' ? 'Regular season' : 'Playoffs'} · {homeAway === 'all' ? 'Home + Away' : homeAway === 'home' ? 'Home only' : 'Away only'}
          · Green = easier matchup · Red = tougher
        </p>
      </>}
    </div>
  )
}