// Turns the single-file build into an Artifact page body: title first, then style, markup, script.
import fs from 'node:fs';
const [src, out] = process.argv.slice(2);
const html = fs.readFileSync(src, 'utf8');
const between = (s, a, b, from = 0) => {
  const i = s.indexOf(a, from); if (i < 0) throw new Error('missing ' + a);
  const j = s.indexOf(b, i + a.length); if (j < 0) throw new Error('missing ' + b);
  return { start: i, end: j + b.length, inner: s.slice(i + a.length, j) };
};
const title = between(html, '<title>', '</title>').inner;
const icon = html.match(/<link rel="icon"[^>]*>/)[0];
const style = between(html, '<style', '</style>');
const styleTag = html.slice(style.start, style.end);
const scriptOpen = html.indexOf('<script type="module"');
const scriptEnd = html.indexOf('</script>', scriptOpen) + '</script>'.length;
const scriptTag = html.slice(scriptOpen, scriptEnd).replace(/ crossorigin/, '');
const body = between(html, '<body>', '</body>').inner.trim();
if (body.includes('<script')) throw new Error('unexpected script in body');
const page = [
  `<title>${title}</title>`,
  '<meta name="theme-color" content="#0b0c0e">',
  icon,
  styleTag,
  body,
  scriptTag,
  '',
].join('\n');
fs.writeFileSync(out, page);
console.log(`wrote ${out}: ${(page.length / 1024).toFixed(0)} KB, title "${title}" at byte ${page.indexOf('<title>')}`);
