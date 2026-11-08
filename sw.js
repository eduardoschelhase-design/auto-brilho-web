const CACHE='auto-brilho-web-v14';
const CORE=['./','./index.html','./style.css?v=14','./app.js?v=14','./config.js','./manifest.json','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 const isNavigation=request.mode==='navigate';
 const isAppAsset=/\/(index\.html|app\.js|style\.css|config\.js|manifest\.json|sw\.js)$/.test(url.pathname);
 if(isNavigation||isAppAsset){
  event.respondWith(fetch(request).then(response=>{
   if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
   return response;
  }).catch(()=>caches.match(request).then(hit=>hit||caches.match('./index.html'))));
  return;
 }
 event.respondWith(caches.match(request).then(hit=>hit||fetch(request).then(response=>{
  if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
  return response;
 }).catch(()=>caches.match('./index.html'))));
});
