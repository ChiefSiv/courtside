import { config } from 'dotenv'
config()
import fetch from 'node-fetch'

const res = await fetch('https://api.balldontlie.io/v1/stats?game_ids[]=18422310&game_ids[]=18422305&per_page=10', {
  headers: { Authorization: process.env.BALLDONTLIE_API_KEY }
})
const data = await res.json()
console.log('total rows:', data.data?.length)
console.log('first game status:', data.data?.[0]?.game?.status)
console.log('first game postseason:', data.data?.[0]?.game?.postseason)