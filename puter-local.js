/* Puter SDK replacement: data IndexedDB cache mein, aur (agar Google login ho) user ki Google Drive appData folder mein sync. */
(function(){
var seg=location.pathname.split('/').filter(Boolean);
if(seg.length&&/\.html?$/i.test(seg[seg.length-1]))seg.pop();
var app=seg[seg.length-1]||'root';
var H=null;try{if(window.parent!==window)H=window.parent.AKD||null}catch(e){}
var cloud=!!(H&&H.configured);
function warn(e){try{console.warn('[akd]',e)}catch(x){}}
var dbp=null;
function db(){return dbp||(dbp=(cloud?H.ready:Promise.resolve()).then(function(){
 var n='akd_'+app+(cloud&&H.user?'_'+H.user.sub:'');
 return new Promise(function(res,rej){var r=indexedDB.open(n,2);
  r.onupgradeneeded=function(){var d=r.result;['kv','fs','meta'].forEach(function(s){if(!d.objectStoreNames.contains(s))d.createObjectStore(s)})};
  r.onsuccess=function(){res(r.result)};r.onerror=function(){rej(r.error)}})}))}
function tx(st,mode,fn){return db().then(function(d){return new Promise(function(res,rej){
 var t=d.transaction(st,mode),s=t.objectStore(st),o=fn(s);
 t.oncomplete=function(){res(o&&typeof o==='object'&&'result' in o?o.result:o)};t.onerror=function(){rej(t.error)};t.onabort=function(){rej(t.error)}})})}
function all(st){return db().then(function(d){return new Promise(function(res,rej){
 var s=d.transaction(st).objectStore(st),k=s.getAllKeys(),v=s.getAll();
 v.onsuccess=function(){res({keys:k.result,vals:v.result})};v.onerror=function(){rej(v.error)}})})}
function getM(k){return tx('meta','readonly',function(s){return s.get(k)})}
function setM(k,v){return tx('meta','readwrite',function(s){s.put(v,k)})}
function delM(k){return tx('meta','readwrite',function(s){s.delete(k)})}
function nerr(m){var e=new Error(m);e.code='subject_does_not_exist';return e}

/* ---- Drive ---- */
var UP='https://www.googleapis.com/upload/drive/v3/files',DR='https://www.googleapis.com/drive/v3/files';
function api(url,o){return H.getToken().then(function(t){o=o||{};o.headers=Object.assign({Authorization:'Bearer '+t},o.headers||{});return fetch(url,o)}).then(function(r){
 if(!r.ok)return r.text().then(function(x){throw new Error('Drive '+r.status+' '+x.slice(0,100))});return r})}
function listAll(){var out=[];function nx(pt){return api(DR+'?spaces=appDataFolder&pageSize=1000&fields=nextPageToken,files(id,name,modifiedTime)'+(pt?'&pageToken='+pt:'')).then(function(r){return r.json()}).then(function(j){out=out.concat(j.files||[]);return j.nextPageToken?nx(j.nextPageToken):out})}return nx('')}
function up(name,blob,id){var type=blob.type||'application/octet-stream';
 if(id)return api(UP+'/'+id+'?uploadType=media&fields=id,modifiedTime',{method:'PATCH',headers:{'Content-Type':type},body:blob}).then(function(r){return r.json()});
 var b='akd'+Date.now();
 var body=new Blob(['--'+b+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',JSON.stringify({name:name,parents:['appDataFolder'],mimeType:type}),'\r\n--'+b+'\r\nContent-Type: '+type+'\r\n\r\n',blob,'\r\n--'+b+'--']);
 return api(UP+'?uploadType=multipart&fields=id,modifiedTime',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+b},body:body}).then(function(r){return r.json()})}
function dl(id){return api(DR+'/'+id+'?alt=media').then(function(r){return r.blob()})}
var Q={};function enq(n,job){var p=(Q[n]||Promise.resolve()).then(job);Q[n]=p.catch(function(){});return p}
var kvName=app+'|kv',fsName=function(p){return app+'|fs|'+p};

/* ---- local stores ---- */
function norm(p){p=String(p||'').replace(/\\/g,'/').replace(/\/+/g,'/');if(p.length>1)p=p.replace(/\/$/,'');return p}
function base(p){return p.slice(p.lastIndexOf('/')+1)}
function dir(p){var i=p.lastIndexOf('/');return i<=0?'/':p.slice(0,i)}
function meta(e){return {path:e.path,name:base(e.path),is_dir:!!e.dir,size:e.size||0,modified:e.modified,created:e.created||e.modified,type:e.type||'',id:e.path,uid:e.path}}
function mkParents(p){var parts=p.split('/').filter(Boolean),cur='',w=[];for(var i=0;i<parts.length;i++){cur+='/'+parts[i];w.push(cur)}
 return tx('fs','readwrite',function(s){w.forEach(function(x){var r=s.get(x);r.onsuccess=function(){if(!r.result)s.put({path:x,dir:true,modified:Date.now()},x)}})})}
var rk={
 get:function(k){return tx('kv','readonly',function(s){return s.get(k)}).then(function(v){return v===undefined?null:v})},
 set:function(k,v){return tx('kv','readwrite',function(s){s.put(v,k)}).then(function(){return true})},
 del:function(k){return tx('kv','readwrite',function(s){s.delete(k)}).then(function(){return true})},
 list:function(p,wv){if(typeof p==='boolean'){wv=p;p='*'}p=p||'*';var pre=p.replace(/\*+$/,'');
  return all('kv').then(function(a){var o=[];a.keys.forEach(function(k,i){if(String(k).indexOf(pre)===0)o.push(wv?{key:k,value:a.vals[i]}:k)});return o})}
};
var rf={
 put:function(p,blob,ts){var e={path:p,dir:false,data:blob,size:blob.size,type:blob.type,modified:ts||Date.now()};return tx('fs','readwrite',function(s){s.put(e,p)}).then(function(){return e})},
 get:function(p){return tx('fs','readonly',function(s){return s.get(p)})},
 del:function(p){return all('fs').then(function(a){var ks=a.keys.filter(function(k){return k===p||k.indexOf(p+'/')===0});
  var files=ks.filter(function(k,i){var e=a.vals[a.keys.indexOf(k)];return e&&!e.dir});
  return tx('fs','readwrite',function(s){ks.forEach(function(k){s.delete(k)})}).then(function(){return files})})}
};

/* ---- push hooks (cloud only) ---- */
var kt=null;
function kvDirty(){if(!cloud)return;getM('kvfile').then(function(m){return setM('kvfile',Object.assign({},m,{dirty:true}))}).catch(warn);clearTimeout(kt);kt=setTimeout(pushKv,1200)}
function pushKv(){return enq(kvName,function(){return rk.list('*',true).then(function(items){var o={};items.forEach(function(i){o[i.key]=i.value});
 return getM('kvfile').then(function(m){return up(kvName,new Blob([JSON.stringify(o)],{type:'application/json'}),m&&m.id).then(function(r){return setM('kvfile',{id:r.id,mod:r.modifiedTime,dirty:false})})})})}).catch(warn)}
function pushFs(p,blob){if(!cloud)return;getM('fs:'+p).then(function(m){return setM('fs:'+p,Object.assign({},m,{dirty:true,deleted:false}))}).then(function(){
 return enq(fsName(p),function(){return getM('fs:'+p).then(function(m){return up(fsName(p),blob,m&&m.id).then(function(r){return setM('fs:'+p,{id:r.id,mod:r.modifiedTime,dirty:false})})})})}).catch(warn)}
function pushDel(p){if(!cloud)return;getM('fs:'+p).then(function(m){if(!m)return;return setM('fs:'+p,Object.assign({},m,{deleted:true})).then(function(){
 return enq(fsName(p),function(){return (m.id?api(DR+'/'+m.id,{method:'DELETE'}).catch(warn):Promise.resolve()).then(function(){return delM('fs:'+p)})})})}).catch(warn)}

/* ---- initial sync ---- */
function initSync(){
 return listAll().then(function(files){
  var rm={};files.forEach(function(f){if(f.name.indexOf(app+'|')===0)rm[f.name]=f});
  return syncKv(rm).then(function(){return syncFs(rm)})}).catch(function(e){warn(e)})}
function syncKv(rm){var r=rm[kvName];return getM('kvfile').then(function(m){
 if(r&&!(m&&m.dirty)){return dl(r.id).then(function(b){return b.text()}).then(function(t){var o=JSON.parse(t||'{}');
  return tx('kv','readwrite',function(s){s.clear();Object.keys(o).forEach(function(k){s.put(o[k],k)})})}).then(function(){return setM('kvfile',{id:r.id,mod:r.modifiedTime,dirty:false})})}
 return rk.list('*',true).then(function(it){if(!it.length&&!r)return;return setM('kvfile',{id:r&&r.id,dirty:true}).then(pushKv)})})}
function syncFs(rm){var pre=app+'|fs|';
 return Promise.all([all('fs'),all('meta')]).then(function(res){
  var loc={},mt={};res[0].keys.forEach(function(k,i){if(res[0].vals[i]&&!res[0].vals[i].dir)loc[k]=res[0].vals[i]});
  res[1].keys.forEach(function(k,i){if(String(k).indexOf('fs:')===0)mt[k.slice(3)]=res[1].vals[i]});
  var jobs=[],seen={};
  Object.keys(rm).forEach(function(n){if(n.indexOf(pre)!==0)return;var p=n.slice(pre.length),f=rm[n],m=mt[p];seen[p]=1;
   if(m&&m.deleted){jobs.push(api(DR+'/'+f.id,{method:'DELETE'}).then(function(){return delM('fs:'+p)}));return}
   if(!loc[p]||(m&&!m.dirty&&m.mod!==f.modifiedTime)){
    jobs.push(dl(f.id).then(function(b){return mkParents(dir(p)).then(function(){return rf.put(p,b,Date.parse(f.modifiedTime))})}).then(function(){return setM('fs:'+p,{id:f.id,mod:f.modifiedTime,dirty:false})}))}
   else if(!m||m.dirty){jobs.push(setM('fs:'+p,{id:f.id,mod:f.modifiedTime,dirty:true}).then(function(){pushFs(p,loc[p].data)}))}});
  Object.keys(loc).forEach(function(p){if(seen[p])return;var m=mt[p];
   if(m&&!m.dirty){jobs.push(rf.del(p).then(function(){return delM('fs:'+p)}))}
   else jobs.push(Promise.resolve(pushFs(p,loc[p].data)))});
  return Promise.all(jobs.map(function(j){return Promise.resolve(j).catch(warn)}))})}
var syncP=cloud?db().then(initSync):Promise.resolve();
function G(f){return function(){var a=arguments;return syncP.then(function(){return f.apply(null,a)})}}

/* ---- public API ---- */
function isObj(x){return x&&typeof x==='object'&&!Array.isArray(x)}
function addPath(o,path,d){var ks=String(path).split('.'),c=o;for(var i=0;i<ks.length-1;i++){if(!isObj(c[ks[i]]))c[ks[i]]={};c=c[ks[i]]}var l=ks[ks.length-1];c[l]=(+c[l]||0)+d}
function putMany(pairs){return tx('kv','readwrite',function(s){pairs.forEach(function(p){s.put(p.value,p.key)})}).then(function(){return true})}
function delMany(ks){return tx('kv','readwrite',function(s){ks.forEach(function(k){s.delete(k)})}).then(function(){return true})}
function listImpl(a,b){
 var pat='*',wv=false,lim=0,cur=0,objForm=false;
 if(isObj(a)){objForm=true;pat=a.pattern||'*';wv=!!a.returnValues;lim=+a.limit||0;cur=+a.cursor||0}
 else if(typeof a==='boolean'){wv=a}else{pat=a||'*';wv=!!b}
 return rk.list(pat,wv).then(function(items){
  items.sort(function(x,y){var p=wv?x.key:x,q=wv?y.key:y;return p<q?-1:p>q?1:0});
  if(!objForm)return items;
  var end=lim?cur+lim:items.length;
  return {items:items.slice(cur,end),cursor:end<items.length?String(end):undefined}})}
function incr(k,n,sg){return rk.get(k).then(function(v){
 if(isObj(n)){v=isObj(v)?v:{};Object.keys(n).forEach(function(p){addPath(v,p,sg*n[p])})}
 else v=(+v||0)+sg*(n==null?1:n);
 return rk.set(k,v).then(function(){kvDirty();return v})})}
var kv={
 get:G(function(k){return Array.isArray(k)?Promise.all(k.map(function(x){return rk.get(x)})):rk.get(k)}),
 set:G(function(k,v){if(Array.isArray(k))return putMany(k).then(function(r){kvDirty();return r});return rk.set(k,v).then(function(r){kvDirty();return r})}),
 del:G(function(k){return delMany(Array.isArray(k)?k:[k]).then(function(r){kvDirty();return r})}),
 list:G(listImpl),
 incr:G(function(k,n){return incr(k,n,1)}),
 decr:G(function(k,n){return incr(k,n,-1)}),
 expire:G(function(){return Promise.resolve(true)}),
 expireAt:G(function(){return Promise.resolve(true)}),
 flush:G(function(){return tx('kv','readwrite',function(s){s.clear()}).then(function(){kvDirty();return true})})};
var fs={
 write:G(function(p,data,o){p=norm(p);o=o||{};
  var blob=data instanceof Blob?data:new Blob([data==null?'':(typeof data==='string'?data:JSON.stringify(data))]);
  return (o.createMissingParents?mkParents(dir(p)):Promise.resolve()).then(function(){return rf.put(p,blob)}).then(function(e){pushFs(p,blob);return meta(e)})}),
 read:G(function(p){p=norm(p);return rf.get(p).then(function(e){if(!e||e.dir)throw nerr('File not found: '+p);return e.data})}),
 stat:G(function(p){p=norm(p);return rf.get(p).then(function(e){if(!e)throw nerr('Not found: '+p);return meta(e)})}),
 exists:G(function(p){return rf.get(norm(p)).then(function(e){return !!e})}),
 mkdir:G(function(p){p=norm(p);return mkParents(p).then(function(){return {path:p,name:base(p),is_dir:true}})}),
 readdir:G(function(p){p=norm(p);return all('fs').then(function(a){var o=[];a.vals.forEach(function(e){if(e&&e.path!==p&&dir(e.path)===p)o.push(meta(e))});return o})}),
 delete:G(function(p){p=norm(p);return rf.del(p).then(function(files){files.forEach(pushDel);return true})}),
 getReadURL:G(function(p){return rf.get(norm(p)).then(function(e){if(!e)throw nerr('Not found');return URL.createObjectURL(e.data)})})
};
fs.copy=function(a,b){return fs.read(a).then(function(bl){return fs.write(b,bl,{createMissingParents:true})})};
fs.move=function(a,b){return fs.copy(a,b).then(function(){return fs.delete(a)})};

var nope=function(n){return new Proxy({},{get:function(){return function(){return Promise.reject(new Error(n+' feature abhi available nahi hai.'))}}})};
var noop=new Proxy({},{get:function(){return function(){return Promise.resolve()}}});
function user(){var u=cloud&&H.user||{};return {username:(u.email||'akshardham').split('@')[0],uuid:u.sub||'local-user',email:u.email||'',is_temp:false}}
window.puter={kv:kv,fs:fs,env:'web',
 auth:{isSignedIn:function(){return true},getUser:function(){return (cloud?H.ready:Promise.resolve()).then(user)},signIn:function(){return Promise.resolve(user())},signOut:function(){return Promise.resolve()},getProfilePicture:function(){return Promise.resolve(cloud&&H.user&&H.user.picture||null)}},
 ui:noop,workers:nope('Workers'),hosting:nope('Hosting'),email:nope('Email'),ai:nope('AI'),site:nope('Site'),
 authToken:'local',appID:'local',randName:function(){return Math.random().toString(36).slice(2,10)}};
})();
