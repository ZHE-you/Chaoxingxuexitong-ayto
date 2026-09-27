import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourcePath = resolve(root, 'v3_optimized.js');
const userScriptPath = resolve(root, 'v3_optimized.user.js');
const userScript = readFileSync(userScriptPath, 'utf8');
const marker = '// ==/UserScript==\n\n';
const markerIndex = userScript.indexOf(marker);

if (markerIndex < 0) throw new Error('油猴元数据块缺失或格式错误');
const payload = userScript.slice(markerIndex + marker.length);
const source = readFileSync(sourcePath, 'utf8');
if (payload !== source) throw new Error('油猴脚本未由 v3_optimized.js 同步生成');

execFileSync(process.execPath, ['--check', sourcePath], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', userScriptPath], { stdio: 'inherit' });
console.log('V3 source and userscript payload are synchronized and syntactically valid.');
