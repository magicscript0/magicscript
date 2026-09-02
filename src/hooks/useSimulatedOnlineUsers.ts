import { useEffect, useState } from 'react'
import { ONLINE_USERS } from '../config/game'
import { getRandomInt } from '../utils/random'

/**
 * Simulated online-user counter — pure UI decoration, refreshed on an
 * interval like the original app. There is NO real presence system here.
 */
export function useSimulatedOnlineUsers(): number {
  const [count, setCount] = useState(() => getRandomInt(ONLINE_USERS.min, ONLINE_USERS.max))

  useEffect(() => {
    const id = window.setInterval(() => {
      setCount(getRandomInt(ONLINE_USERS.min, ONLINE_USERS.max))
    }, ONLINE_USERS.refreshMs)
    return () => window.clearInterval(id)
  }, [])

  return count
}
