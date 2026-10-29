<p align="right">
  <a href="./README.md">EN</a> | <a href="./README.zh-CN.md">简</a> | <a href="./README.zh-TW.md">繁</a> | <a href="./README.ko.md">KO</a> | <a href="./README.ja.md">JA</a> | <strong>PT</strong>
</p>

<div align="center">
  <img src=".github/assets/app.png" alt="Plugins da comunidade Token Monitor" width="120">
  <h1>Plugins da comunidade Token Monitor</h1>
  <p><em>Extensões opcionais, com lançamentos independentes do aplicativo.</em></p>
</div>

## Sobre

Plugins mantidos pela comunidade para o [Token Monitor](https://github.com/Javis603/token-monitor). Cada plugin tem versão, README, requisitos de compatibilidade e avisos de licença próprios.

| Plugin | Descrição | Versão |
| --- | --- | --- |
| [Magpie Routes](plugins/magpie-routes/README.pt-BR.md) | Visualizações locais de roteamento e contexto em tempo real. | `0.1.0` |
| [Antigravity Account Ledger](plugins/antigravity-account-ledger/README.pt-BR.md) | Registro de uso de tokens e custos do Antigravity por conta Google e intervalo de datas. | `0.1.0` |

## Instalação

Em **Configurações → Plugins → Instalar de arquivo**, importe a pasta completa ou o `.tmplugin`, revise o conteúdo e ative o plugin. Consulte o README de cada plugin para versões do aplicativo, plataformas e configuração. O usuário não precisa instalar o Node.js separadamente.

## Desenvolvimento

As ferramentas de desenvolvimento exigem Node 22.15+. Não há dependências npm em tempo de execução. O build usa o validador de pacotes de um checkout do Token Monitor; `--local-only` gera pacotes de teste sem publicar.

```sh
npm test
npm run check -- --host /path/to/token-monitor
npm run build -- --host /path/to/token-monitor --local-only
```

## Documentação

- [Manutenção e publicação](docs/releasing.md)
- [Escopo de verificação](docs/verification.md)
- [Histórico de alterações](plugins/magpie-routes/CHANGELOG.pt-BR.md)

## Licença

Código e documentação originais usam [MIT](LICENSE). As licenças e atribuições de terceiros estão em [NOTICE](NOTICE.md).
