import { config } from "zod";

// O CSP proíbe eval: sem isto o zod testa `new Function` ao montar os schemas e gera
// um relatório de violação. Importado primeiro no main.tsx, antes de qualquer schema.
config({ jitless: true });
