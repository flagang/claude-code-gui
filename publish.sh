#!/bin/bash
set -e

echo "=== Claude Code GUI 打包脚本 ==="

# 清理旧的构建
echo "清理 dist/..."
rm -rf dist/

nvm use
# 安装依赖
echo "安装依赖..."
npm install

# 重编译原生模块
echo "重编译 node-pty..."
npx @electron/rebuild

# 构建（生成 DMG + ZIP）
echo "构建应用..."
npm run build

echo ""
echo "=== 构建完成 ==="
echo "输出目录: dist/"
ls -lh dist/ | grep -v blockmap | grep -v debug

echo ""
echo "ZIP 安装包已生成，可直接分发。"
echo "用户解压后拖入 /Applications 即可使用。"
