const $ = id => document.getElementById(id);
const fields = {speech:'SPEECH_API_KEY',ark:'ARK_API_KEY'};
const socket = new WebSocket('ws://127.0.0.1:18767/settings');
const clear = new Set();
let ready = false;
for (const id of Object.keys(fields)) {
  $(id+'-clear').onclick = () => {
    clear.add(id);
    $(id).value = '';
    $(id+'-state').textContent = '保存后清除';
  };
  $(id).oninput = () => {
    clear.delete(id);
    $(id+'-state').textContent = $(id).value ? '保存后替换' : '保留原配置';
  };
}
socket.onmessage = ({data}) => {
  const msg = JSON.parse(data);
  $('save').disabled = false;
  if (msg.error) { $('message').textContent = msg.error; return; }
  for (const [id,key] of Object.entries(fields)) {
    $(id).value = '';
    $(id+'-state').textContent = msg.status[key] ? '已配置' : '未配置';
  }
  clear.clear();
  $('message').textContent = ready ? '已保存，下次开始监听或同传时生效。' : '';
  ready = true;
};
socket.onclose = () => {
  $('save').disabled = true;
  $('message').textContent = '无法连接本地代理。请运行 npm start 后刷新此页。';
};
$('settings').onsubmit = e => {
  e.preventDefault();
  if (socket.readyState !== WebSocket.OPEN) return;
  const changes = {};
  for (const [id,key] of Object.entries(fields)) {
    if (clear.has(id)) changes[key] = '';
    else if ($(id).value.trim()) changes[key] = $(id).value.trim();
  }
  $('save').disabled = true;
  socket.send(JSON.stringify(changes));
};
