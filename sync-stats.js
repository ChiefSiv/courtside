import { config } from 'dotenv'
config()
import fetch from 'node-fetch'
import { createClient } from '@supabase/supabase-js'
 
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const API_KEY = process.env.BALLDONTLIE_API_KEY
 
const SEASONS = [2025]
const delay = ms => new Promise(r => setTimeout(r, ms))
 
async function bdFetch(path) {
  const res = await fetch(`https://api.balldontlie.io${path}`, {
    headers: { Authorization: API_KEY }
  })
  if (res.status === 429) {
    console.log('  Rate limited, waiting 5s...')
    await delay(5000)
    return bdFetch(path)
  }
  if (!res.ok) throw new Error(`API error ${res.status} for ${path}`)
  return res.json()
}
 
// ── 1. Sync all games for all seasons ─────────────────────────────────────
async function syncGames() {
  console.log('\n=== Syncing games ===')
  let totalGames = 0
 
  for (const season of SEASONS) {
    console.log(`  Season ${season}...`)
    let cursor = null
 
    while (true) {
      const url = `/nba/v1/games?seasons[]=${season}&per_page=100${cursor ? '&cursor=' + cursor : ''}`
      const data = await bdFetch(url)
 
      const games = data.data
        .filter(g => g.status === 'Final')
        .map(g => ({
          id: g.id,
          date: g.date,
          season: g.season,
          status: g.status,
          postseason: g.postseason ?? false,
          home_team_id: g.home_team?.id,
          visitor_team_id: g.visitor_team?.id,
        }))
 
      if (games.length) {
        const { error } = await supabase
          .from('games')
          .upsert(games, { onConflict: 'id' })
        if (error) console.error('  Games upsert error:', error.message)
        else totalGames += games.length
      }
 
      if (!data.meta?.next_cursor) break
      cursor = data.meta.next_cursor
      await delay(150)
    }
 
    console.log(`  ✓ Season ${season} done`)
  }
 
  console.log(`✓ Games total: ${totalGames}`)
}
 
// ── 2. Sync stats for all games missing from player_stats ─────────────────
async function syncStats() {
  console.log('\n=== Syncing player stats ===')
  const pageSize = 1000  // ← defined first

  // Get ALL game IDs from games table (paginated)
  const allGameIds = new Set()
  let gFrom = 0
  while (true) {
    const { data: page, error: gErr } = await supabase
      .from('games')
      .select('id')
      .range(gFrom, gFrom + pageSize - 1)
    if (gErr) throw new Error('Failed to fetch games: ' + gErr.message)
    if (!page.length) break
    page.forEach(g => allGameIds.add(g.id))
    if (page.length < pageSize) break
    gFrom += pageSize
  }

  // Get game IDs that already have stats (paginated)
  const syncedIds = new Set()
  let from = 0
  while (true) {
    const { data: page, error: sErr } = await supabase
      .from('player_stats')
      .select('game_id')
      .range(from, from + pageSize - 1)
    if (sErr) throw new Error('Failed to fetch synced games: ' + sErr.message)
    if (!page.length) break
    page.forEach(s => syncedIds.add(s.game_id))
    if (page.length < pageSize) break
    from += pageSize
  }

  const missingIds = [...allGameIds].filter(id => !syncedIds.has(id))
  console.log(`  ${allGameIds.size} total games, ${syncedIds.size} already synced, ${missingIds.length} missing`)

  if (!missingIds.length) {
    console.log('  ✓ All stats up to date!')
    return
  }

  const chunkSize = 10
  let totalStats = 0

  for (let i = 0; i < missingIds.length; i += chunkSize) {
    const chunk = missingIds.slice(i, i + chunkSize)
    const idsParam = chunk.map(id => `game_ids[]=${id}`).join('&')

    let pageCursor = null
    while (true) {
      const url = `/nba/v1/stats?${idsParam}&per_page=100${pageCursor ? '&cursor=' + pageCursor : ''}`
      const data = await bdFetch(url)

      const stats = data.data
        .filter(s => s.min && s.min !== '0:00' && s.min !== '00' && s.pts !== null)
        .map(s => ({
          id: s.id,
          game_id: s.game?.id,
          season: s.game?.season,
          player_id: s.player?.id,
          player_first_name: s.player?.first_name,
          player_last_name: s.player?.last_name,
          player_position: s.player?.position,
          team_id: s.team?.id,
          team_abbreviation: s.team?.abbreviation,
          min: s.min,
          pts: s.pts ?? 0,
          reb: s.reb ?? 0,
          ast: s.ast ?? 0,
          stl: s.stl ?? 0,
          blk: s.blk ?? 0,
          turnover: s.turnover ?? 0,
          fg3m: s.fg3m ?? 0,
        }))

      if (stats.length) {
        const { error } = await supabase
          .from('player_stats')
          .upsert(stats, { onConflict: 'id' })
        if (error) console.error('  Stats upsert error:', error.message)
        else totalStats += stats.length
      }

      if (!data.meta?.next_cursor) break
      pageCursor = data.meta.next_cursor
      await delay(100)
    }

    if (i % 100 === 0) {
      console.log(`  ${i}/${missingIds.length} games processed, ${totalStats} stat rows so far...`)
    }
    await delay(150)
  }

  console.log(`✓ Stats total: ${totalStats} new rows`)
}
 
// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== CourtSide Full Sync ===')
  console.log(`Seasons: ${SEASONS.join(', ')}`)
 
  await syncGames()
  await syncStats()
 
  console.log('\n=== Sync complete! ===')
}
 
main().catch(console.error)