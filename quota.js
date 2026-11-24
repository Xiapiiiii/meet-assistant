import {createHash,createHmac} from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const hmac = (key,value) => createHmac('sha256',key).update(value).digest();
const region = 'cn-beijing';

async function query(credentials, service, action, version, params) {
  const host = service === 'ark' ? 'ark.cn-beijing.volcengineapi.com' : 'open.volcengineapi.com';
  const method = params ? 'POST' : 'GET';
  const body = params ? JSON.stringify(params) : '';
  const date = new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const day = date.slice(0,8);
  const search = new URLSearchParams({Action:action,Version:version}).toString();
  const digest = hash(body);
  const names = 'host;x-content-sha256;x-date';
  const canonical = [method,'/',search,`host:${host}\nx-content-sha256:${digest}\nx-date:${date}\n`,names,digest].join('\n');
  const scope = [day,region,service,'request'].join('/');
  const signingKey = hmac(hmac(hmac(hmac(credentials.sk,day),region),service),'request');
  const signature = hmac(signingKey,['HMAC-SHA256',date,scope,hash(canonical)].join('\n')).toString('hex');
  const res = await fetch('https://' + host + '/?' + search,{
    method,body:params ? body : undefined,redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{'Content-Type':'application/json','X-Date':date,'X-Content-Sha256':digest,
      Authorization:`HMAC-SHA256 Credential=${credentials.ak}/${scope}, SignedHeaders=${names}, Signature=${signature}`}
  });
  const data = await res.json();
  if (!res.ok || data.ResponseMetadata?.Error || !data.Result) {
    throw new Error(data.ResponseMetadata?.Error?.Code || 'HTTP ' + res.status);
  }
  return data.Result;
}

function remaining(label,total,used,unit) {
  if (![total,used].every(n=>typeof n === 'number' && Number.isFinite(n) && n >= 0) || !unit) {
    return {text:label + '：暂无余量数据'};
  }
  const left = Math.max(0,total-used);
  return {text:label + '：剩 ' + left.toLocaleString('zh-CN') + ' / ' + total.toLocaleString('zh-CN') + ' ' + unit,
    low:total > 0 && left <= total * 0.1};
}

export async function quotas(env, read = query) {
  async function safe(label, fn) {
    try { return await fn(); }
    catch (e) { return [{text:label + '查询失败（' + e.message + '）'}]; }
  }
  async function forKey(kind) {
    if (!env[kind+'_API_KEY']) return [{text:'尚未配置服务 Key'}];
    const ak = env[kind+'_QUOTA_AK'] || env.QUOTA_AK;
    const sk = env[kind+'_QUOTA_AK'] ? env[kind+'_QUOTA_SK'] : env.QUOTA_SK;
    if (!ak || !sk) return [{text:'未配置额度查询 AK/SK，可从控制台查看'}];
    const creds = {ak,sk};
    const cash = safe('可用余额',async () => {
      const result = await read(creds,'billing','QueryBalanceAcct','2022-01-01');
      const amount = result.AvailableBalance;
      if (amount == null || !String(amount).trim() || !Number.isFinite(Number(amount))) throw Error('无余额数据');
      return [{text:'查询账号可用余额：¥' + amount,low:Number(amount)<=10}];
    });
    const quota = safe('资源额度',async () => {
      if (kind === 'ARK') {
        const model = env.ARK_QUOTA_MODEL || env.ARK_MODEL.replace(/-\d{6}$/,'');
        if (model.startsWith('ep-')) return [{text:'请配置 ARK_QUOTA_MODEL 为基础模型名称'}];
        const data = await read(creds,'ark','GetModelActivation','2024-01-01',{FoundationModelName:model,WithFreeUsage:true});
        const free = data.Item?.InitialInferenceFreeUsage;
        return [remaining(model + ' 初始免费额度',free?.Total,free?.Consumed,'tokens')];
      }
      const resource = env.SPEECH_RESOURCE_ID || 'volc.seedasr.sauc.duration';
      const project = env.SPEECH_QUOTA_PROJECT || 'default';
      const data = await read(creds,'speech_saas_prod','ResourcePacksStatus','2025-05-20',{
        ProjectName:project,ResourceIDs:[resource,'volc.service_type.10053'],Types:['prepaid'],PageSize:20,PageNumber:1
      });
      if (!Array.isArray(data.TotalHarvests)) return [{text:project + '：未返回资源包余量'}];
      return [[resource,'识别'],['volc.service_type.10053','同传']].flatMap(([id,name])=>{
        const entries = data.TotalHarvests.filter(row=>row.ResourceID===id);
        return entries.length ? entries.map(row=>remaining(project+' · '+name,row.PurchasedAmount,row.CurrentUsage,row.Unit))
          : [{text:project+' · '+name+'：未查到预付资源包'}];
      });
    });
    return (await Promise.all([quota,cash])).flat();
  }
  const [speech,ark] = await Promise.all([forKey('SPEECH'),forKey('ARK')]);
  return {speech,ark,checkedAt:new Date().toISOString()};
}
