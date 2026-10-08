#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 金流（bookkeeping）v0.6 —— 推送即自动部署 · 主脚本
#
# 运行位置：/opt/bookkeeping/ci/deploy.sh（由 install.sh 安装）
#   —— 有意放在仓库之外：仓库里的改动不会自动变成"服务器要执行的代码"。
#   仓库里 deploy/ci/deploy.sh 只是版本的存档，改完要重新运行 install.sh 才生效。
#
# 用法：
#   deploy.sh              执行一轮（systemd bk-deploy.timer 每 POLL_INTERVAL 调用）
#   deploy.sh --status     只打印状态（仓库 HEAD / origin 分支 / 最近成功 / 失败记录 /
#                          是否需要部署 / timer 状态 / 最近快照），永远退出 0
#   deploy.sh --retry      先清除失败标记，再立即执行一轮
#   deploy.sh --dry-run    只打印本轮"将会做什么"，不产生任何副作用
#   deploy.sh --help       本帮助
#
# 退出码：0=成功或无事可做（含"无需部署""另一轮进行中，跳过"）；1=部署失败（已写 ALERT）
#         2=参数/配置错误
#
# 设计要点：
#   - 无新提交时零开销退出：一次 git fetch，然后与 state/last-deployed.txt 比对即返回，
#     不 rsync、不 build、不重启、不写状态文件。
#   - 按变更目录决定动作：backend/ → 后端；frontend/ → 前端；deploy/nginx.conf → nginx；
#     deploy/ci/ → 只提示（不自更新）；其它（mobile/、docs/ 等）→ 只记录，不动作。
#   - 失败"停手"：任一步失败即写 state/failed-sha.txt + state/ALERT.txt，并在后续轮次里
#     停止自动重试该提交（修好代码 push 新提交，或 --retry 手动重试）。
#   - 迁移前自动快照数据库（只保留最近 KEEP_DUMPS 份 pre-deploy_*，基线 dump 绝不动）。
#   - 绝不执行 deploy/server-deploy.sh（那是从 dump 恢复数据库的全量重建，会覆盖线上数据）。
#
# 日志：统一前缀 [YYYY-MM-DD HH:MM:SS]；失败行含"步骤 / 命令 / 退出码"。
#   日志落点：默认由脚本追加写 $LOG_FILE；若 stdout 已经是同一个文件（手动 `... >> $LOG_FILE`）
#   则不重复写。systemd 的 `append:` 场景由单元的 Environment=BK_DEPLOY_LOG_TO_FILE=0 显式声明
#   （systemd 会把 fd1 接到 pipe 上，靠 fd1 探测不可靠）。可用 BK_DEPLOY_LOG_TO_FILE=0/1 手动覆盖。
# ---------------------------------------------------------------------------

set -uo pipefail
# -E（errtrace）：让 ERR trap 在函数、子 shell 内同样生效。
# 注意：故意不用 `set -e` —— 它会在第一个失败处静默退出，掩盖"哪一步、哪条命令"。
# 所有关键步骤都显式判断（run_step/run_step_sh/run_step_in），ERR trap 只是兜底。
set -E
# 补齐常用命令目录（systemd 单元的 PATH 很干净）；只在末尾追加，不改变既有优先顺序
export PATH="${PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export HOME="${HOME:-/home/ubuntu}"

SELF="${BASH_SOURCE[0]:-$0}"

# ---------------------------------------------------------------------------
# 1) 内置默认值（随后被 /opt/bookkeeping/ci/ci.env 覆盖；键见 ci.env.example）
# ---------------------------------------------------------------------------
CONFIG_FILE="${CI_CONFIG:-/opt/bookkeeping/ci/ci.env}"

BRANCH="${BRANCH:-main}"
REPO_URL="${REPO_URL:-https://github.com/Neobee714/bookkeeping.git}"
REPO_DIR="${REPO_DIR:-/opt/bookkeeping/repo}"
STATE_DIR="${STATE_DIR:-/opt/bookkeeping/ci/state}"
STACK_DIR="${STACK_DIR:-/opt/bookkeeping/stack}"
FRONTEND_SRC="${FRONTEND_SRC:-/opt/bookkeeping/frontend}"
FRONTEND_PUBLISH="${FRONTEND_PUBLISH:-/var/www/frontend}"
PUBLIC_HOST="${PUBLIC_HOST:-api.bookkeeping.neobee.top}"
DUMP_DIR="${DUMP_DIR:-/opt/bookkeeping/dumps}"
KEEP_DUMPS="${KEEP_DUMPS:-5}"
LOG_FILE="${LOG_FILE:-/var/log/bk-deploy.log}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:18080/health}"
POLL_INTERVAL="${POLL_INTERVAL:-2min}"

# 高级覆盖项（默认即现网值；只在测试/迁移时用环境变量覆盖，不放进 ci.env.example）
FRONTEND_BUILD_SCRIPT="${FRONTEND_BUILD_SCRIPT:-/opt/bookkeeping/deploy-build-frontend.sh}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/bookkeeping}"
NGINX_SERVICE="${NGINX_SERVICE:-nginx}"

# 固定常量：与 /opt/bookkeeping/stack/docker-compose.yml 一致，不作为配置项开放
DB_CONTAINER="neobee-db"
DB_USER="neo"
DB_NAME="bookkeeping"

# 健康检查参数：最多 30 次 × 2 秒 = 60 秒
HEALTH_RETRIES=30
HEALTH_INTERVAL=2

# ---------------------------------------------------------------------------
# 2) 运行期变量（先初始化，避免 set -u 报未绑定变量）
# ---------------------------------------------------------------------------
MODE="deploy"        # deploy | status
DRY_RUN=0
RETRY=0
TARGET=""            # 本轮目标提交（origin/<BRANCH> 的完整 SHA）
SHORT=""             # 目标提交短 SHA（前 7 位）
LAST=""              # 上次成功部署的提交 SHA
CHANGED_FILES=""     # 变更文件列表（换行分隔）
ALL_CHANGED=0        # 1=无法比对历史（首次部署 / 记录失效）→ 视为全部变更
BACKEND_CHANGED=0
FRONTEND_CHANGED=0
NGINX_CHANGED=0
LOCK_CHANGED=0       # frontend/package-lock.json 是否变化（决定是否 npm ci）
CI_CHANGED=0         # deploy/ci/** 变化（只提示，不自我更新）
OTHER_FILES=""       # 其它变更（只记录）
CURRENT_STEP="init"  # 当前步骤名（失败行里显示它）
IN_ERROR=0
START_EPOCH=0
ENV_BACKUP=""        # stack/backend/.env 的临时备份路径

# ---------------------------------------------------------------------------
# 3) 日志与失败处理
# ---------------------------------------------------------------------------
# 日志落点（为什么需要判定）：systemd 单元用 StandardOutput/StandardError=append:/var/log/...
# 归集日志，此时日志已经由 systemd 落盘；脚本再自己写一遍就会**每行重复两次**。
# 但**不能只靠 `readlink -f /proc/self/fd/1` 比较**：systemd 255 实测会把 fd1 接到一个 pipe 上
# （readlink -f 得到 "pipe:[...]"），永远不等于日志路径，于是误判成"要自己写"→ 重复。
# 因此按下述优先级判定（实现见 resolve_log_target()，调用在所有配置加载之后）：
#   1) 环境变量 BK_DEPLOY_LOG_TO_FILE=0/1（显式优先；systemd 单元里写 0）
#   2) `[ /proc/self/fd/1 -ef "$LOG_FILE" ]`（同 inode/设备比较，比字符串比较可靠）
#   3) readlink -f 字符串比较（兜底）
#   4) 都判不了 → 1（宁可由脚本写，也不要丢日志）
LOG_TO_FILE=1          # 1=脚本自己追加写 $LOG_FILE；0=不写（由 systemd 的 append: 负责）
LOG_TARGET_METHOD=""   # 判定依据：explicit / same-inode / readlink / default
CONFIG_NOTE=""         # ci.env 的加载结果说明（等日志落点定下来之后再打，避免写到错误的地方）

log() {
  local line
  line="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  printf '%s\n' "$line"
  if [ "$LOG_TO_FILE" = "1" ]; then
    printf '%s\n' "$line" >> "$LOG_FILE" 2>/dev/null || true
  fi
  return 0
}

# fail <步骤名> <失败原因> <命令> <退出码>：记录可定位的失败信息 → 写 ALERT → 退出 1
fail() {
  local step="$1" desc="$2" cmd="$3" code="$4" short="" alert=""

  if [ "$IN_ERROR" = "1" ]; then
    log "ERROR 步骤=$step 命令=$cmd 退出码=$code（错误处理过程中再次失败）"
    exit 1
  fi
  IN_ERROR=1
  trap - ERR

  log "ERROR 步骤=$step 命令=$cmd 退出码=$code"
  if [ -n "$desc" ]; then log "失败原因：$desc"; fi

  # 紧急兜底：stack/backend/.env 已备份但被 rsync --delete 清掉时，先还原，避免 compose 起不来
  if [ -n "$ENV_BACKUP" ] && [ -f "$ENV_BACKUP" ] && [ ! -f "$STACK_DIR/backend/.env" ]; then
    if sudo cp -a "$ENV_BACKUP" "$STACK_DIR/backend/.env" 2>/dev/null; then
      log "已紧急还原 $STACK_DIR/backend/.env"
    else
      log "警告：紧急还原 .env 失败，请手动处理（备份文件：$ENV_BACKUP）"
    fi
  fi

  if [ "$DRY_RUN" = "1" ]; then
    log "[dry-run] 不写状态文件（failed-sha.txt / ALERT.txt）"
    exit 1
  fi

  if [ -n "$TARGET" ]; then
    short="${TARGET:0:7}"
    printf '%s\n' "$TARGET" > "$STATE_DIR/failed-sha.txt" 2>/dev/null \
      || log "警告：无法写入 $STATE_DIR/failed-sha.txt（请检查目录权限）"
  else
    log "尚未确定目标提交，未写失败标记（下一轮会重新尝试）"
  fi

  alert="$(date '+%Y-%m-%d %H:%M') 部署失败：${step} 失败（提交 ${short:-未知}，退出码 ${code}），已停止自动重试；日志：$LOG_FILE；建议：看日志定位后修复并 push 新提交，或执行 sudo $SELF --retry 重试"
  printf '%s\n' "$alert" > "$STATE_DIR/ALERT.txt" 2>/dev/null \
    || log "警告：无法写入 $STATE_DIR/ALERT.txt（请检查目录权限）"

  log "失败提交已记录（${short:-未知}），自动重试已停止：修复后 push 新提交，或执行 sudo $SELF --retry"
  exit 1
}

# ERR trap 兜底：任何没被显式处理的失败都会走到这里
on_error() {
  fail "$CURRENT_STEP" "未预期的失败（$SELF:$1）" "$2" "${3:-1}"
}

# systemd 超时（TimeoutStartSec=1800）会发 SIGTERM；记录下来，免得"被砍掉却没有任何痕迹"
on_signal() {
  fail "$CURRENT_STEP" "收到 $1 信号，部署被中断（可能是 systemd 超时或被手动取消）" "signal $1" 143
}

trap 'on_error "$LINENO" "$BASH_COMMAND" "$?"' ERR
trap 'on_signal TERM' TERM
trap 'on_signal INT' INT

# ---------------------------------------------------------------------------
# 4) 小工具
# ---------------------------------------------------------------------------
usage() {
  printf '%s\n' \
    "用法: $SELF [选项]" \
    "" \
    "  （无选项）    执行一轮：拉取 → 判定变更 → 按需部署后端/前端/nginx" \
    "  --status      只打印状态，不做任何改动（永远退出 0）" \
    "  --retry       清除失败标记后立即执行一轮（用于重试上次失败的提交）" \
    "  --dry-run     只打印本轮将会做什么，不产生任何副作用" \
    "  --help        显示本帮助" \
    "" \
    "退出码: 0=成功/无事可做   1=部署失败（已写 ALERT）   2=参数或配置错误" \
    "配置文件: $CONFIG_FILE（不存在则用内置默认值）" \
    "日志文件: $LOG_FILE"
  return 0
}

# 读取状态文件（不存在或空白则输出空），自动去掉换行与空白
read_state() {
  local f="$STATE_DIR/$1"
  if [ -f "$f" ]; then
    tr -d '[:space:]' < "$f" 2>/dev/null || true
  fi
  return 0
}

# 是否（把 0/1 显示成"是/否"）
yn() {
  if [ "$1" = "1" ]; then printf '是'; else printf '否'; fi
  return 0
}

# 读取配置：只读 ci.env，不在这里打日志 —— 日志落点要等 $LOG_FILE 确定后才能判定，
# 否则可能出现"用内置默认 LOG_FILE 判定、却按 ci.env 里的 LOG_FILE 写"的错位。
source_config() {
  CONFIG_NOTE=""
  if [ ! -f "$CONFIG_FILE" ]; then
    CONFIG_NOTE="未找到配置文件 $CONFIG_FILE，使用内置默认值"
    return 0
  fi
  if . "$CONFIG_FILE" 2>/dev/null; then
    CONFIG_NOTE="已加载配置 $CONFIG_FILE"
    return 0
  fi
  printf '%s\n' "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR 配置文件无法读取或有语法错误：$CONFIG_FILE" >&2
  exit 2
}

# 判定"脚本要不要自己写 $LOG_FILE"，必须在 source_config 之后调用（这时的 $LOG_FILE 才是最终值）
resolve_log_target() {
  LOG_TO_FILE=1
  LOG_TARGET_METHOD="default"
  local explicit="${BK_DEPLOY_LOG_TO_FILE:-}"

  # 1) 显式指定优先（0/1 之外的值忽略，并给一行提示）
  if [ -n "$explicit" ]; then
    case "$explicit" in
      0|1)
        LOG_TO_FILE="$explicit"
        LOG_TARGET_METHOD="explicit"
        return 0
        ;;
      *)
        log "提示：BK_DEPLOY_LOG_TO_FILE=$explicit 不是 0/1，已忽略（按自动判定处理）"
        ;;
    esac
  fi

  # 2)/3) 只在日志文件已存在时比较：不存在说明还没人建它，按"由脚本写"处理
  if [ -e "$LOG_FILE" ]; then
    # 同 inode/设备比较：systemd append: 场景下 fd1 是 pipe，这里会是"否"，不会误判
    if [ /proc/self/fd/1 -ef "$LOG_FILE" ]; then
      LOG_TO_FILE=0
      LOG_TARGET_METHOD="same-inode"
      return 0
    fi
    # 兜底：readlink -f 字符串比较（对符号链接路径等情况仍有用）
    local stdout_target="" log_file_real=""
    stdout_target="$(readlink -f /proc/self/fd/1 2>/dev/null || true)"
    log_file_real="$(readlink -f "$LOG_FILE" 2>/dev/null || true)"
    if [ -n "$stdout_target" ] && [ -n "$log_file_real" ] && [ "$stdout_target" = "$log_file_real" ]; then
      LOG_TO_FILE=0
      LOG_TARGET_METHOD="readlink"
      return 0
    fi
  fi

  # 4) 判不出来 → 由脚本自己写（宁可重复一行，也不要丢日志）
  LOG_TO_FILE=1
  return 0
}

# 日志落点的人话说明（给 --status 用）
log_target_desc() {
  if [ "$LOG_TO_FILE" = "1" ]; then
    printf '脚本自己追加写（判定依据：%s）' "$LOG_TARGET_METHOD"
  else
    printf '不写（由 systemd 的 append: 落盘；判定依据：%s）' "$LOG_TARGET_METHOD"
  fi
  return 0
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --status)  MODE="status" ;;
      --retry)   RETRY=1 ;;
      --dry-run) DRY_RUN=1 ;;
      -h|--help) usage; exit 0 ;;
      *)
        printf '%s\n' "错误：未知参数 $1" >&2
        usage >&2
        exit 2
        ;;
    esac
    shift
  done
  return 0
}

# run_step <步骤说明> <命令...>：执行命令；失败即走统一失败处理（含步骤/命令/退出码）
run_step() {
  local desc="$1"; shift
  if [ "$DRY_RUN" = "1" ]; then
    log "  [dry-run] 将执行：$desc → $*"
    return 0
  fi
  log "  $desc"
  if "$@"; then
    return 0
  else
    fail "$CURRENT_STEP" "$desc" "$*" "$?"
  fi
}

# run_step_sh <步骤说明> <shell 命令串>：管道等需要 shell 语法的场合（串内自带 set -o pipefail）
run_step_sh() {
  local desc="$1" cmd="$2"
  if [ "$DRY_RUN" = "1" ]; then
    log "  [dry-run] 将执行：$desc → $cmd"
    return 0
  fi
  log "  $desc"
  if bash -c "$cmd"; then
    return 0
  else
    fail "$CURRENT_STEP" "$desc" "$cmd" "$?"
  fi
}

# run_step_in <目录> <步骤说明> <命令...>：在指定目录里执行（compose 需要 cwd = STACK_DIR）
run_step_in() {
  local dir="$1" desc="$2"; shift 2
  if [ "$DRY_RUN" = "1" ]; then
    log "  [dry-run] 将执行：$desc → (cd $dir && $*)"
    return 0
  fi
  log "  $desc"
  if ( cd "$dir" && "$@" ); then
    return 0
  else
    fail "$CURRENT_STEP" "$desc" "cd $dir && $*" "$?"
  fi
}

# ---------------------------------------------------------------------------
# 5) 仓库：克隆/拉取/判定目标提交
# ---------------------------------------------------------------------------
prepare_repo() {
  CURRENT_STEP="git"

  if [ ! -d "$REPO_DIR/.git" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      log "  [dry-run] 仓库不存在（$REPO_DIR）：真实运行会执行 git clone --branch $BRANCH $REPO_URL $REPO_DIR"
      log "  [dry-run] dry-run 不克隆、不写盘，故无法给出变更集合"
      exit 0
    fi
    local parent
    parent="$(dirname "$REPO_DIR")"
    if [ ! -w "$parent" ]; then
      fail "$CURRENT_STEP" "无法在 $parent 下创建仓库（目录不可写）。请先运行：sudo bash /opt/bookkeeping/ci/install.sh" \
        "test -w $parent" 1
    fi
    run_step "克隆仓库（首次）" git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
  else
    if [ ! -w "$REPO_DIR/.git" ]; then
      fail "$CURRENT_STEP" "仓库目录不可写（$REPO_DIR），无法 fetch。请运行：sudo bash /opt/bookkeeping/ci/install.sh" \
        "test -w $REPO_DIR/.git" 1
    fi
    if [ "$DRY_RUN" = "1" ]; then
      # dry-run 也要 fetch：这是只读操作（不动工作副本），否则变更判定会基于过期的 origin/<BRANCH>
      log "  [dry-run] 拉取远端 $BRANCH（只读，为了让变更集合准确）"
      if git -C "$REPO_DIR" fetch --prune --quiet origin "$BRANCH"; then
        log "  已拉取远端 $BRANCH"
      else
        log "  警告：fetch 失败，下面的变更判定可能基于过期数据"
      fi
    else
      run_step "拉取远端 $BRANCH" git -C "$REPO_DIR" fetch --prune --quiet origin "$BRANCH"
    fi
  fi

  if TARGET="$(git -C "$REPO_DIR" rev-parse "origin/$BRANCH" 2>/dev/null)"; then
    TARGET="$(printf '%s' "$TARGET" | tr -d '[:space:]')"
  else
    fail "$CURRENT_STEP" "无法解析 origin/$BRANCH（远端没有该分支，或 fetch 未成功）" \
      "git -C $REPO_DIR rev-parse origin/$BRANCH" 1
  fi
  if [ -z "$TARGET" ]; then
    fail "$CURRENT_STEP" "origin/$BRANCH 解析结果为空" "git -C $REPO_DIR rev-parse origin/$BRANCH" 1
  fi
  SHORT="${TARGET:0:7}"
  log "远端 $BRANCH = $SHORT"
  return 0
}

# 与上次成功比对：相同 → 零开销退出
check_already_deployed() {
  LAST="$(read_state last-deployed.txt)"
  if [ -n "$LAST" ] && [ "$LAST" = "$TARGET" ]; then
    # 这里不做任何 rsync / build / 重启 / 状态写入
    log "无需部署：$BRANCH 仍为 $SHORT"
    exit 0
  fi
  return 0
}

# 失败提交不再自动重试
check_failed_marker() {
  local failed_sha=""
  failed_sha="$(read_state failed-sha.txt)"
  if [ -n "$failed_sha" ] && [ "$failed_sha" = "$TARGET" ] && [ "$RETRY" != "1" ]; then
    log "该提交上次部署失败，已停止自动重试（--retry 可重试）"
    log "  失败提交：$SHORT"
    if [ -f "$STATE_DIR/ALERT.txt" ]; then
      log "  ALERT：$(head -n 1 "$STATE_DIR/ALERT.txt" 2>/dev/null || true)"
    fi
    log "  处理方式：修复后 push 新提交，或执行 sudo $SELF --retry"
    exit 1
  fi
  return 0
}

# 变更集合：git diff --name-only 上次成功..目标；无历史基线时视为全部变更
collect_changes() {
  if [ -z "$LAST" ]; then
    log "没有上次成功记录（首次部署），按全部变更处理"
    ALL_CHANGED=1
  elif ! git -C "$REPO_DIR" cat-file -e "${LAST}^{commit}" 2>/dev/null; then
    log "上次记录 ${LAST:0:7} 在仓库中已不存在（force-push 或记录失效），按全部变更处理"
    ALL_CHANGED=1
  fi

  if [ "$ALL_CHANGED" = "1" ]; then
    CHANGED_FILES=""
    return 0
  fi
  if CHANGED_FILES="$(git -C "$REPO_DIR" diff --name-only "$LAST" "$TARGET" 2>/dev/null)"; then
    return 0
  else
    fail "git" "无法计算变更集合（git diff $LAST $TARGET）" "git -C $REPO_DIR diff --name-only" 1
  fi
}

# 按路径前缀决定动作
classify_changes() {
  BACKEND_CHANGED=0
  FRONTEND_CHANGED=0
  NGINX_CHANGED=0
  LOCK_CHANGED=0
  CI_CHANGED=0
  OTHER_FILES=""

  if [ "$ALL_CHANGED" = "1" ]; then
    BACKEND_CHANGED=1
    FRONTEND_CHANGED=1
    NGINX_CHANGED=1
    LOCK_CHANGED=1
    return 0
  fi

  local f
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    case "$f" in
      backend/*)                  BACKEND_CHANGED=1 ;;
      frontend/package-lock.json) FRONTEND_CHANGED=1; LOCK_CHANGED=1 ;;
      frontend/*)                 FRONTEND_CHANGED=1 ;;
      deploy/nginx.conf)          NGINX_CHANGED=1 ;;
      deploy/ci/*)                CI_CHANGED=1 ;;
      *)                          OTHER_FILES="$OTHER_FILES $f" ;;
    esac
  done <<< "$CHANGED_FILES"
  return 0
}

print_change_plan() {
  log "变更判定：backend=$(yn "$BACKEND_CHANGED")  frontend=$(yn "$FRONTEND_CHANGED")  nginx=$(yn "$NGINX_CHANGED")  ci=$(yn "$CI_CHANGED")"

  if [ "$ALL_CHANGED" = "1" ]; then
    log "变更集合：全部（首次部署或无可用历史基线）"
  else
    local n=0 f
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      n=$((n + 1))
      if [ "$n" -le 30 ]; then log "    $f"; fi
    done <<< "$CHANGED_FILES"
    if [ "$n" -gt 30 ]; then log "    …（另有 $((n - 30)) 个文件）"; fi
    log "变更集合共 $n 个文件"
  fi

  if [ "$LOCK_CHANGED" = "1" ]; then
    log "注意：frontend/package-lock.json 有变更 → 本轮需要 npm ci"
  fi
  if [ "$CI_CHANGED" = "1" ]; then
    log "提示：变更含 deploy/ci/ —— 运行中的脚本不随仓库自更新（有意为之）；需要时执行：sudo bash /opt/bookkeeping/ci/install.sh"
  fi
  if [ -n "$OTHER_FILES" ]; then
    log "只记录不动作（mobile/、docs/ 等）：$OTHER_FILES"
  fi
  return 0
}

# 只检查本轮真正会用到的命令，缺什么一次性说清楚（在改动任何东西之前）
preflight() {
  local missing=() t
  for t in git flock; do
    command -v "$t" >/dev/null 2>&1 || missing+=("$t")
  done
  if [ "$BACKEND_CHANGED" = "1" ]; then
    for t in sudo docker rsync curl; do
      command -v "$t" >/dev/null 2>&1 || missing+=("$t")
    done
  fi
  if [ "$FRONTEND_CHANGED" = "1" ]; then
    for t in sudo rsync npm; do
      command -v "$t" >/dev/null 2>&1 || missing+=("$t")
    done
  fi
  if [ "$NGINX_CHANGED" = "1" ]; then
    for t in sudo nginx systemctl; do
      command -v "$t" >/dev/null 2>&1 || missing+=("$t")
    done
  fi
  if [ "${#missing[@]}" -gt 0 ]; then
    fail "$CURRENT_STEP" "缺少必需的命令：${missing[*]}" "command -v" 127
  fi
  return 0
}

update_worktree() {
  if [ "$DRY_RUN" = "1" ]; then
    log "  [dry-run] 将执行：git -C $REPO_DIR reset --hard $SHORT  &&  git -C $REPO_DIR clean -fdq"
    return 0
  fi
  run_step "更新工作副本到 $SHORT（git reset --hard）" git -C "$REPO_DIR" reset --hard --quiet "$TARGET"
  run_step "清理工作副本未跟踪文件（git clean -fdq）" git -C "$REPO_DIR" clean -fdq
  return 0
}

# ---------------------------------------------------------------------------
# 6) 后端部署：同步源码(保留 .env) → 构建 → 迁移前快照 → 迁移 → 重启 → 探活
# ---------------------------------------------------------------------------
ensure_dump_dir() {
  if [ "$DRY_RUN" = "1" ]; then
    log "  [dry-run] 将执行：sudo mkdir -p $DUMP_DIR"
    return 0
  fi
  run_step "确保快照目录存在（$DUMP_DIR）" sudo mkdir -p "$DUMP_DIR"
  return 0
}

# 清理旧快照：只匹配 pre-deploy_*，基线 dump（如 bookkeeping_20260527_194951.sql.gz）绝不触碰
prune_dumps() {
  local keep="$KEEP_DUMPS"
  if [ "$keep" -le 0 ] 2>/dev/null; then
    log "  KEEP_DUMPS=$keep，跳过清理"
    return 0
  fi
  if [ "$DRY_RUN" = "1" ]; then
    log "  [dry-run] 将清理 $DUMP_DIR 下超过 $keep 份的 pre-deploy_* 快照"
    return 0
  fi
  local files="" f
  files="$(ls -1t "$DUMP_DIR"/pre-deploy_*.sql.gz 2>/dev/null | tail -n +$((keep + 1)) || true)"
  if [ -z "$files" ]; then
    log "  快照数量未超过 $keep 份，无需清理"
    return 0
  fi
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    run_step "清理旧快照 $(basename "$f")" sudo rm -f "$f"
  done <<< "$files"
  return 0
}

health_check() {
  if [ "$DRY_RUN" = "1" ]; then
    log "  [dry-run] 将轮询 $HEALTH_URL（最多 ${HEALTH_RETRIES} 次 × ${HEALTH_INTERVAL}s，需返回 200）"
    return 0
  fi
  local i=1 code=""
  while [ "$i" -le "$HEALTH_RETRIES" ]; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" 2>/dev/null || true)"
    if [ "$code" = "200" ]; then
      log "  /health 探活通过（第 $i 次尝试，HTTP 200）"
      return 0
    fi
    sleep "$HEALTH_INTERVAL"
    i=$((i + 1))
  done
  fail "$CURRENT_STEP" "健康检查失败：$HEALTH_URL 未返回 200（最后状态码：${code:-无响应}）" "curl $HEALTH_URL" 1
}

deploy_backend() {
  CURRENT_STEP="backend"
  log "backend：开始部署（同步源码 → 构建镜像 → 迁移前快照 → 迁移 → 重启 → 探活）"

  # 1) 备份服务器侧 .env（stack/backend 是部署产物目录，会被 rsync --delete 覆盖）
  ENV_BACKUP=""
  if [ -f "$STACK_DIR/backend/.env" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      log "  [dry-run] 将备份 $STACK_DIR/backend/.env，rsync 后还原"
    else
      ENV_BACKUP="$STATE_DIR/.env.backup.$$"
      run_step "备份 $STACK_DIR/backend/.env" sudo cp -a "$STACK_DIR/backend/.env" "$ENV_BACKUP"
    fi
  else
    log "  （$STACK_DIR/backend/.env 不存在，跳过备份）"
  fi

  # 2) 同步源码（--delete 保持与仓库一致）
  #    --checksum：按内容比对，而不是 rsync 默认的"大小 + 秒级 mtime"。
  #    否则"内容改了但字节数不变、且 mtime 落在同一秒"的文件会被判为未变而漏同步（实测踩到过）。
  run_step "同步源码到 $STACK_DIR/backend/" \
    sudo rsync -a --checksum --delete "$REPO_DIR/backend/" "$STACK_DIR/backend/"

  # 3) 还原 .env
  if [ -n "$ENV_BACKUP" ]; then
    run_step "还原 $STACK_DIR/backend/.env" sudo cp -a "$ENV_BACKUP" "$STACK_DIR/backend/.env"
  fi

  # 4) 构建镜像
  run_step_in "$STACK_DIR" "构建后端镜像（docker compose build backend）" sudo -E docker compose build backend

  # 5) 迁移前数据库快照（保留最近 KEEP_DUMPS 份；用 sudo tee 写，避免目录 root 属主导致写不进）
  ensure_dump_dir
  local dump="" dump_cmd=""
  dump="$DUMP_DIR/pre-deploy_${SHORT}_$(date '+%Y%m%d_%H%M%S').sql.gz"
  printf -v dump_cmd 'set -o pipefail; sudo docker exec %s pg_dump -U %s -d %s --no-owner --no-privileges | gzip | sudo tee %q > /dev/null' \
    "$DB_CONTAINER" "$DB_USER" "$DB_NAME" "$dump"
  run_step_sh "迁移前数据库快照 → $dump" "$dump_cmd"
  prune_dumps

  # 6) 数据库迁移（可重复执行，不会因为跑两次而报错）
  run_step_in "$STACK_DIR" "执行数据库迁移（docker compose run --rm backend python -m alembic upgrade head）" \
    sudo -E docker compose run --rm backend python -m alembic upgrade head

  # 7) 重启后端容器
  run_step_in "$STACK_DIR" "重启后端容器（docker compose up -d backend）" sudo -E docker compose up -d backend

  # 8) 探活
  health_check
  return 0
}

# ---------------------------------------------------------------------------
# 7) 前端部署：同步源码(保留 node_modules) → 按需 npm ci → 构建发布 → 校验
# ---------------------------------------------------------------------------
deploy_frontend() {
  CURRENT_STEP="frontend"
  log "frontend：开始部署（同步源码 → 按需 npm ci → 构建并发布）"

  # 1) 同步源码；--exclude node_modules 同时保护它不被 --delete 删掉
  #    --checksum 同后端：避免"大小不变 + mtime 同秒"被漏同步
  run_step "同步源码到 $FRONTEND_SRC/（保留 node_modules）" \
    sudo rsync -a --checksum --delete --exclude node_modules "$REPO_DIR/frontend/" "$FRONTEND_SRC/"

  # 2) 依赖：node_modules 缺失 或 package-lock.json 变化时才装（避免每轮 342MB 重装）
  local need_ci=0 reason="" build_script=""
  if [ ! -d "$FRONTEND_SRC/node_modules" ]; then
    need_ci=1
    reason="node_modules 缺失"
  fi
  if [ "$LOCK_CHANGED" = "1" ]; then
    need_ci=1
    reason="${reason:+$reason；}package-lock.json 有变更"
  fi
  if [ "$need_ci" = "1" ]; then
    if [ "$DRY_RUN" != "1" ] && [ ! -w "$FRONTEND_SRC" ]; then
      fail "$CURRENT_STEP" "前端源码目录不可写（$FRONTEND_SRC），npm ci 无法执行；修复：sudo chown -R ubuntu:ubuntu $FRONTEND_SRC" \
        "test -w $FRONTEND_SRC" 1
    fi
    # npm ci 以 ubuntu 身份运行（不用 sudo npm，避免 node_modules 变成 root 属主）
    run_step_in "$FRONTEND_SRC" "安装前端依赖（npm ci，$reason）" npm ci
  else
    log "  package-lock.json 未变且 node_modules 存在，跳过 npm ci"
  fi

  # 3) 构建并发布：优先复用服务器上已验证的脚本，缺失时回退到仓库内副本
  build_script="$FRONTEND_BUILD_SCRIPT"
  if [ ! -f "$build_script" ]; then
    build_script="$REPO_DIR/deploy/build-frontend.sh"
    log "  未找到 $FRONTEND_BUILD_SCRIPT，回退使用仓库内脚本 $build_script"
  fi
  if [ "$DRY_RUN" = "1" ]; then
    log "  [dry-run] 将执行：sudo env PUBLIC_HOST=$PUBLIC_HOST bash $build_script https"
  else
    if [ ! -f "$build_script" ]; then
      fail "$CURRENT_STEP" "找不到前端构建脚本（$FRONTEND_BUILD_SCRIPT 与 $REPO_DIR/deploy/build-frontend.sh 均不存在）" \
        "test -f $build_script" 1
    fi
    # 用 `sudo env VAR=...` 传 PUBLIC_HOST：`sudo VAR=... cmd` 在 sudoers 未开 SETENV 时会被拒绝
    run_step "构建并发布前端（PUBLIC_HOST=$PUBLIC_HOST）" \
      sudo env "PUBLIC_HOST=$PUBLIC_HOST" bash "$build_script" https
  fi

  # 4) 发布校验（构建脚本可能已"成功"但没真正发布）
  if [ "$DRY_RUN" = "1" ]; then
    log "  [dry-run] 将校验 $FRONTEND_PUBLISH/index.html 存在"
  elif [ ! -f "$FRONTEND_PUBLISH/index.html" ]; then
    fail "$CURRENT_STEP" "发布校验失败：$FRONTEND_PUBLISH/index.html 不存在（构建脚本可能未成功发布）" \
      "test -f $FRONTEND_PUBLISH/index.html" 1
  else
    log "  已发布：$FRONTEND_PUBLISH/index.html"
  fi
  return 0
}

# ---------------------------------------------------------------------------
# 8) nginx 配置变更：先复制 + nginx -t 校验，通过才 reload，不通过回滚并记为失败
# ---------------------------------------------------------------------------
deploy_nginx() {
  CURRENT_STEP="nginx"
  log "nginx：发现 deploy/nginx.conf 变更（先校验，通过才 reload）"

  local src="$REPO_DIR/deploy/nginx.conf" backup="/tmp/nginx-bookkeeping.$$.bak"
  if [ ! -f "$src" ]; then
    fail "$CURRENT_STEP" "变更集合含 deploy/nginx.conf，但仓库中没有该文件" "test -f $src" 1
  fi

  if [ "$DRY_RUN" = "1" ]; then
    log "  [dry-run] 将执行：cp $NGINX_SITE $backup → cp $src $NGINX_SITE → nginx -t → 通过则 systemctl reload $NGINX_SERVICE（不通过则回滚 $backup 并报失败）"
    return 0
  fi

  if [ -f "$NGINX_SITE" ]; then
    run_step "备份当前 nginx 站点配置 → $backup" sudo cp "$NGINX_SITE" "$backup"
  else
    log "  （$NGINX_SITE 不存在，跳过备份）"
  fi

  run_step "复制新配置 → $NGINX_SITE" sudo cp "$src" "$NGINX_SITE"

  if sudo nginx -t; then
    log "  nginx -t 校验通过"
  else
    local code=$?
    if [ -f "$backup" ]; then
      if sudo cp "$backup" "$NGINX_SITE" 2>/dev/null; then
        log "  已回滚 nginx 配置，线上配置仍为改动前版本（备份：$backup）"
      else
        log "  警告：回滚失败，请手动恢复（备份：$backup）"
      fi
    else
      log "  无备份可回滚（原本没有该站点配置），新配置保留在 $NGINX_SITE 以便排查"
    fi
    fail "$CURRENT_STEP" "nginx -t 校验失败，未 reload（配置已回滚，线上仍可用）" "sudo nginx -t" "$code"
  fi

  run_step "reload nginx（systemctl reload $NGINX_SERVICE）" sudo systemctl reload "$NGINX_SERVICE"
  rm -f "$backup" 2>/dev/null || true
  log "  nginx 配置已生效"
  return 0
}

# ---------------------------------------------------------------------------
# 9) 状态收尾
# ---------------------------------------------------------------------------
mark_success() {
  CURRENT_STEP="state"
  if [ "$DRY_RUN" = "1" ]; then
    log "  [dry-run] 将写入 state/last-deployed.txt = $SHORT，并清除 failed-sha.txt / ALERT.txt"
    return 0
  fi
  if ! printf '%s\n' "$TARGET" > "$STATE_DIR/last-deployed.txt" 2>/dev/null; then
    fail "state" "无法写入 $STATE_DIR/last-deployed.txt（请检查目录权限）" \
      "printf > $STATE_DIR/last-deployed.txt" 1
  fi
  rm -f "$STATE_DIR/failed-sha.txt" 2>/dev/null || true
  rm -f "$STATE_DIR/ALERT.txt" 2>/dev/null || true
  if [ -n "$ENV_BACKUP" ]; then
    rm -f "$ENV_BACKUP" 2>/dev/null || true
    ENV_BACKUP=""
  fi
  log "已记录最近成功部署：$SHORT"
  return 0
}

# ---------------------------------------------------------------------------
# 10) 一轮部署
# ---------------------------------------------------------------------------
run_round() {
  START_EPOCH="$(date +%s)"
  local mode_note=""
  if [ "$DRY_RUN" = "1" ]; then mode_note="（dry-run 模式：不会产生任何改动）"; fi
  log "=== 开始一轮检查${mode_note}==="

  # retry：先清失败标记
  if [ "$RETRY" = "1" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      log "[dry-run] 将清除失败标记 $STATE_DIR/failed-sha.txt 与 ALERT.txt"
    else
      if [ -f "$STATE_DIR/failed-sha.txt" ]; then
        rm -f "$STATE_DIR/failed-sha.txt" 2>/dev/null || true
        log "已清除失败标记（--retry）"
      fi
      rm -f "$STATE_DIR/ALERT.txt" 2>/dev/null || true
    fi
  fi

  # 互斥：上一轮没结束时本轮直接跳过（dry-run 不加锁，保持完全无副作用）
  if [ "$DRY_RUN" = "1" ]; then
    log "  [dry-run] 将执行：flock -n $STATE_DIR/deploy.lock（真实运行时会先抢锁）"
  else
    if [ ! -d "$STATE_DIR" ]; then
      mkdir -p "$STATE_DIR" 2>/dev/null || true
    fi
    if [ ! -w "$STATE_DIR" ]; then
      fail "lock" "状态目录不可写（$STATE_DIR）。请运行：sudo bash /opt/bookkeeping/ci/install.sh" \
        "test -w $STATE_DIR" 1
    fi
    exec 9>"$STATE_DIR/deploy.lock" 2>/dev/null
    if ! flock -n 9; then
      log "另一轮部署进行中，跳过"
      exit 0
    fi
  fi

  prepare_repo
  check_already_deployed
  check_failed_marker
  collect_changes
  classify_changes
  print_change_plan
  preflight
  update_worktree

  # 只改了 mobile/、docs/ 之类的提交：只记录，不重启任何服务
  if [ "$BACKEND_CHANGED$FRONTEND_CHANGED$NGINX_CHANGED" = "000" ]; then
    log "本轮不需要部署（不涉及 backend/ frontend/ deploy/nginx.conf）"
    mark_success
    log "完成：无需部署，$SHORT 已标记为已处理（未重启任何服务）"
    exit 0
  fi

  if [ "$BACKEND_CHANGED" = "1" ]; then deploy_backend; fi
  if [ "$FRONTEND_CHANGED" = "1" ]; then deploy_frontend; fi
  if [ "$NGINX_CHANGED" = "1" ]; then deploy_nginx; fi

  mark_success

  local elapsed m s
  elapsed=$(( $(date +%s) - START_EPOCH ))
  m=$((elapsed / 60))
  s=$((elapsed % 60))
  log "部署成功 $SHORT（总耗时 ${m}m ${s}s）"
  exit 0
}

# ---------------------------------------------------------------------------
# 11) --status：只读状态（不写任何东西）
# ---------------------------------------------------------------------------
cmd_status() {
  local cfg_note="" head_line="" fetch_note="" origin_sha="" last="" failed="" alert=""
  local need="" enabled="" active="" snaps="" snap_n="" baseline_n="" f=""

  if [ -f "$CONFIG_FILE" ]; then cfg_note="（已加载）"; else cfg_note="（不存在，使用内置默认值）"; fi

  printf '%s\n' "=== 金流自动部署状态 ==="
  printf '  时间        : %s\n' "$(date '+%Y-%m-%d %H:%M:%S')"
  printf '  配置文件    : %s%s\n' "$CONFIG_FILE" "$cfg_note"
  printf '  分支        : %s（只跟踪该分支）\n' "$BRANCH"
  printf '  仓库        : %s\n' "$REPO_DIR"
  printf '  状态目录    : %s\n' "$STATE_DIR"
  printf '  轮询周期    : %s（timer 渲染值；改动需重跑 install.sh）\n' "$POLL_INTERVAL"
  printf '  日志        : %s（%s）\n' "$LOG_FILE" "$(log_target_desc)"

  if [ -d "$REPO_DIR/.git" ]; then
    head_line="$(git -C "$REPO_DIR" log -1 --format='%h %ci %s' 2>/dev/null || true)"
    printf '  仓库 HEAD   : %s\n' "${head_line:-（不可读）}"
    if git -C "$REPO_DIR" fetch --prune --quiet origin "$BRANCH" 2>/dev/null; then
      fetch_note="已拉取最新"
    else
      fetch_note="拉取失败（无网络？以下远端信息可能过期）"
    fi
    origin_sha="$(git -C "$REPO_DIR" rev-parse --short "origin/$BRANCH" 2>/dev/null || true)"
    printf '  origin/%-4s: %s（%s）\n' "$BRANCH" "${origin_sha:-（无法解析）}" "$fetch_note"
  else
    printf '  仓库 HEAD   : （仓库不存在，尚未克隆）\n'
    printf '  origin/%s   : （未知）\n' "$BRANCH"
  fi

  last="$(read_state last-deployed.txt)"
  if [ -n "$last" ]; then
    printf '  最近成功    : %s（%s）\n' "${last:0:7}" "$(date -r "$STATE_DIR/last-deployed.txt" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo '时间未知')"
  else
    printf '  最近成功    : （无记录）\n'
  fi

  failed="$(read_state failed-sha.txt)"
  if [ -n "$failed" ]; then
    printf '  失败记录    : %s（该提交已停止自动重试，可用 --retry 重试）\n' "${failed:0:7}"
  else
    printf '  失败记录    : 无\n'
  fi
  if [ -f "$STATE_DIR/ALERT.txt" ]; then
    alert="$(head -n 1 "$STATE_DIR/ALERT.txt" 2>/dev/null || true)"
    printf '  ALERT       : %s\n' "$alert"
  fi

  if [ -n "$origin_sha" ] && [ -n "$failed" ] && [ "$origin_sha" = "${failed:0:7}" ]; then
    need="是，但 $origin_sha 上次部署失败 → 已停止自动重试（修复后 push 新提交，或 --retry）"
  elif [ -n "$origin_sha" ] && [ -n "$last" ] && [ "$origin_sha" = "${last:0:7}" ]; then
    need="否（$BRANCH 已部署到 $origin_sha）"
  elif [ -n "$origin_sha" ] && [ -n "$last" ]; then
    need="是（最近成功 ${last:0:7} → 远端 $origin_sha）"
  elif [ -n "$origin_sha" ]; then
    need="是（无成功记录，将按全部变更部署 $origin_sha）"
  else
    need="未知（无法读取远端提交）"
  fi
  printf '  是否需要部署: %s\n' "$need"

  enabled="$(systemctl is-enabled bk-deploy.timer 2>/dev/null || true)"
  active="$(systemctl is-active bk-deploy.timer 2>/dev/null || true)"
  if [ -z "$enabled" ] && [ -z "$active" ]; then
    printf '  timer       : （无法读取：systemctl 不可用或单元未安装）\n'
  else
    printf '  timer       : %s / %s（enable/active；启停：systemctl enable|disable --now bk-deploy.timer）\n' \
      "${enabled:-unknown}" "${active:-unknown}"
  fi

  printf '  部署快照    : %s\n' "$DUMP_DIR"
  if [ -d "$DUMP_DIR" ]; then
    snaps="$(ls -1t "$DUMP_DIR"/pre-deploy_*.sql.gz 2>/dev/null | head -n "$KEEP_DUMPS" || true)"
    snap_n=0
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      snap_n=$((snap_n + 1))
      printf '    - %s\n' "$(basename "$f")"
    done <<< "$snaps"
    if [ "$snap_n" = "0" ]; then printf '    （暂无自动快照）\n'; fi
    baseline_n="$(ls -1 "$DUMP_DIR" 2>/dev/null | grep -vc '^pre-deploy_' || true)"
    printf '    （自动快照保留最近 %s 份；目录内其它 dump %s 个，不会被清理）\n' "$KEEP_DUMPS" "${baseline_n:-0}"
  else
    printf '    （目录不存在）\n'
  fi
  return 0
}

# ---------------------------------------------------------------------------
# 12) 入口
# ---------------------------------------------------------------------------
parse_args "$@"
source_config
resolve_log_target
# 配置加载结果放在落点判定之后再打：这一行以前正是"重复两遍"的那一行
if [ -n "$CONFIG_NOTE" ]; then log "$CONFIG_NOTE"; fi

if [ "$MODE" = "status" ]; then
  # 只读路径：关掉 ERR trap，任何读命令失败都不该让 --status 变成"部署失败"
  trap - ERR
  trap - TERM INT
  cmd_status
  exit 0
fi

run_round
