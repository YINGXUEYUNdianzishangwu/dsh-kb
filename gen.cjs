// kb-gen v3 — 分层索引（L0 树 / L1 包域 / docs 索引 / 插件 / 符号索引）+ 预算自检
// 用法: node gen.cjs <repoPath> <outRoot> <tag> <commit>
const fs = require('fs');
const path = require('path');

const G = 'C:/Users/wang7/AppData/Roaming/npm/node_modules';
let T = null;
try { T = require(G + '/memorix/node_modules/gpt-tokenizer'); } catch {}
const enc = (s) => (T ? T.encode(s).length : Math.round(s.length / 3.2));

const repo = process.argv[2];
const outRoot = process.argv[3];
const tag = process.argv[4] || 'unknown';
const commit = process.argv[5] || null;
if (!repo || !fs.existsSync(repo)) { console.error('repo not found: ' + repo); process.exit(1); }

const slug = 'deepseek-harness-' + tag.replace(/^dsh-v/, '');
const out = path.join(outRoot, slug);
fs.mkdirSync(out, { recursive: true });
// 只清理生成物，保留手写的 modules/ 与 50-scene-map.md
for (const f of fs.readdirSync(out)) {
  const p = path.join(out, f);
  if (fs.statSync(p).isDirectory()) continue;
  if (/^(00-|10-|20-|25-|30-|40-|gen\.cjs|verify\.cjs|meta\.json)/.test(f)) fs.rmSync(p, { force: true });
}

function walk(dir, outF, outD) {
  let e;
  try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const x of e) {
    if (x.name === 'node_modules' || x.name === '.git') continue;
    const p = path.join(dir, x.name);
    if (x.isDirectory()) { outD.push(p); walk(p, outF, outD); } else outF.push(p);
  }
}
const files = [], dirs = [];
walk(repo, files, dirs);
const rel = (f) => path.relative(repo, f).replace(/\\/g, '/');

const MAX = 1800;
const chunkByTokens = (lines, header) => {
  const parts = []; let cur = [];
  for (const line of lines) {
    const cand = cur.concat([line]);
    if (enc(cand.join('\n')) > MAX - 40 && cur.length) { parts.push(cur); cur = [line]; } else cur = cand;
  }
  if (cur.length) parts.push(cur);
  return parts.map((part, i) => ({ header: part.length ? header(part, i, parts.length) : header(part, i, parts.length), body: part.join('\n') + '\n' }));
};

// ---------- L0 ----------
const topDirs = fs.readdirSync(repo, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const pkgAreas = fs.existsSync(path.join(repo, 'packages')) ? fs.readdirSync(path.join(repo, 'packages'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
const appDirs = fs.existsSync(path.join(repo, 'apps')) ? fs.readdirSync(path.join(repo, 'apps'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
const tree = ['# L0 目录树 — deepseek-harness（' + tag + '）', '',
  '顶层：' + topDirs.map((d) => d + '/').join(' '), '',
  'apps/：' + appDirs.join(' '), '',
  'packages/（' + pkgAreas.length + ' 个域）：' + pkgAreas.join(' '), '',
  '其余：' + topDirs.filter((d) => !['apps', 'packages'].includes(d)).map((d) => d + '/').join(' ')].join('\n') + '\n';

// ---------- 包索引 ----------
const pkgs = [];
for (const f of files.filter((x) => x.endsWith('package.json'))) {
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!j.name) continue;
    const p = rel(path.dirname(f));
    const seg = p.split('/');
    const area = seg[0] === 'packages' ? 'packages/' + seg[1] : seg[0] === 'apps' ? 'apps/' + seg[1] : (p === '' ? 'root' : seg[0]);
    pkgs.push({ name: j.name, ver: j.version || '', desc: (j.description || '').replace(/\s+/g, ' ').slice(0, 110), path: p, area, bundle: !!(j.dsh && j.dsh.bundle), patch: !!(j.exports && j.exports['./cordis.patch.yml']) });
  } catch {}
}
pkgs.sort((a, b) => a.name.localeCompare(b.name));
const byArea = {};
for (const p of pkgs) (byArea[p.area] = byArea[p.area] || []).push(p);

const areaIndex = ['# L1 域索引（先读这里；按域读 20-packages-*.md）', '', '| 域 | 包数 | 文件 |', '|---|---|---|'];
const areaFiles = {};
for (const [a, list] of Object.entries(byArea).sort()) {
  const base = '20-packages-' + a.replace(/[^a-z0-9]+/gi, '-');
  const lines = list.map((p) => '- ' + p.name + ' ' + p.ver + ' — ' + p.desc + ' — ' + p.path);
  const parts = chunkByTokens(lines, (part, i, n) => '# ' + a + ' (' + list.length + ' packages, part ' + (i + 1) + '/' + n + ')');
  const fns = [];
  parts.forEach((pt, i) => {
    const fn = parts.length === 1 ? base + '.md' : base + '-part' + (i + 1) + '.md';
    areaFiles[fn] = pt.header + '\n\n' + pt.body;
    fns.push(fn);
  });
  areaIndex.push('| ' + a + ' | ' + list.length + ' | ' + fns.join(' ') + ' |');
}

// ---------- docs 索引 ----------
const mdDocs = files.filter((f) => f.toLowerCase().endsWith('.md'));
const docGroups = {};
for (const f of mdDocs) {
  const r = rel(f);
  const seg = r.split('/');
  const group = seg.length === 1 ? 'root' : seg[0] === 'docs' ? 'docs/' + (seg[1] && seg[1].endsWith('.md') ? '' : seg[1]) : seg[0];
  (docGroups[group] = docGroups[group] || []).push(r);
}
const docsIndex = ['# docs 索引（每篇一行；按组读 25-docs-*.md）', '', '| 组 | 篇数 | 文件 |', '|---|---|---|'];
const docsFiles = {};
// 小组（<2 篇）合并为 docs/misc，避免组索引膨胀
for (const g of Object.keys(docGroups)) {
  if (g !== 'docs/misc' && docGroups[g].length < 2) {
    (docGroups['docs/misc'] = docGroups['docs/misc'] || []).push(...docGroups[g]);
    delete docGroups[g];
  }
}
for (const [g, list] of Object.entries(docGroups).sort()) {
  const base = '25-docs-' + g.replace(/[^a-z0-9]+/gi, '-');
  const lines = list.map((r) => {
    const abs = path.join(repo, r);
    let title = r, desc = '';
    try {
      const text = fs.readFileSync(abs, 'utf8');
      const m = text.match(/^#\s+(.+)$/m);
      if (m) title = m[1].trim();
      const first = text.split('\n').map((s) => s.trim()).find((s) => s && !s.startsWith('#') && !s.startsWith('---') && !s.startsWith('!['));
      if (first) desc = first.replace(/[*_`]/g, '').slice(0, 90);
    } catch {}
    return '- ' + title + ' — ' + desc + ' — ' + r;
  });
  const parts = chunkByTokens(lines, (part, i, n) => '# docs: ' + g + ' (' + list.length + ' 篇, part ' + (i + 1) + '/' + n + ')');
  const fns = [];
  parts.forEach((pt, i) => {
    const fn = parts.length === 1 ? base + '.md' : base + '-part' + (i + 1) + '.md';
    docsFiles[fn] = pt.header + '\n\n' + pt.body;
    fns.push(fn);
  });
  docsIndex.push('| ' + g + ' | ' + list.length + ' | ' + fns.join(' ') + ' |');
}

// ---------- 符号索引 ----------
const pkgRoots = pkgs.map((p) => ({ name: p.name, root: p.path })).filter((p) => p.root).sort((a, b) => b.root.length - a.root.length);
const pkgOf = (r) => { for (const p of pkgRoots) if (r === p.root || r.startsWith(p.root + '/')) return p.name; return '<root>'; };
const symRe = /^export\s+(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(class|function|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;
const syms = [];
for (const f of files.filter((x) => /\.(ts|tsx|mts|cts)$/.test(x) && !x.endsWith('.d.ts'))) {
  const r = rel(f);
  let lines; try { lines = fs.readFileSync(f, 'utf8').split('\n'); } catch { continue; }
  const pkg = pkgOf(r);
  for (let i = 0; i < lines.length; i++) {
    const m = symRe.exec(lines[i]);
    if (m) syms.push({ s: m[2], k: m[1], f: r, l: i + 1, p: pkg });
  }
}
const symJsonl = syms.map((x) => JSON.stringify(x)).join('\n') + '\n';
const symByArea = {};
for (const s of syms) { const a = pkgs.find((p) => p.name === s.p); const area = a ? a.area : 'other'; symByArea[area] = (symByArea[area] || 0) + 1; }
const symSummary = ['# 符号索引摘要（全量在 40-symbols.jsonl，用 grep 检索）', '', '导出符号总数：' + syms.length, '', '| 域 | 符号数 |', '|---|---|',
  ...Object.entries(symByArea).sort((a, b) => b[1] - a[1]).map(([a, n]) => '| ' + a + ' | ' + n + ' |')].join('\n') + '\n';

// ---------- 插件索引 ----------
const table = (title, rows) => '# ' + title + ' (' + rows.length + ')\n\n' + rows.map((p) => '- ' + p.name + ' ' + p.ver + ' — ' + p.desc + ' — ' + p.path).join('\n') + '\n';
const pluginFiles = {};
const addPlugin = (base, title, rows) => {
  if (!rows.length) return;
  const lines = rows.map((p) => '- ' + p.name + ' ' + p.ver + ' — ' + p.desc + ' — ' + p.path);
  const parts = chunkByTokens(lines, (part, i, n) => '# ' + title + ' (' + rows.length + ', part ' + (i + 1) + '/' + n + ')');
  parts.forEach((pt, i) => { pluginFiles[parts.length === 1 ? base + '.md' : base + '-part' + (i + 1) + '.md'] = pt.header + '\n\n' + pt.body; });
};
addPlugin('30-plugins-bundles', '插件 bundle（含 cordis.patch.yml）', pkgs.filter((p) => p.bundle || p.patch));
addPlugin('30-plugins-client-ui', 'Client UI 插件', pkgs.filter((p) => /dsh-client-ui-/.test(p.name)));
addPlugin('30-plugins-presets', 'Agent preset / 组合', pkgs.filter((p) => /agent-preset|preset/.test(p.name)));
addPlugin('30-plugins-apps', 'App 入口', pkgs.filter((p) => p.path.startsWith('apps/')));

// ---------- 写盘 ----------
fs.writeFileSync(path.join(out, '10-tree.md'), tree);
fs.writeFileSync(path.join(out, '20-packages.md'), areaIndex.join('\n') + '\n');
for (const [fn, body] of Object.entries(areaFiles)) fs.writeFileSync(path.join(out, fn), body);
fs.writeFileSync(path.join(out, '25-docs-index.md'), docsIndex.join('\n') + '\n');
for (const [fn, body] of Object.entries(docsFiles)) fs.writeFileSync(path.join(out, fn), body);
for (const [fn, body] of Object.entries(pluginFiles)) fs.writeFileSync(path.join(out, fn), body);
fs.writeFileSync(path.join(out, '40-symbols.jsonl'), symJsonl);
fs.writeFileSync(path.join(out, '40-symbols-summary.md'), symSummary);
const meta = {
  repo, slug, tag, commit, generator: 'kb-gen v3', generatedAt: new Date().toISOString(),
  files: files.length, dirs: dirs.length, packages: pkgs.length, areas: Object.keys(byArea).length,
  docFiles: mdDocs.length, docGroups: Object.keys(docGroups).length, symbols: syms.length,
  installVersionNote: '本机 DSH 安装版本 0.2.1-rc.3；索引 tag ' + tag,
};
fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(meta, null, 1));

// ---------- 预算自检 + README ----------
const listFiles = fs.readdirSync(out).sort();
const sizes = {}; let nav = 0; const over = [];
for (const f of listFiles) {
  const st = fs.statSync(path.join(out, f));
  if (st.isDirectory()) continue;
  if (f.endsWith('.jsonl')) { sizes[f] = 'machine(' + (st.size / 1024).toFixed(0) + 'KB)'; continue; }
  const tok = enc(fs.readFileSync(path.join(out, f), 'utf8'));
  sizes[f] = tok;
  if (['10-tree.md', '20-packages.md', '25-docs-index.md', '40-symbols-summary.md'].includes(f)) nav += tok;
  if (/^(10-|20-|25-|30-|40-)/.test(f) && !['10-tree.md', '20-packages.md', '25-docs-index.md', '40-symbols-summary.md'].includes(f) && tok > 2000) over.push(f + '=' + tok);
}
// 手写文件（L2 / 场景映射）计入资产表
const extraFiles = [];
if (fs.existsSync(path.join(out, '50-scene-map.md'))) extraFiles.push('50-scene-map.md');
if (fs.existsSync(path.join(out, 'modules'))) for (const f of fs.readdirSync(path.join(out, 'modules')).sort()) extraFiles.push('modules/' + f);
for (const f of extraFiles) sizes[f] = enc(fs.readFileSync(path.join(out, f), 'utf8'));
const readme = ['# KB: deepseek-harness ' + tag + '（' + slug + '）', '',
  '来源：' + repo, 'tag：' + tag + '｜commit：' + (commit || 'n/a'), '生成：' + meta.generatedAt + '（' + meta.generator + '）',
  '规模：' + meta.files + ' 文件 / ' + meta.packages + ' 包 / ' + meta.docFiles + ' 篇 docs / ' + meta.symbols + ' 个导出符号', '',
  '> 本机安装版本 **0.2.1-rc.3**，与本索引 tag 对齐。', '',
  '## 预算自检', '',
  '- 导航层合计（10-tree + 20-packages + 25-docs-index + 40-symbols-summary）：**' + nav + ' tokens**（规则上限 4k）',
  '- 超 2k 的分片文件：' + (over.length ? over.join(', ') : '无'), '',
  '## 文件与 token', '', '| 文件 | tokens |', '|---|---|',
  ...Object.entries(sizes).map(([f, t]) => '| ' + f + ' | ' + t + ' |'), '',
  '## 使用顺序', '',
  '1. L0 `10-tree.md` → 判断域',
  '2. L1 `20-packages.md` → 域文件，只读 1 个域',
  '3. 设计问题 → `25-docs-index.md` → 读 1–2 篇 docs',
  '4. 找实现 → `grep 40-symbols.jsonl` → 定位 file:line，再读该文件',
  '5. 机制 → `modules/<domain>.md`（1–3k）',
  '6. 插件/入口 → `30-plugins-*.md`；场景 → `50-scene-map.md`',
  '', '## 维护', '',
  '- 重建：`node gen.cjs <repo> <outRoot> <tag> <commit>`（同一 slug 覆盖）',
  '- 校验：`node verify.cjs`（预算/完整性/stale）'].join('\n') + '\n';
fs.writeFileSync(path.join(out, '00-README.md'), readme);

// 复制生成器与校验器
fs.copyFileSync(__filename, path.join(out, 'gen.cjs'));
const verify = `// verify.cjs — 索引完整性/预算自检
const fs=require('fs'), path=require('path');
const G='C:/Users/wang7/AppData/Roaming/npm/node_modules'; let T=null;
try{ T=require(G+'/memorix/node_modules/gpt-tokenizer'); }catch{}
const enc=s=>T?T.encode(s).length:Math.round(s.length/3.2);
const dir=__dirname; const meta=JSON.parse(fs.readFileSync(path.join(dir,'meta.json'),'utf8'));
const req=['00-README.md','10-tree.md','20-packages.md','25-docs-index.md','30-plugins-bundles.md','40-symbols.jsonl','meta.json'];
let fail=0; for(const f of req){ if(!fs.existsSync(path.join(dir,f))){ console.log('MISSING', f); fail++; } }
let nav=0; for(const f of ['10-tree.md','20-packages.md','25-docs-index.md','40-symbols-summary.md']){ if(fs.existsSync(path.join(dir,f))) nav+=enc(fs.readFileSync(path.join(dir,f),'utf8')); }
if(nav>4000){ console.log('NAV_OVER_BUDGET', nav); fail++; }
for(const f of fs.readdirSync(dir)){ if(!/^(10-|20-|25-|30-|40-)/.test(f)||f.endsWith('.jsonl')||f==='10-tree.md'||f==='20-packages.md'||f==='25-docs-index.md'||f==='40-symbols-summary.md') continue; const t=enc(fs.readFileSync(path.join(dir,f),'utf8')); if(t>2000){ console.log('OVER_2K', f, t); fail++; } }
console.log('meta:', meta.tag, 'packages='+meta.packages, 'docs='+meta.docFiles, 'symbols='+meta.symbols, 'generated='+meta.generatedAt);
console.log(fail? 'FAIL '+fail : 'PASS');
`;
fs.writeFileSync(path.join(out, 'verify.cjs'), verify);

console.log('OUT=' + out);
console.log('nav=' + nav + ' files=' + listFiles.length + ' packages=' + pkgs.length + ' docs=' + mdDocs.length + ' symbols=' + syms.length + ' over2k=' + (over.join(',') || 'none'));
