# Каталог Samsung и Google

Проверка официальных источников: 4 ноября 2026 года. Файл данных — `src/data/catalogs/samsung-google.js`.

Добавлено 100 строк моделей: 69 смартфонов Samsung, 15 Google Pixel и 16 вариантов планшетов Samsung. Из них 54 строки имеют подтверждённые пары встроенной памяти и физической ОЗУ (131 конфигурация). Остальные строки помогают найти модель; `configs: []`, `verified: false` требуют подтверждения модификации администратором. Наличие модели не означает наличие цены, проверенной конфигурации или предложения в Астане.

Это расширяемая подборка популярных устройств разных поколений. Она не объявляется полным реестром всех когда-либо выпущенных устройств. Выбраны существующие мировые конфигурации; конкретную региональную модификацию нужно сверить с маркировкой. Виртуальная ОЗУ и карта microSD не добавляются к физической памяти. В данных нет цен, рыночных медиан и предположений о скупке.

## Источники существования моделей

- [Samsung Developer: Galaxy A](https://developer.samsung.com/galaxy-emulator-skin/galaxy-a.html), [Galaxy S](https://developer.samsung.com/galaxy-emulator-skin/galaxy-s.html), [Galaxy Z](https://developer.samsung.com/galaxy-emulator-skin/galaxy-z.html), [Galaxy Tab](https://developer.samsung.com/galaxy-emulator-skin/galaxy-tab.html): официальные списки моделей. Они не подтверждают объёмы памяти, поэтому строки только из этих индексов оставлены без конфигураций.
- Региональные Samsung Newsroom/Support, указанные в `source` конкретной модели: позволяют отделить A06/A14/A15/A17 4G и 5G и старые модели A21s/A50. Для A17 4G использована [официальная карточка LTE 4/128](https://shop.samsung.com/latin/cac/gt/galaxy-a17-lte-4gb-128gb.html).

## Источники конфигураций

| Группа | Официальное основание |
| --- | --- |
| A26/A36/A56 5G | [Samsung Global Newsroom, таблица памяти](https://news.samsung.com/global/samsung-marks-a-step-forward-with-ai-for-everyone-by-introducing-new-galaxy-a56-5g-galaxy-a36-5g-and-galaxy-a26-5g) |
| A35/A55 5G | [Samsung Global Newsroom](https://news.samsung.com/global/samsung-galaxy-a55-5g-and-galaxy-a35-5g-awesome-innovations-and-security-engineered-for-everyone) |
| A15/A25 5G | [Samsung India, варианты памяти](https://news.samsung.com/in/samsung-galaxy-a25-5g-galaxy-a15-5g-with-awesome-camera-and-new-editing-features-launched-in-india) |
| S20 FE LTE/5G | [Samsung Mobile Press](https://www.samsungmobilepress.com/articles/unveiling-samsung-galaxy-s20-fe-fan-favorite-features-at-an-accessible-price-point) |
| S22/S22+/Ultra | [Samsung Support, Memory](https://www.samsung.com/us/support/answer/ANS10003652/) |
| S23/S23+/Ultra | [Samsung Mobile Press, отдельные таблицы моделей](https://www.samsungmobilepress.com/articles/take-your-passions-further-with-the-new-samsung-galaxy-s23-series-designed-for-a-premium-experience-today-and-beyond) |
| S24/S24+/Ultra/FE | [Samsung Support, Memory and storage](https://www.samsung.com/us/support/answer/ANS10000756/) |
| S25/S25+/Ultra | [Samsung Global Newsroom](https://news.samsung.com/global/samsung-galaxy-s25-series-sets-the-standard-of-ai-phone-as-a-true-ai-companion) |
| S23 FE, Tab S9 FE/FE+ | [Samsung Mobile Press](https://www.samsungmobilepress.com/articles/samsung-galaxy-s23-fe-galaxy-tab-s9-fe-and-galaxy-buds-fe-bring-standout-features-to-even-more-users) |
| Tab A9/A9+ | [Samsung Global Newsroom](https://news.samsung.com/global/samsung-galaxy-tab-a9-and-galaxy-tab-a9-entertainment-and-productivity-engineered-for-everyone) |
| Tab S9/S9+/Ultra | [Samsung Global Newsroom](https://news.samsung.com/global/samsung-galaxy-tab-s9-sets-the-new-standard-to-bring-galaxys-premium-experience-to-a-tablet) |
| Pixel 6–9, a, Fold | [Google Pixel Help: hardware tech specs](https://support.google.com/pixelphone/answer/7158570?hl=en), отдельные таблицы конкретных моделей |

Пары памяти перенесены из таблиц, не получены перемножением независимых списков ОЗУ и накопителей. Подборка может включать не все существующие региональные варианты одной модели. Wi-Fi и LTE/5G планшеты представлены отдельными названиями: Tab A9 LTE не выдаётся за 5G; другие сотовые Tab имеют явный суффикс 5G. Fingerprint указан для Pixel и Tab S9; для остальных устройств неподтверждённая в просмотренном источнике биометрия оставлена `unknown`.

## Проверки данных

Проверяются уникальность имён, допустимые категории и связи, положительные целые значения физической памяти, отсутствие дублей конфигураций и ценовых полей. Полная сборка/интеграция выполняется после подключения набора родительским этапом.
