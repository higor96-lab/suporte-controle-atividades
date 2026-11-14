// Icones do menu lateral
(function(){
  var P={"Backups":"M12 3v12M7 10l5 5 5-5M4 21h16","Gráficos":"M12 3v9h9a9 9 0 1 1-9-9zM15 3.5A9 9 0 0 1 20.5 9H15z","Histórico de alterações":"M12 7v5l3 2M3 12a9 9 0 1 0 3-6.700M3 4v4h4","Equipe":"M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M17 4a4 4 0 0 1 0 7M22 21c0-3-2-5-4-5.500","Painel da equipe":"M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z","Relatórios":"M5 3h10l4 4v14H5zM14 3v5h5M8 13h8M8 17h6","Meus relatórios":"M4 20V10M10 20V4M16 20v-7M22 20H2","Administração":"M12 3l8 3v6c0 5-3.500 8-8 9-4.500-1-8-4-8-9V6z","Usuários":"M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M17 4a4 4 0 0 1 0 7M22 21c0-3-2-5-4-5.500",
    "Rotina do dia":"M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
    "Hoje":"M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
    "Atividades":"M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
    "Dados":"M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.300-8-3zM4 6v12c0 1.700 3.600 3 8 3s8-1.300 8-3V6M4 12c0 1.700 3.600 3 8 3s8-1.300 8-3",
    "Histórico":"M12 7v5l3 2M3 12a9 9 0 1 0 3-6.700M3 4v4h4",
    "Visão geral":"M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    "Nova atividade":"M12 5v14M5 12h14",
    "Pendentes":"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
    "Em andamento":"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM10 8.500l6 3.500-6 3.500z",
    "Concluídas do dia":"M5 12l5 5L20 7",
    "Todas as atividades":"M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
    "Importar dados":"M12 16V4M7 9l5-5 5 5M4 20h16",
    "Busca geral":"M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
    "Baixar modelo Excel":"M12 4v12M7 11l5 5 5-5M4 20h16",
    "Usar no celular":"M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
    "Baixar modelo CSV":"M12 4v12M7 11l5 5 5-5M4 20h16",
    "Exportar CSV":"M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 11v6M9 14l3 3 3-3",
    "Atividades concluídas":"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l3 3 5-6"
  };
  function icon(d){var s=document.createElementNS("http://www.w3.org/2000/svg","svg");s.setAttribute("viewBox","0 0 24 24");s.setAttribute("class","mi");s.setAttribute("fill","none");s.setAttribute("stroke","currentColor");s.setAttribute("stroke-width","2");s.setAttribute("stroke-linecap","round");s.setAttribute("stroke-linejoin","round");s.setAttribute("aria-hidden","true");var p=document.createElementNS("http://www.w3.org/2000/svg","path");p.setAttribute("d",d);s.appendChild(p);return s}
  try{document.querySelectorAll("#nav summary, #nav a, #nav .lk").forEach(function(el){
    var t=(el.firstChild&&el.firstChild.nodeType===3?el.firstChild.textContent:el.textContent).trim();
    if(window.I18N&&window.I18N.pt)t=window.I18N.pt(t);  // tela em outro idioma: procura pelo nome em portugues
    if(P[t])el.insertBefore(icon(P[t]),el.firstChild);
  })}catch(e){}
})();
