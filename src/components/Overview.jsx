import React, { useMemo } from 'react'
import { FileText, Calendar, CheckCircle, Clock } from 'lucide-react'
import { format, subDays, parseISO } from 'date-fns'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'

function StatCard({ label, value, sub, icon: Icon, color = 'var(--accent)', dimColor }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '20px 22px',
      display: 'flex', flexDirection: 'column', gap: 12,
      position: 'relative', overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute', top: -20, right: -20, width: 80, height: 80,
        borderRadius: '50%', background: dimColor || 'var(--accent-dim)', opacity: 0.7
      }} />
      <div style={{
        width: 36, height: 36, borderRadius: 'var(--radius-sm)',
        background: dimColor || 'var(--accent-dim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: color
      }}>
        <Icon size={18} />
      </div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, color, lineHeight: 1.1, marginTop: 2 }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: 12
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ color: 'var(--accent)', fontWeight: 600 }}>{payload[0].value} submissions</div>
    </div>
  )
}

export default function Overview({ submissions, formMeta }) {
  // Submissions per day (last 30 days)
  const trend = useMemo(() => {
    const counts = {}
    const today = new Date()
    for (let i = 29; i >= 0; i--) {
      const d = format(subDays(today, i), 'MMM dd')
      counts[d] = 0
    }
    submissions.forEach(s => {
      try {
        const d = format(parseISO(s._submission_time || s.end || s.start), 'MMM dd')
        if (counts[d] !== undefined) counts[d]++
      } catch (_) {}
    })
    return Object.entries(counts).map(([date, count]) => ({ date, count }))
  }, [submissions])

  const today = format(new Date(), 'MMM dd')
  const todayCount = trend.find(t => t.date === today)?.count || 0
  const yesterday = format(subDays(new Date(), 1), 'MMM dd')
  const yestCount = trend.find(t => t.date === yesterday)?.count || 0

  // Fields count
  const fieldCount = formMeta?.content?.survey?.length || Object.keys(submissions[0] || {}).filter(k => !k.startsWith('_')).length

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, marginBottom: 4 }}>
          Survey Overview
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          {formMeta?.name || 'KoboToolbox Form'} — live data
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 16 }}>
        <StatCard
          label="Total Submissions" value={submissions.length.toLocaleString()}
          icon={FileText} sub="All time responses"
          color="var(--accent)" dimColor="var(--accent-dim)" />
        <StatCard
          label="Today" value={todayCount}
          icon={Calendar} sub={`Yesterday: ${yestCount}`}
          color="var(--green)" dimColor="var(--green-dim)" />
        <StatCard
          label="Form Fields" value={fieldCount}
          icon={CheckCircle} sub="Questions in survey"
          color="var(--purple)" dimColor="var(--purple-dim)" />
        <StatCard
          label="Avg / Day" value={trend.length ? Math.round(submissions.length / Math.max(1, trend.filter(t => t.count > 0).length)) : 0}
          icon={Clock} sub="Last 30 days"
          color="var(--amber)" dimColor="var(--amber-dim)" />
      </div>

      {/* Submissions trend */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 24
      }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, marginBottom: 20 }}>
          Submissions — Last 30 Days
        </h3>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={trend}>
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false}
              interval={4} />
            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="count" stroke="var(--accent)" strokeWidth={2}
              fill="url(#grad)" dot={false} activeDot={{ r: 4, fill: 'var(--accent)' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Form info */}
      {formMeta && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 24
        }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Form Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              ['Form Name', formMeta.name],
              ['UID', formMeta.uid],
              ['Status', formMeta.deployment_status],
              ['Version', formMeta.version_id || '—'],
              ['Sector', formMeta.settings?.sector || '—'],
              ['Country', formMeta.settings?.country_string || '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }} className="truncate">{v || '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
