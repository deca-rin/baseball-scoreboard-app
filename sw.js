// あえて何もキャッシュしないサービスワーカー。
// PWAとしてインストール可能にするための最小限のfetchハンドラのみで、
// 常にネットワークから取得するため、更新が反映されないという問題を避けられる。
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
