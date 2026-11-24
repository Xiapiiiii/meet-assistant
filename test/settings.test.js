import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {settings} from '../settings.js';

test('settings preserve independent keys and expose only configured state', t => {
  const dir=mkdtempSync(join(tmpdir(),'meet-settings-'));
  t.after(() => rmSync(dir,{recursive:true,force:true}));
  const url=pathToFileURL(dir+'/');
  const store=settings(url);
  store.update({SPEECH_API_KEY:'test-speech',ARK_API_KEY:'test-ark'});
  assert.deepEqual(store.status(),{SPEECH_API_KEY:true,ARK_API_KEY:true});
  store.update({ARK_API_KEY:'replaced'});
  assert.equal(settings(url).config().SPEECH_API_KEY,'test-speech');
  assert.equal(store.config().ARK_API_KEY,'replaced');
  assert.throws(() => store.update({other:'no'}));
  store.update({SPEECH_API_KEY:''});
  assert.deepEqual(store.status(),{SPEECH_API_KEY:false,ARK_API_KEY:true});
  assert.equal(statSync(join(dir,'.meet-settings.json')).mode & 0o777,0o600);
});
