import { assertCivilDate, daysBetween, type CivilDate } from "./dates.ts";
import { DomainError } from "./errors.ts";

export const SEXES = ["female", "male"] as const;
export type Sex = (typeof SEXES)[number];

/** Categorias zootécnicas de corte. Leite está fora do escopo. */
export const CATEGORIES = [
  "calf_female", // bezerra
  "calf_male", // bezerro
  "heifer", // novilha
  "steer", // garrote / novilho
  "cow", // vaca / matriz
  "bull", // touro
  "ox", // boi
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_SEX: Record<Category, Sex> = {
  calf_female: "female",
  calf_male: "male",
  heifer: "female",
  steer: "male",
  cow: "female",
  bull: "male",
  ox: "male",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  calf_female: "Bezerra",
  calf_male: "Bezerro",
  heifer: "Novilha",
  steer: "Garrote",
  cow: "Matriz",
  bull: "Touro",
  ox: "Boi",
};

export const ANIMAL_STATUSES = ["active", "sold", "dead", "culled", "transferred_out"] as const;
export type AnimalStatus = (typeof ANIMAL_STATUSES)[number];

export const STATUS_LABEL: Record<AnimalStatus, string> = {
  active: "Ativo",
  sold: "Vendido",
  dead: "Morto",
  culled: "Descartado",
  transferred_out: "Transferido",
};

export const ORIGINS = ["born_on_farm", "purchased", "transferred_in", "unknown"] as const;
export type Origin = (typeof ORIGINS)[number];

export const SEX_LABEL: Record<Sex, string> = { female: "Fêmea", male: "Macho" };

export function assertCategoryMatchesSex(category: Category, sex: Sex): void {
  if (CATEGORY_SEX[category] !== sex) {
    throw new DomainError(
      "category_sex_mismatch",
      `A categoria ${CATEGORY_LABEL[category]} não é compatível com o sexo ${SEX_LABEL[sex]}.`,
      { category, sex },
    );
  }
}

/** Situações finais encerram o animal ativo sem apagar o histórico. */
export function isActiveStatus(status: AnimalStatus): boolean {
  return status === "active";
}

/**
 * Um evento não pode ser anterior ao nascimento conhecido nem futuro em relação
 * ao "hoje" da fazenda.
 */
export function assertEventDate(
  occurredOn: CivilDate,
  opts: { birthDate?: CivilDate | null; today: CivilDate },
): void {
  assertCivilDate(occurredOn, "occurredOn");
  if (daysBetween(opts.today, occurredOn) > 0) {
    throw new DomainError("event_in_future", "A data do registro não pode estar no futuro.", {
      occurredOn,
      today: opts.today,
    });
  }
  if (opts.birthDate && daysBetween(opts.birthDate, occurredOn) < 0) {
    throw new DomainError(
      "event_before_birth",
      "A data do registro é anterior ao nascimento do animal.",
      { occurredOn, birthDate: opts.birthDate },
    );
  }
}

/** Animais vendidos/mortos não recebem novos manejos; correções seguem fluxo próprio. */
export function assertAnimalAcceptsHandling(status: AnimalStatus): void {
  if (!isActiveStatus(status)) {
    throw new DomainError(
      "animal_not_active",
      `O animal está com situação "${STATUS_LABEL[status]}" e não recebe novos manejos.`,
      { status },
    );
  }
}
