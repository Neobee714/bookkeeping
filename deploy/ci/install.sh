#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 金流（bookkeeping）v0.6 —— 推送即自动部署 · 安装脚本（幂等）
#
# 用法：
#   sudo bash install.sh                 用本目录下的脚本副本安装/更新
#   sudo bash install.sh --from-github   本机没有脚本副本时，先浅克隆仓库取 deploy/ci/
#
# 做什么（重复执行结果一致，不会重复注册）：
#   1 建目录 /opt/bookkeeping/ci 与 ci/state
#   2 拷贝脚本与单元文件（chmod +x），已存在的 ci.env 不覆盖
#   3 ci.env 缺失时由 ci.env.example 生成
#   4 克隆仓库到 $REPO_DIR（已存在则只确认 origin）
#   5 创建日志 /var/log/bk-deploy.log 并 chown ubuntu:ubuntu
#   6 用 ci.env 里的 POLL_INTERVAL 渲染 bk-deploy.timer
#   7 装单元 → daemon-reload → enable --now bk-deploy.timer
#   8 首跑：deploy.sh --status（只读，不改任何东西）
#
# 注意：本脚本不会碰 /opt/bookkeeping/stack（compose/.env）、/var/www/frontend、
#       /etc/nginx 与 /opt/bookkeeping/dumps 里的任何既有文件。
# ---------------------------------------------------------------------------

set -uo pipefail
set -E

# 非 root 时自动用 sudo 重新执行（用户免密 sudo）
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    exec sudo -n bash "$0" "$@"
  fi
  printf '%s\n' "错误：需要 root 权限运行：sudo bash $0" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 默认值（可被已存在的 /opt/bookkeeping/ci/ci.env 覆盖，保证重复安装不丢配置）
# ---------------------------------------------------------------------------
CI_DIR="${CI_DIR:-/opt/bookkeeping/ci}"
STATE_DIR="${STATE_DIR:-/opt/bookkeeping/ci/state}"
REPO_DIR="${REPO_DIR:-/opt/bookkeeping/repo}"
REPO_URL="${REPO_URL:-https://github.com/Neobee714/bookkeeping.git}"
BRANCH="${BRANCH:-main}"
DUMP_DIR="${DUMP_DIR:-/opt/bookkeeping/dumps}"
LOG_FILE="${LOG_FILE:-/var/log/bk-deploy.log}"
POLL_INTERVAL="${POLL_INTERVAL:-2min}"

UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"
SERVICE_NAME="bk-deploy.service"
TIMER_NAME="bk-deploy.timer"
OWNER="ubuntu"
FROM_GITHUB=0
TMP_DIR=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; return 0; }
die() { printf '[%s] ERROR %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2; exit 1; }

cleanup() {
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR" 2>/dev/null || true
  fi
  return 0
}
trap cleanup EXIT

usage() {
  printf '%s\n' \
    "用法: sudo bash $0 [--from-github]" \
    "" \
    "  （无选项）      用本目录（$(printf '%s' "$SCRIPT_DIR")）下的脚本副本安装/更新" \
    "  --from-github   本地没有脚本副本时，浅克隆 $REPO_URL 取 deploy/ci/ 后再安装" \
    "  --help          显示本帮助"
  return 0
}

# ---------------------------------------------------------------------------
# 1) 参数
# ---------------------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --from-github) FROM_GITHUB=1 ;;
    -h|--help)     usage; exit 0 ;;
    *) printf '%s\n' "错误：未知参数 $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

log "=== 安装 金流推送即自动部署 ==="

# 复用已有配置（幂等：重装时不会把用户改过的 ci.env 丢掉）
if [ -f "$CI_DIR/ci.env" ]; then
  if . "$CI_DIR/ci.env" 2>/dev/null; then
    log "已加载既有配置 $CI_DIR/ci.env"
  else
    die "既有配置有语法错误，请先修正：$CI_DIR/ci.env"
  fi
fi

# ---------------------------------------------------------------------------
# 2) 准备脚本来源
# ---------------------------------------------------------------------------
if [ "$FROM_GITHUB" = "1" ]; then
  command -v git >/dev/null 2>&1 || die "缺少 git，无法从 GitHub 取脚本"
  TMP_DIR="$(mktemp -d)"
  log "从 GitHub 浅克隆取脚本：$REPO_URL（分支 $BRANCH）"
  if ! git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$TMP_DIR" >/dev/null 2>&1; then
    die "浅克隆失败：$REPO_URL（分支 $BRANCH）。检查网络，或改用本地副本安装"
  fi
  SCRIPT_DIR="$TMP_DIR/deploy/ci"
  if [ ! -d "$SCRIPT_DIR" ]; then
    die "仓库里没有 deploy/ci/ 目录（该目录可能尚未提交到 git）。请先 git add deploy/ && git push，或改用本地副本安装"
  fi
fi

FILES="deploy.sh install.sh uninstall.sh ci.env.example $SERVICE_NAME $TIMER_NAME README.md"
missing=""
for f in $FILES; do
  if [ ! -f "$SCRIPT_DIR/$f" ]; then
    missing="$missing $f"
  fi
done
if [ -n "$missing" ]; then
  die "脚本目录 $SCRIPT_DIR 缺少文件：$missing"
fi
log "脚本来源：$SCRIPT_DIR"

# ---------------------------------------------------------------------------
# 3) 目录、文件、权限
# ---------------------------------------------------------------------------
log "创建目录：$CI_DIR $STATE_DIR $DUMP_DIR"
mkdir -p "$CI_DIR" "$STATE_DIR" "$DUMP_DIR" || die "创建目录失败"

log "拷贝脚本与单元文件"
install -m 0755 "$SCRIPT_DIR/deploy.sh"    "$CI_DIR/deploy.sh"    || die "拷贝 deploy.sh 失败"
install -m 0755 "$SCRIPT_DIR/install.sh"   "$CI_DIR/install.sh"   || die "拷贝 install.sh 失败"
install -m 0755 "$SCRIPT_DIR/uninstall.sh" "$CI_DIR/uninstall.sh" || die "拷贝 uninstall.sh 失败"
install -m 0644 "$SCRIPT_DIR/ci.env.example" "$CI_DIR/ci.env.example" || die "拷贝 ci.env.example 失败"
install -m 0644 "$SCRIPT_DIR/README.md"      "$CI_DIR/README.md"      || die "拷贝 README.md 失败"
install -m 0644 "$SCRIPT_DIR/$SERVICE_NAME"  "$CI_DIR/$SERVICE_NAME"  || die "拷贝 $SERVICE_NAME 失败"
install -m 0644 "$SCRIPT_DIR/$TIMER_NAME"    "$CI_DIR/$TIMER_NAME"    || die "拷贝 $TIMER_NAME 失败"

if [ -f "$CI_DIR/ci.env" ]; then
  log "配置已存在，保留不动：$CI_DIR/ci.env"
else
  install -m 0644 "$CI_DIR/ci.env.example" "$CI_DIR/ci.env" || die "生成 ci.env 失败"
  log "已由模板生成配置：$CI_DIR/ci.env（如需修改 PUBLIC_HOST/POLL_INTERVAL 等，改完重跑本脚本）"
fi

# 状态目录与脚本目录归 ubuntu（deploy.sh 以 ubuntu 身份写状态文件）
chown -R "$OWNER:$OWNER" "$CI_DIR" || die "chown $CI_DIR 失败"
chmod 0755 "$CI_DIR"
chmod 0755 "$CI_DIR/deploy.sh" "$CI_DIR/install.sh" "$CI_DIR/uninstall.sh"

if [ -f "$LOG_FILE" ]; then
  log "日志文件已存在：$LOG_FILE"
else
  touch "$LOG_FILE" || die "创建日志文件失败：$LOG_FILE"
  log "已创建日志文件：$LOG_FILE"
fi
chown "$OWNER:$OWNER" "$LOG_FILE" || die "chown $LOG_FILE 失败"
chmod 0644 "$LOG_FILE"

# ---------------------------------------------------------------------------
# 4) 仓库
# ---------------------------------------------------------------------------
command -v git >/dev/null 2>&1 || die "缺少 git"
mkdir -p "$(dirname "$REPO_DIR")"
if [ -d "$REPO_DIR/.git" ]; then
  log "仓库已存在：$REPO_DIR（跳过克隆）"
  if git -C "$REPO_DIR" remote set-url origin "$REPO_URL" 2>/dev/null; then
    log "已确认 origin = $REPO_URL"
  else
    log "警告：无法设置 origin（请手动检查 $REPO_DIR）"
  fi
elif [ -d "$REPO_DIR" ] && [ -n "$(ls -A "$REPO_DIR" 2>/dev/null || true)" ]; then
  log "警告：$REPO_DIR 存在且非空，但不是 git 仓库 —— 跳过克隆，请手动处理后重跑本脚本"
else
  log "克隆仓库：$REPO_URL（分支 $BRANCH） → $REPO_DIR"
  if ! git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"; then
    die "克隆失败：$REPO_URL"
  fi
fi
if [ -d "$REPO_DIR/.git" ]; then
  if [ "$(stat -c '%U' "$REPO_DIR" 2>/dev/null || printf 'unknown')" != "$OWNER" ]; then
    chown -R "$OWNER:$OWNER" "$REPO_DIR" || log "警告：chown $REPO_DIR 失败（deploy.sh 可能无法 fetch）"
    log "已把 $REPO_DIR 归属改为 $OWNER"
  fi
fi

# ---------------------------------------------------------------------------
# 5) systemd 单元
# ---------------------------------------------------------------------------
PATTERN='^[0-9]+(s|sec|secs|m|min|mins|h|hr|hour|hours)?$'
if [[ ! "$POLL_INTERVAL" =~ $PATTERN ]]; then
  die "POLL_INTERVAL 不合法：$POLL_INTERVAL（可用 systemd 时间单位，如 90s / 2min / 1h）"
fi
if [ "${#POLL_INTERVAL}" -gt 8 ]; then
  die "POLL_INTERVAL 过长：$POLL_INTERVAL"
fi

log "安装 systemd 单元：$SERVICE_NAME / $TIMER_NAME（轮询周期 $POLL_INTERVAL）"
mkdir -p "$UNIT_DIR" || die "创建单元目录失败：$UNIT_DIR"
install -m 0644 "$CI_DIR/$SERVICE_NAME" "$UNIT_DIR/$SERVICE_NAME" || die "安装 $SERVICE_NAME 失败"

tmp_timer="$(mktemp)"
sed "s|__POLL_INTERVAL__|$POLL_INTERVAL|g" "$CI_DIR/$TIMER_NAME" > "$tmp_timer" || die "渲染 $TIMER_NAME 失败"
if grep -q '__POLL_INTERVAL__' "$tmp_timer"; then
  rm -f "$tmp_timer"
  die "渲染 $TIMER_NAME 失败：占位符 __POLL_INTERVAL__ 未替换"
fi
install -m 0644 "$tmp_timer" "$UNIT_DIR/$TIMER_NAME" || die "安装 $TIMER_NAME 失败"
rm -f "$tmp_timer"

systemctl daemon-reload || die "systemctl daemon-reload 失败"
systemctl enable --now "$TIMER_NAME" || die "启用 $TIMER_NAME 失败"
# 重装时让新的 POLL_INTERVAL 立即生效（enable --now 不会重启已 active 的 timer）
systemctl restart "$TIMER_NAME" 2>/dev/null || log "警告：重启 $TIMER_NAME 失败（不影响已启用状态）"
log "timer 状态：$(systemctl is-enabled "$TIMER_NAME" 2>/dev/null || printf 'unknown') / $(systemctl is-active "$TIMER_NAME" 2>/dev/null || printf 'unknown')"

# ---------------------------------------------------------------------------
# 6) 首跑：只读状态
# ---------------------------------------------------------------------------
log "=== 首跑 deploy.sh --status（只读检查）==="
if command -v sudo >/dev/null 2>&1; then
  sudo -u "$OWNER" -H bash "$CI_DIR/deploy.sh" --status || log "警告：--status 返回非 0，请查看上面的输出"
else
  bash "$CI_DIR/deploy.sh" --status || log "警告：--status 返回非 0，请查看上面的输出"
fi

log "=== 安装完成 ==="
log "  脚本/配置 : $CI_DIR"
log "  状态文件  : $STATE_DIR"
log "  仓库      : $REPO_DIR"
log "  日志      : $LOG_FILE"
log "  轮询周期  : $POLL_INTERVAL（改 ci.env 后重跑本脚本生效）"
log "  查看状态  : sudo $CI_DIR/deploy.sh --status"
log "  立即部署  : sudo systemctl start $SERVICE_NAME"
log "  停用自动部署: sudo systemctl disable --now $TIMER_NAME"
log "  下一步    : 把本目录（deploy/ci/）提交进 git，否则服务器上只有这份副本、改不进版本历史"
