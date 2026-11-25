const toggle = document.getElementById('interpret-toggle');
const status = document.getElementById('interpret-status');
const inputs = document.getElementById('voice-input');
const media = navigator.mediaDevices;
const monitor = document.getElementById('monitor');
const outputs = document.getElementById('monitor-output');
const monitorStatus = document.getElementById('monitor-status');
const spokenCaption = document.getElementById('spoken-caption');
const localMode = document.getElementById('local-mode');
const meetingMode = document.getElementById('meeting-mode');
const modes = document.getElementById('modes');
let session;

function renderMode() {
  const local = localMode.checked;
  document.getElementById('meeting-section').hidden = local;
  document.getElementById('monitor-row').hidden = local;
  toggle.textContent = local ? '开始试音' : '开始同传';
  status.textContent = local ? '' : 'Meet 麦克风请选择 BlackHole 2ch';
  void updateMonitor();
}
localMode.onchange = meetingMode.onchange = renderMode;

function outputChoices(devices) {
  const previous = outputs.value;
  const physical = devices.filter(d => d.kind === 'audiooutput' && d.label &&
    !['default','communications'].includes(d.deviceId) && !/BlackHole|Virtual/i.test(d.label));
  const preferred = devices.find(d => d.kind === 'audiooutput' && d.deviceId === 'default');
  outputs.replaceChildren(...physical.map(d => new Option(d.label,d.deviceId)));
  const choice = physical.find(d => d.deviceId === previous) ||
    physical.find(d => d.groupId && d.groupId === preferred?.groupId) || physical[0];
  if (choice) outputs.value = choice.deviceId;
}

function detachMonitor(s) {
  if (!s.player) return;
  s.player.pause();
  s.player.srcObject = null;
  s.player = null;
}

async function updateMonitor() {
  const s = session;
  const listening = localMode.checked || monitor.checked;
  document.getElementById('monitor-options').hidden = !listening;
  document.getElementById('english-section').hidden = !listening;
  spokenCaption.textContent = listening ? s?.currentCaption || '' : '';
  monitorStatus.textContent = '';
  if (!s?.monitorBus) return;
  detachMonitor(s);
  if (!monitor.checked) return;
  const player = s.player = new Audio();
  try {
    if (!outputs.value || outputs.value === s.output) throw Error('请选择耳机或扬声器');
    await player.setSinkId(outputs.value);
    if (s.player !== player) return;
    player.srcObject = s.monitorBus.stream;
    await player.play();
  } catch (err) {
    if (s.player !== player) return;
    detachMonitor(s);
    monitorStatus.textContent = '本机监听未启动：' + err.message;
  }
}
monitor.onchange = outputs.onchange = updateMonitor;

function stop(s, message) {
  if (session !== s) return;
  session = null;
  for (const timer of s.captionTimers) clearTimeout(timer);
  detachMonitor(s);
  s.monitorBus?.stream.getTracks().forEach(t => t.stop());
  monitorStatus.textContent = '';
  s.stream?.getTracks().forEach(track => track.stop());
  s.socket?.close();
  s.nodes.forEach(node => node.stop());
  if (s.audio) void s.audio.close().catch(() => {});
  inputs.disabled = false;
  outputs.disabled = false;
  modes.disabled = false;
  toggle.textContent = s.local ? '开始试音' : '开始同传';
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
  if (s.audio.sinkId !== s.output) throw new Error('播放设备已切换');
  const samples = new Int16Array(bytes);
  const buffer = s.audio.createBuffer(1,samples.length,16000);
  const floats = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) floats[i] = samples[i] / 32768;
  const when = Math.max(s.next, s.audio.currentTime + 0.015);
  if (when - s.audio.currentTime > 12) throw new Error('译音积压，请重新开始同传');
  const node = s.audio.createBufferSource();
  node.buffer = buffer;
  node.connect(s.audio.destination);
  if (s.monitorBus) node.connect(s.monitorBus);
  s.nodes.add(node);
  node.onended = () => { s.nodes.delete(node); node.disconnect(); };
  node.start(when);
  if (s.nextCaption !== undefined) {
    const text = s.nextCaption;
    s.nextCaption = undefined;
    const timer = setTimeout(() => {
      s.captionTimers.delete(timer);
      if (session !== s) return;
      s.currentCaption = text;
      if (s.local || monitor.checked) spokenCaption.textContent = text;
    }, Math.max(0,(when - s.audio.currentTime) * 1000));
    s.captionTimers.add(timer);
  }
  s.next = when + buffer.duration;
}

async function start() {
  const s = {local:localMode.checked,nodes:new Set(),captionTimers:new Set(),next:0,ready:false};
  session = s;
  spokenCaption.textContent = '';
  toggle.textContent = s.local ? '停止试音' : '停止同传';
  toggle.setAttribute('aria-pressed','true');
  inputs.disabled = true;
  modes.disabled = true;
  outputs.disabled = s.local;
  status.textContent = '正在检查音频设备';
  try {
    if (!s.local) {
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      if (!tab?.url?.startsWith('https://meet.google.com/')) throw new Error('请打开 Google Meet，或切换到「本地试音」');
      s.tab = tab.id;
    }
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
    outputChoices(devices);
    const mic = choices.find(d => d.deviceId === inputs.value) || choices[0];
    s.output = s.local ? outputs.value : blackHole(devices)?.deviceId;
    if (!s.output) throw new Error(s.local ? '未找到可用的耳机或扬声器' : '找不到 BlackHole 2ch，请安装驱动并重新打开 Chrome');
    if (!mic) throw new Error('未找到可用的原声麦克风');
    inputs.value = mic.deviceId;
    s.stream = await media.getUserMedia({audio:{deviceId:{exact:mic.deviceId},
      echoCancellation:true,channelCount:1}});
    if (session !== s) { s.stream.getTracks().forEach(t => t.stop()); return; }
    s.stream.getAudioTracks()[0].onended = () => stop(s,'麦克风已断开');
    s.audio = new AudioContext({sinkId:{type:'none'}});
    await s.audio.setSinkId(s.output);
    if (session !== s) return;
    if (s.audio.sinkId !== s.output) throw new Error('无法连接所选播放设备');
    s.audio.onsinkchange = () => {
      if (s.audio.sinkId !== s.output) stop(s,'播放设备已切换');
    };
    await s.audio.resume();
    await s.audio.audioWorklet.addModule('pcm.js');
    if (session !== s) return;
    if (!s.local) s.monitorBus = s.audio.createMediaStreamDestination();
    void updateMonitor();
    const capture = new AudioWorkletNode(s.audio,'pcm16',{channelCount:1,channelCountMode:'explicit',
      processorOptions:{frameSize:1280}});
    s.audio.createMediaStreamSource(s.stream).connect(capture);
    capture.connect(s.audio.destination); // The worklet output is silent.
    status.textContent = '正在连接同传服务';
    const socket = s.socket = new WebSocket('ws://127.0.0.1:18767/interpret');
    socket.binaryType = 'arraybuffer';
    socket.onmessage = ({data}) => {
      if (session !== s) return;
      try {
        if (data instanceof ArrayBuffer) return play(s,data);
        const msg = JSON.parse(data);
        if (msg.type === 'spokenCaption') { s.nextCaption = msg.text; return; }
        if (msg.type === 'error') return stop(s,msg.text);
        if (msg.type === 'ready') {
          s.ready = true;
          status.textContent = s.local ? '试音中 · 正在听你说中文' : '同传中 · 英文输出到 BlackHole 2ch';
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

toggle.onclick = () => session ? stop(session,session.local ? '试音已停止' : '同传已停止') : start();
chrome.tabs.onRemoved.addListener(id => { if (session?.tab === id) stop(session,'会议已关闭'); });
chrome.tabs.onUpdated.addListener((id,change) => {
  if (session?.tab === id && (change.url || change.status === 'loading')) stop(session,'会议页面已切换');
});
window.addEventListener('pagehide', () => { if (session) stop(session,'同传已停止'); });
media.addEventListener('devicechange',async () => {
  const s = session;
  const devices = await media.enumerateDevices();
  if (s !== session) return;
  const oldOutput = outputs.value;
  outputChoices(devices);
  if (!s?.local && oldOutput && outputs.value !== oldOutput && monitor.checked) {
    monitor.checked = false;
    void updateMonitor();
    monitorStatus.textContent = '监听设备已断开';
  }
  if (s?.output && !devices.some(d => d.deviceId === s.output)) stop(s,'播放设备已断开');
  if (!session) microphones(devices);
});
void media.enumerateDevices().then(devices => {
  if (!session) { microphones(devices); outputChoices(devices); }
}).catch(() => {});
