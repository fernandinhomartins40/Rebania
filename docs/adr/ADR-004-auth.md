# ADR-004 — Autenticação e sessões
**Estado:** Adotado · 09/10/2026

- **Web:** token opaco num cookie `rebania_session` httpOnly, `SameSite=Strict`, `Secure` em produção, com validade deslizante de 12 h. Requisições que alteram dados sem Bearer exigem o header `x-rebania-csrf: 1`, que não pode ser enviado entre sites sem CORS. A API fica na mesma origem do web (Nginx), então não há CORS em produção. Nada de token em `localStorage`.
- **Mobile:** access token de 15 min + refresh de 30 dias, **rotativo e de uso único** (atualização condicional evita rotação dupla). Credenciais no Keychain/Keystore (`expo-secure-store`).
- Tokens são guardados no banco **apenas como sha256**. Senhas usam scrypt (N=2^15). Usuário inexistente custa o mesmo tempo (hash fictício).
- Convites: token aleatório no **fragmento** da URL (`/convite#token=`), que não vai a logs. Só o hash é guardado, com expiração de 7 dias e uso único. Quem convida não pode atribuir papel acima do próprio.
- Revogar um membro corta o acesso na próxima requisição, porque a permissão é consultada a cada chamada.
- **Pendente:** MFA para papéis críticos; recuperação de senha por e-mail (requer provedor de e-mail).
