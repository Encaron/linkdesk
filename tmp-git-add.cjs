const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getAllFiles(dir) {
  const result = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(e.parentPath || dir, e.name);
      if (e.isFile()) result.push(full);
      else if (e.isDirectory()) result.push(...getAllFiles(full));
    }
  } catch(e) { console.log('Error reading:', dir, e.message); }
  return result;
}

const docs04 = path.join('e:', 'linkdesk', 'linkdesk', 'docs', '04-出厂制造');
const docs05 = path.join('e:', 'linkdesk', 'linkdesk', 'docs', '05-版本更新');

console.log('Reading', docs04);
const files04 = getAllFiles(docs04);
console.log('Reading', docs05);
const files05 = getAllFiles(docs05);
const all = [...files04, ...files05];
console.log('Found', all.length, 'files');

let ok = 0, fail = 0;
for (const f of all) {
  const rel = path.relative('e:/linkdesk', f).split(path.sep).join('/');
  try {
    execSync('git', ['add', rel], { cwd: 'e:/linkdesk', stdio: 'pipe' });
    ok++;
  } catch(e) {
    console.log('FAIL:', rel, e.stderr ? e.stderr.toString().trim() : e.message);
    fail++;
  }
}
console.log('Added:', ok, 'Failed:', fail);
