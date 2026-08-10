/* Due North — service worker
   Two jobs: (1) serve the app offline, (2) turn a payload-free push
   "tickle" from the worker into a notification. The tickle carries no data,
   so nothing about your coursework crosses the push service. The SW fetches
   the text itself, over https, from your own worker.                        */
const CACHE = "dn-v1";
const SHELL = ["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png"];

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(
    ks.filter(k=>k!==CACHE&&k!=="dn-cfg").map(k=>caches.delete(k))
  )).then(()=>self.clients.claim()));
});

/* network-first for the app shell so updates land, cache as the fallback */
self.addEventListener("fetch", e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET" || u.origin!==location.origin) return;
  e.respondWith(
    fetch(e.request).then(r=>{
      const copy=r.clone();
      caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
      return r;
    }).catch(()=>caches.match(e.request).then(r=>r||caches.match("./index.html")))
  );
});

async function cfg(){
  try{
    const c=await caches.open("dn-cfg"), r=await c.match("/__cfg");
    return r ? r.json() : null;
  }catch(e){ return null; }
}

self.addEventListener("push", e=>{
  e.waitUntil((async()=>{
    let title="Due North", body="You have work due.", tag="dn", data={};
    // if the push did carry a body, use it; otherwise ask the worker
    try{ if(e.data){ const j=e.data.json(); title=j.title||title; body=j.body||body; tag=j.tag||tag; } }
    catch(err){ /* not JSON — fall through to fetch */ }
    if(body==="You have work due."){
      const c=await cfg();
      if(c && c.url){
        try{
          const r=await fetch(c.url.replace(/\/+$/,"")+"/push/payload",{headers:{"X-App-Key":c.key||""}});
          if(r.ok){ const j=await r.json(); title=j.title||title; body=j.body||body; tag=j.tag||tag; data=j; }
        }catch(err){}
      }
    }
    await self.registration.showNotification(title,{
      body, tag, renotify:true, icon:"./icon-192.png", badge:"./icon-192.png",
      data, requireInteraction:false,
      actions:[{action:"open",title:"Open Due North"}]
    });
  })());
});

self.addEventListener("notificationclick", e=>{
  e.notification.close();
  e.waitUntil((async()=>{
    const list=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    for(const c of list) if("focus" in c) return c.focus();
    return self.clients.openWindow("./");
  })());
});
