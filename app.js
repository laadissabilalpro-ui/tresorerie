/* Trésorerie — moteur partagé par index.html (édition) et vue.html (consultation, lecture seule).
   Lecture seule via window.__TRESO_RO__ (vue.html) OU ?vue=/?lecture=/?c=. */
(function(){
"use strict";

/* ===================== CONFIG ===================== */
var SB_URL = "https://lpvuklsxnrqliarwvmst.supabase.co";
var SB_KEY = "sb_publishable_OMWOk-Vvkr_2JGle1oz0kg_d1JLntHJ";

/* ===================== CONSTANTES ===================== */
var COMPTES = {
  especes:{id:"especes",nom:"Espèces"},
  ca:{id:"ca",nom:"Crédit Agricole"},
  revolut:{id:"revolut",nom:"Revolut"}
};
var ORDRE_COMPTES = ["especes","ca","revolut"];
var TYPES = {
  VENTE:{id:"VENTE",label:"Vente",sens:"entree"},
  REMISE:{id:"REMISE",label:"Remise en banque",sens:"transfert"},
  ACHAT:{id:"ACHAT",label:"Achat stock",sens:"sortie"},
  CHARGE:{id:"CHARGE",label:"Charge",sens:"sortie"},
  RETRAIT:{id:"RETRAIT",label:"Retrait perso",sens:"sortie"}
};

/* ===================== HELPERS ARGENT (centimes) ===================== */
function toC(n){return Math.round((Number(n)||0)*100);}
function toE(c){return c/100;}
function round2(n){return Math.round((Number(n)||0)*100)/100;}
function parseMontant(str){
  if(typeof str==="number")return str;
  if(str==null)return NaN;
  var s=String(str).trim().replace(/[\s  ]/g,"");
  if(s==="")return NaN;
  if(s.indexOf(",")>=0 && s.indexOf(".")>=0) s=s.replace(/\./g,"").replace(",",".");
  else s=s.replace(",",".");
  s=s.replace(/[^0-9.\-]/g,"");
  return parseFloat(s);
}
function formatNum(n){
  var c=toC(n),neg=c<0,abs=Math.abs(c),euros=Math.floor(abs/100),cents=abs%100;
  var es=String(euros).replace(/\B(?=(\d{3})+(?!\d))/g," ");
  return (neg?"-":"")+es+","+String(cents).padStart(2,"0");
}
function formatCompact(n){
  var c=toC(n),neg=c<0,abs=Math.abs(c),euros=Math.floor(abs/100),cents=abs%100;
  var es=String(euros).replace(/\B(?=(\d{3})+(?!\d))/g," ");
  return (neg?"-":"")+es+(cents===0?"":","+String(cents).padStart(2,"0"));
}
function money(n){return formatNum(n)+" €";}
function eurC(n){return formatCompact(n)+" €";}
function pctTxt(n){return String(round2(n)).replace(".",",")+" %";}

/* ===================== HELPERS DATE / DIVERS ===================== */
function pad(n){return (n<10?"0":"")+n;}
function dateKey(d){d=d||new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
function today(){return dateKey();}
function frDate(k){var p=k.split("-");return p[2]+"/"+p[1]+"/"+p[0];}
function frDateShort(k){var p=k.split("-");return p[2]+"/"+p[1];}
var MON=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
var DOW=["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
function frDateLong(k){var p=k.split("-");var d=new Date(+p[0],+p[1]-1,+p[2]);var s=DOW[d.getDay()]+" "+(+p[2])+" "+MON[+p[1]-1]+" "+p[0];return s.charAt(0).toUpperCase()+s.slice(1);}
function frHeure(ts){var d=new Date(ts);return pad(d.getHours())+":"+pad(d.getMinutes());}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function uuid(){ try{ if(crypto&&crypto.randomUUID)return crypto.randomUUID(); }catch(e){} return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){var r=Math.random()*16|0,v=c==="x"?r:(r&0x3|0x8);return v.toString(16);}); }
function getParam(name){ try{var u=new URL(window.location.href);return u.searchParams.get(name);}catch(e){return null;} }

/* ===================== LOGIQUE FINANCIERE (centimes) ===================== */
function effectsC(movs){
  var e={especes:0,ca:0,revolut:0};
  for(var i=0;i<movs.length;i++){var m=movs[i],a=toC(m.montant);
    if(m.type==="VENTE")e[m.compte]+=a;
    else if(m.type==="REMISE"){e.especes-=a;e.ca+=a;}
    else e[m.compte]-=a;}
  return e;
}
function balancesC(s,movs){var e=effectsC(movs);return {especes:toC(s.soldesInit.especes)+e.especes,ca:toC(s.soldesInit.ca)+e.ca,revolut:toC(s.soldesInit.revolut)+e.revolut};}
function caJourC(movs){var r={especes:0,ca:0,revolut:0};for(var i=0;i<movs.length;i++){var m=movs[i];if(m.type==="VENTE")r[m.compte]+=toC(m.montant);}r.total=r.especes+r.ca+r.revolut;return r;}
function dispoAcctC(balC,acct,s){if(acct==="especes")return balC.especes-toC(s.fond);return balC[acct];}
function deltasForAccount(dayMovs,acct){
  var arr=[];
  for(var i=0;i<dayMovs.length;i++){var m=dayMovs[i],a=toC(m.montant);
    if(m.type==="VENTE"&&m.compte===acct)arr.push(a);
    else if(m.type==="REMISE"){if(acct==="especes")arr.push(-a);else if(acct==="ca")arr.push(a);}
    else if((m.type==="ACHAT"||m.type==="CHARGE"||m.type==="RETRAIT")&&m.compte===acct)arr.push(-a);
  }
  return arr;
}
function computeAlertes(balC,s){
  var al=[],seuils=s.seuils||{},dispEsp=balC.especes-toC(s.fond);
  if(dispEsp<0)al.push("Espèces disponible négatif : "+money(toE(dispEsp)));
  if(balC.ca<0)al.push("Crédit Agricole négatif : "+money(toE(balC.ca)));
  if(balC.revolut<0)al.push("Revolut négatif : "+money(toE(balC.revolut)));
  if(seuils.especes!=null&&dispEsp>=0&&dispEsp<toC(seuils.especes))al.push("Espèces disponible sous le seuil ("+money(seuils.especes)+") : "+money(toE(dispEsp)));
  if(seuils.ca!=null&&balC.ca>=0&&balC.ca<toC(seuils.ca))al.push("Crédit Agricole sous le seuil ("+money(seuils.ca)+") : "+money(toE(balC.ca)));
  if(seuils.revolut!=null&&balC.revolut>=0&&balC.revolut<toC(seuils.revolut))al.push("Revolut sous le seuil ("+money(seuils.revolut)+") : "+money(toE(balC.revolut)));
  return al;
}
function computeDay(s,allMovs,k){
  var before=[],day=[];
  for(var i=0;i<allMovs.length;i++){var m=allMovs[i];if(m.date<k)before.push(m);else if(m.date===k)day.push(m);}
  day.sort(function(a,b){return a.ts-b.ts;});
  var openC=balancesC(s,before),eff=effectsC(day);
  var closeC={especes:openC.especes+eff.especes,ca:openC.ca+eff.ca,revolut:openC.revolut+eff.revolut};
  var dispoEspC=closeC.especes-toC(s.fond);
  var totalC=dispoEspC+closeC.ca+closeC.revolut;
  return {before:before,dayMovs:day,openC:openC,closeC:closeC,dispoEspC:dispoEspC,totalC:totalC,ca:caJourC(day)};
}

/* ===================== RESUME MENTOR ===================== */
function soldeLine(openC,deltas,closeC){
  var terms=[];
  if(openC!==0)terms.push(openC);
  for(var i=0;i<deltas.length;i++)terms.push(deltas[i]);
  if(terms.length===0)return eurC(0);
  if(terms.length===1)return eurC(toE(closeC));
  var s="";
  for(var j=0;j<terms.length;j++){
    var t=terms[j];
    if(j===0)s+=(t<0?"-":"")+formatCompact(toE(Math.abs(t)));
    else s+=(t<0?" - ":" + ")+formatCompact(toE(Math.abs(t)));
  }
  return s+" = "+eurC(toE(closeC));
}
function buildResumeMentor(s,allMovs,k){
  var d=computeDay(s,allMovs,k),ca=d.ca,L=[];
  L.push("CA du jour — "+frDate(k));
  L.push("Espèces : "+eurC(toE(ca.especes)));
  L.push("CB Crédit Agricole : "+eurC(toE(ca.ca)));
  L.push("Revolut : "+eurC(toE(ca.revolut)));
  L.push("Total : "+eurC(toE(ca.total)));
  var sorties=d.dayMovs.filter(function(m){return m.type==="ACHAT"||m.type==="CHARGE"||m.type==="RETRAIT";});
  L.push("Sorties du jour");
  if(!sorties.length){L.push("Aucune sortie.");}
  else{
    var totSorC=0;
    for(var si=0;si<sorties.length;si++){var sm=sorties[si];totSorC+=toC(sm.montant);
      L.push(TYPES[sm.type].label+" ("+COMPTES[sm.compte].nom+") : "+eurC(sm.montant)+(sm.note?" — "+sm.note:""));}
    L.push("Total sorties : "+eurC(toE(totSorC)));
  }
  L.push("Solde Crédit Agricole : "+soldeLine(d.openC.ca,deltasForAccount(d.dayMovs,"ca"),d.closeC.ca));
  L.push("Solde Revolut : "+soldeLine(d.openC.revolut,deltasForAccount(d.dayMovs,"revolut"),d.closeC.revolut));
  L.push("Espèces disponibles : "+formatCompact(toE(d.closeC.especes))+" - "+formatCompact(s.fond)+" (fond de caisse) = "+eurC(toE(d.dispoEspC)));
  return L.join("\n");
}
function buildResumeCourt(s,allMovs,k){
  var d=computeDay(s,allMovs,k),ca=d.ca;
  return "CA du "+frDateShort(k)+" : "+formatCompact(toE(ca.total))+" € (esp "+formatCompact(toE(ca.especes))+" / CB "+formatCompact(toE(ca.ca))+" / Rev "+formatCompact(toE(ca.revolut))+"). Dispo total : "+formatNum(toE(d.totalC))+" €.";
}

/* ===================== REGISTRE (recettes / débit / solde cumulé + dettes datées) ===================== */
// dette due (centimes) à la date D : incurred (day<=D) et pas réglée avant/à D
function dettesDuesC(debts,D){
  var s=0;
  for(var i=0;i<debts.length;i++){var d=debts[i];
    if(!d._deleted && d.day<=D && (!d.settled_day || d.settled_day>D)) s+=toC(d.montant);
  }
  return s;
}
function buildLedger(s, movs, debts, jours){
  debts=debts||[]; jours=jours||{};
  var openC=toC(s.soldesInit.especes)+toC(s.soldesInit.ca)+toC(s.soldesInit.revolut);
  var openLines=[];
  if(toC(s.soldesInit.especes)!==0) openLines.push({label:"Espèces",recetteC:toC(s.soldesInit.especes),debitC:0});
  if(toC(s.soldesInit.ca)!==0) openLines.push({label:"Crédit Agricole",recetteC:toC(s.soldesInit.ca),debitC:0});
  if(toC(s.soldesInit.revolut)!==0) openLines.push({label:"Revolut",recetteC:toC(s.soldesInit.revolut),debitC:0});
  var map={};
  for(var i=0;i<movs.length;i++){(map[movs[i].date]=map[movs[i].date]||[]).push(movs[i]);}
  var dayKeys=Object.keys(map).sort();
  var fondC=toC(s.fond),running=openC,days=[];
  for(var k=0;k<dayKeys.length;k++){
    var D=dayKeys[k];
    var dmovs=map[D].slice().sort(function(a,b){return a.ts-b.ts;});
    var lines=[];
    if(k===0 && fondC!==0) lines.push({label:"Fond de caisse",recetteC:0,debitC:fondC});
    for(var j=0;j<dmovs.length;j++){
      var m=dmovs[j],a=toC(m.montant);
      if(m.type==="VENTE") lines.push({label:(m.note||COMPTES[m.compte].nom),recetteC:a,debitC:0});
      else if(m.type==="REMISE"){
        lines.push({label:"Remise (Espèces → CA)",recetteC:0,debitC:a});
        lines.push({label:"Remise (Espèces → CA)",recetteC:a,debitC:0});
      } else lines.push({label:(m.note||TYPES[m.type].label),recetteC:0,debitC:a});
    }
    var rec=0,deb=0;
    for(var L2=0;L2<lines.length;L2++){rec+=lines[L2].recetteC;deb+=lines[L2].debitC;}
    running+=rec-deb;
    days.push({date:D,lines:lines,recC:rec,debC:deb,soldeC:running,marge:(jours[D]!=null?jours[D]:null),dettesC:dettesDuesC(debts,D)});
  }
  return {openC:openC,openLines:openLines,days:days,soldeC:running};
}

/* ===================== STOCKAGE LOCAL ===================== */
var LS=window.localStorage;
function lget(k,d){try{var v=LS.getItem(k);return v===null?d:v;}catch(e){return d;}}
function lset(k,v){try{LS.setItem(k,v);}catch(e){}}
function loadCache(){
  try{
    var raw=lget("treso:cache:"+state.code,"");
    if(raw){var o=JSON.parse(raw);
      state.settings=o.settings||null;
      state.movements=Array.isArray(o.movements)?o.movements:[];
      state.debts=Array.isArray(o.debts)?o.debts:[];
      state.jours=o.jours||{};
      state.joursDirty=o.joursDirty||{};
    }else{state.settings=null;state.movements=[];state.debts=[];state.jours={};state.joursDirty={};}
  }catch(e){state.settings=null;state.movements=[];state.debts=[];state.jours={};state.joursDirty={};}
}
function saveCache(){try{lset("treso:cache:"+state.code,JSON.stringify({settings:state.settings,movements:state.movements,debts:state.debts,jours:state.jours,joursDirty:state.joursDirty}));}catch(e){}}

/* ===================== SUPABASE ===================== */
var sb=null;
function client(){
  if(sb)return sb;
  if(!window.supabase||!window.supabase.createClient)throw new Error("supabase-js indisponible");
  sb=window.supabase.createClient(SB_URL,SB_KEY,{realtime:{params:{eventsPerSecond:5}}});
  return sb;
}
function rowToMov(d){return {id:d.id,date:d.day,ts:Number(d.ts),type:d.type,compte:d.compte,montant:Number(d.montant),note:d.note||""};}
function rowToDette(d){return {id:d.id,label:d.label||"",montant:Number(d.montant),day:d.day,settled_day:d.settled_day||null};}
async function pushAll(c){
  if(state.readOnly)return;
  if(state.settings&&state.settings._dirty){
    var s=state.settings;
    var row={code:state.code,fond:s.fond,init_especes:s.soldesInit.especes,init_ca:s.soldesInit.ca,init_revolut:s.soldesInit.revolut,date_init:s.dateInit,seuil_especes:s.seuils.especes,seuil_ca:s.seuils.ca,seuil_revolut:s.seuils.revolut,updated_at:new Date().toISOString()};
    var r=await c.from("treso_settings").upsert(row,{onConflict:"code"});
    if(!r.error)delete state.settings._dirty;
  }
  // Mouvements
  var keep=[];
  for(var i=0;i<state.movements.length;i++){var m=state.movements[i];
    if(m._deleted){var rd=await c.from("treso_mouvements").delete().eq("id",m.id);if(rd.error)keep.push(m);}
    else keep.push(m);
  }
  state.movements=keep;
  for(var j=0;j<state.movements.length;j++){var mm=state.movements[j];
    if(mm._dirty&&!mm._deleted){
      var rr=await c.from("treso_mouvements").upsert({id:mm.id,code:state.code,day:mm.date,ts:mm.ts,type:mm.type,compte:mm.compte,montant:mm.montant,note:mm.note||null,updated_at:new Date().toISOString()},{onConflict:"id"});
      if(!rr.error)delete mm._dirty;
    }
  }
  // Dettes
  var keepD=[];
  for(var di=0;di<state.debts.length;di++){var dd=state.debts[di];
    if(dd._deleted){var rdd=await c.from("treso_dettes").delete().eq("id",dd.id);if(rdd.error)keepD.push(dd);}
    else keepD.push(dd);
  }
  state.debts=keepD;
  for(var dj=0;dj<state.debts.length;dj++){var de=state.debts[dj];
    if(de._dirty&&!de._deleted){
      var rde=await c.from("treso_dettes").upsert({id:de.id,code:state.code,label:de.label||null,montant:de.montant,day:de.day,settled_day:de.settled_day||null,updated_at:new Date().toISOString()},{onConflict:"id"});
      if(!rde.error)delete de._dirty;
    }
  }
  // Marge par jour
  for(var dayk in state.joursDirty){ if(state.joursDirty.hasOwnProperty(dayk)){
    var rj=await c.from("treso_jours").upsert({code:state.code,day:dayk,marge:(state.jours[dayk]!=null?state.jours[dayk]:null),updated_at:new Date().toISOString()},{onConflict:"code,day"});
    if(!rj.error)delete state.joursDirty[dayk];
  }}
}
async function pull(c){
  var sres=await c.from("treso_settings").select("*").eq("code",state.code);
  if(!sres.error&&sres.data&&sres.data[0]&&!(state.settings&&state.settings._dirty)){
    var d=sres.data[0];
    state.settings={fond:Number(d.fond)||0,soldesInit:{especes:Number(d.init_especes)||0,ca:Number(d.init_ca)||0,revolut:Number(d.init_revolut)||0},dateInit:d.date_init||today(),seuils:{especes:d.seuil_especes==null?null:Number(d.seuil_especes),ca:d.seuil_ca==null?null:Number(d.seuil_ca),revolut:d.seuil_revolut==null?null:Number(d.seuil_revolut)}};
  }
  var mres=await c.from("treso_mouvements").select("*").eq("code",state.code);
  if(!mres.error&&mres.data){
    var remote={};mres.data.forEach(function(d){remote[d.id]=rowToMov(d);});
    var tombs=[];
    state.movements.forEach(function(m){if(m._deleted){tombs.push(m);delete remote[m.id];}else if(m._dirty){remote[m.id]=m;}});
    var arr=[];for(var k in remote){if(remote.hasOwnProperty(k))arr.push(remote[k]);}
    state.movements=arr.concat(tombs);
  }
  var dres=await c.from("treso_dettes").select("*").eq("code",state.code);
  if(!dres.error&&dres.data){
    var rd={};dres.data.forEach(function(d){rd[d.id]=rowToDette(d);});
    var tD=[];
    state.debts.forEach(function(x){if(x._deleted){tD.push(x);delete rd[x.id];}else if(x._dirty){rd[x.id]=x;}});
    var aD=[];for(var k2 in rd){if(rd.hasOwnProperty(k2))aD.push(rd[k2]);}
    state.debts=aD.concat(tD);
  }
  var jres=await c.from("treso_jours").select("*").eq("code",state.code);
  if(!jres.error&&jres.data){
    jres.data.forEach(function(r){ if(!state.joursDirty[r.day] && r.marge!=null) state.jours[r.day]=Number(r.marge); });
  }
}
async function sync(){
  if(!state.code){updateSyncBadge();return;}
  if(!navigator.onLine){updateSyncBadge();return;}
  try{var c=client();await pushAll(c);await pull(c);saveCache();}
  catch(e){console.warn("sync",e);}
  state.firstSyncDone=true;
  updateSyncBadge();
}
var debSync=debounce(function(){sync().then(render);},320);
function ensureRealtime(){
  if(!navigator.onLine||!state.code)return;
  try{
    var c=client();
    if(state.channel){try{c.removeChannel(state.channel);}catch(e){}}
    var f="code=eq."+state.code;
    var ch=c.channel("treso-"+state.code);
    ch.on("postgres_changes",{event:"*",schema:"public",table:"treso_mouvements",filter:f},debSync);
    ch.on("postgres_changes",{event:"*",schema:"public",table:"treso_settings",filter:f},debSync);
    ch.on("postgres_changes",{event:"*",schema:"public",table:"treso_dettes",filter:f},debSync);
    ch.on("postgres_changes",{event:"*",schema:"public",table:"treso_jours",filter:f},debSync);
    ch.subscribe();
    state.channel=ch;
  }catch(e){console.warn(e);}
}
function debounce(fn,ms){var t;return function(){clearTimeout(t);t=setTimeout(fn,ms);};}
function syncStatus(){
  if(!navigator.onLine)return "offline";
  var pending=(state.settings&&state.settings._dirty);
  for(var i=0;i<state.movements.length;i++){if(state.movements[i]._dirty||state.movements[i]._deleted){pending=true;break;}}
  for(var d=0;d<state.debts.length;d++){if(state.debts[d]._dirty||state.debts[d]._deleted){pending=true;break;}}
  for(var k in state.joursDirty){if(state.joursDirty.hasOwnProperty(k)){pending=true;break;}}
  return pending?"pending":"ok";
}
function updateSyncBadge(){var el=document.getElementById("syncBadge");if(el)el.outerHTML=syncBadgeHTML();}
function syncBadgeHTML(){
  var st=syncStatus();var lbl=st==="offline"?"Hors-ligne":(st==="pending"?"À jour…":"Synchro");
  return '<span id="syncBadge" class="sync '+st+'"><span class="dot"></span>'+lbl+'</span>';
}

/* ===================== ETAT ===================== */
var state={
  code:lget("treso:code",""),
  readOnly:false,
  settings:null, movements:[], debts:[], jours:{}, joursDirty:{},
  view:"home", form:null, resumeDay:null, editId:null,
  confirm:null, modal:null, channel:null, ready:false, firstSyncDone:false
};
function activeMovs(){return state.movements.filter(function(m){return !m._deleted;});}
function activeDebts(){return state.debts.filter(function(d){return !d._deleted;});}

/* ===================== TOAST / COPIE ===================== */
var toastT=null;
function showToast(msg){var el=document.getElementById("toast");if(!el)return;el.textContent=msg;el.classList.add("show");clearTimeout(toastT);toastT=setTimeout(function(){el.classList.remove("show");},1900);}
function copyText(t){
  try{ if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){showToast("Copié");}).catch(function(){fallbackCopy(t);}); return;} }catch(e){}
  fallbackCopy(t);
}
function fallbackCopy(t){try{var ta=document.createElement("textarea");ta.value=t;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.focus();ta.select();document.execCommand("copy");document.body.removeChild(ta);showToast("Copié");}catch(e){showToast("Copie impossible");}}

/* ===================== ICONES ===================== */
function ic(name){
  var s='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  var b={
    home:'<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    list:'<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3.5" y1="6" x2="3.51" y2="6"/><line x1="3.5" y1="12" x2="3.51" y2="12"/><line x1="3.5" y1="18" x2="3.51" y2="18"/>',
    plus:'<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    resume:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/>',
    ledger:'<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="9" y1="7" x2="17" y2="7"/><line x1="9" y1="11" x2="17" y2="11"/><line x1="9" y1="15" x2="14" y2="15"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    trash:'<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    check:'<polyline points="20 6 9 17 4 12"/>',
    alert:'<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    copy:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    chevron:'<polyline points="9 18 15 12 9 6"/>'
  };
  return s+(b[name]||"")+"</svg>";
}

/* ===================== RENDU ===================== */
var app;
function loadingScreen(msg){return '<div class="loading"><div class="spinner"></div><p>'+esc(msg)+'</p></div>';}
function msgScreen(title,body){return '<div class="msg-screen"><span class="brand-dot big"></span><h1>'+esc(title)+'</h1><p>'+esc(body)+'</p></div>';}

function render(){
  app=app||document.getElementById("app");
  if(!state.code){app.innerHTML=viewOnbCode();return;}
  if(!state.settings){
    if(!state.firstSyncDone&&navigator.onLine){app.innerHTML=loadingScreen("Récupération des données…");return;}
    if(!navigator.onLine){app.innerHTML=state.readOnly?msgScreen("Hors-ligne","Connecte-toi à internet pour afficher les données partagées."):viewOnbSettings();return;}
    app.innerHTML=state.readOnly?msgScreen("Aucune donnée","Aucune donnée n'est encore partagée pour ce code de consultation."):viewOnbSettings();return;
  }
  if(state.readOnly) state.view="registre"; // sa page unique
  else if(state.view==="add"||state.view==="settings"){} // ok
  var html=header();
  html+='<main class="content">';
  if(state.view==="home")html+=viewHome();
  else if(state.view==="add")html+=viewAdd();
  else if(state.view==="movements")html+=viewMovements();
  else if(state.view==="resume")html+=viewResume();
  else if(state.view==="registre")html+=viewRegistre();
  else if(state.view==="settings")html+=viewSettings();
  else html+=viewHome();
  html+="</main>";
  if(!state.readOnly && state.view!=="add" && state.view!=="settings")html+=bottomNav();
  if(state.confirm)html+=confirmModal();
  if(state.modal)html+=modalInput();
  app.innerHTML=html;
  if(!state.readOnly && state.view==="add"){var mi=document.getElementById("montant");if(mi)setTimeout(function(){try{mi.focus();}catch(e){}},120);}
  if(state.modal){var f0=document.getElementById(state.modal.fields[0].id);if(f0)setTimeout(function(){try{f0.focus();}catch(e){}},120);}
}

function header(){
  var titles={home:"Trésorerie",add:(state.editId?"Modifier le mouvement":"Nouveau mouvement"),movements:"Mouvements du jour",resume:"Résumé journalier",registre:"Registre",settings:"Réglages"};
  var showBack=(!state.readOnly)&&(state.view==="add"||state.view==="settings");
  var left=showBack?'<button class="icon-btn" data-act="back" aria-label="Retour">'+ic("home")+'</button>':'<div class="header-brand"><span class="brand-dot"></span></div>';
  var right;
  if(state.readOnly)right=syncBadgeHTML()+'<span class="ro-badge">Consultation</span>';
  else if(showBack)right='<div class="icon-btn placeholder"></div>';
  else right=syncBadgeHTML()+'<button class="icon-btn" data-act="settings" aria-label="Réglages">'+ic("gear")+'</button>';
  var sub=(state.view==="home"||state.readOnly)?'<p class="header-sub">'+frDateLong(today())+'</p>':"";
  var ttl=state.readOnly?"Trésorerie — consultation":titles[state.view];
  return '<header class="header">'+left+'<div class="header-title"><h1>'+ttl+'</h1>'+sub+'</div>'+right+'</header>';
}

function viewHome(){
  var s=state.settings,movs=activeMovs();
  var bal=balancesC(s,movs);
  var tmovs=movs.filter(function(m){return m.date===today();}).sort(function(a,b){return b.ts-a.ts;});
  var ca=caJourC(tmovs);
  var dispoEsp=bal.especes-toC(s.fond);
  var totalConso=dispoEsp+bal.ca+bal.revolut;
  var alertes=computeAlertes(bal,s);
  var negC=function(c){return c<0?" neg":"";};
  var h='<div class="view">';
  if(alertes.length){
    h+='<div class="card alert-card"><div class="alert-head">'+ic("alert")+'<span>Alertes</span></div>';
    for(var i=0;i<alertes.length;i++)h+='<p class="alert-line">'+esc(alertes[i])+'</p>';
    h+='</div>';
  }
  h+='<div class="card hero"><p class="hero-label">Chiffre d\'affaires du jour</p><p class="hero-amount num">'+money(toE(ca.total))+'</p>';
  h+='<div class="hero-breakdown">';
  h+='<div class="chan"><span class="chan-k">Espèces</span><span class="chan-v num">'+money(toE(ca.especes))+'</span></div>';
  h+='<div class="chan"><span class="chan-k">CB</span><span class="chan-v num">'+money(toE(ca.ca))+'</span></div>';
  h+='<div class="chan"><span class="chan-k">Revolut</span><span class="chan-v num">'+money(toE(ca.revolut))+'</span></div>';
  h+='</div></div>';
  if(!state.readOnly){
    h+='<div class="quick-row">';
    h+='<button class="quick-btn" data-act="quick" data-arg="especes"><span class="q-plus">+</span> Vente espèces</button>';
    h+='<button class="quick-btn" data-act="quick" data-arg="ca"><span class="q-plus">+</span> Vente CB</button>';
    h+='<button class="quick-btn" data-act="quick" data-arg="revolut"><span class="q-plus">+</span> Vente Revolut</button>';
    h+='</div>';
  }
  h+='<p class="section-title">Soldes par compte</p>';
  h+='<div class="card acct"><div class="acct-head">Espèces</div>';
  h+='<div class="acct-line"><span>Physique</span><span class="num'+negC(bal.especes)+'">'+money(toE(bal.especes))+'</span></div>';
  h+='<div class="acct-line sub"><span>Fond de caisse</span><span class="num">'+money(s.fond)+'</span></div>';
  h+='<div class="acct-line strong"><span>Disponible</span><span class="num'+negC(dispoEsp)+'">'+money(toE(dispoEsp))+'</span></div></div>';
  h+='<div class="card acct"><div class="acct-line strong only"><span>Crédit Agricole</span><span class="num'+negC(bal.ca)+'">'+money(toE(bal.ca))+'</span></div></div>';
  h+='<div class="card acct"><div class="acct-line strong only"><span>Revolut</span><span class="num'+negC(bal.revolut)+'">'+money(toE(bal.revolut))+'</span></div></div>';
  h+='<div class="card total-card"><p class="total-label">Total consolidé disponible</p><p class="total-amount num'+negC(totalConso)+'">'+money(toE(totalConso))+'</p><p class="total-hint">Espèces dispo + Crédit Agricole + Revolut</p></div>';
  h+='<button class="link-row" data-act="nav" data-arg="registre">Voir le registre complet '+ic("chevron")+'</button>';
  h+='</div>';
  return h;
}

function viewAdd(){
  var f=state.form,isV=f.type==="VENTE",isR=f.type==="REMISE",isP=f.type==="REMB";
  var choices=[{id:"especes",label:"Espèces"},{id:"ca",label:isV?"CB":"Crédit Agricole",sub:isV?"Crédit Agricole":null},{id:"revolut",label:"Revolut"}];
  var h='<div class="view">';
  h+='<p class="section-title">Type de mouvement</p><div class="type-grid">';
  var ks=Object.keys(TYPES);
  for(var i=0;i<ks.length;i++){var t=TYPES[ks[i]];
    h+='<button class="type-btn'+(f.type===t.id?" active":"")+'" data-act="type" data-arg="'+t.id+'"><span class="sens-dot '+t.sens+'"></span>'+t.label+'</button>';
  }
  h+='<button class="type-btn'+(isP?" active":"")+'" data-act="type" data-arg="REMB"><span class="sens-dot sortie"></span>Paiement dette</button>';
  h+='</div>';
  if(isP){
    var open=activeDebts().filter(function(d){return !d.settled_day;});
    h+='<p class="section-title">Quelle dette payer ?</p>';
    if(!open.length){
      h+='<div class="note-box">Aucune dette en cours. Ajoute-la d\'abord dans le registre (« Ce que je dois »).</div>';
    }else{
      h+='<div style="display:flex;flex-direction:column;gap:8px;">';
      for(var p=0;p<open.length;p++){var dd=open[p];
        h+='<button class="seg-btn'+(f.dette_id===dd.id?" active":"")+'" style="flex-direction:row;justify-content:space-between;align-items:center;" data-act="selDette" data-arg="'+dd.id+'"><span>'+esc(dd.label||"Dette")+'</span><span class="num" style="font-weight:700;">'+formatNum(dd.montant)+' €</span></button>';
      }
      h+='</div>';
      h+='<p class="section-title">Payer depuis quel compte ?</p><div class="seg">';
      for(var q=0;q<choices.length;q++){var cp=choices[q];
        h+='<button class="seg-btn'+(f.compte===cp.id?" active":"")+'" data-act="compte" data-arg="'+cp.id+'">'+cp.label+'</button>';
      }
      h+='</div>';
      var selD=findDette(f.dette_id);
      if(selD)h+='<div class="note-box">Montant payé : <b>'+money(selD.montant)+'</b> — débité du compte choisi, et la dette passe en « réglée » automatiquement.</div>';
    }
  }else{
    if(isV){
      h+='<p class="section-title">Canal d\'encaissement</p><div class="seg">';
      for(var j=0;j<choices.length;j++){var c=choices[j];
        h+='<button class="seg-btn'+(f.compte===c.id?" active":"")+'" data-act="compte" data-arg="'+c.id+'">'+c.label+(c.sub?'<small>'+c.sub+'</small>':"")+'</button>';
      }
      h+='</div>';
    }else if(isR){
      h+='<p class="section-title">Sens du transfert</p><div class="transfer-box">Espèces <span class="arrow">→</span> Crédit Agricole</div>';
    }else{
      h+='<p class="section-title">Compte à débiter</p><div class="seg">';
      for(var k=0;k<choices.length;k++){var c2=choices[k];
        h+='<button class="seg-btn'+(f.compte===c2.id?" active":"")+'" data-act="compte" data-arg="'+c2.id+'">'+c2.label+'</button>';
      }
      h+='</div>';
    }
    h+='<p class="section-title">Montant</p><div class="amount-field"><input id="montant" class="amount-input num" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" value="'+esc(f.montant||"")+'"><span class="amount-cur">€</span></div>';
    h+='<p class="section-title">Note / libellé (optionnel)</p><input id="note" class="text-input" type="text" placeholder="ex : Railway, marché de Saint-Paul…" value="'+esc(f.note||"")+'">';
  }
  h+='<button class="btn btn-primary btn-lg full" data-act="submitMov">'+ic("check")+(isP?"Payer la dette":(state.editId?"Enregistrer les modifications":"Valider"))+'</button>';
  if(state.editId)h+='<button class="btn btn-danger full" data-act="delMov" data-arg="'+state.editId+'">'+ic("trash")+'Supprimer ce mouvement</button>';
  h+='</div>';
  return h;
}

function viewMovements(){
  var tmovs=activeMovs().filter(function(m){return m.date===today();}).sort(function(a,b){return b.ts-a.ts;});
  var h='<div class="view">';
  if(!tmovs.length){
    h+='<div class="empty"><p>Aucun mouvement aujourd\'hui.</p><button class="btn btn-primary" data-act="add">'+ic("plus")+'Ajouter un mouvement</button></div>';
  }else{
    h+='<div class="mov-list">';
    for(var i=0;i<tmovs.length;i++){var m=tmovs[i];
      var vente=m.type==="VENTE",remise=m.type==="REMISE";
      var cls=vente?"pos":(remise?"tr":"out"),sign=vente?"+":(remise?"":"-");
      var sub=remise?"Espèces → Crédit Agricole":COMPTES[m.compte].nom;
      if(m.note)sub+=" · "+esc(m.note);
      h+='<div class="mov-row" data-act="editMov" data-arg="'+m.id+'"><div class="mov-main"><div class="mov-top"><span class="mov-type">'+TYPES[m.type].label+'</span><span class="mov-heure">'+frHeure(m.ts)+'</span></div><div class="mov-sub">'+sub+'</div></div><div class="mov-right"><span class="mov-amt num '+cls+'">'+sign+formatNum(m.montant)+' €</span><button class="icon-btn small" data-act="delMov" data-arg="'+m.id+'" data-stop="1" aria-label="Supprimer">'+ic("trash")+'</button></div></div>';
    }
    h+='</div><p class="hint-foot">Touchez un mouvement pour le modifier.</p>';
  }
  h+='</div>';
  return h;
}

function viewResume(){
  var k=state.resumeDay||today();
  var texte=buildResumeMentor(state.settings,activeMovs(),k);
  var court=buildResumeCourt(state.settings,activeMovs(),k);
  var isToday=k===today();
  var h='<div class="view">';
  if(!isToday)h+='<button class="link-row top" data-act="resumeToday">← Revenir à aujourd\'hui ('+frDate(today())+')</button>';
  h+='<div class="card"><pre class="resume-pre">'+esc(texte)+'</pre></div>';
  h+='<button class="btn btn-primary full" data-act="copyResume">'+ic("copy")+'Copier le résumé</button>';
  h+='<p class="section-title">Version courte (WhatsApp)</p><div class="card short-card"><p class="short-text">'+esc(court)+'</p></div>';
  h+='<button class="btn btn-secondary full" data-act="copyCourt">'+ic("copy")+'Copier la version courte</button>';
  h+='</div>';
  return h;
}

/* ---- REGISTRE (page unique) ---- */
function chartHTML(rows){
  if(!rows.length)return '<p class="muted">Pas encore de données.</p>';
  var data=rows.slice(-30),maxC=1;
  for(var i=0;i<data.length;i++)maxC=Math.max(maxC,data[i].caTotal);
  var H=120,barW=26,gap=12,padB=22,padT=8,W=data.length*(barW+gap)+gap;
  var s='<div class="chart-scroll"><svg width="'+W+'" height="'+(H+padB)+'" role="img">';
  for(var j=0;j<data.length;j++){
    var r=data[j],x=gap+j*(barW+gap),hh=Math.max(2,Math.round((r.caTotal/maxC)*(H-padT))),y=H-hh;
    s+='<rect x="'+x+'" y="'+y+'" width="'+barW+'" height="'+hh+'" rx="5" fill="var(--accent)"/>';
    s+='<text x="'+(x+barW/2)+'" y="'+(H+15)+'" text-anchor="middle" class="chart-lbl">'+frDateShort(r.date)+'</text>';
  }
  s+='</svg></div>';
  return s;
}
function fmtCell(c){return c?formatNum(toE(c)):"";}
function ledgerTableHTML(L,ro){
  var st='<style>'
    +'table.ledger{width:100%;border-collapse:collapse;font-size:14px;min-width:540px;}'
    +'table.ledger th{font-size:11.5px;color:var(--ink2);font-weight:600;text-align:left;padding:8px 8px;border-bottom:0.5px solid var(--line);}'
    +'table.ledger th.r,table.ledger td.r{text-align:right;}'
    +'table.ledger td{padding:7px 8px;}'
    +'table.ledger tr.grp td{background:var(--bg);font-size:12px;font-weight:700;color:var(--ink);padding:6px 8px;}'
    +'table.ledger tr.tot td{border-top:0.5px solid var(--line);font-weight:700;}'
    +'table.ledger td.rec{color:var(--greenInk);}table.ledger td.deb{color:var(--red);}'
    +'table.ledger td.solde{font-size:15px;}'
    +'</style>';
  var h=st+'<table class="ledger"><colgroup><col style="width:25%"><col style="width:15%"><col style="width:13%"><col style="width:16%"><col style="width:12%"><col style="width:19%"></colgroup>';
  h+='<thead><tr><th>Libellé</th><th class="r">Recettes</th><th class="r">Débit</th><th class="r">Solde</th><th class="r">Marge %</th><th class="r">Ce que je dois</th></tr></thead><tbody>';
  h+='<tr class="grp"><td colspan="6">Solde avant</td></tr>';
  if(L.openLines.length){
    L.openLines.forEach(function(li){h+='<tr><td>'+esc(li.label)+'</td><td class="r rec">'+fmtCell(li.recetteC)+'</td><td class="r deb">'+fmtCell(li.debitC)+'</td><td></td><td></td><td></td></tr>';});
  }
  h+='<tr class="tot"><td>Total</td><td></td><td></td><td class="r solde">'+formatNum(toE(L.openC))+'</td><td></td><td></td></tr>';
  L.days.forEach(function(d){
    h+='<tr class="grp"><td colspan="6">'+frDateLong(d.date)+'</td></tr>';
    d.lines.forEach(function(li){h+='<tr><td>'+esc(li.label)+'</td><td class="r rec">'+fmtCell(li.recetteC)+'</td><td class="r deb">'+fmtCell(li.debitC)+'</td><td></td><td></td><td></td></tr>';});
    var margeTxt=d.marge!=null?pctTxt(d.marge):(ro?"—":"+ marge");
    var margeCell=ro?('<td class="r">'+(d.marge!=null?pctTxt(d.marge):"—")+'</td>')
                    :('<td class="r" data-act="editMarge" data-arg="'+d.date+'" style="cursor:pointer;color:'+(d.marge!=null?'var(--ink)':'var(--accent)')+';">'+margeTxt+'</td>');
    h+='<tr class="tot"><td>Total</td><td></td><td></td><td class="r solde">'+formatNum(toE(d.soldeC))+'</td>'+margeCell+'<td class="r">'+(d.dettesC?formatNum(toE(d.dettesC)):"—")+'</td></tr>';
  });
  h+='</tbody></table>';
  return h;
}
function dettesPanelHTML(debts,ro){
  var open=debts.filter(function(d){return !d.settled_day;});
  var total=0;open.forEach(function(d){total+=toC(d.montant);});
  var h='<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><p class="section-title flush">Ce que je dois</p><span class="num" style="font-weight:800;">'+money(toE(total))+'</span></div>';
  if(!open.length){h+='<p class="muted">Aucune dette en cours.</p>';}
  else{
    h+='<div class="mov-list">';
    open.forEach(function(d){
      h+='<div class="mov-row'+(ro?" ro":"")+'"><div class="mov-main"><div class="mov-type">'+esc(d.label||"Dette")+'</div><div class="mov-sub">depuis le '+frDate(d.day)+'</div></div><div class="mov-right"><span class="mov-amt num out">'+formatNum(d.montant)+' €</span>'+
         (ro?'':'<button class="btn btn-secondary" style="padding:7px 12px;font-size:13px;" data-act="payDette" data-arg="'+d.id+'" data-stop="1">Payer</button><button class="icon-btn small" data-act="delDette" data-arg="'+d.id+'" data-stop="1" aria-label="Supprimer">'+ic("trash")+'</button>')+
         '</div></div>';
    });
    h+='</div>';
  }
  if(!ro)h+='<button class="btn btn-secondary full" style="margin-top:10px;" data-act="addDette">'+ic("plus")+'Ajouter une dette</button>';
  h+='</div>';
  return h;
}
function viewRegistre(){
  var s=state.settings,movs=activeMovs(),debts=activeDebts(),ro=state.readOnly;
  var L=buildLedger(s,movs,debts,state.jours);
  var totalC=L.days.length?L.days[L.days.length-1].soldeC:L.openC;
  var map={};movs.forEach(function(m){(map[m.date]=map[m.date]||[]).push(m);});
  var rows=Object.keys(map).sort().map(function(k){return {date:k,caTotal:caJourC(map[k]).total};});
  var h='<div class="view">';
  h+='<div class="card total-card"><p class="total-label">Total disponible</p><p class="total-amount num'+(totalC<0?" neg":"")+'">'+money(toE(totalC))+'</p></div>';
  if(rows.length)h+='<div class="card"><p class="section-title flush">CA par jour</p>'+chartHTML(rows)+'</div>';
  h+='<div class="card" style="padding:8px 6px;overflow-x:auto;">'+ledgerTableHTML(L,ro)+'</div>';
  h+=dettesPanelHTML(debts,ro);
  h+='</div>';
  return h;
}

function viewSettings(){
  var s=state.settings;
  var v=function(n){return n==null?"":String(n).replace(".",",");};
  var h='<div class="view">';
  h+='<p class="section-title">Fond de caisse</p><p class="field-hint">Monnaie de rendu fixe, exclue de l\'argent disponible.</p>'+moneyInput("set_fond",v(s.fond));
  h+='<p class="section-title">Soldes de départ</p><p class="field-hint">Espèces = montant physique (fond de caisse inclus).</p>';
  h+=labeledMoney("Espèces (physique)","set_e",v(s.soldesInit.especes));
  h+=labeledMoney("Crédit Agricole","set_ca",v(s.soldesInit.ca));
  h+=labeledMoney("Revolut","set_r",v(s.soldesInit.revolut));
  h+='<p class="section-title">Date d\'initialisation</p><input id="set_date" class="text-input" type="date" value="'+esc(s.dateInit||today())+'" max="'+today()+'">';
  h+='<p class="section-title">Seuils d\'alerte (optionnels)</p><p class="field-hint">Alerte si le disponible passe sous le seuil. Vide = désactivé.</p>';
  h+=labeledMoney("Espèces disponible","set_se",s.seuils.especes==null?"":v(s.seuils.especes),true);
  h+=labeledMoney("Crédit Agricole","set_sca",s.seuils.ca==null?"":v(s.seuils.ca),true);
  h+=labeledMoney("Revolut","set_sr",s.seuils.revolut==null?"":v(s.seuils.revolut),true);
  h+='<div class="note-box">La clôture est automatique par date : les soldes de clôture d\'un jour deviennent l\'ouverture du lendemain.</div>';
  h+='<div class="note-box">Code de synchro : <b>'+esc(state.code)+'</b>. Lien <b>consultation</b> (mentor, lecture seule) : <b>vue.html?c='+esc(state.code)+'</b></div>';
  h+='<button class="btn btn-primary btn-lg full" data-act="saveSettings">'+ic("check")+'Enregistrer les réglages</button>';
  h+='</div>';
  return h;
}
function moneyInput(id,val){return '<div class="money-field"><input id="'+id+'" class="text-input num" type="text" inputmode="decimal" placeholder="0,00" value="'+esc(val||"")+'"><span class="money-cur">€</span></div>';}
function labeledMoney(label,id,val,opt){return '<div class="labeled"><label>'+label+(opt?' <span class="opt">facultatif</span>':"")+'</label>'+moneyInput(id,val)+'</div>';}

function bottomNav(){
  function b(v,icn,lbl){return '<button class="nav-btn'+(state.view===v?" active":"")+'" data-act="nav" data-arg="'+v+'">'+ic(icn)+'<span>'+lbl+'</span></button>';}
  return '<nav class="bottom-nav">'+b("home","home","Accueil")+b("movements","list","Mouvements")+'<button class="nav-fab" data-act="add" aria-label="Ajouter">'+ic("plus")+'</button>'+b("resume","resume","Résumé")+b("registre","ledger","Registre")+'</nav>';
}
function confirmModal(){
  var c=state.confirm;
  return '<div class="overlay" data-act="confirmNo"><div class="modal" data-stop="1"><p class="modal-msg">'+esc(c.message)+'</p><div class="modal-actions"><button class="btn btn-ghost" data-act="confirmNo">Annuler</button><button class="btn '+(c.danger?"btn-danger":"btn-primary")+'" data-act="confirmYes">'+esc(c.confirmLabel||"Confirmer")+'</button></div></div></div>';
}
function modalInput(){
  var m=state.modal,fh="";
  m.fields.forEach(function(f){fh+='<label style="display:block;font-size:13px;font-weight:600;margin:10px 0 4px;">'+esc(f.label)+'</label><input id="'+esc(f.id)+'" class="text-input'+(f.num?" num":"")+'" type="text" '+(f.num?'inputmode="decimal"':'autocomplete="off"')+' placeholder="'+esc(f.placeholder||"")+'" value="'+esc(f.value||"")+'">';});
  return '<div class="overlay" data-act="modalCancel"><div class="modal" data-stop="1"><p class="modal-msg">'+esc(m.title)+'</p>'+fh+'<div class="modal-actions" style="margin-top:16px;"><button class="btn btn-ghost" data-act="modalCancel">Annuler</button><button class="btn btn-primary" data-act="modalConfirm">'+esc(m.confirmLabel||"OK")+'</button></div></div></div>';
}

/* ---- Onboarding ---- */
function viewOnbCode(){
  var ro=state.readOnly;
  var title=ro?"Consultation":"Trésorerie";
  var sub=ro?"Entre le code de consultation communiqué par le commerçant pour voir le suivi (lecture seule)."
            :"Saisis ton code de synchro pour retrouver tes données sur tous tes appareils. Un nouveau code crée un nouveau dossier.";
  var label=ro?"Code de consultation":"Code de synchro";
  var btn=ro?"Voir":"Continuer";
  return '<div class="onb"><div class="ob-head"><span class="brand-dot big"></span><h1>'+title+'</h1><p>'+sub+'</p></div><div class="view tight"><p class="section-title">'+label+'</p><input id="onb_code" class="text-input code-input" type="text" inputmode="numeric" autocomplete="off" placeholder="ex : 4280" value=""><button class="btn btn-primary btn-lg full" data-act="onbCode">'+btn+'</button></div></div>';
}
function viewOnbSettings(){
  return '<div class="onb"><div class="ob-head"><span class="brand-dot big"></span><h1>Bienvenue</h1><p>Configurons tes réglages pour démarrer. Tout est modifiable ensuite.</p></div><div class="view tight">'
    +'<p class="section-title">Fond de caisse</p><p class="field-hint">Monnaie de rendu fixe, exclue du disponible.</p>'+moneyInput("set_fond","")
    +'<p class="section-title">Soldes de départ</p>'+labeledMoney("Espèces (physique, fond inclus)","set_e","")+labeledMoney("Crédit Agricole","set_ca","")+labeledMoney("Revolut","set_r","")
    +'<p class="section-title">Date d\'initialisation</p><input id="set_date" class="text-input" type="date" value="'+today()+'" max="'+today()+'">'
    +'<p class="section-title">Seuils d\'alerte (optionnels)</p>'+labeledMoney("Espèces disponible","set_se","",true)+labeledMoney("Crédit Agricole","set_sca","",true)+labeledMoney("Revolut","set_sr","",true)
    +'<button class="btn btn-primary btn-lg full" data-act="onbSettings">'+ic("check")+'Démarrer</button></div></div>';
}

/* ===================== ACTIONS ===================== */
function captureForm(){
  if(!state.form)return;
  var mi=document.getElementById("montant");if(mi)state.form.montant=mi.value;
  var ni=document.getElementById("note");if(ni)state.form.note=ni.value;
}
function openAdd(preset){
  state.editId=null;
  state.form={type:"VENTE",compte:"especes",montant:"",note:""};
  if(preset){for(var k in preset)state.form[k]=preset[k];}
  state.view="add";render();
}
function readSettingsForm(){
  function val(id){var el=document.getElementById(id);return el?el.value:"";}
  function num(id){var n=parseMontant(val(id));return isNaN(n)?0:round2(n);}
  function seuil(id){var raw=val(id);if(String(raw).trim()==="")return null;var n=parseMontant(raw);return isNaN(n)?null:round2(n);}
  return {fond:Math.max(0,num("set_fond")),soldesInit:{especes:num("set_e"),ca:num("set_ca"),revolut:num("set_r")},dateInit:val("set_date")||today(),seuils:{especes:seuil("set_se"),ca:seuil("set_sca"),revolut:seuil("set_sr")}};
}
function saveSettings(next){state.settings=next;state.settings._dirty=true;saveCache();}
function buildMovFromForm(){
  var f=state.form,existing=state.editId?findMov(state.editId):null;
  if(f.type==="REMB"){
    var dt=findDette(f.dette_id);
    var mt=dt?round2(dt.montant):0;
    return {id:state.editId||uuid(),date:existing?existing.date:today(),ts:existing?existing.ts:Date.now(),type:"CHARGE",compte:f.compte,montant:mt,note:"Paiement dette"+(dt&&dt.label?" : "+dt.label:""),dette_id:f.dette_id,_dirty:true};
  }
  var montant=round2(parseMontant(f.montant));
  return {id:state.editId||uuid(),date:existing?existing.date:today(),ts:existing?existing.ts:Date.now(),type:f.type,compte:f.type==="REMISE"?"especes":f.compte,montant:montant,note:(f.note||"").trim(),_dirty:true};
}
function findMov(id){for(var i=0;i<state.movements.length;i++)if(state.movements[i].id===id)return state.movements[i];return null;}
function findDette(id){for(var i=0;i<state.debts.length;i++)if(state.debts[i].id===id)return state.debts[i];return null;}
function commitMov(m){
  var i=-1;for(var j=0;j<state.movements.length;j++)if(state.movements[j].id===m.id){i=j;break;}
  if(i>=0)state.movements[i]=m;else state.movements.push(m);
  // Paiement de dette : marque la dette réglée (elle sort du « ce que je dois »)
  if(m.dette_id){var dt=findDette(m.dette_id);if(dt&&!dt.settled_day){dt.settled_day=m.date;dt._dirty=true;}}
  saveCache();state.editId=null;state.form=null;state.view=m.dette_id?"registre":"home";render();sync().then(render);
  showToast(m.dette_id?"Dette payée":(i>=0?"Mouvement modifié":"Mouvement enregistré"));
}
function submitMov(){
  var f=state.form;
  if(f.type==="REMB"){
    if(!findDette(f.dette_id)){showToast("Choisis une dette");return;}
    if(!f.compte){showToast("Choisis un compte");return;}
  }else{
    var montant=parseMontant(f.montant);
    if(!(montant>0)){showToast("Montant invalide");return;}
  }
  var m=buildMovFromForm();
  var debit=null;
  if(m.type==="REMISE")debit="especes";else if(m.type!=="VENTE")debit=m.compte;
  if(debit){
    var others=activeMovs().filter(function(x){return x.id!==m.id;});
    var bal=balancesC(state.settings,others.concat([m]));
    var avail=dispoAcctC(bal,debit,state.settings);
    if(avail<0){
      var label=debit==="especes"?"Espèces disponible":COMPTES[debit].nom;
      state.confirm={message:"Cette opération ferait passer "+label+" en négatif ("+money(toE(avail))+"). Confirmer quand même ?",danger:true,confirmLabel:"Confirmer",onYes:function(){state.confirm=null;commitMov(m);}};
      render();return;
    }
  }
  commitMov(m);
}
function deleteMov(id){
  state.confirm={message:"Supprimer ce mouvement ? Les soldes seront recalculés.",danger:true,confirmLabel:"Supprimer",onYes:function(){
    state.confirm=null;var m=findMov(id);if(m){m._deleted=true;m._dirty=false;if(m.dette_id){var dt=findDette(m.dette_id);if(dt){dt.settled_day=null;dt._dirty=true;}}}
    saveCache();if(state.view==="add"){state.editId=null;state.form=null;state.view="home";}
    render();sync().then(render);showToast("Mouvement supprimé");
  }};
  render();
}
function editMarge(day){
  state.modal={title:"Marge % du "+frDate(day),fields:[{id:"m_marge",label:"Marge en %",num:true,value:(state.jours[day]!=null?String(state.jours[day]).replace(".",","):""),placeholder:"ex : 32"}],confirmLabel:"Enregistrer",onConfirm:function(v){
    var raw=(v.m_marge||"").trim();
    if(raw===""){delete state.jours[day];}else{var n=parseMontant(raw);if(isNaN(n)){showToast("Valeur invalide");return false;}state.jours[day]=round2(n);}
    state.joursDirty[day]=true;saveCache();
  }};
  render();
}
function addDette(){
  state.modal={title:"Nouvelle dette",fields:[{id:"d_label",label:"À qui / quoi",value:"",placeholder:"ex : Fournisseur A"},{id:"d_montant",label:"Montant (€)",num:true,value:"",placeholder:"0,00"}],confirmLabel:"Ajouter",onConfirm:function(v){
    var mt=parseMontant(v.d_montant);if(!(mt>0)){showToast("Montant invalide");return false;}
    state.debts.push({id:uuid(),label:(v.d_label||"").trim()||"Dette",montant:round2(mt),day:today(),settled_day:null,_dirty:true});
    saveCache();showToast("Dette ajoutée");
  }};
  render();
}
function settleDette(id){
  var d=findDette(id);if(d){d.settled_day=today();d._dirty=true;}
  saveCache();render();sync().then(render);showToast("Dette réglée");
}
function payDette(id){var d=findDette(id);if(!d)return;openAdd({type:"REMB",dette_id:id,compte:"especes"});}
function delDette(id){
  state.confirm={message:"Supprimer cette dette ?",danger:true,confirmLabel:"Supprimer",onYes:function(){
    state.confirm=null;var d=findDette(id);if(d){d._deleted=true;d._dirty=false;}
    saveCache();render();sync().then(render);showToast("Dette supprimée");
  }};
  render();
}

/* ===================== DELEGATION EVENEMENTS ===================== */
document.addEventListener("click",function(ev){
  var el=ev.target.closest("[data-act]");if(!el)return;
  var act=el.getAttribute("data-act"),arg=el.getAttribute("data-arg");
  if(el.getAttribute("data-stop"))ev.stopPropagation();

  if(state.readOnly){
    var ok={retrySync:1,onbCode:1};
    if(!ok[act])return;
  }

  if(act==="nav"){state.view=arg;if(arg==="resume")state.resumeDay=today();render();return;}
  if(act==="settings"){state.view="settings";render();return;}
  if(act==="back"){state.editId=null;state.form=null;state.view="home";render();return;}
  if(act==="add"){openAdd();return;}
  if(act==="quick"){openAdd({type:"VENTE",compte:arg});return;}
  if(act==="type"){captureForm();state.form.type=arg;if(arg==="REMISE")state.form.compte="especes";else if((arg==="VENTE"||arg==="REMB")&&ORDRE_COMPTES.indexOf(state.form.compte)<0)state.form.compte="especes";render();return;}
  if(act==="selDette"){state.form.dette_id=arg;render();return;}
  if(act==="payDette"){payDette(arg);return;}
  if(act==="compte"){captureForm();state.form.compte=arg;render();return;}
  if(act==="submitMov"){captureForm();submitMov();return;}
  if(act==="editMov"){var m=findMov(arg);if(m){state.editId=arg;state.form={type:m.type,compte:m.compte,montant:String(m.montant).replace(".",","),note:m.note||""};state.view="add";render();}return;}
  if(act==="delMov"){deleteMov(arg);return;}
  if(act==="editMarge"){editMarge(arg);return;}
  if(act==="addDette"){addDette();return;}
  if(act==="settleDette"){settleDette(arg);return;}
  if(act==="delDette"){delDette(arg);return;}
  if(act==="saveSettings"){var next=readSettingsForm();saveSettings(next);state.view="home";render();sync().then(render);showToast("Réglages enregistrés");return;}
  if(act==="copyResume"){copyText(buildResumeMentor(state.settings,activeMovs(),state.resumeDay||today()));return;}
  if(act==="copyCourt"){copyText(buildResumeCourt(state.settings,activeMovs(),state.resumeDay||today()));return;}
  if(act==="resumeToday"){state.resumeDay=today();render();return;}
  if(act==="confirmYes"){if(state.confirm&&state.confirm.onYes)state.confirm.onYes();else{state.confirm=null;render();}return;}
  if(act==="confirmNo"){if(ev.target===el){state.confirm=null;render();}return;}
  if(act==="modalConfirm"){if(!state.modal)return;var vals={};state.modal.fields.forEach(function(f){var e=document.getElementById(f.id);vals[f.id]=e?e.value:"";});var r=state.modal.onConfirm(vals);if(r===false)return;state.modal=null;render();sync().then(render);return;}
  if(act==="modalCancel"){if(ev.target===el){state.modal=null;render();}return;}
  if(act==="onbCode"){var v=(document.getElementById("onb_code")||{}).value||"";v=v.trim();if(!v){showToast("Saisis un code");return;}state.code=v;lset(state.readOnly?"treso:ro_code":"treso:code",v);loadCache();state.firstSyncDone=false;render();sync().then(function(){render();ensureRealtime();});return;}
  if(act==="onbSettings"){var ns=readSettingsForm();saveSettings(ns);state.view="home";render();sync().then(render);return;}
  if(act==="retrySync"){render();sync().then(function(){render();ensureRealtime();});return;}
  if(act==="changeCode"){state.code="";lset("treso:code","");state.settings=null;state.movements=[];state.debts=[];state.jours={};state.joursDirty={};render();return;}
});

document.addEventListener("keydown",function(ev){
  if(ev.key!=="Enter")return;
  if(document.getElementById("onb_code")&&document.activeElement&&document.activeElement.id==="onb_code"){ev.preventDefault();var b=document.querySelector('[data-act="onbCode"]');if(b)b.click();}
  else if(state.modal&&document.activeElement&&/^(m_|d_)/.test(document.activeElement.id||"")){ev.preventDefault();var mb=document.querySelector('[data-act="modalConfirm"]');if(mb)mb.click();}
  else if(!state.readOnly&&state.view==="add"&&document.activeElement&&document.activeElement.id==="montant"){ev.preventDefault();captureForm();submitMov();}
});

/* ===================== CONNECTIVITE ===================== */
window.addEventListener("online",function(){updateSyncBadge();sync().then(function(){render();ensureRealtime();});});
window.addEventListener("offline",function(){updateSyncBadge();});

/* ===================== DEMARRAGE ===================== */
function start(){
  app=document.getElementById("app");
  var param=getParam("vue")||getParam("lecture")||getParam("c");
  state.readOnly=!!(window.__TRESO_RO__||param);
  var CK=state.readOnly?"treso:ro_code":"treso:code";
  if(param){state.code=(param||"").trim();lset(CK,state.code);}
  else{state.code=lget(CK,"");}
  if(state.code)loadCache();
  state.ready=true;
  render();
  if(state.code){sync().then(function(){render();ensureRealtime();});}
}
if(window.supabase||document.readyState!=="loading"){start();}else{window.addEventListener("DOMContentLoaded",start);}

if("serviceWorker" in navigator){
  window.addEventListener("load",function(){navigator.serviceWorker.register("sw.js").catch(function(e){console.warn("SW",e);});});
  // Mise à jour automatique : si une nouvelle version prend le contrôle, on recharge une fois.
  var __initialCtrl=navigator.serviceWorker.controller,__refreshing=false;
  navigator.serviceWorker.addEventListener("controllerchange",function(){
    if(__refreshing)return;
    if(__initialCtrl){__refreshing=true;location.reload();}
  });
}

})();
