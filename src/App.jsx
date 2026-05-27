import { useState, useEffect, useCallback, useRef } from "react";

const API_TOKEN = "cfda7c6ec2ad5c686e180747c4c005995710445a";
const FORM_UID  = "aagjSQnDRWQLs778Ri8AkH";
const HEADERS   = { Authorization: `Token ${API_TOKEN}`, Accept: "application/json" };
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmt = (n, d=1) => Number(n).toFixed(d);
const median = (arr) => { if(!arr.length)return 0; const s=[...arr].sort((a,b)=>a-b); return s.length%2?s[Math.floor(s.length/2)]:(s[s.length/2-1]+s[s.length/2])/2; };
const COLORS = ["#0ea5e9","#ef4444","#f59e0b","#10b981","#8b5cf6","#f97316","#ec4899","#84cc16","#06b6d4","#fb923c"];
const SAT_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const STR_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const RED_FLAG_RULES = [
  { match: /total_acres/i, label: "Total Acres", max: 30, min: null },
  { match: /yield_per_acre/i, label: "Yield/Acre (qtl)", min: 15, max: 27 },
  { match: /bigha/i, label: "Bigha/Acre", min: 4.45, max: 6.25 },
  { match: /keara|kera/i, label: "Keara", min: 2, max: 7 },
  { match: /wheat_irrigations|total_irrigation/i, label: "Irrigations", min: 2, max: 6 },
  { match: /irrigation.*day|days.*irrigation|days_per/i, label: "Days/Irrigation", min: 5, max: 8 },
  { match: /irrigation.*hour|hours.*irrig/i, label: "Irrigation Hrs", min: 18, max: 26 },
  { match: /dap_kg_per_acre|dap.*per.*acre/i, label: "DAP kg/Acre", min: 40, max: 70 },
  { match: /urea.*bag|bags.*urea|urea_total_bags/i, label: "Urea Bags", min: 2, max: 4 },
  { match: /urea.*kg.*bag|kg_per_bag|urea_bag.*kg/i, label: "Urea Bag Size (kg)", min: 45, max: 50 },
];

function getFlags(sub) {
  const flags = [], checked = new Set();
  // Flag: no farm ID selected
  const fid = sub["ANS/ANS_farm_id"]||sub["location/select_farm_id"]||"";
  if(!fid.trim()) flags.push({field:"ANS/ANS_farm_id",label:"No Farm ID",value:"",issue:"Farm ID is missing"});
  for (const rule of RED_FLAG_RULES) {
    for (const [k, v] of Object.entries(sub)) {
      if (k.startsWith("_") || checked.has(rule.label)) continue;
      if (rule.match.test(k) && v !== null && v !== undefined && v !== "") {
        const n = num(v);
        if (n > 0) { checked.add(rule.label);
          if (rule.max !== null && n > rule.max) flags.push({ field: k, label: rule.label, value: n, issue: `${n} > max ${rule.max}` });
          else if (rule.min !== null && n < rule.min) flags.push({ field: k, label: rule.label, value: n, issue: `${n} < min ${rule.min}` }); }
      }
    }
  }
  return flags;
}

function loadLS(k,fb){try{return JSON.parse(localStorage.getItem(k))||fb;}catch{return fb;}}
function saveLS(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}

// ── Mini Map in modal ──────────────────────────────────────────────────
function MiniMap({lat,lng}){
  const ref=useRef(null),mi=useRef(null);
  useEffect(()=>{
    if(!ref.current||!window.L)return;
    if(mi.current){mi.current.remove();mi.current=null;}
    mi.current=window.L.map(ref.current,{zoomControl:false,attributionControl:false,dragging:true,scrollWheelZoom:false}).setView([lat,lng],15);
    window.L.tileLayer(SAT_URL,{maxZoom:19}).addTo(mi.current);
    window.L.circleMarker([lat,lng],{radius:9,color:'#fff',fillColor:'#0ea5e9',fillOpacity:1,weight:2}).addTo(mi.current);
    return()=>{if(mi.current){mi.current.remove();mi.current=null;}};
  },[lat,lng]);
  return(<div style={{margin:"8px 0"}}>
    <div ref={ref} style={{height:150,borderRadius:8,overflow:"hidden",border:"1px solid #0ea5e933"}}/>
    <a href={`https://maps.google.com/?q=${lat},${lng}`} target="_blank" rel="noreferrer" style={{fontSize:10,color:"#0ea5e9",display:"block",textAlign:"right",marginTop:3}}>Open in Google Maps ↗</a>
  </div>);
}

// ── Map list view ──────────────────────────────────────────────────────
function MapView({submissions,selectedId,onSelect,mapLayer,isVisible}){
  const ref=useRef(null),mapRef=useRef(null),markersRef=useRef([]),tileRef=useRef(null);
  useEffect(()=>{if(!ref.current||mapRef.current)return;const L=window.L;if(!L)return;mapRef.current=L.map(ref.current,{zoomControl:true,tap:true}).setView([30.38,76.38],11);tileRef.current=L.tileLayer(SAT_URL,{attribution:"© Esri",maxZoom:19}).addTo(mapRef.current);setTimeout(()=>{if(mapRef.current)mapRef.current.invalidateSize();},300);},[]);
  useEffect(()=>{if(isVisible&&mapRef.current)setTimeout(()=>mapRef.current.invalidateSize(),200);},[isVisible]);
  useEffect(()=>{const L=window.L;if(!L||!mapRef.current||!tileRef.current)return;tileRef.current.remove();tileRef.current=L.tileLayer(mapLayer==='satellite'?SAT_URL:STR_URL,{attribution:mapLayer==='satellite'?'© Esri':'© OSM',maxZoom:19}).addTo(mapRef.current);},[mapLayer]);
  useEffect(()=>{const L=window.L;if(!L||!mapRef.current)return;markersRef.current.forEach(m=>m.remove());markersRef.current=[];submissions.filter(s=>s._geolocation?.length===2&&s._geolocation[0]).forEach(s=>{const[lat,lng]=s._geolocation,isSel=s._id===selectedId;const fl=getFlags(s);const dc=isSel?"#f59e0b":fl.length>0?"#ef4444":"#0ea5e9";const icon=L.divIcon({className:"",html:`<div style="width:${isSel?20:12}px;height:${isSel?20:12}px;border-radius:50%;background:${dc};border:2px solid #fff;box-shadow:0 2px 8px #0006"></div>`,iconSize:[isSel?20:12,isSel?20:12],iconAnchor:[isSel?10:6,isSel?10:6]});const m=L.marker([lat,lng],{icon}).addTo(mapRef.current);m.on("click",()=>onSelect(s._id===selectedId?null:s._id));markersRef.current.push(m);});if(selectedId){const sel=submissions.find(s=>s._id===selectedId);if(sel?._geolocation)mapRef.current.flyTo(sel._geolocation,14,{duration:1});}},[submissions,selectedId]);
  return<div ref={ref} style={{height:"100%",width:"100%",minHeight:300}}/>;
}

function DlBtn({rows,filename,theme}){const[o,sO]=useState(false);const ref=useRef(null);useEffect(()=>{const fn=e=>{if(ref.current&&!ref.current.contains(e.target))sO(false);};document.addEventListener("mousedown",fn);return()=>document.removeEventListener("mousedown",fn);},[]);const dlCSV=()=>{if(!rows.length)return;const k=Object.keys(rows[0]);const csv=[k.join(","),...rows.map(r=>k.map(c=>`"${String(r[c]??"").replace(/"/g,'""')}"`).join(","))].join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=(filename||"data")+".csv";a.click();sO(false);};const dlX=()=>{const X=window.XLSX;if(!X)return;const ws=X.utils.json_to_sheet(rows);const wb=X.utils.book_new();X.utils.book_append_sheet(wb,ws,"Data");X.writeFile(wb,(filename||"data")+".xlsx");sO(false);};const bg=theme==="light"?"#fff":"#0f172a",bd=theme==="light"?"#e2e8f0":"#1e293b",tc=theme==="light"?"#1e293b":"#e2e8f0";return(<div ref={ref} style={{position:"relative"}}><button onClick={()=>sO(x=>!x)} style={{background:theme==="light"?"#eff6ff":"#0f172a",border:"1px solid #0ea5e944",color:"#0ea5e9",padding:"5px 10px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:600}}>⬇ {rows.length}</button>{o&&<div style={{position:"absolute",right:0,top:"calc(100% + 4px)",background:bg,border:`1px solid ${bd}`,borderRadius:8,boxShadow:"0 4px 20px #0004",zIndex:999,minWidth:120}}>{[{l:"CSV",fn:dlCSV},{l:"XLSX",fn:dlX}].map(({l,fn})=><button key={l} onClick={fn} style={{width:"100%",background:"none",border:"none",padding:"8px 14px",cursor:"pointer",color:tc,fontSize:12,fontWeight:600,borderBottom:`1px solid ${bd}`,textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=theme==="light"?"#f0f9ff":"#0c2036"} onMouseLeave={e=>e.currentTarget.style.background="none"}>{l}</button>)}</div>}</div>);}
function Stat({label,value,unit="",color,icon,theme}){const bg=theme==="light"?"#fff":"#0f172a",lc=theme==="light"?"#6b7280":"#64748b";return(<div style={{background:bg,border:`1px solid ${color}33`,borderRadius:10,padding:"11px 14px",display:"flex",flexDirection:"column",gap:3,flex:1,minWidth:100}}><span style={{fontSize:9,color:lc,letterSpacing:1,textTransform:"uppercase"}}>{icon} {label}</span><span style={{fontSize:20,fontWeight:700,color,fontFamily:"monospace"}}>{value}<span style={{fontSize:10,color:lc,marginLeft:2}}>{unit}</span></span></div>);}
function Card({children,title,theme,extra,noPad}){const bg=theme==="light"?"#fff":"#0f172a",border=theme==="light"?"#e2e8f0":"#1e293b",tc=theme==="light"?"#6b7280":"#94a3b8";return(<div style={{background:bg,border:`1px solid ${border}`,borderRadius:10,padding:noPad?0:18,overflow:"hidden"}}>{(title||extra)&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:title?12:0,padding:noPad?"12px 16px 8px":"0",flexWrap:"wrap",gap:6}}>{title&&<h3 style={{fontSize:11,color:tc,margin:0,textTransform:"uppercase",letterSpacing:1,fontWeight:700}}>{title}</h3>}{extra}</div>}<div style={{padding:noPad?"0 16px 16px":0}}>{children}</div></div>);}

export default function App() {
  const [submissions,setSub]=useState([]);
  const [formChoices,setFC]=useState([]);
  const [choiceLabelMap,setCLM]=useState({});
  const [surveyLabelMap,setSLM]=useState({}); // question name → label
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  const [tab,setTab]=useState("overview");
  const [selectedId,setSelId]=useState(null);
  const [search,setSearch]=useState("");
  const [visibleCols,setVC]=useState(null);
  const [selectedRows,setSelRows]=useState([]);
  const [leafletLoaded,setLL]=useState(false);
  const [theme,setTheme]=useState("light");
  const [pendingFilter,setPF]=useState("all");
  const [pendingVillage,setPV]=useState("all");
  const [mapLayer,setML]=useState("satellite");
  const [expandedRow,setER]=useState(null);
  const [mapSearch,setMS]=useState("");
  const [showDupOnly,setSDO]=useState(false);
  const [isMobile,setIM]=useState(typeof window!=="undefined"&&window.innerWidth<640);
  const [flagFilter,setFF]=useState("all");
  const [flagSearch,setFS]=useState("");
  const [pendingSearch,setPS]=useState("");
  const [dismissedFlags,setDF]=useState(()=>loadLS("kobo_dismissed",[]));
  const [manualFlags,setMF]=useState(()=>loadLS("kobo_manual_flags",{}));
  const [flagReason,setFR]=useState("");
  const [showDismissed,setSD]=useState(false);
  const [showMapList,setSML]=useState(false); // mobile map list toggle
  const [statsMode,setSM]=useState("avg"); // analytics: avg|median|min|max|count
  const [expandedVillages,setEV]=useState(new Set()); // analytics expandable rows
  const [wideTable,setWT]=useState(false); // table wide mode

  const dismissFlag=(id)=>{const u=[...dismissedFlags,String(id)];setDF(u);saveLS("kobo_dismissed",u);};
  const undismiss=(id)=>{const u=dismissedFlags.filter(x=>x!==String(id));setDF(u);saveLS("kobo_dismissed",u);};
  const addMF=(id,r)=>{const u={...manualFlags,[String(id)]:r||"Flagged manually"};setMF(u);saveLS("kobo_manual_flags",u);};
  const removeMF=(id)=>{const u={...manualFlags};delete u[String(id)];setMF(u);saveLS("kobo_manual_flags",u);};

  useEffect(()=>{const fn=()=>setIM(window.innerWidth<640);window.addEventListener("resize",fn);return()=>window.removeEventListener("resize",fn);},[]);
  useEffect(()=>{document.documentElement.style.cssText="overflow-y:scroll;overflow-x:hidden;height:auto;";document.body.style.cssText="overflow-y:scroll;overflow-x:hidden;height:auto;margin:0;padding:0;";const r=document.getElementById("root");if(r)r.style.cssText="width:100%;height:auto;overflow:visible;";},[]);
  useEffect(()=>{if(!window.L){const l=document.createElement("link");l.rel="stylesheet";l.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";document.head.appendChild(l);const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";s.onload=()=>setLL(true);document.head.appendChild(s);}else setLL(true);if(!window.XLSX){const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";document.head.appendChild(s);}},[]);

  const fetchData=useCallback(async()=>{
    setLoading(true);setError(null);
    try{
      const metaR=await fetch(`/api/kobo?path=${encodeURIComponent(`/api/v2/assets/${FORM_UID}/?format=json`)}`,{headers:HEADERS,cache:"no-store"});
      if(!metaR.ok)throw new Error(`Meta HTTP ${metaR.status}`);
      const meta=await metaR.json();
      // Choice labels
      const allC=meta?.content?.choices||[];
      const lm={};allC.forEach(c=>{if(c.name){const l=Array.isArray(c.label)?c.label[0]:c.label;if(l)lm[c.name]=l;}});
      setCLM(lm);
      setFC(allC.filter(c=>String(c.name||"").match(/PLT_\d+/)));
      // Survey question labels - builds field name → display label map
      const survey=meta?.content?.survey||[];
      const slm={};
      const grpStack=[];
      survey.forEach(q=>{
        if(q.type==="begin_group"||q.type==="begin_repeat"){grpStack.push(q.name||"");}
        else if(q.type==="end_group"||q.type==="end_repeat"){grpStack.pop();}
        else if(q.name&&q.label){
          const lbl=Array.isArray(q.label)?q.label[0]:q.label;
          const path=[...grpStack,q.name].join("/");
          slm[path]=lbl; slm[q.name]=lbl;
        }
      });
      setSLM(slm);
      let all=[],url=`/api/kobo?path=${encodeURIComponent(`/api/v2/assets/${FORM_UID}/data/?format=json&limit=300&start=0&ordering=-_submission_time`)}`;
      while(url){const r=await fetch(url,{headers:HEADERS,cache:"no-store"});if(!r.ok)throw new Error(`Data HTTP ${r.status}`);const j=await r.json();all=[...all,...(j.results||[])];url=j.next?`/api/kobo?path=${encodeURIComponent(j.next.replace("https://kf.kobotoolbox.org",""))}`:null;}
      setSub(all);
      if(all.length&&!visibleCols)setVC(["ANS/ANS_farm_id","ANS/ANS_village","surveyor_info/surveyor_name","ANS/ANS_total_acres","ANS/ANS_crops_grown","ANS/ANS_wheat_yield_per_acre","date_time/survey_date","_submission_time"]);
    }catch(e){setError(e.message);}finally{setLoading(false);}
  },[]);
  useEffect(()=>{fetchData();},[fetchData]);

  // Village name resolution
  const prefixToVillage={};
  submissions.forEach(r=>{const fid=r["ANS/ANS_farm_id"]||r["location/select_farm_id"]||"";const p=fid.split("_")[0];const v=r["ANS/ANS_village"];if(p&&v){const res=choiceLabelMap[v]||v;if(res.length>2)prefixToVillage[p]=res;}});
  formChoices.forEach(c=>{const p=(c.name||"").split("_")[0];const fv=c.filter_value;if(p&&fv&&!prefixToVillage[p]){const res=choiceLabelMap[fv]||choiceLabelMap[fv.toLowerCase()]||choiceLabelMap[p]||choiceLabelMap[p.toLowerCase()]||fv;if(res.length>1)prefixToVillage[p]=res;}});
  const vilLabel=(v)=>{if(!v||v==="-")return"-";return choiceLabelMap[v]||choiceLabelMap[v.toLowerCase()]||prefixToVillage[v]||prefixToVillage[v.toUpperCase()]||v;};
  // Get proper display label for a field key
  const fieldLabel=(key)=>surveyLabelMap[key]||surveyLabelMap[key.split("/").pop()]||key.replace(/^.*\//,"").replace(/_/g," ").replace(/\b\w/g,l=>l.toUpperCase());

  const total=submissions.length;
  const withGPS=submissions.filter(s=>s._geolocation?.[0]).length;
  const avgAcres=total?fmt(submissions.reduce((s,r)=>s+num(r["ANS/ANS_total_acres"]),0)/total):0;
  const avgYield=total?fmt(submissions.reduce((s,r)=>s+num(r["ANS/ANS_wheat_yield_per_acre"]),0)/total):0;

  const groupCount=(key)=>Object.entries(submissions.reduce((a,r)=>{const k=vilLabel(r[key]||"Unknown");a[k]=(a[k]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).map(([l,v])=>({label:l,value:v}));
  const villageData=groupCount("ANS/ANS_village");
  const cropMap={};submissions.forEach(r=>{(r["ANS/ANS_crops_grown"]||"Unknown").split(" ").forEach(c=>{const cl=choiceLabelMap[c]||c;cropMap[cl]=(cropMap[cl]||0)+1;});});
  const cropData=Object.entries(cropMap).sort((a,b)=>b[1]-a[1]).map(([l,v])=>({label:l,value:v}));
  const surveyorData=groupCount("surveyor_info/surveyor_name");
  const strawMap={};submissions.forEach(r=>{(r["ANS/ANS_wheat_straw"]||"Unknown").split(" ").forEach(t=>{const tl=choiceLabelMap[t]||t;strawMap[tl]=(strawMap[tl]||0)+1;});});
  const strawData=Object.entries(strawMap).map(([l,v])=>({label:l,value:v}));

  const allCols=submissions.length?Object.keys(submissions[0]):[];
  const displayCols=visibleCols||allCols.slice(0,8);

  const fIdCounts={};submissions.forEach(r=>{const id=r["ANS/ANS_farm_id"]||r["location/select_farm_id"];if(id)fIdCounts[id]=(fIdCounts[id]||0)+1;});
  const dupSet=new Set(Object.keys(fIdCounts).filter(k=>fIdCounts[k]>1));const dupCount=dupSet.size;

  const flaggedSubs=submissions.map(s=>{const af=getFlags(s);const sid=String(s._id);const isDis=dismissedFlags.includes(sid);const mf=manualFlags[sid]||null;return{...s,_autoFlags:af,_isDismissed:isDis,_manualFlag:mf,_hasActiveFlag:(!isDis&&af.length>0)||!!mf};});
  const totalFlagged=flaggedSubs.filter(s=>s._hasActiveFlag).length;
  const flagTypeCounts={};flaggedSubs.forEach(s=>{if(!s._isDismissed)s._autoFlags.forEach(f=>{flagTypeCounts[f.label]=(flagTypeCounts[f.label]||0)+1;});});
  if(Object.keys(manualFlags).length>0)flagTypeCounts["Manual"]=Object.keys(manualFlags).length;
  const flagTypeData=Object.entries(flagTypeCounts).sort((a,b)=>b[1]-a[1]).map(([l,v])=>({label:l,value:v}));

  const mapFiltered=submissions.filter(s=>{if(!mapSearch)return true;const q=mapSearch.toLowerCase();return Object.values(s).some(v=>String(v).toLowerCase().includes(q));});

  // Table: when dup mode, group duplicates together
  const filtered=flaggedSubs.filter(r=>{
    if(showDupOnly){const id=r["ANS/ANS_farm_id"]||r["location/select_farm_id"];if(!dupSet.has(id))return false;}
    return !search||Object.values(r).some(v=>typeof v==="string"&&v.toLowerCase().includes(search.toLowerCase()));
  }).sort((a,b)=>{
    if(showDupOnly){const ia=a["ANS/ANS_farm_id"]||"",ib=b["ANS/ANS_farm_id"]||"";if(ia!==ib)return ia.localeCompare(ib);}
    return new Date(b._submission_time||0)-new Date(a._submission_time||0);
  });

  const mapSelSub=submissions.find(s=>s._id===selectedId);

  // Pending
  const submittedSet=new Set(submissions.map(r=>r["location/select_farm_id"]||r["ANS/ANS_farm_id"]||"").filter(Boolean));
  let allFarmIds=[];
  if(formChoices.length>0){allFarmIds=formChoices.map(c=>{const name=c.name||"";const prefix=name.split("_")[0];const village=prefixToVillage[prefix]||choiceLabelMap[c.filter_value]||choiceLabelMap[prefix]||c.filter_value||prefix;return{farm_id:name,village,submitted:submittedSet.has(name)};});}
  else{allFarmIds=[...submittedSet].map(id=>{const sub=submissions.find(r=>(r["location/select_farm_id"]||r["ANS/ANS_farm_id"])===id);return{farm_id:id,village:vilLabel(sub?.["ANS/ANS_village"]),submitted:true,surveyor:sub?.["surveyor_info/surveyor_name"],date:(sub?.["date_time/survey_date"]||"").slice(0,10)};});}
  const pendingVillages=[...new Set(allFarmIds.map(r=>r.village))].sort();
  const pendingFiltered=allFarmIds.filter(r=>{const vOk=pendingVillage==="all"||r.village===pendingVillage;const sOk=pendingFilter==="all"||(pendingFilter==="pending"&&!r.submitted)||(pendingFilter==="submitted"&&r.submitted);const sQ=!pendingSearch||r.farm_id.toLowerCase().includes(pendingSearch.toLowerCase())||r.village.toLowerCase().includes(pendingSearch.toLowerCase())||(r.surveyor||"").toLowerCase().includes(pendingSearch.toLowerCase());return vOk&&sOk&&sQ;});
  const pendingCount=allFarmIds.filter(r=>!r.submitted).length;
  const submittedCount=allFarmIds.filter(r=>r.submitted).length;
  const vilSummary=pendingVillages.map(v=>{const rows=allFarmIds.filter(r=>r.village===v);const sub=rows.filter(r=>r.submitted).length;return{village:v,total:rows.length,submitted:sub,pending:rows.length-sub,pct:rows.length?Math.round((sub/rows.length)*100):0};}).sort((a,b)=>b.pending-a.pending);

  const flagsFiltered=flaggedSubs.filter(s=>{if(!showDismissed&&s._isDismissed&&!s._manualFlag)return false;if(!s._hasActiveFlag&&!showDismissed)return false;if(flagFilter!=="all"){if(flagFilter==="Manual")return !!s._manualFlag;if(flagFilter==="Dismissed")return s._isDismissed;return s._autoFlags.some(f=>f.label===flagFilter);}return true;}).filter(s=>{if(!flagSearch)return true;const q=flagSearch.toLowerCase();return (s["ANS/ANS_farm_id"]||"").toLowerCase().includes(q)||vilLabel(s["ANS/ANS_village"]).toLowerCase().includes(q)||(s["surveyor_info/surveyor_name"]||"").toLowerCase().includes(q);}).sort((a,b)=>(b._autoFlags?.length||0)-(a._autoFlags?.length||0));

  // Analytics village data with stats
  const villageStats=Object.entries(submissions.reduce((a,r)=>{const v=vilLabel(r["ANS/ANS_village"]||"?");if(!a[v])a[v]={subs:[],ac:[],yi:[],ir:[],dap:[],ur:[]};a[v].subs.push(r);if(num(r["ANS/ANS_total_acres"])>0)a[v].ac.push(num(r["ANS/ANS_total_acres"]));if(num(r["ANS/ANS_wheat_yield_per_acre"])>0)a[v].yi.push(num(r["ANS/ANS_wheat_yield_per_acre"]));if(num(r["ANS/ANS_wheat_irrigations"])>0)a[v].ir.push(num(r["ANS/ANS_wheat_irrigations"]));if(num(r["ANS/ANS_dap_kg_per_acre"])>0)a[v].dap.push(num(r["ANS/ANS_dap_kg_per_acre"]));if(num(r["ANS/ANS_urea_total_kg"])>0)a[v].ur.push(num(r["ANS/ANS_urea_total_kg"]));return a;},{})).sort((a,b)=>b[1].subs.length-a[1].subs.length);

  const getStat=(arr,mode)=>{if(!arr.length)return"-";const n=num(arr.reduce((s,v)=>s+v,0)/arr.length);switch(mode){case"avg":return fmt(n);case"median":return fmt(median(arr));case"min":return fmt(Math.min(...arr));case"max":return fmt(Math.max(...arr));case"count":return arr.length;default:return fmt(n);}};

  // Always get fresh expanded row data (fixes flag notes persistence)
  const currentER=expandedRow?flaggedSubs.find(s=>s._id===expandedRow._id)||expandedRow:null;

  const D={bg:theme==="light"?"#f1f5f9":"#020817",hdr:theme==="light"?"#ffffff":"#0a1628",bdr:theme==="light"?"#e2e8f0":"#1e293b",text:theme==="light"?"#1e293b":"#e2e8f0",muted:theme==="light"?"#6b7280":"#64748b",row1:theme==="light"?"#ffffff":"transparent",row2:theme==="light"?"#f8fafc":"#070e1a",inp:theme==="light"?"#ffffff":"#0f172a",card:theme==="light"?"#ffffff":"#0f172a"};

  if(loading)return(<div style={{minHeight:"100vh",background:D.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}><div style={{width:44,height:44,border:"3px solid #0ea5e944",borderTopColor:"#0ea5e9",borderRadius:"50%",animation:"spin 1s linear infinite"}}/><p style={{color:"#0ea5e9",fontFamily:"monospace"}}>Loading…</p><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>);
  if(error)return(<div style={{minHeight:"100vh",background:D.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,padding:24}}><p style={{color:"#ef4444",fontSize:16}}>⚠ {error}</p><button onClick={fetchData} style={{background:"#0ea5e9",color:"#fff",border:"none",padding:"10px 24px",borderRadius:6,cursor:"pointer",fontWeight:700}}>Retry</button></div>);

  const TABS=["overview","analytics","map","table","flags","pending"];

  return(<>
    <style>{`html,body{margin:0;padding:0;overflow-y:scroll!important;overflow-x:hidden!important;height:auto!important}#root{width:100%;height:auto!important;overflow:visible!important}*{box-sizing:border-box}::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:${theme==="light"?"#f1f5f9":"#0f172a"}}::-webkit-scrollbar-thumb{background:${theme==="light"?"#cbd5e1":"#334155"};border-radius:3px}.tb{background:none;border:none;padding:7px 9px;cursor:pointer;font-size:11px;font-weight:600;letter-spacing:.4px;border-bottom:2px solid transparent;color:${D.muted};white-space:nowrap}.tb.a{color:#0ea5e9;border-bottom-color:#0ea5e9}.tb:hover{color:${D.text}}.trow:hover td{background:${theme==="light"?"#f0f9ff!important":"#0c2036!important"}}.trow{cursor:pointer}select{background:${D.inp};color:${D.text};border:1px solid ${D.bdr};padding:4px 7px;border-radius:6px;font-size:11px;outline:none}.inp{background:${D.inp};border:1px solid ${D.bdr};color:${D.text};padding:6px 11px;border-radius:8px;font-size:12px;outline:none;width:100%}.inp:focus{border-color:#0ea5e9}.pill{padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700;white-space:nowrap;display:inline-block}.btn{padding:5px 10px;border-radius:6px;border:1px solid;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap}@media(max-width:640px){.sr{flex-direction:column!important}.cg,.pg{grid-template-columns:1fr!important}}`}</style>

    <div style={{background:D.bg,color:D.text,fontFamily:"'Segoe UI',system-ui,sans-serif",width:"100%",minHeight:"100vh"}}>
      {/* HEADER */}
      <div style={{borderBottom:`1px solid ${D.bdr}`,padding:isMobile?"0 10px":"0 18px",background:D.hdr,position:"sticky",top:0,zIndex:200}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:8,gap:6,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:0}}><h1 style={{fontSize:isMobile?12:15,fontWeight:800,color:"#0ea5e9",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>🌾 KoboToolbox Dashboard</h1><p style={{fontSize:9,color:D.muted}}>{total} sub{totalFlagged>0?` · 🚩${totalFlagged}`:""}{dupCount>0?` · ⚠${dupCount}`:""}</p></div>
          <div style={{display:"flex",gap:4}}><button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} style={{background:theme==="light"?"#1e293b":"#f1f5f9",color:theme==="light"?"#f1f5f9":"#1e293b",border:"none",padding:"4px 9px",borderRadius:20,cursor:"pointer",fontSize:11,fontWeight:700}}>{theme==="dark"?"☀":"🌙"}</button><button onClick={fetchData} style={{background:"#0ea5e922",border:"1px solid #0ea5e944",color:"#0ea5e9",padding:"4px 9px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:600}}>↺</button></div>
        </div>
        <div style={{display:"flex",marginTop:2,overflowX:"auto"}}>{TABS.map(t=><button key={t} className={`tb${tab===t?" a":""}`} onClick={()=>setTab(t)}>{t==="flags"?`🚩(${totalFlagged})`:t==="pending"?`⏳(${pendingCount})`:t.toUpperCase()}</button>)}</div>
      </div>

      <div style={{padding:isMobile?10:16}}>

        {/* OVERVIEW */}
        {tab==="overview"&&<div style={{display:"flex",flexDirection:"column",gap:12}}><div className="sr" style={{display:"flex",flexWrap:"wrap",gap:7}}><Stat label="Total" value={total} color="#0ea5e9" icon="📋" theme={theme}/><Stat label="GPS" value={withGPS} color="#10b981" icon="📍" theme={theme}/><Stat label="Avg Acres" value={avgAcres} unit="ac" color="#f59e0b" icon="🌾" theme={theme}/><Stat label="Avg Yield/ac" value={avgYield} unit="qtl" color="#10b981" icon="📊" theme={theme}/><Stat label="Villages" value={villageData.length} color="#ec4899" icon="🏘" theme={theme}/>{totalFlagged>0&&<Stat label="Flagged" value={totalFlagged} color="#ef4444" icon="🚩" theme={theme}/>}</div><div className="cg" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:10}}><Card title="By Surveyor" theme={theme}>{({HBar:()=>null}&&<div style={{display:"flex",flexDirection:"column",gap:5}}>{surveyorData.slice(0,10).map((d,i)=>{const max=surveyorData[0]?.value||1;return(<div key={i} style={{display:"flex",alignItems:"center",gap:8}}><span style={{width:100,fontSize:11,textAlign:"right",flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.label}</span><div style={{flex:1,background:theme==="light"?"#e5e7eb":"#1e293b",borderRadius:3,height:22,position:"relative"}}><div style={{width:`${(d.value/max)*100}%`,height:"100%",background:"#0ea5e9",borderRadius:3}}/><span style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",fontSize:11,fontWeight:700,color:theme==="light"?"#1e293b":"#f1f5f9"}}>{d.value}</span></div></div>);})}</div>)}</Card><Card title="By Village" theme={theme}><div style={{display:"flex",flexDirection:"column",gap:5}}>{villageData.slice(0,10).map((d,i)=>{const max=villageData[0]?.value||1;return(<div key={i} style={{display:"flex",alignItems:"center",gap:8}}><span style={{width:110,fontSize:11,textAlign:"right",flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.label}</span><div style={{flex:1,background:theme==="light"?"#e5e7eb":"#1e293b",borderRadius:3,height:22,position:"relative"}}><div style={{width:`${(d.value/max)*100}%`,height:"100%",background:"#10b981",borderRadius:3}}/><span style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",fontSize:11,fontWeight:700,color:theme==="light"?"#1e293b":"#f1f5f9"}}>{d.value}</span></div></div>);})}</div></Card></div><div className="pg" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:10}}>{[{t:"Crops",d:cropData.slice(0,5)},{t:"Straw",d:strawData}].map(({t,d})=><Card key={t} title={t} theme={theme}><div style={{display:"flex",flexDirection:"column",gap:4}}>{d.map((x,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}><div style={{width:9,height:9,borderRadius:2,background:COLORS[i%COLORS.length],flexShrink:0}}/>{x.label}: <b>{x.value}</b></div>)}</div></Card>)}</div></div>}

        {/* ANALYTICS - expandable villages + stats modes */}
        {tab==="analytics"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:D.muted,fontWeight:600}}>Show:</span>
            {["avg","median","min","max","count"].map(m=><button key={m} onClick={()=>setSM(m)} className="btn" style={{borderColor:statsMode===m?"#0ea5e9":D.bdr,background:statsMode===m?"#0ea5e922":"transparent",color:statsMode===m?"#0ea5e9":D.muted,textTransform:"uppercase"}}>{m}</button>)}
          </div>
          <Card title={`Village Metrics — ${statsMode.toUpperCase()}`} theme={theme}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:500}}>
                <thead><tr style={{borderBottom:`1px solid ${D.bdr}`,background:theme==="light"?"#f8fafc":"#071020"}}>{["","Village","#","Acres","Yield/ac","Irrig","DAP","Urea"].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:D.muted,fontWeight:600}}>{h}</th>)}</tr></thead>
                <tbody>{villageStats.map(([v,d],i)=>{const isExp=expandedVillages.has(v);return(<>
                  <tr key={v} style={{borderBottom:`1px solid ${D.bdr}`,background:i%2?D.row2:D.row1,cursor:"pointer"}} onClick={()=>setEV(prev=>{const n=new Set(prev);n.has(v)?n.delete(v):n.add(v);return n;})}>
                    <td style={{padding:"5px 8px",color:D.muted,fontSize:13,width:20}}>{isExp?"▼":"▶"}</td>
                    <td style={{padding:"5px 10px",fontWeight:600}}>{v}</td>
                    <td style={{padding:"5px 10px",color:"#0ea5e9",fontWeight:700}}>{d.subs.length}</td>
                    <td style={{padding:"5px 10px"}}>{getStat(d.ac,statsMode)}</td>
                    <td style={{padding:"5px 10px",color:"#10b981",fontWeight:statsMode==="avg"?500:600}}>{getStat(d.yi,statsMode)}</td>
                    <td style={{padding:"5px 10px"}}>{getStat(d.ir,statsMode)}</td>
                    <td style={{padding:"5px 10px"}}>{getStat(d.dap,statsMode)}</td>
                    <td style={{padding:"5px 10px"}}>{getStat(d.ur,statsMode)}</td>
                  </tr>
                  {isExp&&d.subs.map((s,j)=>{const flags=getFlags(s);return(<tr key={j} onClick={()=>setER(s)} className="trow" style={{borderBottom:`1px solid ${D.bdr}22`,background:flags.length>0?(theme==="light"?"#fef2f2":"#2a0000"):(theme==="light"?"#f0f9ff":"#071020")}}>
                    <td style={{padding:"4px 8px"}}/>
                    <td style={{padding:"4px 10px",fontSize:10,color:D.muted,fontFamily:"monospace"}}>{flags.length>0&&"🚩 "}{s["ANS/ANS_farm_id"]||"-"}</td>
                    <td style={{padding:"4px 10px",fontSize:10,color:D.muted}}>{s["surveyor_info/surveyor_name"]||"-"}</td>
                    <td style={{padding:"4px 10px",fontSize:10}}>{num(s["ANS/ANS_total_acres"])||"-"}</td>
                    <td style={{padding:"4px 10px",fontSize:10,color:"#10b981"}}>{num(s["ANS/ANS_wheat_yield_per_acre"])||"-"}</td>
                    <td style={{padding:"4px 10px",fontSize:10}}>{num(s["ANS/ANS_wheat_irrigations"])||"-"}</td>
                    <td style={{padding:"4px 10px",fontSize:10}}>{num(s["ANS/ANS_dap_kg_per_acre"])||"-"}</td>
                    <td style={{padding:"4px 10px",fontSize:10}}>{num(s["ANS/ANS_urea_total_kg"])||"-"}</td>
                  </tr>);})
                  }</>);})}</tbody>
              </table>
            </div>
          </Card>
        </div>}

        {/* MAP */}
        {tab==="map"&&<div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{position:"relative",flex:1,minWidth:140}}><span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:12}}>🔍</span><input className="inp" style={{paddingLeft:28}} value={mapSearch} onChange={e=>{setMS(e.target.value);setSelId(null);}} placeholder="Search…"/></div>
            {["satellite","street"].map(l=><button key={l} onClick={()=>setML(l)} className="btn" style={{borderColor:mapLayer===l?"#0ea5e9":D.bdr,background:mapLayer===l?"#0ea5e922":"transparent",color:mapLayer===l?"#0ea5e9":D.muted}}>{l==="satellite"?"🛰":"🗺"}{!isMobile&&" "+(l==="satellite"?"Satellite":"Street")}</button>)}
            {/* Mobile: toggle farm list */}
            {isMobile&&<button onClick={()=>setSML(x=>!x)} className="btn" style={{borderColor:"#0ea5e9",background:"#0ea5e922",color:"#0ea5e9"}}>📍 {showMapList?"Hide List":"Farm List"}</button>}
          </div>
          <div style={{display:"flex",flexDirection:isMobile?"column":"row",gap:10,height:isMobile?"auto":"calc(100vh - 220px)"}}>
            {/* Farm list - desktop sidebar OR mobile overlay */}
            {(!isMobile||showMapList)&&<div style={isMobile?{background:D.card,border:`1px solid ${D.bdr}`,borderRadius:10,overflow:"hidden",maxHeight:"40vh"}:{width:230,flexShrink:0,background:D.card,border:`1px solid ${D.bdr}`,borderRadius:10,overflow:"hidden",display:"flex",flexDirection:"column"}}>
              <div style={{padding:"7px 12px",borderBottom:`1px solid ${D.bdr}`,fontSize:10,color:D.muted,fontWeight:700,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>📍 {mapFiltered.filter(s=>s._geolocation?.[0]).length} LOCATIONS</span>
                {isMobile&&<button onClick={()=>setSML(false)} style={{background:"none",border:"none",cursor:"pointer",color:D.muted,fontSize:14}}>✕</button>}
              </div>
              <div style={{overflowY:"auto",flex:1}}>{mapFiltered.filter(s=>s._geolocation?.[0]).map(s=><div key={s._id} onClick={()=>{setSelId(s._id===selectedId?null:s._id);if(isMobile)setSML(false);}} style={{padding:"6px 12px",borderBottom:`1px solid ${D.bdr}`,cursor:"pointer",background:s._id===selectedId?(theme==="light"?"#eff6ff":"#0f2a4a"):"transparent",borderLeft:s._id===selectedId?"3px solid #0ea5e9":"3px solid transparent"}}><div style={{fontSize:11,fontWeight:700,color:s._id===selectedId?"#0ea5e9":D.text,display:"flex",gap:4}}>{getFlags(s).length>0&&"🚩"}{s["ANS/ANS_farm_id"]||"Farm"}</div><div style={{fontSize:10,color:D.muted}}>{vilLabel(s["ANS/ANS_village"])}</div></div>)}</div>
            </div>}
            <div style={{flex:1,position:"relative",borderRadius:10,overflow:"hidden",border:`1px solid ${D.bdr}`,height:isMobile?"65vw":"100%",minHeight:260}}>
              {leafletLoaded?<MapView submissions={mapFiltered} selectedId={selectedId} onSelect={setSelId} mapLayer={mapLayer} isVisible={tab==="map"}/>:<div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:D.muted}}>Loading…</div>}
              {mapSelSub&&<div style={{position:"absolute",bottom:isMobile?0:12,right:isMobile?0:12,left:isMobile?0:"auto",width:isMobile?"100%":"255px",maxHeight:"45%",background:theme==="light"?"rgba(255,255,255,0.97)":"rgba(10,22,40,0.97)",border:`1px solid ${D.bdr}`,borderRadius:isMobile?"12px 12px 0 0":"10px",boxShadow:"0 4px 20px #0006",display:"flex",flexDirection:"column",zIndex:500}}>
                <div style={{display:"flex",justifyContent:"space-between",padding:"7px 12px",borderBottom:`1px solid ${D.bdr}`,flexShrink:0}}><div><div style={{color:"#0ea5e9",fontWeight:800,fontSize:13}}>{getFlags(mapSelSub).length>0&&"🚩 "}{mapSelSub["ANS/ANS_farm_id"]||"Farm"}</div><div style={{color:D.muted,fontSize:10}}>{vilLabel(mapSelSub["ANS/ANS_village"])}</div></div><button onClick={()=>setSelId(null)} style={{background:"none",border:"none",color:D.muted,cursor:"pointer",fontSize:15}}>✕</button></div>
                <div style={{overflowY:"auto",padding:"6px 12px",flex:1}}>{getFlags(mapSelSub).length>0&&<div style={{background:"#ef444418",border:"1px solid #ef444433",borderRadius:5,padding:"4px 8px",marginBottom:4,fontSize:10,color:"#ef4444"}}>{getFlags(mapSelSub).map((f,i)=><div key={i}>🚩 {f.label}: {f.issue}</div>)}</div>}{Object.entries(mapSelSub).filter(([k,v])=>!k.startsWith("_")&&v!=null&&v!=="").map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",gap:5,padding:"2px 0",borderBottom:`1px solid ${D.bdr}22`}}><span style={{color:D.muted,fontSize:9,width:90,flexShrink:0,textTransform:"uppercase"}}>{fieldLabel(k)}</span><span style={{color:D.text,fontSize:11,fontWeight:500,textAlign:"right",wordBreak:"break-word"}}>{choiceLabelMap[String(v)]||String(v)}</span></div>)}</div>
              </div>}
            </div>
          </div>
        </div>}

        {/* TABLE */}
        {tab==="table"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
          {dupCount>0&&<div style={{background:theme==="light"?"#fef3c7":"#1c1a00",border:"1px solid #f59e0b55",borderRadius:8,padding:"7px 12px",fontSize:11,color:"#f59e0b"}}>⚠️ {dupCount} duplicate Farm IDs — orange=dup, red=flagged</div>}
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search…" className="inp" style={{flex:1,minWidth:140}}/>
            {dupCount>0&&<button onClick={()=>setSDO(d=>!d)} className="btn" style={{borderColor:showDupOnly?"#f59e0b":D.bdr,background:showDupOnly?"#f59e0b22":"transparent",color:showDupOnly?"#f59e0b":D.muted}}>{showDupOnly?"✓ Dup":"Dup"}</button>}
            <button onClick={()=>setWT(w=>!w)} className="btn" style={{borderColor:wideTable?"#8b5cf6":D.bdr,background:wideTable?"#8b5cf622":"transparent",color:wideTable?"#8b5cf6":D.muted}}>⟷ {wideTable?"Normal":"Wide"}</button>
            <span style={{fontSize:10,color:D.muted}}>{filtered.length}</span>
            <DlBtn rows={filtered.map(r=>{const o={};displayCols.forEach(c=>{o[fieldLabel(c)]=choiceLabelMap[String(r[c]??"")]||String(r[c]??"");});return o;})} filename="survey" theme={theme}/>
          </div>
          <div style={{background:D.card,border:`1px solid ${D.bdr}`,borderRadius:10,overflow:"hidden"}}>
            <div style={{padding:"4px 12px",borderBottom:`1px solid ${D.bdr}`,fontSize:10,color:D.muted,background:theme==="light"?"#f8fafc":"#071020"}}>Tap row → details · newest first{showDupOnly?" · sorted by Farm ID for comparison":""}</div>
            <div style={{overflowX:"scroll",overflowY:"auto",maxHeight:"58vh",WebkitOverflowScrolling:"touch"}}>
              <table style={{borderCollapse:"collapse",fontSize:11,tableLayout:"auto",whiteSpace:"nowrap"}}>
                <thead style={{position:"sticky",top:0,zIndex:10}}><tr style={{borderBottom:`1px solid ${D.bdr}`,background:theme==="light"?"#f8fafc":"#071020"}}>
                  <th style={{padding:"6px 8px",width:26,position:"sticky",left:0,background:theme==="light"?"#f8fafc":"#071020",zIndex:11}}><input type="checkbox" onChange={e=>setSelRows(e.target.checked?filtered.map(r=>r._id):[])} checked={selectedRows.length===filtered.length&&filtered.length>0}/></th>
                  <th style={{padding:"6px 4px",width:22,position:"sticky",left:26,background:theme==="light"?"#f8fafc":"#071020",zIndex:11,fontSize:9}}>⚠🚩</th>
                  {displayCols.map(c=><th key={c} style={{padding:"6px 10px",textAlign:"left",color:D.muted,fontWeight:600,fontSize:10}}>{fieldLabel(c)}</th>)}
                </tr></thead>
                <tbody>{filtered.slice(0,300).map((r,i)=>{
                  const fid=r["ANS/ANS_farm_id"]||r["location/select_farm_id"];
                  const isDup=fid&&dupSet.has(fid);const hasF=r._hasActiveFlag;
                  const bg=hasF?(theme==="light"?"#fef2f2":"#2a0000"):isDup?(theme==="light"?"#fef9c3":"#2d2200"):i%2?D.row2:D.row1;
                  // Mark first of each dup group with a border
                  const prevFid=i>0?(filtered[i-1]["ANS/ANS_farm_id"]||""):"";
                  const isNewDupGroup=showDupOnly&&isDup&&fid!==prevFid&&i>0;
                  return<tr key={r._id} className="trow" onClick={()=>setER(r)} style={{borderBottom:`1px solid ${D.bdr}`,borderTop:isNewDupGroup?`2px solid #f59e0b`:"",background:bg}}>
                    <td style={{padding:"4px 8px",position:"sticky",left:0,background:bg,zIndex:1}} onClick={e=>{e.stopPropagation();setSelRows(s=>s.includes(r._id)?s.filter(x=>x!==r._id):[...s,r._id])}}><input type="checkbox" checked={selectedRows.includes(r._id)} onChange={()=>{}} onClick={e=>e.stopPropagation()}/></td>
                    <td style={{padding:"4px 4px",position:"sticky",left:26,background:bg,zIndex:1,fontSize:12}}>{hasF?"🚩":isDup?"⚠️":""}</td>
                    {displayCols.map(c=>{const raw=String(r[c]??"");const disp=c==="ANS/ANS_village"?vilLabel(raw):(choiceLabelMap[raw]||raw);return<td key={c} style={{padding:"4px 10px",maxWidth:wideTable?500:160,overflow:"hidden",textOverflow:"ellipsis"}}>{disp}</td>;})}
                  </tr>;})}
                </tbody>
              </table>
            </div>
            {filtered.length>300&&<div style={{padding:"5px 12px",fontSize:10,color:D.muted,borderTop:`1px solid ${D.bdr}`}}>300 of {filtered.length} shown</div>}
          </div>
        </div>}

        {/* FLAGS */}
        {tab==="flags"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div className="sr" style={{display:"flex",flexWrap:"wrap",gap:7}}>
            <Stat label="Active" value={totalFlagged} color="#ef4444" icon="🚩" theme={theme}/>
            <Stat label="Clean" value={total-totalFlagged} color="#10b981" icon="✅" theme={theme}/>
            <Stat label="Dismissed" value={dismissedFlags.length} color="#6b7280" icon="✓" theme={theme}/>
            <Stat label="Manual" value={Object.keys(manualFlags).length} color="#f59e0b" icon="👁" theme={theme}/>
          </div>
          {/* Flag type cards - clickable filter */}
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {flagTypeData.map(({label:l,value:v})=><div key={l} onClick={()=>setFF(flagFilter===l?"all":l)} style={{background:flagFilter===l?"#ef444422":(theme==="light"?"#fff":"#0f172a"),border:`1px solid ${flagFilter===l?"#ef4444":D.bdr}`,borderRadius:10,padding:"10px 14px",cursor:"pointer",flex:1,minWidth:120}}>
              <div style={{fontSize:10,color:D.muted,textTransform:"uppercase"}}>{l}</div>
              <div style={{fontSize:22,fontWeight:700,color:"#ef4444",fontFamily:"monospace"}}>{v}</div>
            </div>)}
          </div>
          <Card title="Rules Reference" theme={theme}><div style={{display:"flex",flexDirection:"column",gap:4}}>{RED_FLAG_RULES.map((r,i)=><div key={i} style={{display:"flex",gap:8,padding:"3px 0",borderBottom:`1px solid ${D.bdr}22`,alignItems:"center"}}><span style={{fontSize:11,flex:1,fontWeight:600}}>{r.label}</span><span style={{fontSize:10,color:D.muted}}>{r.min!=null?`≥${r.min}`:""} {r.max!=null?`≤${r.max}`:""}</span><span className="pill" style={{background:"#ef444422",color:"#ef4444"}}>{flagTypeCounts[r.label]||0}</span></div>)}</div></Card>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <input value={flagSearch} onChange={e=>setFS(e.target.value)} placeholder="🔍 Search flags…" className="inp" style={{flex:1,minWidth:140}}/>
            <button onClick={()=>setFF("all")} className="btn" style={{borderColor:flagFilter==="all"?"#ef4444":D.bdr,background:flagFilter==="all"?"#ef444422":"transparent",color:flagFilter==="all"?"#ef4444":D.muted}}>All</button>
            <label style={{fontSize:11,color:D.muted,display:"flex",alignItems:"center",gap:4}}><input type="checkbox" checked={showDismissed} onChange={e=>setSD(e.target.checked)}/> Dismissed</label>
            <DlBtn rows={flagsFiltered.map(r=>({farm_id:r["ANS/ANS_farm_id"],village:vilLabel(r["ANS/ANS_village"]),surveyor:r["surveyor_info/surveyor_name"],flags:(r._autoFlags||[]).map(f=>`${f.label}:${f.issue}`).join("; "),manual:r._manualFlag||"",status:r._isDismissed?"dismissed":"active"}))} filename="flags" theme={theme}/>
          </div>
          <div style={{background:D.card,border:`1px solid ${D.bdr}`,borderRadius:10,overflow:"hidden"}}><div style={{overflowX:"auto",overflowY:"auto",maxHeight:"50vh"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}><thead style={{position:"sticky",top:0,zIndex:5}}><tr style={{borderBottom:`1px solid ${D.bdr}`,background:theme==="light"?"#fef2f2":"#1a0000"}}>{["Farm ID","Village","Surveyor","Status","Flags"].map(h=><th key={h} style={{padding:"6px 12px",textAlign:"left",color:"#ef4444",fontWeight:600}}>{h}</th>)}</tr></thead><tbody>{flagsFiltered.map((r,i)=><tr key={i} className="trow" onClick={()=>setER(r)} style={{borderBottom:`1px solid ${D.bdr}`,background:r._isDismissed?(theme==="light"?"#f8f8f8":"#111"):i%2?(theme==="light"?"#fff":"#0a0000"):(theme==="light"?"#fff8f8":"#120000")}}><td style={{padding:"5px 12px",fontFamily:"monospace",fontSize:10}}>{r["ANS/ANS_farm_id"]||"-"}</td><td style={{padding:"5px 12px"}}>{vilLabel(r["ANS/ANS_village"])}</td><td style={{padding:"5px 12px",color:D.muted}}>{r["surveyor_info/surveyor_name"]||"-"}</td><td style={{padding:"5px 12px"}}>{r._isDismissed?<span className="pill" style={{background:"#10b98122",color:"#10b981"}}>✓ OK</span>:r._manualFlag?<span className="pill" style={{background:"#f59e0b22",color:"#f59e0b"}}>👁 Manual</span>:<span className="pill" style={{background:"#ef444422",color:"#ef4444"}}>🚩 Active</span>}</td><td style={{padding:"5px 12px",fontSize:10,color:"#ef4444",maxWidth:220,overflow:"hidden",textOverflow:"ellipsis"}}>{(r._autoFlags||[]).map(f=>`${f.label}:${f.issue}`).join(" · ")}{r._manualFlag?` · 👁${r._manualFlag}`:""}</td></tr>)}</tbody></table>{flagsFiltered.length===0&&<div style={{padding:"18px",textAlign:"center",color:D.muted}}>No flags match.</div>}</div></div>
        </div>}

        {/* PENDING */}
        {tab==="pending"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div className="sr" style={{display:"flex",flexWrap:"wrap",gap:7}}><Stat label="Total" value={allFarmIds.length} color="#0ea5e9" icon="🗂" theme={theme}/><Stat label="Done" value={submittedCount} color="#10b981" icon="✅" theme={theme}/><Stat label="Pending" value={pendingCount} color="#ef4444" icon="⏳" theme={theme}/><Stat label="%" value={allFarmIds.length?Math.round((submittedCount/allFarmIds.length)*100):0} unit="%" color="#f59e0b" icon="📈" theme={theme}/></div>
          <Card title="Progress by Village" theme={theme}><div style={{display:"flex",flexDirection:"column",gap:6}}>{vilSummary.map((v,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:7}}><span style={{width:130,fontSize:11,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.village}</span><div style={{flex:1,background:D.bdr,borderRadius:4,height:18,overflow:"hidden",position:"relative",minWidth:40}}><div style={{width:`${v.pct}%`,height:"100%",borderRadius:4,background:v.pct===100?"#10b981":v.pct>60?"#f59e0b":"#ef4444"}}/><span style={{position:"absolute",left:5,top:"50%",transform:"translateY(-50%)",fontSize:9,fontWeight:700,color:"#fff"}}>{v.pct}%</span></div><span style={{width:75,fontSize:10,textAlign:"right",flexShrink:0}}><span style={{color:"#10b981"}}>{v.submitted}</span>/{v.total}</span></div>)}</div></Card>
          <Card title="Farm IDs" theme={theme} noPad extra={<div style={{display:"flex",gap:5,flexWrap:"wrap",padding:"0 14px",alignItems:"center"}}>
            <input value={pendingSearch} onChange={e=>setPS(e.target.value)} placeholder="🔍 Search…" className="inp" style={{flex:1,minWidth:120,padding:"4px 10px",fontSize:11}}/>
            <select value={pendingVillage} onChange={e=>setPV(e.target.value)}><option value="all">All Villages</option>{pendingVillages.map(v=><option key={v} value={v}>{v}</option>)}</select>
            <select value={pendingFilter} onChange={e=>setPF(e.target.value)}><option value="all">All</option><option value="submitted">✅ Done</option><option value="pending">⏳ Pending</option></select>
            <DlBtn rows={pendingFiltered.map(r=>({farm_id:r.farm_id,village:r.village,status:r.submitted?"done":"pending"}))} filename="pending" theme={theme}/>
          </div>}>
            <div style={{overflowX:"auto",maxHeight:"50vh",overflowY:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}><thead style={{position:"sticky",top:0,zIndex:5}}><tr style={{borderBottom:`1px solid ${D.bdr}`,background:theme==="light"?"#f8fafc":"#071020"}}>{["Farm ID","Village","Status","Surveyor","Date"].map(h=><th key={h} style={{padding:"5px 10px",textAlign:"left",color:D.muted,fontWeight:600}}>{h}</th>)}</tr></thead><tbody>{pendingFiltered.map((r,i)=>{
              const sub=submissions.find(s=>(s["location/select_farm_id"]||s["ANS/ANS_farm_id"])===r.farm_id);
              return<tr key={i} className="trow" onClick={()=>{if(sub)setER(sub);}} style={{borderBottom:`1px solid ${D.bdr}`,background:i%2?D.row2:D.row1}}>
                <td style={{padding:"5px 10px",fontFamily:"monospace",fontSize:10}}>{r.farm_id}</td>
                <td style={{padding:"5px 10px"}}>{r.village}</td>
                <td style={{padding:"5px 10px"}}>{r.submitted?<span className="pill" style={{background:"#10b98122",color:"#10b981"}}>✓ Done</span>:<span className="pill" style={{background:"#ef444422",color:"#ef4444"}}>⏳ Pending</span>}</td>
                <td style={{padding:"5px 10px",color:D.muted,fontSize:10}}>{r.surveyor||sub?.["surveyor_info/surveyor_name"]||"-"}</td>
                <td style={{padding:"5px 10px",color:D.muted,fontSize:10}}>{r.date||(sub?.["date_time/survey_date"]||"").slice(0,10)||"-"}</td>
              </tr>;})}
            </tbody></table>{pendingFiltered.length===0&&<div style={{padding:"16px",textAlign:"center",color:D.muted}}>No results.</div>}</div>
          </Card>
        </div>}
      </div>
    </div>

    {/* EXPANDED MODAL - uses currentER for fresh flag/note data */}
    {currentER&&<div onClick={()=>{setER(null);setFR("");}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:isMobile?"flex-end":"center",justifyContent:"center",padding:isMobile?0:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:D.card,border:`1px solid ${D.bdr}`,borderRadius:isMobile?"16px 16px 0 0":"12px",width:"100%",maxWidth:560,maxHeight:isMobile?"90vh":"82vh",overflow:"auto",boxShadow:"0 8px 40px #000a"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${D.bdr}`,position:"sticky",top:0,background:D.card,zIndex:5}}>
          <div><div style={{color:"#0ea5e9",fontWeight:800,fontSize:14}}>{currentER._hasActiveFlag&&"🚩 "}{currentER["ANS/ANS_farm_id"]||`#${currentER._id}`}</div><div style={{color:D.muted,fontSize:10}}>{vilLabel(currentER["ANS/ANS_village"])} · {currentER["surveyor_info/surveyor_name"]||""}</div></div>
          <button onClick={()=>{setER(null);setFR("");}} style={{background:theme==="light"?"#f1f5f9":"#1e293b",border:"none",color:D.text,cursor:"pointer",fontSize:15,width:27,height:27,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        {/* Mini map if GPS available */}
        {currentER._geolocation?.[0]&&leafletLoaded&&<div style={{padding:"0 16px"}}><MiniMap lat={currentER._geolocation[0]} lng={currentER._geolocation[1]}/></div>}
        {/* Auto-flags */}
        {(currentER._autoFlags||[]).length>0&&<div style={{margin:"10px 16px",background:currentER._isDismissed?"#10b98118":"#ef444418",border:`1px solid ${currentER._isDismissed?"#10b98144":"#ef444444"}`,borderRadius:8,padding:"8px 12px"}}><div style={{fontSize:11,color:currentER._isDismissed?"#10b981":"#ef4444",fontWeight:700,marginBottom:3}}>{currentER._isDismissed?"✓ Reviewed & Marked Normal":"🚩 Auto-Detected Issues:"}</div>{currentER._autoFlags.map((f,i)=><div key={i} style={{fontSize:11,color:currentER._isDismissed?"#10b981":"#ef4444"}}>• {f.label}: <b>{f.issue}</b></div>)}</div>}
        {/* Manual flag - uses fresh data so persists */}
        {currentER._manualFlag&&<div style={{margin:"10px 16px",background:"#f59e0b18",border:"1px solid #f59e0b44",borderRadius:8,padding:"8px 12px"}}><div style={{fontSize:11,color:"#f59e0b",fontWeight:700}}>👁 Your Note: {currentER._manualFlag}</div></div>}
        {/* Action buttons */}
        <div style={{padding:"8px 16px",display:"flex",gap:5,flexWrap:"wrap",borderBottom:`1px solid ${D.bdr}`}}>
          {(currentER._autoFlags||[]).length>0&&(currentER._isDismissed
            ?<button onClick={()=>{undismiss(String(currentER._id));setER({...currentER,_isDismissed:false,_hasActiveFlag:true});}} className="btn" style={{borderColor:"#f59e0b",background:"#f59e0b22",color:"#f59e0b"}}>↩ Undo Dismiss</button>
            :<button onClick={()=>{dismissFlag(String(currentER._id));setER({...currentER,_isDismissed:true,_hasActiveFlag:!!currentER._manualFlag});}} className="btn" style={{borderColor:"#10b981",background:"#10b98122",color:"#10b981"}}>✓ Mark as Normal</button>
          )}
          {currentER._manualFlag
            ?<button onClick={()=>{removeMF(String(currentER._id));setER({...currentER,_manualFlag:null,_hasActiveFlag:!currentER._isDismissed&&(currentER._autoFlags||[]).length>0});}} className="btn" style={{borderColor:"#10b981",background:"#10b98122",color:"#10b981"}}>✓ Remove My Note</button>
            :<><input value={flagReason} onChange={e=>setFR(e.target.value)} placeholder="Add note (optional)" className="inp" style={{flex:1,minWidth:100,padding:"4px 9px",fontSize:11}}/><button onClick={()=>{addMF(String(currentER._id),flagReason||"Flagged manually");setER({...currentER,_manualFlag:flagReason||"Flagged manually",_hasActiveFlag:true});setFR("");}} className="btn" style={{borderColor:"#ef4444",background:"#ef444422",color:"#ef4444"}}>🚩 Flag</button></>
          }
        </div>
        {/* All fields with proper question labels */}
        <div style={{padding:"8px 16px"}}>{Object.entries(currentER).filter(([k,v])=>!k.startsWith("_")&&v!=null&&v!=="").map(([k,v])=>{const displayVal=k==="ANS/ANS_village"?vilLabel(String(v)):(choiceLabelMap[String(v)]||String(v));return(<div key={k} style={{display:"flex",gap:10,padding:"5px 0",borderBottom:`1px solid ${D.bdr}22`,alignItems:"flex-start"}}><span style={{color:D.muted,fontSize:10,width:150,flexShrink:0,lineHeight:1.3}}>{fieldLabel(k)}</span><span style={{color:D.text,fontSize:12,fontWeight:500,flex:1,wordBreak:"break-word"}}>{displayVal}</span></div>);})}</div>
      </div>
    </div>}
  </>);
}
