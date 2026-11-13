// Graficos (v3.3): indicadores com comparacao, graficos SVG com dica ao passar o mouse, clique para ver as atividades,
// linha da meta, periodo anterior, novos graficos (solicitantes, estimativas), exportar PNG e modo apresentacao.
// Paleta validada (scripts do guia de dataviz) em static/css/graficos.css.
(function(){
"use strict";
var S=window.SUP;if(!S)return;
var $=function(i){return document.getElementById(i)},esc=S.esc,fm=S.fm,br=S.br,iso=S.iso;
var D=null,lastW=0,drillLista=[],drillEditou=false;
var DS=["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"],DSL=["segunda","terça","quarta","quinta","sexta","sábado","domingo"];
var SIT={cumprido:"No prazo",fora:"Fora do prazo",atrasada:"Atrasada",aberta:"Dentro do prazo",sem_data:"Concluída","":""};

// ---------- utilitarios
function cv(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()||"#888"}
function C(){return{g1:cv("--g1"),g2:cv("--g2"),ink:cv("--gInk"),ink2:cv("--gInk2"),mut:cv("--gMuted"),grid:cv("--gGrid"),axis:cv("--gAxis"),
  surf:cv("--gSurf"),neu:cv("--gNeutral"),good:cv("--gGood"),warn:cv("--gWarn"),crit:cv("--gCrit"),q:[1,2,3,4,5,6,7].map(function(i){return cv("--q"+i)})}}
function n0(v){return Math.round(v||0).toLocaleString("pt-BR")}
function dm(s){return s.slice(8,10)+"/"+s.slice(5,7)}
function wd(s){var p=s.split("-");return (new Date(+p[0],+p[1]-1,+p[2]).getDay()+6)%7}
function norm(t){return String(t||"").replace(/\s+/g," ").trim().toLowerCase()}
function nice(max){
  if(max<=5)return{top:Math.max(1,Math.ceil(max)),step:1};
  var raw=max/4,p=Math.pow(10,Math.floor(Math.log(raw)/Math.LN10)),f=raw/p,st=(f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*p;
  st=Math.max(1,Math.round(st));return{top:Math.ceil(max/st)*st,step:st}}
function hit(k,tip,x,y,w,h){return '<rect class="hit" data-k="'+esc(String(k))+'" data-tip="'+esc(tip)+'" tabindex="0" role="button" x="'+x+'" y="'+y+'" width="'+Math.max(1,w)+'" height="'+Math.max(1,h)+'" fill="transparent"/>'}
function colPath(x,y,w,h,r){if(h<=.5)return"";r=Math.min(r,w/2,h);return "M"+x+","+(y+h)+"V"+(y+r)+"Q"+x+","+y+" "+(x+r)+","+y+"H"+(x+w-r)+"Q"+(x+w)+","+y+" "+(x+w)+","+(y+r)+"V"+(y+h)+"Z"}
function barPath(x,y,w,h,r){if(w<=.5)return"";r=Math.min(r,h/2,w);return "M"+x+","+y+"H"+(x+w-r)+"Q"+(x+w)+","+y+" "+(x+w)+","+(y+r)+"V"+(y+h-r)+"Q"+(x+w)+","+(y+h)+" "+(x+w-r)+","+(y+h)+"H"+x+"Z"}
function txt(x,y,s,o){o=o||{};return '<text x="'+x+'" y="'+y+'" font-size="'+(o.fs||11.5)+'"'+(o.a?' text-anchor="'+o.a+'"':'')+(o.w?' font-weight="'+o.w+'"':'')+' fill="'+(o.c||C().mut)+'"'+(o.num?' style="font-variant-numeric:tabular-nums"':'')+'>'+esc(s)+'</text>'}
function svg(w,h,body,label){return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" role="img" aria-label="'+esc(label)+'" font-family="Open Sans, system-ui, sans-serif">'+body+'</svg>'}
function corta(s,max){s=String(s||"");return s.length>max?s.slice(0,max-1)+"…":s}
function legenda(c,itens,x,y){ // itens: [{t,cor,tipo:'q'|'l'}] -> desenha dentro do SVG (vai junto no PNG)
  var h="",cx=x;itens.forEach(function(i){
    h+=i.tipo==="l"?'<line x1="'+cx+'" x2="'+(cx+16)+'" y1="'+(y-4)+'" y2="'+(y-4)+'" stroke="'+i.cor+'" stroke-width="2" stroke-linecap="round"/>':'<rect x="'+cx+'" y="'+(y-10)+'" width="12" height="12" rx="3" fill="'+i.cor+'"/>';
    h+=txt(cx+(i.tipo==="l"?22:18),y,i.t,{c:c.ink2,fs:12});cx+=(i.tipo==="l"?22:18)+i.t.length*6.6+18});return h}
function vazio(el,msg){el.innerHTML='<p class="gempty">'+esc(msg)+'</p>';el._click=null}
function largura(el){return Math.max(260,Math.floor(el.clientWidth||el.parentNode.clientWidth||600))}

// ---------- graficos genericos
// colunas: o={val[],prev[]|null,meta,xlab(i),tip(i),click(i)|null,h,label,legend[]}
function colunas(el,o){
  var c=C(),W=largura(el),temLg=o.legend&&o.legend.length,H=(o.h||230)+(temLg?30:0),ml=38,mr=o.meta?66:10,mt=(temLg?44:20),mb=26,pw=W-ml-mr,ph=H-mt-mb,n=o.val.length;
  var mx=Math.max.apply(null,o.val.concat(o.prev||[]).concat([o.meta||0,1])),t=nice(mx),sy=function(v){return mt+ph-(v/t.top)*ph},b="";
  if(temLg)b+=legenda(c,o.legend,ml,16);
  for(var v=0;v<=t.top+1e-9;v+=t.step){var y=Math.round(sy(v))+.5;b+='<line x1="'+ml+'" x2="'+(W-mr)+'" y1="'+y+'" y2="'+y+'" stroke="'+(v===0?c.axis:c.grid)+'" stroke-width="1"/>'+txt(ml-8,y+4,n0(v),{a:"end",num:1})}
  var band=pw/n,bw=Math.max(2,Math.min(24,band*.62)),maxLab=Math.max(1,Math.floor(pw/46)),pas=Math.ceil(n/maxLab),imax=0;
  for(var i=0;i<n;i++){if(o.val[i]>o.val[imax])imax=i;var x=ml+band*i+(band-bw)/2,y0=sy(o.val[i]);
    b+='<path d="'+colPath(x,y0,bw,mt+ph-y0,Math.min(4,bw/2))+'" fill="'+c.g1+'"/>';
    if(i%pas===0)b+=txt(ml+band*i+band/2,H-8,o.xlab(i),{a:"middle"})}
  if(o.prev){var pts=o.prev.map(function(p,i){return (ml+band*i+band/2).toFixed(1)+","+sy(p).toFixed(1)}).join(" ");
    b+='<polyline points="'+pts+'" fill="none" stroke="'+c.g2+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    if(n<=35)o.prev.forEach(function(p,i){b+='<circle cx="'+(ml+band*i+band/2)+'" cy="'+sy(p)+'" r="4" fill="'+c.g2+'" stroke="'+c.surf+'" stroke-width="2"/>'})}
  if(o.meta){var ym=Math.round(sy(o.meta))+.5;b+='<line x1="'+ml+'" x2="'+(W-mr+4)+'" y1="'+ym+'" y2="'+ym+'" stroke="'+c.ink2+'" stroke-width="1.5"/>'+txt(W-mr+8,ym+4,"meta "+o.meta,{c:c.ink2,w:700})}
  if(o.val[imax]>0){var xm=ml+band*imax+band/2;b+=txt(xm,sy(o.val[imax])-6,n0(o.val[imax]),{a:"middle",c:c.ink,w:700})}
  for(i=0;i<n;i++)b+=hit(i,o.tip(i),ml+band*i,mt,band,ph);
  el.innerHTML=svg(W,H,b,o.label);el._click=o.click||null;el._hint=o.hint||null}
// barras horizontais: o={rows:[{k,lab,val,txt,tip}],click,label}
function barras(el,o){
  if(!o.rows.length){vazio(el,o.vazio||"Sem dados no período.");return}
  var c=C(),W=largura(el),rowH=32,bh=14,lw=Math.min(190,Math.round(W*.34)),vw=Math.min(150,Math.round(W*.26)),pw=W-lw-vw-12,H=o.rows.length*rowH+4,b="";
  var mx=Math.max.apply(null,o.rows.map(function(r){return r.val}).concat([1]));
  o.rows.forEach(function(r,i){var y=i*rowH+(rowH-bh)/2,w=r.val/mx*pw;
    b+=txt(lw-10,y+bh-2,corta(r.lab,Math.floor(lw/7.2)),{a:"end",c:c.ink2,fs:12.5});
    b+='<rect x="'+lw+'" y="'+y+'" width="'+pw+'" height="'+bh+'" rx="4" fill="'+c.grid+'" opacity=".55"/>';
    b+='<path d="'+barPath(lw,y,Math.max(r.val?3:0,w),bh,4)+'" fill="'+c.g1+'"/>';
    b+=txt(lw+Math.max(r.val?3:0,w)+8,y+bh-2,r.txt,{c:c.ink,fs:12,w:600,num:1});
    b+=hit(r.k,r.tip,0,i*rowH,W,rowH)});
  el.innerHTML=svg(W,H,b,o.label);el._click=o.click||null;el._hint=null}
// barra segmentada (um todo dividido em partes) + legenda com icone e numero: o={parts:[{k,t,ic,v,cor,ink}],hero,heroSub,click}
function segmentos(el,o){
  var c=C(),W=largura(el),tot=o.parts.reduce(function(s,p){return s+p.v},0),y0=o.hero?66:4,bh=28,b="";
  if(!tot){vazio(el,o.vazio||"Sem dados no período.");return}
  if(o.hero){b+=txt(0,44,o.hero,{fs:46,w:600,c:c.ink});b+=txt(o.hero.length*29+14,44,o.heroSub||"",{fs:13.5,c:c.mut})}
  var x=0,gap=2,vis=o.parts.filter(function(p){return p.v>0}),uw=W-gap*(vis.length-1);
  vis.forEach(function(p,i){var w=p.v/tot*uw;
    b+='<rect x="'+x+'" y="'+y0+'" width="'+Math.max(1,w)+'" height="'+bh+'" rx="4" fill="'+p.cor+'"/>';
    var pc=Math.round(p.v/tot*100)+"%";if(w>pc.length*8+14)b+=txt(x+8,y0+19,pc,{c:p.ink||"#ffffff",w:700,fs:12.5});
    b+=hit(p.k,"<b>"+esc(p.t)+"</b><br>"+p.v+" ("+Math.round(p.v/tot*100)+"%)",x,y0,w,bh);x+=w+gap});
  var ly=y0+bh+26,col=Math.max(1,Math.min(o.parts.length,Math.floor(W/170))),cw=W/col;
  o.parts.forEach(function(p,i){var lx=(i%col)*cw,yy=ly+Math.floor(i/col)*24;
    b+='<rect x="'+lx+'" y="'+(yy-11)+'" width="12" height="12" rx="3" fill="'+p.cor+'"/>'+txt(lx+18,yy,p.ic+" "+p.t,{c:c.ink2,fs:12.5})+txt(lx+cw-14,yy,String(p.v),{a:"end",c:c.ink,w:700,num:1})});
  var H=ly+Math.ceil(o.parts.length/col)*24;
  el.innerHTML=svg(W,H,b,o.label);el._click=o.click||null;el._hint=null}

// ---------- graficos da tela
function kpis(){
  var a=D.indicadores,p=D.anterior,cmp=$("gCmp").checked;
  function delta(v,old,modo,bom,rotMin){ // modo: "pct" (variacao %), "pp" (pontos percentuais); bom: 1 subir e bom, 0 neutro; rotMin: valores em minutos
    if(!cmp)return '<small>&nbsp;</small>';
    if(v==null||old==null)return '<small>sem comparação</small>';
    // base pequena (ex.: 1 -> 73) daria "+7200%": nesse caso mostra a diferenca absoluta e o valor anterior
    var abs=modo!=="pp"&&Math.abs(old)<5,d=modo==="pp"?v-old:abs?v-old:Math.round((v-old)/old*100),fmt=modo==="pp"?" p.p.":abs?"":"%";
    if(d===0)return '<small>= igual ao período anterior</small>';
    var mostra=function(x){return rotMin&&abs?fm(Math.abs(x)):Math.abs(x)},cls=bom?(d>0?"up":"down"):"";
    return '<small class="'+cls+'">'+(d>0?"▲ +":"▼ −")+mostra(d)+fmt+' <span style="font-weight:400;color:var(--muted)">'+(abs?"(antes: "+(rotMin?fm(old):old)+")":"vs anterior")+'</span></small>'}
  function tile(rot,val,dl,tip){return '<div class="gk" title="'+esc(tip||"")+'"><span>'+rot+'</span><strong>'+val+'</strong>'+dl+'</div>'}
  $("gKpi").innerHTML=
    tile("Concluídas",n0(a.concluidas),delta(a.concluidas,p.concluidas,"pct",1),"Atividades concluídas no período")+
    tile("Taxa de conclusão",a.pct_conclusao==null?"—":a.pct_conclusao+"%",delta(a.pct_conclusao,p.pct_conclusao,"pp",1),a.concluidas+" de "+a.total+" atividades")+
    tile("Horas concluídas",fm(a.min),delta(a.min,p.min,"pct",1,1),"Tempo previsto das atividades concluídas")+
    tile("No prazo",a.pct_prazo==null?"—":a.pct_prazo+"%",delta(a.pct_prazo,p.pct_prazo,"pp",1),"No prazo ÷ (no prazo + fora + atrasadas)")+
    tile("Tempo real médio",a.media_real==null?"—":fm(a.media_real),delta(a.media_real,p.media_real,"pct",0,1),"Média do cronômetro por atividade concluída")}
function gDia(){
  var d=D.por_dia,cmp=$("gCmp").checked,n=d.length,lg=[{t:"Concluídas",cor:C().g1}];
  if(cmp)lg.push({t:"Período anterior",cor:C().g2,tipo:"l"});if(D.meta_dia)lg.push({t:"Meta diária",cor:C().ink2,tipo:"l"});
  colunas($("gDia"),{val:d.map(function(x){return x.concluidas}),prev:cmp?d.map(function(x){return x.anterior}):null,meta:D.meta_dia||0,legend:lg,
    label:"Concluídas por dia",xlab:function(i){return n<=10?DS[wd(d[i].data)]+" "+d[i].data.slice(8):dm(d[i].data)},
    tip:function(i){var x=d[i];return "<b>"+DSL[wd(x.data)]+", "+br(x.data)+"</b><br>"+x.concluidas+" concluída(s) de "+x.total+(cmp?'<br><span class="k">Mesmo dia do período anterior:</span> '+x.anterior:"")+(D.meta_dia?'<br><span class="k">Meta:</span> '+D.meta_dia+"/dia":"")},
    click:function(i){var x=d[i];drill(DSL[wd(x.data)]+", "+br(x.data),"Todas as atividades do dia",function(l){return l.data===x.data})}});
  $("gDiaSub").textContent="Clique em um dia para ver as atividades"+(D.meta_dia?" · linha = meta diária":"")}
function gTipo(){
  var pt=D.por_tipo.filter(function(t){return t.qtd}).sort(function(a,b){return b.min-a.min});
  barras($("gTipo"),{label:"Tempo concluído por tipo",vazio:"Sem atividades concluídas no período.",
    rows:pt.map(function(t){return{k:t.cat,lab:t.nome,val:t.min,txt:fm(t.min)+" · "+t.qtd,tip:"<b>"+esc(t.nome)+"</b><br>"+fm(t.min)+" previstas em "+t.qtd+" concluída(s)"}}),
    click:function(k){drill(S.CATS[k]||k,"Concluídas deste tipo",function(l){return l.cat===k&&l.status==="done"})}})}
function gPrev(){
  var el=$("gPrev"),pt=D.por_tipo.filter(function(t){return t.qtd});if(!pt.length){vazio(el,"Sem atividades concluídas no período.");return}
  var c=C(),W=largura(el),rowH=40,bh=10,lw=Math.min(170,Math.round(W*.3)),vw=118,pw=W-lw-vw-8,top=30,H=top+pt.length*rowH,b=legenda(c,[{t:"Previsto",cor:c.g1},{t:"Realizado (cronômetro)",cor:c.g2}],0,14);
  var mx=Math.max.apply(null,pt.map(function(t){return Math.max(t.min,t.real)}).concat([1]));
  pt.forEach(function(t,i){var y=top+i*rowH+8;
    b+=txt(lw-10,y+bh+5,corta(t.nome,Math.floor(lw/7.2)),{a:"end",c:c.ink2,fs:12.5});
    b+='<path d="'+barPath(lw,y,Math.max(3,t.min/mx*pw),bh,4)+'" fill="'+c.g1+'"/>';
    if(t.real)b+='<path d="'+barPath(lw,y+bh+2,Math.max(3,t.real/mx*pw),bh,4)+'" fill="'+c.g2+'"/>';
    b+=txt(W-4,y+bh+5,fm(t.min)+" / "+(t.real?fm(t.real):"—"),{a:"end",c:c.ink,fs:12,w:600,num:1});
    var df=t.real?Math.round((t.real-t.min)/t.min*100):null;
    b+=hit(t.cat,"<b>"+esc(t.nome)+"</b><br>Previsto: "+fm(t.min)+"<br>Realizado: "+(t.real?fm(t.real)+" ("+(df>0?"+":"")+df+"%)":"sem cronômetro"),0,top+i*rowH,W,rowH)});
  el.innerHTML=svg(W,H,b,"Previsto e realizado por tipo")+(pt.some(function(t){return t.real})?"":'<p class="gnote">Use o cronômetro (▶) nas atividades para registrar o tempo real.</p>');
  el._click=function(k){drill(S.CATS[k]||k,"Concluídas deste tipo · previsto × realizado",function(l){return l.cat===k&&l.status==="done"})};el._hint=null}
function gPrz(){
  var p=D.prazo,c=C(),ant=D.anterior.pct_prazo,cmp=$("gCmp").checked;
  if(!p.com_prazo){vazio($("gPrz"),"Nenhuma atividade com prazo neste período. Defina o prazo ao criar ou editar uma atividade.");return}
  var dlt=cmp&&p.pct!=null&&ant!=null?(p.pct-ant>0?"▲ +":p.pct-ant<0?"▼ ":"= ")+(p.pct-ant)+" p.p. vs anterior":"";
  segmentos($("gPrz"),{label:"Cumprimento de prazos",hero:p.pct==null?"—":p.pct+"%",heroSub:"no prazo"+(dlt?" · "+dlt:""),
    parts:[{k:"cumprido",t:"No prazo",ic:"✓",v:p.no_prazo,cor:c.good},{k:"fora",t:"Concluídas fora do prazo",ic:"!",v:p.fora,cor:c.warn,ink:"#0b0b0b"},
      {k:"atrasada",t:"Atrasadas (em aberto)",ic:"✕",v:p.atrasadas,cor:c.crit},{k:"aberta",t:"Em aberto, no prazo",ic:"○",v:p.abertas,cor:c.neu,ink:c.ink}],
    click:function(k){drill(SIT[k]||k,"Atividades com prazo nesta situação",function(l){return l.sit===k})}})}
function gSem(){
  var s=D.semanas,cmpA=s[7],cmpB=s[6],df=cmpA.concluidas-cmpB.concluidas;
  colunas($("gSem"),{val:s.map(function(x){return x.concluidas}),h:190,label:"Concluídas por semana",xlab:function(i){return dm(s[i].ini)},
    tip:function(i){var x=s[i];return "<b>Semana de "+br(x.ini)+"</b><br>"+x.concluidas+" concluída(s) de "+x.total+"<br>"+fm(x.min)+" previstas"},
    hint:"Clique para ver esta semana",
    click:function(i){var a=s[i].ini,p=a.split("-"),f=new Date(+p[0],+p[1]-1,+p[2]+6);$("gPer").value="custom";$("gDe").value=a;$("gAte").value=iso(f);load()}});
  $("gSem").insertAdjacentHTML("beforeend",'<p class="gnote">Esta semana: <b>'+cmpA.concluidas+'</b> concluída'+(cmpA.concluidas===1?"":"s")+' ('+fm(cmpA.min)+') · '+(df===0?"igual à":df>0?"+"+df+" em relação à":df+" em relação à")+' semana anterior.</p>')}
function gQuem(){
  var q=D.por_quem||[];
  barras($("gQuem"),{label:"Atividades por solicitante",vazio:"Sem atividades no período.",
    rows:q.map(function(x){return{k:norm(x.nome==="(sem solicitante)"?"":x.nome),lab:x.nome,val:x.total,txt:x.total+" · "+x.concluidas+" concl.",tip:"<b>"+esc(x.nome)+"</b><br>"+x.total+" atividade(s), "+x.concluidas+" concluída(s)<br>"+fm(x.min)+" concluídas"}}),
    click:function(k){drill(k?q.filter(function(x){return norm(x.nome)===k})[0].nome:"Sem solicitante","Atividades deste solicitante",function(l){return norm(l.quem)===k})}})}
function classe(l){if(l.status!=="done"||!l.dur||!l.real)return"";return l.real>l.dur*1.15?"acima":l.real<l.dur*.85?"abaixo":"no_alvo"}
function gEst(){
  var e=D.estimativa||{},c=C(),el=$("gEst"),tot=(e.no_alvo||0)+(e.acima||0)+(e.abaixo||0);
  if(!tot){vazio(el,"Sem concluídas com cronômetro no período. Use o ▶ nas atividades para comparar o tempo real com o previsto.");return}
  segmentos(el,{label:"Precisão das estimativas",hero:Math.round((e.no_alvo||0)/tot*100)+"%",heroSub:"dentro de ±15% do previsto",
    parts:[{k:"no_alvo",t:"Dentro do previsto",ic:"✓",v:e.no_alvo||0,cor:c.good},{k:"abaixo",t:"Mais rápidas",ic:"↓",v:e.abaixo||0,cor:c.neu,ink:c.ink},{k:"acima",t:"Estouraram o tempo",ic:"!",v:e.acima||0,cor:c.crit}],
    click:function(k){drill({no_alvo:"Dentro do previsto",abaixo:"Mais rápidas que o previsto",acima:"Estouraram o tempo previsto"}[k],"Concluídas com cronômetro",function(l){return classe(l)===k})}});
  var es=D.estouros||[];
  if(es.length)el.insertAdjacentHTML("beforeend",'<ul class="gest">'+es.map(function(x){return '<li><button type="button" data-ed="'+esc(x.id)+'" title="'+esc(x.titulo)+'">'+esc(x.titulo)+'</button><em>+'+fm(x.real-x.previsto)+'</em><small>'+dm(x.data)+(D.escopo==="equipe"?" · "+esc(x.nome):"")+' · previsto '+fm(x.previsto)+', real '+fm(x.real)+'</small></li>'}).join("")+'</ul>')}
function gCal(){
  var el=$("gCal"),c=C(),H0=[];for(var h=6;h<=20;h++)H0.push(h);var mx=0,fora=0;
  D.calor.forEach(function(r){r.forEach(function(v,k){if(k>=6&&k<=20)mx=Math.max(mx,v);else fora+=v})});
  if(!mx){vazio(el,"Sem atividades concluídas com hora definida no período.");return}
  var W=largura(el),ml=36,mt=20,gap=2,cw=(W-ml)/H0.length,ch=26,H=mt+7*(ch+gap)+34,b="";
  H0.forEach(function(h,j){if(cw>26||j%2===0)b+=txt(ml+cw*j+cw/2,13,h+"h",{a:"middle"})});
  DS.forEach(function(n,k){var y=mt+k*(ch+gap);b+=txt(ml-8,y+ch/2+4,n,{a:"end",c:c.ink2});
    H0.forEach(function(h,j){var v=D.calor[k][h],x=ml+cw*j,cor=v?c.q[Math.min(6,Math.max(0,Math.ceil(v/mx*7)-1))]:c.grid;
      b+='<rect x="'+(x+gap/2)+'" y="'+y+'" width="'+(cw-gap)+'" height="'+ch+'" rx="4" fill="'+cor+'"/>';
      b+=hit(k+"|"+h,"<b>"+DSL[k]+" · "+h+"h</b><br>"+v+" concluída(s)",x,y,cw,ch)})});
  var ly=mt+7*(ch+gap)+20;b+=txt(ml,ly,"menos",{});c.q.forEach(function(q,i){b+='<rect x="'+(ml+44+i*20)+'" y="'+(ly-11)+'" width="18" height="12" rx="3" fill="'+q+'"/>'});b+=txt(ml+44+7*20+6,ly,"mais",{});
  if(fora)b+=txt(W,ly,fora+" fora da faixa 6h–20h",{a:"end"});
  el.innerHTML=svg(W,H,b,"Mapa de calor de concluídas por dia e hora");
  el._click=function(k){var p=k.split("|"),dw=+p[0],hh=+p[1];drill(DSL[dw]+" · "+hh+"h","Concluídas nesse dia da semana e hora",function(l){return l.status==="done"&&l.hora&&+l.hora.slice(0,2)===hh&&wd(l.data)===dw})};el._hint=null}
function gPes(){
  var pp=D.por_pessoa;$("gPesC").hidden=!pp;if(!pp)return;
  var uids={};(D.lista||[]).forEach(function(l){uids[l.nome]=l.uid});
  barras($("gPes"),{label:"Concluídas por pessoa",vazio:"Sem atividades no período.",
    rows:pp.map(function(p){return{k:p.nome,lab:p.nome,val:p.concluidas,txt:p.concluidas+" concl. · "+fm(p.min),tip:"<b>"+esc(p.nome)+"</b><br>"+p.concluidas+" de "+p.total+" concluída(s)<br>"+fm(p.min)+" concluídas"}}),
    click:function(k){drill(k,"Atividades da pessoa no período",function(l){return l.nome===k})}})}

// ---------- detalhe (gaveta)
function drill(tit,sub,f){
  if(!D)return;var l=(D.lista||[]).filter(f).sort(function(a,b){return (b.data+(b.hora||"")).localeCompare(a.data+(a.hora||""))});drillLista=l;
  var eu=S.ME&&S.ME.id,equipe=D.escopo==="equipe";
  $("gDrT").innerHTML=esc(tit)+"<small>"+esc(sub)+" · "+l.length+" atividade"+(l.length===1?"":"s")+" · "+br(D.de)+" a "+br(D.ate)+(D.lista_cortada?" · lista limitada às 3.000 primeiras":"")+"</small>";
  $("gDrL").innerHTML=l.length?l.map(function(x){var ed=x.uid===eu;
    return '<li'+(ed?' class="ed" data-ed="'+esc(x.id)+'" tabindex="0" title="Abrir para editar"':'')+'><div class="dd"><b>'+dm(x.data)+'</b>'+(x.hora||"—")+'</div><div class="dt"><b>'+esc(x.titulo)+'</b><small>'+
      (equipe?esc(x.nome)+" · ":"")+esc(S.CATS[x.cat]||x.cat)+(x.quem?" · "+esc(x.quem):"")+(x.sit&&SIT[x.sit]?" · prazo: "+SIT[x.sit]:"")+(x.real?" · real "+fm(x.real)+" / prev. "+fm(x.dur):"")+'</small></div><span class="st '+x.status+'">'+S.ST[x.status]+'</span></li>'}).join(""):'<li style="display:block;text-align:center;color:var(--muted);padding:30px">Nenhuma atividade.</li>';
  hideTip();if(!$("gDrill").open)$("gDrill").showModal()}
$("gDrX").onclick=function(){$("gDrill").close()};
$("gDrill").addEventListener("click",function(e){if(e.target===this){this.close();return}
  var li=e.target.closest("[data-ed]");if(!li)return;var it=S.findIt(li.getAttribute("data-ed"));if(it){drillEditou=true;S.openDlg(it)}});
$("gDrill").addEventListener("keydown",function(e){if(e.key==="Enter"){var li=e.target.closest("[data-ed]");if(li)li.click()}});
$("gDrCsv").onclick=function(){if(!drillLista.length){S.toast("Nada para exportar.",{ms:2500});return}
  S.dl("atividades-grafico.csv",S.csvOf(drillLista.map(function(x){return{date:x.data,time:x.hora,dur:x.dur,title:x.titulo,cat:x.cat,who:x.quem,prio:"",status:x.status}})))};
$("gEst").addEventListener("click",function(e){var b=e.target.closest("button[data-ed]");if(!b)return;var it=S.findIt(b.getAttribute("data-ed"));
  if(it){drillEditou=true;S.openDlg(it)}else S.toast("Esta atividade é de outra pessoa (só leitura).",{ms:3000})});
$("dlg").addEventListener("close",function(){if(drillEditou&&S.view()==="graficos"){drillEditou=false;setTimeout(load,300)}});

// ---------- dica (tooltip), clique e teclado
var tip=$("gTip"),grid=$("gGrid");
function hideTip(){tip.classList.remove("on")}
function place(x,y){var r=tip.getBoundingClientRect(),X=x+14,Y=y+16;if(X+r.width>innerWidth-8)X=x-r.width-14;if(Y+r.height>innerHeight-8)Y=y-r.height-12;tip.style.left=Math.max(8,X)+"px";tip.style.top=Math.max(8,Y)+"px"}
function showTip(el,x,y){var pl=el.closest(".gplot"),h=pl&&pl._click?'<span class="hint">'+esc(pl._hint||"Clique para ver as atividades")+'</span>':"";
  tip.innerHTML=el.getAttribute("data-tip")+h;tip.classList.add("on");place(x,y)}
grid.addEventListener("pointermove",function(e){var el=e.target.closest&&e.target.closest("[data-tip]");if(!el){hideTip();return}showTip(el,e.clientX,e.clientY)});
grid.addEventListener("pointerleave",hideTip);
grid.addEventListener("focusin",function(e){var el=e.target.closest&&e.target.closest("[data-tip]");if(!el)return;var r=el.getBoundingClientRect();showTip(el,r.left+r.width/2,r.top+r.height/2)});
grid.addEventListener("focusout",hideTip);
grid.addEventListener("click",function(e){var el=e.target.closest&&e.target.closest("[data-k]");if(!el)return;var pl=el.closest(".gplot");if(pl&&pl._click){hideTip();pl._click(el.getAttribute("data-k"))}});
grid.addEventListener("keydown",function(e){if(e.key!=="Enter"&&e.key!==" ")return;var el=e.target.closest&&e.target.closest("[data-k]");if(!el)return;e.preventDefault();var pl=el.closest(".gplot");if(pl&&pl._click)pl._click(el.getAttribute("data-k"))});
window.addEventListener("scroll",hideTip,true);

// ---------- exportar PNG
grid.addEventListener("click",function(e){var b=e.target.closest("[data-png]");if(b)png(b.getAttribute("data-png"))});
function png(key){
  var card=document.querySelector('[data-gc="'+key+'"]'),s=card&&card.querySelector(".gplot svg");if(!s||!D){S.toast("Este gráfico não tem dados para exportar.",{ms:3000});return}
  var c=C(),tt=card.querySelector("h3").firstChild.textContent.trim(),sub=(D.escopo==="equipe"?"Toda a equipe":"Minhas atividades")+" · "+br(D.de)+" a "+br(D.ate),
    w=+s.getAttribute("width"),h=+s.getAttribute("height"),pad=24,th=46,W=w+pad*2,H=h+th+pad*2;
  var inner=s.outerHTML.replace(/<svg[^>]*>/,'<svg x="'+pad+'" y="'+(pad+th)+'" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" font-family="Segoe UI, Open Sans, sans-serif">').replace(/ data-tip="[^"]*"/g,"");
  var doc='<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'"><rect width="100%" height="100%" fill="'+c.surf+'"/>'+
    '<text x="'+pad+'" y="'+(pad+18)+'" font-family="Segoe UI, Open Sans, sans-serif" font-size="18" font-weight="700" fill="'+c.ink+'">'+esc(tt)+'</text>'+
    '<text x="'+pad+'" y="'+(pad+38)+'" font-family="Segoe UI, Open Sans, sans-serif" font-size="12.5" fill="'+c.mut+'">'+esc(sub)+'</text>'+inner+'</svg>';
  var img=new Image();
  img.onload=function(){var k=2,cvs=document.createElement("canvas");cvs.width=W*k;cvs.height=H*k;var g=cvs.getContext("2d");g.scale(k,k);g.drawImage(img,0,0);
    cvs.toBlob(function(bl){if(!bl){S.toast("Não foi possível gerar a imagem.",{ms:3000});return}var a=document.createElement("a");a.href=URL.createObjectURL(bl);
      a.download="grafico-"+key+"-"+D.de+"_a_"+D.ate+".png";document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1500)},"image/png")};
  img.onerror=function(){S.toast("Não foi possível gerar a imagem.",{ms:3000})};
  img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(doc)}

// ---------- modo apresentacao
function apres(on){document.body.classList.toggle("apres",on);hideTip();
  if(on){try{if(document.documentElement.requestFullscreen&&!document.fullscreenElement)document.documentElement.requestFullscreen().catch(function(){})}catch(e){}}
  else if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(function(){});
  setTimeout(draw,60)}
$("gApres").onclick=function(){apres(true)};$("gApresSair").onclick=function(){apres(false)};
document.addEventListener("fullscreenchange",function(){if(!document.fullscreenElement&&document.body.classList.contains("apres"))apres(false)});
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&document.body.classList.contains("apres")&&!document.querySelector("dialog[open]"))apres(false)});
window.addEventListener("hashchange",function(){if(location.hash!=="#graficos"&&document.body.classList.contains("apres"))apres(false)});

// ---------- carga
function periodo(){var p=$("gPer").value,t=new Date(),a=new Date(t),b=new Date(t);if(p==="custom")return;
  if(p==="semana"){a.setDate(t.getDate()-((t.getDay()+6)%7));b=new Date(a);b.setDate(a.getDate()+6)}
  else if(p==="mes"){a=new Date(t.getFullYear(),t.getMonth(),1);b=new Date(t.getFullYear(),t.getMonth()+1,0)}
  else a.setDate(t.getDate()-(+p-1));
  $("gDe").value=iso(a);$("gAte").value=iso(b)}
function esqueleto(){
  $("gKpi").innerHTML=[1,2,3,4,5].map(function(){return '<div class="gk sk"><span class="sk skl" style="width:60%"></span><strong>00</strong><small>.</small></div>'}).join("");
  ["gDia","gTipo","gPrev","gPrz","gSem","gQuem","gEst","gCal"].forEach(function(id){if(!$(id).querySelector("svg"))$(id).innerHTML='<div class="sk skb"></div>'})}
var seq=0;
function load(){periodo();var es=S.ME&&S.ME.equipe?$("gEsc").value:"me",my=++seq;esqueleto();
  S.whenSaved(function(){return S.jf("GET","/api/graficos?de="+$("gDe").value+"&ate="+$("gAte").value+"&escopo="+es).then(function(x){
    if(my!==seq)return;
    if(!x.ok){$("gSub").textContent=x.d.erro||"Não foi possível carregar.";$("gKpi").innerHTML="";return}
    D=x.d;draw()})})}
function draw(){if(!D)return;lastW=grid.clientWidth;
  var cmp=$("gCmp").checked;
  $("gSub").textContent=(D.escopo==="equipe"?"Toda a equipe":"Minhas atividades")+" · "+br(D.de)+" a "+br(D.ate)+(cmp?" · comparado com "+br(D.anterior.de)+" a "+br(D.anterior.ate):"");
  $("gTitle").textContent=document.body.classList.contains("apres")?"Indicadores do suporte":"Gráficos";
  [kpis,gDia,gTipo,gPrev,gPrz,gSem,gQuem,gEst,gCal,gPes].forEach(function(f){try{f()}catch(e){if(window.console)console.error(e)}})}
$("gPer").addEventListener("change",load);$("gEsc").addEventListener("change",load);
["gDe","gAte"].forEach(function(id){$(id).addEventListener("change",function(){$("gPer").value="custom";load()})});
$("gCmp").addEventListener("change",draw);
// redesenha quando a largura muda (janela, menu aberto/fechado, apresentacao) e quando o tema muda
var rT=null;if(window.ResizeObserver)new ResizeObserver(function(){if(!D||Math.abs(grid.clientWidth-lastW)<16)return;clearTimeout(rT);rT=setTimeout(draw,120)}).observe(grid);
new MutationObserver(function(){if(D&&S.view()==="graficos")setTimeout(draw,30)}).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
window.Graficos={load:load,draw:draw};
if(window.__grPend||S.view()==="graficos"){window.__grPend=false;load()}
})();
