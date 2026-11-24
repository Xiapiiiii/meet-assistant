import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import WebSocket, {WebSocketServer} from 'ws';
import {session} from '../session.js';

function response(text, definite, last = false, endTime = 900) {
  const body = gzipSync(JSON.stringify({result:{utterances:[{text,definite,end_time:endTime}]}}));
  const header = Buffer.from([0x11,last ? 0x93 : 0x91,0x11,0,0,0,0,0,0,0,0,0]);
  header.writeInt32BE(last ? -1 : 1,4);
  header.writeUInt32BE(body.length,8);
  return Buffer.concat([header,body]);
}
test('speech frames, transcript revisions, paired Chinese translations and graceful stop', {timeout:5000}, async t => {
  const text = 'Can we test on Friday?';
  const followup = 'At what time?';
  const translations = new Map([[text,'周五可以测试吗？'],[followup,'几点开始？']]);
  const ark = http.createServer(async (req,res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    assert.equal(req.headers.authorization,'Bearer fake-ark');
    const source = JSON.parse(body).messages[1].content;
    assert.ok(translations.has(source));
    if (source === text) await new Promise(resolve => setTimeout(resolve,100));
    const content = translations.get(source);
    res.end(JSON.stringify({choices:[{message:{content}}]}));
  });
  ark.listen(0,'127.0.0.1');
  await once(ark,'listening');
  const speech = new WebSocketServer({port:0,host:'127.0.0.1'});
  const proxy = new WebSocketServer({port:0,host:'127.0.0.1'});
  await Promise.all([once(proxy,'listening'),once(speech,'listening')]);
  t.after(() => {proxy.close(); speech.close(); ark.close();});
  const url = srv => 'ws://127.0.0.1:' + srv.address().port;
  speech.on('connection',(sock,req) => {
    assert.equal(req.headers['x-api-key'],'fake-speech');
    sock.on('message',buf => {
      assert.equal(buf.readUInt32BE(4),buf.length-8);
      const payload = gunzipSync(buf.subarray(8));
      if (buf[1] === 0x10) assert.equal(JSON.parse(payload).audio.rate,16000);
      else if (buf[1] === 0x20) {
        assert.equal(payload.length,6400);
        sock.send(response('周五',false));
        sock.send(response(text,true));
        sock.send(response(text,true));
        sock.send(response(followup,true,false,1900));
      } else {
        assert.equal(buf[1],0x22);
        sock.send(response(text,true,true));
      }
    });
  });
  proxy.on('connection',c => session(c,{SPEECH_API_KEY:'fake-speech',ARK_API_KEY:'fake-ark',ARK_MODEL:'test'},{
    speech:url(speech),ark:'http://127.0.0.1:' + ark.address().port
  }));
  const client = new WebSocket(url(proxy));
  const events = [];
  client.on('message',buf => {
    const msg = JSON.parse(buf);
    events.push(msg.type);
    if (msg.type === 'ready') client.send(Buffer.alloc(6400));
    if (msg.type === 'final' && msg.id === 1900) client.send(JSON.stringify({type:'stop'}));
    if (msg.type === 'translation') {
      assert.equal(msg.text,translations.get(msg.id === 900 ? text : followup));
    }
  });
  await once(client,'close');
  assert.deepEqual(events,['ready','partial','final','final','translation','translation']);
});

test('worklet downmix input converts to 200 ms PCM and flushes the remaining tail', () => {
  let Processor;
  vm.runInNewContext(readFileSync(new URL('../extension/pcm.js',import.meta.url),'utf8'),{
    sampleRate:48000,AudioWorkletProcessor:class { port = {}; },
    registerProcessor:(name,ctor) => { Processor = ctor; }
  });
  const node = new Processor();
  const packets = [];
  node.port.postMessage = data => packets.push(data);
  for (let i = 0; i < 78; i++) node.process([[new Float32Array(128).fill(0.5)]]);
  node.port.onmessage();
  assert.deepEqual(packets.map(p => p.byteLength ?? p),[6400,256,'flushed']);
  assert.equal(new Int16Array(packets[0])[0],16384);
});
