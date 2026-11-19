#!/usr/bin/env bash
# 拾光健康巡检：容器 / 数据库 / 本机 API / 公网 API / OTA 站 / 证书 / 每日快照。
# 由 systemd timer 每 10 分钟跑一次；发现问题写 /opt/bookkeeping/state/ALERT-health.txt，
# 恢复后自动删除。ALERT_WEBHOOK（可选，见 /etc/default/bk-healthcheck）用于外部推送，
# 未配置时不推送——异地副本脚本会把这个告警文件拉到 Mac 并弹系统通知。
set -uo pipefail

STATE_DIR=/opt/bookkeeping/state
ALERT="$STATE_DIR/ALERT-health.txt"
LOG=/var/log/bk-healthcheck.log
API_LOCAL=${API_LOCAL:-http://127.0.0.1:18080/health}
API_PUBLIC=${API_PUBLIC:-https://api.neobee.top/health}
OTA_INFO=${OTA_INFO:-https://app.xyvora.me/bookkeeping/info.json}
DUMP_MAX_AGE_MIN=${DUMP_MAX_AGE_MIN:-1560}   # 26 小时：每日 03:30 dump，留 2 小时余量
CERT_MIN_DAYS=${CERT_MIN_DAYS:-14}

[ -r /etc/default/bk-healthcheck ] && . /etc/default/bk-healthcheck

mkdir -p "$STATE_DIR"
problems=()
log() { echo "$(date -Is) $*" >>"$LOG"; }

# 1. 容器与数据库
if ! docker inspect -f '{{.State.Running}}' bookkeeping-backend 2>/dev/null | grep -q true; then
  problems+=("backend 容器未运行")
fi
if ! docker exec neobee-db pg_isready -U neo -d bookkeeping >/dev/null 2>&1; then
  problems+=("PostgreSQL 不可连接")
fi

# 2. 本机 API（绕开 nginx/证书）
if ! curl -fsS -m 8 "$API_LOCAL" | grep -q '"ok"'; then
  problems+=("本机 /health 异常")
fi

# 3. 公网 API（真实域名 + 证书 + nginx 转发）
code=$(curl -s -o /dev/null -w '%{http_code}' -m 12 "$API_PUBLIC" 2>/dev/null)
[ "$code" = "200" ] || problems+=("公网 api.neobee.top/health=${code:-000}")

# 4. OTA 下载站
code=$(curl -s -o /dev/null -w '%{http_code}' -m 12 "$OTA_INFO" 2>/dev/null)
[ "$code" = "200" ] || problems+=("OTA info.json=${code:-000}")

# 5. 证书剩余天数
check_cert() {
  local host=$1 end end_ts now_ts days
  end=$(echo | timeout 10 openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -z "$end" ]; then
    problems+=("$host 证书读取失败")
    return
  fi
  end_ts=$(date -d "$end" +%s 2>/dev/null) || { problems+=("$host 证书解析失败"); return; }
  now_ts=$(date +%s)
  days=$(( (end_ts - now_ts) / 86400 ))
  [ "$days" -ge "$CERT_MIN_DAYS" ] || problems+=("$host 证书仅剩 ${days} 天")
}
check_cert api.neobee.top
check_cert app.xyvora.me

# 6. 每日快照新鲜度
latest=$(ls -1t /opt/bookkeeping/dumps/daily_*.sql.gz 2>/dev/null | head -1)
if [ -z "$latest" ]; then
  problems+=("没有每日快照")
else
  age_min=$(( ( $(date +%s) - $(stat -c %Y "$latest") ) / 60 ))
  [ "$age_min" -le "$DUMP_MAX_AGE_MIN" ] || problems+=("最新快照已 $((age_min / 60)) 小时未更新")
fi

if [ ${#problems[@]} -eq 0 ]; then
  if [ -f "$ALERT" ]; then
    log "RECOVERED 全部检查恢复正常"
    rm -f "$ALERT"
  fi
  exit 0
fi

msg=$(printf '%s; ' "${problems[@]}")
msg=${msg%; }
log "ALERT $msg"
echo "$(date -Is) $msg" >"$ALERT"

# 可选外部推送（Bark / 企业微信 / Telegram bot 等，POST JSON {"text": "..."}）。
if [ -n "${ALERT_WEBHOOK:-}" ]; then
  if payload=$(ALERT_MSG="$msg" python3 - <<'PY'
import json, os
print(json.dumps({"text": "拾光告警: " + os.environ.get("ALERT_MSG", "")}))
PY
  ); then
    curl -fsS -m 8 -X POST -H 'Content-Type: application/json' \
      -d "$payload" "$ALERT_WEBHOOK" >/dev/null 2>&1 || log "WARN webhook 推送失败"
  fi
fi
exit 1
