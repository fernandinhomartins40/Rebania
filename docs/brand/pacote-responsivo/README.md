# Rebania — mobile, tablet e assets

Leia IMPLEMENTACAO_RESPONSIVA.md e LOGO_E_RESOLUCAO.md.

- mobile/prancheta-mobile-01,02,03.png: sequência de adaptação mobile; todas as seções.
- mobile/visao-geral-mobile.png: referência geral condensada; prevalecem as pranchas sequenciais e as regras CSS para implementação.
- tablet/prancheta-tablet.png: versão tablet.
- design/landing-desktop-revisada.png: última desktop preservada byte por byte.
- assets compartilhados: assets aprovados e mapas de enquadramento.
- assets/versions: novas gerações adicionais de fotos, marca principal, verde e símbolo.
- design: copy definitiva, tokens, ícones e regras responsivas.

## Limitações de entrega
O gerador não devolveu os assets em 4K nativo mesmo com solicitação explícita. As dimensões efetivas estão no manifest.json: fotos1536x1024, panorama2172x724, logos cerca de2170x725, símbolo1254x1254. Não houve ampliação artificial e os arquivos não são anunciados como4K.

A tentativa de PNG branca apresentou artefatos e foi descartada. A variante branca fiel para web usa o PNG aprovado com filtro CSS em design/logo-variants.css. Há também variante preta CSS; não são PNGs brancos/pretos separados. Pequenas diferenças de texto da prancheta gerada devem ser substituídas pela copy.json. A prancheta mobile pode sugerir colunas internas em previews; a regra responsiva de implementação exige empilhamento quando o conteúdo não couber. Não usar imagens de interface como substituto de HTML.

## Pacote compacto
Imagens repetidas foram centralizadas em assets/. Os mapas mobile e tablet apontam para ../assets/. Todas as pranchas e os assets únicos foram preservados sem recompressão ou redução de qualidade.
