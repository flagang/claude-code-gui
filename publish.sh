#!/bin/bash
set -e

APP_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --app-only|-a)
      APP_ONLY=true
      ;;
  esac
done

echo "=== Claude Code GUI 打包脚本 ==="

# 清理旧的构建
echo "清理 dist/..."
rm -rf dist/

# nvm use (先 source 确保在非交互式 shell 中可用)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use
# 安装依赖
echo "安装依赖..."
npm install

# 重编译原生模块
echo "重编译 node-pty..."
npx @electron/rebuild

# 构建
if [ "$APP_ONLY" = true ]; then
  echo "构建应用（仅 .app 目录）..."
  npm run build:dir
else
  echo "构建应用（生成 DMG + ZIP）..."
  npm run build
fi

echo ""
echo "=== 构建完成 ==="
echo "输出目录: dist/"
ls -lh dist/ | grep -v blockmap | grep -v debug

if [ "$APP_ONLY" = false ]; then
  echo ""
  echo "ZIP 安装包已生成，可直接分发。"
  echo "用户解压后拖入 /Applications 即可使用。"
fi
