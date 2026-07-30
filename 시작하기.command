#!/bin/bash
# 🌸 더블클릭하면 언어공부 앱이 열립니다 (완전 오프라인)
cd "$(dirname "$0")"

if [ ! -d dist ]; then
  echo "빌드 결과물이 없어요. 먼저 터미널에서 npm run build 를 실행해 주세요."
  read -p "엔터를 누르면 닫힙니다..."
  exit 1
fi

PORT=4173
(sleep 1 && open "http://localhost:$PORT") &
echo "🌸 앱 실행 중! 브라우저가 열립니다. 이 창을 닫으면 앱이 종료됩니다."
cd dist && python3 -m http.server $PORT
