import { useState, useEffect, useCallback, useRef } from "react";

const API_TOKEN = "cfda7c6ec2ad5c686e180747c4c005995710445a";
const FORM_UID  = "aagjSQnDRWQLs778Ri8AkH";
const HEADERS   = { Authorization: `Token ${API_TOKEN}`, Accept: "application/json" };
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmt = (n, d=1) => Number(n).toFixed(d);
const COLORS = ["#0ea5e9","#ef4444","#f59e0b","#10b981","#8b5cf6","#f97316","#ec4899","#84cc16","#06b6d4","#fb923c"];

const VIL_MAP = {
  LA:"lang", SI:"simbro", SA:"sanour", UC:"ucha_gaon", IN:"inderpura",
  BA:"baddauchhi_kalan", KA:"kalyan", JH:"jhandi", DA:"dakala", LU:"laut",
  KH:"kheri_jattan", KU:"khuda", AL:"allowal", MA:"jhandi", SID:"sidhuwal",
  BH:"bhagwanpura", CH:"chhehartta", RO:"ropar", DR:"dhanauri", FA:"fatehpur",
  IC:"ichalkaranji", AG:"agwanpur"
};

function HBar({ data, xKey, yKey, color="#0ea5e9", theme, maxItems=20 }) {
  if (!data?.length) return null;
  const rows = data.slice(0, maxItems);
  const max = Math.max(...rows.map(d => num(d[yKey])), 1);
  const tc = theme==="light" ? "#374151" : "#e2e8f0";
  const bg = theme==="light" ? "#e5e7eb" : "#1e293b";
  const nameW = Math.max(...rows.map(d => String(d[xKey]).length)) * 7 + 8;
  const labelW = Math.min(Math.max(nameW, 100), 180);
  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {rows.map((d,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{width:labelW,fontSize:12,color:tc,flexShrink:0,textAlign:"right",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={String(d[xKey])}>{d[xKey]}</span>
          <div style={{flex:1,background:bg,borderRadius:4,height:26,overflow:"hidden",position:"relative",minWidth:60}}>
            <div style={{width:`${(num(d[yKey])/max)*100}%`,height:"100%",background:typeof color==="function"?color(i):color,borderRadius:4,transition:"width .5s"}}/>
            <span style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",fontSize:12,fontWeight:700,color:theme==="light"?"#1e293b":"#f1f5f9",textShadow:theme==="light"?"0 0 3px #fff":"0 0 4px #000"}}>
              {typeof d[yKey]==="number"?fmt(d[yKey],1):d[yKey]}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function PieChart({ data, size=150 }) {
  if (!data?.length) return null;
  const total = data.reduce((s,d)=>s+d.value,0);
  let angle = -Math.PI/2;
  const r=size/2-6, cx=size/2, cy=size/2;
  const slices = data.map((d,i)=>{
    const sw=(d.value/total)*2*Math.PI;
    const x1=cx+r*Math.cos(angle),y1=cy+r*Math.sin(angle);
    angle+=sw;
    const x2=cx+r*Math.cos(angle),y2=cy+r*Math.sin(angle);
    return {path:`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${sw>Math.PI?1:0},1 ${x2},${y2} Z`,color:COLORS[i%COLORS.length],label:d.label,value:d.value};
  });
  return (
    <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
      <svg width={size} height={size} style={{flexShrink:0}}>
        {slices.map((s,i)=><path key={i} d={s.path} fill={s.color} opacity="0.9"/>)}
      </svg>
      <div style={{display:"flex",flexDirection:"column",gap:5,flex:1,minWidth:110}}>
        {slices.map((s,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}>
            <div style={{width:10,height:10,borderRadius:2,background:s.color,flexShrink:0}}/>
            <span>{s.label}: <b>{s.value}</b></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// FIX 5: MapView with satellite/street toggle
function MapView({ submissions, selectedId, onSelect, mapLayer }) {
  const ref=useRef(null),mapRef=useRef(null),markersRef=useRef([]),tileRef=useRef(null);

  const SAT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const STR_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  useEffect(()=>{
    if(!ref.current||mapRef.current)return;
    const L=window.L;if(!L)return;
    mapRef.current=L.map(ref.current).setView([30.38,76.38],11);
    tileRef.current=L.tileLayer(SAT_URL,{attribution:"© Esri"}).addTo(mapRef.current);
  },[]);

  useEffect(()=>{
    const L=window.L;if(!L||!mapRef.current||!tileRef.current)return;
    tileRef.current.remove();
    tileRef.current=L.tileLayer(
      mapLayer==='satellite'?SAT_URL:STR_URL,
      {attribution:mapLayer==='satellite'?'© Esri':'© OSM'}
    ).addTo(mapRef.current);
  },[mapLayer]);

  useEffect(()=>{
    const L=window.L;if(!L||!mapRef.current)return;
    markersRef.current.forEach(m=>m.remove());markersRef.current=[];
    submissions.filter(s=>s._geolocation?.length===2&&s._geolocation[0]).forEach(s=>{
      const [lat,lng]=s._geolocation,isSel=s._id===selectedId;
      const icon=L.divIcon({className:"",
        html:`<div style="width:${isSel?18:11}px;height:${isSel?18:11}px;border-radius:50%;background:${isSel?"#f59e0b":"#0ea5e9"};border:2px solid ${isSel?"#ef4444":"#fff"};box-shadow:0 0 ${isSel?14:6}px ${isSel?"#f59e0b":"#0ea5e9"}88"></div>`,
        iconSize:[isSel?18:11,isSel?18:11],iconAnchor:[isSel?9:5,isSel?9:5]});
      const m=L.marker([lat,lng],{icon}).addTo(mapRef.current);
      m.bindPopup(`<div style="font-family:sans-serif;min-width:190px">
        <b style="color:#0ea5e9;font-size:13px">${s["ANS/ANS_farm_id"]||"Farm"}</b>
        <hr style="border-color:#eee;margin:4px 0">
        <table style="font-size:12px;width:100%">
          <tr><td style="color:#888">Village</td><td style="padding-left:6px"><b>${s["ANS/ANS_village"]||"-"}</b></td></tr>
          <tr><td style="color:#888">Surveyor</td><td style="padding-left:6px"><b>${s["surveyor_info/surveyor_name"]||"-"}</b></td></tr>
          <tr><td style="color:#888">Acres</td><td style="padding-left:6px"><b>${s["ANS/ANS_total_acres"]||"-"}</b></td></tr>
          <tr><td style="color:#888">Crops</td><td style="padding-left:6px"><b>${s["ANS/ANS_crops_grown"]||"-"}</b></td></tr>
          <tr><td style="color:#888">Yield/ac</td><td style="padding-left:6px"><b>${s["ANS/ANS_wheat_yield_per_acre"]||"-"} qtl</b></td></tr>
          <tr><td style="color:#888">Date</td><td style="padding-left:6px">${(s["date_time/survey_date"]||"").slice(0,10)}</td></tr>
        </table></div>`);
      m.on("click",()=>onSelect(s._id));
      markersRef.current.push(m);
    });
    if(selectedId){const sel=submissions.find(s=>s._id===selectedId);if(sel?._geolocation)mapRef.current.setView(sel._geolocation,14);}
  },[submissions,selectedId]);

  return <div ref={ref} style={{height:"100%",width:"100%"}}/>;
}

function DownloadBtn({ rows, filename="data", theme }) {
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{
    const fn=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",fn);return()=>document.removeEventListener("mousedown",fn);
  },[]);
  const dlCSV=()=>{
    if(!rows.length)return;
    const k=Object.keys(rows[0]);
    const csv=[k.join(","),...rows.map(r=>k.map(c=>`"${String(r[c]??"").replace(/"/g,'""')}"`).join(","))].join("\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=filename+".csv";a.click();setOpen(false);
  };
  const dlJSON=()=>{
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(rows,null,2)],{type:"application/json"}));a.download=filename+".json";a.click();setOpen(false);
  };
  const dlXLSX=()=>{
    const XLSX=window.XLSX;
    if(!XLSX){alert("XLSX library not loaded yet.");return;}
    const ws=XLSX.utils.json_to_sheet(rows);
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Data");
    XLSX.writeFile(wb,filename+".xlsx");setOpen(false);
  };
  const bg=theme==="light"?"#fff":"#0f172a";
  const border=theme==="light"?"#e2e8f0":"#1e293b";
  const tc=theme==="light"?"#1e293b":"#e2e8f0";
  return (
    <div ref={ref} style={{position:"relative"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{background:theme==="light"?"#eff6ff":"#0f172a",border:"1px solid #0ea5e944",color:"#0ea5e9",padding:"7px 14px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
        ⬇ Download ({rows.length}) <span style={{fontSize:10}}>▾</span>
      </button>
      {open&&(
        <div style={{position:"absolute",right:0,top:"calc(100% + 4px)",background:bg,border:`1px solid ${border}`,borderRadius:8,boxShadow:"0 4px 20px #0004",zIndex:999,minWidth:160,overflow:"hidden"}}>
          {[{icon:"📄",label:"Download CSV",fn:dlCSV,desc:"Spreadsheet"},{icon:"📊",label:"Download XLSX",fn:dlXLSX,desc:"Excel format"},{icon:"🗂",label:"Download JSON",fn:dlJSON,desc:"Raw data"}].map(({icon,label,fn,desc})=>(
            <button key={label} onClick={fn} style={{width:"100%",background:"none",border:"none",padding:"10px 14px",cursor:"pointer",textAlign:"left",display:"flex",flexDirection:"column",gap:1,borderBottom:`1px solid ${border}`,transition:"background .15s"}}
              onMouseEnter={e=>e.currentTarget.style.background=theme==="light"?"#f0f9ff":"#0c2036"}
              onMouseLeave={e=>e.currentTarget.style.background="none"}>
              <span style={{fontSize:13,color:tc,fontWeight:600}}>{icon} {label}</span>
              <span style={{fontSize:10,color:theme==="light"?"#9ca3af":"#64748b"}}>{desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({label,value,unit="",color,icon,theme}){
  const bg=theme==="light"?"#fff":"#0f172a",lc=theme==="light"?"#6b7280":"#64748b";
  return (
    <div style={{background:bg,border:`1px solid ${color}33`,borderRadius:10,padding:"14px 18px",display:"flex",flexDirection:"column",gap:4,flex:1,minWidth:120,boxShadow:theme==="light"?"0 1px 3px #0001":"none"}}>
      <span style={{fontSize:10,color:lc,letterSpacing:1,textTransform:"uppercase"}}>{icon} {label}</span>
      <span style={{fontSize:24,fontWeight:700,color,fontFamily:"monospace"}}>{value}<span style={{fontSize:12,color:lc,marginLeft:4}}>{unit}</span></span>
    </div>
  );
}

function Card({children,title,theme,extra,noPad}){
  const bg=theme==="light"?"#fff":"#0f172a",border=theme==="light"?"#e2e8f0":"#1e293b",tc=theme==="light"?"#6b7280":"#94a3b8";
  return (
    <div style={{background:bg,border:`1px solid ${border}`,borderRadius:10,padding:noPad?0:20,boxShadow:theme==="light"?"0 1px 3px #0001":"none",overflow:"hidden"}}>
      {(title||extra)&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:title?14:0,padding:noPad?"16px 20px 12px":"0"}}>
        {title&&<h3 style={{fontSize:12,color:tc,margin:0,textTransform:"uppercase",letterSpacing:1,fontWeight:700}}>{title}</h3>}
        {extra}
      </div>}
      <div style={{padding:noPad?"0 20px 20px":0}}>{children}</div>
    </div>
  );
}

export default function App() {
  const [submissions,setSubmissions]=useState([]);
  const [formChoices,setFormChoices]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  const [tab,setTab]=useState("overview");
  const [selectedId,setSelectedId]=useState(null);
  const [search,setSearch]=useState("");
  const [visibleCols,setVisibleCols]=useState(null);
  const [selectedRows,setSelectedRows]=useState([]);
  const [leafletLoaded,setLeafletLoaded]=useState(false);
  const [theme,setTheme]=useState("light"); // FIX 7: light default
  const [pendingFilter,setPendingFilter]=useState("all");
  const [pendingVillage,setPendingVillage]=useState("all");
  const [mapLayer,setMapLayer]=useState("satellite"); // FIX 5: satellite default
  const [expandedRow,setExpandedRow]=useState(null); // FIX 4: row expand

  useEffect(()=>{
    document.documentElement.setAttribute("style","overflow-y:scroll;overflow-x:hidden;height:auto;");
    document.body.setAttribute("style","overflow-y:scroll;overflow-x:hidden;height:auto;margin:0;padding:0;");
    const root=document.getElementById("root");if(root)root.setAttribute("style","width:100%;height:auto;overflow:visible;");
  },[]);

  useEffect(()=>{
    if(!window.L){
      const l=document.createElement("link");l.rel="stylesheet";l.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";document.head.appendChild(l);
      const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";s.onload=()=>setLeafletLoaded(true);document.head.appendChild(s);
    } else setLeafletLoaded(true);
    if(!window.XLSX){
      const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";document.head.appendChild(s);
    }
  },[]);

  // FIX 8: cache:'no-store' + ordering newest first
  const fetchData=useCallback(async()=>{
    setLoading(true);setError(null);
    try {
      const metaR=await fetch(`/api/kobo?path=${encodeURIComponent(`/api/v2/assets/${FORM_UID}/?format=json`)}`,{headers:HEADERS,cache:'no-store'});
      if(!metaR.ok)throw new Error(`Meta HTTP ${metaR.status}`);
      const meta=await metaR.json();
      const choices=(meta?.content?.choices)||[];
      setFormChoices(choices.filter(c=>String(c.name||"").match(/PLT_\d+/)));

      // FIX 8: ordering=-_submission_time so newest comes first from API
      let all=[],url=`/api/kobo?path=${encodeURIComponent(`/api/v2/assets/${FORM_UID}/data/?format=json&limit=300&start=0&ordering=-_submission_time`)}`;
      while(url){
        const r=await fetch(url,{headers:HEADERS,cache:'no-store'});
        if(!r.ok)throw new Error(`Data HTTP ${r.status}`);
        const j=await r.json();all=[...all,...(j.results||[])];
        url=j.next?`/api/kobo?path=${encodeURIComponent(j.next.replace("https://kf.kobotoolbox.org",""))}`:null;
      }
      setSubmissions(all);
      if(all.length&&!visibleCols)
        setVisibleCols(["_id","ANS/ANS_farm_id","ANS/ANS_village","surveyor_info/surveyor_name","ANS/ANS_total_acres","ANS/ANS_crops_grown","ANS/ANS_wheat_yield_per_acre","ANS/ANS_wheat_straw","date_time/survey_date","_submission_time"]);
    } catch(e){setError(e.message);}finally{setLoading(false);}
  },[]);

  useEffect(()=>{fetchData();},[fetchData]);
  useEffect(()=>{const t=setInterval(fetchData,300000);return()=>clearInterval(t);},[fetchData]);

  const total=submissions.length;
  const withGPS=submissions.filter(s=>s._geolocation?.[0]).length;
  const avgAcres=total?fmt(submissions.reduce((s,r)=>s+num(r["ANS/ANS_total_acres"]),0)/total):0;
  const totalYield=fmt(submissions.reduce((s,r)=>s+num(r["ANS/ANS_wheat_yield_total"]),0),0);
  const avgYield=total?fmt(submissions.reduce((s,r)=>s+num(r["ANS/ANS_wheat_yield_per_acre"]),0)/total):0;

  const groupCount=(key)=>Object.entries(submissions.reduce((a,r)=>{const k=r[key]||"Unknown";a[k]=(a[k]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).map(([label,value])=>({label,value}));
  const groupAvg=(key,valKey)=>Object.entries(submissions.reduce((acc,r)=>{const k=r[key]||"Unknown";if(!acc[k])acc[k]={t:0,n:0};acc[k].t+=num(r[valKey]);acc[k].n++;return acc;},{})).map(([village,d])=>({village,avg:+(d.t/d.n).toFixed(1)})).sort((a,b)=>b.avg-a.avg);

  const villageData=groupCount("ANS/ANS_village");
  const cropMap={};submissions.forEach(r=>{(r["ANS/ANS_crops_grown"]||"Unknown").split(" ").forEach(c=>{cropMap[c]=(cropMap[c]||0)+1;});});
  const cropData=Object.entries(cropMap).sort((a,b)=>b[1]-a[1]).map(([label,value])=>({label,value}));
  const surveyorData=groupCount("surveyor_info/surveyor_name");
  const strawMap={};submissions.forEach(r=>{(r["ANS/ANS_wheat_straw"]||r["wheat_straw_group/straw_treatment"]||"Unknown").split(" ").forEach(t=>{strawMap[t]=(strawMap[t]||0)+1;});});
  const strawData=Object.entries(strawMap).map(([label,value])=>({label,value}));
  const yieldByVil=groupAvg("ANS/ANS_village","ANS/ANS_wheat_yield_per_acre").slice(0,12);
  const dapByVil=groupAvg("ANS/ANS_village","ANS/ANS_dap_kg_per_acre").slice(0,12);

  const allCols=submissions.length?Object.keys(submissions[0]):[];
  const displayCols=visibleCols||allCols.slice(0,10);

  // FIX 1: newest first in table + FIX 2: duplicate detection
  const farmIdCounts={};
  submissions.forEach(r=>{
    const id=r["ANS/ANS_farm_id"]||r["location/select_farm_id"];
    if(id)farmIdCounts[id]=(farmIdCounts[id]||0)+1;
  });
  const duplicateFarmIds=new Set(Object.keys(farmIdCounts).filter(k=>farmIdCounts[k]>1));
  const duplicateCount=duplicateFarmIds.size;

  // FIX 1: sort newest first
  const filtered=submissions
    .filter(r=>!search||Object.values(r).some(v=>String(v).toLowerCase().includes(search.toLowerCase())))
    .sort((a,b)=>new Date(b._submission_time||0)-new Date(a._submission_time||0));

  const selSub=submissions.find(s=>s._id===selectedId);

  const submittedSet=new Set(submissions.map(r=>r["location/select_farm_id"]||r["ANS/ANS_farm_id"]||"").filter(Boolean));
  let allFarmIds=[];
  if(formChoices.length>0){
    allFarmIds=formChoices.map(c=>{
      const name=c.name||"";
      const vilCode=name.split("_")[0];
      const village=VIL_MAP[vilCode]||c.filter_value||vilCode||"Unknown";
      return {farm_id:name,village,submitted:submittedSet.has(name)};
    });
  } else {
    allFarmIds=[...submittedSet].map(id=>{
      const sub=submissions.find(r=>(r["location/select_farm_id"]||r["ANS/ANS_farm_id"])===id);
      const vc=id.split("_")[0];
      return {farm_id:id,village:sub?.["ANS/ANS_village"]||VIL_MAP[vc]||vc,submitted:true,surveyor:sub?.["surveyor_info/surveyor_name"],date:(sub?.["date_time/survey_date"]||"").slice(0,10)};
    });
  }
  const pendingVillages=[...new Set(allFarmIds.map(r=>r.village))].sort();
  const pendingFiltered=allFarmIds.filter(r=>{
    const vOk=pendingVillage==="all"||r.village===pendingVillage;
    const sOk=pendingFilter==="all"||(pendingFilter==="pending"&&!r.submitted)||(pendingFilter==="submitted"&&r.submitted);
    return vOk&&sOk;
  });
  const pendingCount=allFarmIds.filter(r=>!r.submitted).length;
  const submittedCount=allFarmIds.filter(r=>r.submitted).length;
  const vilSummary=pendingVillages.map(v=>{
    const rows=allFarmIds.filter(r=>r.village===v);
    const sub=rows.filter(r=>r.submitted).length,pen=rows.length-sub;
    return {village:v,total:rows.length,submitted:sub,pending:pen,pct:rows.length?Math.round((sub/rows.length)*100):0};
  }).sort((a,b)=>b.pending-a.pending);

  const D={
    bg:    theme==="light"?"#f1f5f9":"#020817",
    hdr:   theme==="light"?"#ffffff":"#0a1628",
    bdr:   theme==="light"?"#e2e8f0":"#1e293b",
    text:  theme==="light"?"#1e293b":"#e2e8f0",
    muted: theme==="light"?"#6b7280":"#64748b",
    row1:  theme==="light"?"#ffffff":"transparent",
    row2:  theme==="light"?"#f8fafc":"#070e1a",
    inp:   theme==="light"?"#ffffff":"#0f172a",
    card:  theme==="light"?"#ffffff":"#0f172a",
  };

  if(loading)return(
    <div style={{minHeight:"100vh",background:D.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{width:48,height:48,border:"3px solid #0ea5e944",borderTopColor:"#0ea5e9",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
      <p style={{color:"#0ea5e9",fontFamily:"monospace"}}>Loading survey data…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  if(error)return(
    <div style={{minHeight:"100vh",background:D.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <p style={{color:"#ef4444",fontSize:18}}>⚠ {error}</p>
      <button onClick={fetchData} style={{background:"#0ea5e9",color:"#fff",border:"none",padding:"10px 24px",borderRadius:6,cursor:"pointer",fontWeight:700}}>Retry</button>
    </div>
  );

  return (
    <>
      <style>{`
        html,body{margin:0;padding:0;overflow-y:scroll!important;overflow-x:hidden!important;height:auto!important;}
        #root{width:100%;height:auto!important;overflow:visible!important;}
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:6px;height:6px;}
        ::-webkit-scrollbar-track{background:${theme==="light"?"#f1f5f9":"#0f172a"};}
        ::-webkit-scrollbar-thumb{background:${theme==="light"?"#cbd5e1":"#334155"};border-radius:3px;}
        .tab-btn{background:none;border:none;padding:10px 14px;cursor:pointer;font-size:12px;font-weight:600;
          letter-spacing:.5px;border-bottom:2px solid transparent;transition:all .2s;color:${D.muted};white-space:nowrap;}
        .tab-btn.active{color:#0ea5e9;border-bottom-color:#0ea5e9;}
        .tab-btn:hover{color:${D.text};}
        .trow:hover td{background:${theme==="light"?"#f0f9ff!important":"#0c2036!important"};}
        .trow{cursor:pointer;}
        select{background:${D.inp};color:${D.text};border:1px solid ${D.bdr};padding:6px 10px;border-radius:6px;font-size:12px;outline:none;cursor:pointer;}
        /* FIX 6: Mobile responsive */
        @media(max-width:640px){
          .stat-row{flex-direction:column!important;}
          .stat-row > div{min-width:unset!important;width:100%!important;}
          .chart-grid{grid-template-columns:1fr!important;}
          .pie-grid{grid-template-columns:1fr!important;}
          .map-grid{grid-template-columns:1fr!important;height:auto!important;}
          .map-sidebar{display:none!important;}
          .hdr-title{font-size:14px!important;}
          .tab-scroll{overflow-x:auto;}
          .body-pad{padding:12px!important;}
          .hdr-pad{padding:0 12px!important;}
        }
        @media(max-width:480px){
          .tab-btn{padding:8px 10px;font-size:11px;}
        }
      `}</style>

      <div style={{background:D.bg,color:D.text,fontFamily:"'Segoe UI',system-ui,sans-serif",width:"100%",minHeight:"100vh"}}>

        {/* HEADER */}
        <div className="hdr-pad" style={{borderBottom:`1px solid ${D.bdr}`,padding:"0 24px",background:D.hdr,position:"sticky",top:0,zIndex:200,width:"100%",boxShadow:theme==="light"?"0 1px 6px #0001":"none"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:12,gap:8,flexWrap:"wrap"}}>
            <div>
              <h1 className="hdr-title" style={{fontSize:17,fontWeight:800,color:"#0ea5e9",margin:0}}>🌾 KoboToolbox Field Survey Dashboard</h1>
              <p style={{fontSize:11,color:D.muted,marginTop:2}}>{total} submissions · {withGPS} GPS · {pendingCount} pending{duplicateCount>0?` · ⚠ ${duplicateCount} duplicates`:""}</p>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
              <button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")}
                style={{background:theme==="light"?"#1e293b":"#f1f5f9",color:theme==="light"?"#f1f5f9":"#1e293b",border:"none",padding:"6px 12px",borderRadius:20,cursor:"pointer",fontSize:11,fontWeight:700}}>
                {theme==="dark"?"☀":"🌙"}
              </button>
              <button onClick={fetchData}
                style={{background:"#0ea5e922",border:"1px solid #0ea5e944",color:"#0ea5e9",padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:600}}>
                ↺ Refresh
              </button>
            </div>
          </div>
          <div className="tab-scroll" style={{display:"flex",gap:0,marginTop:6,overflowX:"auto"}}>
            {["overview","analytics","map","table","pending"].map(t=>(
              <button key={t} className={`tab-btn${tab===t?" active":""}`} onClick={()=>setTab(t)}>
                {t==="pending"?`⏳ PENDING (${pendingCount})`:t==="table"&&duplicateCount>0?`TABLE ⚠${duplicateCount}`:t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="body-pad" style={{padding:20,width:"100%"}}>

          {/* OVERVIEW */}
          {tab==="overview"&&(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div className="stat-row" style={{display:"flex",flexWrap:"wrap",gap:10}}>
                <StatCard label="Total Submissions" value={total} color="#0ea5e9" icon="📋" theme={theme}/>
                <StatCard label="With GPS" value={withGPS} color="#10b981" icon="📍" theme={theme}/>
                <StatCard label="Avg Farm Size" value={avgAcres} unit="acres" color="#f59e0b" icon="🌾" theme={theme}/>
                <StatCard label="Total Yield" value={totalYield} unit="qtl" color="#8b5cf6" icon="🌿" theme={theme}/>
                <StatCard label="Avg Yield/Acre" value={avgYield} unit="qtl" color="#10b981" icon="📊" theme={theme}/>
                <StatCard label="Villages" value={villageData.length} color="#ec4899" icon="🏘" theme={theme}/>
              </div>
              <div className="chart-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:14}}>
                <Card title="Submissions by Surveyor" theme={theme}><HBar data={surveyorData} xKey="label" yKey="value" color="#0ea5e9" theme={theme}/></Card>
                <Card title="Avg Wheat Yield / Acre by Village (quintals)" theme={theme}><HBar data={yieldByVil} xKey="village" yKey="avg" color="#10b981" theme={theme}/></Card>
              </div>
              <div className="pie-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:14}}>
                <Card title="Crop Distribution" theme={theme}><PieChart data={cropData.slice(0,5)}/></Card>
                <Card title="Submissions by Village" theme={theme}><PieChart data={villageData.slice(0,7)}/></Card>
                <Card title="Straw Treatment" theme={theme}><PieChart data={strawData}/></Card>
              </div>
              <Card title="Avg DAP Usage (kg/acre) by Village" theme={theme}>
                <HBar data={dapByVil} xKey="village" yKey="avg" color="#8b5cf6" theme={theme}/>
              </Card>
            </div>
          )}

          {/* ANALYTICS */}
          {tab==="analytics"&&(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div className="chart-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:14}}>
                <Card title="Submissions per Village" theme={theme}><HBar data={villageData} xKey="label" yKey="value" color="#0ea5e9" theme={theme} maxItems={25}/></Card>
                <Card title="Surveyor Activity" theme={theme}><HBar data={surveyorData} xKey="label" yKey="value" color="#f59e0b" theme={theme}/></Card>
              </div>
              <Card title="Key Metrics by Village" theme={theme}>
                <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:700}}>
                    <thead><tr style={{borderBottom:`1px solid ${D.bdr}`,background:theme==="light"?"#f8fafc":"#071020"}}>
                      {["Village","Surveys","Avg Acres","Avg Yield/Acre","Avg Irrigations","Avg DAP kg/ac","Avg Urea kg"].map(h=>(
                        <th key={h} style={{padding:"8px 14px",textAlign:"left",color:D.muted,fontWeight:600,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {Object.entries(submissions.reduce((acc,r)=>{
                        const v=r["ANS/ANS_village"]||"Unknown";
                        if(!acc[v])acc[v]={n:0,ac:0,yi:0,ir:0,dap:0,urea:0};
                        acc[v].n++;acc[v].ac+=num(r["ANS/ANS_total_acres"]);acc[v].yi+=num(r["ANS/ANS_wheat_yield_per_acre"]);
                        acc[v].ir+=num(r["ANS/ANS_wheat_irrigations"]);acc[v].dap+=num(r["ANS/ANS_dap_kg_per_acre"]);acc[v].urea+=num(r["ANS/ANS_urea_total_kg"]);
                        return acc;
                      },{})).sort((a,b)=>b[1].n-a[1].n).map(([v,d],i)=>(
                        <tr key={i} className="trow" style={{borderBottom:`1px solid ${D.bdr}`,background:i%2===0?D.row1:D.row2}}>
                          <td style={{padding:"8px 14px",color:D.text,fontWeight:600,whiteSpace:"nowrap"}}>{v}</td>
                          <td style={{padding:"8px 14px",color:"#0ea5e9",fontWeight:700}}>{d.n}</td>
                          <td style={{padding:"8px 14px",color:"#f59e0b"}}>{fmt(d.ac/d.n)}</td>
                          <td style={{padding:"8px 14px",color:"#10b981",fontWeight:600}}>{fmt(d.yi/d.n)}</td>
                          <td style={{padding:"8px 14px",color:"#8b5cf6"}}>{fmt(d.ir/d.n)}</td>
                          <td style={{padding:"8px 14px",color:"#f97316"}}>{fmt(d.dap/d.n,0)}</td>
                          <td style={{padding:"8px 14px",color:"#ec4899"}}>{fmt(d.urea/d.n,0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* MAP - FIX 5: satellite toggle */}
          {tab==="map"&&(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {/* Map layer toggle */}
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:12,color:D.muted,fontWeight:600}}>Map Style:</span>
                {["satellite","street"].map(l=>(
                  <button key={l} onClick={()=>setMapLayer(l)}
                    style={{padding:"5px 14px",borderRadius:20,border:"1px solid",fontSize:12,fontWeight:600,cursor:"pointer",
                      borderColor:mapLayer===l?"#0ea5e9":D.bdr,
                      background:mapLayer===l?"#0ea5e922":"transparent",
                      color:mapLayer===l?"#0ea5e9":D.muted}}>
                    {l==="satellite"?"🛰 Satellite":"🗺 Street"}
                  </button>
                ))}
                <span style={{fontSize:11,color:D.muted,marginLeft:"auto"}}>{submissions.filter(s=>s._geolocation?.[0]).length} GPS points</span>
              </div>
              <div className="map-grid" style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:14,height:"calc(100vh - 220px)"}}>
                <div className="map-sidebar" style={{display:"flex",flexDirection:"column",background:D.card,border:`1px solid ${D.bdr}`,borderRadius:10,overflow:"hidden"}}>
                  <div style={{padding:"10px 14px",borderBottom:`1px solid ${D.bdr}`,fontSize:11,color:D.muted,fontWeight:700,letterSpacing:1}}>
                    📍 LOCATIONS
                  </div>
                  <div style={{overflowY:"auto",flex:1}}>
                    {submissions.filter(s=>s._geolocation?.[0]).map(s=>(
                      <div key={s._id} onClick={()=>setSelectedId(s._id===selectedId?null:s._id)}
                        style={{padding:"9px 14px",borderBottom:`1px solid ${D.bdr}`,cursor:"pointer",
                          background:s._id===selectedId?(theme==="light"?"#eff6ff":"#0f2a4a"):"transparent",
                          borderLeft:s._id===selectedId?"3px solid #0ea5e9":"3px solid transparent",transition:"all .15s"}}>
                        <div style={{fontSize:11,fontWeight:700,color:s._id===selectedId?"#0ea5e9":D.text}}>{s["ANS/ANS_farm_id"]||"Farm"}</div>
                        <div style={{fontSize:10,color:D.muted,marginTop:1}}>{s["ANS/ANS_village"]||"-"} · {s["surveyor_info/surveyor_name"]||"-"}</div>
                      </div>
                    ))}
                  </div>
                  {selSub&&(
                    <div style={{padding:12,borderTop:`1px solid ${D.bdr}`,background:theme==="light"?"#f8fafc":"#071020",fontSize:11}}>
                      <div style={{color:"#0ea5e9",fontWeight:800,marginBottom:6,fontSize:12}}>{selSub["ANS/ANS_farm_id"]}</div>
                      {[["Village",selSub["ANS/ANS_village"]],["Surveyor",selSub["surveyor_info/surveyor_name"]],["Acres",selSub["ANS/ANS_total_acres"]],["Crops",selSub["ANS/ANS_crops_grown"]],["Yield/Acre",selSub["ANS/ANS_wheat_yield_per_acre"]+" qtl"]].map(([k,v])=>(
                        <div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:4,gap:8}}>
                          <span style={{color:D.muted,flexShrink:0}}>{k}</span>
                          <span style={{color:D.text,fontWeight:600,textAlign:"right"}}>{v||"-"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{borderRadius:10,overflow:"hidden",border:`1px solid ${D.bdr}`}}>
                  {leafletLoaded
                    ?<MapView submissions={submissions} selectedId={selectedId} onSelect={setSelectedId} mapLayer={mapLayer}/>
                    :<div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:D.muted}}>Loading map…</div>}
                </div>
              </div>
            </div>
          )}

          {/* TABLE - FIX 1,2,3,4 */}
          {tab==="table"&&(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>

              {/* FIX 2: Duplicate warning banner */}
              {duplicateCount>0&&(
                <div style={{background:theme==="light"?"#fef3c7":"#1c1a00",border:"1px solid #f59e0b66",borderRadius:8,padding:"12px 16px",fontSize:13,color:"#f59e0b",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <span style={{fontSize:16}}>⚠️</span>
                  <strong>{duplicateCount} Farm ID{duplicateCount>1?"s have":"has"} been submitted more than once.</strong>
                  <span style={{fontSize:12}}>Duplicates are highlighted in orange below. Click any row to inspect.</span>
                </div>
              )}

              <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search all columns…"
                  style={{background:D.inp,border:`1px solid ${D.bdr}`,color:D.text,padding:"8px 14px",borderRadius:6,fontSize:13,flex:1,minWidth:200,outline:"none"}}/>
                <span style={{fontSize:12,color:D.muted,whiteSpace:"nowrap"}}>{filtered.length} rows · newest first</span>
                <DownloadBtn rows={selectedRows.length?filtered.filter(r=>selectedRows.includes(r._id)):filtered} filename="survey_data" theme={theme}/>
              </div>

              {/* Column picker */}
              <Card theme={theme} title="Show / Hide Columns">
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {allCols.filter(c=>!c.startsWith("harv_win")).map(c=>(
                    <label key={c} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:D.text,cursor:"pointer",
                      background:displayCols.includes(c)?(theme==="light"?"#dbeafe":"#0c2036"):(theme==="light"?"#f8fafc":"#0a1628"),
                      padding:"3px 8px",borderRadius:4,border:`1px solid ${displayCols.includes(c)?"#0ea5e966":D.bdr}`}}>
                      <input type="checkbox" checked={displayCols.includes(c)}
                        onChange={e=>setVisibleCols(e.target.checked?[...displayCols,c]:displayCols.filter(x=>x!==c))}/>
                      {c.replace("ANS/ANS_","").replace("surveyor_info/","").replace("location/","").replace("date_time/","")}
                    </label>
                  ))}
                </div>
              </Card>

              {/* FIX 3: Table with proper horizontal scroll */}
              <div style={{background:D.card,border:`1px solid ${D.bdr}`,borderRadius:10,overflow:"hidden"}}>
                <div style={{padding:"6px 14px",borderBottom:`1px solid ${D.bdr}`,fontSize:11,color:D.muted,display:"flex",alignItems:"center",gap:6,background:theme==="light"?"#f8fafc":"#071020",flexWrap:"wrap"}}>
                  <span>👆 Click any row to expand full details</span>
                  <span style={{marginLeft:"auto",color:D.muted}}>
                    {selectedRows.length>0&&<span style={{color:"#0ea5e9",fontWeight:600}}>{selectedRows.length} selected · </span>}
                    {filtered.length} rows
                  </span>
                </div>
                {/* FIX 3: Proper scroll container */}
                <div style={{overflowX:"scroll",overflowY:"auto",maxHeight:"60vh",WebkitOverflowScrolling:"touch",position:"relative"}}>
                  <table style={{borderCollapse:"collapse",fontSize:12,tableLayout:"auto",whiteSpace:"nowrap"}}>
                    <thead style={{position:"sticky",top:0,zIndex:10}}>
                      <tr style={{borderBottom:`1px solid ${D.bdr}`,background:theme==="light"?"#f8fafc":"#071020"}}>
                        <th style={{padding:"10px 14px",width:40,textAlign:"left",position:"sticky",left:0,background:theme==="light"?"#f8fafc":"#071020",zIndex:11}}>
                          <input type="checkbox"
                            onChange={e=>setSelectedRows(e.target.checked?filtered.map(r=>r._id):[])}
                            checked={selectedRows.length===filtered.length&&filtered.length>0}/>
                        </th>
                        {/* FIX 2: Duplicate indicator column */}
                        <th style={{padding:"10px 8px",textAlign:"left",color:D.muted,fontWeight:600,fontSize:11,position:"sticky",left:40,background:theme==="light"?"#f8fafc":"#071020",zIndex:11}}>⚠</th>
                        {displayCols.map(c=>(
                          <th key={c} style={{padding:"10px 14px",textAlign:"left",color:D.muted,fontWeight:600,fontSize:11,letterSpacing:.3}}>
                            {c.replace("ANS/ANS_","").replace("surveyor_info/","").replace("location/","").replace("date_time/","").replace(/_/g," ").toUpperCase()}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0,300).map((r,i)=>{
                        const farmId=r["ANS/ANS_farm_id"]||r["location/select_farm_id"];
                        const isDup=farmId&&duplicateFarmIds.has(farmId);
                        return (
                          // FIX 4: click row to expand
                          <tr key={r._id} className="trow"
                            onClick={()=>setExpandedRow(r)}
                            style={{borderBottom:`1px solid ${D.bdr}`,
                              background:isDup?(theme==="light"?"#fef9c3":"#2d2200"):i%2===0?D.row1:D.row2}}>
                            <td style={{padding:"7px 14px",position:"sticky",left:0,background:isDup?(theme==="light"?"#fef9c3":"#2d2200"):i%2===0?D.row1:D.row2,zIndex:1}}
                              onClick={e=>{e.stopPropagation();setSelectedRows(s=>s.includes(r._id)?s.filter(x=>x!==r._id):[...s,r._id])}}>
                              <input type="checkbox" checked={selectedRows.includes(r._id)} onChange={()=>{}} onClick={e=>e.stopPropagation()}/>
                            </td>
                            <td style={{padding:"7px 8px",position:"sticky",left:40,background:isDup?(theme==="light"?"#fef9c3":"#2d2200"):i%2===0?D.row1:D.row2,zIndex:1,fontSize:14}}>
                              {isDup?"⚠️":""}
                            </td>
                            {displayCols.map(c=>(
                              <td key={c} style={{padding:"7px 14px",color:D.text,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis"}}>
                                {String(r[c]??"")}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {filtered.length>300&&<div style={{padding:"8px 16px",fontSize:11,color:D.muted,borderTop:`1px solid ${D.bdr}`}}>
                  Showing 300 of {filtered.length} rows. Use search to filter.
                </div>}
              </div>
            </div>
          )}

          {/* PENDING */}
          {tab==="pending"&&(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div className="stat-row" style={{display:"flex",flexWrap:"wrap",gap:10}}>
                <StatCard label="Total Farm IDs" value={allFarmIds.length} color="#0ea5e9" icon="🗂" theme={theme}/>
                <StatCard label="Submitted" value={submittedCount} color="#10b981" icon="✅" theme={theme}/>
                <StatCard label="Pending" value={pendingCount} color="#ef4444" icon="⏳" theme={theme}/>
                <StatCard label="Completion" value={allFarmIds.length?Math.round((submittedCount/allFarmIds.length)*100):0} unit="%" color="#f59e0b" icon="📈" theme={theme}/>
              </div>
              {formChoices.length===0&&(
                <div style={{background:theme==="light"?"#fef3c7":"#1c1a00",border:"1px solid #f59e0b44",borderRadius:8,padding:"14px 18px",fontSize:13,color:"#f59e0b"}}>
                  ⚠ Form choice list not loaded — showing only submitted Farm IDs.
                </div>
              )}
              <Card title="Completion Progress by Village" theme={theme}>
                <div style={{display:"flex",flexDirection:"column",gap:9}}>
                  {vilSummary.map((v,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{width:160,fontSize:12,color:D.text,flexShrink:0,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={v.village}>{v.village}</span>
                      <div style={{flex:1,background:D.bdr,borderRadius:4,height:22,overflow:"hidden",position:"relative",minWidth:60}}>
                        <div style={{width:`${v.pct}%`,height:"100%",borderRadius:4,transition:"width .6s",background:v.pct===100?"#10b981":v.pct>60?"#f59e0b":"#ef4444"}}/>
                        <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",fontSize:11,fontWeight:700,color:"#fff"}}>{v.pct}%</span>
                      </div>
                      <span style={{width:100,fontSize:11,flexShrink:0,textAlign:"right"}}>
                        <span style={{color:"#10b981",fontWeight:700}}>{v.submitted}</span>
                        <span style={{color:D.muted}}> / {v.total}</span>
                        {v.pending>0&&<span style={{color:"#ef4444",marginLeft:4,fontWeight:700}}>(-{v.pending})</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="Farm ID Detail" theme={theme} noPad extra={
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",padding:"0 20px"}}>
                  <select value={pendingVillage} onChange={e=>setPendingVillage(e.target.value)}>
                    <option value="all">All Villages</option>
                    {pendingVillages.map(v=><option key={v} value={v}>{v}</option>)}
                  </select>
                  <select value={pendingFilter} onChange={e=>setPendingFilter(e.target.value)}>
                    <option value="all">All ({allFarmIds.length})</option>
                    <option value="submitted">Submitted ({submittedCount})</option>
                    <option value="pending">Pending ({pendingCount})</option>
                  </select>
                  <DownloadBtn rows={pendingFiltered.map(r=>({farm_id:r.farm_id,village:r.village,status:r.submitted?"submitted":"pending",...(r.surveyor?{surveyor:r.surveyor,date:r.date}:{})}))} filename="pending_farm_ids" theme={theme}/>
                </div>
              }>
                <div style={{overflowX:"auto",maxHeight:"55vh",overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead style={{position:"sticky",top:0,zIndex:5}}>
                      <tr style={{borderBottom:`1px solid ${D.bdr}`,background:theme==="light"?"#f8fafc":"#071020"}}>
                        {["Farm ID","Village","Status","Surveyor","Survey Date"].map(h=>(
                          <th key={h} style={{padding:"8px 14px",textAlign:"left",color:D.muted,fontWeight:600,whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pendingFiltered.map((r,i)=>{
                        const sub=submissions.find(s=>(s["location/select_farm_id"]||s["ANS/ANS_farm_id"])===r.farm_id);
                        return (
                          <tr key={i} className="trow" style={{borderBottom:`1px solid ${D.bdr}`,background:i%2===0?D.row1:D.row2}}>
                            <td style={{padding:"7px 14px",color:D.text,fontFamily:"monospace",fontSize:11,fontWeight:500}}>{r.farm_id}</td>
                            <td style={{padding:"7px 14px",color:D.text,whiteSpace:"nowrap"}}>{r.village}</td>
                            <td style={{padding:"7px 14px"}}>
                              {r.submitted
                                ?<span style={{background:"#10b98122",color:"#10b981",padding:"2px 10px",borderRadius:10,fontSize:11,fontWeight:700}}>✓ Submitted</span>
                                :<span style={{background:"#ef444422",color:"#ef4444",padding:"2px 10px",borderRadius:10,fontSize:11,fontWeight:700}}>⏳ Pending</span>}
                            </td>
                            <td style={{padding:"7px 14px",color:D.muted,fontSize:11}}>{r.surveyor||sub?.["surveyor_info/surveyor_name"]||"-"}</td>
                            <td style={{padding:"7px 14px",color:D.muted,fontSize:11}}>{r.date||(sub?.["date_time/survey_date"]||"").slice(0,10)||"-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {pendingFiltered.length===0&&<div style={{padding:"24px",textAlign:"center",color:D.muted}}>No records match.</div>}
                </div>
              </Card>
            </div>
          )}

        </div>
      </div>

      {/* FIX 4: Row expand modal */}
      {expandedRow&&(
        <div onClick={()=>setExpandedRow(null)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:D.card,border:`1px solid ${D.bdr}`,borderRadius:14,width:"100%",maxWidth:580,maxHeight:"85vh",overflow:"auto",boxShadow:"0 8px 40px #0008"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:`1px solid ${D.bdr}`,position:"sticky",top:0,background:D.card,zIndex:5}}>
              <div>
                <div style={{color:"#0ea5e9",fontWeight:800,fontSize:15}}>{expandedRow["ANS/ANS_farm_id"]||`Submission #${expandedRow._id}`}</div>
                <div style={{color:D.muted,fontSize:11,marginTop:2}}>{expandedRow["ANS/ANS_village"]||""} · {(expandedRow["date_time/survey_date"]||"").slice(0,10)||""}</div>
              </div>
              <button onClick={()=>setExpandedRow(null)}
                style={{background:theme==="light"?"#f1f5f9":"#1e293b",border:"none",color:D.text,cursor:"pointer",fontSize:18,width:32,height:32,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>
            <div style={{padding:"16px 20px"}}>
              {Object.entries(expandedRow).filter(([k,v])=>v!==null&&v!==undefined&&v!=="").map(([k,v])=>(
                <div key={k} style={{display:"flex",gap:12,padding:"7px 0",borderBottom:`1px solid ${D.bdr}22`,alignItems:"flex-start"}}>
                  <span style={{color:D.muted,fontSize:11,width:180,flexShrink:0,paddingTop:1,fontFamily:"monospace"}}>
                    {k.replace("ANS/ANS_","").replace("surveyor_info/","").replace("location/","").replace("date_time/","").replace(/_/g," ").toUpperCase()}
                  </span>
                  <span style={{color:D.text,fontSize:13,wordBreak:"break-all",flex:1,fontWeight:500}}>{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
