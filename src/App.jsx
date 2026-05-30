import { useState, useEffect, useCallback, useRef, useMemo } from "react";

const API_TOKEN = "cfda7c6ec2ad5c686e180747c4c005995710445a";
const FORM_UID  = "aagjSQnDRWQLs778Ri8AkH";
const HEADERS   = { Authorization: `Token ${API_TOKEN}`, Accept: "application/json" };
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmt = (n, d=1) => Number(n).toFixed(d);
const COLORS = ["#0ea5e9","#ef4444","#f59e0b","#10b981","#8b5cf6","#f97316","#ec4899","#84cc16","#06b6d4","#fb923c"];
const SAT_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const STR_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

// ─── DEFAULT RED FLAG RULES (user can customize via Settings) ───
const DEFAULT_FLAG_RULES = [
  { field: "ANS/ANS_total_acres", label: "Total Acres", min: null, max: 30, enabled: true },
  { field: "ANS/ANS_wheat_yield_per_acre", label: "Yield/Acre (qtl)", min: 15, max: 28, enabled: true },
  { field: "ANS/ANS_dap_kg_per_acre", label: "DAP kg/Acre", min: 40, max: 70, enabled: true },
  { field: "ANS/ANS_urea_total_bags", label: "Urea Bags", min: 3, max: 5, enabled: true },
  { field: "ANS/ANS_urea_bag_kg", label: "Urea Bag Size (kg)", min: 45, max: 50, enabled: true },
];

// Match a submission value against a rule
function checkRule(sub, rule) {
  if (!rule.enabled) return null;
  // Try exact field match first
  let v = sub[rule.field];
  // If not found, try partial match
  if (v === undefined || v === null || v === "") {
    for (const [k, val] of Object.entries(sub)) {
      if (k === rule.field || k.toLowerCase().includes(rule.field.toLowerCase().replace("ans/ans_","").replace(/_/g,""))) {
        v = val; break;
      }
    }
  }
  if (v === undefined || v === null || v === "") return null;
  const n = num(v);
  if (n <= 0) return null;
  if (rule.max !== null && rule.max !== "" && n > Number(rule.max)) return { field: rule.field, label: rule.label, value: n, issue: `${n} > max ${rule.max}` };
  if (rule.min !== null && rule.min !== "" && n < Number(rule.min)) return { field: rule.field, label: rule.label, value: n, issue: `${n} < min ${rule.min}` };
  return null;
}

function getFlags(sub, rules) {
  const flags = [];
  for (const rule of rules) {
    const f = checkRule(sub, rule);
    if (f) flags.push(f);
  }
  return flags;
}

function loadLS(key, fb) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch { return fb; } }
function saveLS(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

// ─── Utility: get "user-facing" fields (skip internal/meta/group headers) ───
function getUserFields(sub) {
  return Object.entries(sub).filter(([k, v]) => {
    if (k.startsWith("_")) return false;
    if (k === "formhub/uuid" || k === "meta/instanceID" || k === "meta/deprecatedID") return false;
    if (v === null || v === undefined || v === "") return false;
    if (typeof v === "object" && !Array.isArray(v)) return false;
    return true;
  });
}

function prettyKey(k) {
  return k.replace("ANS/ANS_","").replace("surveyor_info/","").replace("location/","").replace("date_time/","").replace("wheat_straw_group/","").replace(/_/g," ");
}

// ─── COMPONENTS ───
function HBar({data,xKey,yKey,color="#0ea5e9",theme,maxItems=20}){if(!data?.length)return null;const rows=data.slice(0,maxItems);const max=Math.max(...rows.map(d=>num(d[yKey])),1);const tc=theme==="light"?"#374151":"#e2e8f0";const bg=theme==="light"?"#e5e7eb":"#1e293b";const lw=Math.min(Math.max(Math.max(...rows.map(d=>String(d[xKey]).length))*7+8,100),180);return(<div style={{display:"flex",flexDirection:"column",gap:6}}>{rows.map((d,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:10}}><span style={{width:lw,fontSize:12,color:tc,flexShrink:0,textAlign:"right",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={String(d[xKey])}>{d[xKey]}</span><div style={{flex:1,background:bg,borderRadius:4,height:26,overflow:"hidden",position:"relative",minWidth:60}}><div style={{width:`${(num(d[yKey])/max)*100}%`,height:"100%",background:typeof color==="function"?color(i):color,borderRadius:4,transition:"width .5s"}}/><span style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",fontSize:12,fontWeight:700,color:theme==="light"?"#1e293b":"#f1f5f9",textShadow:theme==="light"?"0 0 3px #fff":"0 0 4px #000"}}>{typeof d[yKey]==="number"?fmt(d[yKey],1):d[yKey]}</span></div></div>))}</div>);}

function PieC({data,size=150}){if(!data?.length)return null;const total=data.reduce((s,d)=>s+d.value,0);if(!total)return null;let angle=-Math.PI/2;const r=size/2-6,cx=size/2,cy=size/2;const sl=data.map((d,i)=>{const sw=(d.value/total)*2*Math.PI;const x1=cx+r*Math.cos(angle),y1=cy+r*Math.sin(angle);angle+=sw;const x2=cx+r*Math.cos(angle),y2=cy+r*Math.sin(angle);return{path:`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${sw>Math.PI?1:0},1 ${x2},${y2} Z`,color:COLORS[i%COLORS.length],label:d.label,value:d.value};});return(<div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}><svg width={size} height={size} style={{flexShrink:0}}>{sl.map((s,i)=><path key={i} d={s.path} fill={s.color} opacity="0.9"/>)}</svg><div style={{display:"flex",flexDirection:"column",gap:5,flex:1,minWidth:110}}>{sl.map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}><div style={{width:10,height:10,borderRadius:2,background:s.color,flexShrink:0}}/><span>{s.label}: <b>{s.value}</b></span></div>))}</div></div>);}

function MapView({submissions,selectedId,onSelect,mapLayer,isVisible}){const ref=useRef(null),mapRef=useRef(null),markersRef=useRef([]),tileRef=useRef(null);useEffect(()=>{if(!ref.current||mapRef.current)return;const L=window.L;if(!L)return;mapRef.current=L.map(ref.current,{zoomControl:true,tap:true}).setView([30.38,76.38],11);tileRef.current=L.tileLayer(SAT_URL,{attribution:"© Esri",maxZoom:19}).addTo(mapRef.current);setTimeout(()=>{if(mapRef.current)mapRef.current.invalidateSize();},300);},[]);useEffect(()=>{if(isVisible&&mapRef.current)setTimeout(()=>mapRef.current.invalidateSize(),200);},[isVisible]);useEffect(()=>{const L=window.L;if(!L||!mapRef.current||!tileRef.current)return;tileRef.current.remove();tileRef.current=L.tileLayer(mapLayer==='satellite'?SAT_URL:STR_URL,{attribution:mapLayer==='satellite'?'© Esri':'© OSM',maxZoom:19}).addTo(mapRef.current);},[mapLayer]);useEffect(()=>{const L=window.L;if(!L||!mapRef.current)return;markersRef.current.forEach(m=>m.remove());markersRef.current=[];submissions.filter(s=>s._geolocation?.length===2&&s._geolocation[0]).forEach(s=>{const[lat,lng]=s._geolocation,isSel=s._id===selectedId;const dc=isSel?"#f59e0b":"#0ea5e9";const icon=L.divIcon({className:"",html:`<div style="width:${isSel?20:12}px;height:${isSel?20:12}px;border-radius:50%;background:${dc};border:2px solid #fff;box-shadow:0 2px 8px #0006"></div>`,iconSize:[isSel?20:12,isSel?20:12],iconAnchor:[isSel?10:6,isSel?10:6]});const m=L.marker([lat,lng],{icon}).addTo(mapRef.current);m.on("click",()=>onSelect(s._id===selectedId?null:s._id));markersRef.current.push(m);});if(selectedId){const sel=submissions.find(s=>s._id===selectedId);if(sel?._geolocation)mapRef.current.flyTo(sel._geolocation,14,{duration:1});}},[submissions,selectedId]);return<div ref={ref} style={{height:"100%",width:"100%",minHeight:300}}/>;}

function DlBtn({rows,filename="data",theme}){const[open,setOpen]=useState(false);const ref=useRef(null);useEffect(()=>{const fn=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("mousedown",fn);return()=>document.removeEventListener("mousedown",fn);},[]);const dlCSV=()=>{if(!rows.length)return;const k=Object.keys(rows[0]);const csv=[k.join(","),...rows.map(r=>k.map(c=>`"${String(r[c]??"").replace(/"/g,'""')}"`).join(","))].join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=filename+".csv";a.click();setOpen(false);};const dlXLSX=()=>{const X=window.XLSX;if(!X)return;const ws=X.utils.json_to_sheet(rows);const wb=X.utils.book_new();X.utils.book_append_sheet(wb,ws,"Data");X.writeFile(wb,filename+".xlsx");setOpen(false);};const bg=theme==="light"?"#fff":"#0f172a",bd=theme==="light"?"#e2e8f0":"#1e293b",tc=theme==="light"?"#1e293b":"#e2e8f0";return(<div ref={ref} style={{position:"relative"}}><button onClick={()=>setOpen(o=>!o)} style={{background:theme==="light"?"#eff6ff":"#0f172a",border:"1px solid #0ea5e944",color:"#0ea5e9",padding:"5px 10px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:600}}>⬇ {rows.length}</button>{open&&<div style={{position:"absolute",right:0,top:"calc(100% + 4px)",background:bg,border:`1px solid ${bd}`,borderRadius:8,boxShadow:"0 4px 20px #0004",zIndex:999,minWidth:120}}>{[{l:"CSV",fn:dlCSV},{l:"XLSX",fn:dlXLSX}].map(({l,fn})=><button key={l} onClick={fn} style={{width:"100%",background:"none",border:"none",padding:"8px 14px",cursor:"pointer",color:tc,fontSize:12,fontWeight:600,borderBottom:`1px solid ${bd}`,textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=theme==="light"?"#f0f9ff":"#0c2036"} onMouseLeave={e=>e.currentTarget.style.background="none"}>{l}</button>)}</div>}</div>);}

function Stat({label,value,unit="",color,icon,theme}){const bg=theme==="light"?"#fff":"#0f172a",lc=theme==="light"?"#6b7280":"#64748b";return(<div style={{background:bg,border:`1px solid ${color}33`,borderRadius:10,padding:"12px 16px",display:"flex",flexDirection:"column",gap:4,flex:1,minWidth:110}}><span style={{fontSize:10,color:lc,letterSpacing:1,textTransform:"uppercase"}}>{icon} {label}</span><span style={{fontSize:22,fontWeight:700,color,fontFamily:"monospace"}}>{value}<span style={{fontSize:11,color:lc,marginLeft:3}}>{unit}</span></span></div>);}

function Card({children,title,theme,extra,noPad}){const bg=theme==="light"?"#fff":"#0f172a",border=theme==="light"?"#e2e8f0":"#1e293b",tc=theme==="light"?"#6b7280":"#94a3b8";return(<div style={{background:bg,border:`1px solid ${border}`,borderRadius:10,padding:noPad?0:20,overflow:"hidden"}}>{(title||extra)&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:title?14:0,padding:noPad?"14px 18px 10px":"0",flexWrap:"wrap",gap:8}}>{title&&<h3 style={{fontSize:12,color:tc,margin:0,textTransform:"uppercase",letterSpacing:1,fontWeight:700}}>{title}</h3>}{extra}</div>}<div style={{padding:noPad?"0 18px 18px":0}}>{children}</div></div>);}

// ════════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════════
export default function App() {
  const [submissions,setSubmissions]=useState([]);
  const [formChoices,setFormChoices]=useState([]);
  const [allFormChoices,setAllFormChoices]=useState([]);
  const [choiceLabelMap,setChoiceLabelMap]=useState({});
  const [formFields,setFormFields]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  const [tab,setTab]=useState("overview");
  const [selectedId,setSelectedId]=useState(null);
  const [search,setSearch]=useState("");
  const [visibleCols,setVisibleCols]=useState(null);
  const [showColPicker,setShowColPicker]=useState(false);
  const [selectedRows,setSelectedRows]=useState([]);
  const [leafletLoaded,setLeafletLoaded]=useState(false);
  const [theme,setTheme]=useState("light");
  const [pendingFilter,setPendingFilter]=useState("all");
  const [pendingVillage,setPendingVillage]=useState("all");
  const [pendingSort,setPendingSort]=useState("newest");
  const [mapLayer,setMapLayer]=useState("satellite");
  const [expandedRow,setExpandedRow]=useState(null);
  const [mapSearch,setMapSearch]=useState("");
  const [showDupOnly,setShowDupOnly]=useState(false);
  const [isMobile,setIsMobile]=useState(typeof window!=="undefined"&&window.innerWidth<640);
  const [flagSearch,setFlagSearch]=useState("");
  const [pendingSearch,setPendingSearch]=useState("");
  const [dismissedFlags,setDismissedFlags]=useState(()=>loadLS("kobo_dismissed",[]));
  const [manualFlags,setManualFlags]=useState(()=>loadLS("kobo_manual_flags",{}));
  const [flagReason,setFlagReason]=useState("");
  const [showDismissed,setShowDismissed]=useState(false);
  const [tableFilter,setTableFilter]=useState("all"); // "all","flagged","clean"
  const [flagRules,setFlagRules]=useState(()=>loadLS("kobo_flag_rules",DEFAULT_FLAG_RULES));
  const [editMode,setEditMode]=useState(false);
  const [editData,setEditData]=useState({});
  const [saving,setSaving]=useState(false);
  const [saveMsg,setSaveMsg]=useState("");
  const [pendingExpandedRow,setPendingExpandedRow]=useState(null);

  const dismissFlag=(id)=>{const u=[...dismissedFlags,String(id)];setDismissedFlags(u);saveLS("kobo_dismissed",u);};
  const undismiss=(id)=>{const u=dismissedFlags.filter(x=>x!==String(id));setDismissedFlags(u);saveLS("kobo_dismissed",u);};
  const addManualFlag=(id,reason)=>{const u={...manualFlags,[String(id)]:reason||"Flagged manually"};setManualFlags(u);saveLS("kobo_manual_flags",u);};
  const removeManualFlag=(id)=>{const u={...manualFlags};delete u[String(id)];setManualFlags(u);saveLS("kobo_manual_flags",u);};

  useEffect(()=>{const fn=()=>setIsMobile(window.innerWidth<640);window.addEventListener("resize",fn);return()=>window.removeEventListener("resize",fn);},[]);
  useEffect(()=>{document.documentElement.style.cssText="overflow-y:scroll;overflow-x:hidden;height:auto;";document.body.style.cssText="overflow-y:scroll;overflow-x:hidden;height:auto;margin:0;padding:0;";const r=document.getElementById("root");if(r)r.style.cssText="width:100%;height:auto;overflow:visible;";},[]);
  useEffect(()=>{if(!window.L){const l=document.createElement("link");l.rel="stylesheet";l.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";document.head.appendChild(l);const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";s.onload=()=>setLeafletLoaded(true);document.head.appendChild(s);}else setLeafletLoaded(true);if(!window.XLSX){const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";document.head.appendChild(s);}},[]);

  const fetchData=useCallback(async()=>{
    setLoading(true);setError(null);
    try{
      const metaR=await fetch(`/api/kobo?path=${encodeURIComponent(`/api/v2/assets/${FORM_UID}/?format=json`)}`,{headers:HEADERS,cache:"no-store"});
      if(!metaR.ok)throw new Error(`Meta HTTP ${metaR.status}`);
      const meta=await metaR.json();
      const allC=meta?.content?.choices||[];
      const surveyFields=meta?.content?.survey||[];
      setFormFields(surveyFields);
      const lm={};allC.forEach(c=>{if(c.name){const l=Array.isArray(c.label)?c.label[0]:c.label;if(l)lm[c.name]=l;}});
      setChoiceLabelMap(lm);
      setAllFormChoices(allC);
      setFormChoices(allC.filter(c=>String(c.name||"").match(/PLT_\d+/)));
      let all=[],url=`/api/kobo?path=${encodeURIComponent(`/api/v2/assets/${FORM_UID}/data/?format=json&limit=300&start=0&ordering=-_submission_time`)}`;
      while(url){const r=await fetch(url,{headers:HEADERS,cache:"no-store"});if(!r.ok)throw new Error(`Data HTTP ${r.status}`);const j=await r.json();all=[...all,...(j.results||[])];url=j.next?`/api/kobo?path=${encodeURIComponent(j.next.replace("https://kf.kobotoolbox.org",""))}`:null;}
      setSubmissions(all);
      if(all.length&&!visibleCols){
        const defaultCols=["_id","ANS/ANS_farm_id","ANS/ANS_village","surveyor_info/surveyor_name","ANS/ANS_total_acres","ANS/ANS_crops_grown","ANS/ANS_wheat_yield_per_acre","ANS/ANS_wheat_straw","date_time/survey_date","_submission_time"];
        setVisibleCols(defaultCols.filter(c=>Object.keys(all[0]).includes(c)));
      }
    }catch(e){setError(e.message);}finally{setLoading(false);}
  },[]);

  useEffect(()=>{fetchData();},[fetchData]);

  // ─── Save edit to KoboToolbox ───
  // Uses Kobo's bulk-update endpoint, which is the documented way to PATCH
  // submission field values via the API. The single-submission PATCH endpoint
  // does NOT accept arbitrary field edits.
  const saveEdit = async () => {
    if (!expandedRow || !editData || Object.keys(editData).length === 0) return;
    setSaving(true); setSaveMsg("");
    try {
      const subId = expandedRow._id;
      const payload = {
        submission_ids: [String(subId)],
        data: editData,
      };
      const r = await fetch(`/api/kobo?path=${encodeURIComponent(`/api/v2/assets/${FORM_UID}/data/bulk/`)}`, {
        method: "PATCH",
        headers: { ...HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ payload: JSON.stringify(payload) }),
      });
      if (!r.ok) {
        let detail = "";
        try { const j = await r.json(); detail = j.detail || j.error || JSON.stringify(j).slice(0, 120); } catch {}
        throw new Error(`Save failed: ${r.status}${detail ? " — " + detail : ""}`);
      }
      setSaveMsg("✅ Saved to KoboToolbox!");
      // Update local data
      setSubmissions(prev => prev.map(s => s._id === subId ? { ...s, ...editData } : s));
      setExpandedRow(prev => ({ ...prev, ...editData }));
      setEditData({});
      setTimeout(() => { setSaveMsg(""); setEditMode(false); }, 1500);
    } catch (e) {
      setSaveMsg(`❌ ${e.message}`);
    } finally { setSaving(false); }
  };

  // ─── Village name resolution ───
  const prefixToVillage = useMemo(() => {
    const map = {};
    // Step 1: From actual submissions (most reliable)
    submissions.forEach(r => {
      const fid = r["ANS/ANS_farm_id"] || r["location/select_farm_id"] || "";
      const prefix = fid.split("_")[0];
      const vil = r["ANS/ANS_village"];
      if (prefix && vil) {
        const resolved = choiceLabelMap[vil] || vil;
        if (resolved.length > 2) map[prefix] = resolved;
      }
    });
    // Step 2: From all form choices (village list)
    allFormChoices.forEach(c => {
      const name = c.name || "";
      const label = Array.isArray(c.label) ? c.label[0] : c.label;
      if (label && name && !name.match(/PLT_\d+/) && name.length <= 4) {
        // This might be a village code
        if (!map[name] && label.length > 2) map[name] = label;
        if (!map[name.toUpperCase()] && label.length > 2) map[name.toUpperCase()] = label;
      }
    });
    // Step 3: From form choices filter_value
    formChoices.forEach(c => {
      const prefix = (c.name || "").split("_")[0];
      const fv = c.filter_value;
      if (prefix && fv && !map[prefix]) {
        const resolved = choiceLabelMap[fv] || choiceLabelMap[fv.toLowerCase()] || choiceLabelMap[prefix] || choiceLabelMap[prefix.toLowerCase()] || null;
        if (resolved && resolved.length > 2) map[prefix] = resolved;
      }
    });
    return map;
  }, [submissions, formChoices, allFormChoices, choiceLabelMap]);

  const vilLabel = useCallback((v) => {
    if (!v || v === "-") return "-";
    const r = choiceLabelMap[v] || choiceLabelMap[v.toLowerCase()] || prefixToVillage[v] || prefixToVillage[v.toUpperCase()] || null;
    // Only return resolved names that look like actual village names (>2 chars, not just a code)
    if (r && r.length > 2) return r;
    // If still a short code, try one more lookup
    if (v.length <= 3) {
      const fromSub = submissions.find(s => {
        const vil = s["ANS/ANS_village"];
        return vil && (vil === v || vil.toUpperCase() === v.toUpperCase());
      });
      if (fromSub) {
        const resolved = choiceLabelMap[fromSub["ANS/ANS_village"]];
        if (resolved && resolved.length > 2) return resolved;
      }
    }
    return r || v;
  }, [choiceLabelMap, prefixToVillage, submissions]);

  // ─── Computed data ───
  const total = submissions.length;
  const withGPS = submissions.filter(s => s._geolocation?.[0]).length;
  const avgAcres = total ? fmt(submissions.reduce((s, r) => s + num(r["ANS/ANS_total_acres"]), 0) / total) : 0;
  const avgYield = total ? fmt(submissions.reduce((s, r) => s + num(r["ANS/ANS_wheat_yield_per_acre"]), 0) / total) : 0;
  const groupCount = (key) => Object.entries(submissions.reduce((a, r) => { const k = vilLabel(r[key] || "Unknown"); a[k] = (a[k] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ label: l, value: v }));
  const groupAvg = (key, vk) => Object.entries(submissions.reduce((a, r) => { const k = vilLabel(r[key] || "Unknown"); if (!a[k]) a[k] = { t: 0, n: 0 }; a[k].t += num(r[vk]); a[k].n++; return a; }, {})).map(([v, d]) => ({ village: v, avg: +(d.t / d.n).toFixed(1) })).sort((a, b) => b.avg - a.avg);
  const villageData = groupCount("ANS/ANS_village");
  const cropMap = {}; submissions.forEach(r => { (r["ANS/ANS_crops_grown"] || "Unknown").split(" ").forEach(c => { const cl = choiceLabelMap[c] || c; cropMap[cl] = (cropMap[cl] || 0) + 1; }); });
  const cropData = Object.entries(cropMap).sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ label: l, value: v }));
  const surveyorData = groupCount("surveyor_info/surveyor_name");
  const strawMap = {}; submissions.forEach(r => { (r["ANS/ANS_wheat_straw"] || r["wheat_straw_group/straw_treatment"] || "Unknown").split(" ").forEach(t => { const tl = choiceLabelMap[t] || t; strawMap[tl] = (strawMap[tl] || 0) + 1; }); });
  const strawData = Object.entries(strawMap).map(([l, v]) => ({ label: l, value: v }));
  const yieldByVil = groupAvg("ANS/ANS_village", "ANS/ANS_wheat_yield_per_acre").slice(0, 12);
  const allCols = submissions.length ? Object.keys(submissions[0]) : [];
  const displayCols = visibleCols || allCols.slice(0, 10);

  // Duplicates
  const fIdCounts = {}; submissions.forEach(r => { const id = r["ANS/ANS_farm_id"] || r["location/select_farm_id"]; if (id) fIdCounts[id] = (fIdCounts[id] || 0) + 1; });
  const dupSet = new Set(Object.keys(fIdCounts).filter(k => fIdCounts[k] > 1)); const dupCount = dupSet.size;

  // Flags using customizable rules
  const flaggedSubs = useMemo(() => submissions.map(s => {
    const af = getFlags(s, flagRules);
    const sid = String(s._id);
    const isDis = dismissedFlags.includes(sid);
    const mf = manualFlags[sid] || null;
    return { ...s, _autoFlags: af, _isDismissed: isDis, _manualFlag: mf, _hasActiveFlag: (!isDis && af.length > 0) || !!mf };
  }), [submissions, flagRules, dismissedFlags, manualFlags]);

  const totalFlagged = flaggedSubs.filter(s => s._hasActiveFlag).length;
  const totalClean = total - totalFlagged;

  const mapFiltered = submissions.filter(s => { if (!mapSearch) return true; const q = mapSearch.toLowerCase(); return Object.values(s).some(v => String(v).toLowerCase().includes(q)); });

  // TABLE filtered
  const filtered = useMemo(() => {
    return flaggedSubs.filter(r => {
      if (showDupOnly) { const id = r["ANS/ANS_farm_id"] || r["location/select_farm_id"]; if (!dupSet.has(id)) return false; }
      if (tableFilter === "flagged" && !r._hasActiveFlag) return false;
      if (tableFilter === "clean" && r._hasActiveFlag) return false;
      return !search || Object.values(r).some(v => typeof v === "string" && v.toLowerCase().includes(search.toLowerCase()));
    }).sort((a, b) => new Date(b._submission_time || 0) - new Date(a._submission_time || 0));
  }, [flaggedSubs, showDupOnly, dupSet, tableFilter, search]);

  const mapSelSub = submissions.find(s => s._id === selectedId);

  // ─── PENDING TAB (FIXED) ───
  const submittedFarmIds = useMemo(() => {
    const set = new Set();
    submissions.forEach(r => {
      const id = r["location/select_farm_id"] || r["ANS/ANS_farm_id"] || "";
      if (id) set.add(id);
    });
    return set;
  }, [submissions]);

  const allFarmIds = useMemo(() => {
    if (formChoices.length === 0) {
      // Fallback: just use submissions
      return submissions.map(r => {
        const id = r["ANS/ANS_farm_id"] || r["location/select_farm_id"] || "";
        return {
          farm_id: id,
          village: vilLabel(r["ANS/ANS_village"]),
          submitted: true,
          surveyor: r["surveyor_info/surveyor_name"] || "",
          date: (r["date_time/survey_date"] || r._submission_time || "").slice(0, 10),
        };
      });
    }

    // Use a Map keyed by farm_id so duplicates collapse to a single entry.
    const map = new Map();

    // Step 1: Add every form-choice farm_id whose village we can resolve
    // (these populate the expected universe shown in the village dropdown).
    formChoices.forEach(c => {
      const name = c.name || "";
      const prefix = name.split("_")[0];
      const vilName = prefixToVillage[prefix];
      if (!vilName || vilName.length <= 2) return;
      const sub = submissions.find(r => (r["location/select_farm_id"] || r["ANS/ANS_farm_id"]) === name);
      map.set(name, {
        farm_id: name,
        village: vilName,
        submitted: submittedFarmIds.has(name),
        surveyor: sub?.["surveyor_info/surveyor_name"] || "",
        date: sub ? (sub["date_time/survey_date"] || sub._submission_time || "").slice(0, 10) : "",
      });
    });

    // Step 2: Add any submitted farm_ids NOT already in the map — i.e. submissions
    // whose farm_id isn't in the form's choice list, or whose village couldn't be
    // resolved. Without this, those submissions were getting silently dropped and
    // the "Done" count came out lower than the actual submission count.
    submissions.forEach(r => {
      const id = r["ANS/ANS_farm_id"] || r["location/select_farm_id"] || "";
      if (!id || map.has(id)) return;
      map.set(id, {
        farm_id: id,
        village: vilLabel(r["ANS/ANS_village"]) || "Other",
        submitted: true,
        surveyor: r["surveyor_info/surveyor_name"] || "",
        date: (r["date_time/survey_date"] || r._submission_time || "").slice(0, 10),
      });
    });

    return Array.from(map.values());
  }, [formChoices, submissions, prefixToVillage, submittedFarmIds, vilLabel]);

  const pendingVillages = useMemo(() => [...new Set(allFarmIds.map(r => r.village))].filter(v => v && v.length > 2).sort(), [allFarmIds]);
  const pendingCount = allFarmIds.filter(r => !r.submitted).length;
  const submittedCount = allFarmIds.filter(r => r.submitted).length;

  const pendingFiltered = useMemo(() => {
    let arr = allFarmIds.filter(r => {
      const vOk = pendingVillage === "all" || r.village === pendingVillage;
      const sOk = pendingFilter === "all" || (pendingFilter === "pending" && !r.submitted) || (pendingFilter === "submitted" && r.submitted);
      const searchOk = !pendingSearch || r.farm_id.toLowerCase().includes(pendingSearch.toLowerCase()) || r.village.toLowerCase().includes(pendingSearch.toLowerCase()) || (r.surveyor || "").toLowerCase().includes(pendingSearch.toLowerCase());
      return vOk && sOk && searchOk;
    });
    if (pendingSort === "newest") arr.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    else if (pendingSort === "oldest") arr.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    else if (pendingSort === "village") arr.sort((a, b) => a.village.localeCompare(b.village));
    return arr;
  }, [allFarmIds, pendingVillage, pendingFilter, pendingSearch, pendingSort]);

  const vilSummary = useMemo(() => pendingVillages.map(v => { const rows = allFarmIds.filter(r => r.village === v); const sub = rows.filter(r => r.submitted).length; return { village: v, total: rows.length, submitted: sub, pending: rows.length - sub, pct: rows.length ? Math.round((sub / rows.length) * 100) : 0 }; }).sort((a, b) => b.pending - a.pending), [pendingVillages, allFarmIds]);

  // FLAGS tab filtered
  const flagsFiltered = useMemo(() => flaggedSubs.filter(s => {
    if (!showDismissed && s._isDismissed && !s._manualFlag) return false;
    if (!s._hasActiveFlag && !showDismissed) return false;
    return true;
  }).filter(s => {
    if (!flagSearch) return true;
    const q = flagSearch.toLowerCase();
    return (s["ANS/ANS_farm_id"] || "").toLowerCase().includes(q) || vilLabel(s["ANS/ANS_village"]).toLowerCase().includes(q) || (s["surveyor_info/surveyor_name"] || "").toLowerCase().includes(q);
  }).sort((a, b) => (b._autoFlags?.length || 0) - (a._autoFlags?.length || 0)), [flaggedSubs, showDismissed, flagSearch, vilLabel]);

  // ─── All form field names for settings ───
  const allFieldNames = useMemo(() => {
    if (!submissions.length) return [];
    return Object.keys(submissions[0]).filter(k => !k.startsWith("_") && k !== "formhub/uuid" && k !== "meta/instanceID" && k !== "meta/deprecatedID");
  }, [submissions]);

  const D = { bg: theme === "light" ? "#f1f5f9" : "#020817", hdr: theme === "light" ? "#ffffff" : "#0a1628", bdr: theme === "light" ? "#e2e8f0" : "#1e293b", text: theme === "light" ? "#1e293b" : "#e2e8f0", muted: theme === "light" ? "#6b7280" : "#64748b", row1: theme === "light" ? "#ffffff" : "transparent", row2: theme === "light" ? "#f8fafc" : "#070e1a", inp: theme === "light" ? "#ffffff" : "#0f172a", card: theme === "light" ? "#ffffff" : "#0f172a" };

  if (loading) return (<div style={{ minHeight: "100vh", background: D.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}><div style={{ width: 48, height: 48, border: "3px solid #0ea5e944", borderTopColor: "#0ea5e9", borderRadius: "50%", animation: "spin 1s linear infinite" }} /><p style={{ color: "#0ea5e9", fontFamily: "monospace" }}>Loading…</p><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>);
  if (error) return (<div style={{ minHeight: "100vh", background: D.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 24 }}><p style={{ color: "#ef4444", fontSize: 16 }}>⚠ {error}</p><button onClick={fetchData} style={{ background: "#0ea5e9", color: "#fff", border: "none", padding: "10px 24px", borderRadius: 6, cursor: "pointer", fontWeight: 700 }}>Retry</button></div>);

  const tabs = ["overview", "analytics", "map", "table", "flags", "pending", "settings"];

  return (
    <>
      <style>{`html,body{margin:0;padding:0;overflow-y:scroll!important;overflow-x:hidden!important;height:auto!important;}#root{width:100%;height:auto!important;overflow:visible!important;}*{box-sizing:border-box;}::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:${theme === "light" ? "#f1f5f9" : "#0f172a"}}::-webkit-scrollbar-thumb{background:${theme === "light" ? "#cbd5e1" : "#334155"};border-radius:3px}.tb{background:none;border:none;padding:8px 10px;cursor:pointer;font-size:11px;font-weight:600;letter-spacing:.4px;border-bottom:2px solid transparent;color:${D.muted};white-space:nowrap}.tb.a{color:#0ea5e9;border-bottom-color:#0ea5e9}.tb:hover{color:${D.text}}.trow:hover td{background:${theme === "light" ? "#f0f9ff!important" : "#0c2036!important"}}.trow{cursor:pointer}select{background:${D.inp};color:${D.text};border:1px solid ${D.bdr};padding:5px 8px;border-radius:6px;font-size:11px;outline:none}.inp{background:${D.inp};border:1px solid ${D.bdr};color:${D.text};padding:7px 12px;border-radius:8px;font-size:13px;outline:none;width:100%}.inp:focus{border-color:#0ea5e9}.pill{padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;white-space:nowrap;display:inline-block}.btn{padding:5px 12px;border-radius:6px;border:1px solid;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap}@media(max-width:640px){.sr{flex-direction:column!important}.cg,.pg{grid-template-columns:1fr!important}}`}</style>

      <div style={{ background: D.bg, color: D.text, fontFamily: "'Segoe UI',system-ui,sans-serif", width: "100%", minHeight: "100vh" }}>
        {/* HEADER */}
        <div style={{ borderBottom: `1px solid ${D.bdr}`, padding: isMobile ? "0 10px" : "0 18px", background: D.hdr, position: "sticky", top: 0, zIndex: 200 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, gap: 6, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 0 }}><h1 style={{ fontSize: isMobile ? 12 : 15, fontWeight: 800, color: "#0ea5e9", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🌾 KoboToolbox Dashboard</h1><p style={{ fontSize: 10, color: D.muted }}>{total} submissions · 🚩{totalFlagged} flagged · ✅{totalClean} clean{dupCount > 0 ? ` · ⚠${dupCount} dup` : ""}</p></div>
            <div style={{ display: "flex", gap: 4 }}><button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} style={{ background: theme === "light" ? "#1e293b" : "#f1f5f9", color: theme === "light" ? "#f1f5f9" : "#1e293b", border: "none", padding: "4px 10px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>{theme === "dark" ? "☀" : "🌙"}</button><button onClick={fetchData} style={{ background: "#0ea5e922", border: "1px solid #0ea5e944", color: "#0ea5e9", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>↺ Refresh</button></div>
          </div>
          <div style={{ display: "flex", marginTop: 2, overflowX: "auto" }}>{tabs.map(t => <button key={t} className={`tb${tab === t ? " a" : ""}`} onClick={() => setTab(t)}>{t === "flags" ? `🚩FLAGS(${totalFlagged})` : t === "pending" ? `⏳(${pendingCount})` : t === "settings" ? "⚙SETTINGS" : t.toUpperCase()}</button>)}</div>
        </div>

        <div style={{ padding: isMobile ? 10 : 18 }}>

          {/* ══════════ OVERVIEW ══════════ */}
          {tab === "overview" && <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><div className="sr" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}><Stat label="Submissions" value={total} color="#0ea5e9" icon="📋" theme={theme} /><Stat label="GPS" value={withGPS} color="#10b981" icon="📍" theme={theme} /><Stat label="Avg Acres" value={avgAcres} unit="ac" color="#f59e0b" icon="🌾" theme={theme} /><Stat label="Avg Yield/ac" value={avgYield} unit="qtl" color="#10b981" icon="📊" theme={theme} /><Stat label="Villages" value={villageData.length} color="#ec4899" icon="🏘" theme={theme} /><Stat label="Flagged" value={totalFlagged} color="#ef4444" icon="🚩" theme={theme} /><Stat label="Clean" value={totalClean} color="#10b981" icon="✅" theme={theme} /></div><div className="cg" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}><Card title="By Surveyor" theme={theme}><HBar data={surveyorData} xKey="label" yKey="value" color="#0ea5e9" theme={theme} /></Card><Card title="Yield/Acre by Village" theme={theme}><HBar data={yieldByVil} xKey="village" yKey="avg" color="#10b981" theme={theme} /></Card></div><div className="pg" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}><Card title="Crops" theme={theme}><PieC data={cropData.slice(0, 5)} /></Card><Card title="Villages" theme={theme}><PieC data={villageData.slice(0, 7)} /></Card><Card title="Straw" theme={theme}><PieC data={strawData} /></Card></div></div>}

          {/* ══════════ ANALYTICS ══════════ */}
          {tab === "analytics" && <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><div className="cg" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}><Card title="By Village" theme={theme}><HBar data={villageData} xKey="label" yKey="value" color="#0ea5e9" theme={theme} maxItems={25} /></Card><Card title="By Surveyor" theme={theme}><HBar data={surveyorData} xKey="label" yKey="value" color="#f59e0b" theme={theme} /></Card></div><Card title="Village Metrics" theme={theme}><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 550 }}><thead><tr style={{ borderBottom: `1px solid ${D.bdr}`, background: theme === "light" ? "#f8fafc" : "#071020" }}>{["Village", "#", "Ac", "Yield", "Irrig", "DAP", "Urea"].map(h => <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: D.muted, fontWeight: 600 }}>{h}</th>)}</tr></thead><tbody>{Object.entries(submissions.reduce((a, r) => { const v = vilLabel(r["ANS/ANS_village"] || "?"); if (!a[v]) a[v] = { n: 0, ac: 0, yi: 0, ir: 0, dap: 0, ur: 0 }; a[v].n++; a[v].ac += num(r["ANS/ANS_total_acres"]); a[v].yi += num(r["ANS/ANS_wheat_yield_per_acre"]); a[v].ir += num(r["ANS/ANS_wheat_irrigations"]); a[v].dap += num(r["ANS/ANS_dap_kg_per_acre"]); a[v].ur += num(r["ANS/ANS_urea_total_kg"]); return a; }, {})).sort((a, b) => b[1].n - a[1].n).map(([v, d], i) => <tr key={i} style={{ borderBottom: `1px solid ${D.bdr}`, background: i % 2 ? D.row2 : D.row1 }}><td style={{ padding: "5px 10px", fontWeight: 600 }}>{v}</td><td style={{ padding: "5px 10px", color: "#0ea5e9" }}>{d.n}</td><td style={{ padding: "5px 10px" }}>{fmt(d.ac / d.n)}</td><td style={{ padding: "5px 10px", color: "#10b981" }}>{fmt(d.yi / d.n)}</td><td style={{ padding: "5px 10px" }}>{fmt(d.ir / d.n)}</td><td style={{ padding: "5px 10px" }}>{fmt(d.dap / d.n, 0)}</td><td style={{ padding: "5px 10px" }}>{fmt(d.ur / d.n, 0)}</td></tr>)}</tbody></table></div></Card></div>}

          {/* ══════════ MAP ══════════ */}
          {tab === "map" && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><div style={{ position: "relative", flex: 1, minWidth: 160 }}><span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13 }}>🔍</span><input className="inp" style={{ paddingLeft: 30 }} value={mapSearch} onChange={e => { setMapSearch(e.target.value); setSelectedId(null); }} placeholder="Search farm, village, surveyor…" /></div>{["satellite", "street"].map(l => <button key={l} onClick={() => setMapLayer(l)} className="btn" style={{ borderColor: mapLayer === l ? "#0ea5e9" : D.bdr, background: mapLayer === l ? "#0ea5e922" : "transparent", color: mapLayer === l ? "#0ea5e9" : D.muted }}>{l === "satellite" ? "🛰" : "🗺"}{!isMobile && " " + (l === "satellite" ? "Satellite" : "Street")}</button>)}</div><div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10, height: isMobile ? "auto" : "calc(100vh - 220px)" }}>{!isMobile && <div style={{ width: 230, flexShrink: 0, background: D.card, border: `1px solid ${D.bdr}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}><div style={{ padding: "8px 12px", borderBottom: `1px solid ${D.bdr}`, fontSize: 10, color: D.muted, fontWeight: 700 }}>📍 LOCATIONS</div><div style={{ overflowY: "auto", flex: 1 }}>{mapFiltered.filter(s => s._geolocation?.[0]).map(s => <div key={s._id} onClick={() => setSelectedId(s._id === selectedId ? null : s._id)} style={{ padding: "6px 12px", borderBottom: `1px solid ${D.bdr}`, cursor: "pointer", background: s._id === selectedId ? (theme === "light" ? "#eff6ff" : "#0f2a4a") : "transparent", borderLeft: s._id === selectedId ? "3px solid #0ea5e9" : "3px solid transparent" }}><div style={{ fontSize: 11, fontWeight: 700, color: s._id === selectedId ? "#0ea5e9" : D.text }}>{s["ANS/ANS_farm_id"] || "Farm"}</div><div style={{ fontSize: 10, color: D.muted }}>{vilLabel(s["ANS/ANS_village"])}</div></div>)}</div></div>}<div style={{ flex: 1, position: "relative", borderRadius: 10, overflow: "hidden", border: `1px solid ${D.bdr}`, height: isMobile ? "70vw" : "100%", minHeight: 280 }}>{leafletLoaded ? <MapView submissions={mapFiltered} selectedId={selectedId} onSelect={setSelectedId} mapLayer={mapLayer} isVisible={tab === "map"} /> : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: D.muted }}>Loading…</div>}{mapSelSub && <div style={{ position: "absolute", bottom: isMobile ? 0 : 12, right: isMobile ? 0 : 12, left: isMobile ? 0 : "auto", width: isMobile ? "100%" : "260px", maxHeight: "45%", background: theme === "light" ? "rgba(255,255,255,0.97)" : "rgba(10,22,40,0.97)", border: `1px solid ${D.bdr}`, borderRadius: isMobile ? "12px 12px 0 0" : "10px", boxShadow: "0 4px 20px #0006", display: "flex", flexDirection: "column", zIndex: 500 }}><div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${D.bdr}`, flexShrink: 0 }}><div><div style={{ color: "#0ea5e9", fontWeight: 800, fontSize: 13 }}>{mapSelSub["ANS/ANS_farm_id"] || "Farm"}</div><div style={{ color: D.muted, fontSize: 10 }}>{vilLabel(mapSelSub["ANS/ANS_village"])}</div></div><button onClick={() => setSelectedId(null)} style={{ background: "none", border: "none", color: D.muted, cursor: "pointer", fontSize: 16 }}>✕</button></div><div style={{ overflowY: "auto", padding: "6px 12px", flex: 1 }}>{getUserFields(mapSelSub).map(([k, v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 6, padding: "3px 0", borderBottom: `1px solid ${D.bdr}22` }}><span style={{ color: D.muted, fontSize: 9, width: 95, flexShrink: 0, textTransform: "uppercase" }}>{prettyKey(k)}</span><span style={{ color: D.text, fontSize: 11, fontWeight: 500, textAlign: "right", wordBreak: "break-word" }}>{choiceLabelMap[String(v)] || String(v)}</span></div>)}</div></div>}</div></div></div>}

          {/* ══════════ TABLE ══════════ */}
          {tab === "table" && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {dupCount > 0 && <div style={{ background: theme === "light" ? "#fef3c7" : "#1c1a00", border: "1px solid #f59e0b66", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#f59e0b" }}>⚠️ {dupCount} duplicate Farm IDs.</div>}
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search…" className="inp" style={{ flex: 1, minWidth: 160 }} />
              {/* Flag/Clean filter — clicking active filter (non-"all") resets to "all" */}
              {["all", "flagged", "clean"].map(f => <button key={f} onClick={() => setTableFilter(prev => (prev === f && f !== "all") ? "all" : f)} className="btn" style={{ borderColor: tableFilter === f ? (f === "flagged" ? "#ef4444" : f === "clean" ? "#10b981" : "#0ea5e9") : D.bdr, background: tableFilter === f ? (f === "flagged" ? "#ef444422" : f === "clean" ? "#10b98122" : "#0ea5e922") : "transparent", color: tableFilter === f ? (f === "flagged" ? "#ef4444" : f === "clean" ? "#10b981" : "#0ea5e9") : D.muted }}>{f === "all" ? `All (${total})` : f === "flagged" ? `🚩 Flagged (${totalFlagged})` : `✅ Clean (${totalClean})`}</button>)}
              {dupCount > 0 && <button onClick={() => setShowDupOnly(d => !d)} className="btn" style={{ borderColor: showDupOnly ? "#ef4444" : D.bdr, background: showDupOnly ? "#ef444422" : "transparent", color: showDupOnly ? "#ef4444" : D.muted }}>{showDupOnly ? "✓ Dup Only" : "Dup Only"}</button>}
              {/* Column picker toggle */}
              <button onClick={() => setShowColPicker(v => !v)} className="btn" style={{ borderColor: showColPicker ? "#8b5cf6" : D.bdr, background: showColPicker ? "#8b5cf622" : "transparent", color: showColPicker ? "#8b5cf6" : D.muted }}>☰ Columns</button>
              <DlBtn rows={filtered} filename="survey" theme={theme} />
              {/* Selected count */}
              {selectedRows.length > 0 && <span style={{ fontSize: 11, color: "#0ea5e9", fontWeight: 700, padding: "4px 10px", background: "#0ea5e922", borderRadius: 6 }}>✓ {selectedRows.length} form{selectedRows.length > 1 ? "s" : ""} selected</span>}
            </div>

            {/* Column picker dropdown */}
            {showColPicker && <Card title="Select Columns to Show" theme={theme}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                {allCols.map(c => {
                  const isVis = displayCols.includes(c);
                  return <label key={c} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 8px", borderRadius: 6, background: isVis ? "#0ea5e922" : "transparent", border: `1px solid ${isVis ? "#0ea5e944" : D.bdr}`, cursor: "pointer", color: isVis ? "#0ea5e9" : D.muted }}>
                    <input type="checkbox" checked={isVis} onChange={() => {
                      if (isVis) setVisibleCols(prev => (prev || []).filter(x => x !== c));
                      else setVisibleCols(prev => [...(prev || []), c]);
                    }} />
                    {prettyKey(c)}
                  </label>;
                })}
              </div>
            </Card>}

            <div style={{ background: D.card, border: `1px solid ${D.bdr}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "5px 12px", borderBottom: `1px solid ${D.bdr}`, fontSize: 10, color: D.muted, background: theme === "light" ? "#f8fafc" : "#071020" }}>Tap row → details · 🚩=flag ⚠=dup · newest first · Showing {filtered.length} of {total}</div>
              <div style={{ overflowX: "scroll", overflowY: "auto", maxHeight: "58vh", WebkitOverflowScrolling: "touch" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 11, tableLayout: "auto", whiteSpace: "nowrap", width: "100%", minWidth: "100%" }}><thead style={{ position: "sticky", top: 0, zIndex: 10 }}><tr style={{ borderBottom: `1px solid ${D.bdr}`, background: theme === "light" ? "#f8fafc" : "#071020" }}><th style={{ padding: "7px 8px", width: 28, position: "sticky", left: 0, background: theme === "light" ? "#f8fafc" : "#071020", zIndex: 11 }}><input type="checkbox" onChange={e => setSelectedRows(e.target.checked ? filtered.map(r => r._id) : [])} checked={selectedRows.length === filtered.length && filtered.length > 0} /></th><th style={{ padding: "7px 4px", width: 24, position: "sticky", left: 28, background: theme === "light" ? "#f8fafc" : "#071020", zIndex: 11, fontSize: 9 }}>⚠🚩</th>{displayCols.map(c => <th key={c} style={{ padding: "7px 10px", textAlign: "left", color: D.muted, fontWeight: 600, fontSize: 10 }}>{prettyKey(c).toUpperCase()}</th>)}</tr></thead>
                  <tbody>{filtered.slice(0, 300).map((r, i) => { const fid = r["ANS/ANS_farm_id"] || r["location/select_farm_id"]; const isDup = fid && dupSet.has(fid); const hasF = r._hasActiveFlag; const bg = hasF ? (theme === "light" ? "#fef2f2" : "#2a0000") : isDup ? (theme === "light" ? "#fef9c3" : "#2d2200") : i % 2 ? D.row2 : D.row1; return <tr key={r._id} className="trow" onClick={() => { setExpandedRow(r); setEditMode(false); setEditData({}); setSaveMsg(""); }} style={{ borderBottom: `1px solid ${D.bdr}`, background: bg }}><td style={{ padding: "5px 8px", position: "sticky", left: 0, background: bg, zIndex: 1 }} onClick={e => { e.stopPropagation(); setSelectedRows(s => s.includes(r._id) ? s.filter(x => x !== r._id) : [...s, r._id]); }}><input type="checkbox" checked={selectedRows.includes(r._id)} onChange={() => {}} onClick={e => e.stopPropagation()} /></td><td style={{ padding: "5px 4px", position: "sticky", left: 28, background: bg, zIndex: 1, fontSize: 12 }}>{hasF ? "🚩" : isDup ? "⚠️" : ""}</td>{displayCols.map(c => { const raw = String(r[c] ?? ""); return <td key={c} style={{ padding: "5px 10px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{choiceLabelMap[raw] || raw}</td>; })}</tr>; })}</tbody></table>
              </div>
            </div>
          </div>}

          {/* ══════════ FLAGS ══════════ */}
          {tab === "flags" && <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="sr" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}><Stat label="Active Flags" value={totalFlagged} color="#ef4444" icon="🚩" theme={theme} /><Stat label="Clean Forms" value={totalClean} color="#10b981" icon="✅" theme={theme} /><Stat label="Dismissed" value={dismissedFlags.length} color="#6b7280" icon="✓" theme={theme} /><Stat label="Manual" value={Object.keys(manualFlags).length} color="#f59e0b" icon="👁" theme={theme} /></div>
            <Card title="Active Validation Rules" theme={theme}><div style={{ display: "flex", flexDirection: "column", gap: 5 }}>{flagRules.filter(r => r.enabled).map((r, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", borderBottom: `1px solid ${D.bdr}22` }}><span style={{ fontSize: 11, flex: 1, fontWeight: 600 }}>{r.label}</span><span style={{ fontSize: 11, color: D.muted }}>{r.min != null && r.min !== "" ? `Min ${r.min}` : ""} {r.max != null && r.max !== "" ? `Max ${r.max}` : ""}</span></div>)}<div style={{ fontSize: 10, color: D.muted, marginTop: 6 }}>💡 Go to Settings tab to change thresholds or add new rules</div></div></Card>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <input value={flagSearch} onChange={e => setFlagSearch(e.target.value)} placeholder="🔍 Search flags…" className="inp" style={{ flex: 1, minWidth: 160 }} />
              <label style={{ fontSize: 11, color: D.muted, display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={showDismissed} onChange={e => setShowDismissed(e.target.checked)} /> Show Dismissed</label>
              <DlBtn rows={flagsFiltered.map(r => ({ farm_id: r["ANS/ANS_farm_id"], village: vilLabel(r["ANS/ANS_village"]), surveyor: r["surveyor_info/surveyor_name"], flags: (r._autoFlags || []).map(f => `${f.label}:${f.issue}`).join("; "), manual: r._manualFlag || "", status: r._isDismissed ? "dismissed" : "active" }))} filename="flags" theme={theme} />
            </div>
            <div style={{ background: D.card, border: `1px solid ${D.bdr}`, borderRadius: 10, overflow: "hidden" }}><div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "50vh" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}><thead style={{ position: "sticky", top: 0, zIndex: 5 }}><tr style={{ borderBottom: `1px solid ${D.bdr}`, background: theme === "light" ? "#fef2f2" : "#1a0000" }}>{["Farm ID", "Village", "Surveyor", "Status", "Flags"].map(h => <th key={h} style={{ padding: "7px 12px", textAlign: "left", color: "#ef4444", fontWeight: 600 }}>{h}</th>)}</tr></thead><tbody>{flagsFiltered.map((r, i) => <tr key={i} className="trow" onClick={() => { setExpandedRow(r); setEditMode(false); setEditData({}); setSaveMsg(""); }} style={{ borderBottom: `1px solid ${D.bdr}`, background: r._isDismissed ? (theme === "light" ? "#f8f8f8" : "#111") : i % 2 ? (theme === "light" ? "#fff" : "#0a0000") : (theme === "light" ? "#fff8f8" : "#120000") }}><td style={{ padding: "5px 12px", fontFamily: "monospace", fontSize: 10 }}>{r["ANS/ANS_farm_id"] || "-"}</td><td style={{ padding: "5px 12px" }}>{vilLabel(r["ANS/ANS_village"])}</td><td style={{ padding: "5px 12px", color: D.muted }}>{r["surveyor_info/surveyor_name"] || "-"}</td><td style={{ padding: "5px 12px" }}>{r._isDismissed ? <span className="pill" style={{ background: "#10b98122", color: "#10b981" }}>✓ OK</span> : r._manualFlag ? <span className="pill" style={{ background: "#f59e0b22", color: "#f59e0b" }}>👁 Manual</span> : <span className="pill" style={{ background: "#ef444422", color: "#ef4444" }}>🚩 Flag</span>}</td><td style={{ padding: "5px 12px", fontSize: 10, color: "#ef4444", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis" }}>{(r._autoFlags || []).map(f => `${f.label}:${f.issue}`).join(" · ")}{r._manualFlag ? ` · 👁${r._manualFlag}` : ""}</td></tr>)}</tbody></table>{flagsFiltered.length === 0 && <div style={{ padding: "20px", textAlign: "center", color: D.muted }}>No flags match.</div>}</div></div>
          </div>}

          {/* ══════════ PENDING (FIXED) ══════════ */}
          {tab === "pending" && <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="sr" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}><Stat label="Total Farm IDs" value={allFarmIds.length} color="#0ea5e9" icon="🗂" theme={theme} /><Stat label="Done" value={submittedCount} color="#10b981" icon="✅" theme={theme} /><Stat label="Pending" value={pendingCount} color="#ef4444" icon="⏳" theme={theme} /><Stat label="Progress" value={allFarmIds.length ? Math.round((submittedCount / allFarmIds.length) * 100) : 0} unit="%" color="#f59e0b" icon="📈" theme={theme} /></div>
            <Card title="By Village" theme={theme}><div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{vilSummary.map((v, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 140, fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.village}</span><div style={{ flex: 1, background: D.bdr, borderRadius: 4, height: 18, overflow: "hidden", position: "relative", minWidth: 40 }}><div style={{ width: `${v.pct}%`, height: "100%", borderRadius: 4, background: v.pct === 100 ? "#10b981" : v.pct > 60 ? "#f59e0b" : "#ef4444" }} /><span style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", fontSize: 9, fontWeight: 700, color: "#fff" }}>{v.pct}%</span></div><span style={{ width: 80, fontSize: 10, flexShrink: 0, textAlign: "right" }}><span style={{ color: "#10b981" }}>{v.submitted}</span>/{v.total}</span></div>)}</div></Card>
            <Card title="Farm IDs" theme={theme} noPad extra={<div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "0 14px", alignItems: "center" }}>
              <input value={pendingSearch} onChange={e => setPendingSearch(e.target.value)} placeholder="🔍 Search…" className="inp" style={{ flex: 1, minWidth: 140, padding: "5px 10px", fontSize: 11 }} />
              <select value={pendingVillage} onChange={e => setPendingVillage(e.target.value)}><option value="all">All Villages</option>{pendingVillages.map(v => <option key={v} value={v}>{v}</option>)}</select>
              <select value={pendingFilter} onChange={e => setPendingFilter(e.target.value)}><option value="all">All</option><option value="submitted">✅ Done</option><option value="pending">⏳ Pending</option></select>
              <select value={pendingSort} onChange={e => setPendingSort(e.target.value)}><option value="newest">Newest First</option><option value="oldest">Oldest First</option><option value="village">By Village</option></select>
              <DlBtn rows={pendingFiltered.map(r => ({ farm_id: r.farm_id, village: r.village, status: r.submitted ? "done" : "pending" }))} filename="pending" theme={theme} />
            </div>}>
              <div style={{ overflowX: "auto", maxHeight: "50vh", overflowY: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}><thead style={{ position: "sticky", top: 0, zIndex: 5 }}><tr style={{ borderBottom: `1px solid ${D.bdr}`, background: theme === "light" ? "#f8fafc" : "#071020" }}>{["Farm ID", "Village", "Status", "Surveyor", "Date"].map(h => <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: D.muted, fontWeight: 600 }}>{h}</th>)}</tr></thead><tbody>{pendingFiltered.map((r, i) => {
                const sub = submissions.find(s => (s["location/select_farm_id"] || s["ANS/ANS_farm_id"]) === r.farm_id);
                return <tr key={i} className="trow" onClick={() => { if (sub) { setPendingExpandedRow(sub); } }} style={{ borderBottom: `1px solid ${D.bdr}`, background: i % 2 ? D.row2 : D.row1, cursor: sub ? "pointer" : "default" }}><td style={{ padding: "5px 10px", fontFamily: "monospace", fontSize: 10 }}>{r.farm_id}</td><td style={{ padding: "5px 10px" }}>{r.village}</td><td style={{ padding: "5px 10px" }}>{r.submitted ? <span className="pill" style={{ background: "#10b98122", color: "#10b981" }}>✓</span> : <span className="pill" style={{ background: "#ef444422", color: "#ef4444" }}>⏳</span>}</td><td style={{ padding: "5px 10px", color: D.muted, fontSize: 10 }}>{r.surveyor || sub?.["surveyor_info/surveyor_name"] || "-"}</td><td style={{ padding: "5px 10px", color: D.muted, fontSize: 10 }}>{r.date || (sub?.["date_time/survey_date"] || "").slice(0, 10) || "-"}</td></tr>;
              })}</tbody></table>{pendingFiltered.length === 0 && <div style={{ padding: "16px", textAlign: "center", color: D.muted }}>No results.</div>}</div>
            </Card>
          </div>}

          {/* ══════════ SETTINGS ══════════ */}
          {tab === "settings" && <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Card title="🚩 Red Flag Threshold Settings" theme={theme}>
              <p style={{ fontSize: 12, color: D.muted, marginBottom: 14 }}>Set minimum and maximum values for each field. Forms outside these ranges will be flagged. Toggle to enable/disable each rule.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {flagRules.map((rule, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: rule.enabled ? (theme === "light" ? "#fef2f2" : "#1a0a0a") : (theme === "light" ? "#f8fafc" : "#0a0e16"), borderRadius: 8, border: `1px solid ${rule.enabled ? "#ef444444" : D.bdr}`, flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 180, cursor: "pointer" }}>
                      <input type="checkbox" checked={rule.enabled} onChange={e => { const u = [...flagRules]; u[idx] = { ...u[idx], enabled: e.target.checked }; setFlagRules(u); saveLS("kobo_flag_rules", u); }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: rule.enabled ? D.text : D.muted }}>{rule.label}</span>
                    </label>
                    <span style={{ fontSize: 10, color: D.muted, width: 100, fontFamily: "monospace" }}>{rule.field}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 10, color: D.muted }}>Min:</span>
                      <input type="number" value={rule.min ?? ""} onChange={e => { const u = [...flagRules]; u[idx] = { ...u[idx], min: e.target.value === "" ? null : Number(e.target.value) }; setFlagRules(u); saveLS("kobo_flag_rules", u); }} style={{ width: 60, padding: "3px 6px", fontSize: 11, background: D.inp, border: `1px solid ${D.bdr}`, borderRadius: 4, color: D.text }} placeholder="—" />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 10, color: D.muted }}>Max:</span>
                      <input type="number" value={rule.max ?? ""} onChange={e => { const u = [...flagRules]; u[idx] = { ...u[idx], max: e.target.value === "" ? null : Number(e.target.value) }; setFlagRules(u); saveLS("kobo_flag_rules", u); }} style={{ width: 60, padding: "3px 6px", fontSize: 11, background: D.inp, border: `1px solid ${D.bdr}`, borderRadius: 4, color: D.text }} placeholder="—" />
                    </div>
                    <button onClick={() => { const u = flagRules.filter((_, j) => j !== idx); setFlagRules(u); saveLS("kobo_flag_rules", u); }} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14, padding: "2px 6px" }}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, borderTop: `1px solid ${D.bdr}`, paddingTop: 14 }}>
                <p style={{ fontSize: 11, color: D.muted, marginBottom: 8, fontWeight: 700 }}>➕ Add New Rule</p>
                <AddRuleForm allFieldNames={allFieldNames} onAdd={(rule) => { const u = [...flagRules, rule]; setFlagRules(u); saveLS("kobo_flag_rules", u); }} theme={theme} D={D} />
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                <button onClick={() => { setFlagRules(DEFAULT_FLAG_RULES); saveLS("kobo_flag_rules", DEFAULT_FLAG_RULES); }} className="btn" style={{ borderColor: "#f59e0b", background: "#f59e0b22", color: "#f59e0b" }}>↺ Reset to Defaults</button>
              </div>
            </Card>
          </div>}
        </div>
      </div>

      {/* ══════════ EXPAND MODAL (Table/Flags) ══════════ */}
      {expandedRow && <div onClick={() => { setExpandedRow(null); setFlagReason(""); setEditMode(false); setEditData({}); setSaveMsg(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 16 }}><div onClick={e => e.stopPropagation()} style={{ background: D.card, border: `1px solid ${D.bdr}`, borderRadius: isMobile ? "16px 16px 0 0" : "12px", width: "100%", maxWidth: 540, maxHeight: isMobile ? "85vh" : "80vh", overflow: "auto", boxShadow: "0 8px 40px #000a" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${D.bdr}`, position: "sticky", top: 0, background: D.card, zIndex: 5 }}><div><div style={{ color: "#0ea5e9", fontWeight: 800, fontSize: 14 }}>{expandedRow._hasActiveFlag && "🚩 "}{expandedRow["ANS/ANS_farm_id"] || `#${expandedRow._id}`}</div><div style={{ color: D.muted, fontSize: 10 }}>{vilLabel(expandedRow["ANS/ANS_village"])} · {expandedRow["surveyor_info/surveyor_name"] || ""}</div></div><div style={{ display: "flex", gap: 6, alignItems: "center" }}>{!editMode && <button onClick={() => { setEditMode(true); setEditData({}); }} className="btn" style={{ borderColor: "#0ea5e9", background: "#0ea5e922", color: "#0ea5e9" }}>✏️ Edit</button>}<button onClick={() => { setExpandedRow(null); setFlagReason(""); setEditMode(false); setEditData({}); setSaveMsg(""); }} style={{ background: theme === "light" ? "#f1f5f9" : "#1e293b", border: "none", color: D.text, cursor: "pointer", fontSize: 16, width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button></div></div>

        {/* Flag info */}
        {(expandedRow._autoFlags || []).length > 0 && <div style={{ margin: "10px 16px", background: expandedRow._isDismissed ? "#10b98118" : "#ef444418", border: `1px solid ${expandedRow._isDismissed ? "#10b98144" : "#ef444444"}`, borderRadius: 8, padding: "8px 12px" }}><div style={{ fontSize: 11, color: expandedRow._isDismissed ? "#10b981" : "#ef4444", fontWeight: 700, marginBottom: 4 }}>{expandedRow._isDismissed ? "✓ Reviewed & Marked Normal" : "🚩 Auto-Detected Flags:"}</div>{expandedRow._autoFlags.map((f, i) => <div key={i} style={{ fontSize: 11, color: expandedRow._isDismissed ? "#10b981" : "#ef4444" }}>• {f.label}: <b>{f.issue}</b></div>)}</div>}
        {expandedRow._manualFlag && <div style={{ margin: "10px 16px", background: "#f59e0b18", border: "1px solid #f59e0b44", borderRadius: 8, padding: "8px 12px" }}><div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700 }}>👁 Manually Flagged: {expandedRow._manualFlag}</div></div>}

        {/* Flag action buttons */}
        <div style={{ padding: "8px 16px", display: "flex", gap: 6, flexWrap: "wrap", borderBottom: `1px solid ${D.bdr}` }}>
          {(expandedRow._autoFlags || []).length > 0 && (expandedRow._isDismissed
            ? <button onClick={() => { undismiss(String(expandedRow._id)); setExpandedRow({ ...expandedRow, _isDismissed: false, _hasActiveFlag: true }); }} className="btn" style={{ borderColor: "#f59e0b", background: "#f59e0b22", color: "#f59e0b" }}>↩ Undo Dismiss</button>
            : <button onClick={() => { dismissFlag(String(expandedRow._id)); setExpandedRow({ ...expandedRow, _isDismissed: true, _hasActiveFlag: !!expandedRow._manualFlag }); }} className="btn" style={{ borderColor: "#10b981", background: "#10b98122", color: "#10b981" }}>✓ Mark as Normal</button>
          )}
          {expandedRow._manualFlag
            ? <button onClick={() => { removeManualFlag(String(expandedRow._id)); setExpandedRow({ ...expandedRow, _manualFlag: null, _hasActiveFlag: !expandedRow._isDismissed && (expandedRow._autoFlags || []).length > 0 }); }} className="btn" style={{ borderColor: "#10b981", background: "#10b98122", color: "#10b981" }}>✓ Remove My Flag</button>
            : <><input value={flagReason} onChange={e => setFlagReason(e.target.value)} placeholder="Reason (optional)" className="inp" style={{ flex: 1, minWidth: 120, padding: "5px 10px", fontSize: 11 }} /><button onClick={() => { addManualFlag(String(expandedRow._id), flagReason || "Flagged manually"); setExpandedRow({ ...expandedRow, _manualFlag: flagReason || "Flagged manually", _hasActiveFlag: true }); setFlagReason(""); }} className="btn" style={{ borderColor: "#ef4444", background: "#ef444422", color: "#ef4444" }}>🚩 Flag This</button></>
          }
        </div>

        {/* Save bar when editing */}
        {editMode && <div style={{ padding: "8px 16px", borderBottom: `1px solid ${D.bdr}`, display: "flex", gap: 6, alignItems: "center", background: theme === "light" ? "#eff6ff" : "#0a1628" }}>
          <span style={{ fontSize: 11, color: "#0ea5e9", fontWeight: 700, flex: 1 }}>✏️ Edit mode — changes will be saved to KoboToolbox</span>
          {Object.keys(editData).length > 0 && <button onClick={saveEdit} disabled={saving} className="btn" style={{ borderColor: "#10b981", background: "#10b98122", color: "#10b981" }}>{saving ? "Saving…" : "💾 Save"}</button>}
          <button onClick={() => { setEditMode(false); setEditData({}); }} className="btn" style={{ borderColor: D.bdr, color: D.muted }}>Cancel</button>
          {saveMsg && <span style={{ fontSize: 11, fontWeight: 700 }}>{saveMsg}</span>}
        </div>}

        {/* Form data — only user-facing fields */}
        <div style={{ padding: "8px 16px" }}>
          {getUserFields(expandedRow).map(([k, v]) => {
            const displayVal = choiceLabelMap[String(v)] || String(v);
            const isEditing = editMode;
            return <div key={k} style={{ display: "flex", gap: 10, padding: "5px 0", borderBottom: `1px solid ${D.bdr}22`, alignItems: "flex-start" }}>
              <span style={{ color: D.muted, fontSize: 9, width: 140, flexShrink: 0, textTransform: "uppercase", fontFamily: "monospace" }}>{prettyKey(k)}</span>
              {isEditing ? (
                <input
                  value={editData[k] !== undefined ? editData[k] : String(v)}
                  onChange={e => setEditData(prev => ({ ...prev, [k]: e.target.value }))}
                  style={{ flex: 1, fontSize: 12, padding: "3px 6px", background: D.inp, border: `1px solid #0ea5e944`, borderRadius: 4, color: D.text }}
                />
              ) : (
                <span style={{ color: D.text, fontSize: 12, fontWeight: 500, flex: 1, wordBreak: "break-word" }}>{displayVal}</span>
              )}
            </div>;
          })}
        </div>
      </div></div>}

      {/* ══════════ PENDING EXPAND MODAL ══════════ */}
      {pendingExpandedRow && <div onClick={() => setPendingExpandedRow(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 16 }}><div onClick={e => e.stopPropagation()} style={{ background: D.card, border: `1px solid ${D.bdr}`, borderRadius: isMobile ? "16px 16px 0 0" : "12px", width: "100%", maxWidth: 540, maxHeight: isMobile ? "85vh" : "80vh", overflow: "auto", boxShadow: "0 8px 40px #000a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${D.bdr}`, position: "sticky", top: 0, background: D.card, zIndex: 5 }}>
          <div><div style={{ color: "#0ea5e9", fontWeight: 800, fontSize: 14 }}>{pendingExpandedRow["ANS/ANS_farm_id"] || `#${pendingExpandedRow._id}`}</div><div style={{ color: D.muted, fontSize: 10 }}>{vilLabel(pendingExpandedRow["ANS/ANS_village"])} · {pendingExpandedRow["surveyor_info/surveyor_name"] || ""}</div></div>
          <button onClick={() => setPendingExpandedRow(null)} style={{ background: theme === "light" ? "#f1f5f9" : "#1e293b", border: "none", color: D.text, cursor: "pointer", fontSize: 16, width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ padding: "8px 16px" }}>
          {getUserFields(pendingExpandedRow).map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 10, padding: "5px 0", borderBottom: `1px solid ${D.bdr}22`, alignItems: "flex-start" }}>
              <span style={{ color: D.muted, fontSize: 9, width: 140, flexShrink: 0, textTransform: "uppercase", fontFamily: "monospace" }}>{prettyKey(k)}</span>
              <span style={{ color: D.text, fontSize: 12, fontWeight: 500, flex: 1, wordBreak: "break-word" }}>{choiceLabelMap[String(v)] || String(v)}</span>
            </div>
          ))}
        </div>
      </div></div>}
    </>
  );
}

// ─── Add Rule Form Component ───
function AddRuleForm({ allFieldNames, onAdd, theme, D }) {
  const [field, setField] = useState("");
  const [label, setLabel] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");

  const handleAdd = () => {
    if (!field) return;
    onAdd({
      field,
      label: label || prettyKey(field),
      min: min === "" ? null : Number(min),
      max: max === "" ? null : Number(max),
      enabled: true,
    });
    setField(""); setLabel(""); setMin(""); setMax("");
  };

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div style={{ flex: 2, minWidth: 180 }}>
        <span style={{ fontSize: 10, color: D.muted }}>Form Field</span>
        <select value={field} onChange={e => { setField(e.target.value); if (!label) setLabel(prettyKey(e.target.value)); }} style={{ width: "100%", padding: "5px 8px", fontSize: 11, background: D.inp, border: `1px solid ${D.bdr}`, borderRadius: 6, color: D.text }}>
          <option value="">Select field…</option>
          {allFieldNames.map(f => <option key={f} value={f}>{prettyKey(f)} ({f})</option>)}
        </select>
      </div>
      <div style={{ flex: 1, minWidth: 100 }}>
        <span style={{ fontSize: 10, color: D.muted }}>Label</span>
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Display name" style={{ width: "100%", padding: "5px 8px", fontSize: 11, background: D.inp, border: `1px solid ${D.bdr}`, borderRadius: 6, color: D.text }} />
      </div>
      <div style={{ width: 70 }}>
        <span style={{ fontSize: 10, color: D.muted }}>Min</span>
        <input type="number" value={min} onChange={e => setMin(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: 11, background: D.inp, border: `1px solid ${D.bdr}`, borderRadius: 4, color: D.text }} placeholder="—" />
      </div>
      <div style={{ width: 70 }}>
        <span style={{ fontSize: 10, color: D.muted }}>Max</span>
        <input type="number" value={max} onChange={e => setMax(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: 11, background: D.inp, border: `1px solid ${D.bdr}`, borderRadius: 4, color: D.text }} placeholder="—" />
      </div>
      <button onClick={handleAdd} disabled={!field} style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid #10b981", background: "#10b98122", color: "#10b981", cursor: field ? "pointer" : "not-allowed", fontSize: 11, fontWeight: 700, opacity: field ? 1 : 0.5 }}>+ Add</button>
    </div>
  );
}
