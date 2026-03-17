// ── TT Loan Abstract Manager ──────────────────────────────────────────────────
// Single-file React app — deploy to new Vercel project
// Supabase tables: loans, loan_documents | Storage bucket: loan-documents
// Replace the three constants below before deploying

const SB_URL     = 'https://vjygnftcljqbcemoowuv.supabase.co';
const SB_KEY     = 'sb_publishable_KWLuDguFDagF4JKa_a13YQ_rk498okJ';
const SB_HEADERS = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
const EDIT_PIN   = '1234';

const TT_NAVY   = '#16191f';
const TT_ORANGE = '#c87941';

const STATUS_CONFIG = {
  construction: { label: 'Construction', color: '#4a9acf',  bg: 'rgba(74,154,207,0.12)'  },
  stabilized:   { label: 'Stabilized',   color: '#6a9e7f',  bg: 'rgba(106,158,127,0.12)' },
  extended:     { label: 'Extended',     color: '#c87941',  bg: 'rgba(200,121,65,0.12)'  },
  paid_off:     { label: 'Paid Off',     color: '#4a4f5a',  bg: 'rgba(74,79,90,0.12)'    },
  other:        { label: 'Other',        color: '#9aa0aa',  bg: 'rgba(154,160,170,0.12)' },
};

const EXTRACTION_PROMPT = `You are a commercial real estate paralegal with deep expertise in construction loan documents. You will be given one or more loan documents (loan agreement, promissory note, guaranty, fee letter, etc.) for a single loan. Extract all information into the exact JSON schema below.

CRITICAL RULES:
- Only extract information that is explicitly stated in the documents
- For any field you cannot find or are uncertain about, use null — NEVER guess or fabricate
- Dates must be in YYYY-MM-DD format
- Dollar amounts as numbers only (no $ or commas)
- Percentages as numbers only (e.g. 2.50 not "2.50%")
- Arrays for items with multiples

Return ONLY valid JSON with this exact structure — no text outside the JSON:

{
  "property_name": "short human-readable name e.g. 'Buford, GA'",
  "borrower_entity": "full legal entity name",
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
  "interest_rate_index": "SOFR | Prime | other",
  "interest_rate_spread": null,
  "interest_rate_floor": null,
  "interest_rate_description": "human readable e.g. 'Term SOFR + 3.35%, floor 8.00%'",
  "default_rate_description": "e.g. 'Contract Rate + 5.00%'",
  "amortization": "IO | PI | IO_then_PI",
  "amortization_description": "full description",
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

// ── Utilities ──────────────────────────────────────────────────────────────────
const fmt$    = v => v == null ? '—' : '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtM    = v => v == null ? '—' : '$' + (v / 1e6).toFixed(2) + 'M';
const fmtPct  = v => v == null ? '—' : v + '%';
const fmtDate = s => { if (!s) return '—'; try { return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return s; } };
const daysUntil = s => { if (!s) return null; return Math.ceil((new Date(s + 'T12:00:00') - new Date()) / 86400000); };

// ── PIN Modal ──────────────────────────────────────────────────────────────────
function PinModal({ onSuccess, onClose }) {
  const [digits, setDigits] = React.useState([]);
  const addDigit = d => {
    const next = [...digits, d];
    setDigits(next);
    if (next.length === 4) {
      if (next.join('') === EDIT_PIN) { setTimeout(() => { onSuccess(); setDigits([]); }, 200); }
      else { setTimeout(() => setDigits([]), 400); }
    }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: '#1e2128', border: '1px solid #2e3340', borderTop: `3px solid ${TT_ORANGE}`, borderRadius: 6, padding: '2rem', width: 280, textAlign: 'center' }}>
        <div style={{ fontSize: '0.65rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: TT_ORANGE, marginBottom: '1.25rem', fontWeight: 600 }}>Enter PIN to Edit</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: '1.5rem' }}>
          {[0,1,2,3].map(i => <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < digits.length ? TT_ORANGE : 'transparent', border: `2px solid ${i < digits.length ? TT_ORANGE : '#4a4f5a'}`, transition: 'all 0.15s' }} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
          {[1,2,3,4,5,6,7,8,9].map(n => (
            <button key={n} onClick={() => addDigit(String(n))} style={{ padding: '12px', background: '#13151a', border: '1px solid #2e3340', borderRadius: 4, color: '#e8eaed', fontSize: '1rem', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>{n}</button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div />
          <button onClick={() => addDigit('0')} style={{ padding: '12px', background: '#13151a', border: '1px solid #2e3340', borderRadius: 4, color: '#e8eaed', fontSize: '1rem', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>0</button>
          <button onClick={onClose} style={{ padding: '12px', background: 'none', border: '1px solid #2e3340', borderRadius: 4, color: '#4a4f5a', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
        </div>
      </div>
    </div>
  );
}

// ── Shared small components ────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.other;
  return <span style={{ fontSize: '0.62rem', fontWeight: 700, color: cfg.color, background: cfg.bg, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap', letterSpacing: '0.04em' }}>{cfg.label}</span>;
}

function MaturityCell({ date }) {
  if (!date) return <span style={{ color: '#4a4f5a' }}>—</span>;
  const days = daysUntil(date);
  const color = days < 90 ? '#c47474' : days < 180 ? '#c87941' : '#9aa0aa';
  return (
    <div>
      <div style={{ color, fontVariantNumeric: 'tabular-nums', fontSize: '0.8rem', fontWeight: 600 }}>{fmtDate(date)}</div>
      {days != null && <div style={{ fontSize: '0.62rem', color: days < 90 ? '#c47474' : '#4a4f5a' }}>{days < 0 ? `${Math.abs(days)}d past` : `${days}d`}</div>}
    </div>
  );
}

function SectionHead({ children }) {
  return <div style={{ fontSize: '0.58rem', color: TT_ORANGE, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700, marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid #1e2330' }}>{children}</div>;
}

function Field({ label, value, flagged }) {
  const empty = value == null || value === '' || value === '—';
  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <div style={{ fontSize: '0.58rem', color: '#4a4f5a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}
        {flagged && <span style={{ fontSize: '0.55rem', color: '#c87941', background: 'rgba(200,121,65,0.12)', padding: '1px 4px', borderRadius: 2 }}>⚠</span>}
      </div>
      <div style={{ fontSize: '0.8rem', color: empty ? '#2e3340' : '#c8cdd6', lineHeight: 1.4 }}>{empty ? '—' : value}</div>
    </div>
  );
}

// ── PortfolioView ──────────────────────────────────────────────────────────────
function PortfolioView({ loans, onSelect, onNew, pinUnlocked, requirePin }) {
  const [search, setSearch]   = React.useState('');
  const [fStatus, setFStatus] = React.useState('all');
  const [fType, setFType]     = React.useState('all');
  const [sortKey, setSortKey] = React.useState('initial_maturity_date');
  const [sortDir, setSortDir] = React.useState(1);

  const totalAmt     = loans.reduce((s, l) => s + (l.loan_amount || 0), 0);
  const active       = loans.filter(l => l.status !== 'paid_off');
  const maturingSoon = active.filter(l => { const d = daysUntil(l.initial_maturity_date); return d != null && d >= 0 && d < 180; });

  const filtered = loans
    .filter(l => fStatus === 'all' || l.status === fStatus)
    .filter(l => fType === 'all'   || l.loan_type === fType)
    .filter(l => {
      if (!search) return true;
      const q = search.toLowerCase();
      return [l.property_name, l.lender, l.borrower_entity].some(v => (v || '').toLowerCase().includes(q));
    })
    .sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null) return 1; if (bv == null) return -1;
      return av < bv ? -sortDir : av > bv ? sortDir : 0;
    });

  const TH = ({ k, label, right }) => (
    <th onClick={() => { sortKey === k ? setSortDir(d => -d) : (setSortKey(k), setSortDir(1)); }}
      style={{ padding: '0.55rem 0.85rem', textAlign: right ? 'right' : 'left', fontSize: '0.58rem', color: sortKey === k ? TT_ORANGE : '#4a4f5a', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 400, cursor: 'pointer', userSelect: 'none', background: '#0f1117', whiteSpace: 'nowrap' }}>
      {label}{sortKey === k ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Loans',       value: loans.length,        sub: `${active.length} active` },
          { label: 'Total Commitment',  value: fmtM(totalAmt),      sub: 'across all loans' },
          { label: 'Maturing < 180d',   value: maturingSoon.length, sub: maturingSoon.map(l => l.property_name).join(', ') || 'none', warn: maturingSoon.length > 0 },
          { label: 'Avg Loan Size',     value: loans.length ? fmtM(totalAmt / loans.length) : '—', sub: 'portfolio average' },
        ].map(({ label, value, sub, warn }) => (
          <div key={label} style={{ background: '#13151a', border: `1px solid ${warn ? '#c47474' : '#1e2330'}`, borderRadius: 4, padding: '0.85rem 1.1rem' }}>
            <div style={{ fontSize: '0.55rem', color: '#4a4f5a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: warn ? '#c47474' : '#e8eaed', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
            <div style={{ fontSize: '0.62rem', color: '#4a4f5a', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search property, lender, entity…"
          style={{ flex: 1, minWidth: 200, background: '#13151a', border: '1px solid #2e3340', borderRadius: 3, color: '#e8eaed', padding: '6px 10px', fontFamily: 'inherit', fontSize: '0.8rem' }} />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ background: '#13151a', border: '1px solid #2e3340', borderRadius: 3, color: '#9aa0aa', padding: '6px 10px', fontFamily: 'inherit', fontSize: '0.78rem' }}>
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={fType} onChange={e => setFType(e.target.value)} style={{ background: '#13151a', border: '1px solid #2e3340', borderRadius: 3, color: '#9aa0aa', padding: '6px 10px', fontFamily: 'inherit', fontSize: '0.78rem' }}>
          <option value="all">All Types</option>
          {['construction','permanent','bridge','land','mezz','other'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
        </select>
        <button onClick={() => requirePin(onNew)} style={{ padding: '6px 16px', background: pinUnlocked ? TT_ORANGE : '#2a2d35', border: 'none', borderRadius: 3, color: pinUnlocked ? '#fff' : '#4a4f5a', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {pinUnlocked ? '+ New Loan' : '🔒 New Loan'}
        </button>
      </div>

      {/* Table */}
      <div style={{ background: '#13151a', border: '1px solid #1e2330', borderRadius: 4, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#4a4f5a', fontSize: '0.82rem' }}>
            {loans.length === 0 ? 'No loans yet — click New Loan to get started.' : 'No loans match your filters.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <TH k="property_name" label="Property" />
                <TH k="lender" label="Lender" />
                <TH k="loan_amount" label="Amount" right />
                <TH k="loan_type" label="Type" />
                <TH k="status" label="Status" />
                <TH k="initial_maturity_date" label="Maturity" />
                <TH k="interest_rate_description" label="Rate" />
                <TH k="repayment_guaranty_pct" label="Recourse" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((l, i) => {
                const bg = i % 2 === 0 ? '#13151a' : '#111418';
                return (
                  <tr key={l.id} onClick={() => onSelect(l)} style={{ background: bg, cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#1a1d24'}
                    onMouseLeave={e => e.currentTarget.style.background = bg}>
                    <td style={{ padding: '0.75rem 0.85rem', borderBottom: '1px solid #1a1d24' }}>
                      <div style={{ fontWeight: 600, color: '#c8cdd6', fontSize: '0.82rem' }}>{l.property_name || '—'}</div>
                      <div style={{ fontSize: '0.65rem', color: '#4a4f5a', marginTop: 1 }}>{(l.borrower_entity || '').slice(0,45)}{(l.borrower_entity||'').length > 45 ? '…' : ''}</div>
                    </td>
                    <td style={{ padding: '0.75rem 0.85rem', borderBottom: '1px solid #1a1d24', fontSize: '0.8rem', color: '#9aa0aa' }}>
                      {l.lender || '—'}
                      {l.participants?.length > 0 && <div style={{ fontSize: '0.62rem', color: '#4a4f5a' }}>+{l.participants.length} participant{l.participants.length > 1 ? 's' : ''}</div>}
                    </td>
                    <td style={{ padding: '0.75rem 0.85rem', borderBottom: '1px solid #1a1d24', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: '0.82rem', color: '#e8eaed', fontWeight: 600 }}>{fmtM(l.loan_amount)}</td>
                    <td style={{ padding: '0.75rem 0.85rem', borderBottom: '1px solid #1a1d24' }}>
                      <span style={{ fontSize: '0.67rem', color: '#9aa0aa', background: '#1e2330', padding: '2px 7px', borderRadius: 3 }}>{l.loan_type || '—'}</span>
                    </td>
                    <td style={{ padding: '0.75rem 0.85rem', borderBottom: '1px solid #1a1d24' }}><StatusBadge status={l.status} /></td>
                    <td style={{ padding: '0.75rem 0.85rem', borderBottom: '1px solid #1a1d24' }}><MaturityCell date={l.initial_maturity_date} /></td>
                    <td style={{ padding: '0.75rem 0.85rem', borderBottom: '1px solid #1a1d24', fontSize: '0.78rem', color: '#9aa0aa' }}>{l.interest_rate_description || '—'}</td>
                    <td style={{ padding: '0.75rem 0.85rem', borderBottom: '1px solid #1a1d24', fontSize: '0.78rem', color: '#9aa0aa' }}>
                      {l.repayment_guaranty_pct != null ? `${l.repayment_guaranty_pct}%` : '—'}
                      {l.guaranty_burndown?.length > 0 && <div style={{ fontSize: '0.62rem', color: '#4a4f5a' }}>burns down</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div style={{ marginTop: '0.5rem', fontSize: '0.62rem', color: '#4a4f5a' }}>{filtered.length} of {loans.length} loans shown</div>
    </div>
  );
}

// ── LoanDetail ─────────────────────────────────────────────────────────────────
function LoanDetail({ loan, onBack, onSave, onDelete, pinUnlocked, requirePin }) {
  const [editing, setEditing]       = React.useState(false);
  const [form, setForm]             = React.useState(loan);
  const [saving, setSaving]         = React.useState(false);
  const [section, setSection]       = React.useState('structure');
  const [docs, setDocs]             = React.useState([]);
  const [uploading, setUploading]   = React.useState(false);
  const [uploadMsg, setUploadMsg]   = React.useState('');
  const [extracting, setExtracting] = React.useState(false);
  const [extractLog, setExtractLog] = React.useState('');
  const [confirmDel, setConfirmDel] = React.useState(false);

  const flags = loan.confidence_flags || [];
  const isFlagged = f => flags.some(x => x.toLowerCase().includes(f.toLowerCase()));

  React.useEffect(() => { loadDocs(); }, [loan.id]);

  async function loadDocs() {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/loan_documents?loan_id=eq.${loan.id}&order=uploaded_at.desc`, { headers: SB_HEADERS });
      if (res.ok) setDocs(await res.json());
    } catch(e) {}
  }

  async function handleFileUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    setUploadMsg(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}…`);
    try {
      for (const file of files) {
        const path = `${loan.id}/${Date.now()}_${file.name}`;
        const upRes = await fetch(`${SB_URL}/storage/v1/object/loan-documents/${path}`, {
          method: 'POST',
          headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
        if (!upRes.ok) { setUploadMsg('Upload failed: ' + (await upRes.text())); setUploading(false); return; }
        await fetch(`${SB_URL}/rest/v1/loan_documents`, {
          method: 'POST', headers: SB_HEADERS,
          body: JSON.stringify({ loan_id: loan.id, file_name: file.name, storage_path: path, file_type: file.type, file_size: file.size }),
        });
      }
      await loadDocs();
      setUploadMsg(`✓ ${files.length} file${files.length > 1 ? 's' : ''} uploaded`);
      setTimeout(() => setUploadMsg(''), 3000);
    } catch(err) { setUploadMsg('Error: ' + err.message); }
    setUploading(false);
    e.target.value = '';
  }

  async function runExtraction() {
    if (!docs.length) { setExtractLog('No documents uploaded.'); return; }
    setExtracting(true);
    setExtractLog('Reading documents from storage…');
    try {
      const content = [];
      for (const doc of docs.slice(0, 5)) {
        setExtractLog(`Reading ${doc.file_name}…`);
        const dlRes = await fetch(`${SB_URL}/storage/v1/object/loan-documents/${doc.storage_path}`, {
          headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
        });
        if (!dlRes.ok) continue;
        const blob = await dlRes.blob();
        const base64 = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(blob); });
        const isPdf  = doc.file_name.toLowerCase().endsWith('.pdf');
        const media  = isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        content.push({ type: 'document', source: { type: 'base64', media_type: media, data: base64 } });
      }
      if (!content.length) { setExtractLog('Could not read documents.'); setExtracting(false); return; }
      content.push({ type: 'text', text: EXTRACTION_PROMPT });

      setExtractLog(`Sending ${content.length - 1} document${content.length > 2 ? 's' : ''} to Claude…`);
      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'anthropic-beta': 'pdfs-2024-09-25' },
        body: JSON.stringify({ model: 'claude-opus-4-5', max_tokens: 4096, messages: [{ role: 'user', content }] }),
      });
      if (!apiRes.ok) { const e = await apiRes.json(); setExtractLog('API error: ' + (e.error?.message || JSON.stringify(e))); setExtracting(false); return; }

      setExtractLog('Parsing results…');
      const apiData = await apiRes.json();
      const rawText = apiData.content?.find(c => c.type === 'text')?.text || '';
      let extracted;
      try {
        const m = rawText.match(/\{[\s\S]*\}/);
        if (!m) throw new Error('No JSON in response');
        extracted = JSON.parse(m[0]);
      } catch(err) { setExtractLog('Parse error — raw: ' + rawText.slice(0, 300)); setExtracting(false); return; }

      const merged = { ...loan };
      for (const [k, v] of Object.entries(extracted)) {
        if (v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)) merged[k] = v;
      }

      setExtractLog('Saving to database…');
      const saveRes = await fetch(`${SB_URL}/rest/v1/loans?id=eq.${loan.id}`, {
        method: 'PATCH', headers: { ...SB_HEADERS, 'Prefer': 'return=representation' },
        body: JSON.stringify(merged),
      });
      if (saveRes.ok) {
        const saved = await saveRes.json();
        const updated = Array.isArray(saved) ? saved[0] : saved;
        onSave(updated);
        setExtractLog(`✓ Done — ${(extracted.confidence_flags || []).length} field(s) flagged for review`);
        setTimeout(() => setExtractLog(''), 5000);
      } else { setExtractLog('Save error: ' + await saveRes.text()); }
    } catch(err) { setExtractLog('Error: ' + err.message); }
    setExtracting(false);
  }

  async function saveForm() {
    setSaving(true);
    const res = await fetch(`${SB_URL}/rest/v1/loans?id=eq.${loan.id}`, {
      method: 'PATCH', headers: { ...SB_HEADERS, 'Prefer': 'return=representation' },
      body: JSON.stringify(form),
    });
    if (res.ok) { const d = await res.json(); onSave(Array.isArray(d) ? d[0] : d); setEditing(false); }
    setSaving(false);
  }

  async function handleDelete() {
    await fetch(`${SB_URL}/rest/v1/loan_documents?loan_id=eq.${loan.id}`, { method: 'DELETE', headers: SB_HEADERS });
    await fetch(`${SB_URL}/rest/v1/loans?id=eq.${loan.id}`, { method: 'DELETE', headers: SB_HEADERS });
    onDelete();
  }

  async function deleteDoc(id, path) {
    await fetch(`${SB_URL}/storage/v1/object/loan-documents/${path}`, { method: 'DELETE', headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } });
    await fetch(`${SB_URL}/rest/v1/loan_documents?id=eq.${id}`, { method: 'DELETE', headers: SB_HEADERS });
    await loadDocs();
  }

  const inputSt = { background: '#1a1d24', border: '1px solid #2e3340', borderRadius: 3, color: '#e8eaed', padding: '5px 8px', fontFamily: 'inherit', fontSize: '0.78rem', width: '100%', boxSizing: 'border-box' };
  const SECTIONS = ['structure','pricing','recourse','covenants','reporting','documents'];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ background: 'none', border: '1px solid #2e3340', borderRadius: 3, color: '#9aa0aa', padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem' }}>← Portfolio</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e8eaed' }}>{loan.property_name || 'Untitled Loan'}</div>
          <div style={{ fontSize: '0.7rem', color: '#4a4f5a', marginTop: 1 }}>{loan.borrower_entity}</div>
        </div>
        <StatusBadge status={loan.status} />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {!editing ? (
            <>
              <button onClick={() => requirePin(() => setEditing(true))} style={{ padding: '5px 14px', background: pinUnlocked ? 'rgba(200,121,65,0.12)' : '#1a1d24', border: `1px solid ${pinUnlocked ? TT_ORANGE+'44' : '#2e3340'}`, borderRadius: 3, color: pinUnlocked ? TT_ORANGE : '#4a4f5a', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem' }}>
                {pinUnlocked ? '✏ Edit' : '🔒 Edit'}
              </button>
              <button onClick={() => requirePin(() => setConfirmDel(true))} style={{ padding: '5px 12px', background: 'none', border: '1px solid #2e3340', borderRadius: 3, color: '#4a4f5a', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem' }}>✕</button>
            </>
          ) : (
            <>
              <button onClick={saveForm} disabled={saving} style={{ padding: '5px 16px', background: TT_ORANGE, border: 'none', borderRadius: 3, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600 }}>{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => { setForm(loan); setEditing(false); }} style={{ padding: '5px 12px', background: 'none', border: '1px solid #2e3340', borderRadius: 3, color: '#9aa0aa', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem' }}>Cancel</button>
            </>
          )}
        </div>
      </div>

      {confirmDel && (
        <div style={{ background: '#1a0f0f', border: '1px solid #c47474', borderRadius: 4, padding: '0.85rem 1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', color: '#c47474', flex: 1 }}>Delete <strong>{loan.property_name}</strong>? All documents and extracted data will be permanently removed.</span>
          <button onClick={handleDelete} style={{ padding: '4px 14px', background: '#c47474', border: 'none', borderRadius: 3, color: '#fff', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>Delete</button>
          <button onClick={() => setConfirmDel(false)} style={{ padding: '4px 12px', background: 'none', border: '1px solid #2e3340', borderRadius: 3, color: '#9aa0aa', fontFamily: 'inherit', fontSize: '0.72rem', cursor: 'pointer' }}>Cancel</button>
        </div>
      )}

      {flags.length > 0 && (
        <div style={{ background: 'rgba(200,121,65,0.07)', border: '1px solid rgba(200,121,65,0.25)', borderRadius: 4, padding: '0.65rem 1rem', marginBottom: '0.75rem', fontSize: '0.72rem', color: '#c87941' }}>
          <strong>⚠ {flags.length} field{flags.length !== 1 ? 's' : ''} flagged for review:</strong> {flags.join(' · ')}
        </div>
      )}
      {loan.extraction_notes && (
        <div style={{ background: 'rgba(74,122,158,0.07)', border: '1px solid rgba(74,122,158,0.25)', borderRadius: 4, padding: '0.65rem 1rem', marginBottom: '0.75rem', fontSize: '0.72rem', color: '#4a7a9e' }}>
          <strong>Note:</strong> {loan.extraction_notes}
        </div>
      )}

      {/* Section tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #2e3340', marginBottom: '1.5rem' }}>
        {SECTIONS.map(s => (
          <button key={s} onClick={() => setSection(s)} style={{ padding: '0.45rem 1.1rem', border: 'none', borderBottom: `2px solid ${section === s ? TT_ORANGE : 'transparent'}`, background: 'none', color: section === s ? TT_ORANGE : '#4a4f5a', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', textTransform: 'capitalize', fontWeight: section === s ? 600 : 400 }}>
            {s === 'documents' ? `Documents (${docs.length})` : s}
          </button>
        ))}
      </div>

      {/* ── Structure ── */}
      {section === 'structure' && !editing && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
          <div>
            <SectionHead>Loan Identity</SectionHead>
            <Field label="Property" value={loan.property_name} />
            <Field label="Borrower Entity" value={loan.borrower_entity} />
            <Field label="Loan Type" value={loan.loan_type} />
            <Field label="Loan Amount" value={fmt$(loan.loan_amount)} />
            <Field label="Closing Date" value={fmtDate(loan.closing_date)} />
          </div>
          <div>
            <SectionHead>Lender</SectionHead>
            <Field label="Lender" value={loan.lender} />
            {loan.participants?.length > 0 && (
              <div style={{ marginBottom: '0.65rem' }}>
                <div style={{ fontSize: '0.58rem', color: '#4a4f5a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Participants</div>
                {loan.participants.map((p, i) => <div key={i} style={{ fontSize: '0.78rem', color: '#c8cdd6', marginBottom: 3 }}>{p.name} — {fmt$(p.commitment)} ({p.pct}%)</div>)}
              </div>
            )}
          </div>
          <div>
            <SectionHead>Term & Extensions</SectionHead>
            <Field label="Initial Term" value={loan.initial_term_months ? `${loan.initial_term_months} months` : null} />
            <Field label="Initial Maturity" value={<MaturityCell date={loan.initial_maturity_date} />} />
            {(loan.extension_options || []).map((ext, i) => (
              <div key={i} style={{ background: '#0f1117', border: '1px solid #1e2330', borderRadius: 3, padding: '0.6rem 0.75rem', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.62rem', color: TT_ORANGE, fontWeight: 600, marginBottom: 3 }}>Extension {ext.number}</div>
                <div style={{ fontSize: '0.75rem', color: '#9aa0aa' }}>{ext.length_months} months — fee {fmtPct(ext.fee_pct)}</div>
                <div style={{ marginTop: 3 }}><MaturityCell date={ext.extended_maturity_date} /></div>
                {ext.conditions?.length > 0 && <ul style={{ marginTop: 4, paddingLeft: 14, fontSize: '0.7rem', color: '#4a4f5a' }}>{ext.conditions.map((c, j) => <li key={j} style={{ marginBottom: 2 }}>{c}</li>)}</ul>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pricing ── */}
      {section === 'pricing' && !editing && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
          <div>
            <SectionHead>Interest Rate</SectionHead>
            <Field label="Rate" value={loan.interest_rate_description} flagged={isFlagged('interest_rate')} />
            {loan.interest_rate_type === 'floating' && <>
              <Field label="Index" value={loan.interest_rate_index} />
              <Field label="Spread" value={loan.interest_rate_spread != null ? `+${loan.interest_rate_spread}%` : null} />
              <Field label="Floor" value={fmtPct(loan.interest_rate_floor)} />
            </>}
            {loan.interest_rate_type === 'fixed' && <Field label="Fixed Rate" value={fmtPct(loan.interest_rate_fixed)} />}
            <Field label="Default Rate" value={loan.default_rate_description} />
            <Field label="Hedge" value={loan.hedge_requirement} />
          </div>
          <div>
            <SectionHead>Fees & Amortization</SectionHead>
            <Field label="Origination Fee" value={loan.origination_fee_amount ? `${fmtPct(loan.origination_fee_pct)} = ${fmt$(loan.origination_fee_amount)}` : fmtPct(loan.origination_fee_pct)} />
            <Field label="Exit Fee" value={loan.exit_fee_description} />
            <Field label="Prepayment" value={loan.prepayment_description} />
            <Field label="Amortization" value={loan.amortization_description} />
          </div>
          <div>
            <SectionHead>Other</SectionHead>
            <Field label="Change Order (Individual)" value={fmt$(loan.change_order_individual)} flagged={isFlagged('change_order')} />
            <Field label="Change Order (Aggregate)" value={fmt$(loan.change_order_aggregate)} />
            <Field label="Equity Deposit" value={fmt$(loan.equity_deposit)} />
            <Field label="Dev Fee Schedule" value={loan.development_fee_schedule} />
            <Field label="Lender Reserves" value={loan.lender_reserves_per_unit != null ? `$${loan.lender_reserves_per_unit}/unit` : null} />
            <Field label="Completion Deadline" value={loan.completion_deadline} />
          </div>
        </div>
      )}

      {/* ── Recourse ── */}
      {section === 'recourse' && !editing && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
          <div>
            <SectionHead>Guaranty Structure</SectionHead>
            <Field label="Completion Guaranty" value={fmtPct(loan.completion_guaranty_pct)} flagged={isFlagged('completion_guaranty')} />
            <Field label="Repayment Guaranty" value={fmtPct(loan.repayment_guaranty_pct)} flagged={isFlagged('repayment_guaranty')} />
            <Field label="Notes" value={loan.guaranty_notes} />
            {(loan.guaranty_burndown || []).length > 0 && (
              <div style={{ marginTop: '0.5rem' }}>
                <div style={{ fontSize: '0.58rem', color: '#4a4f5a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Burn-Down Schedule</div>
                {loan.guaranty_burndown.map((s, i) => (
                  <div key={i} style={{ background: '#0f1117', border: '1px solid #1e2330', borderRadius: 3, padding: '0.6rem 0.75rem', marginBottom: '0.4rem' }}>
                    <div style={{ fontSize: '0.72rem', color: '#6a9e7f', fontWeight: 600 }}>Reduces to {s.pct_after}%</div>
                    <div style={{ fontSize: '0.7rem', color: '#9aa0aa', marginTop: 2 }}>{s.trigger}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <SectionHead>SPE & Transfer</SectionHead>
            <Field label="SPE Requirements" value={loan.spe_requirements} />
            <Field label="Transfer Restrictions" value={loan.transfer_restrictions} />
            <Field label="Subordinate Debt" value={loan.subordinate_debt_permitted != null ? (loan.subordinate_debt_permitted ? 'Permitted' : 'Not Permitted') : null} />
          </div>
          <div>
            <SectionHead>Other Obligations</SectionHead>
            <Field label="Environmental Indemnity" value={loan.environmental_indemnity} />
            <Field label="Insurance" value={loan.insurance_requirements} />
            <Field label="Draw Requirements" value={loan.draw_requirements} />
            <Field label="Other Notable Terms" value={loan.other_notable_terms} />
          </div>
        </div>
      )}

      {/* ── Covenants ── */}
      {section === 'covenants' && !editing && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
          <div>
            <SectionHead>Financial Covenants</SectionHead>
            <Field label="Liquidity Minimum" value={fmt$(loan.liquidity_covenant)} flagged={isFlagged('liquidity')} />
            <Field label="Net Worth Minimum" value={fmt$(loan.net_worth_covenant)} flagged={isFlagged('net_worth')} />
            <Field label="DSCR Covenant" value={loan.dscr_covenant != null ? `${loan.dscr_covenant}x` : null} flagged={isFlagged('dscr')} />
            <Field label="DSCR Formula" value={loan.dscr_formula} />
            <Field label="DSCR Test Date" value={loan.dscr_test_date} />
            <Field label="LTV Covenant" value={loan.ltv_covenant != null ? `${loan.ltv_covenant}%` : null} />
          </div>
          <div>
            <SectionHead>Operating Covenants</SectionHead>
            <Field label="Distribution Restriction" value={loan.distribution_restriction} flagged={isFlagged('distribution')} />
          </div>
          <div />
        </div>
      )}

      {/* ── Reporting ── */}
      {section === 'reporting' && !editing && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
          <div>
            <SectionHead>Borrower Reporting</SectionHead>
            {(loan.reporting_borrower || []).length > 0
              ? loan.reporting_borrower.map((r, i) => <div key={i} style={{ fontSize: '0.78rem', color: '#c8cdd6', paddingLeft: 10, borderLeft: '2px solid #1e2330', marginBottom: 8, lineHeight: 1.4 }}>{r}</div>)
              : <div style={{ fontSize: '0.75rem', color: '#2e3340' }}>Not extracted</div>}
          </div>
          <div>
            <SectionHead>Guarantor Reporting</SectionHead>
            {(loan.reporting_guarantor || []).length > 0
              ? loan.reporting_guarantor.map((r, i) => <div key={i} style={{ fontSize: '0.78rem', color: '#c8cdd6', paddingLeft: 10, borderLeft: '2px solid #1e2330', marginBottom: 8, lineHeight: 1.4 }}>{r}</div>)
              : <div style={{ fontSize: '0.75rem', color: '#2e3340' }}>Not extracted</div>}
          </div>
          <div>
            <SectionHead>Contacts</SectionHead>
            <Field label="Lender Contact" value={loan.lender_contact} />
            <Field label="Draw Contact" value={loan.draw_contact} />
          </div>
        </div>
      )}

      {/* ── Documents ── */}
      {section === 'documents' && !editing && (
        <div>
          <div style={{ background: '#0f1117', border: '2px dashed #2e3340', borderRadius: 4, padding: '1.5rem', textAlign: 'center', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#4a4f5a', marginBottom: '0.75rem' }}>Upload loan documents (PDF or DOCX) — up to 5 per loan. Upload all documents before extracting.</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <label style={{ padding: '6px 18px', background: '#1e2330', border: '1px solid #2e3340', borderRadius: 3, color: '#9aa0aa', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' }}>
                {uploading ? 'Uploading…' : '↑ Upload Documents'}
                <input type="file" accept=".pdf,.docx,.doc" multiple onChange={handleFileUpload} disabled={uploading || docs.length >= 5} style={{ display: 'none' }} />
              </label>
              {docs.length > 0 && (
                <button onClick={runExtraction} disabled={extracting}
                  style={{ padding: '6px 18px', background: extracting ? '#2a2d35' : TT_ORANGE, border: 'none', borderRadius: 3, color: extracting ? '#4a4f5a' : '#fff', cursor: extracting ? 'default' : 'pointer', fontSize: '0.78rem', fontFamily: 'inherit', fontWeight: 600 }}>
                  {extracting ? 'Extracting…' : '⚡ Extract Abstract'}
                </button>
              )}
            </div>
            {uploadMsg  && <div style={{ marginTop: '0.75rem', fontSize: '0.72rem', color: uploadMsg.startsWith('✓') ? '#6a9e7f' : '#c47474' }}>{uploadMsg}</div>}
            {extractLog && <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: extractLog.startsWith('✓') ? '#6a9e7f' : '#c87941', fontFamily: 'monospace' }}>{extractLog}</div>}
          </div>
          {docs.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#0f1117', borderBottom: '1px solid #1e2330' }}>
                  {['File','Size','Uploaded',''].map(h => <th key={h} style={{ padding: '0.5rem 0.85rem', textAlign: 'left', fontSize: '0.58rem', color: '#4a4f5a', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 400 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id} style={{ borderBottom: '1px solid #1a1d24' }}>
                    <td style={{ padding: '0.65rem 0.85rem', fontSize: '0.8rem' }}>
                      <a href={`${SB_URL}/storage/v1/object/loan-documents/${d.storage_path}?download=true`} target="_blank" style={{ color: '#4a9acf' }}>{d.file_name}</a>
                    </td>
                    <td style={{ padding: '0.65rem 0.85rem', fontSize: '0.72rem', color: '#4a4f5a' }}>{d.file_size ? Math.round(d.file_size / 1024) + ' KB' : '—'}</td>
                    <td style={{ padding: '0.65rem 0.85rem', fontSize: '0.72rem', color: '#4a4f5a' }}>{d.uploaded_at ? fmtDate(d.uploaded_at.slice(0,10)) : '—'}</td>
                    <td style={{ padding: '0.65rem 0.85rem' }}>
                      <button onClick={() => requirePin(() => deleteDoc(d.id, d.storage_path))} style={{ background: 'none', border: 'none', color: '#c4747455', cursor: 'pointer', fontSize: '0.78rem' }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Edit form ── */}
      {editing && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.25rem' }}>
          <div>
            <SectionHead>Loan Identity</SectionHead>
            {[['property_name','Property Name','text'],['borrower_entity','Borrower Entity','text'],['lender','Lender','text'],['loan_amount','Loan Amount ($)','number'],['closing_date','Closing Date','date'],['initial_maturity_date','Maturity Date','date'],['initial_term_months','Initial Term (months)','number']].map(([k,l,t]) => (
              <div key={k} style={{ marginBottom: '0.6rem' }}>
                <label style={{ fontSize: '0.58rem', color: '#4a4f5a', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 2 }}>{l}</label>
                <input type={t} value={form[k] || ''} onChange={e => setForm(f => ({...f,[k]:e.target.value}))} style={inputSt} />
              </div>
            ))}
            <div style={{ marginBottom: '0.6rem' }}>
              <label style={{ fontSize: '0.58rem', color: '#4a4f5a', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 2 }}>Status</label>
              <select value={form.status || ''} onChange={e => setForm(f => ({...f,status:e.target.value}))} style={inputSt}>
                {Object.entries(STATUS_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '0.6rem' }}>
              <label style={{ fontSize: '0.58rem', color: '#4a4f5a', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 2 }}>Loan Type</label>
              <select value={form.loan_type || ''} onChange={e => setForm(f => ({...f,loan_type:e.target.value}))} style={inputSt}>
                {['construction','permanent','bridge','land','mezz','other'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <SectionHead>Pricing</SectionHead>
            {[['interest_rate_description','Rate Description','text'],['origination_fee_pct','Origination Fee %','number'],['origination_fee_amount','Origination Fee $','number'],['interest_rate_spread','Spread %','number'],['interest_rate_floor','Floor %','number']].map(([k,l,t]) => (
              <div key={k} style={{ marginBottom: '0.6rem' }}>
                <label style={{ fontSize: '0.58rem', color: '#4a4f5a', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 2 }}>{l}</label>
                <input type={t} value={form[k] || ''} onChange={e => setForm(f => ({...f,[k]:e.target.value}))} style={inputSt} />
              </div>
            ))}
            {[['amortization_description','Amortization'],['prepayment_description','Prepayment'],['default_rate_description','Default Rate'],['exit_fee_description','Exit Fee'],['hedge_requirement','Hedge'],['development_fee_schedule','Dev Fee Schedule']].map(([k,l]) => (
              <div key={k} style={{ marginBottom: '0.6rem' }}>
                <label style={{ fontSize: '0.58rem', color: '#4a4f5a', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 2 }}>{l}</label>
                <textarea value={form[k] || ''} onChange={e => setForm(f => ({...f,[k]:e.target.value}))} rows={2} style={{ ...inputSt, resize: 'vertical' }} />
              </div>
            ))}
          </div>
          <div>
            <SectionHead>Covenants & Recourse</SectionHead>
            {[['completion_guaranty_pct','Completion Guaranty %','number'],['repayment_guaranty_pct','Repayment Guaranty %','number'],['liquidity_covenant','Liquidity Min ($)','number'],['net_worth_covenant','Net Worth Min ($)','number'],['dscr_covenant','DSCR Covenant','number'],['ltv_covenant','LTV Covenant %','number'],['equity_deposit','Equity Deposit ($)','number'],['change_order_individual','Change Order Individual ($)','number'],['change_order_aggregate','Change Order Aggregate ($)','number'],['lender_reserves_per_unit','Reserves ($/unit)','number']].map(([k,l,t]) => (
              <div key={k} style={{ marginBottom: '0.6rem' }}>
                <label style={{ fontSize: '0.58rem', color: '#4a4f5a', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 2 }}>{l}</label>
                <input type={t} value={form[k] || ''} onChange={e => setForm(f => ({...f,[k]:e.target.value}))} style={inputSt} />
              </div>
            ))}
            {[['dscr_formula','DSCR Formula'],['dscr_test_date','DSCR Test Date'],['distribution_restriction','Distribution Restriction'],['completion_deadline','Completion Deadline'],['other_notable_terms','Other Notable Terms'],['lender_contact','Lender Contact'],['draw_contact','Draw Contact']].map(([k,l]) => (
              <div key={k} style={{ marginBottom: '0.6rem' }}>
                <label style={{ fontSize: '0.58rem', color: '#4a4f5a', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 2 }}>{l}</label>
                <textarea value={form[k] || ''} onChange={e => setForm(f => ({...f,[k]:e.target.value}))} rows={2} style={{ ...inputSt, resize: 'vertical' }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── NewLoanModal ───────────────────────────────────────────────────────────────
function NewLoanModal({ onSave, onClose }) {
  const [form, setForm] = React.useState({ property_name: '', lender: '', loan_type: 'construction', status: 'construction' });
  const [saving, setSaving] = React.useState(false);
  const inputSt = { background: '#1a1d24', border: '1px solid #2e3340', borderRadius: 3, color: '#e8eaed', padding: '6px 10px', fontFamily: 'inherit', fontSize: '0.8rem', width: '100%', boxSizing: 'border-box' };

  async function save() {
    if (!form.property_name) return;
    setSaving(true);
    const res = await fetch(`${SB_URL}/rest/v1/loans`, {
      method: 'POST', headers: SB_HEADERS,
      body: JSON.stringify({ ...form, created_at: new Date().toISOString() }),
    });
    if (res.ok) { const d = await res.json(); onSave(Array.isArray(d) ? d[0] : d); }
    setSaving(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: '#1e2128', border: '1px solid #2e3340', borderTop: `3px solid ${TT_ORANGE}`, borderRadius: 6, padding: '2rem', width: 420 }}>
        <div style={{ fontSize: '0.65rem', color: TT_ORANGE, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700, marginBottom: '1.25rem' }}>New Loan</div>
        {[['property_name','Property Name *','e.g. Buford, GA'],['lender','Lender','e.g. BOKF']].map(([k,l,ph]) => (
          <div key={k} style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.58rem', color: '#4a4f5a', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 3 }}>{l}</label>
            <input value={form[k]||''} onChange={e => setForm(f=>({...f,[k]:e.target.value}))} placeholder={ph} style={inputSt} autoFocus={k==='property_name'} />
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {[['loan_type','Loan Type',['construction','permanent','bridge','land','mezz','other']],['status','Status',Object.keys(STATUS_CONFIG)]].map(([k,l,opts]) => (
            <div key={k}>
              <label style={{ fontSize: '0.58rem', color: '#4a4f5a', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 3 }}>{l}</label>
              <select value={form[k]} onChange={e => setForm(f=>({...f,[k]:e.target.value}))} style={inputSt}>
                {opts.map(o => <option key={o} value={o}>{STATUS_CONFIG[o]?.label || o.charAt(0).toUpperCase()+o.slice(1)}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '0.67rem', color: '#4a4f5a', marginBottom: '1.25rem' }}>Upload documents and run extraction after creating the loan record.</div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '6px 16px', background: 'none', border: '1px solid #2e3340', borderRadius: 3, color: '#9aa0aa', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem' }}>Cancel</button>
          <button onClick={save} disabled={saving || !form.property_name}
            style={{ padding: '6px 18px', background: form.property_name ? TT_ORANGE : '#2a2d35', border: 'none', borderRadius: 3, color: form.property_name ? '#fff' : '#4a4f5a', cursor: form.property_name ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600 }}>
            {saving ? 'Creating…' : 'Create Loan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Root App ───────────────────────────────────────────────────────────────────
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
    s.textContent = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{background:${TT_NAVY};color:#e8eaed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5}input,select,textarea{font-family:inherit}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#13151a}::-webkit-scrollbar-thumb{background:#2e3340;border-radius:3px}a{color:${TT_ORANGE}}`;
    document.head.appendChild(s);
    loadLoans();
  }, []);

  async function loadLoans() {
    setLoading(true);
    try {
      const res = await fetch(`${SB_URL}/rest/v1/loans?order=initial_maturity_date.asc`, { headers: SB_HEADERS });
      if (res.ok) setLoans(await res.json());
    } catch(e) {}
    setLoading(false);
  }

  function requirePin(action) {
    if (pinUnlocked) { action(); return; }
    setPinAction(() => action);
    setShowPin(true);
  }

  function handlePinSuccess() {
    setPinUnlocked(true); setShowPin(false);
    if (pinAction) { pinAction(); setPinAction(null); }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {showPin  && <PinModal onSuccess={handlePinSuccess} onClose={() => { setShowPin(false); setPinAction(null); }} />}
      {showNew  && <NewLoanModal onSave={loan => { setLoans(ls => [...ls, loan]); setShowNew(false); setSelected(loan); }} onClose={() => setShowNew(false)} />}

      {/* Header */}
      <div style={{ background: '#13151a', borderBottom: `3px solid ${TT_ORANGE}`, padding: '1.25rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.18em', color: TT_ORANGE, textTransform: 'uppercase', fontWeight: 600 }}>Thompson Thrift</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#e8eaed', marginTop: 1 }}>Loan Abstract Manager</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {pinUnlocked && <span style={{ fontSize: '0.65rem', color: TT_ORANGE, background: 'rgba(200,121,65,0.1)', padding: '3px 10px', borderRadius: 10 }}>✓ Edit Mode</span>}
          <button onClick={() => pinUnlocked ? setPinUnlocked(false) : setShowPin(true)}
            style={{ background: 'none', border: '1px solid #2e3340', borderRadius: 3, color: '#4a4f5a', padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem' }}>
            {pinUnlocked ? '🔓 Lock' : '🔒 Unlock'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '2rem', maxWidth: 1400, width: '100%', margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#4a4f5a', padding: '4rem' }}>Loading portfolio…</div>
        ) : selected ? (
          <LoanDetail
            loan={selected}
            onBack={() => setSelected(null)}
            onSave={updated => { setLoans(ls => ls.map(l => l.id === updated.id ? updated : l)); setSelected(updated); }}
            onDelete={() => { setLoans(ls => ls.filter(l => l.id !== selected.id)); setSelected(null); }}
            pinUnlocked={pinUnlocked}
            requirePin={requirePin}
          />
        ) : (
          <PortfolioView loans={loans} onSelect={setSelected} onNew={() => setShowNew(true)} pinUnlocked={pinUnlocked} requirePin={requirePin} />
        )}
      </div>
    </div>
  );
}
