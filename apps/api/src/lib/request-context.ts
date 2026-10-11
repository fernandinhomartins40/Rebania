import { AsyncLocalStorage } from "node:async_hooks";
import type { FastifyInstance } from "fastify";

/** Método e caminho da requisição em curso, para regras que dependem deles (somente leitura). */
export interface RequestInfo {
  method: string;
  path: string;
}

export const requestContext = new AsyncLocalStorage<RequestInfo>();

export function registerRequestContext(app: FastifyInstance) {
  // run(..., done) mantém o contexto em todos os hooks e no handler desta requisição.
  app.addHook("onRequest", (req, _reply, done) => {
    requestContext.run({ method: req.method, path: req.url.split("?")[0]! }, done);
  });
}
