import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import WebSocket,{WebSocketServer} from 'ws';
import {interpret,Request,Response} from '../interpret.js';

test('interpretation uses a single WAV stream and routes only translated PCM back', {timeout:5000}, async t => {
  const speech = new WebSocketServer({host:'127.0.0.1',port:0});
  const proxy = new WebSocketServer({host:'127.0.0.1',port:0});
  await Promise.all([once(speech,'listening'),once(proxy,'listening')]);
  t.after(() => {speech.close();proxy.close();});
  const url = server => 'ws://127.0.0.1:' + server.address().port;
  const samples = Buffer.alloc(2560,1);
  const translation = Buffer.from([0,0,1,0,2,0]);
  let frames = 0;
  let finished;
  const done = new Promise(resolve => {finished=resolve;});
  speech.on('connection',(ws,req) => {
    assert.equal(req.headers['x-api-resource-id'],'volc.service_type.10053');
    ws.on('message',payload => {
      const msg = Request.decode(payload);
      assert.ok(msg.request_meta.SessionID);
      if (msg.event === 100) {
        assert.equal(msg.request.source_language,'zh');
        assert.equal(msg.request.target_language,'en');
        assert.equal(msg.request.mode,'s2s');
        assert.equal(msg.request.speaker_id,'');
        assert.equal(msg.source_audio.format,'wav');
        assert.equal(msg.target_audio.rate,16000);
        ws.send(Response.encode({event:150}).finish());
      } else if (msg.event === 200) {
        const data = msg.source_audio.binary_data;
        if (!frames) assert.equal(data.toString('ascii',0,4),'RIFF');
        assert.deepEqual(data.subarray(frames ? 0 : 44),samples);
        if (++frames === 2) ws.send(Response.encode({event:352,data:translation}).finish());
      } else if (msg.event === 102) finished();
    });
  });
  proxy.on('connection',ws => interpret(ws,{SPEECH_API_KEY:'local-test'},url(speech)));
  const client = new WebSocket(url(proxy));
  client.on('message',(payload,binary) => {
    if (binary) {
      assert.deepEqual(payload,translation);
      client.close();
    } else {
      assert.equal(JSON.parse(payload).type,'ready');
      client.send(samples);
      client.send(samples);
    }
  });
  await done;
});
