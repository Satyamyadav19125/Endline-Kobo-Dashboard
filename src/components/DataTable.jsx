import React, { useMemo, useState } from 'react'
import { Search, Download, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react'
import * as XLSX from 'xlsx'

function downloadFile(data, filename, type) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  XLSX.writeFile(wb, filename, { bookType: type === 'csv' ? 'csv' : 'xlsx' })
}

export default function DataTable({ submissions }) {
  const [search,      setSearch]      = useState('')
  const [page,        setPage]        = useState(1)
  const [pageSize,    setPageSize]    = useState(25)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [hiddenCols,  setHiddenCols]  = useState(new Set(['formhub/uuid','meta/instanceID']))
  const [showColMenu, setShowColMenu] = useState(false)

  const allColumns = useMemo(() => {
    if (!submissions.length) return []
    return Object.keys(submissions[0])
  }, [submissions])

  const visibleCols = allColumns.filter(c => !hiddenCols.has(c))

  const filtered = useMemo(() => {
    if (!search.trim()) return submissions
    const q = search.toLowerCase()
    return submissions.filter(s =>
      visibleCols.some(c => String(s[c] ?? '').toLowerCase().includes(q))
    )
  }, [submissions, search, visibleCols])

  const pageCount = Math.ceil(filtered.length / pageSize)
  const paginated = filtered.slice((page-1)*pageSize, page*pageSize)

  const toggleRow = (id) => {
    setSelectedIds(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  const toggleAll = () => {
    if (selectedIds.size === paginated.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(paginated.map(s => s._id)))
  }

  const getDownloadData = (onlySelected) => {
    const rows = onlySelected && selectedIds.size
      ? submissions.filter(s => selectedIds.has(s._id))
      : filtered
    return rows.map(s => {
      const out = {}
      visibleCols.forEach(c => { out[c] = s[c] ?? '' })
      return out
    })
  }

  const toggleCol = (col) => {
    setHiddenCols(prev => {
      const n = new Set(prev)
      n.has(col) ? n.delete(col) : n.add(col)
      return n
    })
  }

  const cellVal = (v) => {
    if (v === null || v === undefined || v === '') return '—'
    if (Array.isArray(v)) return v.join(', ')
    if (typeof v === 'object') return JSON.stringify(v).substring(0, 60)
    return String(v).substring(0, 80)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Toolbar */}
      <div style={{
        padding:'16px 20px', background:'var(--bg-surface)',
        borderBottom:'1px solid var(--border)',
        display:'flex', alignItems:'center', gap:12, flexWrap:'wrap'
      }}>
        {/* Search */}
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search all fields…"
            style={{
              width:'100%', padding:'7px 10px 7px 30px',
              background:'var(--bg-card)', border:'1px solid var(--border)',
              borderRadius:'var(--radius-sm)', color:'var(--text-primary)',
              fontFamily:'var(--font-body)', fontSize:13,
              outline:'none'
            }} />
        </div>

        {/* Column toggle */}
        <div style={{ position:'relative' }}>
          <button onClick={() => setShowColMenu(p => !p)}
            style={{
              display:'flex', alignItems:'center', gap:6,
              padding:'7px 12px', background:'var(--bg-card)',
              border:'1px solid var(--border)', borderRadius:'var(--radius-sm)',
              color:'var(--text-secondary)', cursor:'pointer', fontSize:12
            }}>
            <SlidersHorizontal size={13} /> Columns ({visibleCols.length})
          </button>
          {showColMenu && (
            <div style={{
              position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:100,
              background:'var(--bg-card)', border:'1px solid var(--border)',
              borderRadius:'var(--radius-lg)', padding:'12px',
              maxHeight:300, overflowY:'auto', minWidth:220,
              boxShadow:'var(--shadow-lg)'
            }}>
              <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:8, textTransform:'uppercase' }}>Toggle columns</div>
              {allColumns.map(col => (
                <label key={col} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 2px', cursor:'pointer', fontSize:12 }}>
                  <input type="checkbox" checked={!hiddenCols.has(col)}
                    onChange={() => toggleCol(col)}
                    style={{ accentColor:'var(--accent)' }} />
                  <span className="truncate" style={{ color:'var(--text-secondary)', maxWidth:160 }}>{col}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Download buttons */}
        <div style={{ display:'flex', gap:6 }}>
          {[
            { label:'All (CSV)',  fn: () => downloadFile(getDownloadData(false), 'kobo_data.csv',  'csv')  },
            { label:'All (XLSX)', fn: () => downloadFile(getDownloadData(false), 'kobo_data.xlsx', 'xlsx') },
            { label:`Selected (${selectedIds.size})`, fn: () => downloadFile(getDownloadData(true), 'kobo_selected.xlsx', 'xlsx'), disabled: !selectedIds.size },
          ].map(({ label, fn, disabled }) => (
            <button key={label} onClick={fn} disabled={disabled}
              style={{
                display:'flex', alignItems:'center', gap:5,
                padding:'7px 10px', background: disabled ? 'var(--bg-surface)' : 'var(--accent-dim)',
                border:`1px solid ${disabled ? 'var(--border)' : 'var(--accent-mid)'}`,
                borderRadius:'var(--radius-sm)',
                color: disabled ? 'var(--text-muted)' : 'var(--accent)',
                cursor: disabled ? 'not-allowed' : 'pointer', fontSize:12
              }}>
              <Download size={12} /> {label}
            </button>
          ))}
        </div>

        <div style={{ fontSize:12, color:'var(--text-muted)', marginLeft:'auto' }}>
          {filtered.length.toLocaleString()} rows
        </div>
      </div>

      {/* Table */}
      <div style={{ flex:1, overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead style={{ position:'sticky', top:0, background:'var(--bg-surface)', zIndex:10 }}>
            <tr>
              <th style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', width:36 }}>
                <input type="checkbox"
                  checked={paginated.length > 0 && paginated.every(s => selectedIds.has(s._id))}
                  onChange={toggleAll}
                  style={{ accentColor:'var(--accent)', cursor:'pointer' }} />
              </th>
              {visibleCols.map(c => (
                <th key={c} style={{
                  padding:'10px 14px', borderBottom:'1px solid var(--border)',
                  textAlign:'left', fontWeight:600, whiteSpace:'nowrap',
                  color:'var(--text-secondary)', fontFamily:'var(--font-mono)',
                  fontSize:11, letterSpacing:'0.04em'
                }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((row, ri) => (
              <tr key={row._id}
                onClick={() => toggleRow(row._id)}
                style={{
                  background: selectedIds.has(row._id) ? 'var(--accent-dim)' : ri % 2 === 0 ? 'var(--bg-surface)' : 'transparent',
                  cursor:'pointer',
                  transition:'background 0.1s'
                }}>
                <td style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)' }}>
                  <input type="checkbox" checked={selectedIds.has(row._id)} onChange={() => {}}
                    style={{ accentColor:'var(--accent)', cursor:'pointer' }} />
                </td>
                {visibleCols.map(c => (
                  <td key={c} style={{
                    padding:'8px 14px', borderBottom:'1px solid var(--border)',
                    maxWidth:200, color: c.startsWith('_') ? 'var(--text-muted)' : 'var(--text-primary)',
                    fontFamily: c.startsWith('_') ? 'var(--font-mono)' : 'var(--font-body)',
                    fontSize: c.startsWith('_') ? 11 : 12
                  }} className="truncate">
                    {cellVal(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{
        padding:'12px 20px', background:'var(--bg-surface)',
        borderTop:'1px solid var(--border)',
        display:'flex', alignItems:'center', gap:12, justifyContent:'space-between'
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--text-muted)' }}>
          Rows per page:
          {[10,25,50,100].map(n => (
            <button key={n} onClick={() => { setPageSize(n); setPage(1) }}
              style={{
                padding:'3px 8px', borderRadius:'var(--radius-sm)', fontSize:12,
                background: pageSize === n ? 'var(--accent-dim)' : 'transparent',
                border: pageSize === n ? '1px solid var(--accent-mid)' : '1px solid transparent',
                color: pageSize === n ? 'var(--accent)' : 'var(--text-muted)',
                cursor:'pointer'
              }}>
              {n}
            </button>
          ))}
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:12, color:'var(--text-muted)' }}>
            Page {page} / {pageCount || 1}
          </span>
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
            style={{
              padding:'4px 6px', background:'var(--bg-card)',
              border:'1px solid var(--border)', borderRadius:'var(--radius-sm)',
              color: page === 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
              cursor: page === 1 ? 'not-allowed' : 'pointer'
            }}>
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => setPage(p => Math.min(pageCount, p+1))} disabled={page === pageCount || pageCount === 0}
            style={{
              padding:'4px 6px', background:'var(--bg-card)',
              border:'1px solid var(--border)', borderRadius:'var(--radius-sm)',
              color: page >= pageCount ? 'var(--text-muted)' : 'var(--text-secondary)',
              cursor: page >= pageCount ? 'not-allowed' : 'pointer'
            }}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
