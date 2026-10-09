import { CATEGORY_LABEL } from "@rebania/domain";
import type { LocalAnimal } from "../offline/engine.ts";
import { AnimalPhoto, formatDate, formatKg } from "./ui.tsx";

/** Card do animal identificado na etapa "Informar", com ação de trocar (pranchas). */
export function SelectedAnimal({
  animal,
  onChange,
}: {
  animal: LocalAnimal;
  onChange: () => void;
}) {
  return (
    <div className="card selected-animal">
      <AnimalPhoto size="md" src={animal.photo?.thumbUrl} />
      <div className="info">
        <strong>
          {CATEGORY_LABEL[animal.category]} {animal.primaryIdentifier}
        </strong>
        <span className="hint">
          {animal.groupName ?? "Sem lote"} ·{" "}
          {animal.lastWeight
            ? `${formatKg(animal.lastWeight.weightKg)} em ${formatDate(animal.lastWeight.measuredOn)}`
            : "sem pesagem"}
        </span>
      </div>
      <button type="button" className="link" onClick={onChange}>
        Trocar
      </button>
    </div>
  );
}
