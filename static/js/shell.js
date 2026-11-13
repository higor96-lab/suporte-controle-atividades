// Casca: relogio, menu, instalacao como app
(function(){
  var $=function(i){return document.getElementById(i)};
  function sync(){var h=location.hash||"#visao";document.querySelectorAll("#rail a").forEach(function(a){if(a.getAttribute("href")===h)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")})}
  window.addEventListener("hashchange",sync);sync();
  function tick(){var d=new Date(),o=-d.getTimezoneOffset(),a=Math.abs(o),z=(o<0?"-":"+")+("0"+Math.floor(a/60)).slice(-2)+":"+("0"+a%60).slice(-2);
    $("clock").textContent=d.toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"short"}).replace(/\./g,"")+" · "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});$("clock").title="Fuso "+z}
  tick();setInterval(tick,30000);
  if(window.innerWidth<860)document.body.classList.add("nomenu");
  $("burger").onclick=function(){document.body.classList.toggle("nomenu")};
  var mq=function(){return window.innerWidth<=860};
  $("mNew").onclick=function(){$("new").click()};
  $("mMenu").onclick=function(){document.body.classList.toggle("nomenu")};
  $("scrim").onclick=function(){document.body.classList.add("nomenu")};
  document.querySelectorAll("#nav a").forEach(function(a){a.addEventListener("click",function(){if(mq())document.body.classList.add("nomenu")})});
  window.addEventListener("hashchange",function(){if(mq())document.body.classList.add("nomenu")});
  // instalar como app
  var dip=null;
  window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();dip=e;$("mobInstall").hidden=false});
  window.addEventListener("appinstalled",function(){dip=null;$("mobInstall").hidden=true});
  $("mobInstall").onclick=function(){if(dip){dip.prompt();dip=null;$("mobInstall").hidden=true}};
  $("mobHelp").onclick=function(){
    $("mobUrl").textContent=location.origin;
    $("mobHttps").textContent=location.protocol==="https:"
      ?"Conexão segura (HTTPS) ativa: o navegador oferece a instalação como app. Se o celular avisar sobre o certificado, instale-o antes (endereço acima + /certificado.crt)."
      :"Você está em HTTP: o atalho na tela inicial funciona, mas a instalação como app completo só é oferecida com HTTPS e certificado instalado no celular.";
    $("mobDlg").showModal();if(mq())document.body.classList.add("nomenu")};
  $("mobClose").onclick=function(){$("mobDlg").close()};
  if("serviceWorker" in navigator&&(location.protocol==="https:"||location.hostname==="localhost"||location.hostname==="127.0.0.1"))navigator.serviceWorker.register("/sw.js").catch(function(){});
  document.querySelectorAll("[data-act]").forEach(function(b){b.addEventListener("click",function(){
    var a=b.getAttribute("data-act");
    if(a==="new")$("new").click();
    else if(a==="tpl")$("tpl").click();
    else if(a.indexOf("f:")===0){location.hash="#visao";var t=document.querySelector('#tabs button[data-f="'+a.slice(2)+'"]');if(t)t.click()}
    if(window.innerWidth<860)document.body.classList.add("nomenu");
  })});
})();
