import React from 'react';

// ── CONFIG — replace these three before deploying ─────────────────────────────
const SB_URL   = 'https://vjygnftcljqbcemoowuv.supabase.co';
const SB_KEY   = 'sb_publishable_KWLuDguFDagF4JKa_a13YQ_rk498okJ';
const SB_HDR   = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
const EDIT_PIN = '1234';
const TT_NAVY  = '#16191f';
const TT_OR    = '#c87941';

const STATUS = {
  construction: { label: 'Construction', color: '#4a9acf',  bg: 'rgba(74,154,207,0.12)'  },
  stabilized:   { label: 'Stabilized',   color: '#6a9e7f',  bg: 'rgba(106,158,127,0.12)' },
  extended:     { label: 'Extended',     color: '#c87941',  bg: 'rgba(200,121,65,0.12)'  },
  paid_off:     { label: 'Paid Off',     color: '#4a4f5a',  bg: 'rgba(74,79,90,0.12)'    },
  other:        { label: 'Other',        color: '#9aa0aa',  bg: 'rgba(154,160,170,0.12)' },
};

const PROMPT = `You are a commercial real estate paralegal. Extract information from the provided loan documents into the exact JSON schema below. NEVER guess — use null for anything not explicitly stated. Dates: YYYY-MM-DD. Dollars: numbers only. Percentages: numbers only. Return ONLY valid JSON, no text outside it.

{
  "property_name": "short name e.g. 'Buford, GA'",
  "borrower_entity": "full legal LLC name",
  "loan_type": "construction | permanent | bridge | land | mezz | other",
  "status": "construction | stabilized | extended | paid_off | other",
  "lender": "primary lender name",
  "participants": [{"name": "...", "commitment": 0, "pct": 0}],
  "loan_amount": 0,
  "closing_date": "YYYY-MM-DD",
  "initial_maturity_date": "YYYY-MM-DD",
  "initial_term_months": 0,
  "extension_options": [{"number": 1, "length_months": 0, "extended_maturity_date": "YYYY-MM-DD", "fee_pct": 0, "fee_amount": 0, "conditions": ["..."]}],
  "interest_rate_type": "fixed | floating",
  "interest_rate_fixed": null,
  "interest_rate_index": null,
  "interest_rate_spread": null,
  "interest_rate_floor": null,
  "interest_rate_description": "human readable e.g. 'Term SOFR + 3.35%, floor 8.00%'",
  "default_rate_description": null,
  "amortization": "IO | PI | IO_then_PI",
  "amortization_description": null,
  "origination_fee_pct": null,
  "origination_fee_amount": null,
  "exit_fee_description": null,
  "prepayment_description": null,
  "hedge_requirement": null,
  "completion_guaranty_pct": null,
  "repayment_guaranty_pct": null,
  "guaranty_burndown": [{"trigger": "description", "pct_after": 0}],
  "guaranty_notes": null,
  "dscr_covenant": null,
  "dscr_formula": null,
  "dscr_test_date": null,
  "ltv_covenant": null,
  "liquidity_covenant": null,
  "net_worth_covenant": null,
  "equity_deposit": null,
  "distribution_restriction": null,
  "lender_reserves_per_unit": null,
  "completion_deadline": null,
  "reporting_borrower": ["..."],
  "reporting_guarantor": ["..."],
  "change_order_individual": null,
  "change_order_aggregate": null,
  "development_fee_schedule": null,
  "draw_requirements": null,
  "spe_requirements": null,
  "subordinate_debt_permitted": null,
  "transfer_restrictions": null,
  "insurance_requirements": null,
  "environmental_indemnity": null,
  "lender_contact": null,
  "draw_contact": null,
  "other_notable_terms": null,
  "confidence_flags": ["field names where you had ambiguity"],
  "extraction_notes": "overall notes, missing sections, items needing review"
}`;

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$    = v => v == null ? '—' : '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtM    = v => v == null ? '—' : '$' + (v / 1e6).toFixed(2) + 'M';
const fmtPct  = v => v == null ? '—' : v + '%';
const fmtDate = s => { if (!s) return '—'; try { return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return s; } };
const daysTo  = s => { if (!s) return null; return Math.ceil((new Date(s + 'T12:00:00') - new Date()) / 86400000); };

// ── PIN Modal ─────────────────────────────────────────────────────────────────
function PinModal({ onSuccess, onClose }) {
  const [digits, setDigits] = React.useState([]);
  const push = d => {
    const n = [...digits, d];
    setDigits(n);
    if (n.length === 4) {
      if (n.join('') === EDIT_PIN) setTimeout(() => { onSuccess(); setDigits([]); }, 180);
      else setTimeout(() => setDigits([]), 380);
    }
  };
  const overlay = { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 };
  const box = { background:'#1e2128', border:'1px solid #2e3340', borderTop:`3px solid ${TT_OR}`, borderRadius:6, padding:'2rem', width:280, textAlign:'center' };
  const btn = { padding:'12px', background:'#13151a', border:'1px solid #2e3340', borderRadius:4, color:'#e8eaed', fontSize:'1rem', cursor:'pointer', fontFamily:'inherit', fontWeight:500 };
  return (
    <div style={overlay}>
      <div style={box}>
        <div style={{ fontSize:'0.65rem', letterSpacing:'0.18em', textTransform:'uppercase', color:TT_OR, marginBottom:'1.25rem', fontWeight:600 }}>Enter PIN to Edit</div>
        <div style={{ display:'flex', justifyContent:'center', gap:10, marginBottom:'1.5rem' }}>
          {[0,1,2,3].map(i => <div key={i} style={{ width:14, height:14, borderRadius:'50%', background:i<digits.length?TT_OR:'transparent', border:`2px solid ${i<digits.length?TT_OR:'#4a4f5a'}`, transition:'all 0.15s' }} />)}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:8 }}>
          {[1,2,3,4,5,6,7,8,9].map(n => <button key={n} style={btn} onClick={() => push(String(n))}>{n}</button>)}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          <div/>
          <button style={btn} onClick={() => push('0')}>0</button>
          <button style={{ ...btn, background:'none', color:'#4a4f5a', fontSize:'0.75rem' }} onClick={onClose}>✕</button>
        </div>
      </div>
    </div>
  );
}

// ── Small shared components ───────────────────────────────────────────────────
function Badge({ status }) {
  const c = STATUS[status] || STATUS.other;
  return <span style={{ fontSize:'0.62rem', fontWeight:700, color:c.color, background:c.bg, padding:'2px 8px', borderRadius:10, whiteSpace:'nowrap' }}>{c.label}</span>;
}
function Maturity({ date }) {
  if (!date) return <span style={{ color:'#4a4f5a' }}>—</span>;
  const d = daysTo(date);
  const col = d < 90 ? '#c47474' : d < 180 ? '#c87941' : '#9aa0aa';
  return <div><div style={{ color:col, fontVariantNumeric:'tabular-nums', fontSize:'0.8rem', fontWeight:600 }}>{fmtDate(date)}</div><div style={{ fontSize:'0.62rem', color:d<90?'#c47474':'#4a4f5a' }}>{d<0?`${Math.abs(d)}d past`:`${d}d`}</div></div>;
}
function SH({ children }) {
  return <div style={{ fontSize:'0.58rem', color:TT_OR, textTransform:'uppercase', letterSpacing:'0.15em', fontWeight:700, marginBottom:'0.75rem', paddingBottom:'0.4rem', borderBottom:'1px solid #1e2330' }}>{children}</div>;
}
function F({ label, value, warn }) {
  const empty = value == null || value === '' || value === '—';
  return (
    <div style={{ marginBottom:'0.6rem' }}>
      <div style={{ fontSize:'0.58rem', color:'#4a4f5a', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2, display:'flex', gap:4, alignItems:'center' }}>
        {label}{warn && <span style={{ fontSize:'0.55rem', color:'#c87941', background:'rgba(200,121,65,0.12)', padding:'1px 4px', borderRadius:2 }}>⚠</span>}
      </div>
      <div style={{ fontSize:'0.8rem', color:empty?'#2e3340':'#c8cdd6', lineHeight:1.4 }}>{empty?'—':value}</div>
    </div>
  );
}

// ── Portfolio ─────────────────────────────────────────────────────────────────
function Portfolio({ loans, onSelect, onNew, pinUnlocked, requirePin }) {
  const [q, setQ]         = React.useState('');
  const [fSt, setFSt]     = React.useState('all');
  const [fTy, setFTy]     = React.useState('all');
  const [sk, setSk]       = React.useState('initial_maturity_date');
  const [sd, setSd]       = React.useState(1);

  const active   = loans.filter(l => l.status !== 'paid_off');
  const total    = loans.reduce((s,l) => s+(l.loan_amount||0), 0);
  const soon     = active.filter(l => { const d=daysTo(l.initial_maturity_date); return d!=null&&d>=0&&d<180; });

  const rows = loans
    .filter(l => fSt==='all'||l.status===fSt)
    .filter(l => fTy==='all'||l.loan_type===fTy)
    .filter(l => { if(!q) return true; const lq=q.toLowerCase(); return [l.property_name,l.lender,l.borrower_entity].some(v=>(v||'').toLowerCase().includes(lq)); })
    .sort((a,b) => { const av=a[sk],bv=b[sk]; if(av==null)return 1; if(bv==null)return -1; return av<bv?-sd:av>bv?sd:0; });

  const TH = ({k,label,right}) => (
    <th onClick={() => sk===k?setSd(d=>-d):(setSk(k),setSd(1))}
      style={{ padding:'0.55rem 0.85rem', textAlign:right?'right':'left', fontSize:'0.58rem', color:sk===k?TT_OR:'#4a4f5a', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:400, cursor:'pointer', userSelect:'none', background:'#0f1117', whiteSpace:'nowrap' }}>
      {label}{sk===k?(sd===1?' ↑':' ↓'):''}
    </th>
  );
  const sel = { background:'#13151a', border:'1px solid #2e3340', borderRadius:3, color:'#9aa0aa', padding:'6px 10px', fontFamily:'inherit', fontSize:'0.78rem' };

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
        {[
          { label:'Total Loans',      val:loans.length,   sub:`${active.length} active` },
          { label:'Total Commitment', val:fmtM(total),    sub:'across all loans' },
          { label:'Maturing < 180d',  val:soon.length,    sub:soon.map(l=>l.property_name).join(', ')||'none', warn:soon.length>0 },
          { label:'Avg Loan Size',    val:loans.length?fmtM(total/loans.length):'—', sub:'portfolio average' },
        ].map(({label,val,sub,warn}) => (
          <div key={label} style={{ background:'#13151a', border:`1px solid ${warn?'#c47474':'#1e2330'}`, borderRadius:4, padding:'0.85rem 1.1rem' }}>
            <div style={{ fontSize:'0.55rem', color:'#4a4f5a', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:3 }}>{label}</div>
            <div style={{ fontSize:'1.2rem', fontWeight:700, color:warn?'#c47474':'#e8eaed', fontVariantNumeric:'tabular-nums' }}>{val}</div>
            <div style={{ fontSize:'0.62rem', color:'#4a4f5a', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{sub}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:'0.75rem', marginBottom:'1rem', flexWrap:'wrap', alignItems:'center' }}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search property, lender, entity…"
          style={{ flex:1, minWidth:200, background:'#13151a', border:'1px solid #2e3340', borderRadius:3, color:'#e8eaed', padding:'6px 10px', fontFamily:'inherit', fontSize:'0.8rem' }} />
        <select value={fSt} onChange={e=>setFSt(e.target.value)} style={sel}>
          <option value="all">All Statuses</option>
          {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={fTy} onChange={e=>setFTy(e.target.value)} style={sel}>
          <option value="all">All Types</option>
          {['construction','permanent','bridge','land','mezz','other'].map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
        </select>
        <button onClick={()=>requirePin(onNew)} style={{ padding:'6px 16px', background:pinUnlocked?TT_OR:'#2a2d35', border:'none', borderRadius:3, color:pinUnlocked?'#fff':'#4a4f5a', cursor:'pointer', fontFamily:'inherit', fontSize:'0.78rem', fontWeight:600, whiteSpace:'nowrap' }}>
          {pinUnlocked?'+ New Loan':'🔒 New Loan'}
        </button>
      </div>
      <div style={{ background:'#13151a', border:'1px solid #1e2330', borderRadius:4, overflow:'hidden' }}>
        {rows.length===0 ? (
          <div style={{ padding:'3rem', textAlign:'center', color:'#4a4f5a', fontSize:'0.82rem' }}>{loans.length===0?'No loans yet — click New Loan to get started.':'No loans match filters.'}</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr><TH k="property_name" label="Property"/><TH k="lender" label="Lender"/><TH k="loan_amount" label="Amount" right/><TH k="loan_type" label="Type"/><TH k="status" label="Status"/><TH k="initial_maturity_date" label="Maturity"/><TH k="interest_rate_description" label="Rate"/><TH k="repayment_guaranty_pct" label="Recourse"/></tr></thead>
            <tbody>
              {rows.map((l,i) => {
                const bg = i%2===0?'#13151a':'#111418';
                return (
                  <tr key={l.id} onClick={()=>onSelect(l)} style={{ background:bg, cursor:'pointer' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#1a1d24'} onMouseLeave={e=>e.currentTarget.style.background=bg}>
                    <td style={{ padding:'0.75rem 0.85rem', borderBottom:'1px solid #1a1d24' }}>
                      <div style={{ fontWeight:600, color:'#c8cdd6', fontSize:'0.82rem' }}>{l.property_name||'—'}</div>
                      <div style={{ fontSize:'0.65rem', color:'#4a4f5a', marginTop:1 }}>{(l.borrower_entity||'').slice(0,45)}{(l.borrower_entity||'').length>45?'…':''}</div>
                    </td>
                    <td style={{ padding:'0.75rem 0.85rem', borderBottom:'1px solid #1a1d24', fontSize:'0.8rem', color:'#9aa0aa' }}>
                      {l.lender||'—'}{l.participants?.length>0&&<div style={{ fontSize:'0.62rem', color:'#4a4f5a' }}>+{l.participants.length} participant{l.participants.length>1?'s':''}</div>}
                    </td>
                    <td style={{ padding:'0.75rem 0.85rem', borderBottom:'1px solid #1a1d24', textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:'0.82rem', color:'#e8eaed', fontWeight:600 }}>{fmtM(l.loan_amount)}</td>
                    <td style={{ padding:'0.75rem 0.85rem', borderBottom:'1px solid #1a1d24' }}><span style={{ fontSize:'0.67rem', color:'#9aa0aa', background:'#1e2330', padding:'2px 7px', borderRadius:3 }}>{l.loan_type||'—'}</span></td>
                    <td style={{ padding:'0.75rem 0.85rem', borderBottom:'1px solid #1a1d24' }}><Badge status={l.status}/></td>
                    <td style={{ padding:'0.75rem 0.85rem', borderBottom:'1px solid #1a1d24' }}><Maturity date={l.initial_maturity_date}/></td>
                    <td style={{ padding:'0.75rem 0.85rem', borderBottom:'1px solid #1a1d24', fontSize:'0.78rem', color:'#9aa0aa' }}>{l.interest_rate_description||'—'}</td>
                    <td style={{ padding:'0.75rem 0.85rem', borderBottom:'1px solid #1a1d24', fontSize:'0.78rem', color:'#9aa0aa' }}>
                      {l.repayment_guaranty_pct!=null?`${l.repayment_guaranty_pct}%`:'—'}{l.guaranty_burndown?.length>0&&<div style={{ fontSize:'0.62rem', color:'#4a4f5a' }}>burns down</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div style={{ marginTop:'0.5rem', fontSize:'0.62rem', color:'#4a4f5a' }}>{rows.length} of {loans.length} loans shown</div>
    </div>
  );
}

// ── LoanDetail ────────────────────────────────────────────────────────────────
function LoanDetail({ loan, onBack, onSave, onDelete, pinUnlocked, requirePin }) {
  const [editing, setEditing]       = React.useState(false);
  const [form, setForm]             = React.useState(loan);
  const [saving, setSaving]         = React.useState(false);
  const [sec, setSec]               = React.useState('structure');
  const [docs, setDocs]             = React.useState([]);
  const [uploading, setUploading]   = React.useState(false);
  const [upMsg, setUpMsg]           = React.useState('');
  const [extracting, setExtracting] = React.useState(false);
  const [exLog, setExLog]           = React.useState('');
  const [delConf, setDelConf]       = React.useState(false);

  const flags = loan.confidence_flags || [];
  const fl = f => flags.some(x => x.toLowerCase().includes(f.toLowerCase()));

  React.useEffect(() => { loadDocs(); }, [loan.id]);

  async function loadDocs() {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/loan_documents?loan_id=eq.${loan.id}&order=uploaded_at.desc`, { headers: SB_HDR });
      if (r.ok) setDocs(await r.json());
    } catch(e) {}
  }

  async function upload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true); setUpMsg(`Uploading ${files.length} file${files.length>1?'s':''}…`);
    try {
      for (const file of files) {
        const path = `${loan.id}/${Date.now()}_${file.name}`;
        const up = await fetch(`${SB_URL}/storage/v1/object/loan-documents/${path}`, {
          method: 'POST', headers: { 'apikey':SB_KEY, 'Authorization':`Bearer ${SB_KEY}`, 'Content-Type':file.type||'application/octet-stream' }, body: file,
        });
        if (!up.ok) { setUpMsg('Upload failed: '+(await up.text())); setUploading(false); return; }
        await fetch(`${SB_URL}/rest/v1/loan_documents`, { method:'POST', headers:SB_HDR, body:JSON.stringify({ loan_id:loan.id, file_name:file.name, storage_path:path, file_type:file.type, file_size:file.size }) });
      }
      await loadDocs(); setUpMsg(`✓ ${files.length} file${files.length>1?'s':''} uploaded`);
      setTimeout(()=>setUpMsg(''), 3000);
    } catch(err) { setUpMsg('Error: '+err.message); }
    setUploading(false); e.target.value='';
  }

  async function extract() {
    if (!docs.length) { setExLog('No documents uploaded.'); return; }
    setExtracting(true); setExLog('Reading documents…');
    try {
      // Read all documents into base64 — server handles splitting
      const documents = [];
      for (const doc of docs.slice(0,5)) {
        setExLog(`Reading ${doc.file_name}…`);
        const dl = await fetch(`${SB_URL}/storage/v1/object/loan-documents/${doc.storage_path}`, { headers:{ 'apikey':SB_KEY, 'Authorization':`Bearer ${SB_KEY}` } });
        if (!dl.ok) continue;
        const blob = await dl.blob();
        const b64 = await new Promise(res => { const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.readAsDataURL(blob); });
        const media = doc.file_name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        documents.push({ base64: b64, media_type: media, name: doc.file_name });
      }
      if (!documents.length) { setExLog('Could not read documents.'); setExtracting(false); return; }
      setExLog(`Sending ${documents.length} doc${documents.length>1?'s':''} to Claude (large PDFs will be split automatically)…`);

      const api = await fetch('/api/extract', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ documents, prompt: PROMPT }),
      });
      if (!api.ok) { const e=await api.json(); setExLog('API error: '+(e.error?.message||JSON.stringify(e))); setExtracting(false); return; }

      setExLog('Parsing results…');
      const data = await api.json();
      const raw = data.content?.find(c=>c.type==='text')?.text||'';
      let extracted;
      try { const m=raw.match(/\{[\s\S]*\}/); if(!m) throw new Error('no JSON'); extracted=JSON.parse(m[0]); }
      catch(err) { setExLog('Parse error — raw: '+raw.slice(0,300)); setExtracting(false); return; }

      const merged = { ...loan };
      for (const [k,v] of Object.entries(extracted)) { if(v!==null&&v!==''&&!(Array.isArray(v)&&v.length===0)) merged[k]=v; }

      setExLog('Saving…');
      const sr = await fetch(`${SB_URL}/rest/v1/loans?id=eq.${loan.id}`, { method:'PATCH', headers:{ ...SB_HDR, 'Prefer':'return=representation' }, body:JSON.stringify(merged) });
      if (sr.ok) {
        const saved = await sr.json();
        onSave(Array.isArray(saved)?saved[0]:saved);
        setExLog(`✓ Done — ${(extracted.confidence_flags||[]).length} field(s) flagged`);
        setTimeout(()=>setExLog(''), 5000);
      } else { setExLog('Save error: '+await sr.text()); }
    } catch(err) { setExLog('Error: '+err.message); }
    setExtracting(false);
  }

  async function saveEdit() {
    setSaving(true);
    const r = await fetch(`${SB_URL}/rest/v1/loans?id=eq.${loan.id}`, { method:'PATCH', headers:{ ...SB_HDR,'Prefer':'return=representation' }, body:JSON.stringify(form) });
    if (r.ok) { const d=await r.json(); onSave(Array.isArray(d)?d[0]:d); setEditing(false); }
    setSaving(false);
  }

  async function delDoc(id, path) {
    await fetch(`${SB_URL}/storage/v1/object/loan-documents/${path}`, { method:'DELETE', headers:{ 'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}` } });
    await fetch(`${SB_URL}/rest/v1/loan_documents?id=eq.${id}`, { method:'DELETE', headers:SB_HDR });
    await loadDocs();
  }

  async function delLoan() {
    await fetch(`${SB_URL}/rest/v1/loan_documents?loan_id=eq.${loan.id}`, { method:'DELETE', headers:SB_HDR });
    await fetch(`${SB_URL}/rest/v1/loans?id=eq.${loan.id}`, { method:'DELETE', headers:SB_HDR });
    onDelete();
  }

  const iSt = { background:'#1a1d24', border:'1px solid #2e3340', borderRadius:3, color:'#e8eaed', padding:'5px 8px', fontFamily:'inherit', fontSize:'0.78rem', width:'100%', boxSizing:'border-box' };
  const SECS = ['structure','pricing','recourse','covenants','reporting','documents'];

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:'1rem', marginBottom:'1.5rem', flexWrap:'wrap' }}>
        <button onClick={onBack} style={{ background:'none', border:'1px solid #2e3340', borderRadius:3, color:'#9aa0aa', padding:'5px 12px', cursor:'pointer', fontFamily:'inherit', fontSize:'0.75rem' }}>← Portfolio</button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:'1.1rem', fontWeight:700, color:'#e8eaed' }}>{loan.property_name||'Untitled Loan'}</div>
          <div style={{ fontSize:'0.7rem', color:'#4a4f5a', marginTop:1 }}>{loan.borrower_entity}</div>
        </div>
        <Badge status={loan.status}/>
        <div style={{ display:'flex', gap:'0.5rem' }}>
          {!editing ? (
            <>
              <button onClick={()=>requirePin(()=>setEditing(true))} style={{ padding:'5px 14px', background:pinUnlocked?'rgba(200,121,65,0.12)':'#1a1d24', border:`1px solid ${pinUnlocked?TT_OR+'44':'#2e3340'}`, borderRadius:3, color:pinUnlocked?TT_OR:'#4a4f5a', cursor:'pointer', fontFamily:'inherit', fontSize:'0.75rem' }}>
                {pinUnlocked?'✏ Edit':'🔒 Edit'}
              </button>
              <button onClick={()=>requirePin(()=>setDelConf(true))} style={{ padding:'5px 12px', background:'none', border:'1px solid #2e3340', borderRadius:3, color:'#4a4f5a', cursor:'pointer', fontFamily:'inherit', fontSize:'0.75rem' }}>✕</button>
            </>
          ) : (
            <>
              <button onClick={saveEdit} disabled={saving} style={{ padding:'5px 16px', background:TT_OR, border:'none', borderRadius:3, color:'#fff', cursor:'pointer', fontFamily:'inherit', fontSize:'0.75rem', fontWeight:600 }}>{saving?'Saving…':'Save'}</button>
              <button onClick={()=>{ setForm(loan); setEditing(false); }} style={{ padding:'5px 12px', background:'none', border:'1px solid #2e3340', borderRadius:3, color:'#9aa0aa', cursor:'pointer', fontFamily:'inherit', fontSize:'0.75rem' }}>Cancel</button>
            </>
          )}
        </div>
      </div>

      {delConf && (
        <div style={{ background:'#1a0f0f', border:'1px solid #c47474', borderRadius:4, padding:'0.85rem 1.25rem', marginBottom:'1rem', display:'flex', alignItems:'center', gap:'1rem', flexWrap:'wrap' }}>
          <span style={{ fontSize:'0.8rem', color:'#c47474', flex:1 }}>Delete <strong>{loan.property_name}</strong>? All documents and data will be permanently removed.</span>
          <button onClick={delLoan} style={{ padding:'4px 14px', background:'#c47474', border:'none', borderRadius:3, color:'#fff', fontFamily:'inherit', fontSize:'0.72rem', fontWeight:700, cursor:'pointer' }}>Delete</button>
          <button onClick={()=>setDelConf(false)} style={{ padding:'4px 12px', background:'none', border:'1px solid #2e3340', borderRadius:3, color:'#9aa0aa', fontFamily:'inherit', fontSize:'0.72rem', cursor:'pointer' }}>Cancel</button>
        </div>
      )}

      {flags.length>0 && (
        <div style={{ background:'rgba(200,121,65,0.07)', border:'1px solid rgba(200,121,65,0.25)', borderRadius:4, padding:'0.65rem 1rem', marginBottom:'0.75rem', fontSize:'0.72rem', color:'#c87941' }}>
          <strong>⚠ {flags.length} field{flags.length!==1?'s':''} flagged for review:</strong> {flags.join(' · ')}
        </div>
      )}
      {loan.extraction_notes && (
        <div style={{ background:'rgba(74,122,158,0.07)', border:'1px solid rgba(74,122,158,0.25)', borderRadius:4, padding:'0.65rem 1rem', marginBottom:'0.75rem', fontSize:'0.72rem', color:'#4a7a9e' }}>
          <strong>Note:</strong> {loan.extraction_notes}
        </div>
      )}

      {/* Section tabs */}
      <div style={{ display:'flex', borderBottom:'1px solid #2e3340', marginBottom:'1.5rem' }}>
        {SECS.map(s => (
          <button key={s} onClick={()=>setSec(s)} style={{ padding:'0.45rem 1.1rem', border:'none', borderBottom:`2px solid ${sec===s?TT_OR:'transparent'}`, background:'none', color:sec===s?TT_OR:'#4a4f5a', cursor:'pointer', fontFamily:'inherit', fontSize:'0.72rem', textTransform:'capitalize', fontWeight:sec===s?600:400 }}>
            {s==='documents'?`Documents (${docs.length})`:s}
          </button>
        ))}
      </div>

      {/* Structure */}
      {sec==='structure'&&!editing&&(
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'1.5rem' }}>
          <div>
            <SH>Loan Identity</SH>
            <F label="Property" value={loan.property_name}/><F label="Borrower Entity" value={loan.borrower_entity}/><F label="Loan Type" value={loan.loan_type}/><F label="Loan Amount" value={fmt$(loan.loan_amount)}/><F label="Closing Date" value={fmtDate(loan.closing_date)}/>
          </div>
          <div>
            <SH>Lender</SH>
            <F label="Lender" value={loan.lender}/>
            {loan.participants?.length>0&&<div style={{ marginBottom:'0.65rem' }}><div style={{ fontSize:'0.58rem', color:'#4a4f5a', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Participants</div>{loan.participants.map((p,i)=><div key={i} style={{ fontSize:'0.78rem', color:'#c8cdd6', marginBottom:3 }}>{p.name} — {fmt$(p.commitment)} ({p.pct}%)</div>)}</div>}
          </div>
          <div>
            <SH>Term & Extensions</SH>
            <F label="Initial Term" value={loan.initial_term_months?`${loan.initial_term_months} months`:null}/>
            <F label="Initial Maturity" value={<Maturity date={loan.initial_maturity_date}/>}/>
            {(loan.extension_options||[]).map((ext,i)=>(
              <div key={i} style={{ background:'#0f1117', border:'1px solid #1e2330', borderRadius:3, padding:'0.6rem 0.75rem', marginBottom:'0.5rem' }}>
                <div style={{ fontSize:'0.62rem', color:TT_OR, fontWeight:600, marginBottom:3 }}>Extension {ext.number}</div>
                <div style={{ fontSize:'0.75rem', color:'#9aa0aa' }}>{ext.length_months} months — fee {fmtPct(ext.fee_pct)}</div>
                <div style={{ marginTop:3 }}><Maturity date={ext.extended_maturity_date}/></div>
                {ext.conditions?.length>0&&<ul style={{ marginTop:4, paddingLeft:14, fontSize:'0.7rem', color:'#4a4f5a' }}>{ext.conditions.map((c,j)=><li key={j} style={{ marginBottom:2 }}>{c}</li>)}</ul>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pricing */}
      {sec==='pricing'&&!editing&&(
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'1.5rem' }}>
          <div>
            <SH>Interest Rate</SH>
            <F label="Rate" value={loan.interest_rate_description} warn={fl('interest_rate')}/>
            {loan.interest_rate_type==='floating'&&<><F label="Index" value={loan.interest_rate_index}/><F label="Spread" value={loan.interest_rate_spread!=null?`+${loan.interest_rate_spread}%`:null}/><F label="Floor" value={fmtPct(loan.interest_rate_floor)}/></>}
            {loan.interest_rate_type==='fixed'&&<F label="Fixed Rate" value={fmtPct(loan.interest_rate_fixed)}/>}
            <F label="Default Rate" value={loan.default_rate_description}/><F label="Hedge" value={loan.hedge_requirement}/>
          </div>
          <div>
            <SH>Fees & Amortization</SH>
            <F label="Origination Fee" value={loan.origination_fee_amount?`${fmtPct(loan.origination_fee_pct)} = ${fmt$(loan.origination_fee_amount)}`:fmtPct(loan.origination_fee_pct)}/>
            <F label="Exit Fee" value={loan.exit_fee_description}/><F label="Prepayment" value={loan.prepayment_description}/><F label="Amortization" value={loan.amortization_description}/>
          </div>
          <div>
            <SH>Other</SH>
            <F label="Change Order (Individual)" value={fmt$(loan.change_order_individual)} warn={fl('change_order')}/>
            <F label="Change Order (Aggregate)" value={fmt$(loan.change_order_aggregate)}/>
            <F label="Equity Deposit" value={fmt$(loan.equity_deposit)}/><F label="Dev Fee Schedule" value={loan.development_fee_schedule}/>
            <F label="Lender Reserves" value={loan.lender_reserves_per_unit!=null?`$${loan.lender_reserves_per_unit}/unit`:null}/>
            <F label="Completion Deadline" value={loan.completion_deadline}/>
          </div>
        </div>
      )}

      {/* Recourse */}
      {sec==='recourse'&&!editing&&(
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'1.5rem' }}>
          <div>
            <SH>Guaranty Structure</SH>
            <F label="Completion Guaranty" value={fmtPct(loan.completion_guaranty_pct)} warn={fl('completion_guaranty')}/>
            <F label="Repayment Guaranty" value={fmtPct(loan.repayment_guaranty_pct)} warn={fl('repayment_guaranty')}/>
            <F label="Notes" value={loan.guaranty_notes}/>
            {(loan.guaranty_burndown||[]).length>0&&(
              <div style={{ marginTop:'0.5rem' }}>
                <div style={{ fontSize:'0.58rem', color:'#4a4f5a', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Burn-Down Schedule</div>
                {loan.guaranty_burndown.map((s,i)=>(
                  <div key={i} style={{ background:'#0f1117', border:'1px solid #1e2330', borderRadius:3, padding:'0.6rem 0.75rem', marginBottom:'0.4rem' }}>
                    <div style={{ fontSize:'0.72rem', color:'#6a9e7f', fontWeight:600 }}>Reduces to {s.pct_after}%</div>
                    <div style={{ fontSize:'0.7rem', color:'#9aa0aa', marginTop:2 }}>{s.trigger}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <SH>SPE & Transfer</SH>
            <F label="SPE Requirements" value={loan.spe_requirements}/><F label="Transfer Restrictions" value={loan.transfer_restrictions}/>
            <F label="Subordinate Debt" value={loan.subordinate_debt_permitted!=null?(loan.subordinate_debt_permitted?'Permitted':'Not Permitted'):null}/>
          </div>
          <div>
            <SH>Other Obligations</SH>
            <F label="Environmental Indemnity" value={loan.environmental_indemnity}/><F label="Insurance" value={loan.insurance_requirements}/>
            <F label="Draw Requirements" value={loan.draw_requirements}/><F label="Other Notable Terms" value={loan.other_notable_terms}/>
          </div>
        </div>
      )}

      {/* Covenants */}
      {sec==='covenants'&&!editing&&(
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'1.5rem' }}>
          <div>
            <SH>Financial Covenants</SH>
            <F label="Liquidity Minimum" value={fmt$(loan.liquidity_covenant)} warn={fl('liquidity')}/>
            <F label="Net Worth Minimum" value={fmt$(loan.net_worth_covenant)} warn={fl('net_worth')}/>
            <F label="DSCR Covenant" value={loan.dscr_covenant!=null?`${loan.dscr_covenant}x`:null} warn={fl('dscr')}/>
            <F label="DSCR Formula" value={loan.dscr_formula}/><F label="DSCR Test Date" value={loan.dscr_test_date}/>
            <F label="LTV Covenant" value={loan.ltv_covenant!=null?`${loan.ltv_covenant}%`:null}/>
          </div>
          <div><SH>Operating Covenants</SH><F label="Distribution Restriction" value={loan.distribution_restriction} warn={fl('distribution')}/></div>
          <div/>
        </div>
      )}

      {/* Reporting */}
      {sec==='reporting'&&!editing&&(
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'1.5rem' }}>
          <div>
            <SH>Borrower Reporting</SH>
            {(loan.reporting_borrower||[]).length>0?loan.reporting_borrower.map((r,i)=><div key={i} style={{ fontSize:'0.78rem', color:'#c8cdd6', paddingLeft:10, borderLeft:'2px solid #1e2330', marginBottom:8, lineHeight:1.4 }}>{r}</div>):<div style={{ fontSize:'0.75rem', color:'#2e3340' }}>Not extracted</div>}
          </div>
          <div>
            <SH>Guarantor Reporting</SH>
            {(loan.reporting_guarantor||[]).length>0?loan.reporting_guarantor.map((r,i)=><div key={i} style={{ fontSize:'0.78rem', color:'#c8cdd6', paddingLeft:10, borderLeft:'2px solid #1e2330', marginBottom:8, lineHeight:1.4 }}>{r}</div>):<div style={{ fontSize:'0.75rem', color:'#2e3340' }}>Not extracted</div>}
          </div>
          <div><SH>Contacts</SH><F label="Lender Contact" value={loan.lender_contact}/><F label="Draw Contact" value={loan.draw_contact}/></div>
        </div>
      )}

      {/* Documents */}
      {sec==='documents'&&!editing&&(
        <div>
          <div style={{ background:'#0f1117', border:'2px dashed #2e3340', borderRadius:4, padding:'1.5rem', textAlign:'center', marginBottom:'1.25rem' }}>
            <div style={{ fontSize:'0.75rem', color:'#4a4f5a', marginBottom:'0.75rem' }}>Upload loan documents (PDF or DOCX) — up to 5 per loan. Upload all documents before running extraction.</div>
            <div style={{ display:'flex', justifyContent:'center', gap:'0.75rem', flexWrap:'wrap' }}>
              <label style={{ padding:'6px 18px', background:'#1e2330', border:'1px solid #2e3340', borderRadius:3, color:'#9aa0aa', cursor:'pointer', fontSize:'0.78rem', fontFamily:'inherit' }}>
                {uploading?'Uploading…':'↑ Upload Documents'}
                <input type="file" accept=".pdf,.docx,.doc" multiple onChange={upload} disabled={uploading||docs.length>=5} style={{ display:'none' }}/>
              </label>
              {docs.length>0&&(
                <button onClick={extract} disabled={extracting} style={{ padding:'6px 18px', background:extracting?'#2a2d35':TT_OR, border:'none', borderRadius:3, color:extracting?'#4a4f5a':'#fff', cursor:extracting?'default':'pointer', fontSize:'0.78rem', fontFamily:'inherit', fontWeight:600 }}>
                  {extracting?'Extracting…':'⚡ Extract Abstract'}
                </button>
              )}
            </div>
            {upMsg&&<div style={{ marginTop:'0.75rem', fontSize:'0.72rem', color:upMsg.startsWith('✓')?'#6a9e7f':'#c47474' }}>{upMsg}</div>}
            {exLog&&<div style={{ marginTop:'0.5rem', fontSize:'0.72rem', color:exLog.startsWith('✓')?'#6a9e7f':'#c87941', fontFamily:'monospace' }}>{exLog}</div>}
          </div>
          {docs.length>0&&(
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ background:'#0f1117', borderBottom:'1px solid #1e2330' }}>{['File','Size','Uploaded',''].map(h=><th key={h} style={{ padding:'0.5rem 0.85rem', textAlign:'left', fontSize:'0.58rem', color:'#4a4f5a', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:400 }}>{h}</th>)}</tr></thead>
              <tbody>
                {docs.map(d=>(
                  <tr key={d.id} style={{ borderBottom:'1px solid #1a1d24' }}>
                    <td style={{ padding:'0.65rem 0.85rem', fontSize:'0.8rem' }}><a href={`${SB_URL}/storage/v1/object/loan-documents/${d.storage_path}?download=true`} target="_blank" rel="noreferrer" style={{ color:'#4a9acf' }}>{d.file_name}</a></td>
                    <td style={{ padding:'0.65rem 0.85rem', fontSize:'0.72rem', color:'#4a4f5a' }}>{d.file_size?Math.round(d.file_size/1024)+' KB':'—'}</td>
                    <td style={{ padding:'0.65rem 0.85rem', fontSize:'0.72rem', color:'#4a4f5a' }}>{d.uploaded_at?fmtDate(d.uploaded_at.slice(0,10)):'—'}</td>
                    <td style={{ padding:'0.65rem 0.85rem' }}><button onClick={()=>requirePin(()=>delDoc(d.id,d.storage_path))} style={{ background:'none', border:'none', color:'#c4747455', cursor:'pointer', fontSize:'0.78rem' }}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Edit form */}
      {editing&&(
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'1.25rem' }}>
          <div>
            <SH>Loan Identity</SH>
            {[['property_name','Property Name','text'],['borrower_entity','Borrower Entity','text'],['lender','Lender','text'],['loan_amount','Loan Amount ($)','number'],['closing_date','Closing Date','date'],['initial_maturity_date','Maturity Date','date'],['initial_term_months','Initial Term (months)','number']].map(([k,l,t])=>(
              <div key={k} style={{ marginBottom:'0.6rem' }}>
                <label style={{ fontSize:'0.58rem', color:'#4a4f5a', textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:2 }}>{l}</label>
                <input type={t} value={form[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={iSt}/>
              </div>
            ))}
            <div style={{ marginBottom:'0.6rem' }}><label style={{ fontSize:'0.58rem', color:'#4a4f5a', textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:2 }}>Status</label><select value={form.status||''} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={iSt}>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
            <div style={{ marginBottom:'0.6rem' }}><label style={{ fontSize:'0.58rem', color:'#4a4f5a', textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:2 }}>Loan Type</label><select value={form.loan_type||''} onChange={e=>setForm(f=>({...f,loan_type:e.target.value}))} style={iSt}>{['construction','permanent','bridge','land','mezz','other'].map(t=><option key={t} value={t}>{t}</option>)}</select></div>
          </div>
          <div>
            <SH>Pricing</SH>
            {[['interest_rate_description','Rate Description','text'],['origination_fee_pct','Origination Fee %','number'],['origination_fee_amount','Origination Fee $','number'],['interest_rate_spread','Spread %','number'],['interest_rate_floor','Floor %','number']].map(([k,l,t])=>(
              <div key={k} style={{ marginBottom:'0.6rem' }}><label style={{ fontSize:'0.58rem', color:'#4a4f5a', textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:2 }}>{l}</label><input type={t} value={form[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={iSt}/></div>
            ))}
            {[['amortization_description','Amortization'],['prepayment_description','Prepayment'],['default_rate_description','Default Rate'],['exit_fee_description','Exit Fee'],['hedge_requirement','Hedge'],['development_fee_schedule','Dev Fee Schedule']].map(([k,l])=>(
              <div key={k} style={{ marginBottom:'0.6rem' }}><label style={{ fontSize:'0.58rem', color:'#4a4f5a', textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:2 }}>{l}</label><textarea value={form[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} rows={2} style={{ ...iSt, resize:'vertical' }}/></div>
            ))}
          </div>
          <div>
            <SH>Covenants & Recourse</SH>
            {[['completion_guaranty_pct','Completion Guaranty %','number'],['repayment_guaranty_pct','Repayment Guaranty %','number'],['liquidity_covenant','Liquidity Min ($)','number'],['net_worth_covenant','Net Worth Min ($)','number'],['dscr_covenant','DSCR Covenant','number'],['ltv_covenant','LTV %','number'],['equity_deposit','Equity Deposit ($)','number'],['change_order_individual','Change Order Ind ($)','number'],['change_order_aggregate','Change Order Agg ($)','number'],['lender_reserves_per_unit','Reserves ($/unit)','number']].map(([k,l,t])=>(
              <div key={k} style={{ marginBottom:'0.6rem' }}><label style={{ fontSize:'0.58rem', color:'#4a4f5a', textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:2 }}>{l}</label><input type={t} value={form[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={iSt}/></div>
            ))}
            {[['dscr_formula','DSCR Formula'],['dscr_test_date','DSCR Test Date'],['distribution_restriction','Distribution Restriction'],['completion_deadline','Completion Deadline'],['other_notable_terms','Other Notable Terms'],['lender_contact','Lender Contact'],['draw_contact','Draw Contact']].map(([k,l])=>(
              <div key={k} style={{ marginBottom:'0.6rem' }}><label style={{ fontSize:'0.58rem', color:'#4a4f5a', textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:2 }}>{l}</label><textarea value={form[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} rows={2} style={{ ...iSt, resize:'vertical' }}/></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── NewLoanModal ───────────────────────────────────────────────────────────────
function NewLoanModal({ onSave, onClose }) {
  const [form, setForm] = React.useState({ property_name:'', lender:'', loan_type:'construction', status:'construction' });
  const [saving, setSaving] = React.useState(false);
  const iSt = { background:'#1a1d24', border:'1px solid #2e3340', borderRadius:3, color:'#e8eaed', padding:'6px 10px', fontFamily:'inherit', fontSize:'0.8rem', width:'100%', boxSizing:'border-box' };

  async function save() {
    if (!form.property_name) return;
    setSaving(true);
    const r = await fetch(`${SB_URL}/rest/v1/loans`, { method:'POST', headers:SB_HDR, body:JSON.stringify({ ...form, created_at:new Date().toISOString() }) });
    if (r.ok) { const d=await r.json(); onSave(Array.isArray(d)?d[0]:d); }
    setSaving(false);
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }}>
      <div style={{ background:'#1e2128', border:'1px solid #2e3340', borderTop:`3px solid ${TT_OR}`, borderRadius:6, padding:'2rem', width:420 }}>
        <div style={{ fontSize:'0.65rem', color:TT_OR, textTransform:'uppercase', letterSpacing:'0.15em', fontWeight:700, marginBottom:'1.25rem' }}>New Loan</div>
        {[['property_name','Property Name *','e.g. Buford, GA'],['lender','Lender','e.g. BOKF']].map(([k,l,ph])=>(
          <div key={k} style={{ marginBottom:'0.75rem' }}>
            <label style={{ fontSize:'0.58rem', color:'#4a4f5a', textTransform:'uppercase', letterSpacing:'0.1em', display:'block', marginBottom:3 }}>{l}</label>
            <input value={form[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={ph} style={iSt} autoFocus={k==='property_name'}/>
          </div>
        ))}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem', marginBottom:'1.25rem' }}>
          {[['loan_type','Loan Type',['construction','permanent','bridge','land','mezz','other']],['status','Status',Object.keys(STATUS)]].map(([k,l,opts])=>(
            <div key={k}><label style={{ fontSize:'0.58rem', color:'#4a4f5a', textTransform:'uppercase', letterSpacing:'0.1em', display:'block', marginBottom:3 }}>{l}</label>
            <select value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={iSt}>{opts.map(o=><option key={o} value={o}>{STATUS[o]?.label||o.charAt(0).toUpperCase()+o.slice(1)}</option>)}</select></div>
          ))}
        </div>
        <div style={{ fontSize:'0.67rem', color:'#4a4f5a', marginBottom:'1.25rem' }}>Upload documents and run extraction after creating the loan record.</div>
        <div style={{ display:'flex', gap:'0.5rem', justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'6px 16px', background:'none', border:'1px solid #2e3340', borderRadius:3, color:'#9aa0aa', cursor:'pointer', fontFamily:'inherit', fontSize:'0.78rem' }}>Cancel</button>
          <button onClick={save} disabled={saving||!form.property_name} style={{ padding:'6px 18px', background:form.property_name?TT_OR:'#2a2d35', border:'none', borderRadius:3, color:form.property_name?'#fff':'#4a4f5a', cursor:form.property_name?'pointer':'default', fontFamily:'inherit', fontSize:'0.78rem', fontWeight:600 }}>
            {saving?'Creating…':'Create Loan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [loans, setLoans]             = React.useState([]);
  const [selected, setSelected]       = React.useState(null);
  const [loading, setLoading]         = React.useState(true);
  const [showNew, setShowNew]         = React.useState(false);
  const [pinUnlocked, setPinUnlocked] = React.useState(false);
  const [showPin, setShowPin]         = React.useState(false);
  const [pinAction, setPinAction]     = React.useState(null);

  React.useEffect(() => {
    const s = document.createElement('style');
    s.textContent = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{background:${TT_NAVY};color:#e8eaed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5}input,select,textarea{font-family:inherit}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#13151a}::-webkit-scrollbar-thumb{background:#2e3340;border-radius:3px}a{color:${TT_OR};text-decoration:none}`;
    document.head.appendChild(s);
    loadLoans();
  }, []);

  async function loadLoans() {
    setLoading(true);
    try {
      const r = await fetch(`${SB_URL}/rest/v1/loans?order=initial_maturity_date.asc`, { headers: SB_HDR });
      if (r.ok) setLoans(await r.json());
    } catch(e) {}
    setLoading(false);
  }

  function requirePin(action) {
    if (pinUnlocked) { action(); return; }
    setPinAction(() => action); setShowPin(true);
  }

  function handlePinSuccess() {
    setPinUnlocked(true); setShowPin(false);
    if (pinAction) { pinAction(); setPinAction(null); }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column' }}>
      {showPin && <PinModal onSuccess={handlePinSuccess} onClose={()=>{ setShowPin(false); setPinAction(null); }}/>}
      {showNew && <NewLoanModal onSave={loan=>{ setLoans(ls=>[...ls,loan]); setShowNew(false); setSelected(loan); }} onClose={()=>setShowNew(false)}/>}

      {/* Header */}
      <div style={{ background:'#13151a', borderBottom:`3px solid ${TT_OR}`, padding:'1.25rem 2rem', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
        <div>
          <div style={{ fontSize:'0.65rem', letterSpacing:'0.18em', color:TT_OR, textTransform:'uppercase', fontWeight:600 }}>Thompson Thrift</div>
          <div style={{ fontSize:'1rem', fontWeight:700, color:'#e8eaed', marginTop:1 }}>Loan Abstract Manager</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'1rem' }}>
          {pinUnlocked&&<span style={{ fontSize:'0.65rem', color:TT_OR, background:'rgba(200,121,65,0.1)', padding:'3px 10px', borderRadius:10 }}>✓ Edit Mode</span>}
          <button onClick={()=>pinUnlocked?setPinUnlocked(false):setShowPin(true)} style={{ background:'none', border:'1px solid #2e3340', borderRadius:3, color:'#4a4f5a', padding:'4px 12px', cursor:'pointer', fontFamily:'inherit', fontSize:'0.72rem' }}>
            {pinUnlocked?'🔓 Lock':'🔒 Unlock'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, padding:'2rem', maxWidth:1400, width:'100%', margin:'0 auto' }}>
        {loading ? (
          <div style={{ textAlign:'center', color:'#4a4f5a', padding:'4rem' }}>Loading portfolio…</div>
        ) : selected ? (
          <LoanDetail
            loan={selected} onBack={()=>setSelected(null)}
            onSave={u=>{ setLoans(ls=>ls.map(l=>l.id===u.id?u:l)); setSelected(u); }}
            onDelete={()=>{ setLoans(ls=>ls.filter(l=>l.id!==selected.id)); setSelected(null); }}
            pinUnlocked={pinUnlocked} requirePin={requirePin}
          />
        ) : (
          <Portfolio loans={loans} onSelect={setSelected} onNew={()=>setShowNew(true)} pinUnlocked={pinUnlocked} requirePin={requirePin}/>
        )}
      </div>
    </div>
  );
}
