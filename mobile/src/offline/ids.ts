/**
 * 生成离线新增的幂等键。
 *
 * 不依赖 crypto.randomUUID（Hermes 不保证存在），只用时间戳 + 随机串。
 * 长度落在 8..64 之间，满足后端 client_id 的校验。
 */
export function createClientId(): string {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  const tail = Math.random().toString(36).slice(2, 6);
  return `${time}-${random}-${tail}`;
}
