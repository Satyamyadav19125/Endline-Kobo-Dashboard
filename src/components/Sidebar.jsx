import React from 'react'
import { LayoutDashboard, BarChart2, Map, Table, Settings } from 'lucide-react'
import CONFIG from '../config.js'

const nav = [
  { id: 'overview', label: 'Overview',   icon: LayoutDashboard },
  { id: 'charts',   label: 'Analytics',  icon: BarChart2 },
  { id: 'map',      label: 'Map View',   icon: Map },
  { id: 'data',     label: 'Data Table', icon: Table },
]

export default function Sidebar({ active, setActive, submissionCount }) {
  return (
    <aside style={{
      width: 220, minWidth: 220, background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      padding: '24px 0', gap: 4
    }}>
      {/* Logo */}
      <div style={{ padding: '0 20px 24px' }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 800,
          fontSize: 17, color: 'var(--accent)', letterSpacing: '-0.3px', lineHeight: 1.2
        }}>
          KOBO<br />
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>DASHBOARD</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
          {CONFIG.FORM_UID.substring(0, 12)}...
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '0 12px' }}>
        {nav.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActive(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 'var(--radius-sm)',
              background: active === id ? 'var(--accent-dim)' : 'transparent',
              border: active === id ? '1px solid var(--accent-mid)' : '1px solid transparent',
              color: active === id ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13,
              fontWeight: active === id ? 600 : 400,
              transition: 'all 0.15s ease', textAlign: 'left'
            }}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>

      {/* Footer stat */}
      <div style={{
        margin: '16px 12px 0', padding: '12px',
        background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)'
      }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          Total Submissions
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color: 'var(--accent)' }}>
          {submissionCount.toLocaleString()}
        </div>
      </div>
    </aside>
  )
}
