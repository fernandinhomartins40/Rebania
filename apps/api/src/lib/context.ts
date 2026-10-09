import type { Db } from "@rebania/db";
import type { Config } from "../config.ts";

/** Dependências compartilhadas pelas rotas. */
export interface AppContext {
  db: Db;
  config: Config;
  now: () => Date;
}
