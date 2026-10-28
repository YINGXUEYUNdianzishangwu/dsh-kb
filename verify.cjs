// verify.cjs — 索引完整性/预算自检
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
