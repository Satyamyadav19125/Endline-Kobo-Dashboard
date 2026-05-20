import React from 'react'
import { RefreshCw, AlertCircle } from 'lucide-react'
import CONFIG from '../config.js'

export default function Header({ lastRefresh, refreshing, error, onRefresh }) {
  const fmt = (d) => d ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'

  return (
    <header style={{
      height: 56, minHeight: 56,
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      padding: '0 24px', gap: 16,
      justifyContent: 'space-between'
    }}>
      <h1 style={{
        fontFamily: 'var(--font-display)', fontWeight: 700,
        fontSize: 15, color: 'var(--text-primary)', letterSpacing: '-0.2px'
      }}>
        {CONFIG.DASHBOARD_TITLE}
      </h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--red-dim)', border: '1px solid var(--red)',
            color: 'var(--red)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12
          }}>
            <AlertCircle size={12} /> API Error — check your token & Form UID
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
          <span className="pulse-dot" style={{ background: error ? 'var(--red)' : refreshing ? 'var(--amber)' : 'var(--green)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            {refreshing ? 'Syncing...' : `Last sync: ${fmt(lastRefresh)}`}
          </span>
        </div>

        <button onClick={onRefresh}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            color: 'var(--text-secondary)', padding: '6px 12px',
            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: 12,
            transition: 'all 0.15s ease'
          }}>
          <RefreshCw size={12} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
    </header>
  )
}
