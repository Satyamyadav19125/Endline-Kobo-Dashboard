import { useState, useEffect, useCallback, useRef, useMemo } from "react";

/* ─── CONFIG ─────────────────────────────────────────────── */
const API_TOKEN = "cfda7c6ec2ad5c686e180747c4c005995710445a";
const FORM_UID  = "aagjSQnDRWQLs778Ri8AkH";
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmt = (n, d = 1) => Number(n).toFixed(d);

/* ─── THEME ──────────────────────────────────────────────── */
const L = {
  bg:"#f0f4f8", card:"#ffffff", text:"#0f172a", muted:"#64748b",
  bdr:"#e2e8f0", accent:"#0284c7", danger:"#ef4444", warn:"#f59e0b",
  success:"#10b981", hover:"#f8fafc", tag:"#e0f2fe", tagT:"#0369a1",
};
const DK = {
  bg:"#0f172a", card:"#1e293b", text:"#f1f5f9", muted:"#94a3b8",
  bdr:"#334155", accent:"#38bdf8", danger:"#f87171", warn:"#fbbf24",
  success:"#34d399", hover:"#334155", tag:"#0c4a6e", tagT:"#7dd3fc",
};

/* ─── INTERNAL FIELD FILTER ──────────────────────────────── */
const HIDE_KEYS = new Set([
  "_id","_uuid","_submitted_by","_tags","_notes","_validation_status","_index",
  "formhub/uuid","meta/instanceID","meta/deprecatedID","__version__","_attachments",
  "_status","_geolocation","_submission_time","_submitted_by","_xform_id_string",
  "_bamboo_dataset_id","_edited","_last_edited","_root_uuid","start","end",
]);
const HIDE_PAT = /^(_|formhub|meta\/|__)/;
const CALC_PAT = /calculate|calculated|__/i;

/* ─── DEFAULT FLAG RULES ─────────────────────────────────── */
const DEFAULT_RULES = [
  { id:"r1", pat:"total_acres",         label:"Total Acres",       min:null, max:30,  unit:"ac",   active:true  },
  { id:"r2", pat:"yield_per_acre",      label:"Yield / Acre",      min:15,   max:28,  unit:"qtl",  active:true  },
  { id:"r3", pat:"dap_kg",              label:"DAP kg / Acre",     min:40,   max:70,  unit:"kg",   active:true  },
  { id:"r4", pat:"urea_bags",           label:"Urea Bags",         min:3,    max:5,   unit:"bags", active:true  },
  { id:"r5", pat:"urea_bag_size",       label:"Urea Bag Size",     min:45,   max:50,  unit:"kg",   active:true  },
  { id:"r6", pat:"bigha",               label:"Bigha / Acre",      min:4,    max:7,   unit:"",     active:false },
  { id:"r7", pat:"total_irrig",         label:"Total Irrigations", min:2,    max:6,   unit:"",     active:false },
  { id:"r8", pat:"irrigation_hour",     label:"Irrigation Hrs/Day",min:3,    max:8,   unit:"hrs",  active:false },
  { id:"r9", pat:"days_irrigation",     label:"Days / Irrigation", min:5,    max:8,   unit:"days", active:false },
  { id:"r10",pat:"keara",               label:"Keara",             min:2,    max:7,   unit:"",     active:false },
];

/* ─── VILLAGE FALLBACK ───────────────────────────────────── */
const VIL_FB = {
  AG:"Agwanpur", AS:"Aaspur", IC:"Ichawad", MA:"Mahua",
  MH:"Mahuwakhurd", MU:"Muradpur", RA:"Rampur", SW:"Sawarna", WA:"Wazirpur",
};

/* ─── LS HELPERS ─────────────────────────────────────────── */
const lsGet = (k, def) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):def; } catch{ return def; }};
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch{} };

/* ─── API CALL ───────────────────────────────────────────── */
const kobo = (path, opts={}) =>
  fetch(`/api/kobo?path=${encodeURIComponent(path)}`, {
    ...opts,
    headers:{ "Content-Type":"application/json", ...(opts.headers||{}) },
    cache:"no-store",
  }).then(r => r.json());

/* ─── MAP TILE URLS ──────────────────────────────────────── */
const SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const STR = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

/* ══════════════════════════════════════════════════════════ */
export default function App() {
  /* ── state ── */
  const [dark, setDark]           = useState(false);
  const [tab, setTab]             = useState("overview");
  const [subs, setSubs]           = useState([]);
  const [formDef, setFormDef]     = useState(null); // {survey, choices}
  const [loading, setLoading]     = useState(true);
  const [err, setErr]             = useState(null);
  const [rules, setRules]         = useState(() => lsGet("kd_rules", DEFAULT_RULES));
  const [manFlags, setManFlags]   = useState(() => lsGet("kd_manflags", {}));
  const [dismissals, setDismissal] = useState(() => lsGet("kd_dismiss", {}));
  const [notes, setNotes]         = useState(() => lsGet("kd_notes", {}));
  const [modal, setModal]         = useState(null);  // form popup
  const [editMode, setEditMode]   = useState(false);
  const [editData, setEditData]   = useState({});
  const [saving, setSaving]       = useState(false);
  const [vilMap, setVilMap]       = useState(VIL_FB);
  const [choiceMap, setChoiceMap] = useState({});
  const [surveyFields, setSurveyFields] = useState([]); // ordered visible fields
  /* table */
  const [selRows, setSelRows]     = useState(new Set());
  const [colVis, setColVis]       = useState(() => lsGet("kd_cols", null));
  const [showColMenu, setShowColMenu] = useState(false);
  const [tableFilter, setTableFilter] = useState("all");
  const [tableSearch, setTableSearch] = useState("");
  const [tableSort, setTableSort] = useState("newest");
  /* pending */
  const [pendSearch, setPendSearch] = useState("");
  const [pendVil, setPendVil]     = useState("all");
  const [pendSort, setPendSort]   = useState("newest");
  /* flags */
  const [flagSearch, setFlagSearch] = useState("");
  /* map */
  const [mapSearch, setMapSearch] = useState("");
  const [satellite, setSatellite] = useState(true);
  const [leafletOK, setLeafletOK] = useState(false);
  const mapRef = useRef(null);
  const mapInst = useRef(null);
  const markersRef = useRef([]);
  /* settings new rule */
  const [newRule, setNewRule]     = useState({ label:"", pat:"", min:"", max:"", unit:"" });

  const D = dark ? DK : L;

  /* ── persist ── */
  useEffect(()=>lsSet("kd_rules", rules), [rules]);
  useEffect(()=>lsSet("kd_manflags", manFlags), [manFlags]);
  useEffect(()=>lsSet("kd_dismiss", dismissals), [dismissals]);
  useEffect(()=>lsSet("kd_notes", notes), [notes]);
  useEffect(()=>lsSet("kd_cols", colVis), [colVis]);

  /* ── Leaflet ── */
  useEffect(()=>{
    if(window.L){ setLeafletOK(true); return; }
    const css=document.createElement("link");
    css.rel="stylesheet"; css.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const sc=document.createElement("script");
    sc.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    sc.onload=()=>setLeafletOK(true);
    document.head.appendChild(sc);
  },[]);

  /* ── fetch data ── */
  const fetchAll = useCallback(async()=>{
    setLoading(true); setErr(null);
    try {
      /* form definition */
      const def = await kobo(`/api/v2/assets/${FORM_UID}/?format=json`);
      if(def?.content){
        const survey = def.content.survey || [];
        const choices = def.content.choices || [];

        /* build choice value→label map */
        const cmap = {};
        choices.forEach(c => {
          const val = c.name || c.$autoname || "";
          const lbl = (c.label && c.label[0]) ? c.label[0] : val;
          cmap[val] = lbl;
        });
        setChoiceMap(cmap);

        /* build village map from choices */
        const vmap = {};
        choices.forEach(c => {
          if(!c["filter_value"] && !c["$filter_value"]) return;
          const code = (c["filter_value"]||c["$filter_value"]||"").toUpperCase();
          const lbl = (c.label && c.label[0]) ? c.label[0] : code;
          if(code && lbl && lbl.length > 2) vmap[code] = lbl;
        });
        // Also treat list_name "select_village" style
        const vilChoices = choices.filter(c =>
          (c.list_name||"").toLowerCase().includes("village") ||
          (c.list_name||"").toLowerCase().includes("vill")
        );
        vilChoices.forEach(c => {
          const val = c.name || c.$autoname || "";
          const lbl = (c.label && c.label[0]) ? c.label[0] : val;
          if(val && lbl && lbl.length > 2) vmap[val.toUpperCase()] = lbl;
          // store as lowercase too
          if(val && lbl) vmap[val] = lbl;
        });
        setVilMap(prev => ({ ...VIL_FB, ...vmap }));

        /* build ordered survey fields (only visible user-facing) */
        const fields = survey
          .filter(f => {
            if(!f || f.type === "begin_group" || f.type === "end_group" ||
               f.type === "begin_repeat" || f.type === "end_repeat" ||
               f.type === "note" || f.type === "calculate") return false;
            const nm = f.$autoname || f.name || "";
            if(HIDE_KEYS.has(nm)) return false;
            if(HIDE_PAT.test(nm)) return false;
            if(CALC_PAT.test(nm)) return false;
            return true;
          })
          .map(f => ({
            key: f.$autoname || f.name || "",
            label: (f.label && f.label[0]) ? f.label[0] : (f.$autoname||f.name||"").replace(/_/g," "),
            type: f.type,
            list_name: f.select_from_list_name || "",
          }));
        setSurveyFields(fields);
        setFormDef(def);
      }

      /* submissions — paginate all */
      let all = [], url = `/api/v2/assets/${FORM_UID}/data/?format=json&limit=100&ordering=-_submission_time`;
      while(url){
        const page = await kobo(url);
        if(page?.results) all = all.concat(page.results);
        if(page?.next){
          // extract path from next URL
          try { url = new URL(page.next).pathname + new URL(page.next).search; }
          catch{ url = null; }
        } else url = null;
      }
      setSubs(all);
    } catch(e){ setErr(e.message); }
    setLoading(false);
  },[]);

  useEffect(()=>{ fetchAll(); },[fetchAll]);

  /* ── village resolve helper ── */
  const resolveVil = useCallback((sub) => {
    const raw =
      sub["location/select_village"] ||
      sub["location/village"] ||
      sub["ANS/ANS_village"] ||
      sub["select_village"] || "";
    const code = String(raw).trim().toUpperCase();
    return vilMap[code] || vilMap[raw] || choiceMap[raw] ||
      (raw.length > 3 ? raw : null);
  },[vilMap, choiceMap]);

  /* ── flag evaluation ── */
  const evalFlags = useCallback((sub) => {
    const flags = [];
    const activeRules = rules.filter(r => r.active);
    for(const r of activeRules){
      const pat = new RegExp(r.pat, "i");
      for(const [k, v] of Object.entries(sub)){
        if(!pat.test(k)) continue;
        const n = num(v);
        if(!n) continue;
        if(r.min !== null && n < r.min) flags.push({ rule:r, key:k, val:n, dir:"low" });
        else if(r.max !== null && n > r.max) flags.push({ rule:r, key:k, val:n, dir:"high" });
        break;
      }
    }
    return flags;
  },[rules]);

  /* ── enriched subs ── */
  const enriched = useMemo(()=>{
    return subs.map(s=>{
      const id = String(s._id||"");
      const autoFlags = evalFlags(s);
      const mf = manFlags[id];
      const dismissed = !!dismissals[id];
      const hasActiveFlag = (!dismissed && autoFlags.length>0) || mf?.active;
      return { ...s, _autoFlags:autoFlags, _manFlag:mf, _dismissed:dismissed, _hasFlag:hasActiveFlag };
    });
  },[subs, evalFlags, manFlags, dismissals]);

  /* ── village options for filters ── */
  const allVillages = useMemo(()=>{
    const set = new Set();
    enriched.forEach(s => { const v=resolveVil(s); if(v) set.add(v); });
    return Array.from(set).sort();
  },[enriched, resolveVil]);

  /* ── farm IDs from form choices ── */
  const expectedFarmIDs = useMemo(()=>{
    if(!formDef) return [];
    const choices = formDef.content?.choices || [];
    return choices
      .filter(c => (c.list_name||"").toLowerCase().includes("farm"))
      .map(c => c.name || c.$autoname || "")
      .filter(Boolean);
  },[formDef]);

  /* ── pending computation ── */
  const { submittedFarmIDs, pendingFarmIDs } = useMemo(()=>{
    const submitted = new Set();
    enriched.forEach(s=>{
      const fid =
        s["location/select_farm_id"] || s["ANS/ANS_farm_id"] ||
        s["select_farm_id"] || s["farm_id"] || "";
      if(fid) submitted.add(String(fid).trim());
    });
    const pending = expectedFarmIDs.filter(id=>!submitted.has(id));
    return { submittedFarmIDs: submitted, pendingFarmIDs: pending };
  },[enriched, expectedFarmIDs]);

  /* ── visible columns for table ── */
  const tableCols = useMemo(()=>{
    const defaults = [
      { key:"_idx",        label:"#" },
      { key:"_farm",       label:"Farm ID" },
      { key:"_village",    label:"Village" },
      { key:"_surveyor",   label:"Surveyor" },
      { key:"_date",       label:"Date" },
      { key:"_acres",      label:"Acres" },
      { key:"_yield",      label:"Yield/Ac" },
      { key:"_dap",        label:"DAP kg" },
      { key:"_urea_bags",  label:"Urea Bags" },
      { key:"_urea_size",  label:"Bag Size" },
      { key:"_flag",       label:"Flag" },
    ];
    if(!colVis) return defaults;
    return defaults.map(c=>({ ...c, hidden:colVis[c.key]===false }));
  },[colVis]);

  /* ── row data extractor ── */
  const rowData = useCallback((s)=>({
    _idx: s._idx || "",
    _farm: s["location/select_farm_id"]||s["ANS/ANS_farm_id"]||s["select_farm_id"]||s["farm_id"]||"-",
    _village: resolveVil(s)||"-",
    _surveyor: s["surveyor_info/surveyor_name"]||s["surveyor_name"]||s["ANS/ANS_surveyor"]||"-",
    _date: s._submission_time ? new Date(s._submission_time).toLocaleDateString("en-IN") : "-",
    _acres: s["ANS/ANS_total_acres"]||s["total_acres"]||"-",
    _yield: s["ANS/ANS_wheat_yield_per_acre"]||s["wheat_yield_per_acre"]||s["ANS/ANS_yield_per_acre"]||"-",
    _dap: s["ANS/ANS_dap_kg_per_acre"]||s["dap_kg_per_acre"]||"-",
    _urea_bags: s["ANS/ANS_urea_bags"]||s["urea_bags"]||"-",
    _urea_size: s["ANS/ANS_urea_bag_size"]||s["urea_bag_size"]||"-",
    _flag: s._hasFlag ? "🚩" : "✅",
  }),[resolveVil]);

  /* ── toggle manual flag ── */
  const toggleFlag = useCallback((id, reason="")=>{
    setManFlags(prev=>{
      const cur = prev[id];
      const next = cur?.active
        ? { ...prev, [id]:{ active:false, reason } }
        : { ...prev, [id]:{ active:true, reason } };
      return next;
    });
  },[]);

  /* ── dismiss / undo ── */
  const toggleDismiss = useCallback((id)=>{
    setDismissal(prev=>({ ...prev, [id]: !prev[id] }));
  },[]);

  /* ── save edit to KoboToolbox ── */
  const saveEdit = useCallback(async(sub)=>{
    setSaving(true);
    try {
      await kobo(`/api/v2/assets/${FORM_UID}/data/${sub._id}/`, {
        method:"PATCH",
        body: JSON.stringify(editData),
      });
      setSubs(prev=>prev.map(s=>s._id===sub._id?{...s,...editData}:s));
      setEditMode(false);
      setModal(m=>m?{...m,...editData}:m);
    } catch(e){ alert("Save failed: "+e.message); }
    setSaving(false);
  },[editData]);

  /* ─────────────────────────────────────────────────────── */
  /* ── FORM POPUP DISPLAY ── */
  const displayFields = useCallback((sub)=>{
    if(surveyFields.length > 0){
      // use ordered survey fields
      return surveyFields.map(f=>{
        const keys = [
          `ANS/${f.key}`, `ANS/ANS_${f.key}`, `location/${f.key}`,
          `surveyor_info/${f.key}`, `date_time/${f.key}`, f.key
        ];
        let val = "";
        for(const k of keys){
          if(sub[k] !== undefined && sub[k] !== null && sub[k] !== ""){
            val = sub[k]; break;
          }
        }
        if(val === "") return null;
        // resolve choice label
        const display = choiceMap[String(val)] || String(val);
        return { label: f.label, val: display };
      }).filter(Boolean);
    }
    // fallback: show all non-internal keys
    return Object.entries(sub)
      .filter(([k,v])=>{
        if(HIDE_KEYS.has(k)) return false;
        if(HIDE_PAT.test(k)) return false;
        if(CALC_PAT.test(k)) return false;
        if(v===null||v===undefined||v==="") return false;
        if(typeof v==="object") return false;
        return true;
      })
      .map(([k,v])=>({
        label: k.replace(/^ANS\/ANS_|^ANS\/|^location\/|^surveyor_info\/|^date_time\//,"").replace(/_/g," "),
        val: choiceMap[String(v)]||String(v),
      }));
  },[surveyFields, choiceMap]);

  /* ─────────────────────────────────────────────────────── */
  /* ── MINI MAP COMPONENT ── */
  function MiniMap({ sub }) {
    const ref = useRef(null);
    const instRef = useRef(null);
    const geo = sub._geolocation;
    const lat = Array.isArray(geo) ? geo[0] : null;
    const lng = Array.isArray(geo) ? geo[1] : null;
    const valid = lat && lng && Math.abs(lat) > 0.001 && Math.abs(lng) > 0.001;

    useEffect(()=>{
      if(!leafletOK || !valid || !ref.current || instRef.current) return;
      const LL = window.L;
      const m = LL.map(ref.current,{ zoomControl:false, attributionControl:false });
      m.setView([lat,lng],15);
      LL.tileLayer(satellite?SAT:STR,{ maxZoom:19 }).addTo(m);
      LL.circleMarker([lat,lng],{ radius:8, color:"#ef4444", fillColor:"#ef4444", fillOpacity:0.8 }).addTo(m);
      instRef.current = m;
      setTimeout(()=>m.invalidateSize(),200);
    },[leafletOK, valid]);

    if(!valid) return <div style={{height:140,background:D.hover,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:D.muted,fontSize:12}}>No GPS data</div>;
    return <div ref={ref} style={{height:140,borderRadius:8,overflow:"hidden",marginTop:8}} />;
  }

  /* ─────────────────────────────────────────────────────── */
  /* ── FORM MODAL ── */
  function FormModal({ sub, onClose }) {
    const [editLocal, setEditLocal] = useState({});
    const [localEdit, setLocalEdit] = useState(false);
    const [noteVal, setNoteVal] = useState(notes[String(sub._id)]||"");
    const id = String(sub._id);
    const fields = displayFields(sub);

    const saveNote = (v) => {
      setNoteVal(v);
      setNotes(prev=>({ ...prev, [id]: v }));
    };

    const commitEdit = async()=>{
      setEditData(editLocal);
      await saveEdit({ ...sub, ...editLocal });
    };

    return (
      <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:12}}>
        <div onClick={e=>e.stopPropagation()} style={{background:D.card,borderRadius:16,width:"100%",maxWidth:540,maxHeight:"90vh",overflowY:"auto",display:"flex",flexDirection:"column"}}>
          {/* header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:`1px solid ${D.bdr}`,position:"sticky",top:0,background:D.card,zIndex:1}}>
            <div>
              <div style={{fontWeight:700,fontSize:15,color:D.text}}>
                {sub._hasFlag ? "🚩" : "✅"} Farm {rowData(sub)._farm}
              </div>
              <div style={{fontSize:11,color:D.muted}}>{resolveVil(sub)||""} • {rowData(sub)._date}</div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setLocalEdit(!localEdit)} style={{background:localEdit?D.accent+"22":"transparent",border:`1px solid ${localEdit?D.accent:D.bdr}`,color:localEdit?D.accent:D.muted,borderRadius:8,padding:"4px 12px",fontSize:12,cursor:"pointer"}}>
                {localEdit?"Cancel Edit":"✏️ Edit"}
              </button>
              <button onClick={onClose} style={{background:"transparent",border:"none",fontSize:20,cursor:"pointer",color:D.muted,lineHeight:1}}>✕</button>
            </div>
          </div>
          {/* mini map */}
          <div style={{padding:"12px 20px 0"}}>
            <MiniMap sub={sub} />
          </div>
          {/* flags */}
          {sub._autoFlags?.length > 0 && (
            <div style={{margin:"12px 20px 0",padding:"10px 14px",background:D.danger+"15",borderRadius:10,border:`1px solid ${D.danger}33`}}>
              <div style={{fontSize:11,fontWeight:700,color:D.danger,marginBottom:4}}>AUTO FLAGS</div>
              {sub._autoFlags.map((f,i)=>(
                <div key={i} style={{fontSize:12,color:D.danger}}>
                  {f.rule.label}: {f.val} {f.rule.unit} ({f.dir === "low" ? "< "+f.rule.min : "> "+f.rule.max})
                </div>
              ))}
            </div>
          )}
          {/* note */}
          <div style={{padding:"10px 20px 0"}}>
            <textarea
              value={noteVal}
              onChange={e=>saveNote(e.target.value)}
              placeholder="Add a note / observation..."
              rows={2}
              style={{width:"100%",boxSizing:"border-box",background:D.hover,border:`1px solid ${D.bdr}`,borderRadius:8,padding:"8px 10px",fontSize:12,color:D.text,resize:"vertical",outline:"none"}}
            />
          </div>
          {/* dismiss button */}
          <div style={{padding:"6px 20px 0",display:"flex",gap:8}}>
            <button
              onClick={()=>toggleDismiss(id)}
              style={{fontSize:11,padding:"4px 12px",borderRadius:8,border:`1px solid ${sub._dismissed?D.success:D.warn}`,background:"transparent",color:sub._dismissed?D.success:D.warn,cursor:"pointer"}}
            >
              {sub._dismissed ? "↩ Undo Dismiss" : "✓ Mark Normal"}
            </button>
            <button
              onClick={()=>toggleFlag(id, noteVal)}
              style={{fontSize:11,padding:"4px 12px",borderRadius:8,border:`1px solid ${sub._manFlag?.active?D.danger:D.bdr}`,background:"transparent",color:sub._manFlag?.active?D.danger:D.muted,cursor:"pointer"}}
            >
              {sub._manFlag?.active ? "🚩 Remove Flag" : "🚩 Manual Flag"}
            </button>
          </div>
          {/* fields */}
          <div style={{padding:"12px 20px 16px"}}>
            {fields.map((f,i)=>(
              <div key={i} style={{display:"flex",gap:12,padding:"7px 0",borderBottom:`1px solid ${D.bdr}22`,alignItems:"flex-start"}}>
                <span style={{color:D.muted,fontSize:11,width:170,flexShrink:0,paddingTop:1,textTransform:"capitalize"}}>{f.label}</span>
                {localEdit ? (
                  <input
                    defaultValue={f.val}
                    onChange={e=>{
                      // find the actual key
                      const possibleKeys = [`ANS/ANS_${f.label.replace(/ /g,"_").toLowerCase()}`, f.label.replace(/ /g,"_").toLowerCase()];
                      setEditLocal(prev=>({ ...prev, [possibleKeys[0]]: e.target.value }));
                    }}
                    style={{flex:1,background:D.hover,border:`1px solid ${D.bdr}`,borderRadius:6,padding:"3px 8px",fontSize:12,color:D.text,outline:"none"}}
                  />
                ) : (
                  <span style={{color:D.text,fontSize:13,fontWeight:500,flex:1,wordBreak:"break-word"}}>{f.val}</span>
                )}
              </div>
            ))}
            {localEdit && (
              <button
                onClick={commitEdit}
                disabled={saving}
                style={{marginTop:12,background:D.accent,color:"#fff",border:"none",borderRadius:10,padding:"8px 20px",fontSize:13,cursor:"pointer",fontWeight:600,width:"100%"}}
              >
                {saving?"Saving…":"💾 Save to KoboToolbox"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────── */
  /* ── MAP TAB ── */
  function MapTab() {
    const [showList, setShowList] = useState(false);
    const [listSub, setListSub] = useState(null);
    const filtered = useMemo(()=>{
      if(!mapSearch.trim()) return enriched;
      const q = mapSearch.toLowerCase();
      return enriched.filter(s=>
        resolveVil(s)?.toLowerCase().includes(q) ||
        (s["location/select_farm_id"]||"").toLowerCase().includes(q) ||
        (s["surveyor_info/surveyor_name"]||"").toLowerCase().includes(q)
      );
    },[mapSearch]);

    useEffect(()=>{
      if(!leafletOK || !mapRef.current) return;
      const LL = window.L;
      if(!mapInst.current){
        mapInst.current = LL.map(mapRef.current,{ zoomControl:true });
        mapInst.current.setView([26.5, 80.5], 9);
      }
      // clear markers
      markersRef.current.forEach(m=>m.remove());
      markersRef.current = [];
      // update tiles
      mapInst.current.eachLayer(l=>{ if(l._url) mapInst.current.removeLayer(l); });
      LL.tileLayer(satellite?SAT:STR,{ maxZoom:20, attribution:"" }).addTo(mapInst.current);
      // add markers
      filtered.forEach(s=>{
        const geo=s._geolocation;
        if(!Array.isArray(geo)||!geo[0]||!geo[1]) return;
        const [lat,lng]=[geo[0],geo[1]];
        if(Math.abs(lat)<0.001&&Math.abs(lng)<0.001) return;
        const color = s._hasFlag ? "#ef4444" : "#10b981";
        const m = LL.circleMarker([lat,lng],{ radius:7, color, fillColor:color, fillOpacity:0.8, weight:2 });
        const rd = rowData(s);
        m.bindPopup(`<b>Farm ${rd._farm}</b><br>${rd._village}<br>${rd._surveyor}<br>${rd._date}${s._hasFlag?"<br>🚩 Flagged":""}`);
        m.addTo(mapInst.current);
        markersRef.current.push(m);
      });
      setTimeout(()=>mapInst.current.invalidateSize(),100);
    },[leafletOK, filtered, satellite]);

    return (
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <input value={mapSearch} onChange={e=>setMapSearch(e.target.value)} placeholder="Search village / farm / surveyor…"
            style={{flex:"1 1 200px",minWidth:140,padding:"8px 12px",border:`1px solid ${D.bdr}`,borderRadius:10,background:D.card,color:D.text,fontSize:13,outline:"none"}} />
          <button onClick={()=>setSatellite(!satellite)} style={{padding:"8px 14px",border:`1px solid ${D.bdr}`,borderRadius:10,background:D.card,color:D.text,cursor:"pointer",fontSize:12}}>
            {satellite?"🗺 Street":"🛰 Satellite"}
          </button>
          <button onClick={()=>setShowList(!showList)} style={{padding:"8px 14px",border:`1px solid ${D.bdr}`,borderRadius:10,background:D.card,color:D.text,cursor:"pointer",fontSize:12}}>
            ☰ List ({filtered.length})
          </button>
        </div>
        <div style={{position:"relative",borderRadius:14,overflow:"hidden",height:480,border:`1px solid ${D.bdr}`}}>
          <div ref={mapRef} style={{height:"100%",width:"100%"}} />
          {/* mobile list drawer */}
          {showList && (
            <div style={{position:"absolute",top:0,right:0,bottom:0,width:"min(280px,85vw)",background:D.card,zIndex:500,overflowY:"auto",borderLeft:`1px solid ${D.bdr}`,WebkitOverflowScrolling:"touch"}}>
              <div style={{padding:"10px 14px",borderBottom:`1px solid ${D.bdr}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:600,fontSize:13,color:D.text}}>Submissions</span>
                <button onClick={()=>setShowList(false)} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:D.muted}}>✕</button>
              </div>
              {filtered.map(s=>{
                const rd=rowData(s);
                return (
                  <div key={s._id}
                    onTouchEnd={()=>{ setModal(s); setShowList(false); }}
                    onClick={()=>{ setModal(s); setShowList(false); }}
                    style={{padding:"10px 14px",borderBottom:`1px solid ${D.bdr}22`,cursor:"pointer",minHeight:48,display:"flex",flexDirection:"column",gap:2,WebkitTapHighlightColor:"rgba(0,0,0,0.1)"}}>
                    <div style={{fontSize:12,fontWeight:600,color:D.text}}>Farm {rd._farm} {s._hasFlag?"🚩":""}</div>
                    <div style={{fontSize:11,color:D.muted}}>{rd._village} • {rd._date}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={{fontSize:11,color:D.muted,textAlign:"center"}}>
          🟢 Clean &nbsp;🔴 Flagged &nbsp;• {filtered.length} shown
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────── */
  /* ── OVERVIEW TAB ── */
  function OverviewTab() {
    const total = enriched.length;
    const flagged = enriched.filter(s=>s._hasFlag).length;
    const clean = total - flagged;
    const pending = expectedFarmIDs.length > 0 ? pendingFarmIDs.length : "—";
    const done = total;

    const bySurveyor = useMemo(()=>{
      const m={};
      enriched.forEach(s=>{
        const sv=s["surveyor_info/surveyor_name"]||s["surveyor_name"]||"Unknown";
        m[sv]=(m[sv]||0)+1;
      });
      return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,10);
    },[enriched]);

    const byVil = useMemo(()=>{
      const m={};
      enriched.forEach(s=>{ const v=resolveVil(s)||"Unknown"; m[v]=(m[v]||0)+1; });
      return Object.entries(m).sort((a,b)=>b[1]-a[1]);
    },[enriched, resolveVil]);

    const cards = [
      { label:"Total Submissions", val:total, color:D.accent },
      { label:"Done / Collected",  val:done,  color:D.success },
      { label:"Pending",           val:pending, color:D.warn },
      { label:"🚩 Flagged",        val:flagged, color:D.danger },
      { label:"✅ Clean",          val:clean,  color:D.success },
    ];

    return (
      <div style={{display:"flex",flexDirection:"column",gap:20}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12}}>
          {cards.map(c=>(
            <div key={c.label} style={{background:D.card,borderRadius:14,padding:"16px 18px",border:`1px solid ${D.bdr}`,borderLeft:`4px solid ${c.color}`}}>
              <div style={{fontSize:26,fontWeight:800,color:c.color}}>{c.val}</div>
              <div style={{fontSize:11,color:D.muted,marginTop:2}}>{c.label}</div>
            </div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div style={{background:D.card,borderRadius:14,padding:16,border:`1px solid ${D.bdr}`}}>
            <div style={{fontWeight:700,fontSize:13,color:D.text,marginBottom:10}}>By Surveyor</div>
            {bySurveyor.map(([sv,cnt])=>(
              <div key={sv} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${D.bdr}22`,fontSize:12}}>
                <span style={{color:D.text}}>{sv}</span>
                <span style={{color:D.accent,fontWeight:700}}>{cnt}</span>
              </div>
            ))}
          </div>
          <div style={{background:D.card,borderRadius:14,padding:16,border:`1px solid ${D.bdr}`}}>
            <div style={{fontWeight:700,fontSize:13,color:D.text,marginBottom:10}}>By Village</div>
            {byVil.map(([v,cnt])=>(
              <div key={v} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${D.bdr}22`,fontSize:12}}>
                <span style={{color:D.text}}>{v}</span>
                <span style={{color:D.accent,fontWeight:700}}>{cnt}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────── */
  /* ── FLAGS TAB ── */
  function FlagsTab() {
    const flagged = enriched.filter(s=>s._hasFlag && !s._dismissed);
    const clean   = enriched.filter(s=>!s._hasFlag);
    const dismissed = enriched.filter(s=>s._dismissed);

    const displayed = useMemo(()=>{
      if(!flagSearch.trim()) return flagged;
      const q = flagSearch.toLowerCase();
      return flagged.filter(s=>{
        const rd=rowData(s);
        return rd._farm.toLowerCase().includes(q)||rd._village.toLowerCase().includes(q)||rd._surveyor.toLowerCase().includes(q);
      });
    },[flagSearch, flagged]);

    return (
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {[
            {label:"🚩 Flagged",val:flagged.length,c:D.danger},
            {label:"✅ Clean",val:clean.length,c:D.success},
            {label:"↩ Dismissed",val:dismissed.length,c:D.muted},
          ].map(b=>(
            <div key={b.label} style={{background:D.card,border:`1px solid ${D.bdr}`,borderRadius:12,padding:"10px 18px",fontSize:13,fontWeight:600,color:b.c}}>
              {b.label}: {b.val}
            </div>
          ))}
        </div>
        {/* active rules summary */}
        <div style={{background:D.card,border:`1px solid ${D.bdr}`,borderRadius:12,padding:14}}>
          <div style={{fontWeight:700,fontSize:12,color:D.muted,marginBottom:8}}>ACTIVE FLAG RULES</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {rules.filter(r=>r.active).map(r=>(
              <span key={r.id} style={{background:D.tag,color:D.tagT,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600}}>
                {r.label}: {r.min??"-"}–{r.max??"-"} {r.unit}
              </span>
            ))}
          </div>
        </div>
        <input value={flagSearch} onChange={e=>setFlagSearch(e.target.value)} placeholder="Search farm ID, village, surveyor…"
          style={{padding:"8px 14px",border:`1px solid ${D.bdr}`,borderRadius:10,background:D.card,color:D.text,fontSize:13,outline:"none"}} />
        {/* table */}
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{background:D.hover}}>
                {["Farm ID","Village","Surveyor","Date","Flags","Actions"].map(h=>(
                  <th key={h} style={{padding:"8px 10px",textAlign:"left",color:D.muted,fontWeight:600,whiteSpace:"nowrap",borderBottom:`1px solid ${D.bdr}`}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map(s=>{
                const rd=rowData(s);
                return (
                  <tr key={s._id} onClick={()=>setModal(s)} style={{cursor:"pointer",borderBottom:`1px solid ${D.bdr}22`}}
                    onMouseEnter={e=>e.currentTarget.style.background=D.hover}
                    onMouseLeave={e=>e.currentTarget.style.background=""}>
                    <td style={{padding:"8px 10px",color:D.text,fontWeight:600}}>{rd._farm}</td>
                    <td style={{padding:"8px 10px",color:D.text}}>{rd._village}</td>
                    <td style={{padding:"8px 10px",color:D.muted}}>{rd._surveyor}</td>
                    <td style={{padding:"8px 10px",color:D.muted,whiteSpace:"nowrap"}}>{rd._date}</td>
                    <td style={{padding:"8px 10px"}}>
                      {s._autoFlags.map((f,i)=>(
                        <div key={i} style={{color:D.danger,fontSize:11}}>{f.rule.label}: {f.val} ({f.dir})</div>
                      ))}
                      {s._manFlag?.active && <div style={{color:D.danger,fontSize:11}}>Manual 🚩</div>}
                    </td>
                    <td style={{padding:"8px 10px"}}>
                      <button onClick={e=>{e.stopPropagation();toggleDismiss(String(s._id));}}
                        style={{fontSize:10,padding:"2px 8px",border:`1px solid ${D.bdr}`,borderRadius:6,background:"transparent",color:D.muted,cursor:"pointer"}}>
                        {s._dismissed?"↩":"✓ Normal"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {displayed.length===0 && (
                <tr><td colSpan={6} style={{textAlign:"center",padding:24,color:D.muted}}>No flagged forms</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────── */
  /* ── PENDING TAB ── */
  function PendingTab() {
    const pendSubs = useMemo(()=>{
      // pending = farm IDs not yet submitted
      // if we don't have expectedFarmIDs, show submissions with "pending" validation status
      if(expectedFarmIDs.length > 0){
        return pendingFarmIDs.map(fid=>({
          _farmId: fid,
          _village: resolveVilFromFarmId(fid),
        }));
      }
      // fallback: show all submissions sorted
      return enriched;
    },[]);

    const resolveVilFromFarmId = (fid) => {
      // try to get village from submitted forms with same farm ID
      const match = enriched.find(s=>{
        const f=s["location/select_farm_id"]||s["ANS/ANS_farm_id"]||"";
        return String(f).trim()===String(fid).trim();
      });
      if(match) return resolveVil(match);
      // try village from form choices
      if(formDef){
        const choices=formDef.content?.choices||[];
        const fChoice=choices.find(c=>(c.name||c.$autoname||"")===fid);
        if(fChoice){
          const vilCode=(fChoice["filter_value"]||"").toUpperCase();
          return vilMap[vilCode]||vilCode||null;
        }
      }
      return null;
    };

    // If using submissions directly (no expected farm IDs)
    const sortedSubs = useMemo(()=>{
      let s=[...enriched];
      if(pendSort==="newest") s.sort((a,b)=>new Date(b._submission_time)-new Date(a._submission_time));
      if(pendSort==="oldest") s.sort((a,b)=>new Date(a._submission_time)-new Date(b._submission_time));
      if(pendSort==="village") s.sort((a,b)=>(resolveVil(a)||"").localeCompare(resolveVil(b)||""));
      if(pendVil!=="all") s=s.filter(x=>resolveVil(x)===pendVil);
      if(pendSearch.trim()){
        const q=pendSearch.toLowerCase();
        s=s.filter(x=>{
          const rd=rowData(x);
          return rd._farm.toLowerCase().includes(q)||rd._village.toLowerCase().includes(q)||rd._surveyor.toLowerCase().includes(q);
        });
      }
      return s;
    },[pendSort, pendVil, pendSearch]);

    const showSubs = expectedFarmIDs.length===0;

    return (
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",fontSize:12}}>
          <div style={{background:D.card,border:`1px solid ${D.bdr}`,borderRadius:10,padding:"8px 14px",color:D.text}}>
            Total Submissions: <b style={{color:D.accent}}>{enriched.length}</b>
          </div>
          {expectedFarmIDs.length>0 && <>
            <div style={{background:D.card,border:`1px solid ${D.bdr}`,borderRadius:10,padding:"8px 14px",color:D.text}}>
              Done: <b style={{color:D.success}}>{submittedFarmIDs.size}</b>
            </div>
            <div style={{background:D.card,border:`1px solid ${D.bdr}`,borderRadius:10,padding:"8px 14px",color:D.text}}>
              Pending: <b style={{color:D.warn}}>{pendingFarmIDs.length}</b>
            </div>
          </>}
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <input value={pendSearch} onChange={e=>setPendSearch(e.target.value)} placeholder="Search…"
            style={{flex:"1 1 160px",padding:"7px 12px",border:`1px solid ${D.bdr}`,borderRadius:10,background:D.card,color:D.text,fontSize:12,outline:"none"}} />
          <select value={pendSort} onChange={e=>setPendSort(e.target.value)}
            style={{padding:"7px 12px",border:`1px solid ${D.bdr}`,borderRadius:10,background:D.card,color:D.text,fontSize:12,outline:"none"}}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="village">By Village</option>
          </select>
          <select value={pendVil} onChange={e=>setPendVil(e.target.value)}
            style={{padding:"7px 12px",border:`1px solid ${D.bdr}`,borderRadius:10,background:D.card,color:D.text,fontSize:12,outline:"none"}}>
            <option value="all">All Villages</option>
            {allVillages.map(v=><option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{background:D.hover}}>
                {["Farm ID","Village","Surveyor","Date","Status","Flags"].map(h=>(
                  <th key={h} style={{padding:"8px 10px",textAlign:"left",color:D.muted,fontWeight:600,borderBottom:`1px solid ${D.bdr}`,whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedSubs.map(s=>{
                const rd=rowData(s);
                return (
                  <tr key={s._id} onClick={()=>setModal(s)} style={{cursor:"pointer",borderBottom:`1px solid ${D.bdr}22`}}
                    onMouseEnter={e=>e.currentTarget.style.background=D.hover}
                    onMouseLeave={e=>e.currentTarget.style.background=""}>
                    <td style={{padding:"8px 10px",fontWeight:600,color:D.text}}>{rd._farm} ▶</td>
                    <td style={{padding:"8px 10px",color:D.text}}>{rd._village}</td>
                    <td style={{padding:"8px 10px",color:D.muted}}>{rd._surveyor}</td>
                    <td style={{padding:"8px 10px",color:D.muted,whiteSpace:"nowrap"}}>{rd._date}</td>
                    <td style={{padding:"8px 10px"}}>
                      <span style={{background:D.success+"22",color:D.success,borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:600}}>Submitted</span>
                    </td>
                    <td style={{padding:"8px 10px"}}>{s._hasFlag?"🚩":""}</td>
                  </tr>
                );
              })}
              {sortedSubs.length===0 && (
                <tr><td colSpan={6} style={{textAlign:"center",padding:24,color:D.muted}}>No submissions match</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────── */
  /* ── TABLE TAB ── */
  function TableTab() {
    const allRows = useMemo(()=>{
      let s=[...enriched];
      if(tableFilter==="flagged") s=s.filter(x=>x._hasFlag);
      if(tableFilter==="clean")   s=s.filter(x=>!x._hasFlag);
      if(tableSort==="newest") s.sort((a,b)=>new Date(b._submission_time)-new Date(a._submission_time));
      if(tableSort==="oldest") s.sort((a,b)=>new Date(a._submission_time)-new Date(b._submission_time));
      if(tableSearch.trim()){
        const q=tableSearch.toLowerCase();
        s=s.filter(x=>{
          const rd=rowData(x);
          return rd._farm.toLowerCase().includes(q)||rd._village.toLowerCase().includes(q)||rd._surveyor.toLowerCase().includes(q);
        });
      }
      return s.map((x,i)=>({ ...x, _idx:i+1 }));
    },[tableFilter, tableSort, tableSearch, enriched]);

    const visCols = tableCols.filter(c=>!c.hidden);

    const toggleCol = (key) => {
      setColVis(prev=>{
        const cur = prev || {};
        return { ...cur, [key]: cur[key]===false ? true : false };
      });
    };

    const toggleRow = (id) => {
      setSelRows(prev=>{
        const next=new Set(prev);
        next.has(id)?next.delete(id):next.add(id);
        return next;
      });
    };

    return (
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          {["all","flagged","clean"].map(f=>(
            <button key={f} onClick={()=>setTableFilter(f)}
              style={{padding:"6px 14px",border:`1px solid ${tableFilter===f?D.accent:D.bdr}`,borderRadius:20,background:tableFilter===f?D.accent+"22":"transparent",color:tableFilter===f?D.accent:D.muted,fontSize:12,cursor:"pointer",fontWeight:600}}>
              {f==="all"?"All":f==="flagged"?"🚩 Flagged":"✅ Clean"}
              {" "}({f==="all"?enriched.length:f==="flagged"?enriched.filter(s=>s._hasFlag).length:enriched.filter(s=>!s._hasFlag).length})
            </button>
          ))}
          <input value={tableSearch} onChange={e=>setTableSearch(e.target.value)} placeholder="Search…"
            style={{flex:"1 1 140px",padding:"6px 12px",border:`1px solid ${D.bdr}`,borderRadius:10,background:D.card,color:D.text,fontSize:12,outline:"none"}} />
          <select value={tableSort} onChange={e=>setTableSort(e.target.value)}
            style={{padding:"6px 10px",border:`1px solid ${D.bdr}`,borderRadius:10,background:D.card,color:D.text,fontSize:12,outline:"none"}}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowColMenu(!showColMenu)}
              style={{padding:"6px 12px",border:`1px solid ${D.bdr}`,borderRadius:10,background:D.card,color:D.muted,fontSize:12,cursor:"pointer"}}>
              ☰ Columns
            </button>
            {showColMenu && (
              <div style={{position:"absolute",top:"110%",right:0,background:D.card,border:`1px solid ${D.bdr}`,borderRadius:12,padding:10,zIndex:100,minWidth:160,boxShadow:"0 4px 20px rgba(0,0,0,0.15)"}}>
                {tableCols.map(c=>(
                  <label key={c.key} style={{display:"flex",gap:8,alignItems:"center",padding:"4px 6px",cursor:"pointer",fontSize:12,color:D.text}}>
                    <input type="checkbox" checked={colVis?colVis[c.key]!==false:true} onChange={()=>toggleCol(c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        {selRows.size>0 && (
          <div style={{fontSize:12,color:D.accent,fontWeight:600}}>✓ {selRows.size} form{selRows.size>1?"s":""} selected</div>
        )}
        <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:600}}>
            <thead>
              <tr style={{background:D.hover}}>
                <th style={{padding:"8px 6px",width:32}}>
                  <input type="checkbox" onChange={e=>{
                    if(e.target.checked) setSelRows(new Set(allRows.map(r=>r._id)));
                    else setSelRows(new Set());
                  }} />
                </th>
                {visCols.map(c=>(
                  <th key={c.key} style={{padding:"8px 10px",textAlign:"left",color:D.muted,fontWeight:600,borderBottom:`1px solid ${D.bdr}`,whiteSpace:"nowrap"}}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allRows.map(s=>{
                const rd=rowData(s);
                const checked=selRows.has(s._id);
                return (
                  <tr key={s._id}
                    style={{cursor:"pointer",background:checked?D.accent+"11":"",borderBottom:`1px solid ${D.bdr}22`}}
                    onMouseEnter={e=>!checked&&(e.currentTarget.style.background=D.hover)}
                    onMouseLeave={e=>!checked&&(e.currentTarget.style.background="")}>
                    <td style={{padding:"8px 6px"}} onClick={e=>e.stopPropagation()}>
                      <input type="checkbox" checked={checked} onChange={()=>toggleRow(s._id)} />
                    </td>
                    {visCols.map(c=>(
                      <td key={c.key} onClick={()=>setModal(s)}
                        style={{padding:"8px 10px",color:c.key==="_flag"?(s._hasFlag?D.danger:D.success):D.text,whiteSpace:"nowrap"}}>
                        {rd[c.key]}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {allRows.length===0 && (
                <tr><td colSpan={visCols.length+1} style={{textAlign:"center",padding:24,color:D.muted}}>No submissions found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────── */
  /* ── SETTINGS TAB ── */
  function SettingsTab() {
    const [localRules, setLocalRules] = useState(rules);

    const update = (id, field, val) => {
      setLocalRules(prev=>prev.map(r=>r.id===id?{ ...r, [field]:val===''?null:(isNaN(val)?val:Number(val)) }:r));
    };
    const save = () => { setRules(localRules); alert("✅ Rules saved!"); };
    const reset = () => { setLocalRules(DEFAULT_RULES); setRules(DEFAULT_RULES); };
    const addRule = () => {
      if(!newRule.label||!newRule.pat) return;
      const r = { id:"r"+Date.now(), ...newRule, min:newRule.min===''?null:Number(newRule.min), max:newRule.max===''?null:Number(newRule.max), active:true };
      setLocalRules(prev=>[...prev,r]);
      setNewRule({label:"",pat:"",min:"",max:"",unit:""});
    };

    return (
      <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:600}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontWeight:700,fontSize:15,color:D.text}}>⚙️ Flag Rules</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={reset} style={{padding:"6px 14px",border:`1px solid ${D.bdr}`,borderRadius:10,background:"transparent",color:D.muted,fontSize:12,cursor:"pointer"}}>Reset Defaults</button>
            <button onClick={save} style={{padding:"6px 16px",border:"none",borderRadius:10,background:D.accent,color:"#fff",fontSize:12,cursor:"pointer",fontWeight:600}}>Save Rules</button>
          </div>
        </div>
        <div style={{fontSize:11,color:D.muted}}>Enable/disable rules and set min/max thresholds. "pat" is a pattern that matches field names in the KoboToolbox form.</div>
        {localRules.map(r=>(
          <div key={r.id} style={{background:D.card,border:`1px solid ${r.active?D.accent:D.bdr}`,borderRadius:12,padding:14,display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
            <label style={{display:"flex",gap:6,alignItems:"center",cursor:"pointer",minWidth:60}}>
              <input type="checkbox" checked={r.active} onChange={e=>update(r.id,"active",e.target.checked)} />
              <span style={{fontSize:12,fontWeight:600,color:r.active?D.text:D.muted}}>{r.label}</span>
            </label>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",flex:1}}>
              <input value={r.min??""} onChange={e=>update(r.id,"min",e.target.value)} placeholder="Min" type="number"
                style={{width:70,padding:"4px 8px",border:`1px solid ${D.bdr}`,borderRadius:8,background:D.hover,color:D.text,fontSize:12,outline:"none"}} />
              <input value={r.max??""} onChange={e=>update(r.id,"max",e.target.value)} placeholder="Max" type="number"
                style={{width:70,padding:"4px 8px",border:`1px solid ${D.bdr}`,borderRadius:8,background:D.hover,color:D.text,fontSize:12,outline:"none"}} />
              <span style={{fontSize:11,color:D.muted,alignSelf:"center"}}>{r.unit}</span>
              <button onClick={()=>setLocalRules(prev=>prev.filter(x=>x.id!==r.id))}
                style={{marginLeft:"auto",padding:"2px 8px",border:`1px solid ${D.danger}44`,borderRadius:8,background:"transparent",color:D.danger,cursor:"pointer",fontSize:11}}>
                ✕ Remove
              </button>
            </div>
          </div>
        ))}
        {/* add new rule */}
        <div style={{background:D.card,border:`1px dashed ${D.bdr}`,borderRadius:12,padding:14}}>
          <div style={{fontSize:12,fontWeight:600,color:D.muted,marginBottom:10}}>+ ADD NEW RULE</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <input value={newRule.label} onChange={e=>setNewRule(p=>({...p,label:e.target.value}))} placeholder="Label (e.g. Keara)"
              style={{flex:"1 1 100px",padding:"6px 10px",border:`1px solid ${D.bdr}`,borderRadius:8,background:D.hover,color:D.text,fontSize:12,outline:"none"}} />
            <input value={newRule.pat} onChange={e=>setNewRule(p=>({...p,pat:e.target.value}))} placeholder="Field pattern (e.g. keara)"
              style={{flex:"1 1 100px",padding:"6px 10px",border:`1px solid ${D.bdr}`,borderRadius:8,background:D.hover,color:D.text,fontSize:12,outline:"none"}} />
            <input value={newRule.min} onChange={e=>setNewRule(p=>({...p,min:e.target.value}))} placeholder="Min" type="number"
              style={{width:65,padding:"6px 8px",border:`1px solid ${D.bdr}`,borderRadius:8,background:D.hover,color:D.text,fontSize:12,outline:"none"}} />
            <input value={newRule.max} onChange={e=>setNewRule(p=>({...p,max:e.target.value}))} placeholder="Max" type="number"
              style={{width:65,padding:"6px 8px",border:`1px solid ${D.bdr}`,borderRadius:8,background:D.hover,color:D.text,fontSize:12,outline:"none"}} />
            <input value={newRule.unit} onChange={e=>setNewRule(p=>({...p,unit:e.target.value}))} placeholder="Unit"
              style={{width:60,padding:"6px 8px",border:`1px solid ${D.bdr}`,borderRadius:8,background:D.hover,color:D.text,fontSize:12,outline:"none"}} />
            <button onClick={addRule}
              style={{padding:"6px 14px",border:"none",borderRadius:8,background:D.accent,color:"#fff",fontSize:12,cursor:"pointer",fontWeight:600,opacity:(!newRule.label||!newRule.pat)?0.5:1}}>
              + Add
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────── */
  /* ── TABS ── */
  const TABS = [
    { id:"overview", label:"📊 Overview" },
    { id:"map",      label:"🗺 Map" },
    { id:"flags",    label:`🚩 Flags (${enriched.filter(s=>s._hasFlag).length})` },
    { id:"pending",  label:"⏳ Pending" },
    { id:"table",    label:"📋 Table" },
    { id:"settings", label:"⚙️ Settings" },
  ];

  /* ─────────────────────────────────────────────────────── */
  return (
    <div style={{minHeight:"100vh",background:D.bg,fontFamily:"system-ui,-apple-system,sans-serif",color:D.text}}>
      {/* header */}
      <div style={{background:D.card,borderBottom:`1px solid ${D.bdr}`,padding:"12px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontWeight:800,fontSize:16,color:D.text}}>🌾 Endline Dashboard</div>
          <div style={{fontSize:11,color:D.muted}}>KoboToolbox • {enriched.length} submissions loaded</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={fetchAll} disabled={loading}
            style={{padding:"6px 14px",border:`1px solid ${D.bdr}`,borderRadius:10,background:D.card,color:loading?D.muted:D.accent,cursor:loading?"wait":"pointer",fontSize:12,fontWeight:600}}>
            {loading?"⟳ Loading…":"↻ Refresh"}
          </button>
          <button onClick={()=>setDark(!dark)}
            style={{padding:"6px 12px",border:`1px solid ${D.bdr}`,borderRadius:10,background:D.card,color:D.muted,cursor:"pointer",fontSize:14}}>
            {dark?"☀️":"🌙"}
          </button>
        </div>
      </div>

      {/* tab bar */}
      <div style={{background:D.card,borderBottom:`1px solid ${D.bdr}`,display:"flex",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"10px 16px",border:"none",borderBottom:`2px solid ${tab===t.id?D.accent:"transparent"}`,background:"transparent",color:tab===t.id?D.accent:D.muted,cursor:"pointer",fontSize:12,fontWeight:tab===t.id?700:400,whiteSpace:"nowrap"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* content */}
      <div style={{padding:"20px 16px",maxWidth:1100,margin:"0 auto"}}>
        {loading && <div style={{textAlign:"center",padding:40,color:D.muted,fontSize:14}}>⟳ Loading survey data…</div>}
        {err && <div style={{textAlign:"center",padding:20,color:D.danger,fontSize:13}}>⚠️ Error: {err}</div>}
        {!loading && !err && (
          <>
            {tab==="overview" && <OverviewTab />}
            {tab==="map"      && <MapTab />}
            {tab==="flags"    && <FlagsTab />}
            {tab==="pending"  && <PendingTab />}
            {tab==="table"    && <TableTab />}
            {tab==="settings" && <SettingsTab />}
          </>
        )}
      </div>

      {/* modal */}
      {modal && <FormModal sub={modal} onClose={()=>{ setModal(null); setEditMode(false); setEditData({}); }} />}
    </div>
  );
}
