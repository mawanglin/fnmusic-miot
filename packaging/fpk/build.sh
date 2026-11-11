#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# fnmusic-miot fpk 打包脚本（本地与 CI 共用）
# 组装应用骨架 + 仓库主体 + 随包依赖（Node.js / Python / ffmpeg）
#   → fnpack build → dist/fnmusic-miot-<版本>-<x86|arm>.fpk（两个架构各一个包）
#
# 用法:
#   packaging/fpk/build.sh                     # x86 + arm 都打（依赖自动下载并校验）
#   packaging/fpk/build.sh --arch x86          # 只打 x86（或 arm）
#   packaging/fpk/build.sh --stage-only DIR    # 只组装（默认 x86）不打包（结构测试用）
#   packaging/fpk/build.sh --no-deps           # 不附带依赖（仅结构测试；包不可用）
#   packaging/fpk/build.sh --fnpack /path/fnpack --out dist
# 环境变量: FNPACK_VERSION（默认 1.2.3）、NODE_VERSION / PYTHON_VERSION / PBS_TAG（见 fetch-deps.sh）
# 前提: miot-service/bundle 与 static 已构建（缺失时自动执行 npm run build:all）
# 依赖下载缓存在 packaging/fpk/.cache/；dist 只保留最新 2 个版本的包。
# ==============================================================================

FPK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${FPK_DIR}/../.." && pwd)"
VERSION="$(cat "${REPO_ROOT}/VERSION")"
if [ -z "${VERSION}" ]; then
    echo "ERROR: 无法读取 ${REPO_ROOT}/VERSION" >&2
    exit 1
fi

FNPACK_BIN="${FNPACK:-}"
STAGE_ONLY=0
STAGE=""
ARCHES="x86 arm"
WITH_DEPS=1
CACHE_DIR="${FPK_DIR}/.cache"
OUT_DIR="${REPO_ROOT}/dist"

while [ $# -gt 0 ]; do
    case "$1" in
        --stage-only)
            [ $# -ge 2 ] || { echo "用法: $0 --stage-only <dir>" >&2; exit 1; }
            STAGE_ONLY=1
            STAGE="$2"
            shift 2
            ;;
        --arch)
            [ $# -ge 2 ] || { echo "用法: $0 --arch x86|arm|all" >&2; exit 1; }
            case "$2" in
                x86|arm) ARCHES="$2" ;;
                all) ARCHES="x86 arm" ;;
                *) echo "未知架构 $2（应为 x86、arm 或 all）" >&2; exit 1 ;;
            esac
            shift 2
            ;;
        --no-deps)
            WITH_DEPS=0
            shift
            ;;
        --fnpack)
            [ $# -ge 2 ] || { echo "用法: $0 --fnpack <path>" >&2; exit 1; }
            FNPACK_BIN="$2"
            shift 2
            ;;
        --out)
            [ $# -ge 2 ] || { echo "用法: $0 --out <dir>" >&2; exit 1; }
            OUT_DIR="$2"
            shift 2
            ;;
        -h|--help)
            sed -n '3,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *)
            echo "未知参数: $1" >&2
            exit 1
            ;;
    esac
done

if [ -z "${STAGE}" ]; then
    STAGE="${FPK_DIR}/.build/fpk"
fi
STAGE_BASE="${FPK_DIR}/.build/fpk"

command -v rsync >/dev/null 2>&1 || {
    echo "ERROR: 需要 rsync（Debian: sudo apt-get install -y rsync）" >&2
    exit 1
}

# --stage-only 只组装一个架构（默认 x86）
if [ "${STAGE_ONLY}" -eq 1 ]; then
    ARCHES="${ARCHES%% *}"
fi

# ------------------------------------------------------------------------------
# 0. 构建产物（bundle/ 与 static/）：缺失则自动构建
# ------------------------------------------------------------------------------
if [ "${STAGE_ONLY}" -eq 0 ] && { [ ! -f "${REPO_ROOT}/miot-service/bundle/main.js" ] || [ ! -d "${REPO_ROOT}/miot-service/static" ]; }; then
    echo "[fpk] 构建 miot-service（bundle + 前端面板）..."
    command -v npm >/dev/null 2>&1 || { echo "ERROR: 需要 npm 来构建 miot-service" >&2; exit 1; }
    (cd "${REPO_ROOT}/miot-service" && npm install --no-audit --no-fund && npm run build:all) \
        || { echo "ERROR: miot-service 构建失败" >&2; exit 1; }
fi
if [ "${STAGE_ONLY}" -eq 0 ]; then
    [ -f "${REPO_ROOT}/miot-service/bundle/main.js" ] && [ -d "${REPO_ROOT}/miot-service/static" ] \
        || { echo "ERROR: 缺少 miot-service/bundle 或 static" >&2; exit 1; }
fi

# ------------------------------------------------------------------------------
# fnpack
# ------------------------------------------------------------------------------
resolve_fnpack() {
    [ -n "${FNPACK_BIN}" ] && return 0
    if command -v fnpack >/dev/null 2>&1; then
        FNPACK_BIN="$(command -v fnpack)"
        return 0
    fi
    case "$(uname -m)" in
        x86_64) FNARCH=amd64 ;;
        aarch64|arm64) FNARCH=arm64 ;;
        *) echo "ERROR: 不支持的架构 $(uname -m)" >&2; exit 1 ;;
    esac
    FNPACK_VERSION="${FNPACK_VERSION:-1.2.3}"
    TOOLS_DIR="${REPO_ROOT}/.tools"
    FNPACK_BIN="${TOOLS_DIR}/fnpack"
    if [ ! -x "${FNPACK_BIN}" ] || ! "${FNPACK_BIN}" --help >/dev/null 2>&1; then
        mkdir -p "${TOOLS_DIR}"
        echo "[fpk] 下载 fnpack ${FNPACK_VERSION} (linux-${FNARCH})..."
        curl -fsSL -o "${FNPACK_BIN}" \
            "https://static2.fnnas.com/fnpack/fnpack-${FNPACK_VERSION}-linux-${FNARCH}"
        chmod +x "${FNPACK_BIN}"
    fi
}

# ------------------------------------------------------------------------------
# 组装并打包一个架构：build_arch <x86|arm> <stage 目录>
# ------------------------------------------------------------------------------
build_arch() {
    local arch="$1" stage="$2"
    rm -rf "${stage}"
    mkdir -p "${stage}/app/repo" "${stage}/app/ui"

# 仓库主体（排除开发文件、前端源码与本地秘密）。
# 原生部署（2.0.0 起）不再需要容器：container/、docker-compose.yml 与旧 Python 版
# webui/ 一并排除，只保留 nodeconsole/（控制台网关）与 runtime/（进程守护）。
# .env 是安装时由安装脚本生成的，不进包。
# 已废弃的 Songloft 薄壳插件（plugin/ + scripts/build-plugin.mjs）也显式排除，
# 即使源码树里被误恢复，也不会混进正式包。
rsync -a --delete \
    --exclude='.env' --exclude='.env.*' \
    --exclude='.git/' --exclude='.git*' \
    --exclude='.github/' --exclude='.zcode/' --exclude='.cursor/' --exclude='.agents/' \
    --exclude='.tasks_archive/' --exclude='.tools/' \
    --exclude='packaging/' --exclude='dist/' \
    --exclude='tests/' --exclude='docs/' \
    --exclude='**/__pycache__/' --exclude='*.pyc' --exclude='*.log' --exclude='*.logzip' \
    --exclude='miot-service/frontend/' --exclude='miot-service/src/' --exclude='miot-service/tests/' \
    --exclude='container/' --exclude='docker-compose.yml' --exclude='.dockerignore' \
    --exclude='webui/' \
    --exclude='miot-data/' \
    --exclude='plugin/' --exclude='scripts/build-plugin.mjs' \
    --exclude='*.sock' \
    --exclude='**/node_modules/' --exclude='*.fpk' \
    "${REPO_ROOT}/" "${stage}/app/repo/"

    # 随包依赖 → <app>/opt（安装后位于 /var/apps/fnmusic-miot/target/opt）
    if [ "${WITH_DEPS}" -eq 1 ]; then
        "${FPK_DIR}/fetch-deps.sh" --arch "${arch}" --cache "${CACHE_DIR}/downloads" --out "${stage}/app/opt"
    fi

    # 正式和预发布的 manifest 均保留数字 -N；通道另存 RELEASE_CHANNEL。
    sed -e "s/@VERSION@/${VERSION}/" -e "s/@PLATFORM@/${arch}/" "${FPK_DIR}/manifest.in" > "${stage}/manifest"
    cp "${FPK_DIR}/ICON.PNG" "${FPK_DIR}/ICON_256.PNG" "${stage}/"
    cp -a "${FPK_DIR}/app/ui/." "${stage}/app/ui/"
    cp -a "${FPK_DIR}/cmd" "${stage}/cmd"
    cp -a "${FPK_DIR}/config" "${stage}/config"
    cp -a "${FPK_DIR}/wizard" "${stage}/wizard"
    chmod +x "${stage}"/cmd/*

    # 打包前自检：飞牛解包不接受绝对路径符号链接
    if [ -n "$(find "${stage}" -type l -lname '/*' 2>/dev/null)" ]; then
        echo "ERROR: 包内有绝对路径符号链接（飞牛会解压失败）" >&2
        exit 1
    fi
    if [ "${WITH_DEPS}" -eq 1 ]; then
        local want=x86-64
        [ "${arch}" = arm ] && want=aarch64
        for b in node/bin/node ffmpeg/ffmpeg ffmpeg/ffprobe; do
            file -L -b "${stage}/app/opt/${b}" | grep -q "${want}" \
                || { echo "ERROR: opt/${b} 架构不是 ${want}" >&2; exit 1; }
        done
    fi

    echo "[fpk] 组装完成: ${stage} (version=${VERSION}, arch=${arch})"
    [ "${STAGE_ONLY}" -eq 1 ] && return 0

    resolve_fnpack
    local work built final
    work="$(mktemp -d)"
    if ! (cd "${work}" && "${FNPACK_BIN}" build --directory "${stage}"); then
        rm -rf "${work}"
        echo "ERROR: fnpack build 失败" >&2
        exit 1
    fi
    built="$(find "${work}" "${stage}" -maxdepth 2 -name '*.fpk' -print -quit 2>/dev/null || true)"
    if [ -z "${built}" ]; then
        rm -rf "${work}"
        echo "ERROR: 未找到 fnpack 生成的 .fpk 文件" >&2
        exit 1
    fi
    mkdir -p "${OUT_DIR}"
    final="${OUT_DIR}/fnmusic-miot-${VERSION}-${arch}.fpk"
    mv -f "${built}" "${final}"
    rm -rf "${work}"
    ( cd "${OUT_DIR}" && sha256sum "$(basename "${final}")" > "$(basename "${final}").sha256" )
    echo "[fpk] 打包完成: ${final} ($(( $(stat -c %s "${final}") / 1048576 ))MB)"
}

for arch in ${ARCHES}; do
    if [ "${STAGE_ONLY}" -eq 1 ]; then
        build_arch "${arch}" "${STAGE}"
    else
        build_arch "${arch}" "${STAGE_BASE}-${arch}"
    fi
done

# dist 只保留最新 2 个版本（同一版本的 x86/arm 算一个版本）
if [ "${STAGE_ONLY}" -eq 0 ]; then
    mapfile -t KEEP < <(find "${OUT_DIR}" -maxdepth 1 -name 'fnmusic-miot-*.fpk' -printf '%f\n' \
        | sed -E 's/^fnmusic-miot-(.*)-(x86|arm)\.fpk$/\1/' | sort -uV | tail -n 2)
    for f in "${OUT_DIR}"/fnmusic-miot-*.fpk; do
        [ -e "${f}" ] || continue
        v="$(basename "${f}" | sed -E 's/^fnmusic-miot-(.*)-(x86|arm)\.fpk$/\1/')"
        keep=0
        for k in "${KEEP[@]}"; do [ "${k}" = "${v}" ] && keep=1; done
        if [ "${keep}" -eq 0 ]; then
            echo "[fpk] 清理旧包 $(basename "${f}")"
            rm -f "${f}" "${f}.sha256"
        fi
    done
fi
