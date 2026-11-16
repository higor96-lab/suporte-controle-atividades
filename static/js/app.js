// Interface principal: atividades, telas, relatorios, administracao
(function(){
function api(m,u){var x=new XMLHttpRequest();x.open(m,u,false);x.setRequestHeader("X-Requested-With","fetch");try{x.send(null)}catch(e){return{status:0}}return x}
var ME=null,OFF=false;
function cget(k){try{return JSON.parse(localStorage.getItem(k)||"null")}catch(e){return null}}
function cset(k,v){try{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
try{var _r=api("GET","/api/me");
  if(_r.status===200){ME=JSON.parse(_r.responseText);cset("meCache",ME);
    try{Object.keys(localStorage).forEach(function(k){if(/^atvCache/.test(k)&&k!=="atvCache"+ME.id)localStorage.removeItem(k)})}catch(e){}}
  else if(_r.status===0){ME=cget("meCache");OFF=!!ME}}catch(e){}
window.OFFLINE=OFF;
window.ME=ME;
var CATS={TRE:"Treinamento",IMP:"Importação",SUP:"Suporte",REU:"Reunião",DEV:"Desenvolvimento",DOC:"Documentação"};
var ST={todo:"pendente",doing:"em andamento",done:"concluída"},NX={todo:"doing",doing:"done",done:"todo"};
var $=function(i){return document.getElementById(i)},items=[],filter="all",editing=null,view="visao";
function iso(d){return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2)}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function fm(m){var h=Math.floor(m/60),r=m%60;return h?h+"h"+("0"+r).slice(-2):r+"min"}
function ini(s){return (s||"").split(/\s+/).filter(Boolean).slice(0,2).map(function(w){return w[0]}).join("").toUpperCase()}
// 401 = sessao caiu: recarrega para mostrar o login. So se havia alguem logado e no maximo 1x a cada 10 s
// (sem isso, uma tela que busca dados sem login recarregava sem parar e a pagina ficava piscando).
var _f=window.fetch;window.fetch=function(u,o){return _f.call(window,u,o).then(function(r){
  if(r.status===401&&window.ME&&String(u).indexOf("/api/login")<0){var t=0,now=Date.now();try{t=+sessionStorage.getItem("r401")||0;sessionStorage.setItem("r401",now)}catch(e){}
    if(now-t>10000)location.reload();else{window.ME=null;document.body.classList.add("locked")}}
  return r})};
function jf(m,u,b,poll){var h={"Content-Type":"application/json","X-Requested-With":"fetch"};if(poll)h["X-Poll"]="1";var body=b===undefined?undefined:JSON.stringify(b);
  return fetch(u,{method:m,headers:h,credentials:"same-origin",body:body,keepalive:m==="PATCH"&&!!body&&body.length<60000}).then(function(r){return r.json().catch(function(){return{}}).then(function(d){if(r.status===403&&d.erro==="configurar_2fa"&&window.sgForce)window.sgForce();if(r.status===403&&d.erro==="trocar_senha"){if(window.ME&&!window.ME.trocar){window.ME.trocar=true;if(window.pwOpen)window.pwOpen(true)}}return{ok:r.ok,s:r.status,d:d}})})}
var saveT=null,dirty=false,chain=Promise.resolve(),snap={},busy=0;
function nz(i){i.tags=Array.isArray(i.tags)?i.tags:[];i.subs=Array.isArray(i.subs)?i.subs:[];i.pin=!!i.pin;i.spent=+i.spent||0;i.tstart=+i.tstart||0;i.due=i.due||"";i.fim=+i.fim||0;i.anx=+i.anx||0;return i}
function sig(i){return[i.id,i.date,i.time||"",+i.dur||0,i.title,i.desc||"",i.cat,i.who||"",i.prio,i.status,(i.tags||[]).join("\u0002"),JSON.stringify(i.subs||[]),i.pin?1:0,+i.spent||0,+i.tstart||0,i.due||""].join("\u0001")}
function mk(l){var m={};l.forEach(function(i){m[i.id]=sig(i)});return m}
function save(){dirty=true;clearTimeout(saveT);saveT=setTimeout(flush,150);notifUpdate();cacheSave()}
function flush(){dirty=false;var cur=mk(items),ups=items.filter(function(i){return snap[i.id]!==cur[i.id]}),dels=Object.keys(snap).filter(function(id){return !(id in cur)});
  if(!ups.length&&!dels.length)return;busy++;
  chain=chain.then(function(){return jf("PATCH","/api/atividades",{upserts:ups,deletes:dels})}).then(function(x){busy--;
    if(x.s===401)return;if(!x.ok){alert("Não foi possível salvar no servidor.");return}offSet(false);
    var d=x.d||{},cf={},tit=[];(d.conflitos||[]).forEach(function(c){cf[c.id]=c;tit.push(c.title)});
    ups.forEach(function(i){
      if(cf[i.id]){var k=items.findIndex(function(o){return o.id===i.id});if(k>-1)items[k]=nz(cf[i.id]);snap[i.id]=sig(nz(cf[i.id]));return}
      snap[i.id]=cur[i.id];var live=findIt(i.id);if(live&&d.revs&&d.revs[i.id])live.rev=d.revs[i.id]});
    dels.forEach(function(id){delete snap[id]});
    if(tit.length){toast("“"+tit[0]+"”"+(tit.length>1?" e mais "+(tit.length-1):"")+" foi alterada em outro lugar. Mostrando a versão mais recente.",{ms:9000});render();notifUpdate()}
    cacheSave()}).catch(function(){busy--;dirty=true;offSet(true);cacheSave();clearTimeout(saveT);saveT=setTimeout(flush,OFF?15000:5000)})}
function whenSaved(fn){if(dirty){clearTimeout(saveT);flush()}chain=chain.then(fn).catch(function(){})}
function pull(){if(!ME||dirty||busy||document.hidden)return;jf("GET","/api/atividades",undefined,true).then(function(x){
  if(x.ok)offSet(false);if(!x.ok||dirty||busy||!Array.isArray(x.d))return;var m=mk(x.d),a=Object.keys(m),b=Object.keys(snap);
  if(a.length===b.length&&a.every(function(k){return snap[k]===m[k]})){x.d.forEach(function(r){var l=findIt(r.id);if(l){l.rev=r.rev;l.anx=+r.anx||0;l.fim=+r.fim||0}});return}
  items=x.d.map(nz);snap=mk(items);render();notifUpdate();dgAvisa();cacheSave()}).catch(function(){})}
setInterval(pull,20000);document.addEventListener("visibilitychange",function(){if(!document.hidden)pull()});
window.addEventListener("beforeunload",function(){if(dirty)flush()});
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function load(){var r=api("GET","/api/atividades"),c=ME&&cget("atvCache"+ME.id);
  if(r.status===200){try{items=JSON.parse(r.responseText).map(nz)}catch(e){items=[]}snap=mk(items);
    // havia alteracoes feitas offline e ainda nao enviadas: reaplica por cima e envia
    if(c&&c.pend&&Array.isArray(c.items)&&c.snap){var srvI=items,srv=snap,loc={};items=c.items.map(nz);snap=c.snap;items.forEach(function(i){loc[i.id]=1});
      srvI.forEach(function(i){if(!(i.id in snap)&&!loc[i.id]){items.push(i);snap[i.id]=srv[i.id]}});  // novas no servidor (ex.: delegadas) entram
      setTimeout(function(){dirty=true;flush();toast("Enviando as alterações feitas sem conexão…",{ms:4000})},800)}}
  else if(r.status===0&&c&&Array.isArray(c.items)){items=c.items.map(nz);snap=c.snap||mk(items);OFF=true}
  else{items=[];snap=mk(items)}
  cacheSave()}
var cacheT=null;
function cacheSave(){clearTimeout(cacheT);cacheT=setTimeout(function(){if(!ME)return;var pend=dirty||busy>0||Object.keys(snap).length!==items.length||items.some(function(i){return snap[i.id]!==sig(i)});
  cset("atvCache"+ME.id,{items:items,snap:snap,pend:pend,quando:Date.now()})},300)}
function offSet(on){OFF=on;window.OFFLINE=on;document.body.classList.toggle("offline",on);var b=document.getElementById("offB");if(b)b.hidden=!on}
window.addEventListener("online",function(){setTimeout(function(){if(dirty||Object.keys(snap).length!==items.length||items.some(function(i){return snap[i.id]!==sig(i)})){dirty=true;flush()}pull()},1500)});
window.addEventListener("offline",function(){offSet(true)});
function dayItems(){var d=$("day").value;return items.filter(function(i){return i.date===d}).sort(function(a,b){return (b.pin?1:0)-(a.pin?1:0)||(a.time||"99").localeCompare(b.time||"99")})}
function match(i){var q=$("q").value.trim().toLowerCase();return !q||(i.title+" "+i.desc+" "+i.who+" "+(i.tags||[]).join(" ")).toLowerCase().indexOf(q)>-1}
var openSubs={};
function clk(t){t=Math.max(0,Math.floor(t));var h=Math.floor(t/3600),m=Math.floor(t%3600/60),x=t%60;return (h?h+":"+("0"+m).slice(-2):m)+":"+("0"+x).slice(-2)}
function nowS(){return Math.floor(Date.now()/1000)}
function tmrBtn(i){var run=i.tstart>0,sp=+i.spent||0;
  return '<button class="tmr'+(run?' run':'')+'" data-a="timer" data-ts="'+(run?i.tstart:0)+'" data-sp="'+sp+'" title="'+(run?"Parar o cronômetro":"Iniciar o cronômetro")+'">'+(run?clk(sp+nowS()-i.tstart):(sp?"▶ "+fm(Math.round(sp/60)):"▶ Iniciar"))+'</button>'}
function dueLim(d){return d.length>10?new Date(d.slice(0,10)+"T"+d.slice(11)+":59"):new Date(d.slice(0,10)+"T23:59:59")}
function dueInfo(i){
  if(!i.due)return null;var d=i.due,lim=dueLim(d),txt=d.slice(8,10)+"/"+d.slice(5,7)+(d.length>10?" "+d.slice(11):"");
  if(i.status==="done"){var f=i.fim?new Date(i.fim*1000):null;return f&&f>lim?{cls:"miss",txt:"prazo "+txt+" · fora do prazo"}:{cls:"done",txt:"prazo "+txt+" ✓"}}
  var ms=lim-new Date();
  if(ms<0)return{cls:"late",txt:"prazo "+txt+" · vencido",late:1};
  if(ms<4*3600e3)return{cls:"soon",txt:"prazo "+txt+" · vence em "+(ms<3600e3?Math.max(1,Math.round(ms/60000))+" min":Math.round(ms/3600e3)+" h")};
  return{cls:"",txt:"prazo "+txt}}
function lateOf(i){if(i.status==="done")return false;if(i.due){var d=dueInfo(i);return !!(d&&d.late)}return i.date<iso(new Date())}
function row(i,showDate){
  var sb=i.subs||[],sd=sb.filter(function(x){return x.d}).length,
  tg=(i.tags||[]).map(function(t){return '<span class="etq">#'+esc(t)+'</span>'}).join(""),
  sbBtn=sb.length?'<button class="sbt" data-a="subs" aria-expanded="'+!!openSubs[i.id]+'" title="Mostrar subtarefas"><span class="sbp"><i style="width:'+Math.round(sd/sb.length*100)+'%"></i></span>'+sd+'/'+sb.length+'</button>':'',
  sbl=sb.length&&openSubs[i.id]?'<ul class="sbl">'+sb.map(function(x,k){return '<li class="'+(x.d?'d':'')+'"><button data-a="sub" data-k="'+k+'" aria-pressed="'+!!x.d+'" aria-label="Marcar subtarefa"></button><span>'+esc(x.t)+'</span></li>'}).join("")+'</ul>':'';
  var di=dueInfo(i),dueH=di?'<span class="due '+di.cls+'" title="Prazo (SLA)">⏰ '+di.txt+'</span>':'',anxH=i.anx?'<button class="anb" data-a="anx" title="Ver anexos">📎 '+i.anx+'</button>':'';
  return '<li class="row'+(lateOf(i)?' atr':'')+(di&&di.late?' atrd':'')+'" data-s="'+i.status+'" data-id="'+i.id+'">'+
  '<div class="tm"><b>'+(i.time||"--:--")+'</b><small>'+(showDate?i.date.split("-").reverse().join("/"):(i.dur?i.dur+" min":""))+'</small></div>'+
  '<button class="chk" data-a="toggle" aria-label="Marcar como concluída">✓</button>'+
  '<div class="bd"><div class="tt">'+(i.pin?'<span class="pin" title="Fixada no topo">★</span>':'')+esc(i.title)+(i.prio==="alta"?'<span class="prt alta" title="Prioridade alta">↑ alta</span>':'')+'</div>'+
  (i.desc?'<p>'+esc(i.desc)+'</p>':'')+sbl+
  '<div class="tags"><span class="tag c-'+i.cat+'">'+i.cat+' · '+(CATS[i.cat]||i.cat)+'</span>'+(i.who?'<span class="who"><em>'+esc(ini(i.who))+'</em>'+esc(i.who)+'</span>':'')+(i.pedido?'<span class="dlgp" title="Pedido de delegação enviado. A atividade continua com você até a pessoa aceitar.">⏳ aguardando '+esc(i.pedido.para)+'</span>':'')+(i.deleg?'<span class="dlgd" title="'+esc("Delegada por "+i.deleg.de+" em "+i.deleg.em.split(" ")[0].split("-").reverse().join("/")+(i.deleg.nota?" — "+i.deleg.nota:""))+'">↪ de '+esc(i.deleg.de)+'</span>':'')+tg+dueH+anxH+sbBtn+(i.status==="done"&&!i.spent?'':tmrBtn(i))+'</div></div>'+
  '<div class="rt"><button class="pill" data-a="cycle" data-s="'+i.status+'" title="Mudar situação">'+ST[i.status]+'</button>'+
  '<details class="menu"><summary aria-label="Mais ações">⋯</summary><div><button data-a="edit">Editar</button><button data-a="pin">'+(i.pin?"Desafixar":"Fixar no topo")+'</button><button data-a="foco">Modo foco</button><button data-a="dup">Duplicar</button>'+(i.pedido?'<button data-a="dgcancel">Cancelar delegação</button>':'<button data-a="deleg">Delegar…</button>')+'<button data-a="del">Excluir</button></div></details></div></li>';
}
var ALL_PASSO=60,ALL_LIM=60,ALL_FIL="";
function diaLabel(d){var p=d.split("-"),dt=new Date(+p[0],+p[1]-1,+p[2]),h=new Date();h.setHours(0,0,0,0);var df=Math.round((dt-h)/864e5);
  var w=dt.toLocaleDateString("pt-BR",{weekday:"long"});w=w.charAt(0).toUpperCase()+w.slice(1);
  return (df===0?"Hoje · ":df===-1?"Ontem · ":df===1?"Amanhã · ":"")+w+", "+p[2]+"/"+p[1]+(p[0]!==String(h.getFullYear())?"/"+p[0]:"")}
function aFilt(i){var f=$("aF").value;return !f||(f==="late"?lateOf(i):f==="due"?!!i.due:i.status!=="done")}
function render(){
  var d=$("day").value,p=d.split("-"),dt=new Date(+p[0],+p[1]-1,+p[2]);
  $("dateLbl").textContent="▦ "+dt.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"}).toUpperCase();
  var h=new Date().getHours();$("hello").textContent=(h<12?"Bom dia":h<18?"Boa tarde":"Boa noite")+(ME?", "+ME.nome.split(" ")[0]+".":".");
  var di=dayItems(),n=di.length,dn=di.filter(function(i){return i.status==="done"}).length,dg=di.filter(function(i){return i.status==="doing"}).length;
  var tot=di.reduce(function(s,i){return s+(+i.dur||0)},0),pct=n?Math.round(dn/n*100):0;
  var mood=!n?"nada programado":pct>=100?"dia fechado":pct>50?"acima da metade":pct===50?"na metade":"vamos começar";
  var nAtr=items.filter(function(i){return lateOf(i)&&i.date!==d}).length,ehHoje=d===iso(new Date());
  function sic(p,bg){return '<span class="ic" style="background:'+bg+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+p+'"/></svg></span>'}
  $("stats").innerHTML=
    '<div class="card stat"><div class="h">'+sic("M4 6h16v14H4zM4 10h16M9 3v4M15 3v4","var(--t-indigo)")+'Programadas</div><strong>'+n+'</strong><small>'+(dg?dg+" em andamento":n?"nenhuma em andamento":"nenhuma para este dia")+'</small></div>'+
    '<div class="card stat"><div class="h">'+sic("M5 12l5 5L20 7","var(--t-green)")+'Concluídas</div><strong>'+dn+'</strong><small>'+(n?"de "+n+" programada"+(n>1?"s":""):"nenhuma ainda")+'</small></div>'+
    '<div class="card stat"><div class="h">'+sic("M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2","var(--t-amber)")+'Tempo planejado</div><strong>'+fm(tot)+'</strong><small>soma das durações do dia</small></div>'+
    '<div class="card stat'+(nAtr?" warn":"")+'"><div class="h">'+sic("M3 17l6-6 4 4 8-8M15 7h6v6","var(--t-rose)")+(ehHoje?"Concluído hoje":"Concluído no dia")+'</div><strong>'+pct+'%</strong><div class="bar"><span style="width:'+pct+'%"></span></div><small>'+(nAtr?'<b class="stw">+ '+nAtr+' atrasada'+(nAtr>1?"s":"")+' de outros dias</b>':mood)+'</small><small class="stm" id="stMeta">'+(META_H||"")+'</small></div>';
  $("sPct").textContent=pct+"%";$("sBar").style.width=pct+"%";$("sTxt").textContent=dn+" de "+n+" entregas concluídas.";
  $("bAtv").textContent=n;$("bHist").textContent=items.filter(function(i){return i.status==="done"}).length;
  $("tabs").innerHTML=[["all","Tudo"],["doing","Em andamento"],["todo","Pendentes"],["done","Concluídas"]].map(function(x){return '<button data-f="'+x[0]+'" aria-pressed="'+(filter===x[0])+'">'+x[1]+'</button>'}).join("");
  tagsRefresh();var fc=$("fc").value,fp=$("fp").value,ft=$("ft").value;
  var vis=di.filter(function(i){return (filter==="all"||i.status===filter)&&(!fc||i.cat===fc)&&(!fp||i.prio===fp)&&(!ft||(i.tags||[]).indexOf(ft)>-1)});
  $("list").innerHTML=vis.length?vis.map(function(i){return row(i)}).join(""):emptyHtml(n?"filtro":"dia");
  var pend=di.filter(function(i){return i.status!=="done"}).sort(function(a,b){return (a.status==="doing"?0:1)-(b.status==="doing"?0:1)}),x=pend[0],atrX=false;
  if(!x){var lt=items.filter(function(i){return lateOf(i)}).sort(function(a,b){return (a.date+(a.time||"")).localeCompare(b.date+(b.time||""))});if(lt.length){x=lt[0];atrX=lt.length}}
  $("next").innerHTML='<div class="eyebrow mono"><span>✦ Próximo passo</span><span>'+(atrX?(atrX>1?"1 de "+atrX+" atrasadas":"atrasada"):pend.length>1?"1 de "+pend.length:"")+'</span></div>'+
    (x?'<h3>'+esc(x.title)+'</h3>'+(atrX?'<p class="nxa">Atrasada desde '+x.date.split("-").reverse().slice(0,2).join("/")+'</p>':'<p>◷ '+(x.time||"--:--")+' · '+(x.dur||0)+' min</p>')+(x.who?'<p>☺ '+esc(x.who)+'</p>':'')+'<button class="btn" id="go">'+(x.status==="doing"?"Concluir agora":"Começar agora")+'</button>':'<h3>Tudo em dia por aqui.</h3><p>Nenhuma atividade pendente nem atrasada.</p>');
  if(x){$("go").onclick=function(){var ns=x.status==="doing"?"done":"doing";undoable(ns==="done"?"Atividade concluída":"Atividade iniciada",[x.id],function(){setStatus(x,ns)})}}
  var keys=Object.keys(CATS).filter(function(k){return di.some(function(i){return i.cat===k})});
  $("sig").innerHTML=keys.length?keys.map(function(k){var c=di.filter(function(i){return i.cat===k}).length;return '<li><span class="ic">'+k[0]+'</span><div><b>'+CATS[k]+'</b><small>'+c+' no dia</small></div></li>'}).join(""):'<li><small>Sem atividades para resumir.</small></li>';
  var q0=$("q").value.trim(),all=items.filter(function(i){return match(i)&&aFilt(i)}).sort(function(a,b){return (b.date+(b.time||"")).localeCompare(a.date+(a.time||""))});
  var ga="",gl="",fil=q0+"|"+$("aF").value;if(fil!==ALL_FIL){ALL_FIL=fil;ALL_LIM=ALL_PASSO}
  all.slice(0,ALL_LIM).forEach(function(i){if(i.date!==gl){gl=i.date;ga+='<li class="grp gday">'+diaLabel(i.date)+'</li>'}ga+=row(i)});
  if(all.length>ALL_LIM)ga+='<li class="maisl"><button class="btn" type="button" id="allMais">Mostrar mais '+Math.min(ALL_PASSO,all.length-ALL_LIM)+'</button><small>Mostrando '+ALL_LIM+' de '+all.length+' atividades</small></li>';
  $("all").innerHTML=all.length?ga:emptyHtml(q0||$("aF").value?"filtro":"todas");
  var nl=items.filter(lateOf).length;$("bLate").textContent=nl;$("bLate").style.background=nl?"var(--danger)":"";$("bLate").style.color=nl?"#fff":"";
  var dn2=items.filter(function(i){return i.status==="done"&&match(i)}).sort(function(a,b){return (b.date+(b.time||"")).localeCompare(a.date+(a.time||""))}),hh="",last="";
  dn2.forEach(function(i){if(i.date!==last){last=i.date;hh+='<div class="grp mono">'+i.date.split("-").reverse().join("/")+'</div><ul>'}hh+=row(i)});
  $("hist").innerHTML=dn2.length?hh:emptyHtml("hist","div");
  (window.SUP&&SUP.hooks||[]).forEach(function(f){try{f()}catch(e){}});
  runBar();if(view==="foco")focoRender();if(view==="busca")bsRender();if(view==="agenda")calRender();if(view==="quadro")kbRender();
}
function focaFiltro(){if(location.hash!=="#atividades")location.hash="#atividades";setTimeout(function(){$("q").focus();$("q").select()},60)}
window.focaFiltro=focaFiltro;
function setView(){
  var v=(location.hash||"#visao").slice(1);if(["visao","atividades","importar","historico","relatorios","usuarios","equipe","graficos","alteracoes","backups","busca","agenda","quadro","sistema","foco","sobre","lixeira","tv","comparar","auditoria","manutencao"].indexOf(v)<0)v="visao";if(v==="manutencao"&&!(ME&&ME.admin))v="visao";if(v==="tv"&&!(ME&&(ME.perms||[]).indexOf("tv")>-1))v="visao";if(!ME)v="visao";if(v==="equipe"&&!(ME&&ME.equipe))v="visao";if((v==="usuarios"||v==="backups"||v==="sistema"||v==="sobre")&&!(ME&&ME.admin))v="visao";var qLimpo=v!=="atividades"&&$("q").value;if(qLimpo)$("q").value="";view=v;document.body.classList.toggle("foco",v==="foco");if(qLimpo)setTimeout(render,0);
  document.querySelectorAll("[data-view]").forEach(function(s){s.hidden=s.getAttribute("data-view")!==v});
  var names={visao:"Visão geral",atividades:"Atividades",importar:"Importar dados",historico:"Histórico",relatorios:"Meus relatórios",usuarios:"Usuários",equipe:"Painel da equipe",graficos:"Gráficos",alteracoes:"Histórico de alterações",backups:"Backups",busca:"Busca geral",agenda:"Calendário",quadro:"Quadro",sistema:"Saúde e acessos",foco:"Modo foco",sobre:"Sobre e atualização",lixeira:"Lixeira",tv:"Painel para TV",comparar:"Mês a mês",auditoria:"Auditoria de tempo",manutencao:"Manutenção"};if(v==="foco")focoRender();if(v==="sobre")sbLoad();if(v==="agenda")calRender();if(v==="quadro")kbRender();if(v==="sistema")saLoad();if(v==="busca")bsRender();if(v==="backups")bkLoad();if(v==="graficos")grLoad();if(v==="alteracoes")hsLoad();if(v==="equipe")painelLoad();if(v==="relatorios")relLoad();if(v==="usuarios")usrLoad();$("crumb").textContent=names[v];
  document.querySelectorAll("#mtab a").forEach(function(a){if(a.getAttribute("href")==="#"+v)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")});
  document.querySelectorAll("#nav a").forEach(function(a){if(a.getAttribute("href")==="#"+v)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")});
}
function findIt(id){for(var k=0;k<items.length;k++)if(items[k].id===id)return items[k];return null}
function clone(o){return JSON.parse(JSON.stringify(o))}
var undoSt=[];
function pushUndo(label,fn){undoSt.push({l:label,f:fn});if(undoSt.length>25)undoSt.shift();toast(label,{acao:"Desfazer",fn:doUndo,ms:7000})}
function doUndo(){var u=undoSt.pop();if(!u){toast("Nada para desfazer.",{ms:2500});return}u.f();toast("Desfeito: "+u.l.toLowerCase(),{ms:3000})}
function undoable(label,ids,fn,created){
  var before=ids.map(function(id){var it=findIt(id);return it?clone(it):null}).filter(Boolean);
  fn();save();render();
  pushUndo(label,function(){
    (created||[]).forEach(function(id){items=items.filter(function(x){return x.id!==id})});
    before.forEach(function(b){var it=findIt(b.id);if(it){b.rev=it.rev;items[items.indexOf(it)]=b}else items.push(b)});
    save();render()});
}
function stopTimer(it){if(it.tstart){it.spent=(+it.spent||0)+Math.max(0,nowS()-it.tstart);it.tstart=0}}
function setStatus(it,st){if(st==="done")stopTimer(it);it.status=st}
function timerToggle(it){
  if(it.tstart){stopTimer(it);toast("Tempo registrado: "+fm(Math.round(it.spent/60)||0)+" em “"+it.title+"”.",{ms:3500})}
  else{items.forEach(function(o){if(o.tstart&&o!==it)stopTimer(o)});it.tstart=nowS();if(it.status==="todo")it.status="doing";if(it.status==="done")it.status="doing"}
  save();render();
}
function flashRow(id){setTimeout(function(){document.querySelectorAll('[data-id="'+id+'"]').forEach(function(e){e.classList.add("just")})},30)}
function onAct(e){
  var b=e.target.closest("button[data-a]");if(!b)return;
  var li=b.closest("[data-id]");if(!li)return;var id=li.getAttribute("data-id"),it=findIt(id);if(!it)return;
  var a=b.getAttribute("data-a");
  if(a==="edit"){openDlg(it);return}
  if(a==="toggle"){var ns=it.status==="done"?"todo":"done";undoable(ns==="done"?"Atividade concluída":"Atividade reaberta",[id],function(){setStatus(it,ns)});flashRow(id);return}
  if(a==="cycle"){var nx=NX[it.status];undoable("Situação: "+ST[nx],[id],function(){setStatus(it,nx)});flashRow(id);return}
  if(a==="del"){undoable("Atividade excluída",[id],function(){items=items.filter(function(x){return x.id!==id})});return}
  if(a==="pin"){it.pin=!it.pin;save();render();return}
  if(a==="deleg"){dgOpen(it);return}
  if(a==="dgcancel"){if(!it.pedido)return;jf("POST","/api/delegacoes/"+it.pedido.pedido+"/cancelar").then(function(x){
    if(!x.ok&&x.s!==409){toast((x.d&&x.d.erro)||"Não foi possível cancelar.",{ms:4000});return}delete it.pedido;render();toast("Pedido de delegação cancelado.",{ms:3000});if(window.pedLoad)window.pedLoad()});return}
  if(a==="dup"){var c=nz(clone(it));c.id=uid();delete c.rev;c.status="todo";c.spent=0;c.tstart=0;c.pin=false;c.subs=c.subs.map(function(x){return{t:x.t,d:false}});undoable("Atividade duplicada",[],function(){items.push(c)},[c.id]);flashRow(c.id);return}
  if(a==="timer"){timerToggle(it);return}
  if(a==="anx"){openDlg(it);return}
  if(a==="foco"){focoId=id;focoSkip=[];if(location.hash==="#foco")focoRender();else location.hash="#foco";return}
  if(a==="subs"){openSubs[id]=!openSubs[id];render();return}
  if(a==="sub"){var k=+b.getAttribute("data-k");if(it.subs[k]){it.subs[k].d=!it.subs[k].d;save();render()}return}
}
["list","all","hist","bsRes","calBox","kbBox"].forEach(function(i){$(i).addEventListener("click",onAct)});
$("tabs").addEventListener("click",function(e){var b=e.target.closest("button[data-f]");if(b){filter=b.getAttribute("data-f");render()}});
["fc","fp","ft"].forEach(function(i){$(i).addEventListener("change",render)});
$("q").addEventListener("input",render);$("all").addEventListener("click",function(e){if(e.target.closest("#allMais")){ALL_LIM+=ALL_PASSO;render()}});
if("IntersectionObserver" in window)new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting&&document.getElementById("allMais")){ALL_LIM+=ALL_PASSO;render()}})},{rootMargin:"300px"}).observe(document.getElementById("allEnd"));$("aF").addEventListener("change",render);$("lkLate").addEventListener("click",function(){$("aF").value="late";render();if(window.innerWidth<860)document.body.classList.add("nomenu")});$("day").addEventListener("change",render);
var dTags=[],dSubs=[],dRealOrig=0;
function dRender(){
  $("tgChips").innerHTML=dTags.map(function(t,k){return '<span class="etq">#'+esc(t)+' <button type="button" data-tgx="'+k+'" aria-label="Remover etiqueta">×</button></span>'}).join("");
  $("sbList").innerHTML=dSubs.map(function(x,k){return '<li class="'+(x.d?'d':'')+'"><input type="checkbox" data-sbk="'+k+'" '+(x.d?'checked':'')+' aria-label="Concluída"><span>'+esc(x.t)+'</span><button type="button" class="x" data-sbx="'+k+'" aria-label="Remover subtarefa">×</button></li>'}).join("");
  var d=dSubs.filter(function(x){return x.d}).length;$("sbProg").textContent=dSubs.length?"("+d+" de "+dSubs.length+")":"";
}
function tgCommit(){var v=$("tgIn").value.replace(/#/g,"").replace(/,/g,"").trim().slice(0,24);$("tgIn").value="";if(v&&dTags.length<8&&dTags.map(function(t){return t.toLowerCase()}).indexOf(v.toLowerCase())<0){dTags.push(v);dRender()}}
function sbCommit(){var v=$("sbIn").value.trim().slice(0,120);$("sbIn").value="";if(v&&dSubs.length<40){dSubs.push({t:v,d:false});dRender()}}
$("tgIn").addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===","){e.preventDefault();tgCommit()}else if(e.key==="Backspace"&&!this.value&&dTags.length){dTags.pop();dRender()}});
$("tgIn").addEventListener("blur",tgCommit);
$("sbIn").addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();sbCommit()}});
$("sbAdd").onclick=function(){sbCommit();$("sbIn").focus()};
$("tgChips").addEventListener("click",function(e){var b=e.target.closest("[data-tgx]");if(b){dTags.splice(+b.getAttribute("data-tgx"),1);dRender()}});
$("sbList").addEventListener("click",function(e){var b=e.target.closest("[data-sbx]");if(b){dSubs.splice(+b.getAttribute("data-sbx"),1);dRender()}});
$("sbList").addEventListener("change",function(e){var c=e.target.closest("[data-sbk]");if(c){dSubs[+c.getAttribute("data-sbk")].d=c.checked;dRender()}});
function openDlg(it,data){
  editing=it?it.id:null;$("dTitle").textContent=it?"Editar atividade":"Nova atividade";
  $("fTitle").value=it?it.title:"";$("fDesc").value=it?it.desc:"";$("fCat").value=it?it.cat:"TRE";$("fWho").value=it?it.who:"";
  $("fDate").value=it?it.date:(data||$("day").value);$("fTime").value=it?it.time:"";$("fDur").value=it?it.dur:30;$("fPrio").value=it?it.prio:"media";$("fSt").value=it?it.status:"todo";
  dTags=it?(it.tags||[]).slice():[];dSubs=it?clone(it.subs||[]):[];dRealOrig=it?Math.round((it.spent||0)/60):0;
  $("fReal").value=dRealOrig;$("fPin").checked=!!(it&&it.pin);$("tgIn").value="";$("sbIn").value="";dRender();
  var dd=it&&it.due||"";$("fDueD").value=dd.slice(0,10);$("fDueT").value=dd.length>10?dd.slice(11):"";
  anPend=[];anCur=[];anRender();if(it)anLoad(it.id);
  $("dDeleg").hidden=!it;
  $("dlg").showModal();
}
$("new").onclick=function(){openDlg(null)};$("dCancel").onclick=function(){$("dlg").close()};
$("form").addEventListener("submit",function(e){
  e.preventDefault();tgCommit();sbCommit();
  var r={date:$("fDate").value,time:$("fTime").value,dur:+$("fDur").value||0,title:$("fTitle").value.trim(),desc:$("fDesc").value.trim(),cat:$("fCat").value,who:$("fWho").value.trim(),prio:$("fPrio").value,status:$("fSt").value,tags:dTags.slice(),subs:clone(dSubs),pin:$("fPin").checked,due:$("fDueD").value?($("fDueD").value+($("fDueT").value?"T"+$("fDueT").value:"")):""};
  if(!r.title)return;
  var real=Math.max(0,+$("fReal").value||0);
  if(editing){var old=findIt(editing),eid=editing;if(!old)return;r.spent=real!==dRealOrig?real*60:old.spent;
    undoable("Atividade alterada",[eid],function(){items=items.map(function(i){if(i.id!==eid)return i;var n=Object.assign({},i,r);if(n.status==="done")stopTimer(n);return n})})}
  else{r.id=uid();r.spent=real*60;r.tstart=0;nz(r);undoable("Atividade criada",[],function(){items.push(r)},[r.id])}
  var novoId=editing?null:r.id,pend=anPend.slice();anPend=[];
  $("dlg").close();if(r.date!==$("day").value)$("day").value=r.date;render();
  if(pend.length&&novoId)anSendAll(novoId,pend);
});
// ---- delegar: passa a atividade para outra pessoa (o servidor move a linha, as subtarefas e os anexos)
var dgId=null,dgPessoas=null;
function dgOpen(it){if(it.pedido){toast("Já existe um pedido aguardando "+it.pedido.para+". Para mudar, cancele-o no menu ⋯ da atividade.",{ms:6000});return}dgId=it.id;$("dgSub").textContent="“"+it.title+"”";$("dgErr").textContent="";$("dgNota").value="";
  var sel=$("dgPara");sel.innerHTML='<option value="">Carregando…</option>';$("dgDlg").showModal();
  (dgPessoas?Promise.resolve(dgPessoas):jf("GET","/api/delegar/pessoas").then(function(x){if(x.ok&&Array.isArray(x.d))dgPessoas=x.d;return dgPessoas||[]})).then(function(l){
    sel.innerHTML=l.length?'<option value="">Escolha a pessoa</option>'+l.map(function(p){return '<option value="'+p.id+'">'+esc(p.nome)+(p.cargo?" — "+esc(p.cargo):"")+'</option>'}).join(""):'<option value="">Não há outras pessoas cadastradas</option>';sel.focus()})}
$("dDeleg").onclick=function(){var it=editing&&findIt(editing);if(!it)return;$("dlg").close();dgOpen(it)};
$("dgCancel").onclick=function(){$("dgDlg").close()};
$("dgForm").addEventListener("submit",function(e){e.preventDefault();var para=$("dgPara").value,id=dgId,it=findIt(id);if(!para||!it)return;
  $("dgOk").disabled=true;$("dgErr").textContent="";
  whenSaved(function(){return jf("POST","/api/delegar",{id:id,para:+para,nota:$("dgNota").value.trim()}).then(function(x){$("dgOk").disabled=false;
    if(!x.ok){$("dgErr").textContent=(x.d&&x.d.erro)||"Não foi possível delegar.";return}
    var a2=findIt(id);if(a2)a2.pedido={pedido:x.d.pedido,para:x.d.para};$("dgDlg").close();render();
    toast("Pedido enviado para "+x.d.para+". A atividade continua com você até a pessoa aceitar.",{ms:6000});if(window.pedLoad)window.pedLoad()})})});
// quem recebe: avisa uma vez por atividade delegada
function dgAvisa(){return;var vis={};try{vis=JSON.parse(localStorage.getItem("dgVis"+ME.id)||"{}")}catch(e){}
  var nov=items.filter(function(i){return i.deleg&&!vis[i.id+"|"+i.deleg.em]});if(!nov.length)return;
  nov.forEach(function(i){vis[i.id+"|"+i.deleg.em]=1});try{localStorage.setItem("dgVis"+ME.id,JSON.stringify(vis))}catch(e){}
  var i=nov[0];toast(nov.length>1?nov.length+" atividades foram delegadas para você.":i.deleg.de+" delegou “"+i.title+"” para você."+(i.deleg.nota?" Recado: "+i.deleg.nota:""),{ms:9000})}
// ---- anexos
var anPend=[],anCur=[];
function kb(n){return n<1024?n+" B":n<1048576?Math.round(n/1024)+" KB":(n/1048576).toFixed(1).replace(".",",")+" MB"}
function anRender(){
  var h=anCur.map(function(a){var ext=(a.nome.split(".").pop()||"").slice(0,4);return '<li>'+(a.img?'<img src="/api/anexos/'+a.id+'" alt="" data-lb="'+a.id+'">':'<span class="ico">'+esc(ext)+'</span>')+'<a href="/api/anexos/'+a.id+(a.img?'':'?baixar=1')+'" target="_blank" rel="noopener" title="'+esc(a.nome)+'">'+esc(a.nome)+'</a><small>'+kb(a.tam)+'</small><button type="button" class="btn sm" data-anx="'+a.id+'" aria-label="Remover anexo">×</button></li>'}).join("")+
    anPend.map(function(f,k){return '<li><span class="ico">novo</span><a style="color:var(--ink);pointer-events:none">'+esc(f.name)+'</a><small>'+kb(f.size)+' · será enviado ao salvar</small><button type="button" class="btn sm" data-anp="'+k+'" aria-label="Remover">×</button></li>'}).join("");
  $("anList").innerHTML=h;var n=anCur.length+anPend.length;$("anNote").textContent=n?"("+n+")":""}
function anLoad(id){jf("GET","/api/atividades/"+encodeURIComponent(id)+"/anexos").then(function(x){if(editing===id&&Array.isArray(x.d)){anCur=x.d;anRender()}})}
function anUp(id,f){return fetch("/api/atividades/"+encodeURIComponent(id)+"/anexos",{method:"POST",credentials:"same-origin",headers:{"X-Requested-With":"fetch","X-Nome":encodeURIComponent(f.name||"arquivo"),"Content-Type":"application/octet-stream"},body:f}).then(function(r){return r.json().catch(function(){return{}}).then(function(d){return{ok:r.ok,d:d}})})}
function anSendAll(id,files){whenSaved(function(){var p=Promise.resolve(),fails=[];
  files.forEach(function(f){p=p.then(function(){return anUp(id,f)}).then(function(x){if(x.ok){var it=findIt(id);if(it){it.anx=x.d.anexos.length;render()}}else fails.push(f.name+": "+(x.d.erro||"erro"))})});
  return p.then(function(){if(fails.length)toast("Anexo não enviado — "+fails[0],{ms:7000});else toast(files.length+" anexo"+(files.length>1?"s":"")+" enviado"+(files.length>1?"s":"")+".",{ms:2500})})})}
function anAdd(list){if($("anAdd").closest(".fremov"))return;  // campo Anexos tirado do formulario

  Array.prototype.forEach.call(list,function(f){
    if(f.size>10*1024*1024){toast("“"+f.name+"” passa de 10 MB.",{ms:5000});return}
    if(editing){var id=editing;whenSaved(function(){return anUp(id,f).then(function(x){
      if(!x.ok){toast(x.d.erro||"Não foi possível anexar.",{ms:6000});return}
      if(editing===id){anCur=x.d.anexos;anRender()}var it=findIt(id);if(it){it.anx=x.d.anexos.length;render()}})})}
    else{if(anPend.length+anCur.length>=20){toast("Limite de 20 anexos.",{ms:4000});return}anPend.push(f);anRender()}})}
$("anAdd").onclick=function(){$("anFile").click()};
$("anFile").addEventListener("change",function(){anAdd(this.files);this.value=""});
$("anList").addEventListener("click",function(e){
  var r=e.target.closest("[data-anx]"),q=e.target.closest("[data-anp]"),l=e.target.closest("[data-lb]");
  if(q){anPend.splice(+q.getAttribute("data-anp"),1);anRender()}
  else if(r){var id=editing;jf("DELETE","/api/anexos/"+r.getAttribute("data-anx")).then(function(x){if(x.ok){anCur=x.d.anexos;anRender();var it=findIt(id);if(it){it.anx=anCur.length;render()}}})}
  else if(l){var im=$("lbx").querySelector("img");im.src="/api/anexos/"+l.getAttribute("data-lb");$("lbx").showModal()}});
$("lbx").onclick=function(){this.close()};
$("dlg").addEventListener("paste",function(e){var fs=[];Array.prototype.forEach.call((e.clipboardData&&e.clipboardData.files)||[],function(f){fs.push(f)});
  if(fs.length){e.preventDefault();fs=fs.map(function(f){if(f.name&&!/^image\.(png|jpe?g)$/i.test(f.name))return f;var t=new Date(),n="print-"+iso(t)+"-"+("0"+t.getHours()).slice(-2)+("0"+t.getMinutes()).slice(-2)+("0"+t.getSeconds()).slice(-2)+".png";return new File([f],n,{type:f.type||"image/png"})});anAdd(fs)}});
["dragover","dragenter"].forEach(function(ev){$("dlg").addEventListener(ev,function(e){if($("anAdd").closest(".fremov"))return;if(e.dataTransfer&&Array.prototype.indexOf.call(e.dataTransfer.types||[],"Files")>-1){e.preventDefault();$("dlg").classList.add("dropz")}})});
["dragleave","drop"].forEach(function(ev){$("dlg").addEventListener(ev,function(){$("dlg").classList.remove("dropz")})});
$("dlg").addEventListener("drop",function(e){if(e.dataTransfer&&e.dataTransfer.files.length){e.preventDefault();anAdd(e.dataTransfer.files)}});
$("fDueX").onclick=function(){$("fDueD").value="";$("fDueT").value=""};

// importar
function parseDate(s){s=(s||"").trim();var m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(m)return s;m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?m[3]+"-"+("0"+m[2]).slice(-2)+"-"+("0"+m[1]).slice(-2):null}
function catOf(s){s=(s||"").toLowerCase();for(var k in CATS){if(s===k.toLowerCase()||CATS[k].toLowerCase().indexOf(s.slice(0,4))===0&&s.length>=3)return k}return "DEV"}
function stOf(s){s=(s||"").toLowerCase();return s.indexOf("conc")===0||s==="done"?"done":s.indexOf("and")===0||s==="doing"?"doing":"todo"}
function doImport(txt){
  var lines=txt.replace(/^\ufeff/,"").split(/\r?\n/).filter(function(l){return l.trim()}),ok=0,bad=0;
  lines.forEach(function(l){
    var del=l.indexOf(";")>-1?";":",",c=l.split(del).map(function(x){return x.trim().replace(/^"|"$/g,"")}),d=parseDate(c[0]);
    if(!d){bad++;return}
    var pr=(c[6]||"media").toLowerCase().replace("é","e");
    items.push({id:uid(),date:d,time:c[1]||"",dur:+c[2]||0,title:c[3]||"Sem título",desc:"",cat:catOf(c[4]),who:c[5]||"",prio:["alta","media","baixa"].indexOf(pr)>-1?pr:"media",status:stOf(c[7])});ok++;
  });
  save();render();$("impMsg").textContent=ok+" atividade(s) importada(s)"+(bad?"; "+bad+" linha(s) ignorada(s) (data inválida ou cabeçalho).":".");
}
$("doImp").onclick=function(){doImport($("csvIn").value);$("csvIn").value=""};
$("file").addEventListener("change",function(){var f=this.files[0];if(!f)return;var r=new FileReader();r.onload=function(){doImport(String(r.result))};r.readAsText(f)});
function dl(name,text){try{var a=document.createElement("a");a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(text);a.download=name;document.body.appendChild(a);a.click();a.remove()}catch(e){}}
function csvOf(list){return "\ufeff"+list.map(function(i){return [i.date,i.time,i.dur,i.title,CATS[i.cat],i.who,i.prio,ST[i.status]].map(function(v){return '"'+String(v==null?"":v).replace(/"/g,'""')+'"'}).join(";")}).join("\r\n")}
$("tpl").onclick=function(){dl("modelo-importacao.csv",csvOf([{date:"2026-11-09",time:"14:00",dur:45,title:"Treinamento com DR tal",cat:"TRE",who:"DR tal",prio:"alta",status:"todo"}]))};
function exp(e){if(e)e.preventDefault();dl("atividades.csv",csvOf(items.slice().sort(function(a,b){return (a.date+(a.time||"")).localeCompare(b.date+(b.time||""))})))}
$("exp").onclick=exp;$("exp2").onclick=exp;
// relatorios
function br(s){return s.split("-").reverse().join("/")}
function range(){var p=$("rPer").value,t=new Date(),a=new Date(t),b=new Date(t);
  if(p==="custom")return;
  if(p==="semana"){a.setDate(t.getDate()-((t.getDay()+6)%7));b=new Date(a);b.setDate(a.getDate()+6)}
  else if(p==="mes"){a=new Date(t.getFullYear(),t.getMonth(),1);b=new Date(t.getFullYear(),t.getMonth()+1,0)}
  $("rDe").value=iso(a);$("rAte").value=iso(b)}
function rq(){return "de="+$("rDe").value+"&ate="+$("rAte").value+"&usuario="+encodeURIComponent($("rUsr").value)+"&situacao="+$("rSt").value}
var eqOk=false;
function eqLoad(){if(eqOk)return;eqOk=true;jf("GET","/api/equipe").then(function(x){if(!Array.isArray(x.d))return;var s=$("rUsr");
  x.d.forEach(function(u){if(ME&&u.id===ME.id)return;if(s.querySelector('option[value="'+u.id+'"]'))return;var o=document.createElement("option");o.value=u.id;o.textContent=u.nome;s.appendChild(o)})})}
// esqueleto (linhas cinzas animadas) enquanto os dados chegam
function skel(n){var h='<div class="skw" aria-busy="true" aria-label="Carregando">';for(var i=0;i<n;i++)h+='<div class="sk skl" style="width:'+(60+((i*37)%40))+'%"></div>';return h+'</div>'}
function relLoad(){eqLoad();range();$("rOut").innerHTML=skel(6);whenSaved(function(){return fetch("/api/relatorios/dados?"+rq(),{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(d){
  if(!d.itens){return}
  $("rSub").textContent=d.nome+" · "+br(d.de)+" a "+br(d.ate);
  var r=d.resumo;$("rSum").innerHTML='<span class="bdg">Total '+r.total+'</span><span class="bdg pen">Pendentes '+r.pendentes+'</span><span class="bdg adm">Em andamento '+r.andamento+'</span><span class="bdg ok">Concluídas '+r.concluidas+'</span><span class="bdg">Tempo concluído '+fm(r.min_concluido)+'</span>';
  $("rOut").innerHTML=d.itens.length?'<table class="tbl"><thead><tr><th>Data</th><th>Hora</th><th>Dur.</th><th>Responsável</th><th>Atividade</th><th>Tipo</th><th>Com quem</th><th>Prioridade</th><th>Situação</th></tr></thead><tbody>'+d.itens.map(function(i){return '<tr><td>'+br(i.data)+'</td><td>'+(i.hora||"--:--")+'</td><td>'+fm(i.dur)+'</td><td>'+esc(i.resp)+'</td><td>'+esc(i.titulo)+'</td><td>'+esc(i.tipo)+'</td><td>'+esc(i.quem)+'</td><td>'+i.prio+'</td><td>'+i.situacao+'</td></tr>'}).join("")+'</tbody></table>':'<div class="empty" style="border:0;text-align:center;padding:24px">Nenhuma atividade neste período'+(r.concluidas_fora?". Há "+r.concluidas_fora+" concluída(s) em outros períodos; ajuste o período.":".")+'</div>'})})}
$("rPer").addEventListener("change",relLoad);$("rUsr").addEventListener("change",relLoad);$("rSt").addEventListener("change",relLoad);
["rDe","rAte"].forEach(function(id){$(id).addEventListener("change",function(){$("rPer").value="custom";relLoad()})});
$("rXls").onclick=function(){whenSaved(function(){location.href="/api/relatorios/excel?"+rq()})};
$("rPdf").onclick=function(){whenSaved(function(){location.href="/api/relatorios/pdf?"+rq()})};
// usuarios
var UL=[],umode="new",uedit=null,uDirty=false,UG=["nome","usr","cargo","perfil","perms","senha"];
// permissoes finas (3.5): vazio = padrao do perfil
function upPadrao(pf){return ((ME&&ME.perms_perfil)||{})[pf]||[]}
function upDraw(lista,travado){var nm=(ME&&ME.perms_nomes)||{};
  $("upL").innerHTML=Object.keys(nm).map(function(k){return '<label class="ckl"><input type="checkbox" data-perm="'+k+'"'+(lista.indexOf(k)>-1?" checked":"")+(travado?" disabled":"")+'> '+esc(nm[k])+'</label>'}).join("")}
function upFill(u){var adm=$("uR").value==="admin",pad=adm||!!u.perms_padrao;$("upPad").checked=pad;$("upPad").disabled=adm;
  upDraw(adm?Object.keys((ME&&ME.perms_nomes)||{}):(pad?upPadrao($("uR").value):(u.perms||[])),pad)}
function upVal(){if($("uR").value==="admin"||$("upPad").checked)return "padrao";
  return Array.prototype.map.call(document.querySelectorAll("#upL input:checked"),function(c){return c.getAttribute("data-perm")})}
$("upPad").addEventListener("change",function(){upDraw(upPadrao($("uR").value),this.checked)});
$("uR").addEventListener("change",function(){if(umode==="edit")upFill({perms_padrao:$("upPad").checked,perms:upVal()==="padrao"?upPadrao(this.value):upVal()})});
function iniciais(n){var p=String(n).trim().split(/\s+/);return((p[0]||"?").charAt(0)+(p.length>1?p[p.length-1].charAt(0):"")).toUpperCase()}
function slug(n){var p=n.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9\s]/g,"").trim().split(/\s+/).filter(Boolean);return p.length>1?p[0]+"."+p[p.length-1]:(p[0]||"")}
function gen(){var c="abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789",a=new Uint32Array(10),o="";crypto.getRandomValues(a);for(var i=0;i<10;i++)o+=c.charAt(a[i]%c.length);return o}
function copia(t){if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(t);var a=document.createElement("textarea");a.value=t;a.style.cssText="position:fixed;opacity:0";document.body.appendChild(a);a.select();try{document.execCommand("copy")}catch(e){}document.body.removeChild(a);return Promise.resolve()}
function note(h){var n=$("uNote");n.innerHTML='<span>'+h+'</span><button class="btn sm" type="button" data-n="x" style="margin-left:auto">Fechar</button>';n.hidden=false}
function usrRender(){var q=$("uQ").value.trim().toLowerCase();
  var l=UL.filter(function(u){return !q||(u.nome+" "+u.usuario+" "+u.cargo).toLowerCase().indexOf(q)>-1});
  $("uCount").textContent=l.length+" de "+UL.length+(UL.length===1?" usuário":" usuários");
  $("uList").innerHTML=l.length?l.map(function(u){var eu=ME&&u.id===ME.id;
    return '<div class="ur"><div class="av">'+esc(iniciais(u.nome))+'</div><div class="un"><b>'+esc(u.nome)+(eu?' <span class="bdg">você</span>':'')+'</b><small>@'+esc(u.usuario)+'</small></div><div class="uc">'+(esc(u.cargo)||'—')+'</div><div class="up"><span class="bdg'+(u.perfil&&u.perfil!=="usuario"?' adm':'')+'">'+({admin:"Administrador",supervisor:"Supervisor"}[u.perfil]||"Usuário")+'</span>'+(u.trocar?' <span class="bdg pen" title="Ainda não trocou a senha provisória">Senha provisória</span>':'')+(u.totp?' <span class="bdg" title="Verificação em duas etapas ativa" style="background:var(--t-green);color:var(--done)">2FA</span>':'')+(u.bloqueada?' <span class="bdg pen" title="Bloqueada por tentativas erradas">Bloqueada</span>':'')+(u.ativo===false?' <span class="bdg off" title="Não consegue entrar no sistema">Desativado</span>':'')+'</div><div class="ua"><button class="btn sm" data-ua="edit" data-id="'+u.id+'">Editar</button><button class="btn sm" data-ua="senha" data-id="'+u.id+'">Senha</button>'+(u.bloqueada?'<button class="btn sm" data-ua="unl" data-id="'+u.id+'">Desbloquear</button>':'')+(u.totp?'<button class="btn sm" data-ua="r2fa" data-id="'+u.id+'">Resetar 2FA</button>':'')+(eu?'':(u.ativo===false?'<button class="btn sm" data-ua="atv" data-id="'+u.id+'">Reativar</button>':'<button class="btn sm" data-ua="des" data-id="'+u.id+'">Desativar</button>')+'<button class="btn sm danger" data-ua="del" data-id="'+u.id+'">Excluir</button>')+'</div></div>'}).join(""):'<div class="empty" style="padding:28px;text-align:center;border:0">Nenhum usuário encontrado.</div>'}
function usrLoad(){if(!UL.length)$("uList").innerHTML=skel(4);jf("GET","/api/usuarios").then(function(x){UL=Array.isArray(x.d)?x.d:[];usrRender()})}
function uShow(gs){UG.forEach(function(g){document.querySelector('#uForm [data-g="'+g+'"]').hidden=gs.indexOf(g)<0})}
function uPw(vis){$("uP").type=vis?"text":"password";$("uShow").textContent=vis?"Ocultar":"Mostrar"}
function uOpen(mode,u){umode=mode;uedit=u?u.id:null;uDirty=false;$("uForm").reset();$("uErr").textContent="";
  $("uN").required=$("uU").required=mode!=="senha";$("uP").required=mode!=="edit";$("uU").disabled=mode==="edit";$("uR").disabled=false;
  if(mode==="new"){$("uT").textContent="Novo usuário";$("uSub2").textContent="Preencha os dados de acesso e repasse a senha provisória ao usuário.";uShow(UG.filter(function(g){return g!=="perms"}));$("uP").value=gen();uPw(true);$("uSave").textContent="Criar usuário"}
  else if(mode==="edit"){$("uT").textContent="Editar usuário";$("uSub2").textContent="O login não pode ser alterado.";uShow(["nome","usr","cargo","perfil","perms"]);$("uN").value=u.nome;$("uU").value=u.usuario;$("uC").value=u.cargo;$("uR").value=u.perfil||(u.admin?"admin":"usuario");upFill(u);$("uR").disabled=!!(ME&&u.id===ME.id);$("uSave").textContent="Salvar alterações"}
  else{$("uT").textContent="Redefinir senha";$("uSub2").textContent="Nova senha provisória para "+u.nome+". Ele(a) precisará trocá-la no próximo acesso.";uShow(["senha"]);$("uP").value=gen();uPw(true);$("uSave").textContent="Redefinir senha"}
  $("udlg").showModal();(mode==="senha"?$("uP"):$("uN")).focus()}
$("uNew").onclick=function(){uOpen("new")};
$("uCancel").onclick=function(){$("udlg").close()};
$("uShow").onclick=function(){uPw($("uP").type==="password")};
$("uGen").onclick=function(){$("uP").value=gen();uPw(true)};
$("uU").addEventListener("input",function(){uDirty=true});
$("uN").addEventListener("input",function(){if(umode==="new"&&!uDirty)$("uU").value=slug($("uN").value)});
$("uQ").addEventListener("input",usrRender);
$("uList").addEventListener("click",function(e){var b=e.target.closest("button[data-ua]");if(!b)return;var id=+b.getAttribute("data-id"),u=UL.filter(function(x){return x.id===id})[0];if(!u)return;
  var k=b.getAttribute("data-ua");
  if(k==="edit")uOpen("edit",u);else if(k==="senha")uOpen("senha",u);
  else if(k==="des"){if(confirm("Desativar "+u.nome+"?\n\nA pessoa não conseguirá mais entrar e será desconectada agora. As atividades e o histórico continuam guardados e você pode reativar depois."))jf("POST","/api/usuarios/"+id+"/ativo",{ativo:false}).then(function(x){if(!x.ok)alert(x.d.erro||"Erro ao desativar.");else note("Usuário <b>"+esc(u.usuario)+"</b> desativado.");usrLoad()})}
  else if(k==="atv"){jf("POST","/api/usuarios/"+id+"/ativo",{ativo:true}).then(function(x){if(!x.ok)alert(x.d.erro||"Erro ao reativar.");else note("Usuário <b>"+esc(u.usuario)+"</b> reativado.");usrLoad()})}
  else if(k==="unl"){jf("POST","/api/usuarios/"+id+"/desbloquear").then(function(){note("Conta de <b>"+esc(u.usuario)+"</b> desbloqueada.");usrLoad()})}
  else if(k==="r2fa"){if(confirm("Desativar a verificação em duas etapas de "+u.nome+"? Ele(a) poderá configurar de novo depois."))jf("POST","/api/usuarios/"+id+"/2fa/reset").then(function(){note("Verificação em duas etapas de <b>"+esc(u.usuario)+"</b> desativada.");usrLoad()})}
  else if(confirm("Excluir "+u.nome+"? As atividades dele(a) também serão apagadas. Esta ação não pode ser desfeita.")){jf("DELETE","/api/usuarios/"+id).then(function(x){if(!x.ok)alert(x.d.erro||"Erro ao excluir.");else note("Usuário <b>"+esc(u.usuario)+"</b> excluído.");usrLoad()})}});
$("uNote").addEventListener("click",function(e){var b=e.target.closest("button[data-n]");if(!b)return;
  if(b.getAttribute("data-n")==="x")$("uNote").hidden=true;else copia(b.getAttribute("data-v")).then(function(){b.textContent="Copiado!"})});
$("uForm").addEventListener("submit",function(e){e.preventDefault();var p,m=umode,sen=$("uP").value,lg=$("uU").value;
  if(m==="new")p=jf("POST","/api/usuarios",{usuario:lg,nome:$("uN").value,cargo:$("uC").value,senha:sen,perfil:$("uR").value});
  else if(m==="edit")p=jf("PUT","/api/usuarios/"+uedit,{nome:$("uN").value,cargo:$("uC").value,perfil:$("uR").value,perms:upVal()});
  else p=jf("POST","/api/usuarios/"+uedit+"/senha",{nova:sen});
  $("uSave").disabled=true;
  p.then(function(x){$("uSave").disabled=false;if(!x.ok){$("uErr").textContent=x.d.erro||"Não foi possível salvar.";return}
    $("udlg").close();usrLoad();
    var cp='<button class="btn sm" type="button" data-n="cp" data-v="'+esc(sen)+'">Copiar senha</button>';
    if(m==="new")note("Usuário <b>"+esc(lg)+"</b> criado. Senha provisória: <code>"+esc(sen)+"</code> "+cp);
    else if(m==="senha")note("Senha redefinida. Nova senha provisória: <code>"+esc(sen)+"</code> "+cp);
    else note("Usuário atualizado.")})});
// metas (barra lateral)
var MY={diaria:0,semanal:0},META_H="";
function metaFetch(){jf("GET","/api/metas").then(function(x){if(x.ok&&x.d.minha){MY=x.d.minha;metaUpdate()}})}
function metaUpdate(){var t=iso(new Date()),n=new Date(),a=new Date(n);a.setDate(n.getDate()-((n.getDay()+6)%7));var b=new Date(a);b.setDate(a.getDate()+6);var sa=iso(a),sb=iso(b);
  var fd=items.filter(function(i){return i.status==="done"&&i.date===t}).length,fs=items.filter(function(i){return i.status==="done"&&i.date>=sa&&i.date<=sb}).length,h=[];
  if(MY.diaria)h.push("Meta do dia: <b>"+fd+"/"+MY.diaria+"</b>"+(fd>=MY.diaria?" ✓":""));if(MY.semanal)h.push("Meta da semana: <b>"+fs+"/"+MY.semanal+"</b>"+(fs>=MY.semanal?" ✓":""));
  $("sMeta").innerHTML=h.join("<br>");META_H=h.join(" · ");var sm=document.getElementById("stMeta");if(sm)sm.innerHTML=META_H}
function metaBar(l,f,m){if(!m)return"";var p=Math.min(100,Math.round(f/m*100));return '<div class="mt"><span>'+l+' <b>'+f+'/'+m+'</b>'+(f>=m?' ✓':'')+'</span><div class="pb"><i style="width:'+p+'%;background:'+(f>=m?"var(--done)":"var(--doing)")+'"></i></div></div>'}
$("pMetas").onclick=function(){$("mErr").textContent="";jf("GET","/api/metas").then(function(x){if(!x.ok)return;
  $("mPD").value=x.d.padrao.diaria;$("mPS").value=x.d.padrao.semanal;
  $("mUsers").innerHTML=(x.d.usuarios||[]).map(function(u){return '<div class="mr"><span>'+esc(u.nome)+'</span><input type="number" min="0" max="999" data-u="'+u.id+'" data-k="diaria" placeholder="padrão" value="'+(u.diaria==null?"":u.diaria)+'"><input type="number" min="0" max="999" data-u="'+u.id+'" data-k="semanal" placeholder="padrão" value="'+(u.semanal==null?"":u.semanal)+'"></div>'}).join("");
  $("mdlg").showModal()})};
$("mCancel").onclick=function(){$("mdlg").close()};
$("mForm").addEventListener("submit",function(e){e.preventDefault();var us={};
  document.querySelectorAll("#mUsers input").forEach(function(i){var u=i.getAttribute("data-u");us[u]=us[u]||{};us[u][i.getAttribute("data-k")]=i.value===""?null:+i.value});
  jf("PUT","/api/metas",{padrao:{diaria:+$("mPD").value||0,semanal:+$("mPS").value||0},usuarios:us}).then(function(x){if(!x.ok){$("mErr").textContent=x.d.erro||"Não foi possível salvar.";return}$("mdlg").close();painelLoad();metaFetch()})});
// graficos: ficam em static/js/graficos.js (carregado depois deste arquivo)
function grLoad(){if(window.Graficos)window.Graficos.load();else window.__grPend=true}
// historico de alteracoes
var HS=[],hLast=0,hOk=false,hT=null;
function hsInit(){if(hOk)return;hOk=true;var t=new Date(),a=new Date(t);a.setDate(t.getDate()-6);$("hDe").value=iso(a);$("hAte").value=iso(t);
  if(ME&&ME.equipe)jf("GET","/api/equipe").then(function(x){if(Array.isArray(x.d))x.d.forEach(function(u){var o=document.createElement("option");o.value=u.id;o.textContent=u.nome;$("hUs").appendChild(o)})})}
function hsRender(){var cls={criou:"ok",alterou:"adm",excluiu:"del",delegou:"adm"},ent={usuario:"Usuário · ",meta:"Meta · "};
  $("hOut").innerHTML=HS.length?'<table class="tbl"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Item</th><th>Detalhes</th></tr></thead><tbody>'+HS.map(function(i){return '<tr><td style="white-space:nowrap">'+br(i.quando.slice(0,10))+" "+i.quando.slice(11,16)+'</td><td>'+esc(i.quem)+'</td><td><span class="bdg '+(cls[i.acao]||"")+'">'+esc(i.acao)+'</span></td><td>'+(ent[i.entidade]||"")+esc(i.titulo)+'</td><td>'+esc(i.detalhe)+'</td></tr>'}).join("")+'</tbody></table>':'<div class="empty" style="border:0;text-align:center;padding:24px">Nenhuma alteração neste período.</div>'}
function hsLoad(more){hsInit();var q="de="+$("hDe").value+"&ate="+$("hAte").value+"&acao="+$("hAc").value+"&usuario="+$("hUs").value+"&q="+encodeURIComponent($("hQ").value);if(more===true)q+="&antes="+hLast;else $("hOut").innerHTML=skel(6);
  whenSaved(function(){return jf("GET","/api/historico?"+q).then(function(x){if(!x.ok)return;var l=x.d.itens;if(more!==true)HS=[];HS=HS.concat(l);if(l.length)hLast=l[l.length-1].id;$("hMais").hidden=!x.d.mais;hsRender()})})}
["hDe","hAte","hAc","hUs"].forEach(function(id){$(id).addEventListener("change",function(){hsLoad()})});
$("hQ").addEventListener("input",function(){clearTimeout(hT);hT=setTimeout(hsLoad,300)});
$("hMais").onclick=function(){hsLoad(true)};
// notificacoes
// notificacoes lidas: some do sino ao clicar; volta se a atividade mudar de data ou de situacao
function nlKey(i){return i.id+"|"+i.date+"|"+i.status}
function nlGet(){try{return JSON.parse(localStorage.getItem("nLidas"+(ME&&ME.id))||"{}")||{}}catch(e){return {}}}
function nlSet(m){try{localStorage.setItem("nLidas"+(ME&&ME.id),JSON.stringify(m))}catch(e){}}
function nlMarca(l){var m=nlGet(),vivos={};items.forEach(function(i){vivos[nlKey(i)]=1});Object.keys(m).forEach(function(k){if(!vivos[k])delete m[k]});l.forEach(function(i){m[nlKey(i)]=1});nlSet(m)}
function notifs(){var t=iso(new Date()),lidas=nlGet(),nl=function(i){return !lidas[nlKey(i)]};
  return{late:items.filter(function(i){return i.status!=="done"&&i.date<t&&nl(i)}).sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:0}),
    doing:items.filter(function(i){return i.status==="doing"&&i.date>=t&&nl(i)}),
    pend:items.filter(function(i){return i.status==="todo"&&i.date===t&&nl(i)}),
    done:items.filter(function(i){return i.status==="done"&&i.date===t}).length}}
function notifUpdate(){metaUpdate();var n=notifs(),c=n.late.length+n.pend.length,b=$("nBadge");b.textContent=c>99?"99+":c;b.hidden=!c;
  if(!$("np").hidden)notifRender(n)}
function notifRender(n){n=n||notifs();var sec=function(tit,cor,l,dt){return l.length?'<div class="nh"><i style="background:'+cor+'"></i>'+tit+' ('+l.length+')</div>'+l.slice(0,8).map(function(i){return '<button class="ni" data-d="'+i.date+'" data-id="'+esc(i.id)+'" title="Abrir a atividade (a notificação some)"><span>'+esc(i.title)+'</span><small>'+br(i.date)+(i.time?" · "+i.time:"")+'</small></button>'}).join("")+(l.length>8?'<div class="nft" style="border:0;padding:4px 14px">+ '+(l.length-8)+' outras</div>':''):""};
  var h=sec("Atrasadas","var(--danger)",n.late)+sec("Em andamento","var(--doing)",n.doing)+sec("Pendentes de hoje","var(--todo)",n.pend);
  $("nList").innerHTML=h?h+'<div class="nft"><button type="button" class="btn sm" id="nAll">Marcar todas como lidas</button></div>':'<div class="nok"><b>Tudo em dia!</b><br>Nenhuma notificação nova.</div>';
  $("nCnt").textContent=n.late.length+n.pend.length+n.doing.length?"":"";
  $("nCnt").textContent=n.done+(n.done===1?" concluída hoje":" concluídas hoje")}
function notifClose(){$("np").hidden=true;$("bell").setAttribute("aria-expanded","false")}
$("bell").onclick=function(e){e.stopPropagation();var abrir=$("np").hidden;closeMenus();if(abrir){notifRender();$("np").hidden=false;$("bell").setAttribute("aria-expanded","true")}else notifClose()};
$("np").addEventListener("click",function(e){e.stopPropagation();
  if(e.target.closest("#nAll")){var n=notifs();nlMarca(n.late.concat(n.doing,n.pend));notifUpdate();notifRender();return}
  var b=e.target.closest("button[data-d]");if(!b)return;var it=findIt(b.getAttribute("data-id"));
  if(it)nlMarca([it]);notifClose();notifUpdate();
  $("day").value=b.getAttribute("data-d");if(location.hash!=="#visao"&&location.hash)location.hash="#visao";render();if(it)openDlg(it)});
document.addEventListener("click",function(){if(!$("np").hidden)notifClose()});
document.addEventListener("keydown",function(e){if(e.key==="Escape")notifClose()});
setInterval(notifUpdate,60000);
// sessao: desconecta por inatividade (consultas automaticas nao contam)
var SESS=(ME&&ME.sessao_min)||0,lastIn=Date.now(),lastPing=Date.now(),warned=false;
function ping(){lastPing=Date.now();jf("POST","/api/ping")}
function hideWarn(){warned=false;$("sw").hidden=true}
function activity(){lastIn=Date.now();if(warned){hideWarn();ping()}else if(Date.now()-lastPing>60000)ping()}
["mousemove","mousedown","keydown","touchstart","wheel","scroll"].forEach(function(ev){document.addEventListener(ev,activity,{passive:true,capture:true})});
$("swb").onclick=function(){activity();ping()};
setInterval(function(){if(!SESS||!ME)return;var idle=(Date.now()-lastIn)/1000,T=SESS*60;
  if(idle>=T){fetch("/api/logout",{method:"POST",headers:{"X-Requested-With":"fetch"},credentials:"same-origin"}).then(function(){location.reload()})}
  else if(idle>=T-120&&!warned){warned=true;$("sw").hidden=false}},10000);
// backups (administrador)
function kb(n){return n<1048576?Math.max(1,Math.round(n/1024))+" KB":(n/1048576).toFixed(1)+" MB"}
function bkLoad(){jf("GET","/api/backups").then(function(x){if(!x.ok)return;$("bkSub").textContent="Pasta: "+x.d.pasta+" · "+x.d.itens.length+(x.d.itens.length===1?" backup":" backups");
  $("bkList").innerHTML=x.d.itens.length?'<table class="tbl"><thead><tr><th>Data e hora</th><th>Arquivo</th><th>Tamanho</th><th></th></tr></thead><tbody>'+x.d.itens.map(function(b){return '<tr><td style="white-space:nowrap">'+br(b.quando.slice(0,10))+" "+b.quando.slice(11,19)+'</td><td><small>'+esc(b.arquivo)+'</small></td><td>'+kb(b.tamanho)+'</td><td style="white-space:nowrap;text-align:right"><a class="btn sm" href="/api/backups/'+encodeURIComponent(b.arquivo)+'">Baixar</a> <button class="btn sm danger" data-bk="'+esc(b.arquivo)+'">Restaurar</button></td></tr>'}).join("")+'</tbody></table>':'<div class="empty" style="border:0;text-align:center;padding:24px">Nenhum backup ainda.</div>'})}
$("bkNovo").onclick=function(){$("bkMsg").textContent="Gerando…";jf("POST","/api/backup").then(function(x){$("bkMsg").textContent=x.ok?"Backup criado: "+x.d.arquivo:(x.d.erro||"Falha ao criar backup.");bkLoad()})};
$("bkList").addEventListener("click",function(e){var b=e.target.closest("button[data-bk]");if(!b)return;var n=b.getAttribute("data-bk");
  if(!confirm("Restaurar o backup "+n+"?\n\nTudo o que foi feito depois dele será perdido (atividades, usuários e senhas). Uma cópia do estado atual será guardada antes e todos serão desconectados.\n\nDeseja continuar?"))return;
  b.disabled=true;$("bkMsg").textContent="Restaurando…";
  whenSaved(function(){return jf("POST","/api/backups/restaurar",{arquivo:n}).then(function(x){if(x.ok){alert("Backup restaurado (banco e anexos).\nCópia do estado anterior: "+x.d.seguranca+(x.d.aviso?"\n\nAtenção: "+x.d.aviso:"")+"\nEntre novamente no sistema.");location.reload()}else{b.disabled=false;$("bkMsg").textContent=x.d.erro||"Não foi possível restaurar."}})})});
// tema claro/escuro
function setTema(t){if(t==="dark")document.documentElement.setAttribute("data-theme","dark");else document.documentElement.removeAttribute("data-theme");try{localStorage.setItem("tema",t)}catch(e){}$("tema").setAttribute("aria-pressed",t==="dark")}
function toggleTheme(){setTema(document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark")}
$("tema").onclick=toggleTheme;$("tema").setAttribute("aria-pressed",document.documentElement.getAttribute("data-theme")==="dark");
// atalhos de teclado
var chord=0,chordT=null;
$("kbtn").onclick=function(){$("kdlg").showModal()};$("kclose").onclick=function(){$("kdlg").close()};
document.addEventListener("keydown",function(e){
  if(e.ctrlKey||e.metaKey||e.altKey||document.body.classList.contains("locked"))return;
  var t=e.target,tag=t&&t.tagName;if(tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT"||(t&&t.isContentEditable))return;
  if(document.querySelector("dialog[open]"))return;
  var k=(e.key||"").toLowerCase();
  if(chord){var dest={v:"visao",p:"equipe",r:"relatorios",g:"graficos",h:"alteracoes",u:"usuarios",b:"backups"}[k];chord=0;clearTimeout(chordT);if(dest){e.preventDefault();location.hash="#"+dest}return}
  if(k==="g"){chord=1;chordT=setTimeout(function(){chord=0},1500)}
  else if(k==="n"){e.preventDefault();$("new").click()}
  else if(k==="/"){e.preventDefault();focaFiltro()}
  else if(k==="t"){toggleTheme()}
  else if(e.key==="?"){e.preventDefault();$("kdlg").showModal()}});
// menu "..." das atividades: abre por cima de tudo (nao fica cortado pelo cartao) e vira para cima se faltar espaco
function closeMenus(except){document.querySelectorAll(".menu[open]").forEach(function(o){if(o!==except)o.removeAttribute("open")})}
document.addEventListener("toggle",function(e){var d=e.target;if(!d.classList||!d.classList.contains("menu")||!d.open)return;
  closeMenus(d);var m=d.querySelector("div"),r=d.querySelector("summary").getBoundingClientRect(),h=m.offsetHeight||84,w=m.offsetWidth||130;
  var up=r.bottom+h+8>window.innerHeight&&r.top>h+8;
  m.style.position="fixed";m.style.right="auto";m.style.zIndex="1000";
  m.style.left=Math.max(8,Math.min(r.right-w,window.innerWidth-w-8))+"px";m.style.top=(up?r.top-h-4:r.bottom+4)+"px"},true);
document.addEventListener("click",function(e){document.querySelectorAll(".menu[open]").forEach(function(o){if(!o.contains(e.target))o.removeAttribute("open")})});
document.addEventListener("click",function(e){var b=e.target.closest(".hmenu>div button");if(b)b.closest(".hmenu").removeAttribute("open")});
document.addEventListener("scroll",function(){closeMenus()},true);
window.addEventListener("resize",function(){closeMenus()});
// senha
function pwOpen(forced){$("pwf").reset();$("pwm").textContent="";$("pwc").hidden=forced;$("pwt").textContent=forced?"Defina sua nova senha":"Alterar senha";$("pwd").textContent=forced?"Por segurança, troque a senha provisória antes de continuar.":"";$("pw").hidden=false;$("pwa").focus()}
$("cfg").onclick=function(){pwOpen(false)};
$("pwc").onclick=function(){$("pw").hidden=true};
$("pwf").addEventListener("submit",function(e){e.preventDefault();if($("pwn").value!==$("pwr").value){$("pwm").textContent="As senhas não conferem.";return}
  jf("POST","/api/senha",{atual:$("pwa").value,nova:$("pwn").value}).then(function(x){if(x.ok){alert("Senha alterada."+(x.d.sessoes_encerradas?"\n"+x.d.sessoes_encerradas+" outra(s) sessão(ões) aberta(s) com a senha antiga foram encerradas.":""));location.reload()}else $("pwm").textContent=x.d.erro||"Não foi possível alterar."})});
window.pwOpen=pwOpen;if(ME&&ME.trocar)pwOpen(true);
// backup (admin)
$("bkp").onclick=function(){$("bkm").textContent="Gerando...";jf("POST","/api/backup").then(function(x){$("bkm").textContent=x.ok?"Backup criado: "+x.d.arquivo+" (pasta backups)":(x.d.erro||"Falha ao criar backup.")})};
// painel da equipe
var STC={todo:"var(--todo)",doing:"var(--doing)",done:"var(--done)"};
function plist(it){var G=[["doing","Em andamento"],["todo","Pendentes"],["done","Concluídas"]];
  return '<div class="pls">'+G.map(function(g){var l=it.filter(function(i){return i.status===g[0]});if(!l.length)return"";
    return '<div class="plh">'+g[1]+' ('+l.length+')</div><ul class="pl">'+l.map(function(i){return '<li><span class="pdot" style="background:'+STC[i.status]+'"></span><span'+(i.status==="done"?' class="pdn"':'')+'>'+(i.hora?i.hora+" · ":"")+esc(i.titulo)+'</span></li>'}).join("")+'</ul>'}).join("")+'</div>'}
// semaforo do painel: vermelho = tem atrasadas; amarelo = abaixo do ritmo esperado para a hora do dia; verde = em dia
function semaforo(u,dia){var hoje=iso(new Date());
  if(u.atrasadas)return{c:"crit",ic:"✕",t:u.atrasadas+" atrasada"+(u.atrasadas>1?"s":"")};
  if(!u.total)return{c:"neu",ic:"○",t:"sem atividades no dia"};
  var feito=u.done/u.total;
  if(dia<hoje)return feito>=1?{c:"good",ic:"✓",t:"dia fechado"}:{c:"warn",ic:"!",t:(u.total-u.done)+" ficaram em aberto"};
  if(dia>hoje)return{c:"neu",ic:"○",t:"planejado"};
  var n=new Date(),h=n.getHours()+n.getMinutes()/60,esperado=Math.max(0,Math.min(1,(h-8)/10));
  return feito+0.2<esperado?{c:"warn",ic:"!",t:"abaixo do ritmo"}:{c:"good",ic:"✓",t:feito>=1?"dia fechado":"no ritmo"}}
function painelLoad(poll){if(!$("pDia").value)$("pDia").value=iso(new Date());
  if(poll!==true&&!$("pGrid").children.length)$("pGrid").innerHTML='<div class="pc"><div class="sk skl" style="width:50%"></div><div class="sk skb" style="height:120px"></div></div>'.repeat(3);
  whenSaved(function(){return fetch("/api/painel?data="+$("pDia").value,{credentials:"same-origin",headers:poll?{"X-Poll":"1"}:{}}).then(function(r){return r.json()}).then(function(d){
    if(!d.usuarios)return;var T=0,D=0;
    $("pGrid").innerHTML=d.usuarios.map(function(u){T+=u.total;D+=u.done;var pc=u.total?Math.round(u.done/u.total*100):0,sf=semaforo(u,d.data);
      var sg=function(k,q){return q?'<i class="sg-'+k+'" style="flex:'+q+'"></i>':''};
      return '<div class="pc sf-'+sf.c+'"><div class="pch"><div><h3>'+esc(u.nome)+'</h3><small>'+(esc(u.cargo)||"&nbsp;")+'</small></div><span class="sfc sf-'+sf.c+'" title="Situação"><i aria-hidden="true">'+sf.ic+'</i>'+esc(sf.t)+'</span></div>'+
      '<div class="pseg" title="Concluídas, em andamento e pendentes do dia">'+(u.total?sg("done",u.done)+sg("doing",u.doing)+sg("todo",u.todo):'<i class="sg-vz" style="flex:1"></i>')+'</div>'+
      '<div class="pleg">'+(u.total?'<b>'+u.done+' de '+u.total+'</b> concluídas'+(u.doing?' · <span class="lg-doing">'+u.doing+' em andamento</span>':'')+(u.todo?' · '+u.todo+' pendente'+(u.todo>1?'s':''):'')+(u.min_done?' · '+fm(u.min_done)+' feitos':''):'Sem atividades neste dia')+'</div>'+
      metaBar("Meta do dia",u.done,u.meta_dia)+metaBar("Meta da semana",u.feitas_sem,u.meta_sem)+
      (u.itens.length?plist(u.itens):'')+
      '<div class="pca"><button class="btn sm" type="button" data-prel="'+u.id+'" data-pnome="'+esc(u.nome)+'">Ver atividades da semana</button></div></div>'}).join("");
    $("pRes").textContent="Equipe: "+D+" de "+T+" atividades concluídas"+(T?" ("+Math.round(D/T*100)+"%).":".");
    var n=new Date(),p=function(x){return("0"+x).slice(-2)};$("pInfo").textContent="Atualizado às "+p(n.getHours())+":"+p(n.getMinutes())+" · atualiza sozinho a cada 30 s"})})}
$("pDia").addEventListener("change",painelLoad);
// "Ver atividades": abre o relatorio da pessoa (semana do dia escolhido no painel)
$("pGrid").addEventListener("click",function(e){var b=e.target.closest("[data-prel]");if(!b)return;var id=b.getAttribute("data-prel"),s=$("rUsr");
  if(ME&&+id===ME.id)id="me";else if(!s.querySelector('option[value="'+id+'"]')){var o=document.createElement("option");o.value=id;o.textContent=b.getAttribute("data-pnome");s.appendChild(o)}
  s.value=id;$("rSt").value="";var d=$("pDia").value.split("-"),dt=new Date(+d[0],+d[1]-1,+d[2]),a=new Date(dt);a.setDate(dt.getDate()-((dt.getDay()+6)%7));var z=new Date(a);z.setDate(a.getDate()+6);
  $("rPer").value="custom";$("rDe").value=iso(a);$("rAte").value=iso(z);location.hash="#relatorios"});
$("pHoje").onclick=function(){$("pDia").value=iso(new Date());painelLoad()};
setInterval(function(){var s=document.querySelector('[data-view="equipe"]');if(s&&!s.hidden&&!document.hidden)painelLoad(true)},30000);
// busca geral
var bsLim=60,bsT=null;
function nrm(t){return String(t||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase()}
function bsFiltered(){
  var toks=nrm($("bsQ").value).split(/\s+/).filter(Boolean),de=$("bsDe").value,ate=$("bsAte").value,c=$("bsCat").value,st=$("bsSt").value,pr=$("bsPr").value,tg=$("bsTag").value;
  return items.filter(function(i){
    if(de&&i.date<de)return false;if(ate&&i.date>ate)return false;if(c&&i.cat!==c)return false;if(st==="aberta"){if(i.status==="done")return false}else if(st&&i.status!==st)return false;if(pr&&i.prio!==pr)return false;if(tg&&(i.tags||[]).indexOf(tg)<0)return false;
    if(toks.length){var h=nrm(i.title+" "+i.desc+" "+i.who+" "+(CATS[i.cat]||"")+" "+(i.tags||[]).join(" "));for(var k=0;k<toks.length;k++)if(h.indexOf(toks[k])<0)return false}
    return true}).sort(function(a,b){return (b.date+(b.time||"")).localeCompare(a.date+(a.time||""))})
}
function bsRender(){
  if(view!=="busca")return;
  var r=bsFiltered(),tot=r.length;
  $("bsN").textContent=tot+(tot===1?" atividade encontrada":" atividades encontradas");
  $("bsRes").innerHTML=tot?r.slice(0,bsLim).map(function(i){return row(i,true)}).join(""):emptyHtml("busca");
  $("bsMore").innerHTML=tot>bsLim?'<button class="btn" id="bsMoreB" type="button">Mostrar mais ('+(tot-bsLim)+')</button>':"";
}
function bsGo(){bsLim=60;bsRender()}
$("bsCat").innerHTML='<option value="">Todos</option>'+Object.keys(CATS).map(function(k){return '<option value="'+k+'">'+CATS[k]+'</option>'}).join("");
$("bsQ").addEventListener("input",function(){clearTimeout(bsT);bsT=setTimeout(bsGo,120)});
["bsDe","bsAte","bsCat","bsSt","bsPr","bsTag"].forEach(function(i){$(i).addEventListener("change",bsGo)});
document.querySelectorAll("[data-bp]").forEach(function(b){b.addEventListener("click",function(){
  var v=b.getAttribute("data-bp"),t=new Date(),a=new Date(t);
  if(v==="mes")a=new Date(t.getFullYear(),t.getMonth(),1);else if(v==="ano")a=new Date(t.getFullYear(),0,1);else a.setDate(a.getDate()-(+v-1));
  $("bsDe").value=iso(a);$("bsAte").value=iso(t);bsGo()})});
$("bsClr").onclick=function(){["bsQ","bsDe","bsAte","bsCat","bsSt","bsPr","bsTag"].forEach(function(i){$(i).value=""});bsGo();$("bsQ").focus()};
$("bsExp").onclick=function(){var r=bsFiltered();if(!r.length){alert("Nada para exportar.");return}dl("busca.csv",csvOf(r))};
$("bsMore").addEventListener("click",function(e){if(e.target.id==="bsMoreB"){bsLim+=60;bsRender()}});
// importar planilha Excel
var xlData=null;
function xlMsg(t){$("xlMsg").textContent=t||""}
function xlKey(a){return a.date+"|"+(a.time||"")+"|"+String(a.title).trim().toLowerCase()}
function xlSend(f){
  if(!f)return;
  if(!/\.xlsx$/i.test(f.name)){xlMsg("Envie um arquivo .xlsx (Excel). Para outros formatos, abra no Excel e salve como .xlsx.");return}
  if(f.size>6*1024*1024){xlMsg("Arquivo muito grande (máximo 6 MB).");return}
  xlMsg("Lendo a planilha…");$("xlPrev").hidden=true;
  fetch("/api/importar/xlsx",{method:"POST",headers:{"X-Requested-With":"fetch"},credentials:"same-origin",body:f})
    .then(function(r){return r.json().catch(function(){return{}}).then(function(d){return{ok:r.ok,d:d}})})
    .then(function(x){if(!x.ok){xlMsg(x.d.erro||"Não foi possível ler a planilha.");return}xlData=x.d;xlMsg("");xlShow()})
    .catch(function(){xlMsg("Falha de conexão ao enviar a planilha.")})
}
function xlPlan(){
  var ex={},seen={},skip=$("xlSkip").checked,novas=[],dup=0;
  items.forEach(function(i){ex[xlKey(i)]=1});
  xlData.atividades.forEach(function(a){var k=xlKey(a);a._dup=!!ex[k]||!!seen[k];seen[k]=1;if(a._dup&&skip)dup++;else novas.push(a)});
  return{novas:novas,dup:dup}
}
function xlShow(){
  var pl=xlPlan(),a=xlData.atividades,er=xlData.erros;
  $("xlPrev").hidden=false;
  $("xlSum").textContent=pl.novas.length+" atividade(s) pronta(s) para importar"+(pl.dup?" · "+pl.dup+" já existe(m), ignorada(s)":"")+(er.length?" · "+er.length+" linha(s) com erro":"");
  $("xlTab").innerHTML='<thead><tr><th>Linha</th><th>Data</th><th>Hora</th><th>Título</th><th>Tipo</th><th>Situação</th><th></th></tr></thead><tbody>'+
    a.slice(0,100).map(function(x){var ign=x._dup&&$("xlSkip").checked;return '<tr'+(ign?' style="opacity:.5"':'')+'><td>'+x.linha+'</td><td>'+br(x.date)+'</td><td>'+(x.time||"—")+'</td><td>'+esc(x.title)+'</td><td>'+(CATS[x.cat]||x.cat)+'</td><td>'+(ST[x.status]||x.status)+'</td><td>'+(x._dup?'já existe':'nova')+'</td></tr>'}).join("")+
    (a.length>100?'<tr><td colspan="7" style="text-align:center;color:var(--muted)">…e mais '+(a.length-100)+' linha(s)</td></tr>':'')+'</tbody>';
  $("xlErr").innerHTML=er.length?'<div class="xlerr"><b>Linhas que serão ignoradas:</b><ul>'+er.slice(0,30).map(function(e){return '<li>Linha '+e.linha+': '+esc(e.motivo)+'</li>'}).join("")+(er.length>30?'<li>…e mais '+(er.length-30)+'</li>':'')+'</ul></div>':"";
  $("xlOk").textContent=pl.novas.length?"Importar "+pl.novas.length+" atividade(s)":"Nada para importar";$("xlOk").disabled=!pl.novas.length;
}
$("xlFile").addEventListener("change",function(){xlSend(this.files[0]);this.value=""});
$("xlSkip").addEventListener("change",function(){if(xlData)xlShow()});
$("xlCancel").onclick=function(){xlData=null;$("xlPrev").hidden=true;xlMsg("")};
$("xlOk").onclick=function(){
  if(!xlData)return;var pl=xlPlan();
  var cr=[];pl.novas.forEach(function(a){var n=nz({id:uid(),date:a.date,time:a.time,dur:a.dur,title:a.title,desc:a.desc,cat:a.cat,who:a.who,prio:a.prio,status:a.status});cr.push(n.id);items.push(n)});
  save();render();pushUndo(cr.length+" atividade(s) importada(s)",function(){items=items.filter(function(x){return cr.indexOf(x.id)<0});save();render()});$("xlPrev").hidden=true;
  xlMsg("✔ "+pl.novas.length+" atividade(s) importada(s). Você pode vê-las em Atividades ou na Busca geral.");xlData=null;
};
var dz=$("xlDrop");
dz.addEventListener("click",function(){$("xlFile").click()});
["dragenter","dragover"].forEach(function(n){dz.addEventListener(n,function(e){e.preventDefault();dz.classList.add("on")})});
["dragleave","drop"].forEach(function(n){dz.addEventListener(n,function(e){e.preventDefault();dz.classList.remove("on")})});
dz.addEventListener("drop",function(e){var f=e.dataTransfer&&e.dataTransfer.files[0];if(f)xlSend(f)});
// ===== v3: toasts, vazios, etiquetas, cronometro, calendario, quadro =====
function toast(msg,o){o=o||{};var el=document.createElement("div");el.className="toast"+(o.cls?" "+o.cls:"");el.innerHTML='<span>'+esc(msg)+'</span>'+(o.acao?'<button type="button">'+esc(o.acao)+'</button>':'');
  var box=$("toasts");box.appendChild(el);while(box.children.length>3)box.removeChild(box.firstChild);
  var fin=false;function close(){if(!fin){fin=true;el.remove()}}
  if(o.acao)el.querySelector("button").onclick=function(e){e.stopPropagation();close();if(o.fn)o.fn()};
  el.querySelector("span").onclick=close;el.querySelector("span").style.cursor="pointer";el.querySelector("span").title="Clique para fechar";
  setTimeout(close,o.ms||5000)}
var ES={
  dia:{svg:'<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="20" width="68" height="60" rx="10"/><path d="M14 38h68M32 12v14M64 12v14M34 60l9 9 20-20"/></svg>',t:"Dia livre",p:"Nenhuma atividade neste dia. Que tal planejar alguma coisa?",b:'<button class="btn dark" data-es="new">Nova atividade</button>'},
  filtro:{svg:'<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="42" cy="42" r="24"/><path d="M60 60l22 22M32 42h20"/></svg>',t:"Nada por aqui",p:"Nenhuma atividade com esses filtros.",b:'<button class="btn" data-es="clear">Limpar filtros</button>'},
  todas:{svg:'<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="20" y="14" width="56" height="70" rx="10"/><path d="M34 34h28M34 48h28M34 62h16"/></svg>',t:"Nenhuma atividade ainda",p:"Crie a primeira ou importe várias de uma planilha Excel.",b:'<span style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="btn dark" data-es="new">Nova atividade</button><button class="btn" data-es="import">Importar planilha</button></span>'},
  hist:{svg:'<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M30 18h36v22a18 18 0 0 1-36 0zM30 26H16c0 14 6 20 14 22M66 26h14c0 14-6 20-14 22M48 58v14M34 78h28"/></svg>',t:"Sem conclusões ainda",p:"As atividades concluídas aparecem aqui."},
  busca:{svg:'<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="42" cy="42" r="24"/><path d="M60 60l22 22M33 36c3-5 15-5 18 0 2 4-3 6-6 8v3M45 54v.01"/></svg>',t:"Nenhum resultado",p:"Tente outras palavras ou afrouxe os filtros.",b:'<button class="btn" data-es="clear">Limpar filtros</button>'}};
function emptyHtml(k,tag){var e=ES[k]||ES.dia;tag=tag||"li";return '<'+tag+' class="empty es">'+e.svg+'<b>'+e.t+'</b><p>'+e.p+'</p>'+(e.b||"")+'</'+tag+'>'}
document.addEventListener("click",function(e){var b=e.target.closest("[data-es]");if(!b)return;var a=b.getAttribute("data-es");
  if(a==="new")$("new").click();else if(a==="import")location.hash="#importar";
  else if(a==="clear"){["q","fc","fp","ft"].forEach(function(i){$(i).value=""});$("bsClr").click();render()}});
// etiquetas
var tagSig="";
function tagsRefresh(){var set={};items.forEach(function(i){(i.tags||[]).forEach(function(t){set[t]=1})});var l=Object.keys(set).sort(function(a,b){return a.localeCompare(b,"pt-BR")}),sg=l.join("|");if(sg===tagSig)return;tagSig=sg;
  var f=function(id,first){var el=$(id),v=el.value;el.innerHTML='<option value="">'+first+'</option>'+l.map(function(t){return '<option value="'+esc(t)+'">#'+esc(t)+'</option>'}).join("");el.value=l.indexOf(v)>-1?v:""};
  f("ft","Todas as etiquetas");f("bsTag","Todas");$("tgList").innerHTML=l.map(function(t){return '<option value="'+esc(t)+'">'}).join("")}
// barra do cronometro
function findRun(){var r=null;items.forEach(function(i){if(i.tstart>0)r=i});return r}
function runBar(){var r=findRun(),b=$("runNow");if(!r){b.hidden=true;return}b.hidden=false;
  b.innerHTML='⏱ <span id="runClk">'+clk((+r.spent||0)+nowS()-r.tstart)+'</span><span>'+esc(r.title.slice(0,38))+'</span><button type="button" id="runStop">Parar</button>';$("runStop").onclick=function(){timerToggle(r)}}
setInterval(function(){var n=nowS();document.querySelectorAll(".tmr.run").forEach(function(b){b.textContent=clk((+b.getAttribute("data-sp")||0)+n-(+b.getAttribute("data-ts")))});var r=findRun();if(r&&$("runClk"))$("runClk").textContent=clk((+r.spent||0)+n-r.tstart)},1000);
// calendario
var calMode="semana",calRef=new Date(),dragId=null,WD=["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
function pISO(d){var p=d.split("-");return new Date(+p[0],+p[1]-1,+p[2])}
function addD(d,n){var x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()+n);return x}
function monOf(d){var x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
function byPT(a,b){return (b.pin?1:0)-(a.pin?1:0)||(a.time||"99").localeCompare(b.time||"99")}
function evHtml(i){var sb=i.subs||[];return '<button type="button" class="cev c-'+i.cat+'" draggable="true" data-id="'+i.id+'" data-s="'+i.status+'" title="'+esc(i.title)+'"><b>'+(i.pin?'<span class="pin">★</span>':'')+esc(i.title)+'</b><small>'+(i.time||"dia todo")+(i.dur?" · "+i.dur+" min":"")+(sb.length?" · ☑ "+sb.filter(function(x){return x.d}).length+"/"+sb.length:"")+'</small></button>'}
function calRender(){
  var box=$("calBox"),hoje=iso(new Date()),h="",k;
  $("calS").setAttribute("aria-pressed",calMode==="semana");$("calM").setAttribute("aria-pressed",calMode==="mes");
  if(calMode==="semana"){
    var m=monOf(calRef),e=addD(m,6);
    $("calTit").textContent=m.toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})+" – "+e.toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"});
    h='<div class="wk">';
    for(k=0;k<7;k++){var d=addD(m,k),di=iso(d),l=items.filter(function(i){return i.date===di}).sort(byPT);
      h+='<div class="cday'+(di===hoje?' hoje':'')+'" data-d="'+di+'"><div class="cdh" data-go="'+di+'"><span>'+WD[k]+'</span><b>'+("0"+d.getDate()).slice(-2)+'</b></div><div class="cdl" data-new="'+di+'">'+l.map(evHtml).join("")+'</div></div>'}
    h+='</div>';
  }else{
    var f=new Date(calRef.getFullYear(),calRef.getMonth(),1),la=new Date(calRef.getFullYear(),calRef.getMonth()+1,0),st=monOf(f),en=addD(monOf(la),6);
    $("calTit").textContent=f.toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
    h='<div class="mh">'+WD.map(function(x){return '<span>'+x+'</span>'}).join("")+'</div><div class="mg">';
    for(var d2=st;d2<=en;d2=addD(d2,1)){var di2=iso(d2),l2=items.filter(function(i){return i.date===di2}).sort(byPT);
      h+='<div class="mday'+(d2.getMonth()!==f.getMonth()?' fora':'')+(di2===hoje?' hoje':'')+'" data-d="'+di2+'"><b data-go="'+di2+'">'+d2.getDate()+'</b>'+l2.slice(0,3).map(evHtml).join("")+(l2.length>3?'<button type="button" class="mais" data-go="'+di2+'">+'+(l2.length-3)+' mais</button>':'')+'<div class="mdots">'+l2.slice(0,6).map(function(i){return '<i class="c-'+i.cat+'"></i>'}).join("")+'</div></div>'}
    h+='</div>';
  }
  box.innerHTML=h;
}
function goDay(d){$("day").value=d;location.hash="#visao";render()}
$("calBox").addEventListener("click",function(e){
  var g=e.target.closest("[data-go]");if(g){goDay(g.getAttribute("data-go"));return}
  var c=e.target.closest(".cev");if(c){var it=findIt(c.getAttribute("data-id"));if(it)openDlg(it);return}
  var n=e.target.closest("[data-new]");if(n&&e.target===n)openDlg(null,n.getAttribute("data-new"))});
$("calPrev").onclick=function(){if(calMode==="semana")calRef=addD(calRef,-7);else calRef=new Date(calRef.getFullYear(),calRef.getMonth()-1,1);calRender()};
$("calNext").onclick=function(){if(calMode==="semana")calRef=addD(calRef,7);else calRef=new Date(calRef.getFullYear(),calRef.getMonth()+1,1);calRender()};
$("calHoje").onclick=function(){calRef=new Date();calRender()};
$("calS").onclick=function(){calMode="semana";calRender()};$("calM").onclick=function(){calMode="mes";calRender()};
function moveTo(id,d){var it=findIt(id);if(it&&it.date!==d)undoable("Movida para "+br(d),[id],function(){it.date=d});flashRow(id)}
function moveSt(id,st){var it=findIt(id);if(it&&it.status!==st)undoable("Situação: "+ST[st],[id],function(){setStatus(it,st)})}
function dnd(box,zoneSel,onDrop){
  box.addEventListener("dragstart",function(e){var c=e.target.closest("[draggable=true]");if(!c)return;dragId=c.getAttribute("data-id");try{e.dataTransfer.setData("text/plain",dragId);e.dataTransfer.effectAllowed="move"}catch(x){}c.classList.add("dragging")});
  box.addEventListener("dragend",function(){dragId=null;box.querySelectorAll(".dragging,.over").forEach(function(x){x.classList.remove("dragging","over")})});
  box.addEventListener("dragover",function(e){var z=e.target.closest(zoneSel);if(!z||!dragId)return;e.preventDefault();box.querySelectorAll(".over").forEach(function(x){if(x!==z)x.classList.remove("over")});z.classList.add("over")});
  box.addEventListener("drop",function(e){var z=e.target.closest(zoneSel);if(!z||!dragId)return;e.preventDefault();var id=dragId;dragId=null;onDrop(id,z)})}
dnd($("calBox"),".cday,.mday",function(id,z){moveTo(id,z.getAttribute("data-d"))});
// quadro
function kbItems(){var sc=$("kbScope").value,t=new Date(),a="0000",b="9999";
  if(sc==="semana"){a=iso(monOf(t));b=iso(addD(monOf(t),6))}else if(sc==="mes"){a=iso(new Date(t.getFullYear(),t.getMonth(),1));b=iso(new Date(t.getFullYear(),t.getMonth()+1,0))}else if(sc==="dia"){a=b=$("day").value}
  return items.filter(function(i){return i.date>=a&&i.date<=b})}
function kcard(i,col){var sb=i.subs||[],sd=sb.filter(function(x){return x.d}).length;
  return '<div class="kcard c-'+i.cat+'" draggable="true" data-id="'+i.id+'" data-s="'+i.status+'"><b>'+(i.pin?'<span class="pin">★</span>':'')+esc(i.title)+'</b><div class="km"><span>'+br(i.date).slice(0,5)+(i.time?" "+i.time:"")+'</span>'+(i.who?'<span>· '+esc(i.who)+'</span>':'')+(sb.length?'<span>· ☑ '+sd+'/'+sb.length+'</span>':'')+(i.tags||[]).slice(0,2).map(function(t){return '<span class="etq">#'+esc(t)+'</span>'}).join("")+'</div>'+
    '<div class="ka">'+(col!=="todo"?'<button data-k="prev" aria-label="Mover para a coluna anterior">◀</button>':'')+(col!=="done"?'<button data-k="next" aria-label="Mover para a próxima coluna">▶</button>':'')+'</div></div>'}
function kbRender(){var l=kbItems(),cols=[["todo","Pendentes"],["doing","Em andamento"],["done","Concluídas"]];
  $("kbBox").innerHTML=cols.map(function(c){var arr=l.filter(function(i){return i.status===c[0]}).sort(function(a,b){return c[0]==="done"?(b.date+(b.time||"")).localeCompare(a.date+(a.time||"")):(b.pin?1:0)-(a.pin?1:0)||(a.date+(a.time||"99")).localeCompare(b.date+(b.time||"99"))}),sh=arr.slice(0,40);
    return '<div class="kcol" data-st="'+c[0]+'"><h3>'+c[1]+'<em>'+arr.length+'</em></h3><div class="kl">'+(sh.length?sh.map(function(i){return kcard(i,c[0])}).join(""):'<p class="lead" style="text-align:center;margin:18px 0">Nada aqui.</p>')+(arr.length>40?'<p class="lead" style="text-align:center">…e mais '+(arr.length-40)+'</p>':'')+'</div></div>'}).join("")}
$("kbScope").addEventListener("change",kbRender);
$("kbBox").addEventListener("click",function(e){
  var k=e.target.closest("[data-k]");if(k){var c=k.closest(".kcard"),id=c.getAttribute("data-id"),it=findIt(id),o=["todo","doing","done"],ix=o.indexOf(it.status)+(k.getAttribute("data-k")==="next"?1:-1);if(o[ix])moveSt(id,o[ix]);return}
  var c2=e.target.closest(".kcard");if(c2){var it2=findIt(c2.getAttribute("data-id"));if(it2)openDlg(it2)}});
dnd($("kbBox"),".kcol",function(id,z){moveSt(id,z.getAttribute("data-st"))});
// ===== v3b: lembretes, boas-vindas, tutorial, gestos, aparencia, saude =====
function lget(k,d){try{var v=localStorage.getItem(k);return v===null?d:v}catch(e){return d}}
function lset(k,v){try{localStorage.setItem(k,v)}catch(e){}}
// lembretes
function lembOn(){return lget("lemb","1")!=="0"}
function lembTick(){
  if(!ME||ME.trocar||!lembOn())return;var now=new Date(),hoje=iso(now),seen={};try{seen=JSON.parse(lget("lembSeen","{}"))}catch(e){}
  var ch=false;Object.keys(seen).forEach(function(k){if(k.indexOf(hoje)<0){delete seen[k];ch=true}});
  items.forEach(function(i){
    if(i.date!==hoje||!i.time||i.status==="done")return;
    var p=i.time.split(":"),at=new Date(now.getFullYear(),now.getMonth(),now.getDate(),+p[0],+p[1]),diff=(at-now)/60000;
    if(diff>(+lget("lembMin","10")||10)||diff<-30)return;var key=i.id+"|"+hoje+"|"+i.time;if(seen[key])return;seen[key]=1;ch=true;
    var msg=diff>0.5?"Começa em "+Math.ceil(diff)+" min: ":"Começou às "+i.time+": ";
    toast("🔔 "+msg+i.title,{ms:20000,cls:"lemb"});
    if(window.Notification&&Notification.permission==="granted"){try{new Notification("Suporte — lembrete",{body:msg+i.title,icon:"/static/icons/icon-192.png"})}catch(e){}}
  });
  if(ch)lset("lembSeen",JSON.stringify(seen));
}
setInterval(lembTick,30000);
// tutorial
var TOUR=[
  {svg:'<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="48" cy="48" r="32"/><path d="M48 32v32M32 48h32"/></svg>',t:"Crie suas atividades",p:"Use o botão + (ou a tecla N). Dentro da atividade você pode adicionar subtarefas, etiquetas, fixar no topo e cronometrar o tempo gasto."},
  {svg:'<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="42" cy="42" r="24"/><path d="M60 60l22 22M30 42h24"/></svg>',t:"Encontre e importe",p:"A Busca geral acha qualquer atividade antiga por texto, data, tipo ou etiqueta. Em Dados, importe várias atividades de uma vez por planilha Excel."},
  {svg:'<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="16" width="68" height="64" rx="10"/><path d="M14 34h68M34 16v-6M62 16v-6M28 48h10M46 48h10M64 48h6M28 62h10M46 62h10"/></svg>',t:"Calendário, quadro e celular",p:"Veja a semana no Calendário e arraste cartões no Quadro. No celular, deslize uma atividade para o lado: direita conclui, esquerda exclui (dá para desfazer)."}];
var tourI=0,tourDone=null;
function tourShow(){var t=TOUR[tourI];$("tourBody").innerHTML=t.svg+'<h2>'+t.t+'</h2><p>'+t.p+'</p>';
  $("tourDots").innerHTML=TOUR.map(function(x,k){return '<i class="'+(k===tourI?'on':'')+'"></i>'}).join("");
  $("tourBack").style.visibility=tourI?"visible":"hidden";$("tourNext").textContent=tourI===TOUR.length-1?"Começar":"Próximo"}
function tourOpen(cb){tourI=0;tourDone=cb||null;tourShow();if(!$("tourDlg").open)$("tourDlg").showModal()}
function tourEnd(){lset("tour","1");$("tourDlg").close();var f=tourDone;tourDone=null;if(f)f()}
$("tourNext").onclick=function(){if(tourI<TOUR.length-1){tourI++;tourShow()}else tourEnd()};
$("tourBack").onclick=function(){if(tourI){tourI--;tourShow()}};$("tourSkip").onclick=tourEnd;
$("tourDlg").addEventListener("cancel",function(e){e.preventDefault();tourEnd()});
// boas-vindas
function agoTxt(q){var m=String(q||"").match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);return m?m[3]+"/"+m[2]+"/"+m[1]+" às "+m[4]+":"+m[5]:q}
function welcome(){
  if(!ME||ME.trocar)return;
  try{if(sessionStorage.getItem("wel"))return;sessionStorage.setItem("wel","1")}catch(e){}
  var hoje=iso(new Date()),di=items.filter(function(i){return i.date===hoje}),dn=di.filter(function(i){return i.status==="done"}).length,
      late=items.filter(lateOf),dg=items.filter(function(i){return i.status==="doing"}).length,h=new Date().getHours();
  $("welBody").innerHTML='<h2 style="margin:0 0 4px">'+(h<12?"Bom dia":h<18?"Boa tarde":"Boa noite")+", "+esc(ME.nome.split(" ")[0])+'!</h2>'+
    '<p class="lead" style="margin:0">'+(di.length?"Hoje você tem "+di.length+" atividade"+(di.length>1?"s":"")+" ("+dn+" já concluída"+(dn===1?"":"s")+").":"Você ainda não tem atividades hoje.")+(late.length?" Atenção: "+late.length+" atrasada"+(late.length>1?"s":"")+".":"")+'</p>'+
    '<div class="welg"><div><strong>'+di.length+'</strong><small>hoje</small></div><div class="'+(late.length?"bad":"")+'"><strong>'+late.length+'</strong><small>atrasadas</small></div><div><strong>'+dg+'</strong><small>em andamento</small></div></div>'+
    (ME.ultimo_acesso?'<p class="lead" style="margin:0;font-size:13px">Seu acesso anterior: '+esc(agoTxt(ME.ultimo_acesso.quando))+' · '+esc(ME.ultimo_acesso.agente)+'</p>':'');
  var act='<button class="btn" id="welOk" type="button">Fechar</button>'+(late.length?'<button class="btn" id="welLate" type="button">Ver atrasadas</button>':'')+'<button class="btn dark" id="welGo" type="button">'+(di.length?"Ir para hoje":"Planejar o dia")+'</button>';
  $("welAct").innerHTML=act;
  $("welOk").onclick=function(){$("welDlg").close()};
  $("welGo").onclick=function(){$("welDlg").close();$("day").value=hoje;location.hash="#visao";render();if(!di.length)$("new").click()};
  if(late.length)$("welLate").onclick=function(){$("welDlg").close();$("aF").value="late";location.hash="#atividades";render()};
  $("welDlg").showModal();
}
function startUp(){if(!ME||ME.trocar)return;lembTick();if(lget("tour","")!=="1")tourOpen(welcome);else welcome()}
// gestos (celular): direita conclui, esquerda exclui
function swipeInit(box){
  var sx=0,sy=0,li=null,dx=0,lock=0,bg=null,ul=null;
  box.addEventListener("touchstart",function(e){if(e.touches.length!==1||e.target.closest("details,input,textarea,select"))return;li=e.target.closest("li.row");if(!li)return;sx=e.touches[0].clientX;sy=e.touches[0].clientY;dx=0;lock=0;ul=li.parentNode},{passive:true});
  box.addEventListener("touchmove",function(e){
    if(!li)return;var t=e.touches[0],mx=t.clientX-sx,my=t.clientY-sy;
    if(!lock){if(Math.abs(mx)>10||Math.abs(my)>10){lock=Math.abs(mx)>Math.abs(my)*1.4?1:-1;
      if(lock===1){ul.style.position="relative";ul.style.overflow="hidden";bg=document.createElement("div");bg.className="swbg";bg.style.top=li.offsetTop+"px";bg.style.height=li.offsetHeight+"px";ul.appendChild(bg);li.classList.add("swp")}else{li=null}}return}
    if(lock!==1)return;e.preventDefault();dx=mx;li.style.transform="translateX("+dx+"px)";
    bg.className="swbg "+(dx>0?"r":"l");bg.textContent=dx>0?(li.getAttribute("data-s")==="done"?"↺ Reabrir":"✓ Concluir"):"Delegar ↪"},{passive:false});
  function fim(){
    if(!li)return;var el=li,id=el.getAttribute("data-id"),d=dx,w=el.offsetWidth,ul2=ul;
    if(lock===1){
      if(Math.abs(d)>Math.min(80,w*.22)){el.style.transition="transform .18s,opacity .18s";el.style.transform="translateX("+(d>0?w:-w)+"px)";el.style.opacity="0";
        var bg3=bg;setTimeout(function(){if(bg3)bg3.remove();ul2.style.position="";ul2.style.overflow="";var it=findIt(id);if(!it){render();return}
          if(d>0){var ns=it.status==="done"?"todo":"done";undoable(ns==="done"?"Atividade concluída":"Atividade reaberta",[id],function(){setStatus(it,ns)})}
          else{el.style.transition="";el.style.transform="";el.style.opacity="";el.classList.remove("swp");dgOpen(it)}},180)}
      else{var bg2=bg;el.style.transition="transform .18s";el.style.transform="";setTimeout(function(){el.style.transition="";el.classList.remove("swp");if(bg2)bg2.remove();ul2.style.position="";ul2.style.overflow=""},190)}}
    li=null;bg=null;lock=0}
  box.addEventListener("touchend",fim,{passive:true});box.addEventListener("touchcancel",fim,{passive:true});
}
["list","all","hist","bsRes"].forEach(function(i){swipeInit($(i))});
// aparencia
var ACC={blue:{n:"Azul",a:"#2f6492",ad:"#8fc0ea",d:"#3d6189",h1:"#567fa6",h2:"#44698f",d1:"#2f4a66",d2:"#27405a"},
  green:{n:"Verde",a:"#2a7a50",ad:"#7fd1a5",d:"#2f7d5b",h1:"#4f9a74",h2:"#3b7f5c",d1:"#25483a",d2:"#1f3c31"},
  purple:{n:"Roxo",a:"#5b49a8",ad:"#b3a6f0",d:"#6a58b8",h1:"#7a69c4",h2:"#5d4ca6",d1:"#3b3566",d2:"#322d58"},
  orange:{n:"Laranja",a:"#b8581d",ad:"#f0a877",d:"#c8692a",h1:"#dc8450",h2:"#bf6a33",d1:"#5a3a24",d2:"#4b301e"},
  rose:{n:"Rosa",a:"#a63d66",ad:"#ee9bbb",d:"#b5476f",h1:"#c9638a",h2:"#a84a70",d1:"#5a2c40",d2:"#4a2434"},
  graphite:{n:"Grafite",a:"#44505e",ad:"#aab7c6",d:"#4b5563",h1:"#667385",h2:"#4d5a6a",d1:"#2b333d",d2:"#232a33"}};
function prefs(){var p={};try{p=JSON.parse(lget("prefs","{}"))||{}}catch(e){}return{cor:ACC[p.cor]?p.cor:"blue",f:p.f||"m",d:p.d||"conf"}}
function savePrefs(p){lset("prefs",JSON.stringify(p))}
function applyPrefs(){var p=prefs(),c=ACC[p.cor],st=document.getElementById("accCss");
  if(!st){st=document.createElement("style");st.id="accCss";document.head.appendChild(st)}
  st.textContent=':root{--head:'+c.h2+';--dark:'+c.d+';--accent:'+c.a+';--hd1:'+c.h1+';--hd2:'+c.h2+';--rail-ink:'+c.a+';--mi:'+c.a+'}:root[data-theme="dark"]{--accent:'+c.ad+';--dh1:'+c.d1+';--dh2:'+c.d2+';--rail-ink:'+c.ad+';--mi:'+c.ad+'}';
  document.documentElement.style.setProperty("--fz",{p:".92",m:"1",g:"1.12"}[p.f]||"1");document.body.classList.toggle("compact",p.d==="comp");
  var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",c.h2)}
function applyTheme(t){var dark=t==="dark"||(t==="auto"&&window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches);
  if(dark)document.documentElement.setAttribute("data-theme","dark");else document.documentElement.removeAttribute("data-theme");
  try{if(t==="auto")localStorage.removeItem("tema");else localStorage.setItem("tema",t)}catch(e){}
  $("tema").setAttribute("aria-pressed",dark)}
function apSync(){var p=prefs(),t=lget("tema","")||"auto";
  document.querySelectorAll("#apTema button").forEach(function(b){b.setAttribute("aria-pressed",b.getAttribute("data-v")===t)});
  document.querySelectorAll("#apFonte button").forEach(function(b){b.setAttribute("aria-pressed",b.getAttribute("data-v")===p.f)});
  document.querySelectorAll("#apDens button").forEach(function(b){b.setAttribute("aria-pressed",b.getAttribute("data-v")===p.d)});
  document.querySelectorAll("#apCor .swt").forEach(function(b){b.setAttribute("aria-pressed",b.getAttribute("data-v")===p.cor)});
  $("apLemb").checked=lembOn();
  var ok=window.Notification&&window.isSecureContext;$("apLembMsg").textContent=lembOn()?(ok?(Notification.permission==="granted"?"Avisos do sistema ativados.":"Avisos dentro do sistema. Para avisos do navegador, permita as notificações."):"Os lembretes aparecem aqui dentro do sistema."):""}
$("apCor").innerHTML=Object.keys(ACC).map(function(k){return '<button type="button" class="swt" data-v="'+k+'" style="--c:'+ACC[k].a+'" aria-label="'+ACC[k].n+'" title="'+ACC[k].n+'"></button>'}).join("");
$("apTema").addEventListener("click",function(e){var b=e.target.closest("button");if(b){applyTheme(b.getAttribute("data-v"));apSync()}});
$("apFonte").addEventListener("click",function(e){var b=e.target.closest("button");if(b){var p=prefs();p.f=b.getAttribute("data-v");savePrefs(p);applyPrefs();apSync()}});
$("apDens").addEventListener("click",function(e){var b=e.target.closest("button");if(b){var p=prefs();p.d=b.getAttribute("data-v");savePrefs(p);applyPrefs();apSync()}});
$("apCor").addEventListener("click",function(e){var b=e.target.closest(".swt");if(b){var p=prefs();p.cor=b.getAttribute("data-v");savePrefs(p);applyPrefs();apSync()}});
$("apLemb").addEventListener("change",function(){lset("lemb",this.checked?"1":"0");
  if(this.checked&&window.Notification&&window.isSecureContext&&Notification.permission==="default"){try{Notification.requestPermission().then(apSync)}catch(e){}}apSync()});
$("apBtn").onclick=function(){apSync();$("apDlg").showModal();if(window.innerWidth<=860)document.body.classList.add("nomenu")};
$("apClose").onclick=function(){$("apDlg").close()};
$("apTour").onclick=function(){$("apDlg").close();tourOpen(null)};
applyPrefs();
// desfazer pelo teclado
document.addEventListener("keydown",function(e){if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&(e.key==="z"||e.key==="Z")){var t=e.target;if(t&&/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))return;if(document.querySelector("dialog[open]"))return;e.preventDefault();doUndo()}});
// saude e acessos
function bytesTxt(n){n=+n||0;if(n<1024)return n+" B";if(n<1048576)return (n/1024).toFixed(0)+" KB";if(n<1073741824)return (n/1048576).toFixed(1).replace(".",",")+" MB";return (n/1073741824).toFixed(1).replace(".",",")+" GB"}
function durTxt(sec){sec=+sec||0;var d=Math.floor(sec/86400),h=Math.floor(sec%86400/3600),m=Math.floor(sec%3600/60);return d?d+" d "+h+" h":h?h+" h "+m+" min":m+" min"}
function saLoad(){
  if(!$("saBox").children.length)$("saBox").innerHTML='<div class="sk skb" style="height:110px"></div>'.repeat(6);
  segAdmLoad();
  jf("GET","/api/saude").then(function(x){
    if(!x.ok){$("saBox").innerHTML='<p class="lead">Não foi possível carregar.</p>';return}
    var d=x.d,pr=[],tile=function(cls,t,v,sm){return '<div class="sc '+cls+'"><h3>'+t+'</h3><strong>'+v+'</strong><small>'+sm+'</small></div>'};
    var ub=d.backups.ultimo,idade=null;if(ub){idade=(Date.now()-new Date(ub.quando.replace(" ","T")).getTime())/1000}
    var bcl=!ub?"bad":idade>36*3600?"warn":"ok";if(!ub)pr.push("Nenhum backup encontrado. Use Administração → Backups para criar um.");else if(idade>36*3600)pr.push("O último backup tem mais de 36 horas.");
    var pc=d.disco.total?d.disco.livre/d.disco.total:1,dcl=pc<.05||d.disco.livre<1e9?"bad":pc<.1?"warn":"ok";if(dcl!=="ok")pr.push("Pouco espaço livre em disco ("+bytesTxt(d.disco.livre)+").");
    var icl=d.banco.integridade==="ok"?"ok":"bad";if(icl!=="ok")pr.push("O banco de dados acusou problema de integridade: "+d.banco.integridade);
    if(!d.servidor.https)pr.push("HTTPS está desligado: a senha trafega sem criptografia na rede interna.");
    $("saAlert").innerHTML=pr.length?'<div class="alrt w">Pontos de atenção<ul>'+pr.map(function(t){return '<li>'+esc(t)+'</li>'}).join("")+'</ul></div>':'<div class="alrt">✓ Tudo certo com o sistema.</div>';
    $("saBox").innerHTML=
      tile(icl,"Banco de dados",bytesTxt(d.banco.tamanho),(icl==="ok"?"Íntegro":"Atenção")+" · "+d.contagens.atividades+" atividades · "+d.contagens.usuarios+" usuários · "+d.contagens.historico+" registros de histórico")+
      tile(bcl,"Último backup",ub?esc(agoTxt(ub.quando)):"Nenhum",ub?esc(ub.arquivo)+" · "+bytesTxt(ub.tamanho)+" · há "+durTxt(idade)+" · "+d.backups.total+" guardados (máx. "+d.backups.manter+")":"Pasta: "+esc(d.backups.pasta))+
      tile("ok","Online agora",String(d.online.length),d.online.length?d.online.map(function(o){return esc(o.nome)}).join(", "):"Ninguém ativo nos últimos 5 minutos")+
      tile("ok","Ativos em 24 horas",String(d.ativos24h),"usuários que entraram")+
      tile(dcl,"Espaço em disco",bytesTxt(d.disco.livre),"livres de "+bytesTxt(d.disco.total)+" ("+Math.round(pc*100)+"%)")+
      tile(d.servidor.https?"ok":"warn","Servidor",d.servidor.https?"HTTPS":"HTTP","Ligado há "+durTxt(d.servidor.uptime_s)+" · Python "+esc(d.servidor.python)+" · sessão expira em "+(d.servidor.sessao_min||"nunca")+(d.servidor.sessao_min?" min":"")+" · "+esc(d.servidor.host)+":"+d.servidor.porta)});
  jf("GET","/api/acessos").then(function(x){
    if(!x.ok){$("acTab").innerHTML="";return}
    $("acTab").innerHTML='<thead><tr><th>Quando</th><th>Usuário</th><th>Resultado</th><th>Aparelho</th><th>IP</th></tr></thead><tbody>'+
      x.d.map(function(a){return '<tr><td>'+esc(agoTxt(a.quando))+'</td><td>'+esc(a.usuario||"—")+'</td><td style="color:var(--'+(a.ok?"done":"danger")+');font-weight:700">'+(a.ok?"✔ Entrou":"✖ Falhou")+'</td><td>'+esc(a.agente)+'</td><td>'+esc(a.ip)+'</td></tr>'}).join("")+(x.d.length?"":'<tr><td colspan="5" style="text-align:center;color:var(--muted)">Sem registros ainda.</td></tr>')+'</tbody>'})}
function segAdmLoad(){
  jf("GET","/api/seguranca").then(function(x){if(!x.ok)return;var d=x.d;
    $("bSeg").hidden=!d.nao_lidos;$("bSeg").textContent=d.nao_lidos;
    var h="";
    if(d.admins_sem_2fa.length)h+='<div class="alrt w">Administradores sem verificação em duas etapas: '+d.admins_sem_2fa.map(function(a){return esc(a.nome)}).join(", ")+'. Cada um pode ativar em “Segurança da conta”.</div>';
    h+=d.bloqueadas.length?'<h3 style="margin:8px 0 4px;font-size:15px">Contas bloqueadas agora</h3>'+d.bloqueadas.map(function(b){return '<div class="sgs"><div><b>'+esc(b.nome)+'</b><small>@'+esc(b.usuario)+' · libera sozinha em '+Math.max(1,Math.ceil(b.ate_s/60))+' min</small></div><button class="btn sm" data-unl="'+b.id+'" type="button">Desbloquear</button></div>'}).join(""):'<p class="lead" style="margin:6px 0">Nenhuma conta bloqueada.</p>';
    h+='<h3 style="margin:14px 0 4px;font-size:15px">Avisos de segurança</h3>'+(d.avisos.length?'<div>'+d.avisos.map(function(a){return '<div class="sgs"><div><b'+(a.lido?' style="font-weight:400"':'')+'>'+esc(a.texto)+'</b><small>'+esc(agoTxt(a.quando))+'</small></div>'+(a.lido?'':'<span class="bdg pen">novo</span>')+'</div>'}).join("")+'</div>'+(d.nao_lidos?'<div class="rf" style="margin-top:8px"><button class="btn sm" id="segRead" type="button">Marcar todos como lidos</button></div>':''):'<p class="lead" style="margin:6px 0">Nenhum aviso.</p>');
    h+='<p class="lead" style="margin:12px 0 0;font-size:13px">Regra: após 5 senhas ou códigos errados seguidos a conta fica bloqueada por 15 minutos e este painel recebe um aviso.</p>';
    $("segAdm").innerHTML=h});
  jf("GET","/api/sessoes?todas=1").then(function(x){if(!x.ok||!x.d.todas)return;
    $("sessTab").innerHTML='<thead><tr><th>Usuário</th><th>Aparelho</th><th>IP</th><th>Entrou</th><th>Última atividade</th><th></th></tr></thead><tbody>'+x.d.todas.map(function(s){return '<tr><td>'+esc(s.nome)+'</td><td>'+esc(s.agente)+'</td><td>'+esc(s.ip)+'</td><td>'+esc(agoTxt(s.criado))+'</td><td>'+esc(agoTxt(s.ultimo))+'</td><td>'+(s.atual?'<span class="bdg">esta sessão</span>':'<button class="btn sm" data-se="'+s.id+'" type="button">Encerrar</button>')+'</td></tr>'}).join("")+(x.d.todas.length?"":'<tr><td colspan="6" style="text-align:center;color:var(--muted)">Nenhuma sessão aberta.</td></tr>')+'</tbody>'})}
$("segAdm").addEventListener("click",function(e){var u=e.target.closest("[data-unl]");
  if(u)jf("POST","/api/usuarios/"+u.getAttribute("data-unl")+"/desbloquear").then(segAdmLoad);
  else if(e.target.closest("#segRead"))jf("POST","/api/seguranca/avisos/lidos").then(segAdmLoad)});
$("sessTab").addEventListener("click",function(e){var b=e.target.closest("[data-se]");if(b)jf("DELETE","/api/sessoes/"+b.getAttribute("data-se")).then(segAdmLoad)});
$("saRef").onclick=saLoad;
if(ME&&ME.admin&&ME.avisos){$("bSeg").hidden=false;$("bSeg").textContent=ME.avisos}
// ---- modo foco
var focoId=null,focoSkip=[];
function focoPick(){
  var cur=focoId&&findIt(focoId);if(cur&&cur.status!=="done")return cur;
  var run=findRun();if(run&&run.status!=="done"&&focoSkip.indexOf(run.id)<0){focoId=run.id;return run}
  var hoje=iso(new Date()),op=items.filter(function(i){return i.status!=="done"&&focoSkip.indexOf(i.id)<0});
  op.sort(function(a,b){return (a.status==="doing"?0:1)-(b.status==="doing"?0:1)||(a.date>hoje?1:0)-(b.date>hoje?1:0)||(b.pin?1:0)-(a.pin?1:0)||(a.date+(a.time||"99")).localeCompare(b.date+(b.time||"99"))});
  var c=op[0]||null;focoId=c?c.id:null;return c}
function focoRender(){
  var box=$("focoBox"),it=focoPick(),out='<button class="btn fx" id="fxOut" type="button">Sair do foco (Esc)</button>';
  if(!it){box.innerHTML=out+'<div style="padding-top:12vh"><h1>Tudo em dia 🎉</h1><p class="fd">Não há atividades abertas para trabalhar agora.</p><div class="fbt"><button class="btn dark" id="fxNew" type="button">＋ Nova atividade</button></div></div>';return}
  var sb=it.subs||[],sd=sb.filter(function(x){return x.d}).length,run=!!it.tstart,tot=(+it.spent||0)+(run?nowS()-it.tstart:0),di=dueInfo(it);
  var outros=items.filter(function(i){return i.status!=="done"&&i.id!==it.id}).sort(function(a,b){return (a.date+(a.time||"")).localeCompare(b.date+(b.time||""))}).slice(0,40);
  box.innerHTML=out+'<span class="tag fcat c-'+it.cat+'">'+it.cat+' · '+(CATS[it.cat]||it.cat)+'</span>'+
    '<h1>'+(it.pin?'★ ':'')+esc(it.title)+'</h1>'+(it.desc?'<p class="fd">'+esc(it.desc)+'</p>':'')+
    '<div class="tags" style="justify-content:center;margin:8px 0">'+(di?'<span class="due '+di.cls+'">⏰ '+di.txt+'</span>':'')+(it.who?'<span class="who"><em>'+esc(ini(it.who))+'</em>'+esc(it.who)+'</span>':'')+(it.anx?'<button class="anb" data-a="anx" type="button">📎 '+it.anx+' anexo'+(it.anx>1?'s':'')+'</button>':'')+'</div>'+
    '<div class="fbig'+(run?' run':'')+'" id="focoClk">'+clk(tot)+'</div>'+
    '<div class="fsub">'+(it.dur?'previsto '+it.dur+' min · ':'')+(run?'cronômetro rodando':'cronômetro parado')+'</div>'+
    '<div class="fbt"><button class="btn dark" id="fxTm" type="button">'+(run?'⏸ Pausar':'▶ '+(tot?'Retomar':'Iniciar'))+'</button><button class="btn" id="fxDone" type="button">✓ Concluir</button><button class="btn" id="fxSkip" type="button">Pular →</button><button class="btn" id="fxEdit" type="button">Editar</button></div>'+
    (sb.length?'<p class="fsub" style="margin-bottom:8px">Subtarefas · '+sd+' de '+sb.length+'</p><ul class="fsb">'+sb.map(function(x,k){return '<li class="'+(x.d?'d':'')+'" data-k="'+k+'"><button type="button" aria-label="Marcar">'+(x.d?'✓':'')+'</button><span>'+esc(x.t)+'</span></li>'}).join("")+'</ul>':'')+
    '<div class="fpick">Trocar de atividade: <select id="fxSel"><option value="">Escolher…</option>'+outros.map(function(i){return '<option value="'+i.id+'">'+esc(i.date.slice(8)+"/"+i.date.slice(5,7)+" "+(i.time||"")+" · "+i.title.slice(0,60))+'</option>'}).join("")+'</select></div>'}
$("focoBox").addEventListener("click",function(e){
  var it=focoId&&findIt(focoId),b=e.target.closest("button,li[data-k]");if(!b)return;
  if(b.id==="fxOut"){location.hash="#visao";return}
  if(b.id==="fxNew"){openDlg(null);return}
  if(!it)return;
  if(b.id==="fxTm")timerToggle(it);
  else if(b.id==="fxDone"){var id=it.id;undoable("Atividade concluída",[id],function(){setStatus(it,"done")});focoId=null;focoSkip=[];focoRender()}
  else if(b.id==="fxSkip"){focoSkip.push(it.id);focoId=null;focoRender()}
  else if(b.id==="fxEdit"||b.getAttribute("data-a")==="anx")openDlg(it);
  else if(b.hasAttribute("data-k")||b.parentNode.hasAttribute("data-k")){var li=b.hasAttribute("data-k")?b:b.parentNode,k=+li.getAttribute("data-k");if(it.subs[k]){it.subs[k].d=!it.subs[k].d;save();render()}}});
$("focoBox").addEventListener("change",function(e){if(e.target.id==="fxSel"&&e.target.value){focoId=e.target.value;focoSkip=[];focoRender()}});
setInterval(function(){if(view!=="foco")return;var it=focoId&&findIt(focoId),c=$("focoClk");if(it&&c&&it.tstart)c.textContent=clk((+it.spent||0)+nowS()-it.tstart)},1000);
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&view==="foco"&&!document.querySelector("dialog[open]"))location.hash="#visao"});
// ---- seguranca da conta
var sgForced=false;
function sgErr(t){var e=$("sgErr");if(e)e.textContent=t||""}
function sgRender(){
  var t=ME.totp;
  $("sgTotp").innerHTML=t?'<div class="sgbox"><b style="color:var(--done)">✓ Ativada.</b> Ao entrar, além da senha, será pedido o código do aplicativo autenticador.<div class="rf" style="margin-top:10px"><button class="btn sm danger" type="button" id="sg2Off">Desativar…</button></div><div id="sgForm"></div></div>':
    '<div class="sgbox">Pede um código de 6 dígitos, gerado no celular (Google Authenticator, Microsoft Authenticator, Authy…), além da senha. '+(ME.admin?'<b>Recomendado para administradores.</b> ':'')+'<div class="rf" style="margin-top:10px"><button class="btn dark sm" type="button" id="sg2On">Ativar…</button></div><div id="sgForm"></div></div>';
  sgSess()}
function sgSess(){jf("GET","/api/sessoes").then(function(x){if(!x.ok)return;var l=x.d.minhas;
  $("sgSess").innerHTML='<div class="sgbox">'+l.map(function(s){return '<div class="sgs"><div><b>'+esc(s.agente)+(s.atual?' <span class="bdg">esta sessão</span>':'')+'</b><small>'+esc(s.ip)+' · entrou '+esc(agoTxt(s.criado))+' · ativa '+esc(agoTxt(s.ultimo))+'</small></div>'+(s.atual?'':'<button class="btn sm" data-se="'+s.id+'" type="button">Encerrar</button>')+'</div>'}).join("")+(l.length>1?'<div class="rf" style="margin-top:8px"><button class="btn sm" id="sgAll" type="button">Encerrar todas as outras</button></div>':'')+'</div>'})}
$("sgSess").addEventListener("click",function(e){var b=e.target.closest("[data-se]");
  if(b)jf("DELETE","/api/sessoes/"+b.getAttribute("data-se")).then(sgSess);
  else if(e.target.closest("#sgAll"))jf("POST","/api/sessoes/encerrar-outras").then(function(x){toast((x.d.encerradas||0)+" sessão(ões) encerrada(s).",{ms:3000});sgSess()})});
$("sgTotp").addEventListener("click",function(e){var id=(e.target.closest("button")||{}).id,f=$("sgForm");if(!id)return;
  if(id==="sg2On"){f.innerHTML='<div style="margin-top:12px"><label for="sgPw">Confirme sua senha</label><input type="password" id="sgPw" autocomplete="current-password"><p id="sgErr" role="alert" style="color:var(--danger);margin:6px 0 0;min-height:1em"></p><div class="rf"><button class="btn dark sm" type="button" id="sgGo1">Continuar</button></div></div>';$("sgPw").focus()}
  else if(id==="sgGo1"){jf("POST","/api/2fa/iniciar",{senha:$("sgPw").value}).then(function(x){if(!x.ok){sgErr(x.d.erro||"Não foi possível iniciar.");return}
    var svg="";try{var q=qrcode(0,"M");q.addData(x.d.uri);q.make();svg=q.createSvgTag({cellSize:4,margin:2,scalable:true})}catch(er){svg=""}
    f.innerHTML='<div class="sgqr" style="margin-top:12px">'+svg+'<div style="flex:1;min-width:200px"><p style="margin:0 0 6px">1. No aplicativo autenticador, adicione uma conta e escaneie o código ao lado.<br>Sem câmera? Digite esta chave:</p><code class="sgcod">'+esc(x.d.segredo.replace(/(.{4})/g,"$1 ").trim())+'</code><label for="sgCod" style="margin-top:10px;display:block">2. Digite o código de 6 dígitos que o aplicativo mostrar</label><input id="sgCod" inputmode="numeric" maxlength="6" autocomplete="one-time-code" style="max-width:160px"><p id="sgErr" role="alert" style="color:var(--danger);margin:6px 0 0;min-height:1em"></p><button class="btn dark sm" type="button" id="sgAtv">Confirmar e ativar</button></div></div>';$("sgCod").focus()})}
  else if(id==="sgAtv"){jf("POST","/api/2fa/ativar",{codigo:$("sgCod").value}).then(function(x){if(!x.ok){sgErr(x.d.erro||"Código incorreto.");return}
    ME.totp=true;sgForced=false;$("sgClose").hidden=false;
    $("sgTotp").innerHTML='<div class="alrt w"><b>Guarde os códigos de recuperação.</b> Cada um vale uma vez e substitui o código do aplicativo se você perder o celular. Eles não serão mostrados de novo.<div class="sgrec">'+x.d.codigos.map(function(c){return '<code>'+esc(c)+'</code>'}).join("")+'</div><div class="rf"><button class="btn sm" type="button" id="sgCp" data-v="'+esc(x.d.codigos.join("\n"))+'">Copiar códigos</button><button class="btn dark sm" type="button" id="sgOk">Já guardei</button></div></div>'})}
  else if(id==="sgCp"){var b=e.target.closest("button");copia(b.getAttribute("data-v")).then(function(){b.textContent="Copiado!"})}
  else if(id==="sgOk"){sgRender()}
  else if(id==="sg2Off"){f.innerHTML='<div style="margin-top:12px"><label for="sgPw">Sua senha</label><input type="password" id="sgPw" autocomplete="current-password"><label for="sgCod" style="margin-top:8px;display:block">Código do aplicativo (ou de recuperação)</label><input id="sgCod" maxlength="20" autocomplete="one-time-code"><p id="sgErr" role="alert" style="color:var(--danger);margin:6px 0 0;min-height:1em"></p><div class="rf"><button class="btn danger sm" type="button" id="sgGo2">Desativar agora</button></div></div>';$("sgPw").focus()}
  else if(id==="sgGo2"){jf("POST","/api/2fa/desativar",{senha:$("sgPw").value,codigo:$("sgCod").value}).then(function(x){if(!x.ok){sgErr(x.d.erro||"Não foi possível desativar.");return}ME.totp=false;sgRender();toast("Verificação em duas etapas desativada.",{ms:3500})})}});
function sgOpen(note){$("sgNote").textContent=note||"";sgRender();if(!$("segDlg").open)$("segDlg").showModal();if(window.innerWidth<=860)document.body.classList.add("nomenu")}
$("segBtn").onclick=function(){sgOpen("")};$("sgClose").onclick=function(){$("segDlg").close()};
window.sgForce=function(){if(sgForced||(ME&&ME.totp))return;sgForced=true;$("sgClose").hidden=true;sgOpen("O administrador exige a verificação em duas etapas para contas de administrador. Configure para continuar.")};
$("segDlg").addEventListener("cancel",function(e){if(sgForced)e.preventDefault()});
if(ME&&ME.exigir_2fa&&ME.admin&&!ME.totp)setTimeout(window.sgForce,400);
// ---- sobre e atualizacao
function umData(){var e=document.getElementById("uMData");if(e)e.textContent=new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})}
umData();setInterval(umData,600000);
function crtLoad(){jf("GET","/api/certificado").then(function(x){if(!x.ok)return;var d=x.d;$("crtBox").hidden=!d.https;if(!d.https)return;
  $("crtInfo").textContent=(d.ca?"Autoridade válida até "+d.ca.ate+". ":"Autoridade ainda não criada: reinicie o serviço. ")+(d.servidor?"Certificado do servidor válido até "+d.servidor.ate+" (renovado sozinho).":"")})}
function sbLoad(){crtLoad();jf("GET","/api/versao").then(function(x){if(!x.ok)return;var d=x.d;
  $("sbVer").innerHTML='<div class="sg"><div class="sc ok"><h3>Versão em uso</h3><strong>'+esc(d.versao)+'</strong><small>Python '+esc(d.python)+'</small></div>'+(d.reiniciar?'<div class="sc warn"><h3>Reinício pendente</h3><strong>'+esc(d.em_disco)+'</strong><small>A nova versão já está nos arquivos. Feche a janela do iniciar.bat e abra de novo.</small></div>':'')+'<div class="sc ok"><h3>Pasta do sistema</h3><small style="word-break:break-all">'+esc(d.pasta)+'</small></div></div>'+
    (d.anterior?'<div class="alrt w" style="margin-top:12px">A versão <b>'+esc(d.anterior.versao)+'</b> foi guardada antes da atualização para '+esc(d.anterior.substituida_por)+(d.anterior.quando?" ("+esc(d.anterior.quando)+")":"")+'. Se algo deu errado, dá para voltar. <button class="btn sm" type="button" id="sbUndo" style="margin-left:6px">Voltar para a '+esc(d.anterior.versao)+'</button></div>':'');
  if(d.anterior)$("sbUndo").onclick=function(){if(!confirm("Voltar o sistema para a versão "+d.anterior.versao+"?\n\nSó os arquivos do programa voltam; atividades, usuários e anexos não são alterados. Depois será preciso reiniciar o iniciar.bat."))return;var bt=this;bt.disabled=true;
    jf("POST","/api/atualizar/desfazer").then(function(y){if(!y.ok){bt.disabled=false;alert(y.d.erro||"Não foi possível desfazer.");return}
      $("upRes").innerHTML='<div class="alrt">✓ Código de volta à versão '+esc(y.d.versao)+' ('+y.d.arquivos+' arquivos restaurados). Para concluir: feche a janela do iniciar.bat, abra de novo e use Ctrl+F5 no navegador.</div>';sbLoad()})};
  $("sbLog").innerHTML=d.changelog.map(function(c){return '<div class="clg"><h4>Versão '+esc(c.versao)+(c.data?" · "+esc(c.data):"")+(c.titulo?" — "+esc(c.titulo):"")+'</h4><ul>'+(c.itens||[]).map(function(i){return '<li>'+esc(i)+'</li>'}).join("")+'</ul></div>'}).join("")})}
$("upGo").onclick=function(){var f=$("upFile").files[0],r=$("upRes");if(!f){r.innerHTML='<p class="lead" style="margin:0">Escolha o arquivo .zip da nova versão.</p>';return}
  r.textContent="Verificando o pacote…";
  fetch("/api/atualizar/analisar",{method:"POST",credentials:"same-origin",headers:{"X-Requested-With":"fetch","Content-Type":"application/octet-stream"},body:f}).then(function(q){return q.json().catch(function(){return{}}).then(function(d){return{ok:q.ok,d:d}})}).then(function(x){
    if(!x.ok){r.innerHTML='<div class="alrt w">'+esc(x.d.erro||"Não foi possível verificar o pacote.")+'</div>';return}
    var d=x.d,msg=d.comparacao>0?"Versão mais nova encontrada":d.comparacao===0?"É a mesma versão já instalada":"Este pacote é mais antigo que a versão instalada";
    r.innerHTML='<div class="alrt'+(d.comparacao>0?"":" w")+'">'+msg+': '+esc(d.atual)+' → <b>'+esc(d.nova)+'</b> · '+d.arquivos+' arquivos</div>'+
      (d.mudancas.length?d.mudancas.map(function(c){return '<div class="clg"><h4>Versão '+esc(c.versao)+(c.titulo?" — "+esc(c.titulo):"")+'</h4><ul>'+(c.itens||[]).map(function(i){return '<li>'+esc(i)+'</li>'}).join("")+'</ul></div>'}).join(""):'<p class="lead">O pacote não traz novidades além da versão instalada.</p>')+
      '<div class="rf"><button class="btn dark" type="button" id="upApply">'+(d.comparacao>0?"Aplicar atualização":"Aplicar mesmo assim")+'</button></div>';
    $("upApply").onclick=function(){if(d.comparacao<=0&&!confirm("A versão do pacote não é mais nova que a instalada. Aplicar mesmo assim?"))return;var bt=this;bt.disabled=true;
      jf("POST","/api/atualizar/aplicar",{token:d.token}).then(function(y){if(!y.ok){r.innerHTML='<div class="alrt w">'+esc(y.d.erro||"Falha ao atualizar.")+'</div>';return}
        r.innerHTML='<div class="alrt">✓ Atualizado para '+esc(y.d.versao)+' ('+y.d.arquivos+' arquivos). '+(y.d.backup?"Um backup foi feito antes. ":"")+'Para concluir: feche a janela do iniciar.bat, abra de novo e use Ctrl+F5 no navegador.</div>';sbLoad()})}})};
// ponte para os modulos separados (graficos.js, telas.js): acesso as funcoes internas
window.SUP={ME:ME,CATS:CATS,ST:ST,esc:esc,fm:fm,br:br,iso:iso,jf:jf,whenSaved:whenSaved,findIt:findIt,openDlg:openDlg,row:row,
  toast:toast,dl:dl,csvOf:csvOf,undoable:undoable,setStatus:setStatus,render:render,save:save,dueInfo:dueInfo,lateOf:lateOf,
  items:function(){return items},setItems:function(l){items=l},view:function(){return view},emptyHtml:emptyHtml,uid:uid,nz:nz,clone:clone,
  closeMenus:closeMenus,toggleTheme:toggleTheme,setView:setView,dayItems:dayItems,onAct:onAct,dgOpen:function(it){dgOpen(it)},
  hooks:[],lateOf2:lateOf,flush:function(){flush()},snap:function(){return snap},setSnap:function(x){snap=x},mk:mk,stopTimer:stopTimer,flashRow:flashRow,lembTick:function(){lembTick()}};
// init
$("fc").innerHTML='<option value="">Todas as categorias</option>'+Object.keys(CATS).map(function(k){return '<option value="'+k+'">'+CATS[k]+'</option>'}).join("");
$("fCat").innerHTML=Object.keys(CATS).map(function(k){return '<option value="'+k+'">'+CATS[k]+'</option>'}).join("");
window.addEventListener("hashchange",setView);
load();offSet(OFF);$("day").value=iso(new Date());setView();render();notifUpdate();if(ME)metaFetch();startUp();setTimeout(dgAvisa,1500);
})();
