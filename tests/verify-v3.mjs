import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const target = resolve(root, 'xuexitong.user.js');

execFileSync(process.execPath, ['--check', target], { stdio: 'inherit' });
console.log('xuexitong.user.js 语法校验通过（单文件、控制台 / 油猴通用）。');
