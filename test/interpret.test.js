import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import WebSocket,{WebSocketServer} from 'ws';
import {interpret,Request,Response} from '../interpret.js';

test('interpretation routes translated PCM and matches English subtitles to playback order', {timeout:5000}, async t => {
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
        if (++frames === 2) {
          const emit = (event,fields) => ws.send(Response.encode({event,...fields}).finish());
          emit(652,{text:'中文原声'});
          emit(653,{});
          emit(654,{text:'draft'});
          emit(655,{start_time:10,end_time:70,text:'First sentence.'});
          emit(653,{});
          emit(654,{text:'Second'});
          emit(654,{text:' sentence.'});
          emit(655,{start_time:80,end_time:100});
          emit(350,{start_time:10,end_time:70});
          emit(352,{data:translation});
          emit(350,{start_time:80,end_time:100});
          emit(352,{data:translation});
        }
      } else if (msg.event === 102) finished();
    });
  });
  proxy.on('connection',ws => interpret(ws,{SPEECH_API_KEY:'local-test'},url(speech)));
  const client = new WebSocket(url(proxy));
  const received = [];
  client.on('message',(payload,binary) => {
    if (binary) {
      assert.deepEqual(payload,translation);
      received.push('PCM');
      if (received.length === 4) client.close();
    } else {
      const msg = JSON.parse(payload);
      if (msg.type === 'spokenCaption') { received.push(msg.text); return; }
      assert.equal(msg.type,'ready');
      client.send(samples);
      client.send(samples);
    }
  });
  await done;
  assert.deepEqual(received,['First sentence.','PCM','Second sentence.','PCM']);
});
