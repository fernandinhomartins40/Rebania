# ADR-004 — Autenticação e sessões
**Estado:** Adotado · 09/10/2026

- **Web:** token opaco num cookie `rebania_session` httpOnly, `SameSite=Strict`, `Secure` em produção, com validade deslizante de 12 h. Requisições que alteram dados sem Bearer exigem o header `x-rebania-csrf: 1`, que não pode ser enviado entre sites sem CORS. A API fica na mesma origem do web (Nginx), então não há CORS em produção. Nada de token em `localStorage`.
- **Mobile:** access token de 15 min + refresh de 30 dias, **rotativo e de uso único** (atualização condicional evita rotação dupla). Credenciais no Keychain/Keystore (`expo-secure-store`).
- Tokens são guardados no banco **apenas como sha256**. Senhas usam scrypt (N=2^15). Usuário inexistente custa o mesmo tempo (hash fictício).
- Convites: token aleatório no **fragmento** da URL (`/convite#token=`), que não vai a logs. Só o hash é guardado, com expiração de 7 dias e uso único. Quem convida não pode atribuir papel acima do próprio.
- Revogar um membro corta o acesso na próxima requisição, porque a permissão é consultada a cada chamada.
- **Troca de senha** (`POST /v1/auth/password`): exige a senha atual, aplica a política de senha, encerra as outras sessões do usuário e fica auditada (`auth.password_changed`).
- **Senha provisória** (`users.must_change_password`): contas criadas pelo operador (`platform-admin --create` ou `--reset-password`) nascem com ela. Até a troca, o servidor só aceita `/v1/auth/me`, a troca de senha e o logout (`403 password_change_required`); o web mostra só a tela "Crie sua senha".
- **Conta da plataforma × conta de cliente (D-12):** quem tem acesso ao console nunca tem vínculo com organização ou fazenda. A regra (`assertPlatformAccountSeparation`) vale ao conceder o console, convidar, aceitar convite e implantar organização com dono. No web, a conta da plataforma entra direto no console, fora do app da fazenda.
- **Pendente:** MFA para papéis críticos; recuperação de senha por e-mail (requer provedor de e-mail).
