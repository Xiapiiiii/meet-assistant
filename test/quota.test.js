import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quotas} from '../quota.js';

const env = {SPEECH_API_KEY:'speech',ARK_API_KEY:'ark',ARK_MODEL:'doubao-seed-2-1-pro-260915',QUOTA_AK:'shared',QUOTA_SK:'secret'};

test('reports real units and thresholds for the configured accounts',async () => {
  const data = await quotas({...env,SPEECH_QUOTA_AK:'speech-account',SPEECH_QUOTA_SK:'s'},async (creds,service,action,v,params)=>{
    if (action==='QueryBalanceAcct') return {AvailableBalance:creds.ak==='shared'?'0.00':'40.00'};
    if (service==='ark') {
      assert.equal(creds.ak,'shared');
      assert.deepEqual(params,{FoundationModelName:'doubao-seed-2-1-pro',WithFreeUsage:true});
      return {Item:{InitialInferenceFreeUsage:{Total:500000,Consumed:480000}}};
    }
    assert.equal(creds.ak,'speech-account');
    return {TotalHarvests:[{ResourceID:params.ResourceIDs[0],Unit:'小时',PurchasedAmount:100,CurrentUsage:95}]};
  });
  assert.ok(data.speech[0].low);
  assert.match(data.speech[0].text,/5 \/ 100 小时/);
  assert.match(data.speech[1].text,/未查到/);
  assert.equal(data.speech[2].low,false);
  assert.match(data.ark[0].text,/20,000/);
  assert.equal(data.ark[1].low,true);
});

test('missing credentials and upstream failures never become zero balances',async () => {
  const missing = await quotas({...env,QUOTA_SK:''},()=>assert.fail());
  assert.match(missing.ark[0].text,/未配置/);
  const partial = await quotas(env,async (_,service)=>{
    if (service==='billing') throw Error('AccessDenied');
    return {};
  });
  assert.match(partial.ark[0].text,/暂无/);
  assert.match(partial.ark[1].text,/AccessDenied/);
  assert.match(partial.speech[0].text,/未返回/);
});

test('reads free inference packs including reclaimed tokens',async () => {
  const data = await quotas(env,async (_,service) => service === 'ark'
    ? {Item:{FreeResourcePackItems:[{Type:'FreeInference',Total:1000,Consumed:25,Reclaimed:50}]}}
    : {});
  assert.match(data.ark[0].text,/925 \/ 1,000 tokens/);
});
