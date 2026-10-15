// 通知を受け取って表示し、タップされたらサイトを開く
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch {}
  event.waitUntil(self.registration.showNotification(d.title || '.Digest', {
    body: d.body || '',
    icon: 'icon-192.png',
    tag: 'highlights',
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || './';
  event.waitUntil((async () => {
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) { await w.focus(); return w.navigate ? w.navigate(url) : undefined; }
    }
    return clients.openWindow(url);
  })());
});
