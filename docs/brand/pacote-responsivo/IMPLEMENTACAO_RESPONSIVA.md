# Rebania — versões mobile e tablet

A prancheta desktop aprovada é preservada, sem alteração de arquivo. As novas pranchetas adaptam a disposição; não substituem a identidade visual nem a copy de `design/copy.json`. Pequenas variações de texto em imagens geradas não são especificação: use o JSON e a logo PNG.

## Assets
As pastas assets compartilhados contêm as MESMAS fotos, logo e símbolo da composição desktop, em dimensões nativas. Não foram inventadas fotografias novas nem gerados recortes destrutivos. Os respectivos asset-map.json indicam enquadramentos CSS, viewport lógico de referência e proporções. Reutilize um único arquivo em produção para evitar downloads duplicados. Os PNG originais devem ser otimizados para WebP/AVIF no build, sem aumentar a resolução.

## Breakpoints e disposição
- Mobile: até 767px; referência 390px, conferir também 360px. Margem lateral 20px, coluna única, fonte base 16px, botões com altura mínima 44px. Header com logo e menu. Hero: título, texto, CTAs, foto e dashboard. Benefícios e passos empilhados. Ficha seguida por recursos; foto seguida por histórico; assistente seguido por conversa; plataformas e contratação empilhadas; FAQ e formulário em uma coluna. Não remover seções.
- Tablet: 768–1023px; referência 834px. Margem lateral 28–32px. Header compacto. Hero, ficha/recursos, histórico e assistente em duas colunas com minmax(0,1fr). Benefícios, passos e contratação podem ter três colunas quando o conteúdo couber; mudar para uma coluna se necessário sem comprimir texto. Plataformas: desktop acima dos dois previews móveis. Formulário em duas colunas e CTA na última linha.
- Desktop: a partir de 1024px. Manter prancheta e tokens aprovados. Adaptar somente regras nos breakpoints menores.

## Implementação
Use picture/img com object-fit:cover e os enquadramentos dos mapas; CTA com overlay CSS para contraste. Não recorte cards, textos, gráficos nem mockups a partir das pranchetas: construa em HTML/CSS com os mesmos dados ilustrativos do conceito. Ícones: mapa Lucide existente. Fonte de interface: stack de sistema; marca: PNG exato. FAQ details/summary. Menu responsivo acessível; reutilize drawer existente se houver. Campos com labels, input font-size mínimo 16px. Nenhuma largura fixa de componente deve ultrapassar o contêiner.

As pranchetas são propostas visuais, não capturas de uma aplicação pronta. Verificação visual de navegador não realizada neste pacote. Conferir 360,390,768,834,1024 e1440px, sem rolagem horizontal, com foco visível e zoom200%. Formulário requer backend real; imagens de UI e dados são ilustrativos. NFC somente em tags compatíveis; RFID pecuário requer leitor homologado. Oferta permanece implementação + mensalidade + créditos de IA, sem preços inventados.

## Prompt para Codex/Claude
Implemente somente a adaptação responsiva da landing Rebania conforme as pranchetas mobile e tablet deste pacote. Preserve integralmente o desktop aprovado, a ordem das seções, identidade e funcionalidades. Use design/copy.json como texto definitivo e os arquivos reais de assets. Use mobile/asset-map.json e tablet/asset-map.json para enquadramento via CSS; não crie imagens ou logos novas. Reconstrua cards e previews em HTML/CSS; não use a prancheta como fundo da página. Reutilize componentes e bibliotecas existentes. Não publique sem pedido. Valide os seis viewports indicados, acessibilidade por teclado, ausência de overflow, imagens carregadas e todos os CTAs, sem alterar outras áreas do projeto. Não apresente sucesso falso no formulário: integre o endpoint real ou mantenha claramente a condição de preview.
