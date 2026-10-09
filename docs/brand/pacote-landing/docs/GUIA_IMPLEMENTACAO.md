# Rebania - Landing revisada e assets

Versão 1.0, 08/10/2026. Escopo: análise da prancheta, revisão visual e pacote de assets. Não é aplicação publicada ou software funcional de gestão pecuária. A nova composição permanece sujeita à revisão do usuário.

## Resultado da análise

Nenhum elemento visual precisa de tecnologia experimental. Fotos e marca são PNG; o restante é HTML semântico e CSS Grid/Flexbox, com componentes de ícones existentes. A análise estrutural está acompanhada de um exemplo de componentes em `reference/componentes.html`. A verificação automática de renderização ficou pendente porque este ambiente não possui o navegador Chromium instalado; responsividade, contraste e aparência devem ser conferidos no navegador antes da produção. A página completa e o backend não foram implementados neste pacote.

As fotografias são recriações separadas inspiradas na cena anterior, não recortes pixel a pixel da prancheta antiga. A composição revisada foi gerada com esses arquivos como referências. Ela é uma direção visual, não garante reprodução exata de cada pixel por HTML. O arquivo de copy e as regras abaixo prevalecem sobre texto ilustrativo da imagem.

## Preservar, corrigir e simplificar

| Classificação | Decisão | Motivo |
|---|---|---|
| Preservar | Verde profundo, ocre, fundo claro, cenas de campo e nome | Continuidade da identidade |
| Preservar | Logo com cabeça bovina e brinco | Última identidade escolhida pelo usuário |
| Corrigir | Logo abstrata dentro das telas anteriores | Inconsistência com a marca atual |
| Simplificar | Painel sem perspectiva 3D | HTML legível e responsivo |
| Integrar | Uma foto hero reutilizada no assistente | Menos arquivos e unidade visual |
| Corrigir | Texto/controles separados das imagens | Acessibilidade, SEO e adaptação |
| Simplificar | Molduras de dispositivo por CSS | Evitar render externo e screenshot fixo |
| Corrigir | “Nunca mais perca” e garantias absolutas | Benefício não é garantia operacional |
| Integrar | CTAs apontam a #demonstracao | Destino claro; não inventar contato |
| Não alterar | Modelo comercial implantação/mensalidade/créditos | Decisão já aprovada |

## Inventário de arquivos de imagem

O `manifest.json` contém dimensões reais, alpha, bytes, checksum e uso. Não anunciar 4K: os arquivos foram gerados em resoluções nativas descritas no manifesto.

| Arquivo | Aplicação | Comportamento |
|---|---|---|
| assets/brand/rebania-logo.png | Navbar, footer e prévias | PNG transparente; marca na fonte desenhada, não reconstruir texto com fonte aproximada |
| assets/brand/rebania-symbol.png | Avatar do assistente/ícone bovino | Transparente, dentro de área clara; não usar verde sobre verde |
| assets/brand/rebania-logo-reference.png | Referência da última logo original | Preservada sem modificações; não necessária no carregamento público |
| assets/photos/hero-rancher.png | Hero e foto contextual do assistente | Reutilizar o mesmo arquivo; object-position 68% 45%; revisar por largura |
| assets/photos/animal-history.png | Histórico, ficha e miniaturas | Mesmo arquivo em vários tamanhos de apresentação; object-position 40% 50% |
| assets/photos/pasture-cta.png | CTA final | Object-fit cover; overlay em CSS para texto legível |
| design/landing-desktop-revisada.png | Prancheta conceitual | Não usar como fundo da landing nem como imagem que substitui a página inteira |

Não faltam arquivos de fotos adicionais: a revisão utiliza somente essas três fotos. Fotos de miniaturas são reutilizações de `animal-history.png`. A marca original também está incluída para conferir qualquer pequena variação da regeneração de margem. Em caso de divergência, a referência original prevalece; ajustar enquadramento com CSS, nunca inventar uma nova marca.

## O que NÃO é um arquivo raster

Todos os títulos, parágrafos, números, botões, formulários, labels, estados, cards, tabelas, timelines, conversa, ícones de função, linhas, fundos, sombras e molduras são componentes. Não gerar “assets PNG” de texto, formulário, screenshot de painel, FAQ ou telefone. Isso dificultaria o responsive e a atualização.

Ícones de função: Lucide no framework existente. Sua distribuição é uma dependência da aplicação, não requer desenhar ícones novos. Em React, importar apenas os usados de `lucide-react`; em vanilla, usar o pacote Lucide equivalente. O pacote de assets traz o mapa de nomes em `design/icon-map.json`, não uma cópia dos arquivos/licenças da biblioteca. Confirmar os exports na versão instalada. Para a figura bovina da marca, usar nosso símbolo PNG, não um ícone genérico da biblioteca.

## Mapa seção -> componente -> implementação

| Seção | Componentes | Técnica | Assets |
|---|---|---|---|
| Navbar | Brand, NavLinks, MobileNav, DemoLink | Flex, anchors, menu mobile com button e aria-expanded | Logo |
| Hero | HeroCopy, HeroPhoto, DashboardPreview | Grid 2 colunas; painel com largura limitada abaixo/sobre a foto sem cobrir o rosto | Hero + logo |
| Benefícios | BenefitList | Lista Grid; ícones semânticos | Lucide |
| Três etapas | StepList | ol com números CSS; 3 colunas desktop e 1 mobile | Nenhum raster |
| Recursos | AnimalPassportPreview, FeatureList | Grid, listas/timeline HTML; preview sem toolbar falsa clicável | Animal + logo |
| Histórico | HistoryPhoto, AnimalTimeline | Foto + ol com border-inline-start e marcadores CSS | Animal reutilizada |
| Assistente | ChatPreview, AssistantNote | Flex/lista; balões HTML; símbolo em área clara | Símbolo e hero reutilizado |
| Plataformas | DesktopShell, MobileShell, ChannelLabels | Bordas CSS; previews menores com mesmo conteúdo de exemplo | Logo + animal |
| Contratação | ContractModel | 3 colunas, headings e separators | Lucide |
| FAQ | FaqList | details/summary nativo; Radix opcional no projeto React existente | Nenhum raster |
| CTA | ClosingBanner | Foto em background ou img; overlay CSS, conteúdo sobreposto | Pasture |
| Demonstração | DemoContactForm | form semântico e integração real futura | Nenhum raster |
| Footer | Brand, FooterLinks | Flex/Grid e anchors reais | Logo |

## Bibliotecas e fontes

- CSS nativo atende a toda a composição. Tailwind é opcional se já existir no projeto; não acrescentar só para uma página.
- Lucide fornece ícones de interface. Fontes oficiais: https://lucide.dev/guide/react/ e https://lucide.dev/packages.
- FAQ funciona com details/summary, sem JavaScript obrigatório. Em projeto React que já use Radix, Accordion pode ser adotado: https://www.radix-ui.com/primitives/docs/components/accordion. Não adicionar Radix apenas para um acordeão simples.
- Sem GSAP, Three.js, canvas, vídeo ou dependência de animação. Transições CSS discretas e reduced-motion.
- UI usa stack do sistema em `design/tokens.css`, evitando dependência de download. A fonte EXATA da logo é preservada no PNG. Não foi identificada uma família comercial exata para reconstrução do wordmark. Se for escolhida Manrope ou outra fonte web, validar licença, incluir WOFF2 real e font-display swap antes de afirmar que o pacote contém a fonte.

## Layout e responsive

Container máximo 1200px, margem auto, padding 24px desktop/20px mobile. Grid hero 1fr 1fr, gap 48px, alinhamento central. H1 com clamp(2.4rem, 5vw, 4.6rem), line-height 1.05. Texto corpo mínimo 16px; descrição limitada em ch. Espaços entre seções 64-96px desktop e 40-56px mobile. Prancheta possui densidade editorial compacta; o site deve permitir altura natural, não forçar tudo a caber em uma imagem.

- >=1024px: hero/recursos em duas colunas; etapas/contratação três colunas; navbar expandida.
- 768-1023px: diminuir gaps, previews sem sobreposição excessiva; nav compacta conforme espaço.
- <768px: tudo em fluxo vertical; texto hero antes da foto; preview em bloco próprio. Etapas e contratação empilhadas. FAQ e formulário largura total. Molduras de dispositivos em tabs ou sequência vertical, sem miniaturizar três previews lado a lado.
- 360/390/430px e zoom 200%: zero scroll horizontal; labels legíveis; botões touch >=44px; conteúdo longo quebra linha.
- Hero: foto usa aspect-ratio 3/2 desktop; mobile pode usar 4/5 com object-position calibrado para preservar rosto/mãos. Não cortar o personagem via image editing; crop é CSS.
- CTA: proporção flexível e min-height; gradiente melhora contraste. No mobile priorizar foto contextual e permitir CTA em fundo verde separado se texto competir com o assunto.

Não inventar recortes/ilustrações que não existam no pacote. Mockups são CSS com conteúdo real de demonstração no DOM, não app pronto.

## Regras de texto e demonstração

Fonte de verdade: `design/copy.json`. A prancheta gerada contém detalhes ilustrativos e pode deformar palavras pequenas. Não copiar números/datas/labels dela como dados reais. O texto no PWA da imagem sugere offline presente; a copy correta diz “alternativa PWA planejada”, com limites por plataforma. Trocar “Sempre”, “Nunca mais perca” e qualquer garantia por linguagem objetiva.

Todas as telas de exemplo recebem “Tela ilustrativa”. Landing é marketing, por isso demonstrações estáticas explicitamente rotuladas são permitidas; o aplicativo do pecuarista usa banco real. Não cadastrar indicadores fictícios na produção. Marca, números e rascunhos em `reference/componentes.html` são apenas prova visual.

CTAs “Solicitar demonstração” são anchors para #demonstracao. “Conhecer o Rebania” -> #recursos. “Conversar sobre minha fazenda” -> #demonstracao. Recursos da lista não são botões se não existir conteúdo expandível.

Formulário: nome, e-mail e perfil de operação; labels persistentes, validação próxima aos campos, sucesso só depois de confirmação real do backend. Não inventar WhatsApp/domínio. Ao implementar, endpoint tenant-neutral de leads, rate limit, antispam, política de privacidade e retenção. Sem endpoint escolhido, deixar preview explicitamente indisponível; nunca falso “Enviado com sucesso”. Links de privacidade/contato apontam a destinos reais após configuração, não a '#'.

## Performance e arquivos

PNG originals estão preservados. A otimização JPEG/WebP/AVIF e srcset não foi aplicada aos arquivos nesta entrega; deve entrar no build de assets após validar qualidade, com nomes e dimensões reais. Não upscalear nem anunciar resolução inexistente. Gerar derivados 480/768/1200/1536 apenas até a dimensão original, sem esticar. Nunca aplicar otimização destrutiva ao único original.

Hero usa loading eager/fetchpriority high e dimensões explícitas; abaixo da dobra lazy. Logos são transparentes. Cards repetem URLs para reutilizar cache. Reservar espaço de imagem evita CLS. Testar LCP/CLS no ambiente real, não prometer pontuação sem teste. Em implementação, validar MIME e checksum dos arquivos.

## Critérios de aceite da implementação futura

1. Última logo bovina em toda a página; nenhum laço abstrato nem wordmark refeito em fonte aproximada.
2. Mesmas três fotos, com crops coerentes e sem texto embutido.
3. Copy do JSON; um h1 e headings ordenados; anchors coerentes.
4. Componentes DOM de preview, não screenshot achatado; conteúdo acessível e label ilustrativo.
5. FAQ por teclado, foco visível, contraste validado e reduced-motion.
6. Mobile/desktop/intermediários sem overflow ou sobreposição de CTA e rosto.
7. Formulário real somente após integração; sucesso e erro verificáveis.
8. Identificação eletrônica não promete NFC universal nem paridade web/iOS/Android.
9. Nenhum preço/depoimento/cliente/estatística inventado.
10. Verificar media sizing, licença de bibliotecas, cache e performance no site real.

## Limite do exemplo HTML

`reference/componentes.html` exemplifica painel, passaporte, chat, dispositivos, FAQ e formulário desabilitado. Não é landing final, não tem backend, não comprova compatibilidade de hardware e não publica nada. Os trechos demonstram que as formas podem ser montadas sem imagens raster de interface. Faça QA completo após a implementação no repositório real.

## Prompt para Codex ou Claude

```text
Leia docs/GUIA_IMPLEMENTACAO.md, design/copy.json, design/tokens.css,
design/icon-map.json e manifest.json. Use design/landing-desktop-revisada.png
como direção visual, não como screenshot a ser embutido. Confirme o registro
de aprovação dessa revisão antes de implementá-la no projeto final.

Preserve a última logo bovina Rebania e as três fotos fornecidas. Compare o
logo principal com rebania-logo-reference.png; a referência prevalece se
houver pequena divergência de desenho. Todo texto, número, card, timeline,
conversa, botão, FAQ e dispositivo é HTML/CSS. Não gere novas fotos nem use
assets antigos de laço abstrato. A copy JSON prevalece sobre texto da imagem.

Inspecione AGENTS.md e o projeto; reutilize stack/componentes existentes.
CSS Grid/Flex para layouts; lucide-react se React já existir; FAQ nativo ou
Radix existente; nenhuma dependência 3D/animação desnecessária. Compartilhe
tokens com o monorepo quando apropriado. Não trocar infraestrutura da VPS.

Implemente mobile-first e confira 360/390/430/768/1024/1280/1440px e zoom
200%. UI de exemplo claramente ilustrativa; não converter em mock de
produção. CTAs apontam a #demonstracao. Antes de tornar formulário ativo,
integrar endpoint real, validação, estados, antispam e política de dados.
Não fingir envio nem inventar contatos, preços, métricas ou avaliações.

Gerar derivados otimizados das fotos preservando originais, srcset e dimensões
reais; lazy abaixo da dobra. Validar teclado, foco, contraste, responsividade,
formulário e performance. Não publicar sem autorização. Relatar implementado,
testado e pendente; não declarar app/hardware pronto só pela landing.
```
