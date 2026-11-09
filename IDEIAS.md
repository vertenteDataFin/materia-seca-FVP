# Silagem MS — ideias e evoluções

Caderno de ideias para o app. Anote aqui o que surgir no campo, no laboratório ou no escritório, mesmo sem
detalhe. Quando uma ideia virar tarefa, mude a situação e, se for o caso, aponte o commit ou a data em que entrou.

Situações: **ideia** · **em avaliação** · **planejada** · **feita** · **descartada**

| # | Data | Ideia | Situação |
|---|---|---|---|
| 1 | 09/11/2026 | Módulo analítico: evolução da matéria seca de cada talhão | ideia |

---

## 1. Módulo analítico — evolução da MS por talhão

**Situação:** ideia · **Anotado em:** 09/11/2026

**A ideia.** Hoje o Painel e o Mapa mostram só a última coleta de cada talhão. Um módulo analítico acompanharia
a série de coletas ao longo do tempo, para enxergar a tendência da MS e decidir o momento de ensilar com antecedência.

**O que poderia ter**

- Gráfico de MS (%) por data, um talhão por vez ou vários sobrepostos, com a faixa ideal (28–35 %) marcada.
- Taxa de ganho de MS por dia entre as duas últimas coletas e projeção de quando o talhão entra na faixa
  ("no ritmo atual, TL 18 chega a 28 % em ~6 dias").
- A mesma série para massa verde (t MV/ha) e MS (t MS/ha), para ver se a produção está estabilizando.
- Comparação entre talhões do mesmo capim e ranking de quem está mais perto do ponto.
- Alertas: talhão que vai entrar na faixa nos próximos dias; talhão sem coleta há mais de N dias.
- Exportar a série para o Excel (hoje o Excel já traz as coletas, mas não a leitura de tendência).

**Dependências e cuidados**

- Precisa de pelo menos duas coletas com MS por talhão para haver tendência; até lá mostrar só os pontos.
- A projeção é linear e sensível ao clima (chuva derruba a MS); apresentar como estimativa, não como previsão.
- Os dados já estão prontos no Firestore (coletas + amostras por talhão), então é trabalho de tela e cálculo,
  sem mudança de banco.

**Notas**

- (espaço para anotações da equipe)
