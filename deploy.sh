#!/bin/bash
# LOL Meta Hub 一键部署：同步本地代码到服务器并重建 Docker 容器
# 用法: ./deploy.sh   （依赖本机 SSH 免密登录 root@119.91.251.150）
set -euo pipefail

SERVER=root@119.91.251.150
REMOTE_DIR=/opt/lol-meta-hub
CONTAINER_NAME=lol-meta-hub
HEALTH_URL=http://119.91.251.150:8080/api/health

cd "$(dirname "$0")"

echo "==> rsync 同步代码到 $SERVER:$REMOTE_DIR"
rsync -av server.js package.json Dockerfile docker-compose.yml .dockerignore "$SERVER:$REMOTE_DIR/"
rsync -av --delete public/ "$SERVER:$REMOTE_DIR/public/"

echo "==> 重建镜像（可能需要几十秒）"
ssh "$SERVER" "cd $REMOTE_DIR && docker compose build 2>&1 | tail -3"

echo "==> 重启容器"
ssh "$SERVER" "cd $REMOTE_DIR && docker compose up -d && docker ps --filter name=$CONTAINER_NAME --format '{{.Names}} {{.Status}}'"

echo "==> 等待服务恢复"
for i in $(seq 1 30); do
  if curl -sf --max-time 5 "$HEALTH_URL" >/dev/null; then
    echo "==> 部署完成，健康检查通过："
    curl -s "$HEALTH_URL"; echo
    exit 0
  fi
  sleep 2
done

echo "!! 健康检查未通过，请上服务器查看: ssh $SERVER 'docker logs --tail 50 $CONTAINER_NAME'" >&2
exit 1
