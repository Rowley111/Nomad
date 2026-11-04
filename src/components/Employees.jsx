import React, { useRef, useState } from "react";
import { Field } from "./Fields.jsx";
import { ensureCashState, saveEmployee } from "../domain/cash.js";

const blank = () => ({ name: "", jobTitle: "", phone: "", archived: false });

export default function Employees({ state, commit, notify, adminEdit = true, storageMode = "local" }) {
  const data = ensureCashState(state);
  const [form, setForm] = useState(blank), [search, setSearch] = useState(""),
    [showArchived, setShowArchived] = useState(false), [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  const query = search.trim().toLocaleLowerCase("ru-RU");
  const rows = data.employees.filter((row) => (showArchived || !row.archived) &&
    `${row.name} ${row.jobTitle} ${row.phone ?? ""}`.toLocaleLowerCase("ru-RU").includes(query));
  async function save(event) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      await commit((previous) => saveEmployee(previous, form));
      setForm(blank());
      notify("Сотрудник сохранён. Прежние записи выплат и заказов сохраняют свою историю.");
    } catch (error) { notify(error.message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function archive(row) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      await commit((previous) => saveEmployee(previous, { ...row, archived: !row.archived }));
      notify(row.archived ? "Сотрудник возвращён в активный список" : "Сотрудник архивирован. История сохранена.");
    } catch (error) { notify(error.message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  if (storageMode === "cloud" && !state.cashSchemaVersion) return <section className="panel">
    <h2>Сотрудники</h2>
    <p>Справочник сотрудников и кассовый учёт в общей базе ещё не начаты. Старые заказы и выплаты сохранятся.</p>
    {adminEdit ? <button type="button" className="primary" disabled={busy} onClick={async () => {
      if (busyRef.current) return;
      busyRef.current = true; setBusy(true);
      try { await commit(ensureCashState); notify("Кассовый учёт и справочник сотрудников готовы. Начальные остатки — 0 ₸."); }
      catch (error) { notify(error.message); }
      finally { busyRef.current = false; setBusy(false); }
    }}>{busy ? "Сохраняю…" : "Начать кассовый учёт с нуля"}</button> : <p>Администратор должен сначала начать кассовый учёт.</p>}
  </section>;
  return <section className="panel employee-directory">
    <h2>Сотрудники</h2>
    <p>Справочник для заказов и выплат: мастер, продавец или другая должность. Вход и права доступа к приложению настраиваются отдельно.</p>
    {adminEdit && <form onSubmit={save} aria-label="Карточка сотрудника">
      <h3>{form.id ? "Редактировать сотрудника" : "Добавить сотрудника"}</h3>
      <fieldset className="workspace-controls" disabled={busy}>
        <div className="formgrid">
          <Field label="Имя сотрудника" value={form.name} onChange={(value) => update("name", value)} required maxLength="120" />
          <Field label="Должность сотрудника" value={form.jobTitle} onChange={(value) => update("jobTitle", value)} required maxLength="120" placeholder="Например, мастер" />
          <Field label="Телефон сотрудника (необязательно)" type="tel" value={form.phone} onChange={(value) => update("phone", value)} maxLength="64" />
        </div>
        {form.id && <label className="check"><input type="checkbox" checked={form.archived} onChange={(event) => update("archived", event.target.checked)} />Сотрудник в архиве</label>}
        <div className="actions wrap">
          <button type="submit" className="primary">{busy ? "Сохраняю…" : "Сохранить сотрудника"}</button>
          {form.id && <button type="button" onClick={() => setForm(blank())}>Новая карточка сотрудника</button>}
        </div>
      </fieldset>
    </form>}
    {!adminEdit && <p className="muted">Добавлять и редактировать сотрудников может администратор.</p>}
    <div className="cash-directory-filters">
      <Field label="Поиск сотрудника" value={search} onChange={setSearch} />
      <label className="check"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />Показывать архив сотрудников</label>
    </div>
    <div className="employee-list">
      {rows.map((row) => <article className="employee-card" key={row.id}>
        <div><h3>{row.name}</h3><p>{row.jobTitle}{row.phone ? ` · ${row.phone}` : ""}</p>{row.archived && <p className="muted">В архиве</p>}</div>
        {adminEdit && <div className="actions wrap">
          <button type="button" disabled={busy} aria-label={`Редактировать сотрудника ${row.name}`} onClick={() => setForm({ ...row, phone: row.phone ?? "" })}>Редактировать</button>
          <button type="button" disabled={busy} aria-label={`${row.archived ? "Вернуть" : "Архивировать"} сотрудника ${row.name}`} onClick={() => archive(row)}>{row.archived ? "Вернуть в список" : "Архивировать"}</button>
        </div>}
      </article>)}
    </div>
    {!rows.length && <p>Сотрудников пока нет. Добавьте свою команду; примеры сотрудников автоматически не создаются.</p>}
  </section>;
}
