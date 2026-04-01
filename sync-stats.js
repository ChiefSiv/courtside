import { config } from 'dotenv'
config()
import fetch from 'node-fetch'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
const API_KEY = process.env.BALLDONTLIE_API_KEY
const SEASON = 2025 // change to 2025 for 2025-26 season

const delay = ms => new Promise(r => setTimeout(r, ms))

async function bdFetch(path) {
  const res = await fetch(`https://api.balldontlie.io${path}`, {
    headers: { Authorization: API_KEY }
  })
  if (res.status === 429) {
    console.log('Rate limited, waiting 5s...')
    await delay(5000)
    return bdFetch(path)
  }
  if (!res.ok) throw new Error(`API error ${res.status} for ${path}`)
  return res.json()
}

async function syncGames() {
  console.log('Syncing games...')
  let cursor = null
  let totalGames = 0

  while (true) {
    const url = `/v1/games?seasons[]=${SEASON}&per_page=100${cursor ? '&cursor=' + cursor : ''}`
    const data = await bdFetch(url)

    const games = data.data
      .filter(g => g.status === 'Final')
      .map(g => ({
        id: g.id,
        date: g.date,
        season: SEASON,
        status: g.status,
        home_team_id: g.home_team?.id,
        visitor_team_id: g.visitor_team?.id
      }))

    if (games.length) {
      const { error } = await supabase
        .from('games')
        .upsert(games, { onConflict: 'id' })
      if (error) console.error('Games upsert error:', error.message)
      else totalGames += games.length
    }

    console.log(`  Synced ${totalGames} games so far...`)

    if (!data.meta?.next_cursor) break
    cursor = data.meta.next_cursor
    await delay(200)
  }

  console.log(`✓ Games done — ${totalGames} total`)
  return totalGames
}

async function syncStats(gameIds) {
  console.log(`Syncing stats for ${gameIds.length} games...`)
  const chunkSize = 10
  let totalStats = 0

  for (let i = 0; i < gameIds.length; i += chunkSize) {
    const chunk = gameIds.slice(i, i + chunkSize)
    const idsParam = chunk.map(id => `game_ids[]=${id}`).join('&')

    let pageCursor = null
    while (true) {
      const url = `/v1/stats?${idsParam}&per_page=100${pageCursor ? '&cursor=' + pageCursor : ''}`
      const data = await bdFetch(url)

      const stats = data.data
        .filter(s => s.min && s.min !== '0:00' && s.min !== '00' && s.pts !== null)
        .map(s => ({
          id: s.id,
          game_id: s.game?.id,
          season: SEASON,
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
          fg3m: s.fg3m ?? 0
        }))

      if (stats.length) {
        const { error } = await supabase
          .from('player_stats')
          .upsert(stats, { onConflict: 'id' })
        if (error) console.error('Stats upsert error:', error.message)
        else totalStats += stats.length
      }

      if (!data.meta?.next_cursor) break
      pageCursor = data.meta.next_cursor
      await delay(100)
    }

    if (i % 50 === 0) console.log(`  ${i}/${gameIds.length} games processed, ${totalStats} stat rows so far...`)
    await delay(150)
  }

  console.log(`✓ Stats done — ${totalStats} total rows`)
}

async function main() {
  console.log('=== CourtSide Sync ===')

  await syncGames()

  // Get all game IDs from our database
  const { data: games, error } = await supabase
  .from('games')
  .select('id')
  .eq('season', SEASON)
  
  if (error) throw new Error('Failed to fetch games: ' + error.message)
  
  const gameIds = games.map(g => g.id)
  await syncStats(gameIds)

  console.log('=== Sync complete! ===')
}

main().catch(console.error)