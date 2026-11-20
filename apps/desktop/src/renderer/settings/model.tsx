// The model and effort rows: for new websites in the settings window, for one
// website in its own settings (Q117, Q118).
import { accountOf, type Effort, type ModelChoice } from "../../shared/ipc";
import { NativeSelect } from "../components/ui/native-select";
import { t } from "../lib/strings";
import { Row, Segmented, selectClass } from "./ui";

const EFFORTS: Effort[] = ["low", "medium", "high"];

/** The efforts a model accepts; the effort kept when the model changes, or medium. */
export function effortsOf(models: ModelChoice[], model: string): Effort[] {
  const choice = models.find((m) => m.id === model);
  return choice?.efforts.length ? choice.efforts : EFFORTS;
}

/** The connected accounts' models, grouped by account (Q275). */
export function ModelOptions({ models }: { models: ModelChoice[] }) {
  const accounts = [...new Set(models.map((m) => m.account))];
  return accounts.map((account) => (
    <optgroup key={account} label={t.accounts.names[account]}>
      {models
        .filter((m) => m.account === account)
        .map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
    </optgroup>
  ));
}

export function ModelRows({
  models,
  model,
  effort,
  onChange,
  idPrefix,
}: {
  models: ModelChoice[];
  model: string;
  effort: Effort;
  onChange: (next: { model?: string; effort?: Effort }) => void;
  idPrefix: string;
}) {
  const efforts = effortsOf(models, model);
  return (
    <>
      <Row id="model" label={t.settings.agent.model} htmlFor={`${idPrefix}-model`}>
        <NativeSelect
          id={`${idPrefix}-model`}
          data-testid={`${idPrefix}-model`}
          size="xs"
          className={selectClass}
          wrapperClassName="shrink-0"
          value={model}
          disabled={!models.length}
          onChange={(event) => {
            const next = event.target.value;
            const allowed = effortsOf(models, next);
            onChange({
              model: next,
              ...(allowed.includes(effort) ? {} : { effort: allowed.includes("medium") ? "medium" : allowed[0] }),
            });
          }}
        >
          {!models.some((m) => m.id === model) && <option value={model}>{t.accounts.names[accountOf(model)]}</option>}
          <ModelOptions models={models} />
        </NativeSelect>
      </Row>
      <Row id="effort" label={t.settings.agent.effort}>
        <Segmented
          label={t.settings.agent.effort}
          testid={`${idPrefix}-effort`}
          value={effort}
          onChange={(value) => onChange({ effort: value })}
          options={efforts.map((e) => ({
            value: e,
            label: t.conversation.efforts[e],
            tip: t.conversation.effortTips[e],
          }))}
        />
      </Row>
    </>
  );
}

/** The model that names each new website (Q407): Automatic, the small model of its account, or one chosen. */
export function NamingRow({
  models,
  value,
  onChange,
}: {
  models: ModelChoice[];
  value: string;
  onChange: (namingModel: string) => void;
}) {
  // A chosen model no longer on offer reads as Automatic, which it is.
  const shown = value !== "auto" && models.some((m) => m.id === value) ? value : "auto";
  return (
    <Row id="naming-model" label={t.settings.agent.naming} detail={t.settings.agent.namingHelp} htmlFor="naming-model">
      <NativeSelect
        id="naming-model"
        data-testid="naming-model"
        size="xs"
        className={selectClass}
        wrapperClassName="shrink-0"
        value={shown}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="auto">{t.settings.agent.namingAuto}</option>
        <ModelOptions models={models} />
      </NativeSelect>
    </Row>
  );
}
