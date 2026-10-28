// staleness.cjs — 索引陈旧检测
// 用法: node staleness.cjs [--kb <dir>] [--check-upstream] [--json]
// 退出码: 0=新鲜, 1=陈旧, 2=用法/环境错误
const fs = require('fs');
const path = require('path');
const https = require('https');

const argv = process.argv.slice(2);
const kbIdx = argv.indexOf('--kb');
const kbDir = kbIdx >= 0 ? argv[kbIdx + 1] : __dirname;
const json = argv.includes('--json');
const checkUpstream = argv.includes('--check-upstream');

const metaPath = path.join(kbDir, 'meta.json');
if (!fs.existsSync(metaPath)) { console.error('missing meta.json in ' + kbDir); process.exit(2); }
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
const report = { tag: meta.tag, commit: meta.commit, generatedAt: meta.generatedAt, source: meta.repo, issues: [] };

const ageDays = (Date.now() - Date.parse(meta.generatedAt)) / 86400000;
report.ageDays = +ageDays.toFixed(1);
if (ageDays > 30) report.issues.push('STALE_AGE: index is ' + report.ageDays + ' days old (>30)');

function gitHead(repo) {
  try {
    const { execFileSync } = require('child_process');
    if (!fs.existsSync(path.join(repo, '.git'))) return null;
    return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch { return null; }
}
const head = gitHead(meta.repo);
report.sourceHead = head;
if (head && meta.commit && head !== meta.commit) report.issues.push('STALE_SOURCE: source HEAD ' + head.slice(0, 12) + ' != indexed ' + meta.commit.slice(0, 12));
if (!head) report.issues.push('NO_GIT: source is not a git checkout; cannot verify commit (tarball)');

function latestTag() {
  return new Promise((resolve) => {
    const req = https.get('https://api.github.com/repos/deepseek-ai/deepseek-harness/tags?per_page=1', {
      headers: { 'User-Agent': 'dsh-kb-staleness', Accept: 'application/vnd.github+json' }, timeout: 15000,
    }, (r) => {
      let b = ''; r.on('data', (d) => b += d); r.on('end', () => { try { resolve(JSON.parse(b)[0]?.name || null); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

(async () => {
  if (checkUpstream) {
    const up = await latestTag();
    report.upstreamTag = up;
    if (!up) report.issues.push('UPSTREAM_UNREACHABLE: could not fetch latest tag');
    else if (meta.tag && up !== meta.tag) report.issues.push('UPSTREAM_NEWER: latest tag ' + up + ' != indexed ' + meta.tag);
  }
  if (json) console.log(JSON.stringify(report, null, 1));
  else {
    console.log('tag=' + report.tag + ' commit=' + (report.commit || 'n/a') + ' age=' + report.ageDays + 'd');
    console.log('source=' + report.source + ' head=' + (report.sourceHead || 'n/a'));
    if (checkUpstream) console.log('upstream_latest=' + (report.upstreamTag || 'unknown'));
    if (!report.issues.length) console.log('FRESH');
    else for (const i of report.issues) console.log('STALE: ' + i);
  }
  process.exit(report.issues.some((i) => !i.startsWith('NO_GIT')) ? 1 : 0);
})();
