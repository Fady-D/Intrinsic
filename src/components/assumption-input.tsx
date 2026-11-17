"use client";
import { useState } from "react";
interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: "%" | "m";
  hint?: string;
}
export default function AssumptionInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.5,
  unit = "%",
  hint,
}: Props) {
  const scale = unit === "%" ? 100 : 1;
  const display = Number((value * scale).toFixed(4));
  const sliderMin = Math.min(min, display),
    sliderMax = Math.max(max, display);
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="assumption">
      <span className="input-label">
        {label}
        <span className="number-wrap">
          <input
            aria-label={label}
            type="number"
            min={sliderMin}
            max={sliderMax}
            step={step}
            value={draft ?? display}
            onChange={(e) => {
              const raw = e.target.value;
              setDraft(raw);
              if (raw !== "" && Number.isFinite(Number(raw)))
                onChange(Number(raw) / scale);
            }}
            onBlur={() => setDraft(null)}
          />
          <span>{unit}</span>
        </span>
      </span>
      <input
        aria-label={`${label} slider`}
        type="range"
        min={sliderMin}
        max={sliderMax}
        step={step}
        value={display}
        onChange={(e) => {
          setDraft(null);
          onChange(Number(e.target.value) / scale);
        }}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}
