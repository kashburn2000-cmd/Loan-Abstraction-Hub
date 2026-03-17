import { PDFDocument } from 'pdf-lib';

const PAGES_PER_CHUNK = 80;
const ANTHROPIC_URL   = 'https://api.anthropic.com/v1/messages';

// ── Call Claude with prompt caching ───────────────────────────────────────────
// Caching strategy:
//   - System prompt carries the extraction schema (large, static) → always cached
//   - Each user message contains only the documents + a short chunk note
// The cache_control breakpoint on the system prompt tells Anthropic to cache
// everything up to that point. On chunk 2, 3, etc. the prompt is served from
// cache (~10x cheaper, ~5x faster).
async function callClaude(systemPrompt, contentBlocks) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'pdfs-2024-09-25,prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          // Mark the end of the system prompt as a cache breakpoint.
          // Anthropic will cache everything up to here and reuse it
          // across all chunk calls within this request lifecycle.
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: contentBlocks }],
    }),
  });

  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.error?.message || `Claude API ${res.status}`);
  }
  return res.json();
}

// ── Split a PDF into chunks of PAGES_PER_CHUNK pages ─────────────────────────
async function splitPdf(base64Data) {
  const pdfBytes = Buffer.from(base64Data, 'base64');
  const srcDoc   = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const total    = srcDoc.getPageCount();

  if (total <= PAGES_PER_CHUNK) {
    return [{ base64: base64Data, pages: `1-${total}`, pageCount: total }];
  }

  const chunks = [];
  for (let start = 0; start < total; start += PAGES_PER_CHUNK) {
    const end    = Math.min(start + PAGES_PER_CHUNK, total);
    const newDoc = await PDFDocument.create();
    const copied = await newDoc.copyPages(srcDoc, Array.from({ length: end - start }, (_, i) => start + i));
    copied.forEach(p => newDoc.addPage(p));
    const bytes  = await newDoc.save();
    chunks.push({
      base64: Buffer.from(bytes).toString('base64'),
      pages: `${start + 1}-${end}`,
      pageCount: end - start,
    });
  }
  return chunks;
}

// ── Merge two extraction results, preferring more complete values ──────────────
function mergeExtractions(base, incoming) {
  if (!base) return incoming;
  if (!incoming) return base;
  const merged = { ...base };
  for (const [k, v] of Object.entries(incoming)) {
    if (k === 'confidence_flags') {
      merged[k] = [...new Set([...(base[k] || []), ...(v || [])])];
    } else if (k === 'extraction_notes') {
      merged[k] = [base[k], v].filter(Boolean).join(' | ');
    } else if (Array.isArray(v) && v.length > 0) {
      if (!Array.isArray(base[k]) || base[k].length === 0) merged[k] = v;
      else if (v.length > base[k].length) merged[k] = v;
    } else if (v !== null && v !== '' && (base[k] === null || base[k] === '')) {
      merged[k] = v;
    }
  }
  return merged;
}

function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON in Claude response');
  return JSON.parse(m[0]);
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { documents, prompt } = req.body;
    if (!documents?.length) return res.status(400).json({ error: 'No documents provided' });

    // Build content blocks, splitting large PDFs into chunks
    const allBlocks = [];
    for (const doc of documents) {
      if (doc.media_type === 'application/pdf') {
        const chunks = await splitPdf(doc.base64);
        for (const chunk of chunks) {
          allBlocks.push({
            block: { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: chunk.base64 } },
            pageCount: chunk.pageCount,
            label: chunks.length > 1 ? `${doc.name} (pages ${chunk.pages})` : doc.name,
          });
        }
      } else {
        // DOCX — no splitting needed, estimate 5 pages
        allBlocks.push({
          block: { type: 'document', source: { type: 'base64', media_type: doc.media_type, data: doc.base64 } },
          pageCount: 5,
          label: doc.name,
        });
      }
    }

    // Group blocks into batches, each under PAGES_PER_CHUNK
    const batches = [];
    let batch = [], pages = 0;
    for (const item of allBlocks) {
      if (pages + item.pageCount > PAGES_PER_CHUNK && batch.length > 0) {
        batches.push(batch); batch = []; pages = 0;
      }
      batch.push(item);
      pages += item.pageCount;
    }
    if (batch.length > 0) batches.push(batch);

    // Call Claude once per batch, merging results
    // The system prompt (extraction schema) is cached after the first call
    let merged = null;
    let totalCacheCreatedTokens = 0;
    let totalCacheReadTokens = 0;

    for (let i = 0; i < batches.length; i++) {
      const b = batches[i];

      // Content blocks = documents only (no prompt — that lives in system now)
      const contentBlocks = b.map(x => x.block);

      // Add a short chunk note when splitting across multiple calls
      if (batches.length > 1) {
        contentBlocks.push({
          type: 'text',
          text: `This is chunk ${i + 1} of ${batches.length} for this loan. ` +
                `Documents in this chunk: ${b.map(x => x.label).join(', ')}. ` +
                `Extract all fields you can find. For fields not present in this chunk, use null.`,
        });
      }

      const data = await callClaude(prompt, contentBlocks);
      const raw  = data.content?.find(c => c.type === 'text')?.text || '';
      merged     = mergeExtractions(merged, parseJson(raw));

      // Track cache usage for logging
      if (data.usage) {
        totalCacheCreatedTokens += data.usage.cache_creation_input_tokens || 0;
        totalCacheReadTokens    += data.usage.cache_read_input_tokens || 0;
      }
    }

    console.log(`Extraction complete. Chunks: ${batches.length}. Cache created: ${totalCacheCreatedTokens} tokens. Cache read: ${totalCacheReadTokens} tokens.`);

    return res.status(200).json({
      content: [{ type: 'text', text: JSON.stringify(merged) }],
      chunksProcessed: batches.length,
      cacheStats: { created: totalCacheCreatedTokens, read: totalCacheReadTokens },
    });

  } catch (err) {
    console.error('Extract error:', err);
    return res.status(500).json({ error: err.message });
  }
}
