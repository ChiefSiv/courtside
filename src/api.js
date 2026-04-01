const API_KEY = '3b13604b-63be-47ce-a594-bca471752359'

export async function apiFetch(path) {
  const res = await fetch(`/api${path}`, {
    headers: { Authorization: API_KEY }
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}