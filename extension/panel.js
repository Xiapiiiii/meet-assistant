const $ = id => document.getElementById(id);
let current;
$('api-settings').onclick = () => chrome.runtime.openOptionsPage();
function release(s) {
  s.stream?.getTracks().forEach(track => track.stop());
  if (s.audio && s.audio.state !== 'closed') void s.audio.close().catch(() => {});
}
function finish(s, message) {
  if (current !== s) return;
  current = null;
  clearTimeout(s.timer);
  release(s);
  s.socket?.close();
  $('status').textContent = message;
  $('toggle').disabled = false;
  $('toggle').textContent = '开始监听';
  for (const node of $('lines').querySelectorAll('.pending')) {
    node.textContent = '翻译未完成';
    node.classList.remove('pending');
  }
  $('partial').textContent = '';
}
function stop(s) {
  if (!s.ready || !s.node) return finish(s,'已停止');
  s.ending = true;
  $('toggle').disabled = true;
  $('status').textContent = '正在结束转写';
  s.node.port.postMessage('flush');
  s.timer = setTimeout(() => finish(s,'已停止'),30000);
}
function onEvent(s, msg) {
  const list = $('captions');
  const followLatest = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
  switch (msg.type) {
    case 'error': return finish(s,msg.text);
    case 'ready':
      s.ready = true;
      $('status').textContent = '正在监听 Meet 标签页';
      break;
    case 'final': {
      $('partial').textContent = '';
      const row = document.createElement('div');
      row.className = 'caption';
      const source = document.createElement('p');
      source.dir = 'auto';
      source.textContent = msg.text;
      const translation = document.createElement('p');
      translation.id = 'zh-' + msg.id;
      translation.className = 'translation pending';
      translation.textContent = '翻译中…';
      row.append(source, translation);
      $('lines').append(row);
      if ($('lines').childElementCount > 64) $('lines').firstChild.remove();
      break;
    }
    case 'partial': $('partial').textContent = msg.text; break;
    case 'translation': {
      const line = $('zh-' + msg.id);
      if (line) {
        line.textContent = msg.text;
        line.classList.remove('pending');
      }
      break;
    }
  }
  if (followLatest) $('captions').scrollTop = $('captions').scrollHeight;
}
async function start() {
  const s = {ready:false, ending:false};
  current = s;
  $('toggle').textContent = '停止';
  $('status').textContent = '正在连接';
  $('lines').replaceChildren();
  $('partial').textContent = '';
  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab?.url?.startsWith('https://meet.google.com/')) throw new Error('请在 Google Meet 标签页点扩展图标后开始');
    s.tab = tab.id;
    if (current !== s) return;
    $('status').textContent = '请选择 Meet 标签页并勾选「共享标签页音频」';
    // Chrome requires a video track to open the display picker, even for tab audio.
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {displaySurface:'browser'},
      audio: {suppressLocalAudioPlayback:false},
      systemAudio:'exclude', monitorTypeSurfaces:'exclude', surfaceSwitching:'exclude'
    });
    s.stream = stream;
    if (current !== s) return release(s);
    const [video] = stream.getVideoTracks();
    if (video?.getSettings().displaySurface !== 'browser') throw new Error('请选择 Chrome 标签页并选中 Google Meet');
    const [track] = stream.getAudioTracks();
    if (!track) throw new Error('未收到标签页音频，请重新选择 Meet 并勾选「共享标签页音频」');
    video.stop();
    track.onended = () => finish(s,'会议音频已结束');
    $('status').textContent = '正在连接语音服务';
    const audio = s.audio = new AudioContext();
    const source = audio.createMediaStreamSource(stream);
    await audio.resume();
    await audio.audioWorklet.addModule('pcm.js');
    if (current !== s) return;
    const node = s.node = new AudioWorkletNode(audio,'pcm16',{channelCount:1,channelCountMode:'explicit'});
    source.connect(node);
    node.connect(audio.destination); // Silent worklet output; Chrome plays the original tab.
    const socket = s.socket = new WebSocket('ws://127.0.0.1:18767/meeting');
    socket.onmessage = e => { if (current === s) onEvent(s,JSON.parse(e.data)); };
    socket.onerror = () => finish(s,'无法连接本地服务，请先运行 npm start');
    socket.onclose = () => finish(s,s.ending ? '已停止' : '连接已断开，请重新开始');
    node.port.onmessage = ({data}) => {
      if (current !== s || !s.ready || socket.readyState !== WebSocket.OPEN) return;
      if (data === 'flushed') {
        socket.send(JSON.stringify({type:'stop'}));
        release(s);
      } else if (socket.bufferedAmount > 128000) {
        finish(s,'本地音频连接积压，请重新开始');
      } else socket.send(data);
    };
  } catch (e) {
    finish(s,e.name === 'NotAllowedError' ? 'Chrome 未授予共享权限或已取消选择，请重新开始并选择 Meet 标签页' : e.message);
  }
}
$('toggle').onclick = () => current ? stop(current) : start();
chrome.tabs.onRemoved.addListener(id => { if (id === current?.tab) finish(current,'会议标签页已关闭'); });
chrome.tabs.onUpdated.addListener((id,change) => {
  if (id === current?.tab && (change.status === 'loading' || change.url)) finish(current,'会议页面已切换');
});
window.addEventListener('pagehide', () => { if (current) finish(current,'已停止'); });
