import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { settings } from './settings.js';
import { WebSocketServer } from 'ws';
import { session } from './session.js';
import { interpret } from './interpret.js';

const manifest = JSON.parse(readFileSync(new URL('./extension/manifest.json', import.meta.url)));
const id = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex')
  .slice(0,32).replace(/./g, c => 'abcdefghijklmnop'[parseInt(c,16)]);
const origin = 'chrome-extension://' + id;
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
        client.send(JSON.stringify({status:local.status()}));
        client.on('message', data => {
          try { client.send(JSON.stringify({status:local.update(JSON.parse(data))})); }
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
