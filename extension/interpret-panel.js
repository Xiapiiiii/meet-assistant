const toggle = document.getElementById('interpret-toggle');
const status = document.getElementById('interpret-status');
const inputs = document.getElementById('voice-input');
const media = navigator.mediaDevices;
let session;

function stop(s, message) {
  if (session !== s) return;
  session = null;
  s.stream?.getTracks().forEach(track => track.stop());
  s.socket?.close();
  s.nodes.forEach(node => node.stop());
  if (s.audio) void s.audio.close().catch(() => {});
  inputs.disabled = false;
  toggle.textContent = '开始同传';
  toggle.setAttribute('aria-pressed','false');
  status.textContent = message;
}

function microphones(devices) {
  const previous = inputs.value;
  const choices = devices.filter(d => d.kind === 'audioinput' && d.label &&
    !['default','communications'].includes(d.deviceId) && !/BlackHole/i.test(d.label));
  inputs.replaceChildren(new Option('自动选择',''));
  for (const mic of choices) inputs.add(new Option(mic.label,mic.deviceId));
  if (choices.some(d => d.deviceId === previous)) inputs.value = previous;
  return choices;
}

function blackHole(devices) {
  return devices.find(d => d.kind === 'audiooutput' && !['default','communications'].includes(d.deviceId)
    && /BlackHole\s+2ch/i.test(d.label));
}

function play(s, bytes) {
  if (!bytes.byteLength || bytes.byteLength % 2) throw new Error('同传服务返回无效 PCM');
  if (s.audio.sinkId !== s.output) throw new Error('BlackHole 输出已切换');
  const samples = new Int16Array(bytes);
  const buffer = s.audio.createBuffer(1,samples.length,16000);
  const floats = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) floats[i] = samples[i] / 32768;
  const when = Math.max(s.next, s.audio.currentTime + 0.015);
  if (when - s.audio.currentTime > 12) throw new Error('译音积压，请重新开始同传');
  const node = s.audio.createBufferSource();
  node.buffer = buffer;
  node.connect(s.audio.destination);
  s.nodes.add(node);
  node.onended = () => { s.nodes.delete(node); node.disconnect(); };
  node.start(when);
  s.next = when + buffer.duration;
}

async function start() {
  const s = {nodes:new Set(),next:0,ready:false};
  session = s;
  toggle.textContent = '停止同传';
  toggle.setAttribute('aria-pressed','true');
  inputs.disabled = true;
  status.textContent = '正在检查麦克风和 BlackHole';
  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab?.url?.startsWith('https://meet.google.com/')) throw new Error('请先打开 Google Meet');
    s.tab = tab.id;
    if (session !== s) return;
    let devices = await media.enumerateDevices();
    if (!devices.some(d => d.kind === 'audioinput' && d.label)) {
      if (session !== s) return;
      const permission = await media.getUserMedia({audio:true});
      permission.getTracks().forEach(track => track.stop());
      devices = await media.enumerateDevices();
    }
    if (session !== s) return;
    const choices = microphones(devices);
    const mic = choices.find(d => d.deviceId === inputs.value) || choices[0];
    const output = blackHole(devices);
    if (!output) throw new Error('找不到 BlackHole 2ch，请安装驱动并重新打开 Chrome');
    if (!mic) throw new Error('未找到可用的原声麦克风');
    s.output = output.deviceId;
    inputs.value = mic.deviceId;
    s.stream = await media.getUserMedia({audio:{deviceId:{exact:mic.deviceId},
      echoCancellation:true,channelCount:1}});
    if (session !== s) { s.stream.getTracks().forEach(t => t.stop()); return; }
    s.stream.getAudioTracks()[0].onended = () => stop(s,'麦克风已断开');
    s.audio = new AudioContext({sinkId:{type:'none'}});
    await s.audio.setSinkId(s.output);
    if (session !== s) return;
    if (s.audio.sinkId !== s.output) throw new Error('无法连接 BlackHole 2ch');
    s.audio.onsinkchange = () => {
      if (s.audio.sinkId !== s.output) stop(s,'BlackHole 输出已切换');
    };
    await s.audio.resume();
    await s.audio.audioWorklet.addModule('pcm.js');
    if (session !== s) return;
    const capture = new AudioWorkletNode(s.audio,'pcm16',{channelCount:1,channelCountMode:'explicit',
      processorOptions:{frameSize:1280}});
    s.audio.createMediaStreamSource(s.stream).connect(capture);
    capture.connect(s.audio.destination); // Only the silent worklet output reaches BlackHole.
    status.textContent = '正在连接同传服务';
    const socket = s.socket = new WebSocket('ws://127.0.0.1:18767/interpret');
    socket.binaryType = 'arraybuffer';
    socket.onmessage = ({data}) => {
      if (session !== s) return;
      try {
        if (data instanceof ArrayBuffer) return play(s,data);
        const msg = JSON.parse(data);
        if (msg.type === 'error') return stop(s,msg.text);
        if (msg.type === 'ready') {
          s.ready = true;
          status.textContent = '同传中 · 英文输出到 BlackHole 2ch';
        }
      } catch (e) { stop(s,e.message); }
    };
    capture.port.onmessage = ({data}) => {
      if (session !== s || !s.ready || socket.readyState !== WebSocket.OPEN) return;
      if (socket.bufferedAmount > 128000) return stop(s,'麦克风上传积压，请重新开始');
      socket.send(data);
    };
    socket.onerror = () => stop(s,'无法连接同传代理，请启动新版服务');
    socket.onclose = () => stop(s,'同传连接已断开');
  } catch (e) {
    stop(s,e.name === 'NotAllowedError' ? '请在 Chrome 和系统设置中允许使用麦克风' : e.message);
  }
}

toggle.onclick = () => session ? stop(session,'同传已停止') : start();
chrome.tabs.onRemoved.addListener(id => { if (session?.tab === id) stop(session,'会议已关闭'); });
chrome.tabs.onUpdated.addListener((id,change) => {
  if (session?.tab === id && (change.url || change.status === 'loading')) stop(session,'会议页面已切换');
});
window.addEventListener('pagehide', () => { if (session) stop(session,'同传已停止'); });
media.addEventListener('devicechange',async () => {
  const s = session;
  const devices = await media.enumerateDevices();
  if (s?.output && !devices.some(d => d.deviceId === s.output)) stop(s,'BlackHole 已断开');
  if (!session) microphones(devices);
});
void media.enumerateDevices().then(devices => { if (!session) microphones(devices); }).catch(() => {});
