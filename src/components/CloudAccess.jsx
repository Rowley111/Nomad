import React, { useState } from "react";
import { Field } from "./Fields.jsx";
import { createRemote } from "../domain/remote.js";
export default function CloudAccess({ apiUrl, children }) {
  const [connection] = useState(() => {
    try { return { remote: createRemote(apiUrl) }; }
    catch (error) { return { error: error.message }; }
  });
  const [workspace, setWorkspace] = useState(null),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const remote = connection.remote;
  if (workspace) return children(remote, workspace, () => setWorkspace(null));
  return (
    <main className="auth-screen">
      <section className="panel auth-panel">
        <img src="/nomad-logo.svg" alt="Nomad Mobile" width="90" height="60" />
        <h1>Вход в Nomad Mobile</h1>
        <p>Общая база магазина. Войдите с учётной записью сотрудника. Локальные данные браузера остаются отдельно.</p>
        {connection.error && <p role="alert">{connection.error}</p>}
        {error && <p role="alert">{error}</p>}
        <form onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !remote) return;
          setBusy(true); setError("");
          try {
            await remote.login(username, password);
            setPassword("");
            const result = await remote.load();
            if (!result.state && remote.user.role !== "admin")
              throw new Error("Администратор должен сначала создать или перенести данные магазина");
            setWorkspace(result);
          } catch (failure) { setError(failure.message); }
          finally { setBusy(false); }
        }}>
          <Field label="Логин" value={username} onChange={setUsername} autoComplete="username" required />
          <Field label="Пароль" type="password" value={password} onChange={setPassword} autoComplete="current-password" required />
          <button className="primary" disabled={busy || !remote}>{busy ? "Подключение…" : "Войти"}</button>
        </form>
        <small>Сеанс действует в этой вкладке. После перезагрузки потребуется вход. При недоступном API приложение не переключается на локальные данные.</small>
      </section>
    </main>
  );
}
