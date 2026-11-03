# Источники и ограничения (проверка 03.11.2026)

## Рабочая цена этапа 1

Только сохраняемый ручной прайс владельца: точная модель/память/физическая ОЗУ/SIM, Астана, KZT, store-cash, базовое состояние. Пустая установка не содержит выдуманных цен и стартового склада. A35 8/128, 89 000 ₸ — контрольный ориентир пользователя, не медиана OLX и не подтверждённая сделка. Уже включает хорошее состояние, коробку и небольшие следы от чехла. Сохранение такого ориентира — сознательное действие владельца. Ломбардных данных нет.

## OLX Казахстан

Проверены официальные страницы:

- https://developer.olx.kz/articles/getting-access-to-api
- https://developer.olx.kz/api/doc
- https://developer.olx.kz/swagger/v2/partner_api.yaml (веб-инструмент отказался читать YAML: Unsupported content-type).

Портал требует OLX OAuth, регистрации приложения и проверки заявки; Client ID/Secret выдаются после одобрения. Публичный разрешённый массовый поиск рыночных объявлений не подтверждён. Документация партнёрских adverts не доказывает доступ ко всему рынку. Реальный API-запрос с ключами не выполнялся: ключей нет. Условия оплаты, лимиты и право на сбор требуют подтверждения OLX; бесплатный доступ не обещается. Cookies, CAPTCHA и антибот не обходились.

Провайдер выделен в src/domain/providers.js и явно недоступен. Ошибка не меняет lastSuccessAt. Живого обновления, фонового расписания и выборки аналогов нет. Кнопка поиска открывает OLX, не обновляет данные. Сейчас доступны ручной прайс и CSV/JSON-импорт прайса с проверкой. Ввод/разбор объявлений и рыночная статистика относятся к этапу 2 и ещё не реализованы.

## Каталог

Apple: https://support.apple.com/en-gb/108044 (поисковый индекс официального источника; прямое открытие вернуло 429); iPhone 17 Pro Max: https://support.apple.com/en-us/125091. Включены существующие mini/Plus/Pro/Pro Max и iPhone Air; нет выдуманных 14 mini/17 Plus. Это не исчерпывающий список всех региональных SKU. Регион SIM проверяет сотрудник.

Подтверждённые отдельные Android-конфигурации:

- Redmi A5: https://www.mi.com/ph/product/redmi-a5/specs/ — 3/64 и 4/128, расширенная ОЗУ исключена.
- Redmi Note 13 4G: https://www.mi.com/my/product/redmi-note-13/specs/ — 6/128, 8/128, 8/256; отдельная модель от 5G.
- TECNO Spark Go 2: https://www.tecno-mobile.com/om-en/phones/tech-specs/techspecs/spark-go-2/ — 3/64, рекламные 6 ГБ включают 3 ГБ виртуальной памяти.
- Samsung S9: https://www.samsungmobilepress.com/media-assets/galaxy_s9?tab=specs — 4 ГБ, 64/128/256.
- Samsung A21s: https://news.samsung.com/cl/samsung-incorpora-galaxy-a21s-a-la-familia-galaxy-a/1000 — подтверждён вариант 4/64.
  A35 8/128 взят из контрольной конфигурации владельца. Остальные запрошенные названия заведены без неподтверждённых вариантов памяти. Для A14/A17 нужно сначала установить 4G/5G и региональный SKU; Huawei nova Y63, ZTE A36 и Redmi 10 2022 требуют дальнейшей проверки официальных страниц. Администратор редактирует справочник в настройках. Наличие модели/конфигурации не означает наличия цены.

## Render

Проверена https://render.com/docs/static-sites : фронтенд публикуется как Static Site; сервер требует отдельного Web Service. Сохранены Vite и dist, конфигурация действующего сайта не менялась. PostgreSQL, API, фоновые задачи и тарифы пока не выбирались; ресурсы и расходы не создавались.

## Уточнение 04.11.2026: предоставленный прайс

Получен DOCX владельца «Nomad_Mobile_Price_List», редакция 04.11.2026. 110 основных строк: 87 iPhone + 23 Android. Сами данные документа предупреждают, что это восстановленные оценки из переписки с расчётными конфигурациями. Они сохраняются с source=owner-guide, отдельно от owner и от рыночных источников. Дата документа — не дата успешного обновления OLX. Таблица исторических закупов, индивидуальные случаи и контрольные объявления в общую базу цен не смешиваются. Инструкции документа не выполнялись как команды; импорт читает только подходящие таблицы и текстовые поля.

Дополнительно сверены официальные страницы для точных Android-конфигураций:
- Samsung A14 4G: https://www.samsung.com/ae/smartphones/galaxy-a/galaxy-a14-black-64gb-sm-a145fzkdmea/ и https://www.samsung.com/ph/smartphones/galaxy-a/galaxy-a14-silver-128gb-sm-a145fzsvphl/
- A35 8/256: https://news.samsung.com/br/samsung-galaxy-a55-5g-e-galaxy-a35-5g-inovacoes-incriveis-e-seguranca-projetada-para-todos
- A21s 3/32: https://news.samsung.com/pl/galaxy-a21s-nowy-czlonek-rodziny-samsung-galaxy-a
- A41 4/64: https://news.samsung.com/uk/samsung-announces-the-new-additions-to-a-series-smartphone-lineup-galaxy-a71-5g-galaxy-a51-5g-and-galaxy-a41
- A50 4/64: https://www.samsung.com/us/business/support/owners/product/galaxy-a50-verizon/
- Redmi 10 2022 4/64 и 4/128: https://www.mi.com/ng/product/redmi-10-2022/specs/
- Redmi 15 4G 8/256: https://www.mi.com/global/product/redmi-15/specs/

101 строка готова к использованию после подтверждения импорта. Остальные 9 видны в отчёте: A10, неуточнённые A17/A23, Redmi 9/A2+ с неизвестной ОЗУ, nova Y63, ZTE A36/A76 и TECNO 3/128. Неизвестные параметры не заменяются предположениями. Подробнее — PRICE_GUIDE_MAPPING.md.

Logobook.pdf использован только для оригинальных векторных контуров знака и цвета #292970 со страницы 3. PDF не публикуется целиком.
