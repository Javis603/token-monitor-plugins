# Histórico de alterações

## 0.1.3

Refaz os blocos Requisições e Contas e chaves da página principal a partir da própria página de roteamento do Magpie e aproxima o palco de roteamento do Magpie. As requisições ficam em um cartão com altura limitada e rolagem, com abas de dia, barra Por requisição/sessão/chave, menus de finalidade e métricas e linhas compactas (hora, agente, modelo, quem respondeu, números, etiquetas de nível de serviço e TUI). Contas e chaves seguem os grupos de provedor, pontos de estado, dobras e Mostrar mais do Magpie, com uma linha por janela de cota e o motivo quando a cota não pode ser lida. A explicação da rota mostra o selo de mascaramento, os passos com falha usam a cruz do Magpie, os blocos de sessão usam o layout dele e uma conta que o Magpie põe em descanso é desenhada em descanso, sem fio ao vivo. O palco, a legenda e o contexto ficam na própria página; só o cartão de contexto, a lista de requisições e a lista de contas são cartões. A página não tem mais o filtro de agente, que o Magpie não tem (o Notch mantém o seu). Históricos longos são desenhados conforme a rolagem, e os controles de ordenação e paginação foram removidos.

## 0.1.2

Alinha o grafo principal de roteamento ao Magpie com títulos de rotas e grupos aninhados, expansão e recolhimento pelo teclado, ordem dos membros, detalhes de conta em duas linhas e conexões hierárquicas. Restaura contadores de resposta em tempo real e rótulos de cota, saldo e reserva, mantendo o mascaramento das contas. Adiciona resumos de contexto por sessão, agrupamento por requisição/sessão/chave, filtros de finalidade, métricas, cotas salvas, histórico diário e reprodução dos eventos registrados. O acesso permanece somente leitura e limitado a metadados.

## 0.1.1

Corrige o ícone em branco e o nome de origem do DeepSeek Harness. Sincroniza explicações de roteamento, cartões de contexto, ícones de agentes e traduções chinesas com o Magpie 9c39edb9. Preserva o estado de cancelamento e usa um símbolo genérico para ícones desconhecidos.

## 0.1.0

Primeiro lançamento: roteamento do Magpie em tempo real, resumos de contexto e solicitações recentes na página principal, no Painel do notch e no Edge Dock. A ocultação das contas é compartilhada entre as visualizações. Suporte a inglês e chinês tradicional/simplificado.
