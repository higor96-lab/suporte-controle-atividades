// Telas (v3.3): menu por secoes com abas, menu do usuario, paleta de comandos (Ctrl+K),
// edicao em lote e linha do tempo do dia.
(function(){
"use strict";
var S=window.SUP;if(!S)return;
var $=function(i){return document.getElementById(i)},esc=S.esc,fm=S.fm,iso=S.iso;
function qa(s,el){return Array.prototype.slice.call((el||document).querySelectorAll(s))}
function lget(k,d){try{var v=localStorage.getItem(k);return v===null?d:v}catch(e){return d}}
function lset(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function nrm(t){return String(t||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase()}
var ME=S.ME||{};

// ================= secoes e abas =================
var SEC=[
  {id:"hoje",nome:"Hoje",views:[["visao","Visão do dia"]]},
  {id:"atv",nome:"Atividades",views:[["atividades","Lista"],["agenda","Calendário"],["quadro","Quadro"],["foco","Foco"],["busca","Busca"],["historico","Concluídas"],["importar","Importar"]]},
  {id:"rel",nome:"Relatórios",views:[["relatorios","Relatório"],["graficos","Gráficos"],["alteracoes","Alterações"]]},
  {id:"eq",nome:"Equipe",views:[["equipe","Painel da equipe"]],req:"equipe"},
  {id:"adm",nome:"Administração",views:[["usuarios","Usuários"],["backups","Backups"],["sistema","Saúde e acessos"],["sobre","Sobre e atualização"]],req:"admin"}];
function pode(s){return !s.req||!!ME[s.req]}
function secDe(v){for(var i=0;i<SEC.length;i++)for(var j=0;j<SEC[i].views.length;j++)if(SEC[i].views[j][0]===v)return SEC[i];return SEC[0]}
function syncNav(){
  var v=S.view(),s=secDe(v);
  qa("#nav a[data-sec]").forEach(function(a){if(a.getAttribute("data-sec")===s.id)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")});
  var st=$("subtabs");
  if(s.views.length>1){st.innerHTML=s.views.map(function(x){return '<a href="#'+x[0]+'"'+(x[0]===v?' aria-current="page"':'')+'>'+esc(x[1])+'</a>'}).join("");st.hidden=false;$("crumbW").hidden=true}
  else{st.hidden=true;$("crumbW").hidden=false}}
window.addEventListener("hashchange",function(){setTimeout(syncNav,0)});
syncNav();

// ================= menu do usuario =================
var um=$("uMenu"),ub=$("uBtn");
if(ME.nome){var p=String(ME.nome).trim().split(/\s+/);$("uAv").textContent=((p[0]||"?")[0]+(p.length>1?p[p.length-1][0]:"")).toUpperCase();
  $("uMNome").textContent=ME.nome;$("uMCargo").textContent=(ME.cargo?ME.cargo+" · ":"")+({admin:"Administrador",supervisor:"Supervisor"}[ME.perfil]||"Usuário")}
function umFechar(){um.hidden=true;ub.setAttribute("aria-expanded","false")}
ub.onclick=function(e){e.stopPropagation();var abrir=um.hidden;S.closeMenus();um.hidden=!abrir;ub.setAttribute("aria-expanded",String(abrir));if(abrir){var f=um.querySelector("button");if(f)f.focus()}};
um.addEventListener("click",function(e){var b=e.target.closest("[data-um]");if(!b)return;umFechar();var k=b.getAttribute("data-um");
  if(k==="ap")$("apBtn").click();else if(k==="seg")$("segBtn").click();else if(k==="senha")$("cfg").click();
  else if(k==="cel")$("mobHelp").click();else if(k==="atalhos")$("kdlg").showModal();else if(k==="sair")$("logout").click()});
um.addEventListener("keydown",function(e){var it=qa("button",um),i=it.indexOf(document.activeElement);
  if(e.key==="ArrowDown"){e.preventDefault();it[(i+1)%it.length].focus()}else if(e.key==="ArrowUp"){e.preventDefault();it[(i-1+it.length)%it.length].focus()}
  else if(e.key==="Escape"){umFechar();ub.focus()}});
document.addEventListener("click",function(e){if(!um.hidden&&!um.contains(e.target))umFechar()});

// ================= paleta de comandos (Ctrl+K) =================
var cmdk=$("cmdk"),cq=$("cmdQ"),cl=$("cmdL"),cres=[],csel=0;
function ir(h){return function(){location.hash=h}}
function comandos(){
  var c=[];
  SEC.forEach(function(s){if(!pode(s))return;s.views.forEach(function(v){c.push({t:v[1],s:s.nome,ic:"→",kw:"ir abrir tela "+v[0],run:ir("#"+v[0])})})});
  c.push({t:"Nova atividade",s:"Ação",ic:"＋",kw:"criar adicionar nova",run:function(){S.openDlg(null)}});
  c.push({t:"Alternar modo claro/escuro",s:"Ação",ic:"◐",kw:"tema escuro claro dark",run:S.toggleTheme});
  c.push({t:"Aparência e preferências",s:"Conta",ic:"✎",kw:"cor fonte densidade lembretes",run:function(){$("apBtn").click()}});
  c.push({t:"Segurança da conta",s:"Conta",ic:"🔒",kw:"2fa duas etapas sessoes",run:function(){$("segBtn").click()}});
  c.push({t:"Alterar senha",s:"Conta",ic:"🔑",kw:"senha trocar",run:function(){$("cfg").click()}});
  c.push({t:"Exportar atividades (CSV)",s:"Ação",ic:"⤓",kw:"exportar csv planilha baixar",run:function(){$("exp").click()}});
  c.push({t:"Ver atrasadas",s:"Atividades",ic:"!",kw:"atrasadas vencidas prazo",run:function(){$("lkLate").click();location.hash="#atividades"}});
  c.push({t:"Atalhos de teclado",s:"Ajuda",ic:"?",kw:"teclado atalhos ajuda",run:function(){$("kdlg").showModal()}});
  c.push({t:"Sair do sistema",s:"Conta",ic:"⏻",kw:"logout sair",run:function(){$("logout").click()}});
  return c}
function cmdListar(){
  var toks=nrm(cq.value).split(/\s+/).filter(Boolean),out=[];
  function casa(h){h=nrm(h);for(var i=0;i<toks.length;i++)if(h.indexOf(toks[i])<0)return false;return true}
  var cs=comandos().filter(function(c){return casa(c.t+" "+c.s+" "+c.kw)});
  if(toks.length){
    var at=S.items().filter(function(i){return casa(i.title+" "+i.desc+" "+i.who+" "+(i.tags||[]).join(" ")+" "+(S.CATS[i.cat]||""))})
      .sort(function(a,b){return (b.date+(b.time||"")).localeCompare(a.date+(a.time||""))}).slice(0,8);
    cs=cs.slice(0,6);
    if(at.length){out.push({grp:"Atividades"});at.forEach(function(i){out.push({t:i.title,s:S.br(i.date)+(i.time?" "+i.time:"")+" · "+S.ST[i.status]+(i.who?" · "+i.who:""),ic:"▤",run:function(){S.openDlg(S.findIt(i.id))}})})}
    if(cs.length){out.push({grp:"Telas e ações"});out=out.concat(cs)}
    out.push({grp:""});out.push({t:"Buscar “"+cq.value.trim()+"” na Busca geral",s:"Busca",ic:"⌕",run:function(){location.hash="#busca";setTimeout(function(){$("bsQ").value=cq.value.trim();$("bsQ").dispatchEvent(new Event("input"))},50)}});
  }else{out.push({grp:"Telas e ações"});out=out.concat(cs)}
  cres=out.filter(function(x){return !x.grp});csel=Math.min(csel,cres.length-1);if(csel<0)csel=0;var k=-1;
  cl.innerHTML=out.map(function(x){if(x.grp!==undefined)return x.grp?'<li class="cg" role="presentation">'+esc(x.grp)+'</li>':'';k++;
    return '<li role="option" id="cmo'+k+'" data-k="'+k+'" aria-selected="'+(k===csel)+'"><span class="ci" aria-hidden="true">'+esc(x.ic)+'</span><span class="ct"><b>'+esc(x.t)+'</b><small>'+esc(x.s)+'</small></span></li>'}).join("")||'<li class="cg">Nada encontrado.</li>';
  cq.setAttribute("aria-activedescendant","cmo"+csel)}
function cmdMarca(){qa("li[data-k]",cl).forEach(function(li){var on=+li.getAttribute("data-k")===csel;li.setAttribute("aria-selected",String(on));if(on)li.scrollIntoView({block:"nearest"})});cq.setAttribute("aria-activedescendant","cmo"+csel)}
function cmdRun(k){var c=cres[k];if(!c)return;cmdk.close();setTimeout(c.run,0)}
function cmdAbrir(){if(cmdk.open)return;umFechar();cq.value="";csel=0;cmdListar();cmdk.showModal();cq.focus()}
cq.addEventListener("input",function(){csel=0;cmdListar()});
cq.addEventListener("keydown",function(e){
  if(e.key==="ArrowDown"){e.preventDefault();csel=(csel+1)%Math.max(1,cres.length);cmdMarca()}
  else if(e.key==="ArrowUp"){e.preventDefault();csel=(csel-1+cres.length)%Math.max(1,cres.length);cmdMarca()}
  else if(e.key==="Enter"){e.preventDefault();cmdRun(csel)}});
cl.addEventListener("click",function(e){var li=e.target.closest("li[data-k]");if(li)cmdRun(+li.getAttribute("data-k"))});
cl.addEventListener("mousemove",function(e){var li=e.target.closest("li[data-k]");if(li&&+li.getAttribute("data-k")!==csel){csel=+li.getAttribute("data-k");cmdMarca()}});
cmdk.addEventListener("click",function(e){if(e.target===cmdk)cmdk.close()});
$("cmdBtn").onclick=cmdAbrir;
document.addEventListener("keydown",function(e){
  if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&(e.key==="k"||e.key==="K")){
    if(document.body.classList.contains("locked"))return;
    var aberto=document.querySelector("dialog[open]");if(aberto&&aberto!==cmdk)return;
    e.preventDefault();if(cmdk.open)cmdk.close();else cmdAbrir()}});

// ================= edicao em lote =================
var modo=null,sel={},lote=$("lote");
$("loteCat").innerHTML='<option value="">—</option>'+Object.keys(S.CATS).map(function(k){return '<option value="'+k+'">'+esc(S.CATS[k])+'</option>'}).join("");
function selIds(){return Object.keys(sel).filter(function(k){return sel[k]&&S.findIt(k)})}
function marcar(){
  qa("li.row.sel").forEach(function(li){li.classList.remove("sel");li.removeAttribute("aria-selected")});
  if(modo)qa("#"+modo+" li.row").forEach(function(li){var on=!!sel[li.getAttribute("data-id")];li.classList.toggle("sel",on);li.setAttribute("aria-selected",String(on))});
  var n=selIds().length;$("loteN").textContent=n+(n===1?" selecionada":" selecionadas");
  qa("#lote [data-lt]").forEach(function(b){var k=b.getAttribute("data-lt");if(k!=="todas"&&k!=="sair")b.disabled=!n});
  ["loteData","loteCat","lotePr"].forEach(function(i){$(i).disabled=!n})}
function loteEntrar(cid){if(modo===cid){loteSair();return}loteSair();modo=cid;document.body.classList.add("selmode");lote.hidden=false;
  qa('[data-selm="'+cid+'"]').forEach(function(b){b.textContent="Cancelar seleção";b.setAttribute("aria-pressed","true")});marcar()}
function loteSair(){modo=null;sel={};document.body.classList.remove("selmode");lote.hidden=true;$("loteData").value="";$("loteCat").value="";$("lotePr").value="";
  qa("[data-selm]").forEach(function(b){b.textContent="Selecionar";b.setAttribute("aria-pressed","false")});marcar()}
document.addEventListener("click",function(e){var b=e.target.closest("[data-selm]");if(b){e.preventDefault();loteEntrar(b.getAttribute("data-selm"))}});
// no modo selecao, clicar na linha seleciona (em vez de abrir/concluir)
document.addEventListener("click",function(e){if(!modo)return;var li=e.target.closest("#"+modo+" li.row");if(!li)return;
  e.preventDefault();e.stopPropagation();var id=li.getAttribute("data-id");sel[id]=!sel[id];marcar()},true);
function aplicar(rot,fn){var ids=selIds();if(!ids.length)return;S.undoable(rot.replace("N",ids.length),ids,function(){ids.forEach(function(id){var it=S.findIt(id);if(it)fn(it)})});loteSair()}
lote.addEventListener("click",function(e){var b=e.target.closest("[data-lt]");if(!b)return;var k=b.getAttribute("data-lt");
  if(k==="sair")loteSair();
  else if(k==="todas"){qa("#"+modo+" li.row").forEach(function(li){sel[li.getAttribute("data-id")]=true});marcar()}
  else if(k==="done")aplicar("N atividade(s) concluída(s)",function(it){S.setStatus(it,"done")});
  else if(k==="todo")aplicar("N atividade(s) reaberta(s)",function(it){S.setStatus(it,"todo")});
  else if(k==="del"){var ids=selIds();if(!ids.length||!confirm("Excluir "+ids.length+" atividade(s)? Dá para desfazer logo em seguida."))return;
    var set={};ids.forEach(function(i){set[i]=1});S.undoable(ids.length+" atividade(s) excluída(s)",ids,function(){S.setItems(S.items().filter(function(x){return !set[x.id]}))});loteSair()}});
$("loteData").addEventListener("change",function(){var v=this.value;if(v)aplicar("N atividade(s) movida(s) para "+S.br(v),function(it){it.date=v})});
$("loteCat").addEventListener("change",function(){var v=this.value;if(v)aplicar("Tipo alterado em N atividade(s)",function(it){it.cat=v})});
$("lotePr").addEventListener("change",function(){var v=this.value;if(v)aplicar("Prioridade alterada em N atividade(s)",function(it){it.prio=v})});
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&modo&&!document.querySelector("dialog[open]"))loteSair()});
window.addEventListener("hashchange",function(){if(modo)loteSair()});
// as listas sao redesenhadas a cada mudanca: reaplica a marcacao
var mo=new MutationObserver(function(){if(modo)marcar()});["list","all","bsRes"].forEach(function(i){if($(i))mo.observe($(i),{childList:true})});

// ================= linha do tempo do dia =================
var PX=1.15; // pixels por minuto
function hm(m){return ("0"+Math.floor(m/60)).slice(-2)+":"+("0"+m%60).slice(-2)}
function mins(t){var p=String(t||"").split(":");return +p[0]*60+(+p[1]||0)}
function setModo(m){lset("vmode",m);qa("#vMode button").forEach(function(b){b.setAttribute("aria-pressed",String(b.getAttribute("data-m")===m))});
  $("list").hidden=m==="tempo";$("tl").hidden=m!=="tempo";if(m==="tempo")tlRender()}
$("vMode").addEventListener("click",function(e){var b=e.target.closest("button[data-m]");if(b)setModo(b.getAttribute("data-m"))});
function tlRender(){
  var box=$("tl");if(box.hidden)return;
  var d=$("day").value,hoje=iso(new Date()),l=S.dayItems(),com=l.filter(function(i){return i.time}),sem=l.filter(function(i){return !i.time});
  var ini=8*60,fim=18*60;com.forEach(function(i){var a=mins(i.time),b=a+Math.max(15,+i.dur||0);ini=Math.min(ini,Math.floor(a/60)*60);fim=Math.max(fim,Math.ceil(b/60)*60)});
  fim=Math.min(fim,24*60);var H=(fim-ini)*PX,h="";
  // eventos em colunas quando se sobrepoem
  var ev=com.map(function(i){var a=mins(i.time);return{i:i,a:a,b:a+Math.max(20,+i.dur||0)}}).sort(function(x,y){return x.a-y.a||y.b-x.b}),grupos=[],g=null;
  ev.forEach(function(e){if(!g||e.a>=g.fim){g={l:[],fim:e.b,lanes:[]};grupos.push(g)}g.fim=Math.max(g.fim,e.b);
    var k=0;while(g.lanes[k]!==undefined&&g.lanes[k]>e.a)k++;g.lanes[k]=e.b;e.lane=k;g.l.push(e)});
  grupos.forEach(function(g){g.l.forEach(function(e){e.n=g.lanes.length})});
  for(var m=ini;m<=fim;m+=60)h+='<div class="tlh" style="top:'+((m-ini)*PX)+'px"><span>'+hm(m)+'</span></div>';
  // horarios livres (>= 30 min) entre 8h e 18h, so do horario atual em diante quando for hoje
  var agoraM=d===hoje?new Date().getHours()*60+new Date().getMinutes():0,ocup=ev.map(function(e){return[e.a,e.b]}).sort(function(a,b){return a[0]-b[0]}),cur=Math.max(8*60,d===hoje?Math.ceil(agoraM/15)*15:0);
  if(d>=hoje){ocup.concat([[18*60,18*60]]).forEach(function(o){var a=cur,b=Math.min(o[0],18*60);if(b-a>=30)h+='<button type="button" class="tlfree" data-t="'+hm(a)+'" data-dur="'+Math.min(60,b-a)+'" style="top:'+((a-ini)*PX+2)+'px;height:'+((b-a)*PX-4)+'px"><span>Livre '+hm(a)+'–'+hm(b)+' · '+fm(b-a)+'</span><b>＋ criar aqui</b></button>';cur=Math.max(cur,o[1])})}
  ev.forEach(function(e){var i=e.i,alt=Math.max(26,(e.b-e.a)*PX-3),w=100/e.n;
    h+='<button type="button" class="tlev c-'+i.cat+' s-'+i.status+'" data-id="'+esc(i.id)+'" style="top:'+((e.a-ini)*PX+1)+'px;height:'+alt+'px;left:calc(64px + (100% - 70px) * '+(e.lane*w/100)+');width:calc((100% - 70px) * '+(w/100)+' - 4px)" title="'+esc(i.title)+'">'+
      '<b>'+(i.status==="done"?"✓ ":"")+esc(i.title)+'</b><small>'+i.time+'–'+hm(Math.min(e.b,24*60-1))+(i.who?" · "+esc(i.who):"")+'</small></button>'});
  if(d===hoje&&agoraM>=ini&&agoraM<=fim)h+='<div class="tlnow" style="top:'+((agoraM-ini)*PX)+'px"><i></i><span>'+hm(agoraM)+'</span></div>';
  box.innerHTML=(sem.length?'<div class="tlsem"><span>Sem horário:</span>'+sem.map(function(i){return '<button type="button" class="tlchip c-'+i.cat+' s-'+i.status+'" data-id="'+esc(i.id)+'">'+(i.status==="done"?"✓ ":"")+esc(i.title)+'</button>'}).join("")+'</div>':'')+
    (l.length||d>=hoje?'<div class="tlg" style="height:'+(H+8)+'px">'+h+'</div>':S.emptyHtml("dia","div"))+'<p class="tln">A linha do tempo mostra todas as atividades do dia (os filtros valem para a Lista). Clique num horário livre para criar uma atividade nele.</p>'}
$("tl").addEventListener("click",function(e){
  var f=e.target.closest(".tlfree");if(f){S.openDlg(null,$("day").value);$("fTime").value=f.getAttribute("data-t");$("fDur").value=f.getAttribute("data-dur");$("fTitle").focus();return}
  var b=e.target.closest("[data-id]");if(b){var it=S.findIt(b.getAttribute("data-id"));if(it)S.openDlg(it)}});
new MutationObserver(function(){if(!$("tl").hidden)tlRender()}).observe($("list"),{childList:true});
setInterval(function(){if(!$("tl").hidden&&!document.hidden)tlRender()},60000);
setModo(lget("vmode","lista"));

window.Telas={syncNav:syncNav,cmdAbrir:cmdAbrir,loteSair:loteSair,tlRender:tlRender};
})();
