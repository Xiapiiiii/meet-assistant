const $ = id => document.getElementById(id);
if (window.parent !== window) document.body.classList.add('embedded');
const fields = {speech:'SPEECH_API_KEY',ark:'ARK_API_KEY'};
const socket = new WebSocket('ws://127.0.0.1:18767/settings');
let saved;
function refreshQuota() {
  if (!saved || socket.readyState !== WebSocket.OPEN) return;
  $('refresh').disabled = true;
  $('checked').textContent = '查询中…';
  socket.send(JSON.stringify({type:'quota'}));
}
$('refresh').onclick = refreshQuota;

function editable(enabled) {
  $('save').disabled = !enabled;
  for (const id of Object.keys(fields)) {
    $(id).disabled = !enabled;
    $(id+'-eye').disabled = !enabled;
  }
}
for (const id of Object.keys(fields)) {
  const eye = $(id+'-eye');
  eye.onclick = () => {
    const show = $(id).type === 'password';
    $(id).type = show ? 'text' : 'password';
    const action = show ? '隐藏' : '显示';
    eye.title = action + (id === 'speech' ? '豆包语音' : '火山方舟') + '密钥';
    eye.setAttribute('aria-label',eye.title);
    eye.querySelector('img').src = show ? 'icons/eye-off.svg' : 'icons/eye.svg';
  };
}
socket.onopen = async () => {
  try {
    const res = await fetch(chrome.runtime.getURL('local-settings-token'),{cache:'no-store'});
    if (!res.ok) throw Error();
    socket.send(JSON.stringify({token:await res.text()}));
  } catch { socket.close(); }
};
socket.onmessage = ({data}) => {
  const msg = JSON.parse(data);
  if (msg.quota) {
    for (const id of Object.keys(fields)) {
      const rows = msg.quota[id].map(({text,low}) => {
        const line = document.createElement('p');
        line.textContent = low ? '额度偏低 · ' + text : text;
        if (low) line.className = 'low-quota';
        return line;
      });
      $(id+'-quota').replaceChildren(...rows);
    }
    $('refresh').disabled = false;
    $('checked').textContent = new Date(msg.quota.checkedAt).toLocaleTimeString() + ' 查询';
    return;
  }
  if (!msg.values) {
    $('message').textContent = msg.error || '请重启新版代理，并重新加载扩展。';
    editable(Boolean(saved));
    return;
  }
  $('message').textContent = saved ? '已保存，下次开始监听或同传时生效。' : '';
  saved = msg.values;
  for (const [id,key] of Object.entries(fields)) $(id).value = saved[key];
  editable(true);
  refreshQuota();
};
socket.onclose = () => {
  $('refresh').disabled = true;
  $('checked').textContent = '已断开';
  editable(false);
  $('message').textContent = '无法连接设置服务，请从本项目运行 npm start 并重新加载扩展。';
};
$('settings').onsubmit = e => {
  e.preventDefault();
  if (!saved || socket.readyState !== WebSocket.OPEN) return;
  const changes = {};
  for (const [id,key] of Object.entries(fields)) {
    const value = $(id).value.trim();
    if (value !== saved[key]) changes[key] = value;
  }
  editable(false);
  socket.send(JSON.stringify({changes}));
};
