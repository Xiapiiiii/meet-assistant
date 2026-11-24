import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';

const keys = ['SPEECH_API_KEY', 'ARK_API_KEY'];
export function settings(directory) {
  const file = new URL('.meet-settings.json', directory);
  const envFile = new URL('.env', directory);
  const saved = () => existsSync(file) ? JSON.parse(readFileSync(file,'utf8')) : {};
  function config() {
    const local = existsSync(envFile) ? parseEnv(readFileSync(envFile,'utf8')) : {};
    return {ARK_MODEL:'doubao-seed-2-1-pro-260915', ...local, ...process.env, ...saved()};
  }
  function status() {
    const values = config();
    return Object.fromEntries(keys.map(key => [key,Boolean(values[key]?.trim())]));
  }
  function update(changes) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw Error('无效配置');
    const next = saved();
    for (const [key,value] of Object.entries(changes)) {
      if (!keys.includes(key) || typeof value !== 'string' || !/^[\x21-\x7e]{0,1024}$/.test(value)) throw Error('无效密钥');
      next[key] = value;
    }
    const tmp = new URL('.meet-settings.' + randomUUID() + '.tmp', directory);
    try {
      writeFileSync(tmp,JSON.stringify(next),{flag:'wx',mode:0o600});
      renameSync(tmp,file);
    } finally { rmSync(tmp,{force:true}); }
    return status();
  }
  return {config,status,update};
}
