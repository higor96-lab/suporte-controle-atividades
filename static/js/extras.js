// Versao 3.5: Hoje em blocos, criacao rapida por texto, checklist, planejar e encerrar o dia, nao perturbe,
// atalhos personalizaveis, lixeira, painel para TV, mes a mes, auditoria de tempo e permissoes na tela.
(function(){
"use strict";
var S=window.SUP;if(!S)return;
var ME=S.ME||{},$=function(i){return document.getElementById(i)},esc=S.esc,fm=S.fm,iso=S.iso,jf=S.jf,toast=S.toast;
function qa(s,el){return Array.prototype.slice.call((el||document).querySelectorAll(s))}
function lget(k,d){try{var v=localStorage.getItem(k);return v===null?d:v}catch(e){return d}}
function lset(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function nrm(t){return String(t||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase()}
function perm(p){return (ME.perms||[]).indexOf(p)>-1}
function hoje(){return iso(new Date())}
function addDias(d,n){var p=d.split("-"),x=new Date(+p[0],+p[1]-1,+p[2]+n);return iso(x)}
function proxUtil(d){var x=addDias(d,1),w=new Date(x+"T12:00").getDay();if(w===6)x=addDias(x,2);else if(w===0)x=addDias(x,1);return x}
function br(d){return d?d.slice(8,10)+"/"+d.slice(5,7):""}
function nomeDia(d){var h=hoje();return d===h?"hoje":d===addDias(h,1)?"amanhã":d===addDias(h,-1)?"ontem":br(d)}
function mins(t){var p=String(t||"").split(":");return +p[0]*60+(+p[1]||0)}
function hm(m){return ("0"+Math.floor(m/60)).slice(-2)+":"+("0"+m%60).slice(-2)}
function itens(){return S.items()}
function baixa(nome,txt){try{var b=new Blob(["﻿"+txt],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=nome;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},500)}catch(e){}}
function csv(l){return l.map(function(r){return r.map(function(v){return '"'+String(v==null?"":v).replace(/"/g,'""')+'"'}).join(";")}).join("\r\n")}
function recarrega(){return jf("GET","/api/atividades").then(function(x){if(x.ok&&Array.isArray(x.d)){var l=x.d.map(S.nz);S.setItems(l);S.setSnap(S.mk(l));S.render()}})}
if(!ME.id)return;

// ================= permissoes na tela =================
function aplicaPerms(){
  if(!perm("exportar"))["exp","exp2","rXls","rPdf","auCsv","gDrCsv"].forEach(function(i){if($(i))$(i).hidden=true});
  if(!perm("exportar"))qa("[data-png]").forEach(function(b){b.hidden=true});
  if(!perm("editar_metas")&&$("pMetas"))$("pMetas").hidden=true;
  if(!ME.equipe){$("cmpEq").hidden=true}else $("auEW").hidden=false}
aplicaPerms();

// ================= Hoje em blocos: Agora, Proximas, Atrasadas =================
function blkRender(){
  var box=$("blk");if(!box||box.hidden)return;
  var d=$("day").value,h=hoje(),agoraM=new Date().getHours()*60+new Date().getMinutes();
  var di=S.dayItems(),pend=di.filter(function(i){return i.status!=="done"}),feitas=di.filter(function(i){return i.status==="done"});
  var agora=pend.filter(function(i){if(i.status==="doing"||i.tstart)return true;if(d!==h||!i.time)return false;var a=mins(i.time);return agoraM>=a&&agoraM<a+Math.max(15,+i.dur||0)});
  var ids={};agora.forEach(function(i){ids[i.id]=1});
  var prox=pend.filter(function(i){return !ids[i.id]});
  var atr=itens().filter(function(i){return S.lateOf(i)&&i.date!==d&&!ids[i.id]}).sort(function(a,b){return (a.date+(a.time||"")).localeCompare(b.date+(b.time||""))});
  function bloco(cls,tit,sub,l,vazio,showDate){
    return '<section class="bk '+cls+'"><header><h3>'+tit+'</h3><span class="bkn">'+l.length+'</span><small>'+sub+'</small></header>'+
      (l.length?'<ul>'+l.map(function(i){return S.row(i,showDate)}).join("")+'</ul>':'<p class="bkv">'+vazio+'</p>')+'</section>'}
  box.innerHTML=bloco("bk-agora","Agora",d===h?"em andamento ou no horário":"em andamento",agora,"Nada em andamento. Clique em ▶ Iniciar numa atividade.")+
    bloco("bk-prox",d===h?"Próximas":"Programadas",d===h?"ainda hoje":"para "+nomeDia(d),prox,d===h?"Nada mais programado para hoje. 🎉":"Nada programado.")+
    (atr.length?bloco("bk-atr","Atrasadas","de outros dias, em aberto",atr.slice(0,30),"",true):"")+
    (feitas.length?'<details class="bk bk-ok"><summary><h3>Concluídas</h3><span class="bkn">'+feitas.length+'</span></summary><ul>'+feitas.map(function(i){return S.row(i)}).join("")+'</ul></details>':"")}
window.blkRender=blkRender;
S.hooks.push(blkRender);
$("blk").addEventListener("click",S.onAct);
qa('[data-selm="list"]').forEach(function(b){b.addEventListener("click",function(){if(document.body.classList.contains("modo-blocos")&&window.Telas_setModo)window.Telas_setModo("lista")},true)});
blkRender();
setInterval(function(){if(!document.hidden&&S.view()==="visao")blkRender()},60000);

// ================= criacao rapida por texto =================
var DIAS={domingo:0,segunda:1,"segunda-feira":1,terca:2,"terca-feira":2,quarta:3,"quarta-feira":3,quinta:4,"quinta-feira":4,sexta:5,"sexta-feira":5,sabado:6};
var CURTO={dom:0,seg:1,ter:2,qua:3,qui:4,sex:5,sab:6};
var CATW=[[/reuni|alinhament|daily|call\b/,"REU"],[/treina|capacit|curso/,"TRE"],[/import|carga|planilha/,"IMP"],[/document|manual|relatorio|procedimento/,"DOC"],[/desenvolv|ajuste|corrig|script|codigo|deploy|bug/,"DEV"],[/suporte|atend|chamado|instal|config|impressora|acesso|senha|rede/,"SUP"]];
function parse(txt){
  var tk=String(txt||"").trim().split(/\s+/).filter(Boolean),out={tags:[],who:"",date:"",time:"",dur:0,prio:"",cat:""},resto=[],h=hoje();
  var LIG={"as":1,"às":1,"a":0,"em":1,"no":1,"na":1,"dia":1,"por":1,"durante":1,"de":0,"proxima":1,"próxima":1,"proximo":1,"próximo":1};
  function liga(){while(resto.length&&LIG[nrm(resto[resto.length-1])]===1)resto.pop()}
  for(var k=0;k<tk.length;k++){
    var t=tk[k],n=nrm(t).replace(/[.,;]$/,""),m,ant=k?nrm(tk[k-1]):"";
    if(/^#[^\s#]{1,24}$/.test(t)){out.tags.push(t.slice(1).toLowerCase().replace(/[.,;]$/,""));continue}
    if(/^@\S{1,60}$/.test(t)){out.who=t.slice(1).replace(/_/g," ").replace(/[.,;]$/,"");continue}
    if(/^!(alta|media|média|baixa)$/.test(n)){out.prio=n.slice(1).replace("é","e");continue}
    if(!out.date){
      if(n==="hoje"){out.date=h;liga();continue}
      if(n==="amanha"){if(nrm(resto[resto.length-1]||"")==="de"&&nrm(resto[resto.length-2]||"")==="depois"){resto.splice(-2,2);out.date=addDias(h,2)}else out.date=addDias(h,1);liga();continue}
      var wd=DIAS[n];if(wd===undefined&&CURTO[n]!==undefined&&/^(na|no|dia|proxima|proximo)$/.test(ant))wd=CURTO[n];
      if(wd!==undefined){var dd=new Date(),dif=(wd-dd.getDay()+7)%7||7;out.date=addDias(h,dif);liga();continue}
      if((m=n.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/))){var y=m[3]?(m[3].length===2?"20"+m[3]:m[3]):h.slice(0,4),dt=y+"-"+("0"+m[2]).slice(-2)+"-"+("0"+m[1]).slice(-2);
        if(!m[3]&&dt<h)dt=(+y+1)+dt.slice(4);if(!isNaN(new Date(dt+"T12:00"))){out.date=dt;liga();continue}}
      if(ant==="dia"&&/^\d{1,2}$/.test(n)&&+n>=1&&+n<=31){var mm=h.slice(0,8)+("0"+n).slice(-2);if(mm<h)mm=addDias(h.slice(0,8)+"01",32).slice(0,8)+("0"+n).slice(-2);out.date=mm;liga();continue}}
    // duracao: 30min, 45m, 1h30min, ou 2h / 1h30 depois que o horario ja foi achado (ou com "por"/"durante")
    if((m=n.match(/^(\d{1,3})\s?(min|mins|minutos|m)$/))){out.dur=+m[1];liga();continue}
    if((m=n.match(/^(\d{1,2})h(\d{1,2})min$/))){out.dur=+m[1]*60+(+m[2]);liga();continue}
    if((m=n.match(/^(\d{1,2})h(\d{2})?$/))&&(out.time||ant==="por"||ant==="durante")){out.dur=+m[1]*60+(+m[2]||0);liga();continue}
    if(!out.time&&((m=n.match(/^(\d{1,2})(?:h|:)(\d{2})?h?$/))||((ant==="as"||ant==="às")&&(m=n.match(/^(\d{1,2})$/))))){
      if(+m[1]<=23&&(+m[2]||0)<=59){out.time=("0"+m[1]).slice(-2)+":"+("0"+(+m[2]||0)).slice(-2);liga();continue}}
    if(n==="horas"||n==="hora")continue;
    resto.push(t)}
  liga();
  var tit=resto.join(" ").replace(/\s+/g," ").trim();out.title=tit?tit[0].toUpperCase()+tit.slice(1):"";
  var tn=nrm(out.title);for(var c=0;c<CATW.length;c++)if(CATW[c][0].test(tn)){out.cat=CATW[c][1];break}
  return out}
window.parseRapido=parse;
function chips(p){var c=[],dflt=$("day").value;
  c.push('<span class="qc">📅 '+esc(nomeDia(p.date||dflt))+'</span>');
  if(p.time)c.push('<span class="qc">⏰ '+p.time+'</span>');
  c.push('<span class="qc'+(p.dur?'':' qd')+'">⏱ '+(p.dur?fm(p.dur):"30min (padrão)")+'</span>');
  if(p.cat)c.push('<span class="qc">'+esc(S.CATS[p.cat])+'</span>');
  if(p.who)c.push('<span class="qc">☺ '+esc(p.who)+'</span>');
  if(p.prio)c.push('<span class="qc">prioridade '+esc(p.prio)+'</span>');
  p.tags.forEach(function(t){c.push('<span class="qc">#'+esc(t)+'</span>')});
  return (p.title?'<b>'+esc(p.title)+'</b> ':'<b class="qd">digite o nome da atividade</b> ')+c.join("")}
$("qa").addEventListener("input",function(){var v=this.value.trim();$("qaPrev").innerHTML=v?chips(parse(v)):"";$("qaF").classList.toggle("on",!!v)});
$("qa").addEventListener("keydown",function(e){if(e.key==="Escape"){this.value="";this.dispatchEvent(new Event("input"));this.blur()}});
$("qaF").addEventListener("submit",function(e){e.preventDefault();var p=parse($("qa").value);if(!p.title){$("qa").focus();return}
  var c=S.nz({id:S.uid(),date:p.date||$("day").value,time:p.time,dur:p.dur||30,title:p.title.slice(0,200),desc:"",cat:p.cat||"SUP",who:p.who,prio:p.prio||"media",status:"todo",tags:p.tags,subs:[],pin:false,spent:0,tstart:0,due:""});
  S.undoable("Atividade criada",[],function(){S.items().push(c)},[c.id]);S.flashRow(c.id);
  if(c.date!==$("day").value)toast("Criada para "+nomeDia(c.date)+(c.time?" às "+c.time:"")+": “"+c.title+"”.",{ms:4000});
  $("qa").value="";$("qa").dispatchEvent(new Event("input"))});

// ================= checklist rapido =================
var CK=[];
function ckRender(){$("ckL").innerHTML=CK.length?CK.map(function(c){return '<li class="'+(c.feito?"ok":"")+'" data-ck="'+c.id+'"><label><input type="checkbox"'+(c.feito?" checked":"")+'> <span>'+esc(c.texto)+'</span></label>'+(c.criado<hoje()&&!c.feito?'<small>desde '+br(c.criado)+'</small>':'')+'<button type="button" class="ckx" aria-label="Remover item">×</button></li>'}).join(""):'<li class="ckv">Nada por aqui. Anote coisas rápidas, sem data nem hora.</li>'}
function ckSet(x){if(x.ok&&Array.isArray(x.d)){CK=x.d;ckRender()}else if(x.d&&x.d.erro)toast(x.d.erro,{ms:4000})}
jf("GET","/api/checklist").then(ckSet);
$("ckF").addEventListener("submit",function(e){e.preventDefault();var t=$("ckIn").value.trim();if(!t)return;$("ckIn").value="";jf("POST","/api/checklist",{texto:t}).then(ckSet)});
$("ckL").addEventListener("change",function(e){var li=e.target.closest("[data-ck]");if(li)jf("PATCH","/api/checklist/"+li.getAttribute("data-ck"),{feito:e.target.checked}).then(ckSet)});
$("ckL").addEventListener("click",function(e){var b=e.target.closest(".ckx");if(!b)return;var li=b.closest("[data-ck]");jf("DELETE","/api/checklist/"+li.getAttribute("data-ck")).then(ckSet)});

// ================= planejar o dia =================
var plFeitos={};
function sugestoes(){var h=hoje(),lim=addDias(h,2),out=[],vis=Object.assign({},plFeitos);
  itens().forEach(function(i){if(i.status==="done"||vis[i.id])return;var mot="";
    if(i.date<h&&S.lateOf(i))mot="Atrasada desde "+br(i.date);
    else if(i.due&&i.due.slice(0,10)<=lim&&i.date!==h)mot="Prazo "+br(i.due.slice(0,10));
    else if(i.date===h&&!i.time)mot="Hoje, sem horário";
    else if(i.date===addDias(h,1)&&i.prio==="alta")mot="Amanhã, prioridade alta";
    if(mot){vis[i.id]=1;out.push({i:i,mot:mot})}});
  return out.sort(function(a,b){return (a.i.date+(a.i.time||"")).localeCompare(b.i.date+(b.i.time||""))})}
function plRender(){var h=hoje(),sg=sugestoes();
  $("plSub").textContent=new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})+" · "+(sg.length?sg.length+" sugestão(ões)":"nenhuma pendência para organizar");
  $("plSug").innerHTML=sg.length?sg.map(function(s){return '<li draggable="true" data-id="'+s.i.id+'"><div><b>'+esc(s.i.title)+'</b><small>'+esc(s.mot)+(s.i.dur?" · "+fm(s.i.dur):"")+'</small></div><button type="button" class="btn sm" data-pl="hoje">Hoje</button></li>'}).join(""):'<li class="plv">Tudo organizado. 👌</li>';
  var dia=itens().filter(function(i){return i.date===h&&i.time}),ocup={};
  dia.forEach(function(i){var a=mins(i.time),f=a+Math.max(30,+i.dur||30);for(var m=a-a%30;m<f;m+=30)(ocup[m]=ocup[m]||[]).push(i)});
  var agoraM=new Date().getHours()*60+new Date().getMinutes(),html="";
  for(var m=8*60;m<18*60;m+=30){var o=ocup[m],pass=m+30<=agoraM;
    html+='<div class="pls'+(o?" oc":"")+(pass?" pas":"")+'" data-t="'+hm(m)+'"><span class="mono">'+hm(m)+'</span>'+(o?o.filter(function(i){return mins(i.time)>=m&&mins(i.time)<m+30}).map(function(i){return '<em>'+esc(i.title)+'</em>'}).join("")||'<i>ocupado</i>':'<i>livre</i>')+'</div>'}
  $("plAg").innerHTML=html;$("plAuto").checked=lget("plAuto","1")==="1"}
function plMove(id,t){var it=S.findIt(id);if(!it)return;plFeitos[id]=1;S.undoable("Atividade planejada para hoje"+(t?" às "+t:""),[id],function(){it.date=hoje();if(t)it.time=t});plRender()}
$("plSug").addEventListener("click",function(e){var b=e.target.closest("[data-pl]");if(b)plMove(b.closest("[data-id]").getAttribute("data-id"))});
$("plSug").addEventListener("dragstart",function(e){var li=e.target.closest("[data-id]");if(li){e.dataTransfer.setData("text/plain",li.getAttribute("data-id"));e.dataTransfer.effectAllowed="move"}});
$("plAg").addEventListener("dragover",function(e){var s=e.target.closest(".pls");if(s&&!s.classList.contains("pas")){e.preventDefault();qa(".pls.alvo").forEach(function(x){x.classList.remove("alvo")});s.classList.add("alvo")}});
$("plAg").addEventListener("dragleave",function(e){var s=e.target.closest(".pls");if(s)s.classList.remove("alvo")});
$("plAg").addEventListener("drop",function(e){var s=e.target.closest(".pls");if(!s)return;e.preventDefault();plMove(e.dataTransfer.getData("text/plain"),s.getAttribute("data-t"))});
$("plAg").addEventListener("click",function(e){var s=e.target.closest(".pls:not(.oc):not(.pas)");if(!s)return;var first=$("plSug").querySelector("li[data-id]");
  if(first)plMove(first.getAttribute("data-id"),s.getAttribute("data-t"));else{$("plDlg").close();S.openDlg(null,hoje());$("fTime").value=s.getAttribute("data-t")}});
$("plAuto").addEventListener("change",function(){lset("plAuto",this.checked?"1":"0")});
function plAbrir(){plFeitos={};plRender();$("plDlg").showModal()}
$("plBtn").onclick=plAbrir;$("plOk").onclick=function(){$("plDlg").close()};
(function(){var h=hoje(),hr=new Date().getHours();
  if(lget("plAuto","1")==="1"&&hr>=5&&hr<12&&lget("plUlt","")!==h&&!ME.trocar){lset("plUlt",h);
    setTimeout(function(){if(!document.querySelector("dialog[open]")&&sugestoes().length&&S.view()==="visao")plAbrir()},1800)}})();

// ================= resumo do fim do dia =================
function rsAbrir(){var d=$("day").value,di=itens().filter(function(i){return i.date===d}),ok=di.filter(function(i){return i.status==="done"}),pd=di.filter(function(i){return i.status!=="done"});
  var real=ok.reduce(function(s,i){return s+(i.spent?Math.round(i.spent/60):(+i.dur||0))},0),prev=ok.reduce(function(s,i){return s+(+i.dur||0)},0);
  $("rsT").textContent=d===hoje()?"Resumo do dia":"Resumo de "+br(d);
  $("rsSub").textContent=ok.length?(pd.length?"Bom trabalho! Faltaram "+pd.length+".":"Dia fechado. Tudo concluído! 🎉"):"Nenhuma atividade concluída nesta data.";
  $("rsK").innerHTML='<div><b>'+ok.length+'</b><small>concluídas</small></div><div><b>'+fm(real)+'</b><small>tempo gasto</small></div><div><b>'+fm(prev)+'</b><small>previsto (concluídas)</small></div><div><b>'+pd.length+'</b><small>ficaram pendentes</small></div>';
  $("rsBody").innerHTML=(ok.length?'<h3>Concluídas</h3><ul class="rsl">'+ok.map(function(i){return '<li>✓ '+esc(i.title)+'<small>'+(i.spent?fm(Math.round(i.spent/60)):fm(+i.dur||0))+'</small></li>'}).join("")+'</ul>':"")+
    (pd.length?'<h3>Ficaram para depois</h3><ul class="rsl pd">'+pd.map(function(i){return '<li>○ '+esc(i.title)+'<small>'+(i.time||"sem horário")+'</small></li>'}).join("")+'</ul>':"");
  var nx=proxUtil(d);$("rsMove").hidden=!pd.length;$("rsMove").textContent="Passar "+pd.length+" pendente"+(pd.length>1?"s":"")+" para "+(nx===addDias(hoje(),1)?"amanhã":br(nx));
  $("rsMove").onclick=function(){var ids=pd.map(function(i){return i.id});S.undoable(ids.length+" pendente(s) passada(s) para "+br(nx),ids,function(){ids.forEach(function(id){var it=S.findIt(id);if(it){S.stopTimer(it);it.date=nx;if(it.status==="doing")it.status="todo"}})});$("rsDlg").close()};
  $("rsDlg").showModal()}
$("rsBtn").onclick=rsAbrir;$("rsOk").onclick=function(){$("rsDlg").close()};
setInterval(function(){var h=hoje(),n=new Date();if(n.getHours()>=17&&lget("rsUlt","")!==h&&!document.hidden){lset("rsUlt",h);
  var pd=itens().filter(function(i){return i.date===h&&i.status!=="done"}).length;toast("Fim do expediente? "+(pd?pd+" atividade(s) ainda em aberto hoje.":"Tudo concluído hoje!"),{acao:"Ver resumo",fn:rsAbrir,ms:15000})}},60000);

// ================= nao perturbe =================
var fcMin=60;
function fcPill(){var on=ME.foco&&ME.foco*1000>Date.now(),p=$("fcPill");p.hidden=!on;document.body.classList.toggle("emfoco",!!on);
  $("umFoco").textContent=on?"Encerrar não perturbe":"Não perturbe…";
  if(on){var d=new Date(ME.foco*1000);p.textContent="🔕 Em foco até "+("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2)}}
function fcSair(){jf("DELETE","/api/foco").then(function(){ME.foco=0;fcPill();toast("Não perturbe encerrado.",{ms:2500})})}
function fcAbrir(){if(ME.foco&&ME.foco*1000>Date.now()){fcSair();return}$("fcTxt").value="";$("fcDlg").showModal()}
$("fcMin").addEventListener("click",function(e){var b=e.target.closest("[data-v]");if(!b)return;fcMin=+b.getAttribute("data-v");qa("#fcMin button").forEach(function(x){x.setAttribute("aria-pressed",String(x===b))})});
$("fcCancel").onclick=function(){$("fcDlg").close()};
$("fcF").addEventListener("submit",function(e){e.preventDefault();jf("POST","/api/foco",{min:fcMin,txt:$("fcTxt").value.trim()}).then(function(x){if(!x.ok){toast((x.d&&x.d.erro)||"Não foi possível ligar.",{ms:4000});return}
  ME.foco=x.d.ate;fcPill();$("fcDlg").close();toast("Não perturbe ligado por "+fm(fcMin)+".",{ms:3000})})});
$("fcPill").onclick=fcSair;
$("uMenu").addEventListener("click",function(e){var b=e.target.closest("[data-um]");if(!b)return;var k=b.getAttribute("data-um");if(k==="foco")fcAbrir();else if(k==="atalhos2")akAbrir()});
setInterval(fcPill,30000);fcPill();

// ================= lembretes: antecedencia =================
if($("apLembMin")){$("apLembMin").value=lget("lembMin","10");$("apLembMin").addEventListener("change",function(){lset("lembMin",this.value);S.lembTick()})}

// ================= atalhos personalizaveis =================
var ACOES=[
  {id:"nova",t:"Nova atividade",k:"n",run:function(){S.openDlg(null)}},
  {id:"rapida",t:"Criação rápida (Hoje)",k:"q",run:function(){location.hash="#visao";setTimeout(function(){$("qa").focus()},60)}},
  {id:"buscar",t:"Buscar atividade",k:"/",run:function(){document.body.classList.remove("nomenu");$("q").focus()}},
  {id:"cmd",t:"Buscar qualquer coisa (Ctrl+K)",k:"k",run:function(){$("cmdBtn").click()}},
  {id:"planejar",t:"Planejar o dia",k:"p",run:plAbrir},
  {id:"encerrar",t:"Resumo do fim do dia",k:"e",run:rsAbrir},
  {id:"foco",t:"Não perturbe",k:"f",run:fcAbrir},
  {id:"check",t:"Adicionar ao checklist",k:"c",run:function(){location.hash="#visao";setTimeout(function(){$("ckIn").focus()},60)}},
  {id:"hoje",t:"Ir para Hoje",k:"h",run:function(){location.hash="#visao"}},
  {id:"tema",t:"Modo claro/escuro",k:"t",run:S.toggleTheme},
  {id:"lixeira",t:"Abrir a lixeira",k:"",run:function(){location.hash="#lixeira"}},
  {id:"mes",t:"Mês a mês",k:"",run:function(){location.hash="#comparar"}}];
if(perm("tv"))ACOES.push({id:"tv",t:"Painel para TV",k:"",run:function(){location.hash="#tv"}});
var NATIVAS={n:1,"/":1,t:1},RESERV={g:1,"?":1};
function akMapa(){var m={};try{m=JSON.parse(lget("atalhos","{}"))||{}}catch(e){}var o={};ACOES.forEach(function(a){o[a.id]=a.id in m?m[a.id]:a.k});return o}
var gAte=0;
window.addEventListener("keydown",function(e){
  if(e.ctrlKey||e.metaKey||e.altKey||document.body.classList.contains("locked"))return;
  var t=e.target,tag=t&&t.tagName;if(tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT"||(t&&t.isContentEditable))return;
  if(document.querySelector("dialog[open]"))return;
  var k=(e.key||"").toLowerCase();
  if(Date.now()<gAte){gAte=0;return}          // segunda tecla do "G + letra": deixa para o atalho de navegacao
  if(k==="g"){gAte=Date.now()+1500;return}
  var mp=akMapa();for(var i=0;i<ACOES.length;i++)if(mp[ACOES[i].id]&&mp[ACOES[i].id]===k){e.preventDefault();e.stopImmediatePropagation();ACOES[i].run();return}
  if(NATIVAS[k]){e.stopImmediatePropagation()}  // tecla original foi trocada ou desligada
},true);
function akRender(){var mp=akMapa();$("akErr").textContent="";
  $("akL").innerHTML=ACOES.map(function(a){return '<label><span>'+esc(a.t)+'</span><input readonly data-ak="'+a.id+'" value="'+esc((mp[a.id]||"").toUpperCase())+'" placeholder="—" aria-label="Tecla para '+esc(a.t)+'"></label>'}).join("")}
function akAbrir(){akRender();$("akDlg").showModal()}
$("akL").addEventListener("keydown",function(e){var inp=e.target.closest("[data-ak]");if(!inp||e.key==="Tab")return;e.preventDefault();e.stopPropagation();
  var k=(e.key||"").toLowerCase(),id=inp.getAttribute("data-ak"),m;try{m=JSON.parse(lget("atalhos","{}"))||{}}catch(x){m={}}
  if(e.key==="Escape"){$("akDlg").close();return}
  if(k==="backspace"||k==="delete"){m[id]="";lset("atalhos",JSON.stringify(m));akRender();return}
  if(k.length!==1||!/[a-z0-9\/.,;\-=]/.test(k)){$("akErr").textContent="Use uma letra, número ou sinal simples.";return}
  if(RESERV[k]){$("akErr").textContent="A tecla "+k.toUpperCase()+" já é usada pelo sistema (G = ir para…, ? = ajuda).";return}
  var mp=akMapa();for(var o in mp)if(o!==id&&mp[o]===k){m[o]=""}
  m[id]=k;lset("atalhos",JSON.stringify(m));akRender();var nx=$("akL").querySelector('[data-ak="'+id+'"]');if(nx)nx.focus()});
$("akReset").onclick=function(){lset("atalhos","{}");akRender()};$("akOk").onclick=function(){$("akDlg").close()};

// ================= Ctrl+K: mais comandos =================
window.CMD_EXTRA=[function(){var c=[
  {t:"Planejar o dia",s:"Ação",ic:"☀",kw:"planejar dia manha sugestoes organizar",run:plAbrir},
  {t:"Resumo do fim do dia",s:"Ação",ic:"☾",kw:"encerrar resumo fim dia",run:rsAbrir},
  {t:ME.foco&&ME.foco*1000>Date.now()?"Encerrar não perturbe":"Ligar não perturbe",s:"Ação",ic:"🔕",kw:"foco nao perturbe concentrar",run:fcAbrir},
  {t:"Mover atrasadas para hoje",s:"Ação",ic:"⇥",kw:"atrasadas mover hoje trazer",run:function(){var ids=itens().filter(function(i){return S.lateOf(i)&&i.date<hoje()}).map(function(i){return i.id});
    if(!ids.length){toast("Nenhuma atividade atrasada.",{ms:2500});return}S.undoable(ids.length+" atrasada(s) movida(s) para hoje",ids,function(){ids.forEach(function(id){var it=S.findIt(id);if(it)it.date=hoje()})})}},
  {t:"Passar pendentes de hoje para o próximo dia útil",s:"Ação",ic:"⇨",kw:"mover pendentes amanha adiar",run:function(){var nx=proxUtil(hoje()),ids=itens().filter(function(i){return i.date===hoje()&&i.status!=="done"}).map(function(i){return i.id});
    if(!ids.length){toast("Nada pendente hoje.",{ms:2500});return}S.undoable(ids.length+" pendente(s) para "+br(nx),ids,function(){ids.forEach(function(id){var it=S.findIt(id);if(it){S.stopTimer(it);it.date=nx;if(it.status==="doing")it.status="todo"}})})}},
  {t:"Adicionar ao checklist",s:"Ação",ic:"☑",kw:"checklist tarefa rapida lembrar",run:function(){location.hash="#visao";setTimeout(function(){$("ckIn").focus()},80)}},
  {t:"Criação rápida por texto",s:"Ação",ic:"✎",kw:"rapida criar digitar texto",run:function(){location.hash="#visao";setTimeout(function(){$("qa").focus()},80)}},
  {t:"Personalizar atalhos",s:"Conta",ic:"⌨",kw:"atalhos teclas teclado personalizar",run:akAbrir}];
  return c}];
window.CMD_ATIV=function(it){var id=it.id,c=[];
  c.push({t:"Mover para amanhã",s:it.title,ic:"→",run:function(){var x=S.findIt(id);if(x)S.undoable("Movida para amanhã",[id],function(){x.date=addDias(hoje(),1)})}});
  if(it.date!==hoje())c.push({t:"Mover para hoje",s:it.title,ic:"⇥",run:function(){var x=S.findIt(id);if(x)S.undoable("Movida para hoje",[id],function(){x.date=hoje()})}});
  c.push({t:"Delegar para…",s:it.title,ic:"↪",run:function(){var x=S.findIt(id);if(x)S.dgOpen(x)}});
  c.push({t:it.status==="done"?"Reabrir":"Concluir",s:it.title,ic:"✓",run:function(){var x=S.findIt(id);if(x)S.undoable(x.status==="done"?"Atividade reaberta":"Atividade concluída",[id],function(){S.setStatus(x,x.status==="done"?"todo":"done")})}});
  return c};

// ================= lixeira =================
var LX=[];
function lxLoad(){$("lxL").innerHTML='<li class="lxv">Carregando…</li>';jf("GET","/api/lixeira").then(function(x){if(!x.ok)return;LX=x.d.itens||[];lxRender()})}
function lxRender(){$("lxAll").disabled=$("lxClr").disabled=!LX.length;
  $("lxL").innerHTML=LX.length?LX.map(function(r){return '<li data-lx="'+r.id+'"><label><input type="checkbox" class="lxc"> <span><b>'+esc(r.titulo)+'</b><small>Data da atividade '+br(r.data)+' · excluída em '+esc(r.excluida.slice(8,10)+"/"+r.excluida.slice(5,7)+" "+r.excluida.slice(11))+'</small></span></label><em class="'+(r.restam<=3?"perto":"")+'">'+(r.restam?"some em "+r.restam+" dia"+(r.restam>1?"s":""):"some hoje")+'</em><button type="button" class="btn sm" data-lxa="rest">Restaurar</button><button type="button" class="btn sm" data-lxa="del" aria-label="Apagar de vez">Apagar de vez</button></li>'}).join(""):'<li class="lxv">A lixeira está vazia.</li>'}
function lxRest(ids){jf("POST","/api/lixeira/restaurar",{ids:ids}).then(function(x){if(!x.ok)return;var n=(x.d.restauradas||[]).length;toast(n+" atividade"+(n>1?"s":"")+" restaurada"+(n>1?"s":"")+".",{ms:3000});S.whenSaved(function(){return recarrega()});lxLoad()})}
$("lxL").addEventListener("click",function(e){var b=e.target.closest("[data-lxa]");if(!b)return;var id=+b.closest("[data-lx]").getAttribute("data-lx");
  if(b.getAttribute("data-lxa")==="rest")lxRest([id]);
  else if(confirm("Apagar de vez? Não dá para desfazer."))jf("POST","/api/lixeira/apagar",{ids:[id]}).then(lxLoad)});
$("lxAll").onclick=function(){var ids=qa("#lxL .lxc:checked").map(function(c){return +c.closest("[data-lx]").getAttribute("data-lx")});if(!ids.length){toast("Marque as atividades que quer restaurar.",{ms:3000});return}lxRest(ids)};
$("lxClr").onclick=function(){if(confirm("Esvaziar a lixeira? As "+LX.length+" atividades e seus anexos serão apagados de vez."))jf("POST","/api/lixeira/apagar",{tudo:true}).then(lxLoad)};

// ================= mes a mes =================
var cmpEsc="me",cmpMed="feitas",CMP=null,MES=["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
function cmpVal(m){return cmpMed==="feitas"?m.feitas:Math.round((m.min_real||m.min_prev)/6)/10}
function cmpLoad(){$("cmpG").innerHTML='<div class="sk" style="height:260px"></div>';jf("GET","/api/graficos/meses?escopo="+cmpEsc).then(function(x){if(x.ok){CMP=x.d;cmpRender()}else $("cmpG").innerHTML='<p class="lead">'+esc((x.d&&x.d.erro)||"Não foi possível carregar.")+'</p>'})}
function nf(x){return (Math.round(x*10)/10).toLocaleString("pt-BR")}
function pct(a,b){if(!b)return a?"novo":"—";var p=Math.round((a-b)/b*100);return (p>0?"+":"")+p+"%"}
function cmpRender(){if(!CMP)return;var ms=CMP.meses,ult=ms.slice(-12),por={};ms.forEach(function(m){por[m.mes]=m});
  var ant=ult.map(function(m){var k=(+m.mes.slice(0,4)-1)+m.mes.slice(4);return por[k]||null});
  var v=ult.map(cmpVal),va=ant.map(function(m){return m?cmpVal(m):null}),un=cmpMed==="feitas"?"":" h";
  // tendencia: regressao linear sobre os 12 meses (o mes atual ainda esta pela metade, fica de fora do calculo)
  var n=v.length-1,sx=0,sy=0,sxy=0,sxx=0;for(var i=0;i<n;i++){sx+=i;sy+=v[i];sxy+=i*v[i];sxx+=i*i}
  var b=n>1?(n*sxy-sx*sy)/(n*sxx-sx*sx):0,a=n?(sy-b*sx)/n:0,media=n?sy/n:0;
  var comDados=v.slice(0,n).filter(function(x){return x>0}).length,temAnt=va.some(function(x){return x>0});
  var tend=comDados<3?"poucos dados":Math.abs(b)<Math.max(0.5,media*0.03)?"estável":(b>0?"subindo":"caindo"),tx=(b>0?"+":"")+nf(b)+un+" por mês";
  var atual=ult[ult.length-1],aAnt=ant[ant.length-1],ano=+atual.mes.slice(0,4);
  function soma(y,ate){return ms.filter(function(m){return +m.mes.slice(0,4)===y&&m.mes.slice(5)<=ate}).reduce(function(s,m){return s+cmpVal(m)},0)}
  var ytd=soma(ano,atual.mes.slice(5)),ytdA=soma(ano-1,atual.mes.slice(5));
  var semAnt=" · sem dados de "+(ano-1);
  $("cmpKpi").innerHTML='<div><b>'+nf(cmpVal(atual))+un+'</b><small>'+MES[+atual.mes.slice(5)-1]+'/'+ano+' (até hoje)'+(aAnt&&cmpVal(aAnt)?' · '+pct(cmpVal(atual),cmpVal(aAnt))+' vs '+(ano-1):semAnt)+'</small></div>'+
    '<div><b>'+nf(ytd)+un+'</b><small>no ano'+(ytdA?' · '+pct(ytd,ytdA)+' vs mesmo período de '+(ano-1):semAnt)+'</small></div>'+
    '<div><b class="t-'+(tend==="subindo"?"up":tend==="caindo"?"down":"eq")+'">'+(tend==="subindo"?"↗ ":tend==="caindo"?"↘ ":tend==="estável"?"→ ":"")+tend+'</b><small>tendência · '+(tend==="poucos dados"?"precisa de 3 meses com atividades":tend==="estável"?"variação pequena":tx)+'</small></div>'+
    '<div><b>'+nf(media)+un+'</b><small>média por mês (11 meses fechados)</small></div>';
  var W=760,H=260,L=40,R=12,T=14,B=30,mx=Math.max(1,Math.max.apply(null,v.concat(va.filter(function(x){return x!=null}))));
  var st=Math.pow(10,Math.floor(Math.log10(mx))),top=Math.ceil(mx/st)*st;if(top/st<=2)top=Math.ceil(mx/(st/2))*(st/2);
  var gw=(W-L-R)/12,bw=Math.min(34,gw*.55),y=function(x){return T+(H-T-B)*(1-x/top)},svg="";
  for(var g=0;g<=4;g++){var gv=top*g/4,gy=y(gv);svg+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+gy+'" y2="'+gy+'" class="cg"/><text x="'+(L-6)+'" y="'+(gy+4)+'" class="cy">'+nf(gv)+'</text>'}
  ult.forEach(function(m,i){var cx=L+gw*i+gw/2,h=(H-T-B)-(y(v[i])-T),parc=i===ult.length-1;
    svg+='<rect x="'+(cx-bw/2)+'" y="'+y(v[i])+'" width="'+bw+'" height="'+Math.max(0,h)+'" rx="3" class="cb'+(parc?" parc":"")+'"><title>'+MES[+m.mes.slice(5)-1]+'/'+m.mes.slice(0,4)+': '+nf(v[i])+un+(parc?" (mês em andamento)":"")+'</title></rect>'+
      '<text x="'+cx+'" y="'+(H-B+16)+'" class="cx">'+MES[+m.mes.slice(5)-1]+(m.mes.slice(5)==="01"||i===0?" "+m.mes.slice(2,4):"")+'</text>';
    if(temAnt&&va[i]!=null)svg+='<circle cx="'+cx+'" cy="'+y(va[i])+'" r="4.5" class="ca"><title>'+MES[+m.mes.slice(5)-1]+'/'+(+m.mes.slice(0,4)-1)+': '+nf(va[i])+un+'</title></circle>'});
  var pts=va.map(function(x,i){return x==null?null:(L+gw*i+gw/2)+","+y(x)}).filter(Boolean);if(temAnt&&pts.length>1)svg+='<polyline points="'+pts.join(" ")+'" class="cal"/>';
  if(comDados>=3)svg+='<line x1="'+(L+gw/2)+'" y1="'+y(Math.max(0,a))+'" x2="'+(L+gw*(n-1)+gw/2)+'" y2="'+y(Math.max(0,a+b*(n-1)))+'" class="ct"/>';
  $("cmpG").innerHTML='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Gráfico mês a mês">'+svg+'</svg>';
  $("cmpLeg").innerHTML='<span><i class="lb"></i>últimos 12 meses</span>'+(temAnt?'<span><i class="la"></i>mesmo mês, ano anterior</span>':'<span>sem dados do ano anterior para comparar</span>')+(comDados>=3?'<span><i class="lt"></i>tendência</span>':'')+'<span><i class="lp"></i>mês em andamento</span>';
  $("cmpT").innerHTML='<div class="tw"><table class="tbl"><thead><tr><th>Mês</th><th>Este período</th><th>Ano anterior</th><th>Variação</th></tr></thead><tbody>'+
    ult.slice().reverse().map(function(m,j){var i=ult.length-1-j;return '<tr><td>'+MES[+m.mes.slice(5)-1]+'/'+m.mes.slice(0,4)+'</td><td>'+nf(v[i])+un+'</td><td>'+(va[i]==null?"—":nf(va[i])+un)+'</td><td class="'+(va[i]&&v[i]>va[i]?"up":va[i]&&v[i]<va[i]?"down":"")+'">'+(va[i]==null?"—":pct(v[i],va[i]))+'</td></tr>'}).join("")+'</tbody></table></div>'}
function segSel(id,cb){$(id).addEventListener("click",function(e){var b=e.target.closest("[data-v]");if(!b)return;qa("#"+id+" button").forEach(function(x){x.setAttribute("aria-pressed",String(x===b))});cb(b.getAttribute("data-v"))})}
segSel("cmpEsc",function(v){cmpEsc=v;cmpLoad()});segSel("cmpMed",function(v){cmpMed=v;cmpRender()});

// ================= auditoria de tempo =================
var AU=[];
function auLoad(){var p=+$("auP").value,ate=hoje(),de=addDias(ate,1-p),esc2=ME.equipe?$("auE").value:"me";
  $("auL").innerHTML='<div class="sk" style="height:180px"></div>';
  jf("GET","/api/graficos?de="+de+"&ate="+ate+"&escopo="+esc2).then(function(x){if(!x.ok){$("auL").innerHTML='<p class="lead">'+esc((x.d&&x.d.erro)||"Não foi possível carregar.")+'</p>';return}AU=x.d.lista||[];auRender()})}
function auRender(){var X=+$("auX").value,feitas=AU.filter(function(r){return r.status==="done"&&r.dur>0&&r.real>0});
  var est=feitas.filter(function(r){return r.real>=r.dur*X&&r.real-r.dur>=15}).sort(function(a,b){return (b.real-b.dur)-(a.real-a.dur)});
  var acima=est.reduce(function(s,r){return s+r.real-r.dur},0),tipos={};
  feitas.forEach(function(r){var t=tipos[r.cat]=tipos[r.cat]||{n:0,p:0,r:0,e:0};t.n++;t.p+=r.dur;t.r+=r.real});est.forEach(function(r){tipos[r.cat].e++});
  $("auKpi").innerHTML='<div><b>'+est.length+'</b><small>atividades acima do limite</small></div><div><b>'+fm(acima)+'</b><small>tempo além do previsto</small></div>'+
    '<div><b>'+(feitas.length?Math.round(est.length/feitas.length*100):0)+'%</b><small>das concluídas com tempo registrado ('+feitas.length+')</small></div>';
  var tl=Object.keys(tipos).map(function(k){var t=tipos[k];return {k:k,x:t.p?t.r/t.p:0,n:t.n,e:t.e}}).sort(function(a,b){return b.x-a.x}),mx=Math.max(2,Math.max.apply(null,tl.map(function(t){return t.x}).concat([1])));
  $("auTipo").innerHTML=tl.length?'<h3>Real ÷ previsto, por tipo</h3>'+tl.map(function(t){var w=Math.round(t.x/mx*100),cls=t.x>=X?"crit":t.x>1.2?"warn":"good";
    return '<div class="aut"><span>'+esc(S.CATS[t.k]||t.k)+'</span><div class="aub"><i class="'+cls+'" style="width:'+w+'%"></i><em style="left:'+Math.round(1/mx*100)+'%" title="previsto"></em></div><b>'+(Math.round(t.x*10)/10).toString().replace(".",",")+'×</b><small>'+t.e+' de '+t.n+'</small></div>'}).join(""):"";
  $("auL").innerHTML=est.length?'<div class="tw"><table class="tbl au"><thead><tr><th>Data</th><th>Atividade</th>'+(ME.equipe?'<th>Pessoa</th>':'')+'<th>Previsto</th><th>Real</th><th>A mais</th></tr></thead><tbody>'+
    est.map(function(r){var meu=r.uid===ME.id&&S.findIt(r.id);return '<tr'+(meu?' data-au="'+esc(r.id)+'" tabindex="0" class="clk"':'')+'><td>'+br(r.data)+'</td><td>'+esc(r.titulo)+'<small> · '+esc(S.CATS[r.cat]||r.cat)+'</small></td>'+(ME.equipe?'<td>'+esc(r.nome)+'</td>':'')+'<td>'+fm(r.dur)+'</td><td>'+fm(r.real)+'</td><td class="down">+'+fm(r.real-r.dur)+' <small>('+(Math.round(r.real/r.dur*10)/10).toString().replace(".",",")+'×)</small></td></tr>'}).join("")+'</tbody></table></div>'
    :'<p class="lead es2">Nenhuma atividade passou do limite no período. '+(feitas.length?"":"Use o cronômetro (▶) para registrar o tempo real.")+'</p>';
  $("auCsv").onclick=function(){baixa("auditoria-tempo-"+hoje()+".csv",csv([["Data","Atividade","Tipo","Pessoa","Previsto (min)","Real (min)","A mais (min)"]].concat(est.map(function(r){return [br(r.data),r.titulo,S.CATS[r.cat]||r.cat,r.nome,r.dur,r.real,r.real-r.dur]}))))}}
["auP","auE"].forEach(function(i){$(i).addEventListener("change",auLoad)});$("auX").addEventListener("change",auRender);
$("auL").addEventListener("click",function(e){var r=e.target.closest("[data-au]");if(r)S.openDlg(S.findIt(r.getAttribute("data-au")))});
$("auL").addEventListener("keydown",function(e){var r=e.target.closest("[data-au]");if(r&&e.key==="Enter")S.openDlg(S.findIt(r.getAttribute("data-au")))});

// ================= painel para TV =================
var tvT=null,tvR=null;
function tvLoad(){jf("GET","/api/painel",undefined,true).then(function(x){if(x.ok)tvRender(x.d)})}
function tvRender(d){var us=d.usuarios||[],tot=0,ok=0,dg=0,atr=0,foco=0,agora=Date.now()/1000;
  us.forEach(function(u){tot+=u.total;ok+=u.done;dg+=u.doing;atr+=u.atrasadas;if(u.foco>agora)foco++});
  var tdt=new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"});$("tvData").textContent=tdt[0].toUpperCase()+tdt.slice(1);
  $("tvKpi").innerHTML='<div><b>'+ok+'<span>/'+tot+'</span></b><small>concluídas hoje</small></div><div><b>'+(tot?Math.round(ok/tot*100):0)+'%</b><small>do dia</small></div><div><b>'+dg+'</b><small>em andamento</small></div><div class="'+(atr?"crit":"")+'"><b>'+atr+'</b><small>atrasadas</small></div><div><b>'+foco+'</b><small>em foco</small></div>';
  $("tvG").innerHTML=us.map(function(u){var p=u.total?Math.round(u.done/u.total*100):0,cur=(u.itens||[]).filter(function(i){return i.status==="doing"})[0],nx=(u.itens||[]).filter(function(i){return i.status==="todo"})[0],emf=u.foco>agora;
    var meta=u.meta_dia?'<small>meta '+u.done+'/'+u.meta_dia+'</small>':'';
    return '<article class="tvc'+(emf?" foco":"")+'"><header><b>'+esc(u.nome)+'</b>'+(emf?'<span class="tvf2">🔕 foco'+(u.foco_txt?": "+esc(u.foco_txt):"")+'</span>':'')+'</header>'+
      '<div class="tvp"><div class="tvb"><i style="width:'+p+'%"></i></div><span>'+u.done+'/'+u.total+'</span></div>'+meta+
      '<p class="tva">'+(cur?'▶ '+esc(cur.titulo):nx?'<span class="mut">Próxima: '+(nx.hora?nx.hora+" · ":"")+esc(nx.titulo)+'</span>':u.total?'<span class="mut">Tudo concluído ✓</span>':'<span class="mut">Sem atividades hoje</span>')+'</p>'+
      (u.atrasadas?'<p class="tvat">'+u.atrasadas+' atrasada'+(u.atrasadas>1?"s":"")+'</p>':'')+'</article>'}).join("");
  $("tvRod").textContent="Atualizado às "+new Date().toTimeString().slice(0,5)+" · atualiza sozinho a cada minuto."}
function tvHora(){$("tvHora").textContent=new Date().toTimeString().slice(0,5)}
$("tvFull").onclick=function(){var el=document.documentElement;if(document.fullscreenElement)document.exitFullscreen();else if(el.requestFullscreen)el.requestFullscreen().catch(function(){})};
document.addEventListener("fullscreenchange",function(){$("tvFull").textContent=document.fullscreenElement?"Sair da tela cheia":"Tela cheia"});

// ================= troca de tela =================
function naTela(){var v=S.view();document.body.classList.toggle("tvmode",v==="tv");
  clearInterval(tvT);clearInterval(tvR);
  if(v==="tv"){tvLoad();tvHora();tvT=setInterval(tvLoad,60000);tvR=setInterval(tvHora,10000)}
  else if(v==="lixeira")lxLoad();else if(v==="comparar")cmpLoad();else if(v==="auditoria")auLoad();else if(v==="visao")blkRender()}
window.addEventListener("hashchange",function(){setTimeout(naTela,0)});naTela();

// ================= celular: botao + flutuante =================


// ================= tela de login: nada aqui (a pagina recarrega ao entrar) =================
window.Extras={parse:parse,blkRender:blkRender,plAbrir:plAbrir,rsAbrir:rsAbrir,akMapa:akMapa,cmpRender:cmpRender,auRender:auRender,tvRender:tvRender,fcPill:fcPill};
})();
