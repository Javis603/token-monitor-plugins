# CodingPass

Mostra nas visualizações de limites (Limits) do Token Monitor o uso das franquias de 5 horas, semanal e mensal do [CodingPass](https://codingpass.ai), com horários de redefinição, nome do plano, fim do período atual, créditos de redefinição da franquia e saldo da carteira pré-paga.

Esta é uma integração não oficial. O CodingPass não tem um endpoint de franquia por chave de API, então o plugin lê a mesma API que o console `codingpass.ai/app` usa, com o Cookie da sua sessão no navegador. Uma atualização do site pode quebrá-lo.

## Compatibilidade e instalação

Requer **Token Monitor 0.88.0 ou posterior**. Testado no Windows 11; macOS e Linux não foram testados.

Instale em **Configurações → Plugins → Explorar**, ou importe o arquivo `.tmplugin` ou a pasta completa do plugin em **Configurações → Plugins → Instalar de arquivo**. Revise o pacote e ative-o.

## Configuração

1. Abra **Configurações → Limites de Ferramentas de IA**, marque **CodingPass** e expanda.
2. No navegador, entre em `https://codingpass.ai/app`, abra as ferramentas de desenvolvedor (F12) → **Network** e recarregue a página.
3. Selecione a requisição `usage` (ou `state`) e copie o valor completo de `Cookie` em **Request Headers**.
4. Cole em **Console Cookie header** e salve. O plugin verifica o valor; o status muda para **Conectado** quando funciona.

A página de limites passa a mostrar as janelas de 5 horas, semanal e mensal. Uma janela sem teto aparece como nota em vez de barra, e a janela de 5 horas não mostra horário de redefinição até que uma requisição a abra. Se o status mudar para **Credenciais rejeitadas** ou **Credenciais expiradas**, sua sessão no site terminou: copie um Cookie novo.

## Dados e acesso

- Rede: somente `https://codingpass.ai`, quando uma tela de limites visível do Token Monitor pede uma leitura ou quando você verifica o Cookie.

  | Requisição | Finalidade |
  | --- | --- |
  | `GET /api/auth/state` | Verificação do Cookie (um `userId` indica sessão ativa) |
  | `POST /api/app/usage` | Janelas de franquia, contadores ao vivo, assinatura |
  | `POST /api/app/wallet` | Saldo da carteira pré-paga (opcional) |

- Credencial: o cabeçalho Cookie que você colar. O Token Monitor o armazena neste computador **sem criptografia** e o plugin o envia somente ao codingpass.ai. Ele equivale à sua sessão conectada; não o compartilhe.
- O plugin não lê arquivos locais e não envia nada para nenhum outro lugar.

## Licença

[MIT](LICENSE). CodingPass é um serviço de terceiros; seu nome e sua marca identificam o serviço e não implicam endosso.
