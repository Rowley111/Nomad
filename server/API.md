# API общей базы

Все рабочие маршруты требуют `Authorization: Bearer <token>`. Токен возвращается только после входа; хранить его в памяти клиента. JSON не содержит URL базы или паролей. Ошибки имеют `detail` на русском языке. CORS разрешает только точные адреса `FRONTEND_ORIGIN` (через запятую).

- `GET /api/health` → `{ "status": "ok" }`, без доступа к рабочим данным.
- `POST /api/auth/login` `{username,password}` → `{token,user:{username,role}}`.
- `GET /api/auth/me` → `{username,role}`.
- `POST /api/auth/logout` → `{ok:true}`; отзывает серверную сессию.
- `GET /api/workspace` → `{state:null|<полный JSON schemaVersion:2, mode:local>,revision:0|N}`. `mode:local` внутри переносимого JSON — формат совместимости, а не режим хранения сервера.
- `PUT /api/workspace` `{state,revision,operationId}` → `{state,revision}`. `operationId` — уникальная стабильная строка для повтора одного сохранения. Несовпавшая ревизия → 409. Сервер не перезаписывает более новые данные. Сотрудник не может менять прайс, каталог, политику или переписывать историю. Проверка доменных данных выполняется общим Node-модулем.
- `POST /api/import/preview` `{state}` → `{previewId,revision,report}`. Только администратор. Отчёт содержит `added`, `duplicates`, `conflicts`, `totalAdded`; записи с конфликтами сохраняются из общей базы. Подготовленный результат действует 30 минут и привязан к пользователю/ревизии.
- `POST /api/import/commit` `{previewId,operationId}` → `{state,revision,report}`. Только администратор. Изменившаяся общая база требует нового предпросмотра (409). Повтор того же файла не создаёт дубликатов.
- `GET /api/audit` → `{events:[{id,action,username,at,revision}]}`, только администратор; снимки резервных версий не выдаются публично.

Первого администратора создаёт серверная CLI `python -m server.cli create-admin`. Публичной регистрации нет. Истечение сессии возвращает 401. Максимальный JSON-запрос — 5 MiB.
