// Login e sair
(function(){
  var $=function(i){return document.getElementById(i)},ME=window.ME;
  var H={"Content-Type":"application/json","X-Requested-With":"fetch"};
  if(ME){document.body.classList.remove("locked");$("who").textContent=ME.nome+(ME.cargo?" · "+ME.cargo:"");if(ME.admin)$("gAdm").hidden=false;if(ME.equipe)$("gEq").hidden=false;else{$("rUsr").parentNode.hidden=true;$("gEscW").hidden=true;$("hUsW").hidden=true}}else $("lu").focus();
  var step2=false;
  function l1(show){$("l1").hidden=!show;$("lu").required=show;$("lp").required=show;$("l2").hidden=show;$("lc").required=!show}
  $("lf").addEventListener("submit",function(ev){
    ev.preventDefault();var m=$("le"),b=$("lb");b.disabled=true;m.textContent="";
    fetch(step2?"/api/login/2fa":"/api/login",{method:"POST",headers:H,credentials:"same-origin",body:JSON.stringify(step2?{codigo:$("lc").value.trim()}:{usuario:$("lu").value.trim(),senha:$("lp").value})})
    .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d}})})
    .then(function(x){
      if(x.ok&&x.d.precisa_2fa){step2=true;l1(false);b.textContent="Verificar";$("lc").value="";$("lc").focus();return}
      if(x.ok){location.reload();return}
      m.textContent=x.d.erro||"Usuário ou senha inválidos.";
      if(step2&&x.d.reinicia){step2=false;l1(true);b.textContent="Entrar";$("lp").value="";$("lu").focus()}
      else if(step2){$("lc").value="";$("lc").focus()}else{$("lp").value="";$("lp").focus()}})
    .catch(function(){m.textContent="Não foi possível conectar ao servidor."}).then(function(){b.disabled=false});
  });
  $("logout").addEventListener("click",function(){fetch("/api/logout",{method:"POST",headers:H,credentials:"same-origin"}).then(function(){location.reload()})});
})();
