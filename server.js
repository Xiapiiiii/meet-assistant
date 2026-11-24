import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { settings } from './settings.js';
import { WebSocketServer } from 'ws';
import { session } from './session.js';
import { interpret } from './interpret.js';

const manifest = JSON.parse(readFileSync(new URL('./extension/manifest.json', import.meta.url)));
const id = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex')
  .slice(0,32).replace(/./g, c => 'abcdefghijklmnop'[parseInt(c,16)]);
const origin = 'chrome-extension://' + id;
// Only the locally installed, unpacked extension can fetch this private resource.
const tokenFile = new URL('./extension/local-settings-token', import.meta.url);
try {
  writeFileSync(tokenFile,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
const settingsToken = readFileSync(tokenFile,'utf8');
if (!/^[a-f0-9]{64}$/.test(settingsToken)) throw Error('本地设置凭证无效');
const local = settings(new URL('./',import.meta.url));
const httpServer = http.createServer((req, res) => {
  res.writeHead(req.url === '/' ? 200 : 404, {'Content-Type':'text/plain; charset=utf-8'});
  res.end(req.url === '/' ? 'Meet 会议助手已就绪。请从 Google Meet 标签页打开扩展。' : '');
});
const ws = new WebSocketServer({noServer:true, maxPayload:65536});
httpServer.on('upgrade', (req, socket, head) => {
  if (req.headers.origin !== origin || !['/meeting','/interpret','/settings'].includes(req.url) || req.headers.host !== '127.0.0.1:18767') {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return;
  }
  ws.handleUpgrade(req, socket, head, client => {
    try {
      if (req.url === '/settings') {
        client.on('error', () => client.terminate());
        let authenticated = false;
        client.on('message', data => {
          try {
            const msg = JSON.parse(data);
            if (!authenticated) {
              if (msg.token !== settingsToken) return client.close(1008,'Unauthorized');
              authenticated = true;
            } else {
              local.update(msg.changes);
            }
            const {SPEECH_API_KEY = '',ARK_API_KEY = ''} = local.config();
            client.send(JSON.stringify({values:{SPEECH_API_KEY,ARK_API_KEY}}));
          }
          catch { client.send(JSON.stringify({error:'保存失败，请检查密钥格式和目录写入权限'})); }
        });
        return;
      }
      const handler = req.url === '/interpret' ? interpret : session;
      handler(client, local.config());
    } catch {
      client.send(JSON.stringify({type:'error',error:'无法读取本地配置',text:'无法读取本地配置'}));
      client.close();
    }
  });
});
httpServer.on('error', e => { console.error(e.message); process.exit(1); });
httpServer.listen(18767, '127.0.0.1', () => console.log('Meet 助手 http://127.0.0.1:18767'));
