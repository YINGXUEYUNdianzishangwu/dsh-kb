// kb-search.cjs — 本地 BM25 全文检索（无外部依赖）
// 建索引: node kb-search.cjs build <repoPath> <kbDir>
// 查询:   node kb-search.cjs "<query>" [--kb <dir>] [--n 8] [--json]
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const K1 = 1.2, B = 0.75;
const CHUNK = 900; // 字符/块
const MAX_FILE = 400 * 1024; // 跳过超大文件

function walk(dir, out) {
  let e; try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const x of e) {
    if (x.name === 'node_modules' || x.name === '.git' || x.name === 'snapshots') continue;
    const p = path.join(dir, x.name);
    if (x.isDirectory()) walk(p, out); else out.push(p);
  }
}

function tokenize(text) {
  const out = [];
  const lower = text.toLowerCase();
  const ascii = lower.match(/[a-z0-9_]{2,}/g);
  if (ascii) out.push(...ascii);
  // CJK 二元组（中文内容按 bigram）
  const cjk = lower.match(/[\u4e00-\u9fff]+/g);
  if (cjk) for (const run of cjk) for (let i = 0; i + 1 < run.length; i++) out.push(run.slice(i, i + 2));
  return out;
}

function build(repo, kbDir) {
  const files = [];
  walk(path.join(repo, 'docs'), files);
  const pkgRoot = path.join(repo, 'packages');
  if (fs.existsSync(pkgRoot)) {
    for (const g of fs.readdirSync(pkgRoot)) {
      const gp = path.join(pkgRoot, g);
      if (!fs.statSync(gp).isDirectory()) continue;
      for (const p of fs.readdirSync(gp)) {
        const rd = path.join(gp, p, 'README.md');
        if (fs.existsSync(rd)) files.push(rd);
      }
    }
  }
  for (const f of fs.readdirSync(repo)) if (f.endsWith('.md')) files.push(path.join(repo, f));

  const chunks = [];
  for (const f of files) {
    let st; try { st = fs.statSync(f); } catch { continue; }
    if (st.size > MAX_FILE) continue;
    let text; try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const lines = text.split('\n');
    const rel = path.relative(repo, f).replace(/\\/g, '/');
    let buf = [], start = 0;
    const flush = () => {
      if (!buf.length) return;
      const t = buf.join('\n').trim();
      if (t.length > 40) chunks.push({ f: rel, s: start + 1, t });
      buf = [];
    };
    for (let i = 0; i < lines.length; i++) {
      if (!buf.length) start = i;
      buf.push(lines[i]);
      if (buf.join('\n').length >= CHUNK) flush();
    }
    flush();
  }

  const postings = new Map();
  let totalLen = 0;
  for (let i = 0; i < chunks.length; i++) {
    const toks = tokenize(chunks[i].t);
    chunks[i].n = toks.length;
    totalLen += toks.length;
    const tf = new Map();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    for (const [term, n] of tf) {
      let arr = postings.get(term);
      if (!arr) { arr = []; postings.set(term, arr); }
      arr.push(i, n);
    }
  }
  const index = {
    v: 1, builtAt: new Date().toISOString(), repo: path.resolve(repo),
    chunks: chunks.map((c) => ({ f: c.f, s: c.s, t: c.t, n: c.n })),
    postings: Object.fromEntries(postings),
    N: chunks.length, avgLen: chunks.length ? totalLen / chunks.length : 0,
  };
  const raw = Buffer.from(JSON.stringify(index), 'utf8');
  const gz = zlib.gzipSync(raw, { level: 9 });
  const outFile = path.join(kbDir, 'search-index.json.gz');
  fs.writeFileSync(outFile, gz);
  console.log('files=' + files.length + ' chunks=' + chunks.length + ' terms=' + postings.size +
    ' raw=' + (raw.length / 1048576).toFixed(1) + 'MB gz=' + (gz.length / 1048576).toFixed(1) + 'MB -> ' + outFile);
}

function load(kbDir) {
  const f = path.join(kbDir, 'search-index.json.gz');
  if (!fs.existsSync(f)) { console.error('no index: ' + f + ' (run: node kb-search.cjs build <repo> <kbDir>)'); process.exit(2); }
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'));
}

function query(kbDir, q, n) {
  const idx = load(kbDir);
  const terms = [...new Set(tokenize(q))];
  const scores = new Map();
  for (const term of terms) {
    const arr = idx.postings[term];
    if (!arr) continue;
    const df = arr.length / 2;
    const idf = Math.log(1 + (idx.N - df + 0.5) / (df + 0.5));
    for (let i = 0; i < arr.length; i += 2) {
      const doc = arr[i], tf = arr[i + 1];
      const len = idx.chunks[doc].n;
      const s = idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * len / idx.avgLen));
      scores.set(doc, (scores.get(doc) || 0) + s);
    }
  }
  const hits = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  return hits.map(([doc, score]) => {
    const c = idx.chunks[doc];
    return { score: +score.toFixed(3), file: c.f, line: c.s, snippet: c.t.replace(/\s+/g, ' ').slice(0, 220) };
  });
}

const argv = process.argv.slice(2);
if (argv[0] === 'build') {
  build(argv[1], argv[2] || path.join(__dirname));
} else {
  const nIdx = argv.indexOf('--n'); const n = nIdx >= 0 ? +argv[nIdx + 1] : 8;
  const kbIdx = argv.indexOf('--kb'); const kbDir = kbIdx >= 0 ? argv[kbIdx + 1] : __dirname;
  const json = argv.includes('--json');
  const q = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--n' && argv[i - 1] !== '--kb').join(' ');
  if (!q) { console.error('usage: node kb-search.cjs "<query>" [--kb dir] [--n 8] [--json]'); process.exit(2); }
  const hits = query(kbDir, q, n);
  if (json) { console.log(JSON.stringify(hits, null, 1)); }
  else {
    if (!hits.length) console.log('no matches: ' + q);
    for (const h of hits) console.log('[' + h.score + '] ' + h.file + ':' + h.line + '\n    ' + h.snippet + '\n');
  }
}
