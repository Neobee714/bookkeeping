/**
 * 应用全局配置。
 *
 * API 基础地址说明(注意:末尾不要带斜杠,避免刷新接口拼成 //auth/refresh):
 * - 生产环境:https://api.bookkeeping.neobee.top(线上后端,必须 HTTPS)。
 * - 本地联调(推荐方式):`adb reverse tcp:8000 tcp:8000` 后,
 *   APP 内用 http://127.0.0.1:8000 访问宿主机后端(不经模拟器 NAT,最稳)。
 * - 备选:Android 模拟器默认 NAT 回环 http://10.0.2.2:8000(部分模拟器网络异常时不生效)。
 * - 真机:手机与电脑同一 WiFi,改 http://<电脑局域网IP>:8000。
 */
export const API_BASE_URL = 'https://api.bookkeeping.neobee.top';

/** 请求超时(毫秒)。 */
export const API_TIMEOUT_MS = 30000;

// ---------- 更新检查(OTA) ----------

/**
 * 更新源:app.xyvora.me 静态托管(裸 JSON,非后端 success_response 包裹)。
 * 本地联调可临时改为 mock 服务地址。
 */
export const UPDATE_BASE_URL = 'https://app.xyvora.me';

/** 应用名(远端目录名)。 */
export const UPDATE_APP_NAME = 'bookkeeping';

/** 远端更新清单(info.json)地址。 */
export const UPDATE_INFO_URL = `${UPDATE_BASE_URL}/${UPDATE_APP_NAME}/info.json`;
