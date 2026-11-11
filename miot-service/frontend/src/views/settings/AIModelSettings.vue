<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import SectionCard from '../../ui/SectionCard.vue';
import SettingRow from '../../ui/SettingRow.vue';
import SlButton from '../../ui/SlButton.vue';
import SlInput from '../../ui/SlInput.vue';
import SlSelect from '../../ui/SlSelect.vue';
import SlSwitch from '../../ui/SlSwitch.vue';
import AIHeadersField from '../../ui/AIHeadersField.vue';
import { parseAIHeaders } from '../../../../src/utils/ai_headers';
import { get, post } from '../../api';
import { AI_PRESET_PROVIDERS } from '../../aiPresets';
import { messageOf, notify, saveConfig, state } from '../../store';
import { navigation } from '../../runtime';

const selectedPreset = ref('custom'), customModel = ref(false);
const models = ref<Array<{ id: string; ownedBy?: string }>>([]);
const loading = ref(false), modelError = ref(''), latency = ref<number | null>(null);
const connectionState = ref<'idle' | 'loading' | 'ok' | 'error'>('idle');
const testQuery = ref(''), testResult = ref(''), testBusy = ref(false);
const customHeaders = ref(JSON.stringify(state.config.ai_config.custom_headers || {}, null, 2));
let alive = true, requestVersion = 0;
const presetOptions = [
  { value: 'custom', label: '自定义', searchText: '自定义 custom' },
  ...AI_PRESET_PROVIDERS.map(p => ({ value: p.id, label: p.name, searchText: `${p.group} ${p.name} ${p.id} ${p.format}` })),
];
const formatOptions = [{ value: 'openai', label: 'OpenAI 兼容（/chat/completions）' }, { value: 'anthropic', label: 'Anthropic（/messages）' }];
// 编程 / Agent / Token 套餐类接入点：多数服务条款限定在特定工具中使用。
const isPlan = computed(() => /plan/i.test(selectedPreset.value));
const apiFormat = computed(() => state.config.ai_config.api_format === 'anthropic' ? 'anthropic' : 'openai');
const preset = computed(() => AI_PRESET_PROVIDERS.find(p => p.id === selectedPreset.value));
const CUSTOM_MODEL = '__custom_model__';
// 已连上服务商时用实时模型列表；未连接/获取失败时回退到预设（与 Octop 对齐）里的模型清单。
const presetModels = computed(() => preset.value?.models || []);
const modelOptions = computed(() => [
  ...(models.value.length
    ? models.value.map(m => ({ value: m.id, label: m.ownedBy ? `${m.id} (${m.ownedBy})` : m.id, searchText: m.id }))
    : presetModels.value.map(m => ({ value: m.id, label: m.name === m.id ? m.id : `${m.name}（${m.id}）`, searchText: `${m.name} ${m.id}` }))),
  { value: CUSTOM_MODEL, label: '自定义模型名…' },
]);
const inPresetModels = (id: string) => presetModels.value.some(m => m.id === id);
const modelValue = computed(() => customModel.value ? CUSTOM_MODEL : state.config.ai_config.model || '');
const signature = () => {
  let headers: unknown = customHeaders.value;
  try { headers = parseAIHeaders(customHeaders.value); } catch { }
  return JSON.stringify([state.config.ai_config.api_url, state.config.ai_config.api_key, state.config.ai_config.api_format, headers]);
};
// listMode：服务不提供 /models 时，'probed' 表示已用一次极小的对话请求验证过连接，'unverified' 表示尚未验证。
const listMode = ref<'list' | 'probed' | 'unverified'>('list');
const connectionText = computed(() => {
  if (connectionState.value === 'ok' && listMode.value === 'probed') return `已连接 · ${latency.value} ms · 该服务不提供模型列表，使用预设清单`;
  if (connectionState.value === 'ok' && listMode.value === 'unverified') return '该服务不提供模型列表，已使用预设清单；点「检测连接」验证密钥与模型';
  return ({ idle: '尚未检测连接', loading: '检测连接中…', ok: `已连接 · ${latency.value} ms`, error: `连接失败：${modelError.value}` })[connectionState.value];
});

// 地址 + 格式都一致才算该预设；同一地址有多个预设时（如腾讯 Token Plan / 混元 Token Plan）优先上次所选。
function syncPreset() {
  const url = (state.config.ai_config.api_url || '').trim().replace(/\/+$/, '');
  const matches = AI_PRESET_PROVIDERS.filter(p => p.format === apiFormat.value
    && [p.baseUrl, ...(p.aliases || [])].some(u => u.replace(/\/+$/, '') === url));
  selectedPreset.value = (matches.find(p => p.id === state.config.ai_config.api_provider) || matches[0])?.id || 'custom';
}
// 切换格式：同厂商有该格式的预设（如 OpenCode）就换过去；否则转为自定义，保留地址供用户改。
async function selectFormat(value: string) {
  const format = value === 'anthropic' ? 'anthropic' : 'openai';
  if (format === apiFormat.value) return;
  const sibling = preset.value && AI_PRESET_PROVIDERS.find(p => p.group === preset.value!.group && p.format === format
    && p.name.replace(/（.*?）/g, '') === preset.value!.name.replace(/（.*?）/g, ''));
  if (sibling) { await applyPreset(sibling.id); return; }
  state.config.ai_config.api_format = format;
  state.config.ai_config.api_provider = 'custom';
  selectedPreset.value = 'custom';
  try { await saveConnection(); } catch { }
}
async function saveConnection() {
  let headers: Record<string, string>;
  try { headers = parseAIHeaders(customHeaders.value); }
  catch (error) { notify(messageOf(error), 'error'); throw error; }
  await saveConfig({ ai_config: { ...state.config.ai_config, custom_headers: headers } });
}
async function applyPreset(id: string) {
  selectedPreset.value = id;
  const next = AI_PRESET_PROVIDERS.find(p => p.id === id);
  if (!next) {
    // 切到自定义：保留当前地址与格式，只记住选择，便于在下方直接修改。
    state.config.ai_config.api_provider = 'custom';
    try { await saveConnection(); } catch { }
    return;
  }
  state.config.ai_config.api_url = next.baseUrl;
  state.config.ai_config.api_format = next.format;
  state.config.ai_config.api_provider = next.id;
  if (next.defaultModel) state.config.ai_config.model = next.defaultModel;
  customModel.value = false;
  try { await saveConnection(); } catch { }
}
function selectModel(value: string) {
  customModel.value = value === CUSTOM_MODEL;
  if (customModel.value) return;
  state.config.ai_config.model = value;
  void saveConnection().catch(() => { });
}
async function refreshModels(silent = false) {
  const version = ++requestVersion, identity = signature();
  const current = () => alive && version === requestVersion && identity === signature();
  if (!state.config.ai_config.api_url || !state.config.ai_config.api_key) return;
  loading.value = true; modelError.value = ''; connectionState.value = 'loading';
  const started = Date.now();
  try {
    if (!silent) await saveConnection();
    if (!current()) return;
    const result = await get<{ models: Array<{ id: string; ownedBy?: string }>; listUnsupported?: boolean; probed?: boolean }>(silent ? '/voice-commands/models?probe=0' : '/voice-commands/models');
    if (!current()) return;
    models.value = Array.isArray(result.models) ? result.models : [];
    latency.value = Date.now() - started; connectionState.value = 'ok';
    listMode.value = result.listUnsupported ? (result.probed ? 'probed' : 'unverified') : 'list';
    // 拿不到在线列表时用预设清单判断当前模型是否需要手填。
    customModel.value = !!state.config.ai_config.model && (result.listUnsupported
      ? !inPresetModels(state.config.ai_config.model)
      : !models.value.some(m => m.id === state.config.ai_config.model));
    if (!silent) notify(result.listUnsupported ? '连接正常；该服务不提供模型列表，已使用预设模型清单' : `已获取 ${models.value.length} 个模型`, 'success');
  } catch (error) {
    if (!current()) return;
    models.value = []; listMode.value = 'list'; modelError.value = messageOf(error); connectionState.value = 'error'; customModel.value = !inPresetModels(state.config.ai_config.model);
    if (!silent) notify(modelError.value, 'error');
  } finally { if (current()) loading.value = false; }
}
async function enableAnalysis(enabled: boolean) {
  if (enabled && !state.config.voice_command_enabled) { notify('请先开启语音口令', 'warning'); return; }
  try { await saveConfig({ ai_config: { ...state.config.ai_config, enabled } }); } catch { }
}
async function testAnalysis() {
  if (testBusy.value || !testQuery.value.trim()) return;
  testBusy.value = true; testResult.value = '';
  const question = testQuery.value.trim();
  const identity = JSON.stringify([signature(), state.config.ai_config.model, state.config.ai_config.timeout]);
  const current = () => alive && testQuery.value.trim() === question && identity === JSON.stringify([signature(), state.config.ai_config.model, state.config.ai_config.timeout]);
  try {
    await saveConnection();
    if (!current()) return;
    const result = await post<Record<string, unknown>>('/voice-commands/ai-test', { query: question });
    if (current()) testResult.value = JSON.stringify(result, null, 2);
  } catch (error) { if (current()) testResult.value = messageOf(error); }
  finally { if (alive) testBusy.value = false; }
}
watch(signature, () => { requestVersion++; models.value = []; listMode.value = 'list'; loading.value = false; modelError.value = ''; latency.value = null; connectionState.value = 'idle'; syncPreset(); });
watch(() => JSON.stringify(state.config.ai_config.custom_headers || {}), () => { customHeaders.value = JSON.stringify(state.config.ai_config.custom_headers || {}, null, 2); });
onMounted(() => { syncPreset(); customModel.value = !!state.config.ai_config.model && !inPresetModels(state.config.ai_config.model); void refreshModels(true); });
onUnmounted(() => { alive = false; requestVersion++; });
</script>

<template>
  <SectionCard title="默认模型连接" icon="auto_awesome" description="口令分析与 AI 对话可共用此连接。即使未开启口令分析，也能用于对话。">
    <div class="form-body">
      <div class="field">
        <label class="field-label">服务商</label>
        <SlSelect :model-value="selectedPreset" :options="presetOptions" aria-label="选择 AI 预设服务商" searchable search-placeholder="搜索服务商、Coding Plan、Token Plan…" @update:model-value="applyPreset" />
        <p v-if="isPlan" class="field-help">套餐类接入点（Coding / Agent / Token Plan）需单独开通，部分服务条款限定在编程或 Agent 工具中使用，请先确认允许此用途。</p>
      </div>
      <div class="field">
        <label class="field-label">接口格式</label>
        <SlSelect :model-value="apiFormat" :options="formatOptions" aria-label="选择 AI 接口格式" @update:model-value="selectFormat" />
        <p class="field-help">选预设会自动带上格式。OpenAI 兼容用 Bearer 认证；Anthropic 用 x-api-key 认证，地址填到版本段或根路径即可（如 https://api.anthropic.com/v1）。</p>
      </div>
      <div class="field"><label class="field-label">API 地址</label><SlInput v-model="state.config.ai_config.api_url" aria-label="默认 AI API 地址" :placeholder="apiFormat === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.example.com/v1'" @change="saveConnection().catch(() => {})" /></div>
      <div class="field"><label class="field-label">API 密钥</label><SlInput v-model="state.config.ai_config.api_key" type="password" aria-label="默认 AI API 密钥" :placeholder="preset?.keyPrefix ? `${preset.keyPrefix}…` : ''" @change="saveConnection().catch(() => {})" /></div>
      <AIHeadersField v-model="customHeaders" label="默认 AI 自定义请求头" @change="saveConnection().catch(() => {})" />
      <a v-if="preset" class="preset-key-link" :href="preset.apiKeyUrl" target="_blank" rel="noopener">前往 {{ preset.name }} 获取 API Key ↗</a>
      <div class="field">
        <label class="field-label">默认模型</label>
        <div class="inline-fields model-row">
          <SlSelect :model-value="modelValue" :options="modelOptions" aria-label="选择 AI 模型" searchable search-placeholder="搜索模型名称" @update:model-value="selectModel" />
          <SlButton label="检测连接与获取模型" variant="outlined" icon="refresh" :disabled="loading || !state.config.ai_config.api_url || !state.config.ai_config.api_key" @click="refreshModels()" />
        </div>
        <SlInput v-if="customModel" v-model="state.config.ai_config.model" class="model-custom-input" aria-label="手动填写 AI 模型名" placeholder="填写服务商支持的模型名称" @change="saveConnection().catch(() => {})" />
        <p class="field-help">获取模型列表失败时，仍可手工填写模型名。</p>
      </div>
      <div class="status-chips"><span class="chip" :class="{ 'chip-success': connectionState === 'ok', 'chip-warning': connectionState === 'error' }">{{ connectionText }}</span></div>
    </div>
  </SectionCard>
  <SectionCard title="AI 口令分析" icon="mic" description="规则与点歌记忆未命中时，将自然语言解析成音乐控制口令。">
    <SettingRow title="启用 AI 分析" :subtitle="state.config.voice_command_enabled ? '使用默认模型连接，与 AI 对话独立启用' : '需要先开启语音口令'"><SlSwitch aria-label="启用 AI 分析" :model-value="!!state.config.ai_config.enabled" :disabled="!state.config.voice_command_enabled" @update:model-value="enableAnalysis" /></SettingRow>
    <div class="form-body">
      <SlButton v-if="!state.config.voice_command_enabled" label="设置语音口令" variant="outlined" @click="navigation.settingsCategory = 'voice'" />
      <div class="field"><label class="field-label">口令分析超时（1–30 秒）</label><SlInput :model-value="String(state.config.ai_config.timeout || 6)" type="number" aria-label="AI 口令分析超时" @update:model-value="state.config.ai_config.timeout = Math.max(1, Math.min(30, Number($event) || 6))" @change="saveConnection().catch(() => {})" /></div>
      <div class="command-test-panel command-test-panel-inset"><strong>AI 分析测试</strong><p>仅测试解析，不执行播放。</p><div class="inline-fields"><SlInput v-model="testQuery" aria-label="AI 分析测试问题" placeholder="输入自然语言口令" @submit="testAnalysis" /><SlButton label="测试分析" variant="outlined" icon="science" :disabled="testBusy || !testQuery.trim()" @click="testAnalysis" /></div><pre v-if="testResult" class="result-pre">{{ testResult }}</pre></div>
    </div>
  </SectionCard>
</template>
