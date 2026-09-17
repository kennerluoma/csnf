import { useEffect, useState } from 'react'

/* A ticking clock for "live now" / countdown UI. Starts at the server-rendered `initial` so
   hydration matches, then updates every `intervalMs` on the client. */
export function useNow(initial: number, intervalMs = 30_000) {
  const [now, setNow] = useState(initial)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
