// 首次进入引导：按「登录小米账号 → 启用音箱」两步判断下一步该做什么。
// 纯函数，不依赖 Vue，便于单测。返回 null 表示不需要引导。
export interface GuideAccount { logged_in?: boolean; is_valid?: boolean }
export interface GuideDevice { managed?: boolean }
export interface GuideAccountDevices { devices: GuideDevice[] }
export interface GuideStep {
  stage: 'login' | 'device';
  title: string;
  text: string;
  button: string;
}

export function computeSetupGuide(input: {
  accountsLoaded: boolean;
  deviceConnecting: boolean;
  accounts: GuideAccount[];
  devices: GuideAccountDevices[];
}): GuideStep | null {
  // 账号还没加载完 / 正在连接设备：不判断，避免加载中误报「未登录」。
  if (!input.accountsLoaded || input.deviceConnecting) return null;

  if (!input.accounts.length) {
    return {
      stage: 'login',
      title: '第 1 步：登录小米账号',
      text: '还没有登录小米账号。登录后才能找到并控制你的小爱音箱（支持扫码、账号密码、手动 Token）。',
      button: '去登录',
    };
  }
  const hasValid = input.accounts.some((a) => a.logged_in && a.is_valid !== false);
  if (!hasValid) {
    return {
      stage: 'login',
      title: '小米账号需要重新登录',
      text: '已添加的小米账号登录已失效，请重新登录后再使用。',
      button: '去重新登录',
    };
  }
  const managed = input.devices.some((a) => a.devices.some((d) => d.managed));
  if (!managed) {
    const anyDevice = input.devices.some((a) => a.devices.length > 0);
    return {
      stage: 'device',
      title: '第 2 步：启用要控制的音箱',
      text: anyDevice
        ? '账号已登录。请在设备列表里勾选要管理的音箱。'
        : '账号已登录，但没有找到音箱。请确认音箱已绑定到这个小米账号，然后在设置里刷新设备列表。',
      button: '去设置',
    };
  }
  return null;
}
