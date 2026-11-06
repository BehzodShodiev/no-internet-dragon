// Checks an artifact page before publishing: nothing the claude.ai sandbox would block (external URLs,
// network APIs, service workers), no document wrapper, and the gzip size within budget.
//   node tools/scan-artifact.mjs <page.html> [--gzip-kb 400]
// Exit 1 if any check fails.
import fs from 'node:fs';
import zlib from 'node:zlib';

const file = process.argv[2];
const budget = Number(process.argv[process.argv.indexOf('--gzip-kb') + 1]) || 400;
if (!file) { console.log('usage: node tools/scan-artifact.mjs <page.html> [--gzip-kb 400]'); process.exit(1); }
const s = fs.readFileSync(file, 'utf8');
const si = s.indexOf('<script type="module"');
const wrapper = (s.slice(0, si).match(/<(!doctype|html|head|body)\b/gi) || []).length;
const hosts = {};
for (const m of s.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) hosts[m[1]] = (hosts[m[1]] || 0) + 1;
const allowedHosts = ['www.w3.org']; // XML namespaces, never fetched
const external = Object.keys(hosts).filter((h) => !allowedHosts.includes(h));
const count = (re) => (s.match(re) || []).length;
const apis = { fetch: count(/\bfetch\(/g), xhr: count(/XMLHttpRequest/g), ws: count(/new WebSocket/g), swRegister: count(/serviceWorker\.register/g), importScripts: count(/importScripts/g), srcHttp: count(/src=["']https?:/g), cssUrlHttp: count(/url\(["']?https?:/g) };
const gz = zlib.gzipSync(Buffer.from(s)).length;
const checks = [
  ['no document wrapper tags', wrapper === 0, `${wrapper}`],
  ['no external hosts', external.length === 0, external.join(', ') || 'none'],
  ['no network APIs', Object.values(apis).every((v) => v === 0), JSON.stringify(apis)],
  [`gzip within ${budget} KB`, gz <= budget * 1024, `${(gz / 1024).toFixed(1)} KB gzip, ${(s.length / 1024).toFixed(0)} KB raw`],
];
let fail = 0;
for (const [name, ok, detail] of checks) {
  if (!ok) fail++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name} · ${detail}`);
}
process.exit(fail ? 1 : 0);
