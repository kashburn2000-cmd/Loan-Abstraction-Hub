import { PDFDocument } from 'pdf-lib';

const PAGES_PER_CHUNK = 50; // smaller chunks to stay under token rate limit
const ANTHROPIC_URL   = 'https://api.anthropic.com/v1/messages';
const CHUNK_DELAY_MS  = 8000; // 8 second pause between chunks to respect rate limit

const sleep = ms => new Promise(r => setTimeout(r, ms));

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
      model: 'claude-haiku-4-5-20251001', // higher rate limits, much cheaper, great at extraction
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' }, // cache the large prompt across chunks
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { documents, prompt } = req.body;
    if (!documents?.length) return res.status(400).json({ error: 'No documents provided' });

    // Build content blocks, splitting large PDFs
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
        allBlocks.push({
          block: { type: 'document', source: { type: 'base64', media_type: doc.media_type, data: doc.base64 } },
          pageCount: 5,
          label: doc.name,
        });
      }
    }

    // Group into batches under page limit
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

    // Call Claude once per batch with delay between calls
    let merged = null;
    let totalCacheCreated = 0;
    let totalCacheRead = 0;

    for (let i = 0; i < batches.length; i++) {
      // Pause between chunks to stay under rate limit (skip before first call)
      if (i > 0) {
        console.log(`Waiting ${CHUNK_DELAY_MS}ms before chunk ${i + 1} to respect rate limit…`);
        await sleep(CHUNK_DELAY_MS);
      }

      const b = batches[i];
      const contentBlocks = b.map(x => x.block);

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

      if (data.usage) {
        totalCacheCreated += data.usage.cache_creation_input_tokens || 0;
        totalCacheRead    += data.usage.cache_read_input_tokens || 0;
      }

      console.log(`Chunk ${i + 1}/${batches.length} done. Cache created: ${totalCacheCreated}, read: ${totalCacheRead}`);
    }

    return res.status(200).json({
      content: [{ type: 'text', text: JSON.stringify(merged) }],
      chunksProcessed: batches.length,
      cacheStats: { created: totalCacheCreated, read: totalCacheRead },
    });

  } catch (err) {
    console.error('Extract error:', err);
    return res.status(500).json({ error: err.message });
  }
}
