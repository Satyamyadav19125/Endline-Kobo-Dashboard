import React, { useMemo, useState } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, LineChart, Line
} from 'recharts'

const COLORS = ['#00e5ff','#00e676','#ffab40','#ce93d8','#ff5252','#40c4ff','#69f0ae','#ffd740']

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background:'var(--bg-card)', border:'1px solid var(--border)',
      borderRadius:'var(--radius-sm)', padding:'10px 14px', fontSize:12
    }}>
      {label && <div style={{ color:'var(--text-muted)', marginBottom:4 }}>{label}</div>}
      {payload.map((p,i) => (
        <div key={i} style={{ color: p.color || 'var(--accent)', fontWeight:600 }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </div>
      ))}
    </div>
  )
}

function ChartCard({ title, children, span = 1 }) {
  return (
    <div style={{
      background:'var(--bg-card)', border:'1px solid var(--border)',
      borderRadius:'var(--radius-lg)', padding:24,
      gridColumn: span > 1 ? `span ${span}` : undefined
    }}>
      <h3 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:14, marginBottom:20, color:'var(--text-primary)' }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

// Build frequency chart for any field
function freqChart(submissions, field, top = 10) {
  const counts = {}
  submissions.forEach(s => {
    const v = s[field]
    if (v === undefined || v === null || v === '') return
    const key = String(v).substring(0, 40)
    counts[key] = (counts[key] || 0) + 1
  })
  return Object.entries(counts)
    .sort((a,b) => b[1]-a[1])
    .slice(0, top)
    .map(([name, value]) => ({ name, value }))
}

export default function Charts({ submissions }) {
  const [selectedField, setSelectedField] = useState(null)

  // Get all non-meta fields
  const fields = useMemo(() => {
    if (!submissions.length) return []
    return Object.keys(submissions[0])
      .filter(k => !k.startsWith('_') && k !== 'formhub' && k !== 'meta')
  }, [submissions])

  const activeField = selectedField || fields[0]

  const fieldFreq   = useMemo(() => activeField ? freqChart(submissions, activeField) : [], [submissions, activeField])
  const pieData     = useMemo(() => activeField ? freqChart(submissions, activeField, 8) : [], [submissions, activeField])

  // Multi-field bar: top 5 fields with most distinct values
  const multiField = useMemo(() => {
    return fields
      .map(f => {
        const vals = new Set(submissions.map(s => s[f]).filter(Boolean))
        return { field: f.substring(0,20), distinct: vals.size }
      })
      .sort((a,b) => b.distinct - a.distinct)
      .slice(0, 12)
  }, [submissions, fields])

  if (!submissions.length) return (
    <div style={{ padding:24, color:'var(--text-muted)', textAlign:'center', paddingTop:80 }}>
      No data yet — submit some forms first.
    </div>
  )

  return (
    <div style={{ padding:24 }}>
      <div style={{ marginBottom:20 }}>
        <h2 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:20, marginBottom:4 }}>Analytics</h2>
        <p style={{ color:'var(--text-secondary)', fontSize:13 }}>Visualise any field from your form</p>
      </div>

      {/* Field picker */}
      <div style={{
        background:'var(--bg-card)', border:'1px solid var(--border)',
        borderRadius:'var(--radius-lg)', padding:'16px 20px', marginBottom:24
      }}>
        <div style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>
          Explore a field
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {fields.map(f => (
            <button key={f} onClick={() => setSelectedField(f)}
              style={{
                padding:'5px 10px', borderRadius:'var(--radius-sm)', fontSize:12,
                background: activeField === f ? 'var(--accent-dim)' : 'var(--bg-hover)',
                border: activeField === f ? '1px solid var(--accent-mid)' : '1px solid var(--border)',
                color: activeField === f ? 'var(--accent)' : 'var(--text-secondary)',
                cursor:'pointer', fontFamily:'var(--font-mono)'
              }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        {/* Bar chart - field frequency */}
        <ChartCard title={`Responses: "${activeField}"`} span={2}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={fieldFreq} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fill:'var(--text-muted)', fontSize:10 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill:'var(--text-secondary)', fontSize:11 }}
                tickLine={false} axisLine={false} width={130} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={[0,4,4,0]}>
                {fieldFreq.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Pie chart */}
        <ChartCard title={`Distribution: "${activeField}"`}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                innerRadius={60} outerRadius={100} paddingAngle={3} label={({ name, percent }) =>
                  percent > 0.05 ? `${(percent*100).toFixed(0)}%` : ''}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={8}
                formatter={v => <span style={{ color:'var(--text-secondary)', fontSize:11 }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Distinct values per field */}
        <ChartCard title="Field Diversity (unique values per field)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={multiField}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="field" tick={{ fill:'var(--text-muted)', fontSize:9 }} tickLine={false} axisLine={false} angle={-30} textAnchor="end" height={50} />
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="distinct" radius={[4,4,0,0]}>
                {multiField.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
