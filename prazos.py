# -*- coding: utf-8 -*-
"""Prazo (SLA) das atividades."""
import time
from datetime import datetime


def limite_epoch(prazo):
    """'YYYY-MM-DD' vale ate o fim do dia; 'YYYY-MM-DDTHH:MM' vale ate aquele minuto. 0 = sem prazo."""
    if not prazo:
        return 0
    try:
        if "T" in prazo:
            return int(datetime.strptime(prazo, "%Y-%m-%dT%H:%M").timestamp()) + 59
        return int(datetime.strptime(prazo + " 23:59:59", "%Y-%m-%d %H:%M:%S").timestamp())
    except ValueError:
        return 0


def situacao(prazo, status, fim, agora=None):
    """'' sem prazo | 'cumprido' | 'fora' | 'atrasada' | 'aberta' | 'sem_data' (concluida sem registro do momento)."""
    lim = limite_epoch(prazo)
    if not lim:
        return ""
    if status == "done":
        if not fim:
            return "sem_data"
        return "cumprido" if fim <= lim else "fora"
    return "atrasada" if (agora or time.time()) > lim else "aberta"


ROTULO = {"cumprido": "No prazo", "fora": "Concluída fora do prazo", "atrasada": "Atrasada", "aberta": "Dentro do prazo",
          "sem_data": "Concluída", "": ""}
