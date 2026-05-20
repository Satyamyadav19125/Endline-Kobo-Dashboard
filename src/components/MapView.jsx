import React, { useMemo, useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import CONFIG from '../config.js'

// Fix default marker icons in Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Custom accent marker
const accentIcon = new L.Icon({
  iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="#00e5ff"/>
      <circle cx="14" cy="14" r="6" fill="#0a0c10"/>
    </svg>
  `)}`,
  iconSize:   [28, 40],
  iconAnchor: [14, 40],
  popupAnchor:[0, -42],
})

const selectedIcon = new L.Icon({
  iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg width="36" height="50" viewBox="0 0 36 50" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 32 18 32s18-18.5 18-32C36 8.06 27.94 0 18 0z" fill="#ffab40"/>
      <circle cx="18" cy="18" r="7" fill="#0a0c10"/>
    </svg>
  `)}`,
  iconSize:   [36, 50],
  iconAnchor: [18, 50],
  popupAnchor:[0, -54],
})

function FlyTo({ coords }) {
  const map = useMap()
  useEffect(() => {
    if (coords) map.flyTo(coords, 14, { duration: 1.2 })
  }, [coords, map])
  return null
}

// Parse GPS from KoboToolbox — handles both array and "lat lng" string formats
function parseGPS(val) {
  if (!val) return null
  if (Array.isArray(val) && val.length >= 2) {
    const [lat, lng] = val.map(Number)
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) return [lat, lng]
  }
  if (typeof val === 'string') {
    const parts = val.trim().split(/[\s,]+/).map(Number)
    if (parts.length >= 2 && !parts.some(isNaN)) return [parts[0], parts[1]]
  }
  return null
}

export default function MapView({ submissions }) {
  const [selectedId, setSelectedId] = useState(null)
  const [flyTo, setFlyTo]           = useState(null)

  // Build mapped points
  const points = useMemo(() => {
    return submissions
      .map(s => {
        const coords = parseGPS(s[CONFIG.GPS_FIELD] || s._geolocation || s.gps || s.location)
        if (!coords) return null
        // Collect display fields (non-meta, non-empty)
        const display = Object.entries(s)
          .filter(([k,v]) => !k.startsWith('_') && v !== '' && v !== null && v !== undefined)
          .slice(0, 8)
        return { id: s._id, coords, display, raw: s }
      })
      .filter(Boolean)
  }, [submissions])

  const selectedPoint = selectedId ? points.find(p => p.id === selectedId) : null

  const handleSelect = (p) => {
    setSelectedId(p.id)
    setFlyTo(p.coords)
  }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>
      {/* Sidebar list */}
      <div style={{
        width:280, minWidth:280, background:'var(--bg-surface)',
        borderRight:'1px solid var(--border)',
        display:'flex', flexDirection:'column', overflow:'hidden'
      }}>
        <div style={{ padding:'16px 16px 10px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:14 }}>
            {points.length} / {submissions.length} mapped
          </div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
            {submissions.length - points.length} missing GPS
          </div>
        </div>
        <div style={{ overflowY:'auto', flex:1 }}>
          {/* All option */}
          <div onClick={() => { setSelectedId(null); setFlyTo(null) }}
            style={{
              padding:'10px 16px', cursor:'pointer', fontSize:12,
              background: !selectedId ? 'var(--accent-dim)' : 'transparent',
              color: !selectedId ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom:'1px solid var(--border)',
              fontWeight: !selectedId ? 600 : 400
            }}>
            📍 Show all ({points.length})
          </div>
          {points.map(p => (
            <div key={p.id} onClick={() => handleSelect(p)}
              style={{
                padding:'10px 16px', cursor:'pointer',
                background: selectedId === p.id ? 'var(--accent-dim)' : 'transparent',
                borderBottom:'1px solid var(--border)',
                transition:'background 0.12s'
              }}>
              <div style={{
                fontSize:12, fontFamily:'var(--font-mono)',
                color: selectedId === p.id ? 'var(--accent)' : 'var(--text-secondary)'
              }}>
                #{p.id}
              </div>
              <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
                {p.coords[0].toFixed(4)}, {p.coords[1].toFixed(4)}
              </div>
              {p.display[0] && (
                <div style={{ fontSize:12, color:'var(--text-primary)', marginTop:4 }} className="truncate">
                  {String(p.display[0][1]).substring(0, 40)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Map */}
      <div style={{ flex:1, position:'relative' }}>
        {points.length === 0 ? (
          <div style={{
            height:'100%', display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center',
            color:'var(--text-muted)', gap:12
          }}>
            <div style={{ fontSize:40 }}>🗺️</div>
            <div style={{ fontSize:14 }}>No GPS data found in submissions</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', maxWidth:320, textAlign:'center' }}>
              Make sure your form has a GPS/Location question and that CONFIG.GPS_FIELD matches the field name.
            </div>
          </div>
        ) : (
          <MapContainer
            center={selectedPoint?.coords || CONFIG.MAP_CENTER}
            zoom={CONFIG.MAP_ZOOM}
            style={{ height:'100%', width:'100%' }}
            preferCanvas>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='© <a href="https://openstreetmap.org">OpenStreetMap</a>'
            />
            {flyTo && <FlyTo coords={flyTo} />}
            {points
              .filter(p => !selectedId || p.id === selectedId)
              .map(p => (
                <Marker key={p.id} position={p.coords}
                  icon={selectedId === p.id ? selectedIcon : accentIcon}>
                  <Popup>
                    <div style={{ minWidth:200 }}>
                      <div style={{
                        fontFamily:'var(--font-display)', fontWeight:700,
                        fontSize:13, marginBottom:8, color:'var(--accent)'
                      }}>
                        Submission #{p.id}
                      </div>
                      <table style={{ width:'100%', borderCollapse:'collapse' }}>
                        {p.display.map(([k,v]) => (
                          <tr key={k}>
                            <td style={{ padding:'3px 6px 3px 0', fontSize:11, color:'var(--text-muted)', whiteSpace:'nowrap' }}>{k}</td>
                            <td style={{ padding:'3px 0', fontSize:12, color:'var(--text-primary)' }}>{String(v).substring(0,60)}</td>
                          </tr>
                        ))}
                      </table>
                    </div>
                  </Popup>
                </Marker>
              ))}
          </MapContainer>
        )}
      </div>
    </div>
  )
}
