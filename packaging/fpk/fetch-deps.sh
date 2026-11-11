#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# 下载并裁剪随包依赖，输出到 <out>/（即安装后的 <appdir>/opt）：
#   opt/node/bin/node          Node.js 运行时（官方二进制，只留 node 本体）
#   opt/python/                python-build-standalone（stripped，含标准库 sqlite3）
#   opt/ffmpeg/{ffmpeg,ffprobe} 静态 ffmpeg（johnvansickle）
#   opt/bin/{node,python3,ffmpeg,ffprobe}  相对路径符号链接，供 PATH 使用
#
# 用法: fetch-deps.sh --arch x86|arm --cache <下载缓存目录> --out <opt 目录>
# 下载物按版本缓存，Node / Python 校验官方 SHA-256，ffmpeg 校验官方 md5。
# ==============================================================================

NODE_VERSION="${NODE_VERSION:-v24.22.2}"
PBS_TAG="${PBS_TAG:-20261110}"
PYTHON_VERSION="${PYTHON_VERSION:-3.12.16}"

ARCH=""; CACHE=""; OUT=""
while [ $# -gt 0 ]; do
    case "$1" in
        --arch) ARCH="$2"; shift 2 ;;
        --cache) CACHE="$2"; shift 2 ;;
        --out) OUT="$2"; shift 2 ;;
        *) echo "未知参数: $1" >&2; exit 1 ;;
    esac
done
[ -n "$ARCH" ] && [ -n "$CACHE" ] && [ -n "$OUT" ] || { echo "用法: $0 --arch x86|arm --cache DIR --out DIR" >&2; exit 1; }

case "$ARCH" in
    x86) NODE_ARCH=x64;   PBS_ARCH=x86_64;  FF_ARCH=amd64 ;;
    arm) NODE_ARCH=arm64; PBS_ARCH=aarch64; FF_ARCH=arm64 ;;
    *) echo "未知架构 $ARCH（应为 x86 或 arm）" >&2; exit 1 ;;
esac

info() { printf '[deps] %s\n' "$*"; }
die() { printf '[deps] ERROR: %s\n' "$*" >&2; exit 1; }

mkdir -p "$CACHE"
dl() { # dl <url> <文件名>：已缓存则跳过
    local url="$1" f="${CACHE}/$2"
    if [ ! -s "$f" ]; then
        info "下载 $url"
        curl -fsSL --retry 3 -o "${f}.part" "$url" || die "下载失败 $url"
        mv "${f}.part" "$f"
    fi
}
check_sha256() { # check_sha256 <文件> <期望>
    local got; got="$(sha256sum "$1" | cut -d' ' -f1)"
    [ "$got" = "$2" ] || { rm -f "$1"; die "SHA-256 不符 $(basename "$1")：期望 $2，实际 $got（已删除缓存，请重试）"; }
}

rm -rf "$OUT"
mkdir -p "$OUT/node/bin" "$OUT/ffmpeg" "$OUT/bin"

# ---- Node.js ----
NODE_TAR="node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
dl "https://nodejs.org/dist/${NODE_VERSION}/${NODE_TAR}" "$NODE_TAR"
dl "https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt" "node-${NODE_VERSION}-SHASUMS256.txt"
want="$(awk -v f="$NODE_TAR" '$2==f{print $1}' "${CACHE}/node-${NODE_VERSION}-SHASUMS256.txt")"
[ -n "$want" ] || die "SHASUMS256.txt 里没有 ${NODE_TAR}"
check_sha256 "${CACHE}/${NODE_TAR}" "$want"
tar -xJf "${CACHE}/${NODE_TAR}" -C "$OUT/node/bin" --strip-components=2 "node-${NODE_VERSION}-linux-${NODE_ARCH}/bin/node"
chmod 0755 "$OUT/node/bin/node"
tar -xJf "${CACHE}/${NODE_TAR}" -C "$OUT/node" --strip-components=1 "node-${NODE_VERSION}-linux-${NODE_ARCH}/LICENSE"

# ---- Python（python-build-standalone）----
PBS_TAR="cpython-${PYTHON_VERSION}+${PBS_TAG}-${PBS_ARCH}-unknown-linux-gnu-install_only_stripped.tar.gz"
PBS_URL_NAME="${PBS_TAR//+/%2B}"
dl "https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${PBS_URL_NAME}" "$PBS_TAR"
dl "https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/SHA256SUMS" "pbs-${PBS_TAG}-SHA256SUMS"
want="$(awk -v f="$PBS_TAR" '$2==f || $2=="*"f {print $1}' "${CACHE}/pbs-${PBS_TAG}-SHA256SUMS")"
[ -n "$want" ] || die "SHA256SUMS 里没有 ${PBS_TAR}"
check_sha256 "${CACHE}/${PBS_TAR}" "$want"
tar -xzf "${CACHE}/${PBS_TAR}" -C "$OUT"   # 解出 python/
[ -x "$OUT/python/bin/python3" ] || die "Python 解包后缺少 python/bin/python3"
# 控制层只用标准库：去掉 pip/ensurepip/测试/Tk 与头文件，减小体积
PYLIB="$(echo "$OUT"/python/lib/python3.*)"
rm -rf "$OUT/python/include" "$PYLIB/test" "$PYLIB/idlelib" "$PYLIB/tkinter" "$PYLIB/turtledemo" \
       "$PYLIB/ensurepip" "$PYLIB/site-packages"/* "$OUT/python/share"
find "$OUT/python" -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null || true

# ---- ffmpeg（静态）----
FF_TAR="ffmpeg-release-${FF_ARCH}-static.tar.xz"
dl "https://johnvansickle.com/ffmpeg/releases/${FF_TAR}" "$FF_TAR"
dl "https://johnvansickle.com/ffmpeg/releases/${FF_TAR}.md5" "${FF_TAR}.md5"
want="$(cut -d' ' -f1 "${CACHE}/${FF_TAR}.md5")"
got="$(md5sum "${CACHE}/${FF_TAR}" | cut -d' ' -f1)"
[ "$want" = "$got" ] || { rm -f "${CACHE}/${FF_TAR}"; die "ffmpeg md5 不符（期望 ${want}，实际 ${got}），已删除缓存请重试"; }
tar -xJf "${CACHE}/${FF_TAR}" -C "$OUT/ffmpeg" --strip-components=1 --wildcards '*/ffmpeg' '*/ffprobe' '*/GPLv3.txt'
chmod 0755 "$OUT/ffmpeg/ffmpeg" "$OUT/ffmpeg/ffprobe"

# ---- opt/bin 相对符号链接（飞牛解包不接受绝对路径链接）----
ln -s ../node/bin/node "$OUT/bin/node"
ln -s ../python/bin/python3 "$OUT/bin/python3"
ln -s ../ffmpeg/ffmpeg "$OUT/bin/ffmpeg"
ln -s ../ffmpeg/ffprobe "$OUT/bin/ffprobe"

# 记录随包依赖的版本，便于排查
{
    echo "node=${NODE_VERSION}"
    echo "python=${PYTHON_VERSION} (python-build-standalone ${PBS_TAG})"
    echo "ffmpeg=$("$OUT/ffmpeg/ffmpeg" -version 2>/dev/null | head -n1 || echo johnvansickle-static)"
    echo "arch=${ARCH}"
} > "$OUT/VERSIONS"

info "完成 ${ARCH}: $(du -sh "$OUT" | cut -f1)"
