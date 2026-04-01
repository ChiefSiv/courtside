import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
const API_KEY = process.env.BALLDONTLIE_API_KEY
const CURRENT_SEASON = 2025
const delay = ms => new Promise(r => setTimeout(r, ms))

async function bdFetch(path) {
  const res = await fetch(`https://api.balldontlie.io${path}`, {
    headers: { Authorization: API_KEY }
  })
  if (res.status === 429) {
    await delay(5000)
    return bdFetch(path)
  }
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export default async function handler() {
  console.log('=== Nightly sync starting ===')

  const since = new Date()
  since.setDate(since.getDate() - 3)
  const sinceStr = since.toISOString().split('T')[0]

  let cursor = null
  const newGameIds = []

  while (true) {
    const url = `/v1/games?seasons[]=${CURRENT_SEASON}&per_page=100&start_date=${sinceStr}${cursor ? '&cursor=' + cursor : ''}`
    const data = await bdFetch(url)
    const finalGames = data.data.filter(g => g.status === 'Final')

    if (finalGames.length) {
      const games = finalGames.map(g => ({
        id: g.id,
        date: g.date,
        season: CURRENT_SEASON,
        status: g.status,
        home_team_id: g.home_team?.id,
        visitor_team_id: g.visitor_team?.id
      }))
      await supabase.from('games').upsert(games, { onConflict: 'id' })
      newGameIds.push(...finalGames.map(g => g.id))
    }

    if (!data.meta?.next_cursor) break
    cursor = data.meta.next_cursor
    await delay(200)
  }

  console.log(`Found ${newGameIds.length} recent games`)

  if (!newGameIds.length) {
    console.log('No new games, done!')
    return new Response('No new games')
  }

  const chunkSize = 10
  let totalStats = 0

  for (let i = 0; i < newGameIds.length; i += chunkSize) {
    const chunk = newGameIds.slice(i, i + chunkSize)
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
          season: CURRENT_SEASON,
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
        await supabase.from('player_stats').upsert(stats, { onConflict: 'id' })
        totalStats += stats.length
      }

      if (!data.meta?.next_cursor) break
      pageCursor = data.meta.next_cursor
      await delay(100)
    }
    await delay(150)
  }

  console.log(`=== Sync complete — ${totalStats} rows ===`)
  return new Response(`Synced ${totalStats} rows`)
}

export const config = {
  schedule: '0 8 * * *'
}