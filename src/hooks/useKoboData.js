import { useState, useEffect, useCallback } from 'react'
import CONFIG from '../config.js'

export function useKoboData() {
  const [submissions, setSubmissions] = useState([])
  const [formMeta, setFormMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const headers = {
    'Authorization': `Token ${CONFIG.API_TOKEN}`,
    'Accept': 'application/json',
  }

  const fetchAll = useCallback(async (isBackground = false) => {
    if (isBackground) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const metaRes = await fetch(
        `/api/v2/assets/${CONFIG.FORM_UID}/?format=json`,
        { headers }
      )
      if (!metaRes.ok) throw new Error(`API error: ${metaRes.status}`)
      const meta = await metaRes.json()
      setFormMeta(meta)

      let allData = []
      let url = `/api/v2/assets/${CONFIG.FORM_UID}/data/?format=json&limit=100&start=0`
      while (url) {
        const res = await fetch(url, { headers })
        if (!res.ok) throw new Error(`Data error: ${res.status}`)
        const json = await res.json()
        allData = [...allData, ...(json.results || [])]
        if (json.next) {
          url = json.next.replace('https://kf.kobotoolbox.org', '')
        } else {
          url = null
        }
      }

      setSubmissions(allData)
      setLastRefresh(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchAll(false) }, [fetchAll])
  useEffect(() => {
    const interval = setInterval(() => fetchAll(true), CONFIG.REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchAll])

  return { submissions, formMeta, loading, error, lastRefresh, refreshing, refetch: () => fetchAll(false) }
}