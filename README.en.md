# Meet Assistant

[简体中文](README.md) | **English**

Meet Assistant is a Chrome side panel for Google Meet. It shows live captions with Chinese translations and can translate your spoken Chinese into English audio in a voice similar to yours. You can use either feature independently or run both together. Other participants join with their usual Meet clients. The audio routing instructions below cover macOS with BlackHole 2ch.

| Feature | Input | Output | Required services |
| --- | --- | --- | --- |
| Bilingual captions | Audio playing in the Meet tab | Live transcript with rolling Chinese previews and finalized translations | Doubao Streaming Speech Recognition 2.0 and a Volcengine Ark text model |
| Chinese-to-English interpretation | Your physical microphone | English speech routed into Meet through BlackHole | Doubao Simultaneous Interpretation 2.0 |

## 1. Start the local proxy

Install Git, Node.js 22.9 or later, npm, and desktop Chrome 116 or later. Run:

```sh
git clone https://github.com/Xiapiiiii/meet-assistant.git
cd meet-assistant
npm ci
npm start
```

Open the [local status page](http://127.0.0.1:18767/) when the terminal prints `Meet 助手 http://127.0.0.1:18767`. Keep the proxy running during meetings. Press Ctrl+C to stop it. After restarting your computer, run `npm start` again in the repository directory.

## 2. Load the Chrome extension

Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the **extension** folder inside the cloned repository. It contains the manifest and requires no build step. You can pin **Meet 会议助手** from Chrome's extensions menu.

## 3. Activate services and configure keys

**Doubao Speech.** In the project you intend to use, activate Streaming Speech Recognition 2.0 for captions (hourly billing by default) and Simultaneous Interpretation 2.0 for voice translation, according to the features you need. Create a Speech API key in the same project. The console shows the available trial quota, rates, and activation terms. [Speech activation](https://console.volcengine.com/speech/new/setting/activate?projectName=default) · [Speech API keys](https://console.volcengine.com/speech/new/setting/apikeys?projectName=default)

**Volcengine Ark.** Captions use a Beijing-region text model to translate partial and finalized utterances. Activate Doubao-Seed-2.1-pro or select another compatible model available in your project. Create an Ark key with access to that model. You can leave this key empty if you only use voice interpretation. [Model activation](https://console.volcengine.com/ark/region:cn-beijing/openManagement) · [Ark API keys](https://ark.volcengine.com/region:cn-beijing/apikey)

**Enter your keys.** Open the extension side panel and click **API 设置** (API settings), or open **Extension options** from the extension details page. Enter the Speech and Ark keys, then click **保存** (Save). Each eye icon shows or hides one key. To replace a key, edit its value and save. To clear it, empty the field and save. Changes take effect the next time you start captions or interpretation.

### Optional configuration

For most installations, entering the keys in the extension is sufficient. To override the model, speech resource, or quota credentials, run `cp -n .env.example .env` in the repository root and edit `.env`.

| Variable | Purpose and default |
| --- | --- |
| `SPEECH_API_KEY` | Doubao Speech credential. Can also be set in the extension. |
| `ARK_API_KEY` | Ark text model credential. Can also be set in the extension. |
| `ARK_MODEL` | Defaults to `doubao-seed-2-1-pro-260915`. You can use an activated model or inference endpoint that supports Chat Completions with thinking disabled. |
| `SPEECH_RESOURCE_ID` | Captions use the hourly resource `volc.seedasr.sauc.duration` by default. For the concurrency-based plan, use `volc.seedasr.sauc.concurrent`. |

Interpretation uses the fixed resource `volc.service_type.10053`. For API keys, values saved from the extension take precedence (including an explicitly cleared value), followed by process environment variables and `.env`. For the model and speech resource, precedence is process environment, then `.env`, then the built-in default.

### Check quotas and balance

API settings queries the provider when you open the form, save, or click **刷新额度** (Refresh quotas). The Speech section shows prepaid recognition and interpretation resources for the chosen project. The Ark section shows free inference tokens for the configured base model. The available account balance belongs to the account used for the query. Two services on the same account share that balance. Pay-as-you-go usage may still be available after a prepaid pack runs out.

The settings page highlights remaining resources at or below 10% and balances at or below CNY 10. Alerts appear while viewing settings. There are no background notifications after you close the page.

Set `QUOTA_AK` and `QUOTA_SK` in the proxy's `.env` to credentials for a read-only IAM user with these permissions:

- `speech_saas_prod:ResourcePacksStatus` for Speech resource packs
- `ark:GetModelActivation` for the model's free tokens
- `billing:QueryBalanceAcct` for the account balance

Only the proxy reads these management credentials. Save the file and click **刷新额度**. Use credentials from the same parent account as the service key. The proxy cannot verify that account association from an inference key alone.

For services on different accounts, use `SPEECH_QUOTA_AK` and `SPEECH_QUOTA_SK` for Speech, and `ARK_QUOTA_AK` and `ARK_QUOTA_SK` for Ark. Set `SPEECH_QUOTA_PROJECT` to the Speech project name (default: `default`). If using a custom inference endpoint, set `ARK_QUOTA_MODEL` to its base model name.

## 4. Use bilingual captions

1. Join a Google Meet call. While on the meeting tab, open the side panel and click **开始监听** (Start listening).
2. In Chrome's share dialog, choose the **Chrome tab** containing the call, enable **Share tab audio**, and click **Share**.
3. The transcript updates as people speak. Chinese previews update during speech and are corrected at finalization. Previews increase Ark token usage. The tab supplies a mixed track containing remote speakers and any shared media. The panel keeps the most recent 64 utterances.
4. Click **停止** (Stop) to finish transcription and wait for the last translation. Starting a new session clears the previous captions.

## 5. Speak Chinese and send English audio to Meet (macOS)

Install [BlackHole 2ch](https://github.com/ExistentialAudio/BlackHole). With Homebrew, run:

```sh
brew install --cask blackhole-2ch
```

Restart your Mac as directed by the installer and start the local proxy again. Check that **BlackHole 2ch** appears in **Audio MIDI Setup**.

| Setting | Device |
| --- | --- |
| Extension side panel → 原声麦克风 (Source microphone) | The built-in microphone or your headset microphone |
| Meet → Settings → Audio → Microphone | BlackHole 2ch |
| Meet → Settings → Audio → Speakers | Your headphones. Also select them as the macOS default output. |

Click **开始同传** (Start interpreting) and allow microphone access. Once the panel says **同传中**, unmute in Meet and speak a complete sentence in Chinese. The translated English audio reaches other participants through the virtual microphone. Headphones keep remote participants' voices from feeding back into your physical microphone.

Click **停止同传** (Stop interpreting) to stop microphone capture and discard queued translated audio. Muting in Meet only stops transmission to participants. To stop sending audio to the interpretation service, use the extension's stop button. To speak Chinese directly to the meeting again, select your physical microphone in Meet.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Settings or the panel cannot reach the proxy | Open the local status page and make sure `npm start` is running. After an update, restart the proxy and reload the extension. |
| Startup reports `EADDRINUSE` | Check port 18767 with `lsof -nP -iTCP:18767 -sTCP:LISTEN`. If the current version of this proxy is already listening, use it. |
| Speech API returns 403 | Check the key's project, service activation, and hourly versus concurrency-based resource ID. Newly activated services may take a moment to become available. |
| The transcript appears but translation fails | Check the Ark key, Beijing-region model ID, model permissions, and quota. Configure the Speech and Ark keys separately. |
| Microphone access fails | Enable Google Chrome under macOS **System Settings → Privacy & Security → Microphone**. In Chrome, allow microphone access for **Meet 会议助手**. |
| Captions receive no audio | Share the Meet tab that plays the remote audio and enable **Share tab audio**. |
| Other participants cannot hear English | Confirm BlackHole 2ch is available, the panel says **同传中**, Meet is unmuted with BlackHole as its microphone, and the extension uses your physical microphone. |
| Updating the extension | Run `git pull --ff-only` and `npm ci`, restart the proxy, reload the extension at `chrome://extensions`, and reopen the side panel. |

## Data flow and credentials

The proxy listens on `127.0.0.1:18767` and validates the WebSocket origin and host. For captions, it sends the selected tab's audio to Doubao Speech and partial and finalized text to Ark. For interpretation, it sends your selected microphone's audio to Doubao and routes the returned English PCM audio to BlackHole. Use the extension in meetings where transcription and translation are permitted.

The proxy stores keys saved through settings in `.meet-settings.json` at the repository root (plain text with Unix permissions `0600`). On first start it creates `extension/local-settings-token`. The settings page presents that token before reading the two API keys. Load the extension from the same checkout as the running proxy. Git ignores the credential files and `.env`. The application processes audio and captions in memory and does not write recordings by default.

## Development and testing

```sh
npm ci
npm test
```

The tests use mock services and temporary directories and require no real API keys. For an end-to-end check, join a test meeting from a second device. Verify that speech from the second device produces Chinese captions, then speak Chinese into your physical microphone and listen for English on the second device.

The [extension directory](extension/) contains the side panel and PCM capture code. [server.js](server.js) accepts extension connections, [session.js](session.js) handles transcription and text translation, [interpret.js](interpret.js) handles spoken interpretation, and [settings.js](settings.js) manages credentials. [interpret.proto](interpret.proto) defines the interpretation protocol fields this project uses. [Streaming speech recognition](https://docs.volcengine.com/docs/doubao-voice/bidirectional-streaming-automatic-speech-recognition-websocket?lang=zh) · [Interpretation protocol](https://www.volcengine.com/docs/6561/1756902)

Licensed under the [Apache License 2.0](LICENSE).
