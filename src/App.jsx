import { useState, useEffect, useCallback, useRef, useMemo } from "react";

const API_TOKEN = "cfda7c6ec2ad5c686e180747c4c005995710445a";
const FORM_UID  = "aagjSQnDRWQLs778Ri8AkH";
const HEADERS   = { Authorization: `Token ${API_TOKEN}`, Accept: "application/json" };
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmt = (n, d=1) => Number(n).toFixed(d);
const COLORS = ["#0ea5e9","#ef4444","#f59e0b","#10b981","#8b5cf6","#f97316","#ec4899","#84cc16"];
const SAT_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const STR_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

// Fields always hidden in expanded form view
const ALWAYS_HIDE = new Set([
  "formhub/uuid","meta/instanceID","meta/deprecatedID","meta/rootUuid",
  "start","end","today","deviceid","simserial","subscriberid","imei","__version__",
  "_xform_id_string","_uuid","_submitted_by","_tags","_notes","_validation_status",
  "_status","_geolocation","_submission_time",
]);
// Survey question types shown to user
const USER_TYPES = new Set([
  "text","integer","decimal","select_one","select_multiple","note",
  "geopoint","date","time","datetime","image","audio","video","file",
  "barcode","range","rating","rank","photo",
]);
// Types NEVER shown
const CALC_TYPES = new Set(["calculate","hidden","deviceid","start","end","today"]);

const DEFAULT_FLAG_RULES = [
  { field:"ANS/ANS_total_acres",          label:"Total Acres",        min:null, max:30,  enabled:true },
  { field:"ANS/ANS_wheat_yield_per_acre", label:"Yield/Acre (qtl)",   min:15,   max:28,  enabled:true },
  { field:"ANS/ANS_dap_kg_per_acre",      label:"DAP kg/Acre",        min:40,   max:70,  enabled:true },
  { field:"ANS/ANS_urea_total_bags",      label:"Urea Bags",          min:3,    max:5,   enabled:true },
  { field:"ANS/ANS_urea_bag_kg",          label:"Urea Bag Size (kg)", min:45,   max:50,  enabled:true },
];

function checkRule(sub, rule) {
  if (!rule.enabled) return null;
  const v = sub[rule.field];
  if (v === undefined || v === null || v === "") return null;
  const n = num(v);
  if (n <= 0) return null;
  if (rule.max !== null && rule.max !== "" && n > Number(rule.max)) return { label:rule.label, issue:`${n} > max ${rule.max}` };
  if (rule.min !== null && rule.min !== "" && n < Number(rule.min)) return { label:rule.label, issue:`${n} < min ${rule.min}` };
  return null;
}
const getFlags = (sub, rules) => rules.map(r => checkRule(sub, r)).filter(Boolean);

function ls(key, fb) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch { return fb; } }
function sw(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

// Build map: submissionKey -> { label, type, order } from survey metadata.
// KoboToolbox submission keys use $autoname for field parts (e.g. "ANS/ANS_total_acres")
// while f.name might be just "total_acres". We register BOTH paths so matching always works.
function buildFieldMap(fields) {
  const map = {}, stack = [];
  let order = 0;
  (function walk(arr) {
    for (const f of (arr||[])) {
      const type  = f.type||"";
      const gname = f.name || "";                 // group name (used in stack)
      const fauto = f.$autoname || f.name || "";  // $autoname = what appears in submission keys
      const fname = f.name || "";                 // plain name (fallback)

      if (type==="begin_group"||type==="begin_repeat") { stack.push(gname); }
      else if (type==="end_group"||type==="end_repeat") { stack.pop(); }
      else if (fauto && !CALC_TYPES.has(type) && USER_TYPES.has(type)) {
        const lbl = Array.isArray(f.label) ? (f.label[0]||fauto) : (f.label||fauto);
        const ord = order++;
        // Primary: path using $autoname — this is what appears in actual submission JSON
        const p1 = stack.length ? `${stack.join("/")}/${fauto}` : fauto;
        map[p1] = { label:lbl, type, order:ord };
        // Secondary: path using plain name (in case $autoname not present or differs)
        if (fname && fname !== fauto) {
          const p2 = stack.length ? `${stack.join("/")}/${fname}` : fname;
          if (!map[p2]) map[p2] = { label:lbl, type, order:ord };
        }
      }
      if (f.children) walk(f.children);
    }
  })(fields);
  return map;
}

// Return clean, ordered fields for display — exactly what user fills.
// Fallback (no fieldMap): hide all known internal/meta/calculated keys.
const INTERNAL_PATTERNS = [
  /^_/, /^formhub\//, /^meta\//, /^start$/, /^end$/, /^today$/,
  /^deviceid$/, /^simserial$/, /^subscriberid$/, /^imei$/, /^__version__$/,
  /calculate/i, /\/calc_/, /_calc$/, /\/_/,
];
function displayFields(sub, fieldMap, choiceMap) {
  const hasMap = Object.keys(fieldMap).length > 0;
  let entries = Object.entries(sub).filter(([k, v]) => {
    if (ALWAYS_HIDE.has(k) || k.startsWith("_")) return false;
    if (v === null || v === undefined || v === "") return false;
    if (hasMap) return k in fieldMap;
    // Fallback: hide anything matching internal patterns
    if (INTERNAL_PATTERNS.some(p => p.test(k))) return false;
    return true;
  });
  if (hasMap) entries.sort(([a],[b]) => (fieldMap[a]?.order??999) - (fieldMap[b]?.order??999));
  return entries.map(([k, v]) => {
    const raw = String(v);
    // Resolve choice labels — handle space-separated multi-select values
    const resolved = raw.split(" ").map(p => choiceMap[p]||p).join(", ");
    return {
      key: k,
      label: fieldMap[k]?.label || k.split("/").pop().replace(/_/g," "),
      value: resolved !== raw ? resolved : (choiceMap[raw] || raw),
    };
  });
}

// ─── Mini Map (Leaflet) ─────────────────────────────────────────────────────
function MiniMap({ lat, lng, leafletOK }) {
  const ref = useRef(null), mref = useRef(null);
  useEffect(() => {
    if (!ref.current || !window.L) return;
    // Destroy previous instance if coords changed
    if (mref.current) { mref.current.remove(); mref.current = null; }
    const L = window.L;
    const m = L.map(ref.current, {
      zoomControl:false, attributionControl:false,
      dragging:false, scrollWheelZoom:false,
      doubleClickZoom:false, touchZoom:false,
    }).setView([lat,lng], 14);
    L.tileLayer(STR_URL).addTo(m);
    const ico = L.divIcon({ className:"",
      html:`<div style="width:14px;height:14px;border-radius:50%;background:#ef4444;border:2px solid #fff;box-shadow:0 2px 8px #0006"></div>`,
      iconSize:[14,14], iconAnchor:[7,7] });
    L.marker([lat,lng],{icon:ico}).addTo(m);
    mref.current = m;
    return () => { if (mref.current) { mref.current.remove(); mref.current = null; } };
  // leafletOK as dep ensures map renders if Leaflet loads after modal opens
  }, [lat, lng, leafletOK]);
  return (
    <div style={{ position:"relative", borderRadius:8, overflow:"hidden", marginBottom:8, border:"1px solid #e2e8f0" }}>
      <div ref={ref} style={{ height:110, width:"100%" }} />
      <a href={`https://maps.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer"
        style={{ position:"absolute",bottom:5,right:5,background:"rgba(0,0,0,.7)",color:"#fff",fontSize:10,padding:"2px 8px",borderRadius:4,textDecoration:"none",fontWeight:700 }}>
        Open Maps ↗
      </a>
    </div>
  );
}

// ─── Shared Submission Modal ────────────────────────────────────────────────
function SubModal({ sub, onClose, fieldMap, choiceMap, flagRules, vilLabel,
  dismissed, manualFlags, flagDrafts, dismissDrafts,
  onDismiss, onUndismiss, onAddFlag, onRemoveFlag,
  onFlagDraftChange, onDismissDraftChange,
  allowEdit, isMobile, D, theme, leafletOK }) {

  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const sid = String(sub._id);
  const autoFlags = getFlags(sub, flagRules);
  const isDismissed = dismissed.includes(sid);
  const manualNote = manualFlags[sid] || null;
  // GPS: valid only if both lat & lng are real non-zero numbers
  const gps = sub._geolocation;
  const lat = Array.isArray(gps) ? parseFloat(gps[0]) : NaN;
  const lng = Array.isArray(gps) ? parseFloat(gps[1]) : NaN;
  const hasGPS = !isNaN(lat) && !isNaN(lng) && (Math.abs(lat) > 0.001 || Math.abs(lng) > 0.001);
  const fields = useMemo(() => displayFields(sub, fieldMap, choiceMap), [sub, fieldMap, choiceMap]);

  const handleSave = async () => {
    if (!Object.keys(editData).length) return;
    setSaving(true); setSaveMsg("");
    try {
      const r = await fetch(`/api/kobo?path=${encodeURIComponent(`/api/v2/assets/${FORM_UID}/data/${sub._id}/`)}`,
        { method:"PATCH", headers:{...HEADERS,"Content-Type":"application/json"}, body:JSON.stringify(editData) });
      if (!r.ok) throw new Error(`${r.status}`);
      setSaveMsg("✅ Saved to KoboToolbox!");
      setTimeout(() => { setSaveMsg(""); setEditMode(false); setEditData({}); }, 2000);
    } catch(e) { setSaveMsg(`❌ ${e.message}`); } finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:1000,
      display:"flex",alignItems:isMobile?"flex-end":"center",justifyContent:"center",padding:isMobile?0:16 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:D.card,border:`1px solid ${D.bdr}`,
        borderRadius:isMobile?"16px 16px 0 0":"12px",width:"100%",maxWidth:560,
        maxHeight:isMobile?"90vh":"86vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 40px #000a" }}>

        {/* Header */}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"12px 16px",borderBottom:`1px solid ${D.bdr}`,flexShrink:0,background:D.card,
          borderRadius:isMobile?"16px 16px 0 0":"12px 12px 0 0" }}>
          <div>
            <div style={{ color:"#0ea5e9",fontWeight:800,fontSize:14 }}>
              {(autoFlags.length>0||manualNote)&&!isDismissed&&"🚩 "}
              {sub["ANS/ANS_farm_id"]||`#${sub._id}`}
            </div>
            <div style={{ color:D.muted,fontSize:10 }}>
              {vilLabel(sub["ANS/ANS_village"])} · {sub["surveyor_info/surveyor_name"]||""}
            </div>
          </div>
          <div style={{ display:"flex",gap:6,alignItems:"center" }}>
            {allowEdit && !editMode && <button onClick={()=>setEditMode(true)} className="btn"
              style={{ borderColor:"#0ea5e9",background:"#0ea5e922",color:"#0ea5e9" }}>✏️ Edit</button>}
            <button onClick={onClose} style={{ background:theme==="light"?"#f1f5f9":"#1e293b",
              border:"none",color:D.text,cursor:"pointer",fontSize:16,width:28,height:28,borderRadius:8 }}>✕</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY:"auto",flex:1,WebkitOverflowScrolling:"touch" }}>

          {/* Mini map — shown whenever GPS available, in every tab */}
          {hasGPS && (
            <div style={{ padding:"10px 16px 0" }}>
              <MiniMap lat={lat} lng={lng} leafletOK={leafletOK}/>
            </div>
          )}

          {/* Auto-flag panel */}
          {autoFlags.length > 0 && (
            <div style={{ margin:"10px 16px 0",background:isDismissed?"#10b98118":"#ef444418",
              border:`1px solid ${isDismissed?"#10b98144":"#ef444444"}`,borderRadius:8,padding:"8px 12px" }}>
              <div style={{ fontSize:11,fontWeight:700,color:isDismissed?"#10b981":"#ef4444",marginBottom:4 }}>
                {isDismissed ? "✓ Reviewed — Marked Normal" : "🚩 Issues Detected:"}
              </div>
              {autoFlags.map((f,i) => <div key={i} style={{ fontSize:11,color:isDismissed?"#10b981":"#ef4444" }}>• {f.label}: <b>{f.issue}</b></div>)}
              {/* Always show dismiss reason if it exists (whether dismissed or not) */}
              {dismissDrafts[sid] && (
                <div style={{ fontSize:11,color:isDismissed?"#10b981":"#6b7280",marginTop:4,fontStyle:"italic" }}>
                  {isDismissed ? "Reason saved: " : "Draft reason: "}{dismissDrafts[sid]}
                </div>
              )}
            </div>
          )}

          {/* Manual flag note — always visible when set */}
          {manualNote && (
            <div style={{ margin:"8px 16px 0",background:"#f59e0b18",border:"1px solid #f59e0b44",borderRadius:8,padding:"8px 12px" }}>
              <div style={{ fontSize:11,color:"#f59e0b",fontWeight:700 }}>👁 Your note: {manualNote}</div>
            </div>
          )}

          {/* Action bar */}
          <div style={{ padding:"10px 16px",display:"flex",gap:6,flexWrap:"wrap",
            borderBottom:`1px solid ${D.bdr}`,borderTop:`1px solid ${D.bdr}`,marginTop:10 }}>

            {/* Dismiss / Undo row */}
            {autoFlags.length > 0 && (isDismissed ? (
              <button onClick={() => onUndismiss(sid)} className="btn"
                style={{ borderColor:"#f59e0b",background:"#f59e0b22",color:"#f59e0b" }}>↩ Undo Review</button>
            ) : (
              <div style={{ display:"flex",gap:4,flex:1,flexWrap:"wrap",alignItems:"center",minWidth:"100%" }}>
                <input value={dismissDrafts[sid]||""} onChange={e => onDismissDraftChange(sid, e.target.value)}
                  placeholder="Dismiss reason (optional — auto-saved as you type)"
                  className="inp" style={{ flex:1,minWidth:120,padding:"5px 10px",fontSize:11 }}/>
                <button onClick={() => onDismiss(sid)} className="btn"
                  style={{ borderColor:"#10b981",background:"#10b98122",color:"#10b981",flexShrink:0 }}>✓ Mark Normal</button>
              </div>
            ))}

            {/* Manual flag row */}
            {manualNote ? (
              <button onClick={() => onRemoveFlag(sid)} className="btn"
                style={{ borderColor:"#10b981",background:"#10b98122",color:"#10b981" }}>✓ Remove My Flag</button>
            ) : (
              <div style={{ display:"flex",gap:4,flex:1,flexWrap:"wrap",alignItems:"center",minWidth:"100%" }}>
                <input value={flagDrafts[sid]||""} onChange={e => onFlagDraftChange(sid, e.target.value)}
                  placeholder="Flag note (optional — auto-saved as you type)"
                  className="inp" style={{ flex:1,minWidth:120,padding:"5px 10px",fontSize:11 }}/>
                <button onClick={() => onAddFlag(sid, flagDrafts[sid]||"")} className="btn"
                  style={{ borderColor:"#ef4444",background:"#ef444422",color:"#ef4444",flexShrink:0 }}>🚩 Flag</button>
              </div>
            )}
          </div>

          {/* Edit save bar */}
          {editMode && (
            <div style={{ padding:"8px 16px",borderBottom:`1px solid ${D.bdr}`,display:"flex",
              gap:6,alignItems:"center",flexWrap:"wrap",background:theme==="light"?"#eff6ff":"#0a1628" }}>
              <span style={{ fontSize:11,color:"#0ea5e9",fontWeight:700,flex:1 }}>✏️ Edit mode — saves directly to KoboToolbox</span>
              {Object.keys(editData).length > 0 && (
                <button onClick={handleSave} disabled={saving} className="btn"
                  style={{ borderColor:"#10b981",background:"#10b98122",color:"#10b981" }}>
                  {saving?"Saving…":"💾 Save"}
                </button>
              )}
              <button onClick={() => { setEditMode(false); setEditData({}); }} className="btn"
                style={{ borderColor:D.bdr,color:D.muted }}>Cancel</button>
              {saveMsg && <span style={{ fontSize:11,fontWeight:700,color:saveMsg.startsWith("✅")?"#10b981":"#ef4444" }}>{saveMsg}</span>}
            </div>
          )}

          {/* Form fields — clean, ordered, exactly as user filled */}
          <div style={{ padding:"10px 16px 20px" }}>
            {fields.length === 0 && (
              <div style={{ color:D.muted,textAlign:"center",padding:24,fontSize:12 }}>No form data available</div>
            )}
            {fields.map(({ key, label, value }) => (
              <div key={key} style={{ display:"flex",gap:10,padding:"7px 0",
                borderBottom:`1px solid ${D.bdr}22`,alignItems:"flex-start" }}>
                <span style={{ color:D.muted,fontSize:10,width:130,flexShrink:0,
                  textTransform:"capitalize",lineHeight:1.4,wordBreak:"break-word",paddingTop:1 }}>
                  {label}
                </span>
                {editMode ? (
                  <input value={editData[key]!==undefined ? editData[key] : value}
                    onChange={e => setEditData(p => ({...p,[key]:e.target.value}))}
                    style={{ flex:1,fontSize:12,padding:"3px 6px",background:D.inp,
                      border:"1px solid #0ea5e944",borderRadius:4,color:D.text }}/>
                ) : (
                  <span style={{ color:D.text,fontSize:12,fontWeight:500,flex:1,
                    wordBreak:"break-word",lineHeight:1.5 }}>{value}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Small reusable components ──────────────────────────────────────────────
function HBar({data,xKey,yKey,color="#0ea5e9",theme,maxItems=20}){if(!data?.length)return null;const rows=data.slice(0,maxItems);const max=Math.max(...rows.map(d=>num(d[yKey])),1);const tc=theme==="light"?"#374151":"#e2e8f0";const bg=theme==="light"?"#e5e7eb":"#1e293b";const lw=Math.min(Math.max(Math.max(...rows.map(d=>String(d[xKey]).length))*7+8,100),180);return(<div style={{display:"flex",flexDirection:"column",gap:6}}>{rows.map((d,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:10}}><span style={{width:lw,fontSize:12,color:tc,flexShrink:0,textAlign:"right",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={String(d[xKey])}>{d[xKey]}</span><div style={{flex:1,background:bg,borderRadius:4,height:26,overflow:"hidden",position:"relative",minWidth:60}}><div style={{width:`${(num(d[yKey])/max)*100}%`,height:"100%",background:typeof color==="function"?color(i):color,borderRadius:4,transition:"width .5s"}}/><span style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",fontSize:12,fontWeight:700,color:theme==="light"?"#1e293b":"#f1f5f9",textShadow:theme==="light"?"0 0 3px #fff":"0 0 4px #000"}}>{typeof d[yKey]==="number"?fmt(d[yKey],1):d[yKey]}</span></div></div>))}</div>);}
function PieC({data,size=150}){if(!data?.length)return null;const total=data.reduce((s,d)=>s+d.value,0);if(!total)return null;let angle=-Math.PI/2;const r=size/2-6,cx=size/2,cy=size/2;const sl=data.map((d,i)=>{const sw=(d.value/total)*2*Math.PI;const x1=cx+r*Math.cos(angle),y1=cy+r*Math.sin(angle);angle+=sw;const x2=cx+r*Math.cos(angle),y2=cy+r*Math.sin(angle);return{path:`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${sw>Math.PI?1:0},1 ${x2},${y2} Z`,color:COLORS[i%COLORS.length],label:d.label,value:d.value};});return(<div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}><svg width={size} height={size} style={{flexShrink:0}}>{sl.map((s,i)=><path key={i} d={s.path} fill={s.color} opacity="0.9"/>)}</svg><div style={{display:"flex",flexDirection:"column",gap:5,flex:1,minWidth:110}}>{sl.map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}><div style={{width:10,height:10,borderRadius:2,background:s.color,flexShrink:0}}/><span>{s.label}: <b>{s.value}</b></span></div>))}</div></div>);}

function LeafletMap({subs,selId,onSel,layer,visible,rules}){const ref=useRef(null),mref=useRef(null),markers=useRef([]),tref=useRef(null);useEffect(()=>{if(!ref.current||mref.current)return;const L=window.L;if(!L)return;mref.current=L.map(ref.current,{zoomControl:true,tap:true}).setView([30.38,76.38],11);tref.current=L.tileLayer(SAT_URL,{attribution:"© Esri",maxZoom:19}).addTo(mref.current);setTimeout(()=>{if(mref.current)mref.current.invalidateSize();},300);},[]);useEffect(()=>{if(visible&&mref.current)setTimeout(()=>mref.current.invalidateSize(),200);},[visible]);useEffect(()=>{const L=window.L;if(!L||!mref.current||!tref.current)return;tref.current.remove();tref.current=L.tileLayer(layer==="satellite"?SAT_URL:STR_URL,{attribution:layer==="satellite"?"© Esri":"© OSM",maxZoom:19}).addTo(mref.current);},[layer]);useEffect(()=>{const L=window.L;if(!L||!mref.current)return;markers.current.forEach(m=>m.remove());markers.current=[];subs.filter(s=>s._geolocation?.length>=2&&s._geolocation[0]).forEach(s=>{const[lat,lng]=s._geolocation,isSel=s._id===selId;const fl=getFlags(s,rules);const col=isSel?"#f59e0b":fl.length?"#ef4444":"#0ea5e9";const ico=L.divIcon({className:"",html:`<div style="width:${isSel?20:12}px;height:${isSel?20:12}px;border-radius:50%;background:${col};border:2px solid #fff;box-shadow:0 2px 8px #0006"></div>`,iconSize:[isSel?20:12,isSel?20:12],iconAnchor:[isSel?10:6,isSel?10:6]});const m=L.marker([lat,lng],{icon:ico}).addTo(mref.current);m.on("click",()=>onSel(s._id===selId?null:s._id));markers.current.push(m);});if(selId){const sel=subs.find(s=>s._id===selId);if(sel?._geolocation)mref.current.flyTo(sel._geolocation,14,{duration:1});}},[subs,selId,rules]);return<div ref={ref} style={{height:"100%",width:"100%",minHeight:300}}/>;}

function DlBtn({rows,fn,theme}){const[o,sO]=useState(false);const ref=useRef(null);useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))sO(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);const dlCSV=()=>{if(!rows.length)return;const k=Object.keys(rows[0]);const c=[k.join(","),...rows.map(r=>k.map(col=>`"${String(r[col]??"").replace(/"/g,'""')}"`).join(","))].join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([c],{type:"text/csv"}));a.download=(fn||"data")+".csv";a.click();sO(false);};const dlX=()=>{const X=window.XLSX;if(!X)return;const ws=X.utils.json_to_sheet(rows);const wb=X.utils.book_new();X.utils.book_append_sheet(wb,ws,"Data");X.writeFile(wb,(fn||"data")+".xlsx");sO(false);};const bg=theme==="light"?"#fff":"#0f172a",bd=theme==="light"?"#e2e8f0":"#1e293b",tc=theme==="light"?"#1e293b":"#e2e8f0";return(<div ref={ref} style={{position:"relative"}}><button onClick={()=>sO(x=>!x)} style={{background:theme==="light"?"#eff6ff":"#0f172a",border:"1px solid #0ea5e944",color:"#0ea5e9",padding:"5px 10px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:600}}>⬇ {rows.length}</button>{o&&<div style={{position:"absolute",right:0,top:"calc(100% + 4px)",background:bg,border:`1px solid ${bd}`,borderRadius:8,boxShadow:"0 4px 20px #0004",zIndex:999,minWidth:100}}>{[["CSV",dlCSV],["XLSX",dlX]].map(([l,h])=><button key={l} onClick={h} style={{width:"100%",background:"none",border:"none",padding:"8px 14px",cursor:"pointer",color:tc,fontSize:12,fontWeight:600,borderBottom:`1px solid ${bd}`,textAlign:"left"}}>{l}</button>)}</div>}</div>);}
function Stat({label,value,unit="",color,icon,theme}){const bg=theme==="light"?"#fff":"#0f172a",lc=theme==="light"?"#6b7280":"#64748b";return(<div style={{background:bg,border:`1px solid ${color}33`,borderRadius:10,padding:"12px 16px",display:"flex",flexDirection:"column",gap:4,flex:1,minWidth:110}}><span style={{fontSize:10,color:lc,letterSpacing:1,textTransform:"uppercase"}}>{icon} {label}</span><span style={{fontSize:22,fontWeight:700,color,fontFamily:"monospace"}}>{value}<span style={{fontSize:11,color:lc,marginLeft:3}}>{unit}</span></span></div>);}
function Card({children,title,theme,extra,noPad}){const bg=theme==="light"?"#fff":"#0f172a",bor=theme==="light"?"#e2e8f0":"#1e293b",tc=theme==="light"?"#6b7280":"#94a3b8";return(<div style={{background:bg,border:`1px solid ${bor}`,borderRadius:10,padding:noPad?0:20,overflow:"hidden"}}>{(title||extra)&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:title?14:0,padding:noPad?"14px 18px 10px":"0",flexWrap:"wrap",gap:8}}>{title&&<h3 style={{fontSize:12,color:tc,margin:0,textTransform:"uppercase",letterSpacing:1,fontWeight:700}}>{title}</h3>}{extra}</div>}<div style={{padding:noPad?"0 18px 18px":0}}>{children}</div></div>);}
function AddRule({fields,onAdd,D}){const[f,sF]=useState("");const[l,sL]=useState("");const[mn,sMn]=useState("");const[mx,sMx]=useState("");const go=()=>{if(!f)return;onAdd({field:f,label:l||f.split("/").pop().replace(/_/g," "),min:mn===""?null:Number(mn),max:mx===""?null:Number(mx),enabled:true});sF("");sL("");sMn("");sMx("");};return(<div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"flex-end"}}><div style={{flex:2,minWidth:160}}><div style={{fontSize:10,color:D.muted,marginBottom:2}}>Field</div><select value={f} onChange={e=>{sF(e.target.value);if(!l)sL(e.target.value.split("/").pop().replace(/_/g," "));}} style={{width:"100%",padding:"5px 8px",fontSize:11,background:D.inp,border:`1px solid ${D.bdr}`,borderRadius:6,color:D.text}}><option value="">Select…</option>{fields.map(x=><option key={x} value={x}>{x}</option>)}</select></div><div style={{flex:1,minWidth:90}}><div style={{fontSize:10,color:D.muted,marginBottom:2}}>Label</div><input value={l} onChange={e=>sL(e.target.value)} style={{width:"100%",padding:"5px 8px",fontSize:11,background:D.inp,border:`1px solid ${D.bdr}`,borderRadius:6,color:D.text}} placeholder="Display name"/></div><div style={{width:64}}><div style={{fontSize:10,color:D.muted,marginBottom:2}}>Min</div><input type="number" value={mn} onChange={e=>sMn(e.target.value)} style={{width:"100%",padding:"5px 6px",fontSize:11,background:D.inp,border:`1px solid ${D.bdr}`,borderRadius:4,color:D.text}} placeholder="—"/></div><div style={{width:64}}><div style={{fontSize:10,color:D.muted,marginBottom:2}}>Max</div><input type="number" value={mx} onChange={e=>sMx(e.target.value)} style={{width:"100%",padding:"5px 6px",fontSize:11,background:D.inp,border:`1px solid ${D.bdr}`,borderRadius:4,color:D.text}} placeholder="—"/></div><button onClick={go} disabled={!f} style={{padding:"5px 14px",borderRadius:6,border:"1px solid #10b981",background:"#10b98122",color:"#10b981",cursor:f?"pointer":"not-allowed",fontSize:11,fontWeight:700,opacity:f?1:.5}}>+ Add</button></div>);}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN APP
// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [subs, setSubs]               = useState([]);
  const [formChoices, setFC]          = useState([]);
  const [allChoices, setAC]           = useState([]);
  const [choiceMap, setCM]            = useState({});
  const [formFields, setFF]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [tab, setTab]                 = useState("overview");
  const [selId, setSelId]             = useState(null);
  const [search, setSearch]           = useState("");
  const [visCols, setVisCols]         = useState(null);
  const [showColPick, setShowColPick] = useState(false);
  const [selRows, setSelRows]         = useState([]);
  const [leafletOK, setLeafletOK]     = useState(false);
  const [theme, setTheme]             = useState("light");
  const [pendFil, setPendFil]         = useState("all");
  const [pendVil, setPendVil]         = useState("all");
  const [pendSort, setPendSort]       = useState("newest");
  const [mapLayer, setMapLayer]       = useState("satellite");
  const [openSub, setOpenSub]         = useState(null); // any expanded submission
  const [mapSearch, setMapSearch]     = useState("");
  const [dupOnly, setDupOnly]         = useState(false);
  const [mobile, setMobile]           = useState(typeof window!=="undefined"&&window.innerWidth<640);
  const [flagSearch, setFlagSearch]   = useState("");
  const [pendSearch, setPendSearch]   = useState("");
  const [tblFilter, setTblFilter]     = useState("all");
  const [showMapList, setShowMapList] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [flagRules, setFlagRules]     = useState(() => ls("kobo_rules", DEFAULT_FLAG_RULES));

  // Persistent per-submission notes — survive tab switches + page refresh
  const [dismissed,  setDismissed]  = useState(() => ls("kobo_dismissed", []));
  const [manualFlags,setManFlags]   = useState(() => ls("kobo_manual_flags", {}));
  const [flagDrafts, setFlagDrafts] = useState(() => ls("kobo_flag_drafts", {}));
  const [disDrafts,  setDisDrafts]  = useState(() => ls("kobo_dis_drafts",  {}));

  const setFlagDraft = (id, v) => { const u={...flagDrafts,[id]:v}; setFlagDrafts(u); sw("kobo_flag_drafts",u); };
  const setDisDraft  = (id, v) => { const u={...disDrafts, [id]:v}; setDisDrafts(u);  sw("kobo_dis_drafts",  u); };

  const doDismiss = (id) => {
    const u = [...dismissed, id]; setDismissed(u); sw("kobo_dismissed", u);
    // keep dismiss draft as the stored reason (don't clear it)
  };
  const doUndismiss = (id) => { const u=dismissed.filter(x=>x!==id); setDismissed(u); sw("kobo_dismissed",u); };
  const doAddFlag   = (id, note) => {
    const u = {...manualFlags,[id]:note||"Flagged"}; setManFlags(u); sw("kobo_manual_flags",u);
    // clear flag draft after it's been committed
    const d={...flagDrafts}; delete d[id]; setFlagDrafts(d); sw("kobo_flag_drafts",d);
  };
  const doRemoveFlag = (id) => { const u={...manualFlags}; delete u[id]; setManFlags(u); sw("kobo_manual_flags",u); };

  useEffect(()=>{ const fn=()=>setMobile(window.innerWidth<640); window.addEventListener("resize",fn); return()=>window.removeEventListener("resize",fn); },[]);
  useEffect(()=>{ document.documentElement.style.cssText="overflow-y:scroll;overflow-x:hidden;height:auto;"; document.body.style.cssText="overflow-y:scroll;overflow-x:hidden;height:auto;margin:0;padding:0;"; const r=document.getElementById("root"); if(r)r.style.cssText="width:100%;height:auto;overflow:visible;"; },[]);
  useEffect(()=>{
    if(!window.L){const l=document.createElement("link");l.rel="stylesheet";l.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";document.head.appendChild(l);const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";s.onload=()=>setLeafletOK(true);document.head.appendChild(s);}else setLeafletOK(true);
    if(!window.XLSX){const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";document.head.appendChild(s);}
  },[]);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const mr = await fetch(`/api/kobo?path=${encodeURIComponent(`/api/v2/assets/${FORM_UID}/?format=json`)}`,{headers:HEADERS,cache:"no-store"});
      if(!mr.ok) throw new Error(`Meta ${mr.status}`);
      const meta = await mr.json();
      const ac = meta?.content?.choices||[];
      const sf = meta?.content?.survey||[];
      setFF(sf);
      const lm={}; ac.forEach(c=>{if(c.name){const l=Array.isArray(c.label)?c.label[0]:c.label; if(l)lm[c.name]=l;}}); setCM(lm);
      setAC(ac); setFC(ac.filter(c=>String(c.name||"").match(/PLT_\d+/)));
      let all=[], url=`/api/kobo?path=${encodeURIComponent(`/api/v2/assets/${FORM_UID}/data/?format=json&limit=300&start=0&ordering=-_submission_time`)}`;
      while(url){ const r=await fetch(url,{headers:HEADERS,cache:"no-store"}); if(!r.ok)throw new Error(`Data ${r.status}`); const j=await r.json(); all=[...all,...(j.results||[])]; url=j.next?`/api/kobo?path=${encodeURIComponent(j.next.replace("https://kf.kobotoolbox.org",""))}`:null; }
      setSubs(all);
      if(all.length&&!visCols){ const want=["_id","ANS/ANS_farm_id","ANS/ANS_village","surveyor_info/surveyor_name","ANS/ANS_total_acres","ANS/ANS_wheat_yield_per_acre","date_time/survey_date"]; setVisCols(want.filter(c=>c in all[0])); }
    } catch(e){ setError(e.message); } finally{ setLoading(false); }
  },[]);
  useEffect(()=>{ fetchData(); },[fetchData]);

  const fieldMap = useMemo(()=>buildFieldMap(formFields),[formFields]);

  // Village name resolution
  const p2v = useMemo(()=>{
    const m={};
    subs.forEach(r=>{const fid=r["ANS/ANS_farm_id"]||r["location/select_farm_id"]||"";const p=fid.split("_")[0];const v=r["ANS/ANS_village"];if(p&&v){const res=choiceMap[v]||v;if(res.length>2)m[p]=res;}});
    allChoices.forEach(c=>{const n=c.name||"";const l=Array.isArray(c.label)?c.label[0]:c.label;if(l&&n&&!n.match(/PLT_\d+/)&&n.length<=4&&!m[n]&&l.length>2){m[n]=l;m[n.toUpperCase()]=l;}});
    formChoices.forEach(c=>{const p=(c.name||"").split("_")[0];const fv=c.filter_value;if(p&&fv&&!m[p]){const r=choiceMap[fv]||choiceMap[fv.toLowerCase()]||null;if(r&&r.length>2)m[p]=r;}});
    return m;
  },[subs,formChoices,allChoices,choiceMap]);

  const vilLabel = useCallback((v)=>{
    if(!v||v==="-")return"-";
    const r=choiceMap[v]||choiceMap[v.toLowerCase()]||p2v[v]||p2v[v.toUpperCase()]||null;
    return r&&r.length>2?r:(r||v);
  },[choiceMap,p2v]);

  // Stats
  const total=subs.length, withGPS=subs.filter(s=>s._geolocation?.[0]).length;
  const avgAcres=total?fmt(subs.reduce((s,r)=>s+num(r["ANS/ANS_total_acres"]),0)/total):0;
  const avgYield=total?fmt(subs.reduce((s,r)=>s+num(r["ANS/ANS_wheat_yield_per_acre"]),0)/total):0;
  const gc=(key)=>Object.entries(subs.reduce((a,r)=>{const k=vilLabel(r[key]||"?");a[k]=(a[k]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).map(([l,v])=>({label:l,value:v}));
  const ga=(key,vk)=>Object.entries(subs.reduce((a,r)=>{const k=vilLabel(r[key]||"?");if(!a[k])a[k]={t:0,n:0};a[k].t+=num(r[vk]);a[k].n++;return a;},{})).map(([v,d])=>({village:v,avg:+(d.t/d.n).toFixed(1)})).sort((a,b)=>b.avg-a.avg);
  const vilData=gc("ANS/ANS_village");
  const cropMap={}; subs.forEach(r=>{(r["ANS/ANS_crops_grown"]||"Unknown").split(" ").forEach(c=>{const cl=choiceMap[c]||c;cropMap[cl]=(cropMap[cl]||0)+1;});}); const cropData=Object.entries(cropMap).sort((a,b)=>b[1]-a[1]).map(([l,v])=>({label:l,value:v}));
  const srvData=gc("surveyor_info/surveyor_name");
  const strawM={}; subs.forEach(r=>{(r["ANS/ANS_wheat_straw"]||r["wheat_straw_group/straw_treatment"]||"Unknown").split(" ").forEach(t=>{const tl=choiceMap[t]||t;strawM[tl]=(strawM[tl]||0)+1;});}); const strawData=Object.entries(strawM).map(([l,v])=>({label:l,value:v}));
  const yieldV=ga("ANS/ANS_village","ANS/ANS_wheat_yield_per_acre").slice(0,12);
  const allCols=subs.length?Object.keys(subs[0]):[];
  const dispCols=visCols||allCols.slice(0,10);
  const fIdC={}; subs.forEach(r=>{const id=r["ANS/ANS_farm_id"]||r["location/select_farm_id"];if(id)fIdC[id]=(fIdC[id]||0)+1;}); const dupSet=new Set(Object.keys(fIdC).filter(k=>fIdC[k]>1)); const dupCount=dupSet.size;

  const augSubs = useMemo(()=>subs.map(s=>{
    const af=getFlags(s,flagRules), sid=String(s._id);
    const isDis=dismissed.includes(sid), mf=manualFlags[sid]||null;
    return{...s,_af:af,_dis:isDis,_mf:mf,_flag:(!isDis&&af.length>0)||!!mf};
  }),[subs,flagRules,dismissed,manualFlags]);

  const totalFlagged=augSubs.filter(s=>s._flag).length, totalClean=total-totalFlagged;

  const mapSubs=subs.filter(s=>!mapSearch||Object.values(s).some(v=>String(v).toLowerCase().includes(mapSearch.toLowerCase())));
  const mappedSubs=mapSubs.filter(s=>s._geolocation?.length>=2&&s._geolocation[0]);

  const filtered=useMemo(()=>augSubs.filter(r=>{
    if(dupOnly){const id=r["ANS/ANS_farm_id"]||r["location/select_farm_id"];if(!dupSet.has(id))return false;}
    if(tblFilter==="flagged"&&!r._flag)return false;
    if(tblFilter==="clean"&&r._flag)return false;
    return!search||Object.values(r).some(v=>typeof v==="string"&&v.toLowerCase().includes(search.toLowerCase()));
  }).sort((a,b)=>new Date(b._submission_time||0)-new Date(a._submission_time||0)),[augSubs,dupOnly,dupSet,tblFilter,search]);

  const submittedIds=useMemo(()=>{const s=new Set();subs.forEach(r=>{const id=r["location/select_farm_id"]||r["ANS/ANS_farm_id"]||"";if(id)s.add(id);});return s;},[subs]);
  const allFarms=useMemo(()=>{
    if(!formChoices.length)return subs.map(r=>({farm_id:r["ANS/ANS_farm_id"]||"",village:vilLabel(r["ANS/ANS_village"]),submitted:true,surveyor:r["surveyor_info/surveyor_name"]||"",date:(r["date_time/survey_date"]||r._submission_time||"").slice(0,10)}));
    return formChoices.map(c=>{const name=c.name||"",p=name.split("_")[0],vn=p2v[p];if(!vn||vn.length<=2)return null;const sub=subs.find(r=>(r["location/select_farm_id"]||r["ANS/ANS_farm_id"])===name);return{farm_id:name,village:vn,submitted:submittedIds.has(name),surveyor:sub?.["surveyor_info/surveyor_name"]||"",date:sub?(sub["date_time/survey_date"]||sub._submission_time||"").slice(0,10):""};}).filter(Boolean);
  },[formChoices,subs,p2v,submittedIds,vilLabel]);
  const pendVils=useMemo(()=>[...new Set(allFarms.map(r=>r.village))].filter(v=>v&&v.length>2).sort(),[allFarms]);
  const pendingCount=allFarms.filter(r=>!r.submitted).length, doneCount=allFarms.filter(r=>r.submitted).length;
  const pendFiltered=useMemo(()=>{let a=allFarms.filter(r=>{const vOk=pendVil==="all"||r.village===pendVil;const sOk=pendFil==="all"||(pendFil==="pending"&&!r.submitted)||(pendFil==="submitted"&&r.submitted);const sq=!pendSearch||r.farm_id.toLowerCase().includes(pendSearch.toLowerCase())||r.village.toLowerCase().includes(pendSearch.toLowerCase())||(r.surveyor||"").toLowerCase().includes(pendSearch.toLowerCase());return vOk&&sOk&&sq;});if(pendSort==="newest")a.sort((x,y)=>(y.date||"").localeCompare(x.date||""));else if(pendSort==="oldest")a.sort((x,y)=>(x.date||"").localeCompare(y.date||""));else if(pendSort==="village")a.sort((x,y)=>x.village.localeCompare(y.village));return a;},[allFarms,pendVil,pendFil,pendSearch,pendSort]);
  const vilSummary=useMemo(()=>pendVils.map(v=>{const rows=allFarms.filter(r=>r.village===v),sub=rows.filter(r=>r.submitted).length;return{village:v,total:rows.length,submitted:sub,pending:rows.length-sub,pct:rows.length?Math.round(sub/rows.length*100):0};}).sort((a,b)=>b.pending-a.pending),[pendVils,allFarms]);
  const flagsFiltered=useMemo(()=>augSubs.filter(s=>{if(!showDismissed&&s._dis&&!s._mf)return false;if(!s._flag&&!showDismissed)return false;if(!flagSearch)return true;const q=flagSearch.toLowerCase();return(s["ANS/ANS_farm_id"]||"").toLowerCase().includes(q)||vilLabel(s["ANS/ANS_village"]).toLowerCase().includes(q)||(s["surveyor_info/surveyor_name"]||"").toLowerCase().includes(q);}).sort((a,b)=>(b._af?.length||0)-(a._af?.length||0)),[augSubs,showDismissed,flagSearch,vilLabel]);
  const allFieldNames=useMemo(()=>subs.length?Object.keys(subs[0]).filter(k=>!k.startsWith("_")&&!ALWAYS_HIDE.has(k)):[]  ,[subs]);

  const D={bg:theme==="light"?"#f1f5f9":"#020817",hdr:theme==="light"?"#fff":"#0a1628",bdr:theme==="light"?"#e2e8f0":"#1e293b",text:theme==="light"?"#1e293b":"#e2e8f0",muted:theme==="light"?"#6b7280":"#64748b",row1:theme==="light"?"#fff":"transparent",row2:theme==="light"?"#f8fafc":"#070e1a",inp:theme==="light"?"#fff":"#0f172a",card:theme==="light"?"#fff":"#0f172a"};

  const openSub_ = (r) => setOpenSub(r);
  const modalCommon = { fieldMap, choiceMap, flagRules, vilLabel, dismissed, manualFlags, flagDrafts, dismissDrafts:disDrafts, onDismiss:doDismiss, onUndismiss:doUndismiss, onAddFlag:doAddFlag, onRemoveFlag:doRemoveFlag, onFlagDraftChange:setFlagDraft, onDismissDraftChange:setDisDraft, isMobile:mobile, D, theme, leafletOK };

  if(loading)return(<div style={{minHeight:"100vh",background:D.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}><div style={{width:48,height:48,border:"3px solid #0ea5e944",borderTopColor:"#0ea5e9",borderRadius:"50%",animation:"spin 1s linear infinite"}}/><p style={{color:"#0ea5e9",fontFamily:"monospace"}}>Loading…</p><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>);
  if(error)return(<div style={{minHeight:"100vh",background:D.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,padding:24}}><p style={{color:"#ef4444",fontSize:16}}>⚠ {error}</p><button onClick={fetchData} style={{background:"#0ea5e9",color:"#fff",border:"none",padding:"10px 24px",borderRadius:6,cursor:"pointer",fontWeight:700}}>Retry</button></div>);

  return(
    <>
      <style>{`*{box-sizing:border-box}html,body{margin:0;padding:0;overflow-y:scroll!important;overflow-x:hidden!important;height:auto!important}#root{width:100%;height:auto!important;overflow:visible!important}::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:${theme==="light"?"#f1f5f9":"#0f172a"}}::-webkit-scrollbar-thumb{background:${theme==="light"?"#cbd5e1":"#334155"};border-radius:3px}.tb{background:none;border:none;padding:8px 10px;cursor:pointer;font-size:11px;font-weight:600;letter-spacing:.4px;border-bottom:2px solid transparent;color:${D.muted};white-space:nowrap}.tb.a{color:#0ea5e9;border-bottom-color:#0ea5e9}.tb:hover{color:${D.text}}.trow:hover td{background:${theme==="light"?"#f0f9ff!important":"#0c2036!important"}}.trow{cursor:pointer}select{background:${D.inp};color:${D.text};border:1px solid ${D.bdr};padding:5px 8px;border-radius:6px;font-size:11px;outline:none}.inp{background:${D.inp};border:1px solid ${D.bdr};color:${D.text};padding:7px 12px;border-radius:8px;font-size:13px;outline:none;width:100%}.inp:focus{border-color:#0ea5e9}.pill{padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;white-space:nowrap;display:inline-block}.btn{padding:5px 12px;border-radius:6px;border:1px solid;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap}@media(max-width:640px){.sr{flex-direction:column!important}.cg,.pg{grid-template-columns:1fr!important}}`}</style>
      <div style={{background:D.bg,color:D.text,fontFamily:"'Segoe UI',system-ui,sans-serif",width:"100%",minHeight:"100vh"}}>

        {/* HEADER */}
        <div style={{borderBottom:`1px solid ${D.bdr}`,padding:mobile?"0 10px":"0 18px",background:D.hdr,position:"sticky",top:0,zIndex:200}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:8,gap:6,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:0}}><h1 style={{fontSize:mobile?12:15,fontWeight:800,color:"#0ea5e9",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>🌾 KoboToolbox Dashboard</h1><p style={{fontSize:10,color:D.muted}}>{total} sub · 🚩{totalFlagged} · ✅{totalClean}{dupCount>0?` · ⚠${dupCount}`:""}</p></div>
            <div style={{display:"flex",gap:4}}><button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} style={{background:theme==="light"?"#1e293b":"#f1f5f9",color:theme==="light"?"#f1f5f9":"#1e293b",border:"none",padding:"4px 10px",borderRadius:20,cursor:"pointer",fontSize:12,fontWeight:700}}>{theme==="dark"?"☀":"🌙"}</button><button onClick={fetchData} style={{background:"#0ea5e922",border:"1px solid #0ea5e944",color:"#0ea5e9",padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:600}}>↺ Refresh</button></div>
          </div>
          <div style={{display:"flex",marginTop:2,overflowX:"auto"}}>
            {["overview","analytics","map","table","flags","pending","settings"].map(t=>(
              <button key={t} className={`tb${tab===t?" a":""}`} onClick={()=>setTab(t)}>
                {t==="flags"?`🚩FLAGS(${totalFlagged})`:t==="pending"?`⏳(${pendingCount})`:t==="settings"?"⚙SETTINGS":t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{padding:mobile?10:18}}>

          {/* OVERVIEW */}
          {tab==="overview"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div className="sr" style={{display:"flex",flexWrap:"wrap",gap:8}}>
              <Stat label="Submissions" value={total} color="#0ea5e9" icon="📋" theme={theme}/>
              <Stat label="GPS" value={withGPS} color="#10b981" icon="📍" theme={theme}/>
              <Stat label="Avg Acres" value={avgAcres} unit="ac" color="#f59e0b" icon="🌾" theme={theme}/>
              <Stat label="Yield/ac" value={avgYield} unit="qtl" color="#10b981" icon="📊" theme={theme}/>
              <Stat label="Flagged" value={totalFlagged} color="#ef4444" icon="🚩" theme={theme}/>
              <Stat label="Clean" value={totalClean} color="#10b981" icon="✅" theme={theme}/>
            </div>
            <div className="cg" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12}}>
              <Card title="By Surveyor" theme={theme}><HBar data={srvData} xKey="label" yKey="value" color="#0ea5e9" theme={theme}/></Card>
              <Card title="Yield by Village" theme={theme}><HBar data={yieldV} xKey="village" yKey="avg" color="#10b981" theme={theme}/></Card>
            </div>
            <div className="pg" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
              <Card title="Crops" theme={theme}><PieC data={cropData.slice(0,5)}/></Card>
              <Card title="Villages" theme={theme}><PieC data={vilData.slice(0,7)}/></Card>
              <Card title="Straw" theme={theme}><PieC data={strawData}/></Card>
            </div>
          </div>}

          {/* ANALYTICS */}
          {tab==="analytics"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div className="cg" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12}}>
              <Card title="By Village" theme={theme}><HBar data={vilData} xKey="label" yKey="value" color="#0ea5e9" theme={theme} maxItems={25}/></Card>
              <Card title="By Surveyor" theme={theme}><HBar data={srvData} xKey="label" yKey="value" color="#f59e0b" theme={theme}/></Card>
            </div>
            <Card title="Village Summary" theme={theme}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:500}}><thead><tr style={{borderBottom:`1px solid ${D.bdr}`,background:theme==="light"?"#f8fafc":"#071020"}}>{["Village","#","Acres","Yield","DAP","Urea kg"].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:D.muted,fontWeight:600}}>{h}</th>)}</tr></thead><tbody>{Object.entries(subs.reduce((a,r)=>{const v=vilLabel(r["ANS/ANS_village"]||"?");if(!a[v])a[v]={n:0,ac:0,yi:0,dap:0,ur:0};a[v].n++;a[v].ac+=num(r["ANS/ANS_total_acres"]);a[v].yi+=num(r["ANS/ANS_wheat_yield_per_acre"]);a[v].dap+=num(r["ANS/ANS_dap_kg_per_acre"]);a[v].ur+=num(r["ANS/ANS_urea_total_kg"]);return a;},{})).sort((a,b)=>b[1].n-a[1].n).map(([v,d],i)=><tr key={i} style={{borderBottom:`1px solid ${D.bdr}`,background:i%2?D.row2:D.row1}}><td style={{padding:"5px 10px",fontWeight:600}}>{v}</td><td style={{padding:"5px 10px",color:"#0ea5e9"}}>{d.n}</td><td style={{padding:"5px 10px"}}>{fmt(d.ac/d.n)}</td><td style={{padding:"5px 10px",color:"#10b981"}}>{fmt(d.yi/d.n)}</td><td style={{padding:"5px 10px"}}>{fmt(d.dap/d.n,0)}</td><td style={{padding:"5px 10px"}}>{fmt(d.ur/d.n,0)}</td></tr>)}</tbody></table></div></Card>
          </div>}

          {/* MAP */}
          {tab==="map"&&<div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{position:"relative",flex:1,minWidth:160}}><span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:13}}>🔍</span><input className="inp" style={{paddingLeft:30}} value={mapSearch} onChange={e=>{setMapSearch(e.target.value);setSelId(null);}} placeholder="Search farm, village…"/></div>
              {["satellite","street"].map(l=><button key={l} onClick={()=>setMapLayer(l)} className="btn" style={{borderColor:mapLayer===l?"#0ea5e9":D.bdr,background:mapLayer===l?"#0ea5e922":"transparent",color:mapLayer===l?"#0ea5e9":D.muted}}>{l==="satellite"?"🛰":"🗺"} {mobile?"":l}</button>)}
            {/* Mobile list toggle */}
              {mobile&&<button onClick={()=>setShowMapList(v=>!v)} className="btn" style={{borderColor:showMapList?"#0ea5e9":D.bdr,background:showMapList?"#0ea5e922":"transparent",color:showMapList?"#0ea5e9":D.muted,padding:"6px 14px",fontSize:12}}>📍 {mappedSubs.length} Locations {showMapList?"▲":"▼"}</button>}
            </div>

            {/* Mobile location list — proper touch-scroll sheet */}
            {mobile&&showMapList&&(
              <div style={{background:D.card,border:`1px solid ${D.bdr}`,borderRadius:12,
                maxHeight:300,overflow:"hidden",boxShadow:"0 4px 20px #0003",position:"relative",zIndex:10}}>
                <div style={{padding:"10px 14px 8px",borderBottom:`1px solid ${D.bdr}`,
                  display:"flex",justifyContent:"space-between",alignItems:"center",background:D.card}}>
                  <span style={{fontSize:12,fontWeight:700,color:D.muted}}>📍 {mappedSubs.length} locations — tap to select</span>
                  <button onClick={()=>setShowMapList(false)} style={{background:"none",border:"none",color:D.muted,cursor:"pointer",fontSize:20,padding:"0 4px",lineHeight:1}}>×</button>
                </div>
                <div style={{overflowY:"scroll",maxHeight:240,WebkitOverflowScrolling:"touch"}}>
                  {mappedSubs.map(s=>{const fl=getFlags(s,flagRules);const isSel=s._id===selId;return(
                    <div key={s._id}
                      onTouchEnd={e=>{e.preventDefault();setSelId(isSel?null:s._id);setShowMapList(false);}}
                      onClick={()=>{setSelId(isSel?null:s._id);setShowMapList(false);}}
                      style={{padding:"12px 14px",borderBottom:`1px solid ${D.bdr}`,cursor:"pointer",
                        background:isSel?(theme==="light"?"#eff6ff":"#0f2a4a"):"transparent",
                        display:"flex",justifyContent:"space-between",alignItems:"center",
                        WebkitTapHighlightColor:"transparent",userSelect:"none",minHeight:52}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:700,color:isSel?"#0ea5e9":D.text}}>
                          {fl.length>0?"🚩 ":""}{s["ANS/ANS_farm_id"]||"Farm"}
                        </div>
                        <div style={{fontSize:11,color:D.muted,marginTop:2}}>
                          {vilLabel(s["ANS/ANS_village"])} · {s["surveyor_info/surveyor_name"]||""}
                        </div>
                      </div>
                      <span style={{fontSize:11,color:"#0ea5e9",fontWeight:600,flexShrink:0,marginLeft:8}}>▶</span>
                    </div>
                  );})}
                </div>
              </div>
            )}

            <div style={{display:"flex",flexDirection:mobile?"column":"row",gap:10,height:mobile?"auto":"calc(100vh - 240px)"}}>
              {/* Desktop sidebar list */}
              {!mobile&&<div style={{width:230,flexShrink:0,background:D.card,border:`1px solid ${D.bdr}`,borderRadius:10,overflow:"hidden",display:"flex",flexDirection:"column"}}>
                <div style={{padding:"8px 12px",borderBottom:`1px solid ${D.bdr}`,fontSize:10,color:D.muted,fontWeight:700}}>📍 {mappedSubs.length} LOCATIONS</div>
                <div style={{overflowY:"auto",flex:1}}>
                  {mappedSubs.map(s=>{const fl=getFlags(s,flagRules);return<div key={s._id} onClick={()=>setSelId(s._id===selId?null:s._id)} style={{padding:"7px 12px",borderBottom:`1px solid ${D.bdr}`,cursor:"pointer",background:s._id===selId?(theme==="light"?"#eff6ff":"#0f2a4a"):"transparent",borderLeft:s._id===selId?"3px solid #0ea5e9":"3px solid transparent"}}>
                    <div style={{fontSize:11,fontWeight:700,color:s._id===selId?"#0ea5e9":D.text}}>{fl.length?"🚩 ":""}{s["ANS/ANS_farm_id"]||"Farm"}</div>
                    <div style={{fontSize:10,color:D.muted}}>{vilLabel(s["ANS/ANS_village"])} · {s["surveyor_info/surveyor_name"]||""}</div>
                  </div>;})}
                </div>
              </div>}

              <div style={{flex:1,position:"relative",borderRadius:10,overflow:"hidden",border:`1px solid ${D.bdr}`,height:mobile?"72vw":"100%",minHeight:280}}>
                {leafletOK?<LeafletMap subs={mapSubs} selId={selId} onSel={setSelId} layer={mapLayer} visible={tab==="map"} rules={flagRules}/>:<div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:D.muted}}>Loading map…</div>}

                {/* Info panel for selected */}
                {selId&&(()=>{const s=augSubs.find(x=>x._id===selId)||subs.find(x=>x._id===selId);if(!s)return null;const fl=getFlags(s,flagRules);return(
                  <div style={{position:"absolute",bottom:mobile?0:12,right:mobile?0:12,left:mobile?0:"auto",width:mobile?"100%":"270px",maxHeight:"46%",background:theme==="light"?"rgba(255,255,255,.97)":"rgba(10,22,40,.97)",border:`1px solid ${D.bdr}`,borderRadius:mobile?"12px 12px 0 0":"10px",boxShadow:"0 4px 20px #0006",display:"flex",flexDirection:"column",zIndex:500}}>
                    <div style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",borderBottom:`1px solid ${D.bdr}`,flexShrink:0}}>
                      <div>
                        <div style={{color:"#0ea5e9",fontWeight:800,fontSize:13}}>{fl.length>0&&"🚩 "}{s["ANS/ANS_farm_id"]||"Farm"}</div>
                        <div style={{color:D.muted,fontSize:10}}>{vilLabel(s["ANS/ANS_village"])}</div>
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <button onClick={()=>openSub_(augSubs.find(x=>x._id===s._id)||s)} style={{background:"#0ea5e922",border:"1px solid #0ea5e944",color:"#0ea5e9",padding:"3px 8px",borderRadius:5,cursor:"pointer",fontSize:10,fontWeight:600}}>Full Form</button>
                        <button onClick={()=>setSelId(null)} style={{background:"none",border:"none",color:D.muted,cursor:"pointer",fontSize:16}}>✕</button>
                      </div>
                    </div>
                    <div style={{overflowY:"auto",padding:"6px 12px",flex:1}}>
                      {fl.length>0&&<div style={{background:"#ef444418",border:"1px solid #ef444444",borderRadius:6,padding:"4px 8px",marginBottom:4,fontSize:10,color:"#ef4444"}}>{fl.map((f,i)=><div key={i}>🚩 {f.label}: {f.issue}</div>)}</div>}
                      {displayFields(s,fieldMap,choiceMap).slice(0,8).map(({label,value})=>(
                        <div key={label} style={{display:"flex",justifyContent:"space-between",gap:6,padding:"3px 0",borderBottom:`1px solid ${D.bdr}22`}}>
                          <span style={{color:D.muted,fontSize:9,textTransform:"capitalize"}}>{label}</span>
                          <span style={{color:D.text,fontSize:11,fontWeight:500,textAlign:"right",wordBreak:"break-word"}}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );})()}
              </div>
            </div>
          </div>}

          {/* TABLE */}
          {tab==="table"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
            {dupCount>0&&<div style={{background:theme==="light"?"#fef3c7":"#1c1a00",border:"1px solid #f59e0b66",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#f59e0b"}}>⚠️ {dupCount} duplicate Farm IDs</div>}
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search…" className="inp" style={{flex:1,minWidth:150}}/>
              {["all","flagged","clean"].map(f=><button key={f} onClick={()=>setTblFilter(f)} className="btn" style={{borderColor:tblFilter===f?(f==="flagged"?"#ef4444":f==="clean"?"#10b981":"#0ea5e9"):D.bdr,background:tblFilter===f?(f==="flagged"?"#ef444422":f==="clean"?"#10b98122":"#0ea5e922"):"transparent",color:tblFilter===f?(f==="flagged"?"#ef4444":f==="clean"?"#10b981":"#0ea5e9"):D.muted}}>
                {f==="all"?`All(${total})`:f==="flagged"?`🚩(${totalFlagged})`:f==="clean"?`✅(${totalClean})`:f}
              </button>)}
              {dupCount>0&&<button onClick={()=>setDupOnly(d=>!d)} className="btn" style={{borderColor:dupOnly?"#ef4444":D.bdr,background:dupOnly?"#ef444422":"transparent",color:dupOnly?"#ef4444":D.muted}}>Dup</button>}
              <button onClick={()=>setShowColPick(v=>!v)} className="btn" style={{borderColor:showColPick?"#8b5cf6":D.bdr,background:showColPick?"#8b5cf622":"transparent",color:showColPick?"#8b5cf6":D.muted}}>☰ Cols</button>
              <DlBtn rows={filtered} fn="survey" theme={theme}/>
              {selRows.length>0&&<span style={{fontSize:11,color:"#0ea5e9",fontWeight:700,padding:"4px 10px",background:"#0ea5e922",borderRadius:6}}>✓ {selRows.length} selected</span>}
            </div>
            {showColPick&&<Card title="Show / Hide Columns" theme={theme}><div style={{display:"flex",flexWrap:"wrap",gap:6,maxHeight:180,overflowY:"auto"}}>{allCols.map(c=>{const on=dispCols.includes(c);return<label key={c} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,padding:"3px 8px",borderRadius:6,background:on?"#0ea5e922":"transparent",border:`1px solid ${on?"#0ea5e944":D.bdr}`,cursor:"pointer",color:on?"#0ea5e9":D.muted}}><input type="checkbox" checked={on} onChange={()=>on?setVisCols(p=>(p||[]).filter(x=>x!==c)):setVisCols(p=>[...(p||[]),c])}/>{c.split("/").pop().replace(/_/g," ")}</label>;})</div></Card>}
            <div style={{background:D.card,border:`1px solid ${D.bdr}`,borderRadius:10,overflow:"hidden"}}>
              <div style={{padding:"5px 12px",borderBottom:`1px solid ${D.bdr}`,fontSize:10,color:D.muted,background:theme==="light"?"#f8fafc":"#071020"}}>Tap row for full form · Showing {filtered.length} of {total}</div>
              <div style={{overflowX:"scroll",overflowY:"auto",maxHeight:"58vh",WebkitOverflowScrolling:"touch"}}>
                <table style={{borderCollapse:"collapse",fontSize:11,tableLayout:"auto",whiteSpace:"nowrap"}}>
                  <thead style={{position:"sticky",top:0,zIndex:10}}><tr style={{borderBottom:`1px solid ${D.bdr}`,background:theme==="light"?"#f8fafc":"#071020"}}>
                    <th style={{padding:"7px 8px",width:28,position:"sticky",left:0,background:theme==="light"?"#f8fafc":"#071020",zIndex:11}}><input type="checkbox" onChange={e=>setSelRows(e.target.checked?filtered.map(r=>r._id):[])} checked={selRows.length===filtered.length&&filtered.length>0}/></th>
                    <th style={{padding:"7px 4px",width:22,position:"sticky",left:28,background:theme==="light"?"#f8fafc":"#071020",zIndex:11,fontSize:9}}>⚠🚩</th>
                    {dispCols.map(c=><th key={c} style={{padding:"7px 10px",textAlign:"left",color:D.muted,fontWeight:600,fontSize:10}}>{(fieldMap[c]?.label||c.split("/").pop().replace(/_/g," ")).toUpperCase()}</th>)}
                  </tr></thead>
                  <tbody>{filtered.slice(0,300).map((r,i)=>{const fid=r["ANS/ANS_farm_id"]||r["location/select_farm_id"];const isDup=fid&&dupSet.has(fid);const bg=r._flag?(theme==="light"?"#fef2f2":"#2a0000"):isDup?(theme==="light"?"#fef9c3":"#2d2200"):i%2?D.row2:D.row1;return<tr key={r._id} className="trow" onClick={()=>openSub_(r)} style={{borderBottom:`1px solid ${D.bdr}`,background:bg}}>
                    <td style={{padding:"5px 8px",position:"sticky",left:0,background:bg,zIndex:1}} onClick={e=>{e.stopPropagation();setSelRows(s=>s.includes(r._id)?s.filter(x=>x!==r._id):[...s,r._id]);}}><input type="checkbox" checked={selRows.includes(r._id)} onChange={()=>{}} onClick={e=>e.stopPropagation()}/></td>
                    <td style={{padding:"5px 4px",position:"sticky",left:28,background:bg,zIndex:1,fontSize:12}}>{r._flag?"🚩":isDup?"⚠️":""}</td>
                    {dispCols.map(c=>{const raw=String(r[c]??"");return<td key={c} style={{padding:"5px 10px",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis"}}>{choiceMap[raw]||raw}</td>;})}
                  </tr>;})}
                  </tbody>
                </table>
              </div>
            </div>
          </div>}

          {/* FLAGS */}
          {tab==="flags"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div className="sr" style={{display:"flex",flexWrap:"wrap",gap:8}}>
              <Stat label="Active Flags" value={totalFlagged} color="#ef4444" icon="🚩" theme={theme}/>
              <Stat label="Clean" value={totalClean} color="#10b981" icon="✅" theme={theme}/>
              <Stat label="Dismissed" value={dismissed.length} color="#6b7280" icon="✓" theme={theme}/>
              <Stat label="Manual Notes" value={Object.keys(manualFlags).length} color="#f59e0b" icon="👁" theme={theme}/>
            </div>
            <Card title="Active Rules" theme={theme}><div style={{display:"flex",flexDirection:"column",gap:4}}>{flagRules.filter(r=>r.enabled).map((r,i)=><div key={i} style={{display:"flex",gap:8,padding:"3px 0",borderBottom:`1px solid ${D.bdr}22`}}><span style={{fontSize:11,flex:1,fontWeight:600}}>{r.label}</span><span style={{fontSize:11,color:D.muted}}>{r.min!=null?`Min ${r.min}`:""} {r.max!=null?`Max ${r.max}`:""}</span></div>)}<p style={{fontSize:10,color:D.muted,margin:"8px 0 0"}}>💡 Modify in ⚙ Settings tab</p></div></Card>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <input value={flagSearch} onChange={e=>setFlagSearch(e.target.value)} placeholder="🔍 Search flags…" className="inp" style={{flex:1,minWidth:150}}/>
              <label style={{fontSize:11,color:D.muted,display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}><input type="checkbox" checked={showDismissed} onChange={e=>setShowDismissed(e.target.checked)}/> Show Dismissed</label>
              <DlBtn rows={flagsFiltered.map(r=>({farm_id:r["ANS/ANS_farm_id"],village:vilLabel(r["ANS/ANS_village"]),surveyor:r["surveyor_info/surveyor_name"],flags:(r._af||[]).map(f=>`${f.label}:${f.issue}`).join("; "),manual:r._mf||"",status:r._dis?"dismissed":"active"}))} fn="flags" theme={theme}/>
            </div>
            <div style={{background:D.card,border:`1px solid ${D.bdr}`,borderRadius:10,overflow:"hidden"}}>
              <div style={{overflowX:"auto",overflowY:"auto",maxHeight:"55vh"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead style={{position:"sticky",top:0,zIndex:5}}><tr style={{borderBottom:`1px solid ${D.bdr}`,background:theme==="light"?"#fef2f2":"#1a0000"}}>{["Farm ID","Village","Surveyor","Status","Issues"].map(h=><th key={h} style={{padding:"7px 12px",textAlign:"left",color:"#ef4444",fontWeight:600}}>{h}</th>)}</tr></thead>
                  <tbody>{flagsFiltered.map((r,i)=><tr key={i} className="trow" onClick={()=>openSub_(r)} style={{borderBottom:`1px solid ${D.bdr}`,background:r._dis?(theme==="light"?"#f8f8f8":"#111"):i%2?(theme==="light"?"#fff":"#0a0000"):(theme==="light"?"#fff8f8":"#120000")}}>
                    <td style={{padding:"5px 12px",fontFamily:"monospace",fontSize:10}}>{r["ANS/ANS_farm_id"]||"-"}</td>
                    <td style={{padding:"5px 12px"}}>{vilLabel(r["ANS/ANS_village"])}</td>
                    <td style={{padding:"5px 12px",color:D.muted,fontSize:10}}>{r["surveyor_info/surveyor_name"]||"-"}</td>
                    <td style={{padding:"5px 12px"}}>{r._dis?<span className="pill" style={{background:"#10b98122",color:"#10b981"}}>✓ Normal</span>:r._mf?<span className="pill" style={{background:"#f59e0b22",color:"#f59e0b"}}>👁 Note</span>:<span className="pill" style={{background:"#ef444422",color:"#ef4444"}}>🚩 Flag</span>}</td>
                    <td style={{padding:"5px 12px",fontSize:10,color:"#ef4444",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis"}}>{(r._af||[]).map(f=>`${f.label}:${f.issue}`).join(" · ")}{r._mf?` 👁${r._mf}`:""}</td>
                  </tr>)}</tbody>
                </table>
                {flagsFiltered.length===0&&<div style={{padding:"20px",textAlign:"center",color:D.muted}}>No flags match.</div>}
              </div>
            </div>
          </div>}

          {/* PENDING */}
          {tab==="pending"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div className="sr" style={{display:"flex",flexWrap:"wrap",gap:8}}>
              <Stat label="Total Farm IDs" value={allFarms.length} color="#0ea5e9" icon="🗂" theme={theme}/>
              <Stat label="Done" value={doneCount} color="#10b981" icon="✅" theme={theme}/>
              <Stat label="Pending" value={pendingCount} color="#ef4444" icon="⏳" theme={theme}/>
              <Stat label="Progress" value={allFarms.length?Math.round(doneCount/allFarms.length*100):0} unit="%" color="#f59e0b" icon="📈" theme={theme}/>
            </div>
            <Card title="By Village" theme={theme}><div style={{display:"flex",flexDirection:"column",gap:6}}>{vilSummary.map((v,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8}}><span style={{width:140,fontSize:11,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.village}</span><div style={{flex:1,background:D.bdr,borderRadius:4,height:18,overflow:"hidden",position:"relative",minWidth:40}}><div style={{width:`${v.pct}%`,height:"100%",borderRadius:4,background:v.pct===100?"#10b981":v.pct>60?"#f59e0b":"#ef4444"}}/><span style={{position:"absolute",left:6,top:"50%",transform:"translateY(-50%)",fontSize:9,fontWeight:700,color:"#fff"}}>{v.pct}%</span></div><span style={{width:80,fontSize:10,flexShrink:0,textAlign:"right"}}><span style={{color:"#10b981"}}>{v.submitted}</span>/{v.total}</span></div>)}</div></Card>
            <Card title="Farm IDs — tap done rows to see form" theme={theme} noPad extra={<div style={{display:"flex",gap:6,flexWrap:"wrap",padding:"0 14px",alignItems:"center"}}>
              <input value={pendSearch} onChange={e=>setPendSearch(e.target.value)} placeholder="🔍 Search…" className="inp" style={{flex:1,minWidth:120,padding:"5px 10px",fontSize:11}}/>
              <select value={pendVil} onChange={e=>setPendVil(e.target.value)}><option value="all">All Villages</option>{pendVils.map(v=><option key={v} value={v}>{v}</option>)}</select>
              <select value={pendFil} onChange={e=>setPendFil(e.target.value)}><option value="all">All</option><option value="submitted">✅ Done</option><option value="pending">⏳ Pending</option></select>
              <select value={pendSort} onChange={e=>setPendSort(e.target.value)}><option value="newest">Newest First</option><option value="oldest">Oldest First</option><option value="village">By Village</option></select>
              <DlBtn rows={pendFiltered.map(r=>({farm_id:r.farm_id,village:r.village,status:r.submitted?"done":"pending",surveyor:r.surveyor,date:r.date}))} fn="pending" theme={theme}/>
            </div>}>
              <div style={{overflowX:"auto",maxHeight:"50vh",overflowY:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead style={{position:"sticky",top:0,zIndex:5}}><tr style={{borderBottom:`1px solid ${D.bdr}`,background:theme==="light"?"#f8fafc":"#071020"}}>{["Farm ID","Village","Status","Surveyor","Date"].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:D.muted,fontWeight:600}}>{h}</th>)}</tr></thead>
                  <tbody>{pendFiltered.map((r,i)=>{
                    // Robust lookup: check several possible farm ID fields in submission
                    const fid = r.farm_id;
                    const fullSub = fid ? (
                      augSubs.find(s=>{
                        const sid = s["ANS/ANS_farm_id"]||s["location/select_farm_id"]||s["ANS/ANS_farm_id_2"]||"";
                        return sid === fid || sid.toLowerCase() === fid.toLowerCase();
                      }) ||
                      subs.find(s=>{
                        const sid = s["ANS/ANS_farm_id"]||s["location/select_farm_id"]||"";
                        return sid === fid || sid.toLowerCase() === fid.toLowerCase();
                      })
                    ) : null;
                    const canOpen = !!fullSub;
                    return<tr key={i}
                      onClick={()=>{ if(canOpen) openSub_(fullSub); }}
                      className={canOpen?"trow":""} style={{borderBottom:`1px solid ${D.bdr}`,background:i%2?D.row2:D.row1,cursor:canOpen?"pointer":"default"}}>
                      <td style={{padding:"5px 10px",fontFamily:"monospace",fontSize:10}}>{r.farm_id}</td>
                      <td style={{padding:"5px 10px"}}>{r.village}</td>
                      <td style={{padding:"5px 10px"}}>{r.submitted?<span className="pill" style={{background:"#10b98122",color:"#10b981"}}>✓ Done</span>:<span className="pill" style={{background:"#ef444422",color:"#ef4444"}}>⏳</span>}</td>
                      <td style={{padding:"5px 10px",color:D.muted,fontSize:10}}>{r.surveyor||"-"}</td>
                      <td style={{padding:"5px 10px",color:D.muted,fontSize:10}}>{r.date||"-"}</td>
                      {canOpen && <td style={{padding:"5px 8px",color:"#0ea5e9",fontSize:11}}>▶</td>}
                    </tr>;
                  })}</tbody>
                </table>
                {pendFiltered.length===0&&<div style={{padding:"16px",textAlign:"center",color:D.muted}}>No results.</div>}
              </div>
            </Card>
          </div>}

          {/* SETTINGS */}
          {tab==="settings"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Card title="🚩 Red Flag Thresholds" theme={theme}>
              <p style={{fontSize:12,color:D.muted,marginBottom:14}}>Enable/disable and set min/max for each field. Changes are saved automatically to your browser.</p>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {flagRules.map((rule,idx)=>(
                  <div key={idx} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:rule.enabled?(theme==="light"?"#fef2f2":"#1a0a0a"):(theme==="light"?"#f8fafc":"#0a0e16"),borderRadius:8,border:`1px solid ${rule.enabled?"#ef444444":D.bdr}`,flexWrap:"wrap"}}>
                    <label style={{display:"flex",alignItems:"center",gap:6,flex:1,minWidth:150,cursor:"pointer"}}>
                      <input type="checkbox" checked={rule.enabled} onChange={e=>{const u=[...flagRules];u[idx]={...u[idx],enabled:e.target.checked};setFlagRules(u);sw("kobo_rules",u);}}/>
                      <span style={{fontSize:12,fontWeight:600,color:rule.enabled?D.text:D.muted}}>{rule.label}</span>
                    </label>
                    <span style={{fontSize:9,color:D.muted,fontFamily:"monospace",minWidth:80,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis"}}>{rule.field}</span>
                    <div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:10,color:D.muted}}>Min</span><input type="number" value={rule.min??""} onChange={e=>{const u=[...flagRules];u[idx]={...u[idx],min:e.target.value===""?null:Number(e.target.value)};setFlagRules(u);sw("kobo_rules",u);}} style={{width:60,padding:"3px 6px",fontSize:11,background:D.inp,border:`1px solid ${D.bdr}`,borderRadius:4,color:D.text}} placeholder="—"/></div>
                    <div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:10,color:D.muted}}>Max</span><input type="number" value={rule.max??""} onChange={e=>{const u=[...flagRules];u[idx]={...u[idx],max:e.target.value===""?null:Number(e.target.value)};setFlagRules(u);sw("kobo_rules",u);}} style={{width:60,padding:"3px 6px",fontSize:11,background:D.inp,border:`1px solid ${D.bdr}`,borderRadius:4,color:D.text}} placeholder="—"/></div>
                    <button onClick={()=>{const u=flagRules.filter((_,j)=>j!==idx);setFlagRules(u);sw("kobo_rules",u);}} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:16,padding:"2px 6px",flexShrink:0}}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{marginTop:14,borderTop:`1px solid ${D.bdr}`,paddingTop:14}}>
                <div style={{fontSize:11,color:D.muted,fontWeight:700,marginBottom:8}}>➕ Add New Rule</div>
                <AddRule fields={allFieldNames} onAdd={(rule)=>{const u=[...flagRules,rule];setFlagRules(u);sw("kobo_rules",u);}} D={D}/>
              </div>
              <div style={{marginTop:14}}><button onClick={()=>{setFlagRules(DEFAULT_FLAG_RULES);sw("kobo_rules",DEFAULT_FLAG_RULES);}} className="btn" style={{borderColor:"#f59e0b",background:"#f59e0b22",color:"#f59e0b"}}>↺ Reset to Defaults</button></div>
            </Card>
          </div>}
        </div>
      </div>

      {/* MODAL — shared for all tabs */}
      {openSub && (
        <SubModal
          sub={openSub}
          onClose={() => setOpenSub(null)}
          allowEdit={true}
          {...modalCommon}
        />
      )}
    </>
  );
}
