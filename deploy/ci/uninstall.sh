#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 金流（bookkeeping）v0.6 —— 推送即自动部署 · 卸载脚本
#
# 用法：
#   sudo bash uninstall.sh          停用并删除 systemd 单元（保留脚本目录、状态、仓库、日志）
#   sudo bash uninstall.sh --purge  上面做完后，再删除 /opt/bookkeeping/ci（含状态文件）
#
# 有意保留的东西：$REPO_DIR（git 克隆）、$LOG_FILE（日志，便于事后排查）、
#                $STACK_DIR、$FRONTEND_PUBLISH、$DUMP_DIR（线上数据与快照都不动）。
# ---------------------------------------------------------------------------

set -uo pipefail
set -E

if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    exec sudo -n bash "$0" "$@"
  fi
  printf '%s\n' "错误：需要 root 权限运行：sudo bash $0" >&2
  exit 1
fi

CI_DIR="${CI_DIR:-/opt/bookkeeping/ci}"
STATE_DIR="${STATE_DIR:-/opt/bookkeeping/ci/state}"
REPO_DIR="${REPO_DIR:-/opt/bookkeeping/repo}"
LOG_FILE="${LOG_FILE:-/var/log/bk-deploy.log}"
UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"
SERVICE_NAME="bk-deploy.service"
TIMER_NAME="bk-deploy.timer"
PURGE=0

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; return 0; }
die() { printf '[%s] ERROR %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2; exit 1; }

usage() {
  printf '%s\n' \
    "用法: sudo bash $0 [--purge]" \
    "" \
    "  （无选项）  停用 timer/service、删除单元、daemon-reload；保留仓库/状态/日志" \
    "  --purge     额外删除 $CI_DIR（脚本与状态文件）" \
    "  --help      显示本帮助"
  return 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --purge)   PURGE=1 ;;
    -h|--help) usage; exit 0 ;;
    *) printf '%s\n' "错误：未知参数 $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if [ -f "$CI_DIR/ci.env" ]; then
  if . "$CI_DIR/ci.env" 2>/dev/null; then
    log "已加载配置 $CI_DIR/ci.env"
  else
    log "警告：$CI_DIR/ci.env 有语法错误，改用默认路径"
  fi
fi

log "=== 卸载 金流推送即自动部署 ==="

if command -v systemctl >/dev/null 2>&1; then
  if systemctl list-unit-files "$TIMER_NAME" 2>/dev/null | grep -q "$TIMER_NAME"; then
    log "停用 $TIMER_NAME"
    systemctl disable --now "$TIMER_NAME" 2>/dev/null || log "警告：disable $TIMER_NAME 返回非 0（可能已停用）"
  else
    log "$TIMER_NAME 未安装，跳过停用"
  fi
  if [ -f "$UNIT_DIR/$SERVICE_NAME" ]; then
    log "停用 $SERVICE_NAME（若正在运行）"
    systemctl disable --now "$SERVICE_NAME" 2>/dev/null || true
    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  fi
else
  log "警告：找不到 systemctl，跳过 systemd 操作"
fi

if [ -f "$UNIT_DIR/$TIMER_NAME" ]; then
  rm -f "$UNIT_DIR/$TIMER_NAME" || die "删除 $UNIT_DIR/$TIMER_NAME 失败"
  log "已删除 $UNIT_DIR/$TIMER_NAME"
fi
if [ -f "$UNIT_DIR/$SERVICE_NAME" ]; then
  rm -f "$UNIT_DIR/$SERVICE_NAME" || die "删除 $UNIT_DIR/$SERVICE_NAME 失败"
  log "已删除 $UNIT_DIR/$SERVICE_NAME"
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload 2>/dev/null || log "警告：daemon-reload 失败"
  systemctl reset-failed "$SERVICE_NAME" 2>/dev/null || true
fi

if [ "$PURGE" = "1" ]; then
  if [ -d "$CI_DIR" ]; then
    log "删除脚本与状态目录：$CI_DIR"
    rm -rf "$CI_DIR" || die "删除 $CI_DIR 失败"
  else
    log "$CI_DIR 不存在，跳过"
  fi
else
  log "保留脚本与状态：$CI_DIR（需要一并删除时用 --purge）"
fi

log "=== 卸载完成（保留仓库与日志）==="
log "  仓库（保留）: $REPO_DIR"
log "  日志（保留）: $LOG_FILE   # 如需删除：sudo rm -f $LOG_FILE"
log "  线上数据（未动）: /opt/bookkeeping/stack、/var/www/frontend、/opt/bookkeeping/dumps"
log "  重新安装: sudo bash $CI_DIR/install.sh（若已 --purge，则需重新上传 deploy/ci/ 或用 --from-github）"
