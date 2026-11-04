import React from "react";
export function Field({ label, value, onChange, type = "text", ...rest }) {
  return (
    <label className="field">
      {label}
      <input
        aria-label={label}
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
    </label>
  );
}
export function Select({ label, value, onChange, options }) {
  return (
    <label className="field">
      {label}
      <select
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => {
          const [v, t] = Array.isArray(o) ? o : [o, o];
          return (
            <option key={v} value={v}>
              {t}
            </option>
          );
        })}
      </select>
    </label>
  );
}
export const conditions = [
  ["ideal", "Идеальное"],
  ["good", "Хорошее"],
  ["worn", "Заметный износ / царапины"],
];
export const checks = [
  ["unknown", "Не проверено"],
  ["ok", "Исправно"],
  ["broken", "Неисправно"],
];
export const simOptions = [
  ["physical", "Физическая SIM"],
  ["esim", "Только eSIM"],
  ["other", "Другой подтверждённый вариант"],
  ["wifi", "Без SIM · Wi-Fi"],
];
export function Download({ name, data, type = "application/json", children }) {
  return (
    <button
      onClick={() => {
        const url = URL.createObjectURL(new Blob([data], { type }));
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}
    >
      {children}
    </button>
  );
}
