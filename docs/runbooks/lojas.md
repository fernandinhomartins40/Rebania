# Runbook — Builds de loja (Android/iOS)

**Envio às lojas só com autorização explícita do cliente/responsável.** Este repositório não tem perfil `submit` de propósito.

Pré-requisitos pendentes (P-05/T-07): domínio definitivo, conta Expo da empresa, contas Google Play Console e Apple Developer, confirmação do identificador `com.rebania.app` e ícones/prints finais.

## Builds (fora da VPS)
Builds nativos rodam no EAS (nuvem da Expo) ou em máquina macOS para iOS — nunca na VPS da aplicação.
```bash
cd apps/mobile
npx eas login                       # conta da empresa
npx eas build --profile development --platform android   # dev client para testes com leitores/NFC
npx eas build --profile preview --platform android       # APK interno para o piloto
npx eas build --profile production --platform all        # artefatos de loja (AAB/IPA)
```
Antes de `preview`/`production`, troque `EXPO_PUBLIC_API_URL` em `eas.json` pelo domínio real (HTTPS).

## Teste em aparelho (teste obrigatório 12)
Instale o `preview` em Android de entrada e intermediário; registre: login, sync offline (modo avião), Modo Curral com leitor em modo teclado e câmera, fotos, sessão expirando. iOS: TestFlight interno após a conta Apple existir. Registre os aparelhos e resultados em `homologacao-hardware.md`.

## Envio (somente após autorização)
`npx eas submit --platform android|ios` com credenciais configuradas pelo responsável. Registre data, versão e quem autorizou.
