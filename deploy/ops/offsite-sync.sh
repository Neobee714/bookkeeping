#!/bin/bash
# 从阿里云拉取拾光的异地副本到本机：
#   1) 每日数据库快照 daily_*.sql.gz
#   2) 重装所需的配置包（nginx / compose / ci / 证书 / systemd / cron / 巡检脚本）
#   3) 服务器巡检告警文件（ALERT-health.txt）
# 由 launchd com.xyvora.bookkeeping-backup 每天 12:30 触发。
# Mac 关机错过的那些天会在下次运行时一次补齐（rsync 拉全部 daily_*，服务端保留 30 份）。
# 任何一步失败或快照过期都会弹 macOS 通知，不再只写日志。
set -uo pipefail

REMOTE=aliyun
REMOTE_DUMP_DIR=/opt/bookkeeping/dumps
BASE="$HOME/bookkeeping-backups"
DUMP_DIR="$BASE/offsite"
CONF_DIR="$BASE/config"
STATE_DIR="$BASE/state"
KEEP_DUMPS=30
KEEP_CONF=14
DUMP_MAX_AGE_H=30      # 每日 03:30 生成，12:30 拉取；超过 30 小时视为断更
LOG="$BASE/offsite-sync.log"
SSH_OPTS="-o ConnectTimeout=20 -o BatchMode=yes"

mkdir -p "$DUMP_DIR" "$CONF_DIR" "$STATE_DIR"
chmod 700 "$BASE" "$DUMP_DIR" "$CONF_DIR" "$STATE_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >>"$LOG"; }

notify() {
  local title=$1 body=$2
  body=${body//[\"\\]/}
  /usr/bin/osascript -e "display notification \"$body\" with title \"$title\" sound name \"Basso\"" >/dev/null 2>&1 || true
}

fail() {
  log "ALERT $*"
  notify "拾光备份异常" "$*"
  exit 1
}

log "开始同步"

# ---------- 1. 数据库快照 ----------
if ! rsync -az -e "ssh $SSH_OPTS" \
      --include='daily_*.sql.gz' --exclude='*' \
      "$REMOTE:$REMOTE_DUMP_DIR/" "$DUMP_DIR/" >>"$LOG" 2>&1; then
  fail "数据库快照 rsync 失败（检查 aliyun 能否 SSH 登录）"
fi

LATEST=$(ls -1t "$DUMP_DIR"/daily_*.sql.gz 2>/dev/null | head -1)
if [ -z "$LATEST" ] || ! gzip -t "$LATEST" 2>/dev/null; then
  fail "最新数据库快照不可用：$LATEST"
fi

AGE_H=$(( ( $(date +%s) - $(stat -f %m "$LATEST") ) / 3600 ))
if [ "$AGE_H" -ge "$DUMP_MAX_AGE_H" ]; then
  fail "最新快照 $(basename "$LATEST") 已 ${AGE_H} 小时未更新（服务端 cron 可能失效）"
fi

# ---------- 2. 配置包 ----------
# 只打包远端确实存在的路径：任一硬编码路径消失（如 .htpasswd-life-kitchen）都会让
# tar 退出非 0，整包被判失败——这是 11 月每天报「配置包拉取失败」的原因。
REMOTE_PATHS=(
  etc/nginx/sites-available
  etc/nginx/sites-enabled
  etc/nginx/.htpasswd-life-notes
  etc/nginx/.htpasswd-life-kitchen
  etc/letsencrypt/renewal
  etc/letsencrypt/archive
  opt/bookkeeping/stack/docker-compose.yml
  opt/bookkeeping/stack/.env
  opt/bookkeeping/ci/ci.env
  opt/bookkeeping/ci/bk-deploy.service
  opt/bookkeeping/ci/bk-deploy.timer
  opt/bookkeeping/ci/deploy.sh
  opt/bookkeeping/ci/install.sh
  opt/bookkeeping/backup/daily.sh
  opt/bookkeeping/watchdog/check.sh
  etc/systemd/system/bk-deploy.service
  etc/systemd/system/bk-deploy.timer
  etc/systemd/system/bk-healthcheck.service
  etc/systemd/system/bk-healthcheck.timer
  etc/default/bk-healthcheck
  etc/cron.d/bookkeeping-backup
)

STAMP=$(date +%Y%m%d)
CONF_FILE="$CONF_DIR/stack-config-$STAMP.tgz"
if printf '%s\n' "${REMOTE_PATHS[@]}" | ssh $SSH_OPTS "$REMOTE" \
      'while read -r p; do [ -e "/$p" ] && echo "$p"; done | sudo tar -C / -czf - -T -' \
      >"$CONF_FILE.tmp" 2>>"$LOG"; then
  if tar -tzf "$CONF_FILE.tmp" 2>/dev/null | grep -qx 'opt/bookkeeping/stack/docker-compose.yml'; then
    mv "$CONF_FILE.tmp" "$CONF_FILE"
    chmod 600 "$CONF_FILE"
  else
    log "ERROR 配置包不完整（缺 compose），已丢弃"
    rm -f "$CONF_FILE.tmp"
    notify "拾光备份异常" "配置包不完整，已丢弃"
  fi
else
  log "ERROR 配置包拉取失败"
  rm -f "$CONF_FILE.tmp"
  notify "拾光备份异常" "配置包拉取失败"
fi

# ---------- 3. 服务器巡检告警 ----------
if ssh $SSH_OPTS "$REMOTE" 'sudo test -f /opt/bookkeeping/state/ALERT-health.txt' 2>/dev/null; then
  if rsync -az -e "ssh $SSH_OPTS" \
        "$REMOTE:/opt/bookkeeping/state/ALERT-health.txt" "$STATE_DIR/" >>"$LOG" 2>&1; then
    ALERT_AGE_H=$(( ( $(date +%s) - $(stat -f %m "$STATE_DIR/ALERT-health.txt") ) / 3600 ))
    if [ "$ALERT_AGE_H" -lt 24 ]; then
      log "ALERT 服务器巡检异常：$(cat "$STATE_DIR/ALERT-health.txt")"
      notify "拾光服务器告警" "$(cat "$STATE_DIR/ALERT-health.txt")"
    fi
  else
    log "WARN 巡检告警文件拉取失败"
  fi
else
  # 服务端无告警文件 = 已恢复，本地副本也要清掉，避免下次误报。
  rm -f "$STATE_DIR/ALERT-health.txt"
fi

# ---------- 4. 保留策略 ----------
COUNT=$(ls -1 "$DUMP_DIR"/daily_*.sql.gz 2>/dev/null | wc -l | tr -d ' ')
ls -1t "$DUMP_DIR"/daily_*.sql.gz 2>/dev/null | tail -n +$((KEEP_DUMPS + 1)) | while read -r f; do rm -f "$f"; done

CONF_COUNT=$(ls -1 "$CONF_DIR"/stack-config-*.tgz 2>/dev/null | wc -l | tr -d ' ')
ls -1t "$CONF_DIR"/stack-config-*.tgz 2>/dev/null | tail -n +$((KEEP_CONF + 1)) | while read -r f; do rm -f "$f"; done

SIZE=$(du -sh "$BASE" | cut -f1)
log "OK 最新=$(basename "$LATEST") 快照${COUNT}份 配置${CONF_COUNT}份 总计${SIZE}"
