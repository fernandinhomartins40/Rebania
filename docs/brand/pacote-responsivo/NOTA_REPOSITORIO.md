# Nota do repositório

Pacote "Rebania_Mobile_Tablet_Assets_Compacto" recebido em 2026-10-09.

- Pranchas mobile (`mobile/`), tablet (`tablet/`) e regras (`design/`) foram copiadas sem alteração.
- `assets/brand` e `assets/photos` são idênticos byte a byte aos de `../pacote-landing/assets` e não foram duplicados; os `asset-map.json` apontam para `../assets/`, que corresponde a `../pacote-landing/assets/`.
- A prancha desktop (`design/landing-desktop-revisada.png`) é idêntica à de `../pacote-landing/design/` e não foi duplicada.
- `assets/versions` (novas gerações) não foi importado: o pacote orienta usar os originais aprovados.
- Implementação: `apps/web/src/pages/landing/` (textos em `copy.json`). Onde a prancha traz texto sem fonte verificável (respostas do FAQ, link "Privacidade"), a landing usa respostas factuais do produto e omite o link sem página.
