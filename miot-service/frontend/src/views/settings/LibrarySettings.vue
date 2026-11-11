<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import SectionCard from '../../ui/SectionCard.vue';
import SlButton from '../../ui/SlButton.vue';
import SlInput from '../../ui/SlInput.vue';
import SlStatusChip from '../../ui/SlStatusChip.vue';
import { loadFnmusicStatus, messageOf, notify, saveFnmusicGateway, state } from '../../store';
import { post } from '../../api';

const url = ref('');
const busy = ref<'' | 'test' | 'detect' | 'save' | 'auto'>('');
const result = ref<{ ok: boolean; text: string } | null>(null);

const status = computed(() => state.fnmusic);
const chip = computed(() => {
  if (!status.value.checked) return { label: '检测中', tone: 'neutral' as const };
  return status.value.reachable ? { label: '已连接', tone: 'success' as const } : { label: '连接失败', tone: 'warning' as const };
});

onMounted(async () => {
  await loadFnmusicStatus(true);
  url.value = status.value.base_url;
});

async function detect() {
  busy.value = 'detect';
  result.value = null;
  try {
    const r = await post<{ found: boolean; base_url?: string; source?: string }>('/fnmusic/detect');
    if (r.found && r.base_url) {
      url.value = r.base_url;
      busy.value = '';
      await save(`已找到并保存：${r.base_url}（来源：${r.source}）`);
    } else {
      result.value = { ok: false, text: '没有在本机找到飞牛音乐。请确认飞牛音乐已安装并运行，或手动填写地址。' };
    }
  } catch (error) {
    result.value = { ok: false, text: messageOf(error) };
  } finally { busy.value = ''; }
}

async function test() {
  if (!url.value.trim()) { result.value = { ok: false, text: '请先填写地址' }; return; }
  busy.value = 'test';
  result.value = null;
  try {
    const r = await post<{ ok: boolean; reason: string; base_url: string }>('/fnmusic/test', { base_url: url.value });
    result.value = r.ok
      ? { ok: true, text: r.reason || `连接成功：${r.base_url}` }
      : { ok: false, text: r.reason || '无法连接该地址' };
  } catch (error) {
    result.value = { ok: false, text: messageOf(error) };
  } finally { busy.value = ''; }
}

// 自动保存：输入框离开或回车时保存（地址没变就不存）；自动探测找到地址后直接保存。
async function save(message = '') {
  const next = url.value.trim();
  if (!next || busy.value !== '') return;
  if (!message && status.value.mode === 'manual' && next.replace(/\/+$/, '') === (status.value.base_url || '').replace(/\/+$/, '')) return;
  busy.value = 'save';
  result.value = null;
  try {
    await saveFnmusicGateway({ mode: 'manual', baseUrl: next });
    url.value = status.value.base_url;
    if (message) result.value = { ok: true, text: message };
    notify('飞牛音乐地址已保存', 'success');
  } catch (error) {
    // 后端会先测试地址，连不上就拒绝保存，避免把可用的地址覆盖成错误的。
    result.value = { ok: false, text: `未保存：${messageOf(error)}` };
  } finally { busy.value = ''; }
}

async function backToAuto() {
  busy.value = 'auto';
  result.value = null;
  try {
    await saveFnmusicGateway({ mode: 'auto' });
    url.value = status.value.base_url;
    notify('已恢复自动探测', 'success');
  } catch (error) {
    result.value = { ok: false, text: messageOf(error) };
  } finally { busy.value = ''; }
}
</script>

<template>
  <SectionCard
    title="飞牛音乐连接"
    icon="link"
    description="本应用通过飞牛 NAS 的 HTTP 网关访问飞牛音乐。端口因机器而异（常见 5666），安装时和运行中都会自动探测；探测不到时，在这里手动填写。"
  >
    <div class="form-body">
      <div class="inline-fields">
        <SlStatusChip :label="chip.label" :tone="chip.tone" :icon="status.reachable ? 'check' : 'cloud_off'" />
        <span>当前地址：<strong>{{ status.base_url || '—' }}</strong>
          <small v-if="status.source">（{{ status.mode === 'manual' ? '手动设置' : status.source }}）</small></span>
      </div>
      <p v-if="status.checked && !status.reachable" class="field-hint">{{ status.reason || '无法连接飞牛音乐' }}</p>

      <label class="field-label" for="fnmusic-url">飞牛音乐地址</label>
      <div class="inline-fields">
        <SlInput id="fnmusic-url" v-model="url" type="url" placeholder="http://192.168.1.10:5666" aria-label="飞牛音乐地址" @change="save()" @submit="save()" />
      </div>
      <div class="field-actions">
        <SlButton variant="tonal" icon="search" label="自动探测" :disabled="busy !== ''" @click="detect" />
        <SlButton variant="tonal" icon="check" label="测试连接" :disabled="busy !== '' || !url.trim()" @click="test" />
        <SlButton v-if="status.mode === 'manual'" variant="text" icon="refresh" label="恢复自动探测" :disabled="busy !== ''" @click="backToAuto" />
      </div>
      <p v-if="result" class="field-hint" :style="{ color: result.ok ? 'var(--md-primary)' : 'var(--md-error)' }">{{ result.text }}</p>
      <p class="field-hint">地址格式：<code>http://飞牛的IP:端口</code>。在飞牛「设置 → 网络 → 网关」里可以看到 HTTP 端口。填写后离开输入框或按回车即自动保存，不用重启，歌单会自动重新加载。手动填写的地址不会被自动探测覆盖。</p>
    </div>
  </SectionCard>
</template>
