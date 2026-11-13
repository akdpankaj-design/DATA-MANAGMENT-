(function(){
try{if(navigator.serviceWorker){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister()})})}if(window.caches){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k)})})}}catch(e){}
var CID=window.AKD_CLIENT_ID||'';
var A={configured:!!CID,user:null,tok:null,exp:0,waiters:[],tc:null};
A.ready=new Promise(function(r){A._ready=r});window.AKD=A;
function $(i){return document.getElementById(i)}
var APPS=["accounting","invoicing","expense","crm","contracts","property-management","inventory","pos","contacts"];
if(!A.configured){A._ready();return}
$("lg").style.display="flex";
function msg(t){$("lgm").textContent=t}
function init(){
 if(!window.google||!google.accounts||!google.accounts.oauth2){return setTimeout(init,200)}
 A.tc=google.accounts.oauth2.initTokenClient({client_id:CID,scope:"openid email profile https://www.googleapis.com/auth/drive.appdata",callback:onTok,error_callback:function(e){msg("Login nahi hua ("+(e&&e.type||"error")+"). Popup allow karke dobara try karo.")}});
 $("lgb").disabled=false;msg("")}
function onTok(r){
 if(r.error){msg("Login error: "+r.error);return}
 A.tok=r.access_token;A.exp=Date.now()+(r.expires_in-90)*1000;$("bar").style.display="none";
 var w=A.waiters;A.waiters=[];w.forEach(function(f){f(A.tok)});
 if(!A.user){fetch("https://www.googleapis.com/oauth2/v3/userinfo",{headers:{Authorization:"Bearer "+A.tok}}).then(function(x){return x.json()}).then(function(u){
  A.user=u;$("usr").style.display="block";$("em").textContent=u.email||u.name||"";$("lg").style.display="none";A._ready()}).catch(function(){msg("Profile nahi mila, dobara try karo.")})}}
A.getToken=function(){if(A.tok&&Date.now()<A.exp)return Promise.resolve(A.tok);$("bar").style.display="flex";return new Promise(function(r){A.waiters.push(r)})};
$("lgb").onclick=function(){A.tc.requestAccessToken({})};
$("barb").onclick=function(){A.tc.requestAccessToken({prompt:"",login_hint:A.user&&A.user.email})};
$("out").onclick=function(){
 if(!confirm("Logout karein? Is device ka local copy hat jayega (Google Drive wala data safe rehta hai)."))return;
 var sub=A.user&&A.user.sub;try{if(A.tok)google.accounts.oauth2.revoke(A.tok,function(){})}catch(e){}
 APPS.forEach(function(k){try{indexedDB.deleteDatabase("akd_"+k+"_"+sub)}catch(e){}});
 setTimeout(function(){location.reload()},400)};
$("lgb").disabled=true;msg("Google load ho raha hai...");init();
})();
