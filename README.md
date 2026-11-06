# Silagem MS — Matéria seca FVP

Webapp (PWA, funciona offline) para amostragem de capim para silagem: coleta de pontos com GPS,
pesagem das amostras, teor de matéria seca/umidade e estimativa de produção por talhão.

## Uso

- **Painel**: produção estimada por talhão e totais da fazenda.
- **Mapa**: imagem de satélite com os talhões; toque num talhão → *Registros* ou *Nova coleta*.
- **Coletas**: em campo, *Novo ponto aqui* grava a posição GPS; lance o peso verde e a subamostra (úmido/seco).
- **Talhões**: cadastro, ficha cruzando KML × foto × dados em uso.
- **Config.**: parâmetros (perdas, densidade, faixa ideal de MS), backup JSON e exportação CSV.

Os talhões vêm do KML em `public/talhoes-fazenda.kml`, carregado automaticamente na primeira abertura.
Os dados ficam no navegador do aparelho — use o backup para transferir entre aparelhos.

## Desenvolvimento

```bash
npm install
npm run dev      # https://localhost:5180 (HTTPS para o GPS funcionar no celular via rede)
npm test
npm run build
```

O deploy no GitHub Pages é automático a cada push na branch `main` (`.github/workflows/deploy.yml`).
