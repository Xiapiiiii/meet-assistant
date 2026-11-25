import WebSocket from 'ws';
import protobuf from 'protobufjs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new protobuf.Root();
root.loadSync(fileURLToPath(new URL('./interpret.proto',import.meta.url)), {keepCase:true});
export const Request = root.lookupType('data.speech.ast.TranslateRequest');
export const Response = root.lookupType('data.speech.ast.TranslateResponse');
const endpoint = 'wss://openspeech.bytedance.com/api/v4/ast/v2/translate';
// Streaming RIFF/WAVE, mono PCM16 at 16 kHz. The live stream has no known length.
const wavHeader = Buffer.from('52494646ffffffff57415645666d74201000000001000100803e0000007d00000200100064617461ffffffff','hex');

export function interpret(client, env, url = endpoint) {
  const fail = text => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({type:'error',text}));
      client.close();
    }
  };
  if (!env.SPEECH_API_KEY) return fail('请在侧栏「API 设置」填写豆包语音 API Key');
  const sessionId = randomUUID();
  const upstream = new WebSocket(url, {handshakeTimeout:8000, headers:{
    'X-Api-Key':env.SPEECH_API_KEY, 'X-Api-Resource-Id':'volc.service_type.10053',
    'X-Api-Request-Id':sessionId
  }});
  let ready = false;
  let firstFrame = true;
  const subtitles = new Map();
  let partialSubtitle = '';
  const timer = setTimeout(() => fail('等待同传会话超时'),15000);
  function send(event, fields = {}) {
    upstream.send(Request.encode({event,request_meta:{SessionID:sessionId},...fields}).finish());
  }
  upstream.on('open', () => {
    const pcm = {format:'pcm',rate:16000,bits:16,channel:1};
    send(100,{user:{uid:'meet-assistant'},source_audio:{...pcm,format:'wav',codec:'raw'},target_audio:pcm,
      request:{mode:'s2s',source_language:'zh',target_language:'en'}});
  });
  upstream.on('error', e => fail(e.message.includes('403')
    ? '同传无权限，请在此语音 Key 的项目中开通「同声传译 2.0」'
    : '连接同传失败：' + e.message));
  upstream.on('message', bytes => {
    if (client.readyState !== WebSocket.OPEN) return;
    try {
      const msg = Response.decode(bytes);
      const segment = msg.start_time + ':' + msg.end_time;
      switch (msg.event) {
        case 150:
          clearTimeout(timer);
          ready = true;
          client.send(JSON.stringify({type:'ready'}));
          break;
        case 653: partialSubtitle = ''; break;
        case 654: partialSubtitle += msg.text; break;
        case 655:
          subtitles.set(segment, (msg.text || partialSubtitle).trim());
          if (subtitles.size > 64) subtitles.delete(subtitles.keys().next().value);
          partialSubtitle = '';
          break;
        case 350:
          client.send(JSON.stringify({type:'spokenCaption',text:subtitles.get(segment) || msg.text || ''}));
          subtitles.delete(segment);
          break;
        case 352:
          if (!ready || !msg.data.length) break;
          if (client.bufferedAmount > 262144) return fail('译音输出积压，请重新开始');
          client.send(msg.data,{binary:true});
          break;
        case 153: fail('同传服务错误：' + (msg.response_meta?.Message || msg.response_meta?.StatusCode)); break;
        case 152: client.close(); break;
      }
    } catch { fail('同传服务返回无效音频消息'); }
  });
  upstream.on('close', () => fail('同传连接已结束'));
  client.on('message',(data,binary) => {
    if (!ready || upstream.readyState !== WebSocket.OPEN) return;
    if (!binary || data.length % 2 || data.length > 6400) return fail('无效的麦克风音频帧');
    if (upstream.bufferedAmount > 128000) return fail('麦克风上传积压，请重新开始');
    const payload = firstFrame ? Buffer.concat([wavHeader,data]) : data;
    firstFrame = false;
    send(200,{source_audio:{binary_data:payload}});
  });
  client.on('error', () => client.terminate());
  client.on('close', () => {
    clearTimeout(timer);
    if (upstream.readyState === WebSocket.OPEN) {
      send(102);
      upstream.close();
    } else if (upstream.readyState === WebSocket.CONNECTING) upstream.terminate();
  });
}
