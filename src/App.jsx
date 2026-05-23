import { useState, useEffect, useCallback, useRef } from "react";

const API_TOKEN = "cfda7c6ec2ad5c686e180747c4c005995710445a";
const FORM_UID  = "aagjSQnDRWQLs778Ri8AkH";
const HEADERS   = { Authorization: `Token ${API_TOKEN}`, Accept: "application/json" };
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmt = (n, d=1) => Number(n).toFixed(d);
const COLORS = ["#0ea5e9","#ef4444","#f59e0b","#10b981","#8b5cf6","#f97316","#ec4899","#84cc16","#06b6d4","#fb923c"];
const SAT_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const STR_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

// ─── RED FLAG RULES ────────────────────────────────────────────────────
const RED_FLAG_RULES = [
  { match: /total_acres/i, label: "Total Acres", max: 30, min: null, unit: "ac" },
  { match: /bigha/i, label: "Bigha per Acre", min: 3, max: 10, unit: "" },
  { match: /wheat_irrigations|total_irrigation/i, label: "Total Irrigations", min: 3, max: 6, unit: "" },
  { match: /irrigation.*hour|hours.*irrig/i, label: "Irrigation Hours/Day", min: 3, max: 8, unit: "hrs" },
  { match: /wheat_yield_per_acre|yield_per_acre/i, label: "Yield per Acre", min: 15, max: 30, unit: "qtl" },
  { match: /dap_kg_per_acre|dap.*per.*acre/i, label: "DAP kg/Acre", min: 35, max: 70, unit: "kg" },
  { match: /urea.*bag|bags.*urea|urea_total_bags/i, label: "Urea Bags", min: 2, max: 4, unit: "bags" },
  { match: /urea.*kg.*bag|kg_per_bag|urea_bag_kg/i, label: "Urea kg/Bag", min: 50, max: 200, unit: "kg" },
];

function getFlags(sub) {
  const flags = [];
  const checked = new Set();
  for (const rule of RED_FLAG_RULES) {
    for (const [k, v] of Object.entries(sub)) {
      if (k.startsWith("_") || checked.has(rule.label + k)) continue;
      if (rule.match.test(k) && v !== null && v !== undefined && v !== "") {
        const n = num(v);
        if (n > 0) {
          checked.add(rule.label + k);
          if (rule.max !== null && n > rule.max) {
            flags.push({ field: k, label: rule.label, value: n, issue: `${n} > ${rule.max}`, severity: "high" });
          } else if (rule.min !== null && n < rule.min) {
            flags.push({ field: k, label: rule.label, value: n, issue: `${n} < ${rule.min}`, severity: "high" });
          }
        }
      }
    }
  }
  return flags;
}
// ────────────────────────────────────────────────────────────────────────

function HBar({ data, xKey, yKey, color="#0ea5e9", theme, maxItems=20 }) {
  if (!data?.length) return null;
  const rows = data.slice(0, maxItems);
  const max = Math.max(...rows.map(d => num(d[yKey])), 1);
  const tc = theme==="light"?"#374151":"#e2e8f0";
  const bg = theme==="light"?"#e5e7eb":"#1e293b";
  const labelW = Math.min(Math.max(Math.max(...rows.map(d=>String(d[xKey]).length))*7+8,100),180);
  return (<div style={{display:"flex",flexDirection:"column",gap:6}}>
    {rows.map((d,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
      <span style={{width:labelW,fontSize:12,color:tc,flexShrink:0,textAlign:"right",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={String(d[xKey])}>{d[xKey]}</span>
      <div style={{flex:1,background:bg,borderRadius:4,height:26,overflow:"hidden",position:"relative",minWidth:60}}>
        <div style={{width:`${(num(d[yKey])/max)*100}%`,height:"100%",background:typeof color==="function"?color(i):color,borderRadius:4,transition:"width .5s"}}/>
        <span style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",fontSize:12,fontWeight:700,color:theme==="light"?"#1e293b":"#f1f5f9",textShadow:theme==="light"?"0 0 3px #fff":"0 0 4px #000"}}>{typeof d[yKey]==="number"?fmt(d[yKey],1):d[yKey]}</span>
      </div>
    </div>))}
  </div>);
}

function PieChart({ data, size=150 }) {
  if (!data?.length) return null;
  const total = data.reduce((s,d)=>s+d.value,0);
  if(!total) return null;
  let angle = -Math.PI/2;
  const r=size/2-6,cx=size/2,cy=size/2;
  const slices = data.map((d,i)=>{const sw=(d.value/total)*2*Math.PI;const x1=cx+r*Math.cos(angle),y1=cy+r*Math.sin(angle);angle+=sw;const x2=cx+r*Math.cos(angle),y2=cy+r*Math.sin(angle);return {path:`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${sw>Math.PI?1:0},1 ${x2},${y2} Z`,color:COLORS[i%COLORS.length],label:d.label,value:d.value};});
  return (<div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
    <svg width={size} height={size} style={{flexShrink:0}}>{slices.map((s,i)=><path key={i} d={s.path} fill={s.color} opacity="0.9"/>)}</svg>
    <div style={{display:"flex",flexDirection:"column",gap:5,flex:1,minWidth:110}}>{slices.map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}><div style={{width:10,height:10,borderRadius:2,background:s.color,flexShrink:0}}/><span>{s.label}: <b>{s.value}</b></span></div>))}</div>
  </div>);
}

function MapView({ submissions, selectedId, onSelect, mapLayer, isVisible }) {
  const ref=useRef(null),mapRef=useRef(null),markersRef=useRef([]),tileRef=useRef(null);
  useEffect(()=>{
    if(!ref.current||mapRef.current)return;
    const L=window.L;if(!L)return;
    mapRef.current=L.map(ref.current,{zoomControl:true,tap:true}).setView([30.38,76.38],11);
    tileRef.current=L.tileLayer(SAT_URL,{attribution:"© Esri",maxZoom:19}).addTo(mapRef.current);
    setTimeout(()=>{if(mapRef.current)mapRef.current.invalidateSize();},300);
  },[]);
  useEffect(()=>{if(isVisible&&mapRef.current)setTimeout(()=>mapRef.current.invalidateSize(),200);},[isVisible]);
  useEffect(()=>{
    const L=window.L;if(!L||!mapRef.current||!tileRef.current)return;
    tileRef.current.remove();
    tileRef.current=L.tileLayer(mapLayer==='satellite'?SAT_URL:STR_URL,{attribution:mapLayer==='satellite'?'© Esri':'© OSM',maxZoom:19}).addTo(mapRef.current);
  },[mapLayer]);
  useEffect(()=>{
    const L=window.L;if(!L||!mapRef.current)return;
    markersRef.current.forEach(m=>m.remove());markersRef.current=[];
    submissions.filter(s=>s._geolocation?.length===2&&s._geolocation[0]).forEach(s=>{
      const [lat,lng]=s._geolocation,isSel=s._id===selectedId;
      const flags=getFlags(s);
      const hasFlag=flags.length>0;
      const dotColor=isSel?"#f59e0b":hasFlag?"#ef4444":"#0ea5e9";
      const icon=L.divIcon({className:"",html:`<div style="width:${isSel?20:12}px;height:${isSel?20:12}px;border-radius:50%;background:${dotColor};border:2px solid #fff;box-shadow:0 2px 8px #0006"></div>`,iconSize:[isSel?20:12,isSel?20:12],iconAnchor:[isSel?10:6,isSel?10:6]});
      const m=L.marker([lat,lng],{icon}).addTo(mapRef.current);
      m.on("click",()=>onSelect(s._id===selectedId?null:s._id));
      markersRef.current.push(m);
    });
    if(selectedId){const sel=submissions.find(s=>s._id===selectedId);if(sel?._geolocation)mapRef.current.flyTo(sel._geolocation,14,{duration:1});}
  },[submissions,selectedId]);
  return <div ref={ref} style={{height:"100%",width:"100%",minHeight:300}}/>;
}

function DownloadBtn({rows,filename="data",theme}){const[open,setOpen]=useState(false);const ref=useRef(null);useEffect(()=>{const fn=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("mousedown",fn);return()=>document.removeEventListener("mousedown",fn);},[]);const dlCSV=()=>{if(!rows.length)return;const k=Object.keys(rows[0]);const csv=[k.join(","),...rows.map(r=>k.map(c=>`"${String(r[c]??"").replace(/"/g,'""')}"`).join(","))].join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=filename+".csv";a.click();setOpen(false);};const dlXLSX=()=>{const X=window.XLSX;if(!X){alert("XLSX loading…");return;}const ws=X.utils.json_to_sheet(rows);const wb=X.utils.book_new();X.utils.book_append_sheet(wb,ws,"Data");X.writeFile(wb,filename+".xlsx");setOpen(false);};const bg=theme==="light"?"#fff":"#0f172a",border=theme==="light"?"#e2e8f0":"#1e293b",tc=theme==="light"?"#1e293b":"#e2e8f0";return(<div ref={ref} style={{position:"relative"}}><button onClick={()=>setOpen(o=>!o)} style={{background:theme==="light"?"#eff6ff":"#0f172a",border:"1px solid #0ea5e944",color:"#0ea5e9",padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:4}}>⬇ {rows.length}</button>{open&&<div style={{position:"absolute",right:0,top:"calc(100% + 4px)",background:bg,border:`1px solid ${border}`,borderRadius:8,boxShadow:"0 4px 20px #0004",zIndex:999,minWidth:140,overflow:"hidden"}}>{[{l:"CSV",fn:dlCSV},{l:"XLSX",fn:dlXLSX}].map(({l,fn})=><button key={l} onClick={fn} style={{width:"100%",background:"none",border:"none",padding:"9px 14px",cursor:"pointer",textAlign:"left",color:tc,fontSize:12,fontWeight:600,borderBottom:`1px solid ${border}`}} onMouseEnter={e=>e.currentTarget.style.background=theme==="light"?"#f0f9ff":"#0c2036"} onMouseLeave={e=>e.currentTarget.style.background="none"}>{l}</button>)}</div>}</div>);}

function StatCard({label,value,unit="",color,icon,theme}){const bg=theme==="light"?"#fff":"#0f172a",lc=theme==="light"?"#6b7280":"#64748b";return(<div style={{background:bg,border:`1px solid ${color}33`,borderRadius:10,padding:"12px 16px",display:"flex",flexDirection:"column",gap:4,flex:1,minWidth:110,boxShadow:theme==="light"?"0 1px 3px #0001":"none"}}><span style={{fontSize:10,color:lc,letterSpacing:1,textTransform:"uppercase"}}>{icon} {label}</span><span style={{fontSize:22,fontWeight:700,color,fontFamily:"monospace"}}>{value}<span style={{fontSize:11,color:lc,marginLeft:3}}>{unit}</span></span></div>);}

function Card({children,title,theme,extra,noPad}){const bg=theme==="light"?"#fff":"#0f172a",border=theme==="light"?"#e2e8f0":"#1e293b",tc=theme==="light"?"#6b7280":"#94a3b8";return(<div style={{background:bg,border:`1px solid ${border}`,borderRadius:10,padding:noPad?0:20,boxShadow:theme==="light"?"0 1px 3px #0001":"none",overflow:"hidden"}}>{(title||extra)&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:title?14:0,padding:noPad?"14px 18px 10px":"0",flexWrap:"wrap",gap:8}}>{title&&<h3 style={{fontSize:12,color:tc,margin:0,textTransform:"uppercase",letterSpacing:1,fontWeight:700}}>{title}</h3>}{extra}</div>}<div style={{padding:noPad?"0 18px 18px":0}}>{children}</div></div>);}

export default function App() {
  const [submissions,setSubmissions]=useState([]);
  const [formChoices,setFormChoices]=useState([]);
  const [choiceLabelMap,setChoiceLabelMap]=useState({});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  const [tab,setTab]=useState("overview");
  const [selectedId,setSelectedId]=useState(null);
  const [search,setSearch]=useState("");
  const [visibleCols,setVisibleCols]=useState(null);
  const [selectedRows,setSelectedRows]=useState([]);
  const [leafletLoaded,setLeafletLoaded]=useState(false);
  const [theme,setTheme]=useState("light");
  const [pendingFilter,setPendingFilter]=useState("all");
  const [pendingVillage,setPendingVillage]=useState("all");
  const [mapLayer,setMapLayer]=useState("satellite");
  const [expandedRow,setExpandedRow]=useState(null);
  const [mapSearch,setMapSearch]=useState("");
  const [showDupOnly,setShowDupOnly]=useState(false);
  const [isMobile,setIsMobile]=useState(typeof window!=="undefined"&&window.innerWidth<640);
  const [flagFilter,setFlagFilter]=useState("all");

  useEffect(()=>{const fn=()=>setIsMobile(window.innerWidth<640);window.addEventListener("resize",fn);return()=>window.removeEventListener("resize",fn);},[]);
  useEffect(()=>{document.documentElement.style.cssText="overflow-y:scroll;overflow-x:hidden;height:auto;";document.body.style.cssText="overflow-y:scroll;overflow-x:hidden;height:auto;margin:0;padding:0;";const r=document.getElementById("root");if(r)r.style.cssText="width:100%;height:auto;overflow:visible;";},[]);
  useEffect(()=>{if(!window.L){const l=document.createElement("link");l.rel="stylesheet";l.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";document.head.appendChild(l);const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";s.onload=()=>setLeafletLoaded(true);document.head.appendChild(s);}else setLeafletLoaded(true);if(!window.XLSX){const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";document.head.appendChild(s);}},[]);

  const fetchData=useCallback(async()=>{
    setLoading(true);setError(null);
    try{
      const metaR=await fetch(`/api/kobo?path=${encodeURIComponent(`/api/v2/assets/${FORM_UID}/?format=json`)}`,{headers:HEADERS,cache:"no-store"});
      if(!metaR.ok)throw new Error(`Meta HTTP ${metaR.status}`);
      const meta=await metaR.json();
      const allChoices=meta?.content?.choices||[];
      const lm={};allChoices.forEach(c=>{if(c.name){const lbl=Array.isArray(c.label)?c.label[0]:c.label;if(lbl)lm[c.name]=lbl;}});
      setChoiceLabelMap(lm);
      setFormChoices(allChoices.filter(c=>String(c.name||"").match(/PLT_\d+/)));
      let all=[],url=`/api/kobo?path=${encodeURIComponent(`/api/v2/assets/${FORM_UID}/data/?format=json&limit=300&start=0&ordering=-_submission_time`)}`;
      while(url){const r=await fetch(url,{headers:HEADERS,cache:"no-store"});if(!r.ok)throw new Error(`Data HTTP ${r.status}`);const j=await r.json();all=[...all,...(j.results||[])];url=j.next?`/api/kobo?path=${encodeURIComponent(j.next.replace("https://kf.kobotoolbox.org",""))}`:null;}
      setSubmissions(all);
      if(all.length&&!visibleCols)setVisibleCols(["_id","ANS/ANS_farm_id","ANS/ANS_village","surveyor_info/surveyor_name","ANS/ANS_total_acres","ANS/ANS_crops_grown","ANS/ANS_wheat_yield_per_acre","ANS/ANS_wheat_straw","date_time/survey_date","_submission_time"]);
    }catch(e){setError(e.message);}finally{setLoading(false);}
  },[]);

  useEffect(()=>{fetchData();},[fetchData]);

  const lbl=(v)=>choiceLabelMap[v]||v||"-";
  const total=submissions.length;
  const withGPS=submissions.filter(s=>s._geolocation?.[0]).length;
  const avgAcres=total?fmt(submissions.reduce((s,r)=>s+num(r["ANS/ANS_total_acres"]),0)/total):0;
  const totalYield=fmt(submissions.reduce((s,r)=>s+num(r["ANS/ANS_wheat_yield_total"]),0),0);
  const avgYield=total?fmt(submissions.reduce((s,r)=>s+num(r["ANS/ANS_wheat_yield_per_acre"]),0)/total):0;
  const groupCount=(key)=>Object.entries(submissions.reduce((a,r)=>{const raw=r[key]||"Unknown";const k=choiceLabelMap[raw]||raw;a[k]=(a[k]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).map(([l,value])=>({label:l,value}));
  const groupAvg=(key,valKey)=>Object.entries(submissions.reduce((acc,r)=>{const raw=r[key]||"Unknown";const k=choiceLabelMap[raw]||raw;if(!acc[k])acc[k]={t:0,n:0};acc[k].t+=num(r[valKey]);acc[k].n++;return acc;},{})).map(([village,d])=>({village,avg:+(d.t/d.n).toFixed(1)})).sort((a,b)=>b.avg-a.avg);
  const villageData=groupCount("ANS/ANS_village");
  const cropMap={};submissions.forEach(r=>{(r["ANS/ANS_crops_grown"]||"Unknown").split(" ").forEach(c=>{const cl=choiceLabelMap[c]||c;cropMap[cl]=(cropMap[cl]||0)+1;});});
  const cropData=Object.entries(cropMap).sort((a,b)=>b[1]-a[1]).map(([l,value])=>({label:l,value}));
  const surveyorData=groupCount("surveyor_info/surveyor_name");
  const strawMap={};submissions.forEach(r=>{(r["ANS/ANS_wheat_straw"]||r["wheat_straw_group/straw_treatment"]||"Unknown").split(" ").forEach(t=>{const tl=choiceLabelMap[t]||t;strawMap[tl]=(strawMap[tl]||0)+1;});});
  const strawData=Object.entries(strawMap).map(([l,value])=>({label:l,value}));
  const yieldByVil=groupAvg("ANS/ANS_village","ANS/ANS_wheat_yield_per_acre").slice(0,12);
  const dapByVil=groupAvg("ANS/ANS_village","ANS/ANS_dap_kg_per_acre").slice(0,12);

  const allCols=submissions.length?Object.keys(submissions[0]):[];
  const displayCols=visibleCols||allCols.slice(0,10);

  // Duplicates
  const farmIdCounts={};submissions.forEach(r=>{const id=r["ANS/ANS_farm_id"]||r["location/select_farm_id"];if(id)farmIdCounts[id]=(farmIdCounts[id]||0)+1;});
  const duplicateFarmIds=new Set(Object.keys(farmIdCounts).filter(k=>farmIdCounts[k]>1));
  const duplicateCount=duplicateFarmIds.size;

  // RED FLAGS
  const flaggedSubmissions=submissions.map(s=>({...s,_flags:getFlags(s)}));
  const totalFlagged=flaggedSubmissions.filter(s=>s._flags.length>0).length;
  const flagTypeCounts={};flaggedSubmissions.forEach(s=>s._flags.forEach(f=>{flagTypeCounts[f.label]=(flagTypeCounts[f.label]||0)+1;}));
  const flagTypeData=Object.entries(flagTypeCounts).sort((a,b)=>b[1]-a[1]).map(([label,value])=>({label,value}));

  const mapFiltered=submissions.filter(s=>{if(!mapSearch)return true;const q=mapSearch.toLowerCase();return Object.values(s).some(v=>String(v).toLowerCase().includes(q));});

  const filtered=flaggedSubmissions
    .filter(r=>{
      if(showDupOnly){const id=r["ANS/ANS_farm_id"]||r["location/select_farm_id"];if(!duplicateFarmIds.has(id))return false;}
      return !search||Object.values(r).some(v=>String(v).toLowerCase().includes(search.toLowerCase()));
    }).sort((a,b)=>new Date(b._submission_time||0)-new Date(a._submission_time||0));

  const mapSelSub=submissions.find(s=>s._id===selectedId);

  const submittedSet=new Set(submissions.map(r=>r["location/select_farm_id"]||r["ANS/ANS_farm_id"]||"").filter(Boolean));
  let allFarmIds=[];
  if(formChoices.length>0){allFarmIds=formChoices.map(c=>{const name=c.name||"";const vc=name.split("_")[0];const VIL_MAP={LA:"lang",SI:"simbro",SA:"sanour",UC:"ucha_gaon",IN:"inderpura",BA:"baddauchhi_kalan",KA:"kalyan",JH:"jhandi",DA:"dakala",LU:"laut",KH:"kheri_jattan",KU:"khuda",AL:"allowal",SID:"sidhuwal",BH:"bhagwanpura",CH:"chhehartta",RO:"ropar",DR:"dhanauri",FA:"fatehpur"};const vil=choiceLabelMap[VIL_MAP[vc]]||VIL_MAP[vc]||c.filter_value||vc||"Unknown";return {farm_id:name,village:vil,submitted:submittedSet.has(name)};});}else{allFarmIds=[...submittedSet].map(id=>{const sub=submissions.find(r=>(r["location/select_farm_id"]||r["ANS/ANS_farm_id"])===id);const vil=sub?.["ANS/ANS_village"];return {farm_id:id,village:choiceLabelMap[vil]||vil||id.split("_")[0],submitted:true,surveyor:sub?.["surveyor_info/surveyor_name"],date:(sub?.["date_time/survey_date"]||"").slice(0,10)};});}
  const pendingVillages=[...new Set(allFarmIds.map(r=>r.village))].sort();
  const pendingFiltered=allFarmIds.filter(r=>{const vOk=pendingVillage==="all"||r.village===pendingVillage;const sOk=pendingFilter==="all"||(pendingFilter==="pending"&&!r.submitted)||(pendingFilter==="submitted"&&r.submitted);return vOk&&sOk;});
  const pendingCount=allFarmIds.filter(r=>!r.submitted).length;
  const submittedCount=allFarmIds.filter(r=>r.submitted).length;
  const vilSummary=pendingVillages.map(v=>{const rows=allFarmIds.filter(r=>r.village===v);const sub=rows.filter(r=>r.submitted).length;return {village:v,total:rows.length,submitted:sub,pending:rows.length-sub,pct:rows.length?Math.round((sub/rows.length)*100):0};}).sort((a,b)=>b.pending-a.pending);

  // FLAGS tab filtered
  const flagsFiltered=flaggedSubmissions.filter(s=>s._flags.length>0).filter(s=>{
    if(flagFilter==="all")return true;
    return s._flags.some(f=>f.label===flagFilter);
  }).sort((a,b)=>b._flags.length-a._flags.length);

  const D={bg:theme==="light"?"#f1f5f9":"#020817",hdr:theme==="light"?"#ffffff":"#0a1628",bdr:theme==="light"?"#e2e8f0":"#1e293b",text:theme==="light"?"#1e293b":"#e2e8f0",muted:theme==="light"?"#6b7280":"#64748b",row1:theme==="light"?"#ffffff":"transparent",row2:theme==="light"?"#f8fafc":"#070e1a",inp:theme==="light"?"#ffffff":"#0f172a",card:theme==="light"?"#ffffff":"#0f172a"};

  if(loading)return(<div style={{minHeight:"100vh",background:D.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}><div style={{width:48,height:48,border:"3px solid #0ea5e944",borderTopColor:"#0ea5e9",borderRadius:"50%",animation:"spin 1s linear infinite"}}/><p style={{color:"#0ea5e9",fontFamily:"monospace"}}>Loading survey data…</p><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>);
  if(error)return(<div style={{minHeight:"100vh",background:D.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,padding:24}}><p style={{color:"#ef4444",fontSize:16,textAlign:"center"}}>⚠ {error}</p><button onClick={fetchData} style={{background:"#0ea5e9",color:"#fff",border:"none",padding:"10px 24px",borderRadius:6,cursor:"pointer",fontWeight:700}}>Retry</button></div>);

  const tabs=["overview","analytics","map","table","flags","pending"];

  return (
    <>
      <style>{`
        html,body{margin:0;padding:0;overflow-y:scroll!important;overflow-x:hidden!important;height:auto!important;}
        #root{width:100%;height:auto!important;overflow:visible!important;}
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:${theme==="light"?"#f1f5f9":"#0f172a"};}
        ::-webkit-scrollbar-thumb{background:${theme==="light"?"#cbd5e1":"#334155"};border-radius:3px;}
        .tab-btn{background:none;border:none;padding:8px 10px;cursor:pointer;font-size:11px;font-weight:600;letter-spacing:.4px;border-bottom:2px solid transparent;transition:all .2s;color:${D.muted};white-space:nowrap;}
        .tab-btn.active{color:#0ea5e9;border-bottom-color:#0ea5e9;}
        .tab-btn:hover{color:${D.text};}
        .trow:hover td{background:${theme==="light"?"#f0f9ff!important":"#0c2036!important"};}
        .trow{cursor:pointer;}
        select{background:${D.inp};color:${D.text};border:1px solid ${D.bdr};padding:5px 8px;border-radius:6px;font-size:11px;outline:none;cursor:pointer;}
        .inp{background:${D.inp};border:1px solid ${D.bdr};color:${D.text};padding:7px 12px;border-radius:8px;font-size:13px;outline:none;width:100%;}
        .inp:focus{border-color:#0ea5e9;}
        .pill{padding:3px 8px;border-radius:10px;font-size:10px;font-weight:700;white-space:nowrap;display:inline-block;}
        @media(max-width:640px){.stat-row{flex-direction:column!important;}.chart-grid,.pie-grid{grid-template-columns:1fr!important;}}
      `}</style>

      <div style={{background:D.bg,color:D.text,fontFamily:"'Segoe UI',system-ui,sans-serif",width:"100%",minHeight:"100vh"}}>

        {/* HEADER */}
        <div style={{borderBottom:`1px solid ${D.bdr}`,padding:isMobile?"0 10px":"0 20px",background:D.hdr,position:"sticky",top:0,zIndex:200,boxShadow:theme==="light"?"0 1px 6px #0001":"none"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:10,gap:6,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:0}}>
              <h1 style={{fontSize:isMobile?12:15,fontWeight:800,color:"#0ea5e9",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>🌾 KoboToolbox Dashboard</h1>
              <p style={{fontSize:10,color:D.muted,marginTop:1}}>{total} sub · {withGPS} GPS{totalFlagged>0?` · 🚩${totalFlagged} flagged`:""}{duplicateCount>0?` · ⚠${duplicateCount} dup`:""}</p>
            </div>
            <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
              <button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} style={{background:theme==="light"?"#1e293b":"#f1f5f9",color:theme==="light"?"#f1f5f9":"#1e293b",border:"none",padding:"4px 10px",borderRadius:20,cursor:"pointer",fontSize:12,fontWeight:700}}>{theme==="dark"?"☀":"🌙"}</button>
              <button onClick={fetchData} style={{background:"#0ea5e922",border:"1px solid #0ea5e944",color:"#0ea5e9",padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:600}}>↺ Refresh</button>
            </div>
          </div>
          <div style={{display:"flex",marginTop:4,overflowX:"auto"}}>
            {tabs.map(t=>(
              <button key={t} className={`tab-btn${tab===t?" active":""}`} onClick={()=>setTab(t)}>
                {t==="flags"?`🚩 FLAGS (${totalFlagged})`:t==="pending"?`⏳ (${pendingCount})`:t==="table"&&duplicateCount>0?`TABLE ⚠${duplicateCount}`:t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{padding:isMobile?10:18,width:"100%"}}>

          {/* OVERVIEW */}
          {tab==="overview"&&(<div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div className="stat-row" style={{display:"flex",flexWrap:"wrap",gap:8}}>
              <StatCard label="Submissions" value={total} color="#0ea5e9" icon="📋" theme={theme}/>
              <StatCard label="GPS" value={withGPS} color="#10b981" icon="📍" theme={theme}/>
              <StatCard label="Avg Acres" value={avgAcres} unit="ac" color="#f59e0b" icon="🌾" theme={theme}/>
              <StatCard label="Total Yield" value={totalYield} unit="qtl" color="#8b5cf6" icon="🌿" theme={theme}/>
              <StatCard label="Avg Yield/ac" value={avgYield} unit="qtl" color="#10b981" icon="📊" theme={theme}/>
              <StatCard label="Villages" value={villageData.length} color="#ec4899" icon="🏘" theme={theme}/>
              {totalFlagged>0&&<StatCard label="🚩 Flagged" value={totalFlagged} color="#ef4444" icon="⚠" theme={theme}/>}
            </div>
            <div className="chart-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12}}>
              <Card title="By Surveyor" theme={theme}><HBar data={surveyorData} xKey="label" yKey="value" color="#0ea5e9" theme={theme}/></Card>
              <Card title="Avg Yield/Acre by Village (qtl)" theme={theme}><HBar data={yieldByVil} xKey="village" yKey="avg" color="#10b981" theme={theme}/></Card>
            </div>
            <div className="pie-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
              <Card title="Crops" theme={theme}><PieChart data={cropData.slice(0,5)}/></Card>
              <Card title="By Village" theme={theme}><PieChart data={villageData.slice(0,7)}/></Card>
              <Card title="Straw Treatment" theme={theme}><PieChart data={strawData}/></Card>
            </div>
            <Card title="Avg DAP (kg/ac) by Village" theme={theme}><HBar data={dapByVil} xKey="village" yKey="avg" color="#8b5cf6" theme={theme}/></Card>
          </div>)}

          {/* ANALYTICS */}
          {tab==="analytics"&&(<div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div className="chart-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12}}>
              <Card title="Submissions per Village" theme={theme}><HBar data={villageData} xKey="label" yKey="value" color="#0ea5e9" theme={theme} maxItems={25}/></Card>
              <Card title="Surveyor Activity" theme={theme}><HBar data={surveyorData} xKey="label" yKey="value" color="#f59e0b" theme={theme}/></Card>
            </div>
            <Card title="Metrics by Village" theme={theme}>
              <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:600}}>
                  <thead><tr style={{borderBottom:`1px solid ${D.bdr}`,background:theme==="light"?"#f8fafc":"#071020"}}>
                    {["Village","#","Avg Ac","Yield/ac","Irrig","DAP","Urea"].map(h=><th key={h} style={{padding:"7px 10px",textAlign:"left",color:D.muted,fontWeight:600}}>{h}</th>)}
                  </tr></thead>
                  <tbody>{Object.entries(submissions.reduce((acc,r)=>{const raw=r["ANS/ANS_village"]||"Unknown";const v=choiceLabelMap[raw]||raw;if(!acc[v])acc[v]={n:0,ac:0,yi:0,ir:0,dap:0,urea:0};acc[v].n++;acc[v].ac+=num(r["ANS/ANS_total_acres"]);acc[v].yi+=num(r["ANS/ANS_wheat_yield_per_acre"]);acc[v].ir+=num(r["ANS/ANS_wheat_irrigations"]);acc[v].dap+=num(r["ANS/ANS_dap_kg_per_acre"]);acc[v].urea+=num(r["ANS/ANS_urea_total_kg"]);return acc;},{})).sort((a,b)=>b[1].n-a[1].n).map(([v,d],i)=>(
                    <tr key={i} style={{borderBottom:`1px solid ${D.bdr}`,background:i%2===0?D.row1:D.row2}}>
                      <td style={{padding:"6px 10px",fontWeight:600}}>{v}</td>
                      <td style={{padding:"6px 10px",color:"#0ea5e9",fontWeight:700}}>{d.n}</td>
                      <td style={{padding:"6px 10px",color:"#f59e0b"}}>{fmt(d.ac/d.n)}</td>
                      <td style={{padding:"6px 10px",color:"#10b981",fontWeight:600}}>{fmt(d.yi/d.n)}</td>
                      <td style={{padding:"6px 10px",color:"#8b5cf6"}}>{fmt(d.ir/d.n)}</td>
                      <td style={{padding:"6px 10px",color:"#f97316"}}>{fmt(d.dap/d.n,0)}</td>
                      <td style={{padding:"6px 10px",color:"#ec4899"}}>{fmt(d.urea/d.n,0)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>
          </div>)}

          {/* MAP */}
          {tab==="map"&&(<div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{position:"relative",flex:1,minWidth:160}}><span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:13}}>🔍</span><input className="inp" style={{paddingLeft:30}} value={mapSearch} onChange={e=>{setMapSearch(e.target.value);setSelectedId(null);}} placeholder="Search farm, village, surveyor…"/></div>
              {["satellite","street"].map(l=><button key={l} onClick={()=>setMapLayer(l)} style={{padding:"5px 10px",borderRadius:20,border:"1px solid",fontSize:11,fontWeight:600,cursor:"pointer",borderColor:mapLayer===l?"#0ea5e9":D.bdr,background:mapLayer===l?"#0ea5e922":"transparent",color:mapLayer===l?"#0ea5e9":D.muted}}>{l==="satellite"?"🛰":"🗺"} {!isMobile&&(l==="satellite"?"Satellite":"Street")}</button>)}
              <span style={{fontSize:10,color:D.muted}}>{mapFiltered.filter(s=>s._geolocation?.[0]).length} pins</span>
            </div>
            <div style={{display:"flex",flexDirection:isMobile?"column":"row",gap:10,height:isMobile?"auto":"calc(100vh - 230px)"}}>
              {!isMobile&&<div style={{width:240,flexShrink:0,display:"flex",flexDirection:"column",background:D.card,border:`1px solid ${D.bdr}`,borderRadius:10,overflow:"hidden"}}>
                <div style={{padding:"8px 12px",borderBottom:`1px solid ${D.bdr}`,fontSize:10,color:D.muted,fontWeight:700}}>📍 LOCATIONS</div>
                <div style={{overflowY:"auto",flex:1}}>{mapFiltered.filter(s=>s._geolocation?.[0]).map(s=>{const fl=getFlags(s);return(<div key={s._id} onClick={()=>setSelectedId(s._id===selectedId?null:s._id)} style={{padding:"6px 12px",borderBottom:`1px solid ${D.bdr}`,cursor:"pointer",background:s._id===selectedId?(theme==="light"?"#eff6ff":"#0f2a4a"):"transparent",borderLeft:s._id===selectedId?"3px solid #0ea5e9":"3px solid transparent"}}>
                  <div style={{fontSize:11,fontWeight:700,color:s._id===selectedId?"#0ea5e9":D.text,display:"flex",alignItems:"center",gap:4}}>{fl.length>0&&<span>🚩</span>}{s["ANS/ANS_farm_id"]||"Farm"}</div>
                  <div style={{fontSize:10,color:D.muted}}>{choiceLabelMap[s["ANS/ANS_village"]]||s["ANS/ANS_village"]||"-"}</div>
                </div>);})}</div>
              </div>}
              <div style={{flex:1,position:"relative",borderRadius:10,overflow:"hidden",border:`1px solid ${D.bdr}`,height:isMobile?"70vw":"100%",minHeight:280}}>
                {leafletLoaded?<MapView submissions={mapFiltered} selectedId={selectedId} onSelect={setSelectedId} mapLayer={mapLayer} isVisible={tab==="map"}/>:<div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:D.muted}}>Loading…</div>}
                {mapSelSub&&(<div style={{position:"absolute",bottom:isMobile?0:12,right:isMobile?0:12,left:isMobile?0:"auto",width:isMobile?"100%":"270px",maxHeight:"45%",background:theme==="light"?"rgba(255,255,255,0.97)":"rgba(10,22,40,0.97)",border:`1px solid ${D.bdr}`,borderRadius:isMobile?"12px 12px 0 0":"10px",boxShadow:"0 4px 20px #0006",display:"flex",flexDirection:"column",zIndex:500,backdropFilter:"blur(8px)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderBottom:`1px solid ${D.bdr}`,flexShrink:0}}>
                    <div>
                      <div style={{color:"#0ea5e9",fontWeight:800,fontSize:13,display:"flex",alignItems:"center",gap:4}}>{getFlags(mapSelSub).length>0&&<span>🚩</span>}{mapSelSub["ANS/ANS_farm_id"]||"Farm"}</div>
                      <div style={{color:D.muted,fontSize:10}}>{choiceLabelMap[mapSelSub["ANS/ANS_village"]]||mapSelSub["ANS/ANS_village"]||""}</div>
                    </div>
                    <button onClick={()=>setSelectedId(null)} style={{background:"none",border:"none",color:D.muted,cursor:"pointer",fontSize:16,padding:"0 4px"}}>✕</button>
                  </div>
                  <div style={{overflowY:"auto",padding:"6px 12px",flex:1}}>
                    {getFlags(mapSelSub).length>0&&<div style={{background:"#ef444418",border:"1px solid #ef444444",borderRadius:6,padding:"6px 10px",marginBottom:6,fontSize:11,color:"#ef4444"}}>{getFlags(mapSelSub).map((f,i)=><div key={i}>🚩 {f.label}: {f.issue}</div>)}</div>}
                    {Object.entries(mapSelSub).filter(([k,v])=>!k.startsWith("_")&&v!==null&&v!==undefined&&v!=="").map(([k,v])=>(
                      <div key={k} style={{display:"flex",justifyContent:"space-between",gap:6,padding:"3px 0",borderBottom:`1px solid ${D.bdr}22`}}>
                        <span style={{color:D.muted,fontSize:9,width:100,flexShrink:0,textTransform:"uppercase"}}>{k.replace("ANS/ANS_","").replace("surveyor_info/","").replace("location/","").replace("date_time/","").replace(/_/g," ")}</span>
                        <span style={{color:D.text,fontSize:11,fontWeight:500,textAlign:"right",wordBreak:"break-word"}}>{choiceLabelMap[String(v)]||String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>)}
              </div>
            </div>
          </div>)}

          {/* TABLE */}
          {tab==="table"&&(<div style={{display:"flex",flexDirection:"column",gap:10}}>
            {duplicateCount>0&&<div style={{background:theme==="light"?"#fef3c7":"#1c1a00",border:"1px solid #f59e0b66",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#f59e0b"}}>⚠️ <strong>{duplicateCount} duplicate Farm IDs.</strong> Orange rows = duplicates.</div>}
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search…" className="inp" style={{flex:1,minWidth:160}}/>
              {duplicateCount>0&&<button onClick={()=>setShowDupOnly(d=>!d)} style={{padding:"6px 10px",borderRadius:6,border:"1px solid",fontSize:11,fontWeight:600,cursor:"pointer",borderColor:showDupOnly?"#ef4444":"#ef444433",background:showDupOnly?"#ef444422":"transparent",color:showDupOnly?"#ef4444":D.muted}}>{showDupOnly?"✓ Dup Only":"Dup Only"}</button>}
              <span style={{fontSize:10,color:D.muted}}>{filtered.length}</span>
              <DownloadBtn rows={selectedRows.length?filtered.filter(r=>selectedRows.includes(r._id)):filtered} filename="survey" theme={theme}/>
            </div>
            <Card theme={theme} title="Columns"><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{allCols.filter(c=>!c.startsWith("harv_win")&&!c.startsWith("_flags")).map(c=>(<label key={c} style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:D.text,cursor:"pointer",background:displayCols.includes(c)?(theme==="light"?"#dbeafe":"#0c2036"):(theme==="light"?"#f8fafc":"#0a1628"),padding:"2px 6px",borderRadius:4,border:`1px solid ${displayCols.includes(c)?"#0ea5e966":D.bdr}`}}><input type="checkbox" checked={displayCols.includes(c)} onChange={e=>setVisibleCols(e.target.checked?[...displayCols,c]:displayCols.filter(x=>x!==c))} style={{width:12,height:12}}/>{c.replace("ANS/ANS_","").replace("surveyor_info/","").replace("location/","").replace("date_time/","")}</label>))}</div></Card>
            <div style={{background:D.card,border:`1px solid ${D.bdr}`,borderRadius:10,overflow:"hidden"}}>
              <div style={{padding:"5px 12px",borderBottom:`1px solid ${D.bdr}`,fontSize:10,color:D.muted,background:theme==="light"?"#f8fafc":"#071020"}}>👆 Tap row for details · newest first · 🚩=flag ⚠=dup</div>
              <div style={{overflowX:"scroll",overflowY:"auto",maxHeight:"58vh",WebkitOverflowScrolling:"touch"}}>
                <table style={{borderCollapse:"collapse",fontSize:11,tableLayout:"auto",whiteSpace:"nowrap"}}>
                  <thead style={{position:"sticky",top:0,zIndex:10}}><tr style={{borderBottom:`1px solid ${D.bdr}`,background:theme==="light"?"#f8fafc":"#071020"}}>
                    <th style={{padding:"8px 10px",width:32,position:"sticky",left:0,background:theme==="light"?"#f8fafc":"#071020",zIndex:11}}><input type="checkbox" onChange={e=>setSelectedRows(e.target.checked?filtered.map(r=>r._id):[])} checked={selectedRows.length===filtered.length&&filtered.length>0}/></th>
                    <th style={{padding:"8px 4px",width:30,position:"sticky",left:32,background:theme==="light"?"#f8fafc":"#071020",zIndex:11,fontSize:10}}>⚠🚩</th>
                    {displayCols.map(c=><th key={c} style={{padding:"8px 10px",textAlign:"left",color:D.muted,fontWeight:600,fontSize:10}}>{c.replace("ANS/ANS_","").replace("surveyor_info/","").replace("location/","").replace("date_time/","").replace(/_/g," ").toUpperCase()}</th>)}
                  </tr></thead>
                  <tbody>{filtered.slice(0,300).map((r,i)=>{
                    const farmId=r["ANS/ANS_farm_id"]||r["location/select_farm_id"];
                    const isDup=farmId&&duplicateFarmIds.has(farmId);
                    const hasFlag=r._flags&&r._flags.length>0;
                    const rowBg=hasFlag?(theme==="light"?"#fef2f2":"#2a0000"):isDup?(theme==="light"?"#fef9c3":"#2d2200"):i%2===0?D.row1:D.row2;
                    return(<tr key={r._id} className="trow" onClick={()=>setExpandedRow(r)} style={{borderBottom:`1px solid ${D.bdr}`,background:rowBg}}>
                      <td style={{padding:"5px 10px",position:"sticky",left:0,background:rowBg,zIndex:1}} onClick={e=>{e.stopPropagation();setSelectedRows(s=>s.includes(r._id)?s.filter(x=>x!==r._id):[...s,r._id])}}><input type="checkbox" checked={selectedRows.includes(r._id)} onChange={()=>{}} onClick={e=>e.stopPropagation()}/></td>
                      <td style={{padding:"5px 4px",position:"sticky",left:32,background:rowBg,zIndex:1,fontSize:12}}>{hasFlag?"🚩":isDup?"⚠️":""}</td>
                      {displayCols.map(c=>{const raw=String(r[c]??"");return<td key={c} style={{padding:"5px 10px",color:D.text,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis"}}>{choiceLabelMap[raw]||raw}</td>;})}
                    </tr>);
                  })}</tbody>
                </table>
              </div>
              {filtered.length>300&&<div style={{padding:"6px 12px",fontSize:10,color:D.muted,borderTop:`1px solid ${D.bdr}`}}>300 of {filtered.length} shown</div>}
            </div>
          </div>)}

          {/* 🚩 FLAGS TAB */}
          {tab==="flags"&&(<div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div className="stat-row" style={{display:"flex",flexWrap:"wrap",gap:8}}>
              <StatCard label="Total Flagged" value={totalFlagged} color="#ef4444" icon="🚩" theme={theme}/>
              <StatCard label="Clean" value={total-totalFlagged} color="#10b981" icon="✅" theme={theme}/>
              <StatCard label="Flag Rate" value={total?Math.round((totalFlagged/total)*100):0} unit="%" color="#f59e0b" icon="📊" theme={theme}/>
            </div>

            {/* Flag rules reference */}
            <Card title="🚩 Validation Rules Applied" theme={theme}>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {RED_FLAG_RULES.map((r,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",borderBottom:`1px solid ${D.bdr}22`}}>
                  <span style={{fontSize:11,color:D.text,fontWeight:600,flex:1}}>{r.label}</span>
                  <span style={{fontSize:11,color:D.muted}}>{r.min!==null?`Min: ${r.min}`:""} {r.max!==null?`Max: ${r.max}`:""}</span>
                  <span className="pill" style={{background:"#ef444422",color:"#ef4444"}}>{flagTypeCounts[r.label]||0} flags</span>
                </div>))}
              </div>
            </Card>

            {/* Flag breakdown chart */}
            {flagTypeData.length>0&&<Card title="Flags by Type" theme={theme}>
              <HBar data={flagTypeData} xKey="label" yKey="value" color="#ef4444" theme={theme}/>
            </Card>}

            {/* Flag filter */}
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:12,color:D.muted,fontWeight:600}}>Filter:</span>
              <button onClick={()=>setFlagFilter("all")} style={{padding:"5px 10px",borderRadius:6,border:"1px solid",fontSize:11,fontWeight:600,cursor:"pointer",borderColor:flagFilter==="all"?"#ef4444":D.bdr,background:flagFilter==="all"?"#ef444422":"transparent",color:flagFilter==="all"?"#ef4444":D.muted}}>All ({totalFlagged})</button>
              {flagTypeData.map(({label:l,value:v})=><button key={l} onClick={()=>setFlagFilter(l)} style={{padding:"5px 10px",borderRadius:6,border:"1px solid",fontSize:11,fontWeight:600,cursor:"pointer",borderColor:flagFilter===l?"#ef4444":D.bdr,background:flagFilter===l?"#ef444422":"transparent",color:flagFilter===l?"#ef4444":D.muted}}>{l} ({v})</button>)}
              <DownloadBtn rows={flagsFiltered.map(r=>{const f=r._flags;return{farm_id:r["ANS/ANS_farm_id"],village:choiceLabelMap[r["ANS/ANS_village"]]||r["ANS/ANS_village"],surveyor:r["surveyor_info/surveyor_name"],flags:f.map(fl=>`${fl.label}: ${fl.issue}`).join("; ")};})} filename="flagged_submissions" theme={theme}/>
            </div>

            {/* Flagged submissions table */}
            <div style={{background:D.card,border:`1px solid ${D.bdr}`,borderRadius:10,overflow:"hidden"}}>
              <div style={{overflowX:"auto",overflowY:"auto",maxHeight:"55vh",WebkitOverflowScrolling:"touch"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead style={{position:"sticky",top:0,zIndex:5}}><tr style={{borderBottom:`1px solid ${D.bdr}`,background:theme==="light"?"#fef2f2":"#1a0000"}}>
                    {["Farm ID","Village","Surveyor","Flags","Details"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",color:"#ef4444",fontWeight:600,whiteSpace:"nowrap"}}>{h}</th>)}
                  </tr></thead>
                  <tbody>{flagsFiltered.map((r,i)=>(<tr key={i} className="trow" onClick={()=>setExpandedRow(r)} style={{borderBottom:`1px solid ${D.bdr}`,background:i%2===0?(theme==="light"?"#fff8f8":"#120000"):(theme==="light"?"#fff":"#0a0000")}}>
                    <td style={{padding:"6px 12px",fontFamily:"monospace",fontSize:11}}>{r["ANS/ANS_farm_id"]||"-"}</td>
                    <td style={{padding:"6px 12px"}}>{choiceLabelMap[r["ANS/ANS_village"]]||r["ANS/ANS_village"]||"-"}</td>
                    <td style={{padding:"6px 12px",color:D.muted}}>{r["surveyor_info/surveyor_name"]||"-"}</td>
                    <td style={{padding:"6px 12px"}}><span className="pill" style={{background:"#ef444422",color:"#ef4444"}}>{r._flags.length} 🚩</span></td>
                    <td style={{padding:"6px 12px",color:"#ef4444",fontSize:10,maxWidth:300}}>{r._flags.map(f=>`${f.label}: ${f.issue}`).join(" · ")}</td>
                  </tr>))}</tbody>
                </table>
                {flagsFiltered.length===0&&<div style={{padding:"24px",textAlign:"center",color:D.muted}}>No flagged submissions{flagFilter!=="all"?" for this filter":""}.</div>}
              </div>
            </div>
          </div>)}

          {/* PENDING */}
          {tab==="pending"&&(<div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div className="stat-row" style={{display:"flex",flexWrap:"wrap",gap:8}}>
              <StatCard label="Total IDs" value={allFarmIds.length} color="#0ea5e9" icon="🗂" theme={theme}/>
              <StatCard label="Submitted" value={submittedCount} color="#10b981" icon="✅" theme={theme}/>
              <StatCard label="Pending" value={pendingCount} color="#ef4444" icon="⏳" theme={theme}/>
              <StatCard label="Done" value={allFarmIds.length?Math.round((submittedCount/allFarmIds.length)*100):0} unit="%" color="#f59e0b" icon="📈" theme={theme}/>
            </div>
            {formChoices.length===0&&<div style={{background:theme==="light"?"#fef3c7":"#1c1a00",border:"1px solid #f59e0b44",borderRadius:8,padding:"10px 14px",fontSize:12,color:"#f59e0b"}}>⚠ Form choices not loaded.</div>}
            <Card title="Progress by Village" theme={theme}><div style={{display:"flex",flexDirection:"column",gap:7}}>{vilSummary.map((v,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:8}}><span style={{width:140,fontSize:11,color:D.text,flexShrink:0,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.village}</span><div style={{flex:1,background:D.bdr,borderRadius:4,height:18,overflow:"hidden",position:"relative",minWidth:40}}><div style={{width:`${v.pct}%`,height:"100%",borderRadius:4,background:v.pct===100?"#10b981":v.pct>60?"#f59e0b":"#ef4444"}}/><span style={{position:"absolute",left:6,top:"50%",transform:"translateY(-50%)",fontSize:9,fontWeight:700,color:"#fff"}}>{v.pct}%</span></div><span style={{width:80,fontSize:10,flexShrink:0,textAlign:"right"}}><span style={{color:"#10b981",fontWeight:700}}>{v.submitted}</span><span style={{color:D.muted}}>/{v.total}</span></span></div>))}</div></Card>
            <Card title="Farm IDs" theme={theme} noPad extra={<div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",padding:"0 14px"}}><select value={pendingVillage} onChange={e=>setPendingVillage(e.target.value)}><option value="all">All</option>{pendingVillages.map(v=><option key={v} value={v}>{v}</option>)}</select><select value={pendingFilter} onChange={e=>setPendingFilter(e.target.value)}><option value="all">All</option><option value="submitted">✅ Done</option><option value="pending">⏳ Pending</option></select><DownloadBtn rows={pendingFiltered.map(r=>({farm_id:r.farm_id,village:r.village,status:r.submitted?"done":"pending"}))} filename="pending" theme={theme}/></div>}>
              <div style={{overflowX:"auto",maxHeight:"50vh",overflowY:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}><thead style={{position:"sticky",top:0,zIndex:5}}><tr style={{borderBottom:`1px solid ${D.bdr}`,background:theme==="light"?"#f8fafc":"#071020"}}>{["Farm ID","Village","Status","Surveyor","Date"].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:D.muted,fontWeight:600}}>{h}</th>)}</tr></thead><tbody>{pendingFiltered.map((r,i)=>{const sub=submissions.find(s=>(s["location/select_farm_id"]||s["ANS/ANS_farm_id"])===r.farm_id);return(<tr key={i} style={{borderBottom:`1px solid ${D.bdr}`,background:i%2===0?D.row1:D.row2}}><td style={{padding:"5px 10px",fontFamily:"monospace",fontSize:10}}>{r.farm_id}</td><td style={{padding:"5px 10px"}}>{r.village}</td><td style={{padding:"5px 10px"}}>{r.submitted?<span className="pill" style={{background:"#10b98122",color:"#10b981"}}>✓</span>:<span className="pill" style={{background:"#ef444422",color:"#ef4444"}}>⏳</span>}</td><td style={{padding:"5px 10px",color:D.muted,fontSize:10}}>{r.surveyor||sub?.["surveyor_info/surveyor_name"]||"-"}</td><td style={{padding:"5px 10px",color:D.muted,fontSize:10}}>{r.date||(sub?.["date_time/survey_date"]||"").slice(0,10)||"-"}</td></tr>);})}</tbody></table>{pendingFiltered.length===0&&<div style={{padding:"16px",textAlign:"center",color:D.muted}}>None.</div>}</div>
            </Card>
          </div>)}
        </div>
      </div>

      {/* EXPAND MODAL */}
      {expandedRow&&(<div onClick={()=>setExpandedRow(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:isMobile?"flex-end":"center",justifyContent:"center",padding:isMobile?0:16}}>
        <div onClick={e=>e.stopPropagation()} style={{background:D.card,border:`1px solid ${D.bdr}`,borderRadius:isMobile?"16px 16px 0 0":"12px",width:"100%",maxWidth:540,maxHeight:isMobile?"85vh":"80vh",overflow:"auto",boxShadow:"0 8px 40px #000a"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${D.bdr}`,position:"sticky",top:0,background:D.card,zIndex:5}}>
            <div>
              <div style={{color:"#0ea5e9",fontWeight:800,fontSize:14,display:"flex",alignItems:"center",gap:4}}>{expandedRow._flags?.length>0&&<span>🚩</span>}{expandedRow["ANS/ANS_farm_id"]||`#${expandedRow._id}`}</div>
              <div style={{color:D.muted,fontSize:10}}>{choiceLabelMap[expandedRow["ANS/ANS_village"]]||expandedRow["ANS/ANS_village"]||""}</div>
            </div>
            <button onClick={()=>setExpandedRow(null)} style={{background:theme==="light"?"#f1f5f9":"#1e293b",border:"none",color:D.text,cursor:"pointer",fontSize:16,width:28,height:28,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
          {expandedRow._flags?.length>0&&<div style={{margin:"10px 16px",background:"#ef444418",border:"1px solid #ef444444",borderRadius:8,padding:"8px 12px"}}>
            <div style={{fontSize:11,color:"#ef4444",fontWeight:700,marginBottom:4}}>🚩 {expandedRow._flags.length} Flag{expandedRow._flags.length>1?"s":""} Detected:</div>
            {expandedRow._flags.map((f,i)=><div key={i} style={{fontSize:11,color:"#ef4444",padding:"2px 0"}}>• {f.label}: <b>{f.issue}</b></div>)}
          </div>}
          <div style={{padding:"8px 16px"}}>
            {Object.entries(expandedRow).filter(([k,v])=>k!=="_flags"&&v!==null&&v!==undefined&&v!=="").map(([k,v])=>(
              <div key={k} style={{display:"flex",gap:10,padding:"5px 0",borderBottom:`1px solid ${D.bdr}22`,alignItems:"flex-start"}}>
                <span style={{color:D.muted,fontSize:9,width:150,flexShrink:0,textTransform:"uppercase",fontFamily:"monospace"}}>{k.replace("ANS/ANS_","").replace("surveyor_info/","").replace("location/","").replace("date_time/","").replace(/_/g," ")}</span>
                <span style={{color:D.text,fontSize:12,fontWeight:500,flex:1,wordBreak:"break-word"}}>{choiceLabelMap[String(v)]||String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>)}
    </>
  );
}
