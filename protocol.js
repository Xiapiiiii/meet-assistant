import { gunzipSync, gzipSync } from 'node:zlib';

function frame(typeFlags, encoding, data) {
  const body = gzipSync(data);
  const header = Buffer.from([0x11, typeFlags, encoding | 1, 0, 0, 0, 0, 0]);
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

export function configFrame() {
  return frame(0x10, 0x10, Buffer.from(JSON.stringify({
    user: { uid: 'meet-assistant' },
    audio: { format: 'pcm', codec: 'raw', rate: 16000, bits: 16, channel: 1 },
    request: { model_name: 'bigmodel', show_utterances: true, result_type: 'single',
      enable_punc: true, enable_nonstream: true, end_window_size: 800 }
  })));
}

export function audioFrame(bytes, last = false) {
  return frame(last ? 0x22 : 0x20, 0, bytes);
}

export function parseResponse(packet) {
  const type = packet[1] >> 4;
  const flags = packet[1] & 15;
  let offset = (packet[0] & 15) * 4;
  if (type === 15) throw new Error('语音服务错误 ' + packet.readUInt32BE(offset));
  if (type !== 9 || offset < 4) throw new Error('语音服务返回未知帧');
  if (flags & 1) offset += 4;
  const length = packet.readUInt32BE(offset);
  let body = packet.subarray(offset + 4);
  if (body.length !== length) throw new Error('语音服务返回不完整的帧');
  if ((packet[2] & 15) === 1) body = gunzipSync(body);
  return { last: Boolean(flags & 2), data: JSON.parse(body.toString()) };
}
