# REBANIA
## Modelo de negócios, produto e plano de implementação

Versão 1.0 • 08/10/2026 • Concepção para revisão

**Sua fazenda em dia.**

Decisões aprovadas: SaaS para pecuaristas; cliente inicial como piloto; cria, recria e engorda; marca agro moderna e humana; nome Rebania; implantação + mensalidade + pacotes de créditos de IA; identificação completa; web, PWA e aplicativos nativos Android/iOS; monorepo Turborepo, Docker e Nginx em VPS compartilhada.

Ainda não aprovados: desenho da logo, telas, preços, fornecedor de IA, hardware homologado e dimensionamento da VPS. A escolha do nome não comprova disponibilidade de marca ou domínio. Não houve consulta ao INPI nem teste do domínio. Esta especificação não representa software já implementado.

## 1. Visão e promessa

Rebania é a central operacional da fazenda de gado de corte: transforma identificação e registros de campo em histórico confiável, tarefas claras e decisões acompanháveis. O usuário escolhe entre toque, voz, câmera e leitor; todas as entradas usam as mesmas regras e permissões.

A promessa é reduzir o trabalho para manter a fazenda em dia, em vez de exigir que o produtor interprete dezenas de relatórios. Cada tarefa frequente segue três etapas significativas: **identificar, informar, confirmar**. Não são obrigatoriamente três cliques: ler dezenas de animais, corrigir dados ou revisar uma venda exige interações adicionais. Segurança e compreensão não podem ser sacrificadas para cumprir uma contagem artificial.

O produto deve ser completo sem apresentar toda sua complexidade na primeira tela. A profundidade aparece quando necessária, dentro da mesma jornada. Recursos centrais funcionam sem IA. O aplicativo nativo oferece acesso aos recursos do aparelho, não será apenas uma WebView.

## 2. Evidências e limites da pesquisa

Pesquisa de documentação pública oficial, realizada em 08/10/2026. Não foram acessadas contas pagas ou ambientes de demonstração. A lista consolida recursos publicamente documentados, não certifica todas as funcionalidades de cada plano, versão ou sistema. Ausência na pesquisa não significa ausência no produto. Conferir módulos e disponibilidade em demonstrações antes de fazer comparações comerciais.

| Referência | Recursos observados relevantes | Fontes |
|---|---|---|
| JetBov | Cria/recria/engorda, sanidade, pesagem e GMD, nutrição, gestão econômica, várias fazendas, manejo no curral, mapas de pastos, assistente Jay por áudio/texto com dados da fazenda | S1-S4 |
| iRancho | Rebanho individual, movimentações, financeiro, estoque, nutrição, manejos personalizados, agenda, protocolos reprodutivos, integração com balanças/RFID, relatórios, melhoramento e confinamento adicionais | S5-S7 |
| Ideagri Corte | Inseminação/cobertura, diagnóstico, estação de monta, repasse, parto/cria, TE/FIV, programação de IATF, aplicações sanitárias e rastreio de lotes de produtos; módulo IATF Desktop/Web | S8-S9 |
| Leigado Corte | Reprodução, partos, vacinação/exames, pesagem, alimentação, financeiro, estoque, sêmen/embriões e armazenamento, integrações e app offline | S10-S11 |
| CattleMax | Inventário, reprodução/prenhez, previsão de parto, nascimento, desmama, sanidade individual/coletiva, pastos, chuva, tarefas, equipamentos, financeiro e integrações | S12-S15 |
| inLida: descoberta adicional | Registros de animais, nascimento, reprodução, sanidade, pesagem, vendas, indicadores e uso offline; motivo para reconsiderar o nome Lida | S16 |

**Observado:** voz/IA, fotos e offline já existem em concorrentes. **Hipótese:** combinar jornadas completas, execução revisável, histórico visual e acompanhamento de pendências pode reduzir esforço e gerar preferência. Não alegar exclusividade sem validação competitiva.

Funcionalidades específicas de leite não entram no escopo de corte: ordenha, tanque, CCS/CBT, lactação, secagem, análise de leite e módulos para laticínios. Isso não deve excluir sanidade, reprodução ou gestão compartilhadas. Foram referências secundárias Procreare e outros produtos; não há evidência suficiente neste levantamento para atribuir a eles uma matriz completa.

## 3. Pessoas, contexto e problema

| Perfil | Necessidade | Experiência e permissão |
|---|---|---|
| Proprietário | Saber situação, prioridades e resultado da fazenda | Visão geral e gestão comercial; autorização de operações críticas |
| Gerente | Planejar e acompanhar execução | Equipe, tarefas, lotes, indicadores e revisão de conflitos |
| Funcionário de campo | Registrar rápido, sob sol e sem sinal | Modo Curral, leitura, fotos e tarefas atribuídas; financeiro restrito |
| Veterinário/inseminador | Executar protocolos e entregar histórico | Acesso concedido a propriedades e funções específicas |
| Administrativo | Conciliar estoque, documentos, despesas e receita | Financeiro e estoque; sem alterar diagnóstico técnico indevidamente |
| Suporte Rebania | Ajudar sem acessar dados indiscriminadamente | Acesso excepcional concedido, limitado no tempo e auditado |
| Operador da plataforma | Gerir contratos, implantação, planos e cobrança | Console próprio, separado das fazendas; sem acesso automático ao rebanho |

Hipóteses a validar: tamanho e composição do rebanho, uso de papel/planilha, equipamentos existentes, conectividade, tempo de manejo, vocabulário da equipe, responsabilidade por cadastros e frequência de vendas. Não foram realizadas entrevistas com o cliente.

## 4. Modelo de negócios

### Canvas

| Bloco | Proposta |
|---|---|
| Segmentos | Pecuaristas de corte com cria, recria, engorda ou ciclo completo; piloto inicial; expansão para organizações com várias fazendas |
| Valor | Menos retrabalho; histórico animal confiável; prioridades claras; manejo offline; execução em grupo; IA que ajuda a concluir tarefas |
| Canais | Implantação consultiva, indicação do cliente piloto, veterinários parceiros, demonstração com dados autorizados e conteúdo prático |
| Relacionamento | Treinamento por tarefa, migração assistida, acompanhamento inicial, suporte e revisão periódica do uso |
| Receitas | Implantação única, mensalidade recorrente, pacotes pré-pagos de IA; integrações especiais e migração fora do padrão como serviços separados |
| Atividades | Produto, homologação de aparelhos, onboarding, suporte, confiabilidade, segurança, atualização e acompanhamento do piloto |
| Recursos | Monorepo, domínio de pecuária, conectores, equipe de suporte, dados permissionados e documentação operacional |
| Parceiros | Veterinários, fornecedores de leitores/balanças, fornecedores de IA, pagamentos e infraestrutura |
| Custos | Desenvolvimento, manutenção, suporte, VPS/backup, mídia, tráfego, API de IA, pagamentos, lojas de apps e homologação |

### Oferta comercial

**Implantação:** levantamento operacional, configuração da organização/fazendas/equipe, importação com diagnóstico de qualidade, configuração de protocolos autorizados, treinamento e acompanhamento. Definir no contrato quantidade de fontes, horas e integrações incluídas. Não confundir implantação com financiamento integral do desenvolvimento do SaaS. Uma necessidade exclusiva do piloto tem orçamento e política de propriedade separados.

**Mensalidade:** acesso aos canais web/PWA/nativos, rebanho, manejo, agenda, histórico, permissões, sincronização, atualizações e suporte dentro do escopo. Recomenda-se lançar um plano completo, com limites claros de fazendas, animais ativos, usuários, mídia e suporte; expansão contratada conforme operação. Limites são capacidade contratual, não cobrança automática por cabeça. Não alterar para cobrança por animal sem decisão do usuário.

**Créditos de IA:** opcionais e compartilhados por organização, com limite por pessoa e finalidade. Sem créditos, cadastro, leituras, registro manual, protocolos determinísticos e relatórios convencionais continuam funcionando. Fotos e leitura manual não devem ficar bloqueadas por saldo de IA. Reconhecimento de foto/voz que use API informa custo e alternativa manual.

Não foram aprovados preços, tamanhos de pacotes, expiração ou renovação automática. Não habilitar expiração ou recarga automática sem aprovação. Pagamentos e publicação nas lojas exigem escolha de fornecedor, contas e revisão das regras vigentes de cada canal antes da execução.

### Formação de preço e viabilidade

Definir implantação por esforço + custos diretos + margem; mensalidade por infraestrutura alocada + suporte médio + manutenção + tributos/taxas + margem. Separar investimento inicial em desenvolvimento do custo recorrente. Calcular ponto de equilíbrio com custos fixos divididos pela contribuição média por cliente.

Para IA, usar unidade compreensível ao usuário e rate card versionado por ação, não expor tokens como linguagem principal. Fórmula de planejamento: preço líquido do crédito >= custo médio efetivo / (1 - margem alvo). Incluir modelo, áudio/imagem, câmbio, retries, ferramentas, cache, taxas e reserva. Custos reais devem vir dos provedores escolhidos; não prometer equivalência fixa entre um crédito e tokens.

Exemplo puramente didático: pacote a R$100, custo de API R$25 e custos variáveis R$15 gera contribuição de R$60 antes de despesas fixas. Isso não é oferta nem previsão validada.

Fluxo financeiro: compra aprovada por webhook verificado e idempotente; ledger de crédito; cotação antes da ação; reserva atômica; consumo confirmado uma vez; liberação em falha elegível; estorno auditado. Saldo concorrente nunca negativo. Não debitar o usuário duas vezes por retry interno. Cada lançamento registra organização, usuário, request_id, tipo, quantidade, fornecedor, custo efetivo e versão do rate card. Separar valor pago, saldo de crédito e consumo.

### Métricas e validação comercial

Métricas: tempo mediano por registro, tarefas concluídas, retrabalho, registros por sessão, conflitos de sync, retenção, ativação, custo de suporte, margem recorrente, custo de IA por ação e conversão de rascunhos em ações confirmadas. Resultados pecuários dependem de fatores externos; não atribuir aumento de prenhez ou lucro ao aplicativo sem estudo.

Alvos propostos para piloto: 90% das tarefas comuns concluídas sem ajuda após treinamento; zero perda conhecida em interrupções testadas; nenhum lançamento duplicado em retries; redução de 30% do tempo de registro contra linha de base medida. Revisar metas após entrevistas. Testar uma operação real autorizada durante um ciclo de manejo; não exigir espera de toda uma estação reprodutiva para validar a usabilidade.

## 5. Inventário funcional consolidado

Os itens abaixo são a especificação proposta do Rebania inspirada na pesquisa, não transcrição literal das capacidades de cada concorrente. **P1:** operação inicial de ciclo completo. **P2:** aprofundamento e expansão. **P3:** funções especializadas/futuras, preservadas no plano.

| Área | Funções e regras propostas | Entrega |
|---|---|---|
| Organização | Cadastro, várias fazendas, propriedades, equipe, papéis, convites, permissões por fazenda | P1 |
| Animal | ID interno estável, brinco visual, RFID, NFC, raça, sexo, nascimento, origem, categoria, situação, fotos e anotações | P1 |
| Genealogia | Mãe/pai conhecidos ou desconhecidos, histórico de filhos, vínculo da cria, origem do sêmen; genealogia avançada | P1/P2 |
| Inventário | Individuais e lotes, filtros, contagem, categorias, compra, venda, morte, descarte, transferência | P1 |
| Movimentação | Troca de lote/pasto/fazenda, data efetiva, responsável e histórico; desfazer por correção rastreável | P1 |
| Identificação | Cadastro e troca de identificadores, leitura, associação assistida, duplicidade, foto do brinco e busca manual | P1 |
| Mídia | Fotos/vídeos curtos/áudios/documentos associados ao animal ou evento; comparação cronológica e exportação | P1/P2 |
| Reprodução | Cio, inseminação/cobertura, sêmen, touro, inseminador, monta natural, repasse e estação de monta | P1 |
| IATF | Templates versionados, calendário de etapas, implante/retirada/inseminação, ocorrências e execução em grupo | P1 |
| Diagnóstico | Prenha/vazia/inconclusivo, data, profissional, evidência, estimativa de gestação e retorno programado | P1 |
| Gestação | Previsão com origem e incerteza, perdas gestacionais e atualização do estado reprodutivo | P1 |
| Nascimento | Parto, mãe, cria(s), sexo, brinco opcional inicial, peso opcional, assistência e intercorrências | P1 |
| Bezerros | Cuidados registrados, mortalidade, vínculo materno, acompanhamento, desmama e pesagem | P1 |
| Reprodução avançada | Ressincronização, TE/FIV, doadora/receptora, embrião congelado, acasalamento e estoque detalhado | P2/P3 |
| Genética | Programas de melhoramento, avaliações, DEPs e comunicação com associações mediante integração real | P3 |
| Sanidade | Vacinas, medicamentos, vermifugação, doença observada, exames, tratamentos, protocolos e calendário | P1 |
| Aplicação | Produto, dose/unidade, lote/validade, via, aplicador, motivo, animal/grupo, comprovante | P1 |
| Carência | Intervalo configurado por produto/protocolo técnico validado; pendência na venda e revisão autorizada | P1/P2 |
| Pesagem | Peso, data, equipamento/origem, histórico, GMD, peso na desmama e alertas de inconsistência | P1 |
| Produção | Cria, recria e engorda; lotes/coortes, desempenho, metas, períodos e comparações | P1/P2 |
| Pastos | Piquetes, lotação e movimentações; mapa com localização declarada e última atualização | P1/P2 |
| Pastagem avançada | Rotação, descanso, registro de manejo e capacidade configurada; mapas e consumo de geodados | P2 |
| Nutrição | Dieta e fornecimento por lote, suplemento, quantidade, custo, consumo e estoque | P1/P2 |
| Confinamento | Baias, entrada/saída de lotes, leitura de cocho, tratos, ocorrências, custo e fechamento | P2 |
| Automação de trato | Integração homologada com equipamentos; confirmação de origem e reconciliação | P3 |
| Estoque | Insumos, lotes, validade, localização, entrada/consumo/perda/ajuste; mínimos e rastreabilidade | P1 |
| Estoque reprodutivo | Doses, sêmen, touro, partida; botijão/caneca e embriões quando aplicável | P1/P2 |
| Financeiro | Despesas/receitas, contas a pagar/receber, fornecedores/clientes, caixa, rateio por animal/lote | P1/P2 |
| Resultado | Custos por animal/lote, custo da produção, margem e DRE gerencial com critérios declarados | P2 |
| Comercialização | Compra/venda, pesagem, documento, preço, comprador, carência e encerramento parcial do lote | P1/P2 |
| Abate | Retorno de frigorífico, rendimento e comparativo, quando houver dados/documentos reais | P2 |
| Agenda | Tarefas de hoje, atrasos, etapas recorrentes, atribuição, lembrete, checklist e conclusão | P1 |
| Manejo em grupo | Sessões, seleção estável de animais, vários eventos por animal, resumo e exceções | P1 |
| Relatórios | Operacionais, reprodução, sanidade, inventário, desempenho, financeiro; filtros e PDF/CSV | P1/P2 |
| Indicadores | Prenhez, nascimento, mortalidade, desmama, GMD e produtividade; fórmula/coorte/período visíveis | P1/P2 |
| Rastreabilidade | Eventos, anexos, identificadores e documentos; exportações SISBOV somente com layout validado | P2/P3 |
| Fazendas | Máquinas, veículos, patrimônio, manutenção, chuva, contatos e ocorrências | P2/P3 |
| Integrações | RFID, NFC, balanças, importação/exportação e API; melhoramento/fiscal/bancário se contratados | P1-P3 |
| Operação SaaS | Implantação, contratos, mensalidade, créditos, suporte, console e telemetria | P1 |

Não rotular P2/P3 como disponíveis antes de sua implementação. O produto completo é o conjunto do roadmap; lançamento inicial não terá todo o inventário simultaneamente.

## 6. Diferenciação proposta e critérios de prova

| Proposta | Trabalho reduzido | Como provar |
|---|---|---|
| Modo Curral contínuo | Formulários repetidos entre animais | Tempo por animal, erros e retomada após interrupção |
| Passaporte visual | Procurar informações em lugares distintos | Tempo para consultar histórico e completar registro |
| Registrar uma vez | Repetir evento em estoque, agenda e relatório | Reconciliação das transações e queda de retrabalho |
| Assistente de execução | Traduzir intenção em navegação e filtros | Rascunhos corretos e confirmados, custo e tempo |
| Pendências contextualizadas | Encontrar atrasos em vários relatórios | Tarefas reconhecidas e concluídas sem ajuda |
| IA desacoplada | Dependência de fornecedor único e custos ocultos | Troca de adapter e operação manual sem API |
| Sessões offline confiáveis | Parar o manejo por falta de sinal | Teste em modo avião, reinício, concorrência e sync |

O diferencial comercial proposto é a combinação e qualidade de execução, não uma alegação de ser o primeiro app com essas funções.

## 7. Arquitetura da experiência

Navegação principal mobile: **Hoje • Rebanho • Registrar • Agenda • Fazenda**. Registrar é ação central. Reprodução, Sanidade e Produção são visões e jornadas do mesmo rebanho; não criam cadastros paralelos. No desktop há atalhos adicionais, sem alterar o significado das cinco áreas.

Hoje: prioridades justificadas, tarefas e próximo manejo; poucos indicadores adequados ao papel. Rebanho: lista, filtros, lotes e passaporte. Registrar: nascimento, reprodução, sanidade, peso, movimento, trato e ocorrência. Agenda: tarefas, calendário e etapas. Fazenda: pastos, equipe, estoque, financeiro, relatórios, plano e configurações.

Assistente acessível por uma barra contextual e dentro das áreas. Nunca exigir chat para tarefas básicas. Console SaaS separado. Landing pública explica benefício, canais, demonstração e modelo de cobrança sem preços não aprovados. Onboarding reaproveita a implantação: confirmar fazenda, conhecer equipe, iniciar primeira tarefa. Importação usa preparar arquivo, revisar inconsistências, confirmar lote.

### Jornadas de três etapas

| Jornada | 1. Identificar | 2. Informar | 3. Confirmar e resultado |
|---|---|---|---|
| Nascimento | Selecionar mãe | Data, sexo, identificação e intercorrência; foto/peso opcionais | Revisar; criar cria e parto numa transação; sugerir próximas tarefas |
| Inseminação | Selecionar matriz/grupo | Data, sêmen/touro, profissional e protocolo | Revisar; registrar e gerar acompanhamento configurado |
| Diagnóstico | Selecionar matrizes | Resultado, data e evidência | Atualizar estado e tarefas; origem da previsão visível |
| Vacinação | Selecionar grupo/protocolo | Produto, aplicação, lote e responsáveis | Revisar total e exceções; gravar histórico/consumo/agendamento |
| Pesagem | Ler animal ou grupo | Receber peso estável ou digitar | Confirmar; gravar e recalcular GMD quando houver base |
| Transferência | Selecionar animais | Destino e data | Confirmar; atualizar localização e preservar histórico |
| Trato | Selecionar lote/baia | Dieta e quantidade | Confirmar; consumir estoque e atualizar custos |
| Venda | Selecionar animais/lote | Comprador, peso, preço e documento | Revisar carências; confirmar baixa/receita e evidência |
| Fotos | Selecionar animal/evento | Fotografar ou selecionar | Revisar; salvar contexto e mostrar upload pendente |
| Ação por voz | Interpretar intenção e alvos | Revisar campos e resolver ambiguidades | Confirmar alteração com recibo e próximos passos |
| Relatório | Selecionar pergunta/área | Período, coorte e filtros | Ver resultado; compartilhar/exportar segundo permissões |
| Créditos | Escolher pacote | Revisar preço/condições e pagamento | Confirmar; acompanhar aprovação e saldo |
| Conflito de sync | Selecionar pendência | Comparar versões e consequência | Resolver com trilha de auditoria, sem apagar silenciosamente |

Não presumir aplicação em todos os animais selecionados: permitir marcação individual dos efetivamente manejados. Antes de gravar grupos, mostrar snapshot de IDs, quantidade, exceções e impactos. Alteração de filtro não muda o grupo já confirmado.

### Modo Curral

Configurar manejo e insumos uma vez; leitor identifica; peso chega da balança; operador confirma eventos efetivamente realizados; avançar para próximo. Leituras repetidas são suprimidas por sessão sem ocultar retorno intencional. Desconectar equipamento permite digitação. Identificador desconhecido leva a associação/cadastro mínimo revisado. Reinício retoma a sessão. Encerrar mostra realizados, pendentes, exceções e sync.

### Estados e recuperação

Especificar em todas as jornadas: vazio, carregamento, erro, parcial, offline, sincronizando, conflito, duplicidade, sessão expirada, sem permissão e sucesso. Mensagens dizem o que ocorreu e como corrigir. Sucesso local: “Salvo no aparelho. Enviaremos quando houver conexão.” Sucesso remoto: “Registrado e sincronizado.” Não confundir os dois. Salvar rascunhos; refresh não fecha drawers nem limpa formulário. Correção cria versão/evento rastreável e recalcula efeitos derivados.

## 8. Identificação e mídia

RFID pecuário LF 134,2 kHz, ISO 11784/11785 HDX/FDX-B, exige leitor compatível. Não é lido pelo NFC comum do celular. NFC direto exige tags compatíveis; não presumir qualquer brinco. Integrar bastões/balanças por BLE, HID, USB ou protocolos do fabricante conforme cada plataforma e equipamento. Bluetooth Classic/SPP não é universal no iOS. Homologar a combinação modelo de leitor + versão de firmware + Android/iOS + tipo de tag, documentando limitações [S17-S20].

ID interno do animal nunca muda. Identificadores são aliases com tipo, valor, validade, status, origem e histórico. Não usar UID NFC como prova de propriedade ou autenticação: pode ser copiado. Leituras apenas localizam registros autorizados. Brinco visual tem unicidade conforme política da fazenda; ID eletrônico tem escopo e regras documentados. Retag exige autorização e preserva aliases antigos.

Câmera: foto do animal, escaneamento QR e OCR do número do brinco. OCR apresenta candidatos/confiança e pede confirmação em ambiguidade. Fotos não comprovam identidade, peso, prenhez ou diagnóstico. Visão computacional mais avançada fica em pesquisa com dados e métricas validados.

Mídia: original opcional, derivados WebP/JPEG, miniatura, data/categoria/autor, animal/evento, checksum e upload retomável. Remover metadados sensíveis quando dispensáveis. Evitar envio automático de geolocalização. Galeria permite comparar períodos e compartilhar relatório selecionado, sem tornar o rebanho público. Conteúdo de pessoas tem permissão própria. Limites e custo de vídeo explícitos.

| Capacidade | Android/iOS nativo | Web/PWA |
|---|---|---|
| Cadastros e manejos | Sim; persistência local | Sim; dados offline previamente baixados |
| Câmera/fotos/QR | APIs nativas | Câmera em HTTPS e alternativa por upload |
| NFC | Tags/aparelhos compatíveis, permissões e módulo nativo | Detecção de suporte; Web NFC/NDEF tem alcance limitado, não prometer no Safari/iOS |
| RFID LF | Leitor externo homologado | Leitor HID/arquivo ou ponte homologada; fallback manual |
| Balança | Adapter homologado | HID/arquivo/ponte conforme equipamento |
| Sync em segundo plano | Conforme limites do sistema; retomada ao abrir | Não garantir background contínuo; retomar em foreground |
| Push | Permissões e configuração APNs/FCM | Depende do navegador, instalação e permissões |
| IA por API | Requer conexão; rascunho local e alternativa manual | Requer conexão; mesma política |

## 9. Assistente, agentes e preparação para o futuro

Camadas: regras determinísticas de domínio; consultas permissionadas; ferramentas tipadas; IA via adapter; revisão/confirmacão; acompanhamento de tarefas. Não permitir SQL livre criado pelo modelo nem acesso irrestrito ao banco. Cálculos, saldo, GMD e efeitos contábeis são código testado.

Exemplos: “Mostre as matrizes sem diagnóstico nesta estação”; “Prepare a vacinação dos animais do lote 04”; “Registre o nascimento da cria da 284”; “Compare o custo dos dois lotes”; “Prepare um resumo para a reunião”. Sempre apresentar período, data de atualização e origem. Não confundir IA, inseminação artificial, com IA, inteligência artificial: labels completos na interface.

Ferramentas iniciais: searchAnimals, getAnimalHistory, listDueTasks, getHerdMetrics, prepareBirth, prepareMating, prepareHealthEvent, prepareMovement, prepareTask, quoteAiAction, confirmDraft. IDs e tenant derivam da sessão, não de instruções do usuário ao modelo. Confirmação de rascunho usa hash/versionamento e revalida regras, autorização e saldo; não repetir mutação em retry.

Agentes especializados: agenda (pendências determinísticas); registros (extração e rascunhos); gestão (análise com evidências); qualidade de dados (duplicidades/inconsistências); apoio operacional (rascunhos de planos). Implementar como jobs e ferramentas do mesmo backend, sem multiplicar serviços pesados. Autonomia futura somente por políticas explícitas, escopo, prazo, limites e revogação.

| Tarefa de IA | Entrada | Saída/controle | Alternativa e custo |
|---|---|---|---|
| Voz para registro | Áudio autorizado + contexto | Campos tipados; ambiguidades; revisão | Formulário; orçamento/limite antes do processamento |
| OCR do brinco | Foto selecionada | Candidatos; nunca associação automática incerta | Digitar/ler; custo se API |
| Análise do rebanho | Agregações e registros autorizados | Resposta com IDs/fontes/período | Relatório convencional; cotação |
| Preparar tarefa | Intenção + alvos válidos | Rascunho com impactos e responsáveis | Agenda manual; confirmação |
| Resumo periódico | Regras/configuração + dados | Resumo rastreável | Relatório; agendamento com teto de créditos |

Minimizar dados enviados. Anexos/importações são dados não confiáveis, não instruções ao agente. Logs ocultam segredos e dados desnecessários. Avaliar retenção de cada provedor e firmar política de uso. Dados de uma fazenda não treinam modelos ou alimentam benchmarking público por padrão. Qualquer uso secundário exige decisão e autorização próprias.

Provedor inicial não escolhido: adapter para texto estruturado, áudio e visão; definir timeout, budget, cache tenant-aware, retry com backoff, circuit breaker e fallback. Falha na API nunca bloqueia o manejo manual. Sem internet, a IA via API não funciona; guardar pedido pendente só com consentimento, custo visível e revisão posterior.

Não criar diagnósticos veterinários definitivos ou protocolos de medicamentos inventados. Apoiar registro, consulta e organização; recomendações técnicas dependem de profissional e regras validadas.

## 10. Dados e regras de domínio

Entidades: Organization, Farm, User, Membership, Role, Animal, AnimalIdentifier, Parentage, Group, Pasture, Pen, MembershipHistory, HandlingSession, AnimalEvent, EventCorrection, WeightMeasurement, BreedingEvent, BreedingSeason, ReproductiveProtocolVersion, ProtocolExecution, PregnancyCheck, Birth, CalfLink, HealthApplication, Treatment, WithdrawalPeriod, Product, ProductBatch, StockMovement, SemenBatch, FeedingEvent, CommercialTransaction, FinancialEntry, Attachment, Task, Notification, SyncMutation, AuditEntry, AiDraft, AiUsage, CreditLedger, Contract, Subscription, Invoice e PaymentEvent.

Domínio implementado com tabelas tipadas e projeções de histórico; não substituir tudo por um JSON genérico. Histórico append-only e correções versionadas não exigem adotar event sourcing integral. Relações usam constraints e chaves compostas tenant-aware quando pertinente.

Regras: sexo/categoria compatíveis com evento; data não anterior ao nascimento; parto pode gerar múltiplas crias; origem do pai pode ser desconhecida/touros múltiplos e não deve ser inventada; previsão de parto é estimativa; diagnóstico pode existir com exposição estimada/desconhecida e deve marcar qualidade; morte/venda encerra situação ativa sem apagar histórico; movimentos têm data efetiva; saldo de estoque e financeiro têm reconciliação; não reabrir animal vendido em sync silenciosamente.

GMD = diferença de peso / dias entre medições válidas, mesma unidade e intervalo positivo. Peso vivo em kg não é automaticamente arroba de carcaça: qualquer estimativa usa rendimento explicitamente informado e distingue estimativa do resultado real. Taxa de prenhez define denominador por coorte/estação; ausência de diagnóstico não equivale a vazio. Indicadores incompletos mostram cobertura de dados.

Datas civis da fazenda usam timezone configurado; timestamps técnicos em UTC. DB em snake_case e contratos em camelCase. Valores monetários/quantidades com decimal e unidades; não floats para saldo. Permissões e validade de identificadores verificadas no servidor.

## 11. Offline, sincronização e confiança

Nativo: SQLite com armazenamento protegido conforme plataforma, credenciais em Keychain/Keystore. Web: IndexedDB para registros operacionais mínimos, cookies httpOnly/Secure/SameSite para autenticação; não guardar tokens em localStorage. Dados offline têm seleção por fazenda/lote, limites, expiração de autorização e remoção no logout. Estabelecer regra para aparelho compartilhado e operações pendentes antes de apagar cache.

Envelope de mutação: mutationId UUID, tenantId derivado/validado, farmId, deviceId, actorId, entityId, expectedVersion, occurredAt, createdAt, schemaVersion, payload, attachmentRefs. API responde accepted/rejected/conflict, versão e cursor. Repetir mutationId retorna mesmo recibo, sem reexecutar.

Append de pesagens/fotos pode coexistir; alterações conflitantes de situação, venda, retag ou lote exigem regra específica ou revisão. Não aplicar last-write-wins universal. Sync incremental com cursor/tombstones, outbox, lote limitado, backoff e observabilidade. Data do aparelho não decide prioridade de versão. Autorização é revalidada no recebimento; revogação offline não pode ser instantânea, por isso usar concessão com prazo e comunicar limite.

Estoque e grupo: servidor valida saldo/versão; evento registrado offline pode ficar pendente de reconciliação administrativa sem desaparecer. Requisição online transacional é atômica; batch offline fornece resultados individuais e permite corrigir rejeitados. IA/compra de créditos não depende de saldo local cacheado para confirmar cobrança. Uploads separados são retomáveis; evento indica anexo pendente até concluir.

## 12. Arquitetura técnica proposta

Recomendação sujeita à compatibilidade vigente na implementação: pnpm + Turborepo + TypeScript; web React/Vite com PWA; nativo React Native/Expo development builds; API Node/Fastify com módulos de domínio; Prisma/PostgreSQL; worker leve usando fila persistente PostgreSQL com locks/retries. Redis não entra inicialmente sem necessidade medida. Expo Go não basta para módulos nativos de NFC/BLE; homologar development builds e builds de loja [S21-S22].

```
apps/
  web/            # web responsiva + landing + PWA
  mobile/         # React Native, Android e iOS
  api/            # REST/OpenAPI, auth, domínio, sync, IA
  worker/         # jobs, mídia, notificações, relatórios
packages/
  domain/         # regras puras, políticas e métricas
  contracts/      # schemas, DTOs, OpenAPI/client
  db/             # Prisma, migrations e repositories
  sync-core/      # protocolo, outbox, merge policies
  ai-gateway/     # adapters, tools, quotes e budgets
  hardware/       # interfaces + adapters por plataforma
  design-tokens/  # cores, espaços e semântica
  ui-web/         # componentes DOM acessíveis
  ui-native/      # componentes nativos
  config/         # lint, TS e build
infra/
  docker/         # imagens multi-stage
  nginx/          # configuração do app/proxy
  compose/        # produção e desenvolvimento
docs/
  goals/ adr/ runbooks/ acceptance/
```

Compartilhar contratos, regras, sync e tokens; não forçar compartilhamento integral de UI DOM/nativa. Identificação é adapter com capability detection e fallback. OpenAPI versionada; clients gerados/validados. Testes selecionados: Vitest para regras, integração com PostgreSQL, Playwright web e ferramenta mobile adequada após compatibilidade. Nenhuma versão flutuante `latest`; fixar versões suportadas no lockfile e justificar bibliotecas.

### VPS compartilhada

Não substituir CyberPanel/LiteSpeed ou proxy existente sem auditoria e decisão. Fazer inventário de portas, domínios, certificados, RAM, CPU, disco, containers e política de backups antes do deploy. Dois caminhos: proxy Nginx central já existente roteia por domínio ao Nginx interno Rebania; ou proxy existente roteia para uma porta loopback dedicada do Nginx Rebania. Uma nova porta 80/443 não pode disputar bind com o serviço atual. Usuário aprovou Docker/Nginx para o app, não reinstalação da VPS.

Containers: Nginx/arquivos web; API; worker; PostgreSQL dedicado ou instância existente com DB/usuário isolados após avaliação. Expor somente ingress necessário; API/DB internos. Não instalar Redis, MinIO, Elasticsearch ou GPU só por conveniência. Mídia em volume persistente com backup inicial, migrável para storage S3-compatible quando justificar. Backend protege acesso a fotos com autorização e URLs expirantes.

Build fora da VPS preferencialmente; imagem multi-stage, usuário sem root, dependências de produção, health checks, init, shutdown gracioso, labels por projeto, logs com rotação e limites de CPU/RAM dimensionados por medição. Não prometer capacidade sem conhecer a máquina. Medir RSS idle/pico, conexões DB, mídia e duração de jobs; orçamento de memória total deixa margem para SO e outras apps. Worker limitado e desativa processamento pesado local de vídeo.

Secrets fora do git. Volumes separados e nomeados; nunca `docker compose down -v` em produção. Migrações com backup e compatibilidade entre releases; smoke tests; rollback de imagem e migrações quando tecnicamente possível. Backup DB/mídia fora da mesma VPS, restauração testada, RPO/RTO acordados. Retenção apenas de imagens Rebania obsoletas por digest/labels; nunca prune global. TLS, headers, upload limit, rate limiting e autenticação em logs. Builds nativos Android/iOS são pipeline separado; Linux VPS não substitui Xcode/macOS para build local iOS.

## 13. Segurança e governança

Isolamento de organização/fazenda no repositório, serviços e ferramentas de IA, com testes de acesso cruzado. Papéis mínimos. Convites expiram; MFA para papéis críticos; sessões revogáveis; proteção CSRF onde aplicável. Mobile usa tokens curtos, rotação e storage seguro. Anexos verificados por MIME real, tamanho, extensão permitida e análise apropriada. Downloads protegidos e shares revogáveis.

Auditar registro/correção, venda, retag, acesso de suporte, crédito e mutações de IA. Dados de pessoas minimizados, exportação/remoção segundo política e obrigações contratuais. Dados dos animais continuam vinculados à operação e não devem ser publicados sem autorização. Definir política de retenção, propriedade dos dados e portabilidade no contrato. Não alegar certificação SISBOV ou conformidade legal integral sem processo próprio.

## 14. Marca e direção visual proposta

Nome aprovado: **Rebania**. Palavra associada a rebanho e inteligência; texto da marca em minúsculas. Tagline proposta: “Sua fazenda em dia.” Logo conceitual nas pranchas: laço orgânico que sugere cabeça bovina e continuidade, verde profundo com acento ocre. Essa descrição não equivale a logo final registrada ou arquivo vetorial aprovado.

Paleta candidata: verde #163E32; fundo #F7F4ED; sálvia #DDE6D8; ocre #C48A38; texto #182A24. Ocre não deve ser usado como texto pequeno sobre branco sem teste. Tipografia candidata: sans de leitura clara, como Source Sans 3; confirmar licença e rendimento. Corpo mobile 16px como referência, alvos 48px para uso em campo, contraste WCAG 2.2 AA validado por par real. Estados nunca só por cor.

Fotografia traz o animal e contexto, sem paisagem pesada atrás de formulários. Pranchas têm decoração editorial; essa moldura não deve ser copiada como fundo permanente do app. Layout mobile em 360/390/430px; tablet 768/1024; desktop 1280/1440; intermediários e zoom 200%. Ícones familiares com labels. Drawer consistente no desktop, página/sheet contextual no mobile; não multiplicar modais. Movimento breve e reduzível.

As imagens são propostas para revisão e usam dados ilustrativos, não dados reais. A primeira prancha contém datas ilustrativas antigas e exemplos de assistência que não são regras clínicas. A especificação textual prevalece: não copiar datas, indicadores, nomes de produtos ou diagnóstico incoerente como dados de produção. A segunda prancha exibe estados de conectividade em áreas distintas: a implementação deve apresentar um estado único e coerente por sessão.

Após aprovação visual: gerar logo isolada PNG transparente, versões monocromáticas/clara/escura e ícone em resoluções exatas; produzir assets autorizados e especificação final. Não recortar pranchas como assets de produção.

## 15. Plano por fatias verticais

Cada fase entrega interface, dados, API, permissões, teste e documentação; não concluir só o frontend. O ciclo completo começa em P1; recursos especializados aprofundam depois. Não iniciar todas as fases simultaneamente.

| Goal | Resultado e áreas | Aceite principal | Risco/retorno |
|---|---|---|---|
| G0 Descoberta | docs, entrevistas, dados, equipamento, VPS, ADRs, aprovações | Escopo/identidade e baseline registrados | Evitar promessa sem hardware/servidor |
| G1 Fundação | apps, db, contratos, autenticação, tenant, deploy local | Isolamento e login nos três canais; migrations | Reverter release; preservar dados |
| G2 Rebanho offline | cadastro, identificadores, mídia, sync, importação, passaporte | Criar/editar/reiniciar/sync sem perda nem duplicação | Conflitos e migrador versionados |
| G3 Reprodução/cria | inseminação, IATF, diagnóstico, parto, desmama | Mãe/cria/transações/tarefas corretas; múltiplas crias | Correções rastreáveis |
| G4 Sanidade/curral | sessões, vacina, tratamento, estoque, leitores, balança | Offline/grupo/exceções; aparelho homologado | Fallback manual; estoque reconciliado |
| G5 Recria/engorda | pesagem, GMD, pastos, trato básico, compra/venda, custos | Ciclo completo operável com indicadores auditáveis | Não confundir kg vivo/arroba |
| G6 Comercial/IA | console, contrato, mensalidade, pagamento, ledger, assistant | Webhooks idempotentes, saldo concorrente, tool permissions | Manual mantém operação; falha libera reserva |
| G7 Lançamento | QA, mobile store builds, backup/restore, observabilidade, piloto | Jornadas reais, performance e suporte; release aprovado | Rollback e restauração ensaiados |
| G8 Profundidade | confinamento, DRE, genética/TE/FIV, conectores avançados | Aceites próprios por módulo | Feature flags; contratos e migrações |

Para cada goal criar `docs/goals/Gx.md` com arquivos/símbolos realmente existentes após inspeção, endpoints, migrações, responsabilidade, métricas, testes, risco e rollback. Os caminhos acima são propostas para projeto novo, não resultado de auditoria de um repositório existente.

### Endpoints iniciais propostos

`/v1/auth/*`, `/v1/farms`, `/v1/animals`, `/v1/animals/:id/history`, `/v1/identifiers/resolve`, `/v1/handling-sessions`, `/v1/events/birth`, `/v1/events/breeding`, `/v1/events/pregnancy`, `/v1/events/health`, `/v1/events/weight`, `/v1/events/movement`, `/v1/tasks`, `/v1/stock`, `/v1/reports`, `/v1/sync/push`, `/v1/sync/pull`, `/v1/media/uploads`, `/v1/ai/quotes`, `/v1/ai/drafts`, `/v1/ai/drafts/:id/confirm`, `/v1/credits`, `/v1/billing/webhooks`. Autorização, idempotency key, schema e limites em cada contrato.

### Testes obrigatórios de valor

1. Cliente A não consulta/altera dados, fotos, relatórios ou tools do cliente B.
2. Registrar nascimento com duas crias; retry não duplica; corrigir preserva histórico.
3. Vacinar 35 selecionados e confirmar só 32; estoque/agenda refletem os 32.
4. Modo avião, 100 eventos, fechar/reabrir app, reconnect; nenhum perdido/duplicado.
5. Dois dispositivos alteram lote/venda; conflito exige política e evidencia consequência.
6. Leitor repetido/desconectado e identificador desconhecido; fallback mantém sessão.
7. GMD com data igual/invertida e peso incoerente; denominador zero impedido.
8. IA tentando tenant alheio, instrução maliciosa em anexo ou alteração sem confirmação; impedir.
9. Dois consumos de IA em saldo limitado, retry e webhook duplicado; ledger consistente.
10. Créditos zerados ou API indisponível; manejar e consultar relatórios manuais normalmente.
11. Restauração DB + mídia em ambiente separado; verificar vínculos e permissões.
12. Android/iOS físicos, 360px, tablet, teclado, leitor de tela, zoom, conexão lenta e conteúdo longo.

## 16. Prompt mestre para Codex ou Claude

Copie o bloco abaixo junto deste documento e do caderno visual. O prompt inicia trabalho concreto sem autorizar publicação ou decisões visuais ainda pendentes.

```text
Você é responsável por implementar o REBANIA como um produto completo de gestão de gado de corte, com ciclo de cria, recria e engorda. Leia integralmente Rebania_Modelo_de_Negocios_e_Implementacao.md e Rebania_Pranchas_e_Experiencia.pdf. A especificação textual prevalece sobre dados ilustrativos das imagens.

DECISÕES APROVADAS
- SaaS para pecuaristas, várias organizações/fazendas; cliente inicial piloto.
- Nome Rebania; marca agro moderna e humana. Logo/telas ainda são propostas: verificar o registro de aprovação antes de implementar essa direção visual.
- Cobrança: implantação + mensalidade + pacotes de créditos de IA. Não substituir por cobrança por cabeça. Preços/provedor de pagamento/IA ainda não definidos.
- Web responsiva + PWA e aplicativo NATIVO Android/iOS, sem reduzir o nativo a WebView.
- Monorepo pnpm/Turborepo/TypeScript; Docker/Nginx numa VPS que já hospeda outras aplicações.
- Identificação por RFID pecuário via leitor homologado, NFC compatível, câmera/QR/OCR e digitação. Não afirmar que NFC do celular lê RFID LF 134,2 kHz.
- Dados reais do banco, persistência, permissões, histórico e operação offline. Fixtures apenas em testes/demonstração explicitamente separada.

COMECE AGORA
1. Leia AGENTS.md e instruções do repositório; inspecione o workspace. Preserve projetos existentes. Se o projeto for novo, crie a estrutura proposta sem tocar em apps vizinhas.
2. Produza docs/DECISIONS.md com aprovado/proposto/pendente; docs/GOALS.md com G0-G8, dependências e critérios; matriz funcional rastreável ao documento; ADRs para stack, sync, tenancy, IA e deployment.
3. Faça no máximo três perguntas materiais por rodada. Continue tarefas independentes. Não invente credenciais, preços, hardware, capacidade da VPS ou dados do cliente. Aprovação de visual/publicação é decisão específica, não presumida.
4. Se o visual ainda estiver pendente, avance contratos, domínio, migrações, estrutura, testes e documentação; não implemente silenciosamente o novo conceito visual. Depois da aprovação, execute G1 em fatias verticais e prossiga nos goals autorizados.

EXPERIÊNCIA
Use Hoje, Rebanho, Registrar, Agenda e Fazenda. Projetar tarefas frequentes em identificar -> informar -> confirmar, sem esconder decisões nem contar artificialmente três cliques. Modo Curral contínuo, seleção snapshot, registro por grupo com exceções, passaporte com fotos/timeline. Não exigir chat para tarefas básicas. Refresh não fecha drawers, perde rascunho ou muda seleção.

ARQUITETURA
Compartilhe domain, contracts, db, sync-core, ai-gateway, hardware e tokens. Separe UI web e nativa. Sugestão técnica: React/Vite PWA, React Native/Expo development builds, Node/Fastify, Prisma/PostgreSQL, worker com fila persistente PostgreSQL; confirme compatibilidade e fixe versões. Não adicione Redis/MinIO/GPU sem justificativa medida. API REST/OpenAPI versionada, contratos validados e autenticação adequada por canal.

OFFLINE E DOMÍNIO
SQLite nativo, IndexedDB web para dados operacionais; credenciais nativas em storage seguro e cookies httpOnly no web, sem tokens em localStorage. Outbox/cursor/idempotência/versionamento/conflitos por tipo; não usar last-write-wins universal. Transações em nascimento/estoque/financeiro; unidades/decimais/coortes explícitos. Morte/venda e retag nunca apagam histórico. RFID/NFC são aliases, não autenticação. Falha de leitor mantém fallback manual.

IA E COMERCIAL
Ferramentas tipadas e tenant-scoped, cálculos determinísticos, resposta com evidências, ambiguidades explícitas e rascunho revisável. Mutação somente após confirmação autenticada e revalidação. Sem SQL livre do modelo. Gateway desacoplado, budget/timeout/circuit breaker/fallback. API pode falhar; manejo manual continua. Créditos em ledger, quote/reserve/consume/release atômicos e idempotentes; webhooks verificados. Não realizar recomendação veterinária definitiva nem vender identificação/peso por foto sem validação.

DEPLOY
Audite portas, proxy, certificados, memória, disco e apps existentes antes de alterar VPS. Use Nginx do app atrás do ingress existente ou porta loopback dedicada, sem disputar 80/443. API/DB internos, volumes separados, secrets fora do git, logs rotacionados, limites medidos, build preferencialmente fora da VPS. Não reinstale servidor nem use prune global ou compose down -v. Backup externo e restore testado antes de publicação; rollback documentado. iOS precisa pipeline Apple/macOS ou serviço compatível, não build local na VPS Linux.

EXECUÇÃO E ACEITE
Cada goal entrega front/native, API, DB, permissões, testes e runbook. Mantenha docs/STATUS.md com implementado/testado/pendente e evidências. Teste isolamento tenant, retry duplicado, grupo parcial, offline/reinício, conflito entre aparelhos, GMD/unidades, crédito concorrente, falha de IA, hardware físico, acessibilidade e restore. Não marque fase concluída só por build ou screenshot. Não publique nem envie para lojas sem autorização específica. Ao concluir, relate resultado, validação e pendências com caminhos reais.
```

## 17. Decisões seguintes, sem bloquear trabalho independente

Revisar logo/telas; entrevistar cliente; obter planilha e modelos de brincos/leitor/balança; medir VPS; aprovar preços e condições; escolher provedores de IA/pagamento e canal de suporte; definir orçamento e cronograma. Implementação de capacidades técnicas não exige refazer o modelo comercial aprovado.

## 18. Fontes consultadas

Fontes públicas consultadas em 08/10/2026. Documentação antiga serve para identificar capacidades, não garante oferta comercial atual. Nenhum trecho extenso foi reproduzido.

- S1 https://jetbov.com/
- S2 https://jetbov.com/novo-app-de-curral/
- S3 https://jetbov.com/conheca-o-aplicativo-de-pasto/
- S4 https://jetbov.com/aplicativo-do-gestor-ia/
- S5 https://www.irancho.com.br/
- S6 https://www.irancho.com.br/irancho-confinamento/
- S7 https://www.irancho.com.br/irancho-lanca-aplicativo-para-gerenciar-periodo-de-reproducao-bovina/
- S8 https://centralderecursos.ideagri.com.br/posts/existe-uma-descricao-resumida-das-principais-funcionalidades-do-ideagri
- S9 https://centralderecursos.ideagri.com.br/ideagri-corte
- S10 https://leigado.com.br/software-gado-de-corte
- S11 https://leigado.com.br/aplicativo-gado-de-corte
- S12 https://www.cattlemax.com/cattle-inventory-records
- S13 https://www.cattlemax.com/cattle-breeding-pregnancy
- S14 https://www.cattlemax.com/calving-records
- S15 https://www.cattlemax.com/
- S16 https://www.inlida.com.br/
- S17 https://www.allflex.global/wp-content/uploads/2021/06/LPR_2-pager-A4_Eng_March-21.pdf
- S18 https://www.allflex.global/in/wp-content/uploads/sites/20/2021/06/AWR250_2_A4_Eng_September-2020_low.pdf
- S19 https://developer.apple.com/documentation/corenfc
- S20 https://developer.chrome.com/docs/capabilities/nfc
- S21 https://docs.expo.dev/workflow/customizing/
- S22 https://docs.expo.dev/develop/development-builds/introduction/

## 19. Registro de aprovação

| Decisão | Estado |
|---|---|
| Nome Rebania | Aprovado pelo usuário |
| SaaS/ciclo completo/marca humana | Aprovados |
| Implantação/mensalidade/créditos | Aprovados |
| Identificação completa e canais | Aprovados |
| Logo e direção das pranchas | Aguardam revisão |
| Preços, IA, hardware e infraestrutura detalhada | Propostas/pendências |
| Implementação/publicação | Documento de orientação; nenhuma implementação ou publicação executada |
