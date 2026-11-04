# Каталог Xiaomi, Redmi, POCO, OPPO, realme, OnePlus, vivo

Проверка: 4 ноября 2026. Данные находятся в `src/data/catalogs/xiaomi-bbk.js`: 120 моделей, из них 11 планшетов; у 56 моделей включены 108 точных пар физической ОЗУ/встроенной памяти. Это расширяемая подборка популярных устройств, а не заявление о полном списке всех региональных выпусков.

Цен здесь нет. Пример владельца «купить за 40 000, продать за 75 000» не является прайсом конкретного OPPO и в данные не добавлен. Наличие устройства не означает наличие достоверной скупочной цены.

## Как проверялись характеристики

Использованы страницы производителя, без магазинов-посредников и агрегаторов. Прямая ссылка каждого устройства записана в поле `source`. Для `verified: true` внесены только перечисленные на странице пары RAM/ROM. Другие комплектации могут существовать в отдельных странах; отсутствие их в подборке не означает запрет добавить подтверждённую конфигурацию через конструктор.

Если официальный каталог подтверждает модель, но точная пара памяти не проверена, оставлены `configs: []` и `verified: false`. Это относится, например, к старым Redmi, части OPPO/realme и vivo Y36. У Y36 официальный глобальный лист перечисляет наборы RAM/ROM через дробь без однозначного сопоставления, поэтому их декартово произведение не создано. У OnePlus Pad 2 просмотренная страница указывает тип ОЗУ и 256 ГБ накопителя, но не ёмкость ОЗУ; неподтверждённые 12 ГБ не добавлены.

Для Android объём расширенной/виртуальной ОЗУ не включён в RAM. Xiaomi 14T использует 12 ГБ физической ОЗУ; рекламное Ultra Space не становится ОЗУ или отдельным объёмом накопителя.

## Основные официальные источники

| Группа | Что проверено | Источник |
| --- | --- | --- |
| Xiaomi 14 / 14T | Явные пары 12/256, 12/512 | [14](https://www.mi.com/global/product/xiaomi-14/specs/), [14T](https://www.mi.com/global/product/xiaomi-14t/specs/) |
| Xiaomi 12–13 | Точные варианты из карточек официального архива; другие варианты не достраивались | [Архив Xiaomi Spain](https://www.mi.com/es/product-list/xiaomi/) |
| Старые Redmi / Xiaomi | Существование моделей, без непроверенных конфигураций | [Android Enterprise Recommended](https://www.mi.com/global/support/android-enterprise-recommended/), [Redmi Note Malaysia](https://www.mi.com/my/phone/redmi/note-list) |
| Redmi 13 и Note 13 | Раздельные модели и конфигурации, обычный Redmi 13 не является Note 13 | [Redmi 13](https://www.mi.com/global/product/redmi-13/specs/), [Note 13 4G](https://www.mi.com/global/product/redmi-note-13/specs/), [Note 13 5G](https://www.mi.com/global/product/redmi-note-13-5g/specs/) |
| Redmi Note 13 Pro / Pro+ | 4G, 5G и Pro+ разделены | [Pro 4G](https://www.mi.com/global/product/redmi-note-13-pro/specs/), [Pro 5G](https://www.mi.com/global/product/redmi-note-13-pro-5g/specs/), [Pro+ 5G](https://www.mi.com/global/product/redmi-note-13-pro-plus-5g/specs/) |
| Redmi Note 14 | 4G/5G и семейство Pro раздельно, только явные пары | [Note 14](https://www.mi.com/global/product/redmi-note-14/specs/), [5G](https://www.mi.com/global/product/redmi-note-14-5g/specs/), [Pro 5G](https://www.mi.com/global/product/redmi-note-14-pro-5g/specs/), [Pro+ 5G](https://www.mi.com/global/product/redmi-note-14-pro-plus-5g/specs/) |
| POCO | X6, X6 Pro, F6, M6 Pro 4G и C65 | [X6](https://www.mi.com/global/product/poco-x6/specs/), [X6 Pro](https://www.mi.com/global/product/poco-x6-pro/specs/), [F6](https://www.mi.com/global/product/poco-f6/specs/), [M6 Pro](https://www.mi.com/global/product/poco-m6-pro/specs/), [C65](https://www.mi.com/global/product/poco-c65/specs/) |
| OPPO A38/A58/A60/A78 | Физические пары памяти, A78 4G и 5G разделены | [A38](https://www.oppo.com/en/smartphones/series-a/a38/specs/), [A58](https://www.oppo.com/en/smartphones/series-a/a58/specs/), [A60](https://www.oppo.com/en/smartphones/series-a/a60/specs/), [A78](https://www.oppo.com/en/smartphones/series-a/a78/specs/), [A78 5G](https://www.oppo.com/en/smartphones/series-a/a78-5g/specs/) |
| Другие OPPO | Модели из официального списка; конфигурации A15/A15s/A54 5G указаны там явно | [OPPO Global](https://www.oppo.com/en/smartphones/), [Reno12 F 5G](https://www.oppo.com/en/smartphones/series-reno/reno12-f-5g/specs/) |
| realme | C67 — Snapdragon 685/4G, C53 — глобальная версия; остальные требуют конфигурации | [C67](https://www.realme.com/lk/realme-c67/specs), [C53](https://www.realme.com/global/realme-c53/specs), [Руководства](https://www.realme.com/global/support/user-manuals) |
| OnePlus | Явные пары для 12, 12R и Nord CE4 Lite 5G | [12](https://www.oneplus.com/si/12/specs), [12R](https://www.oneplus.com/global/12r/specs), [Nord](https://www.oneplus.com/fr/nord-ce4-lite-5g/specs) |
| vivo | Y03, Y17s, Y27, V30 — только физическая память; Y36 без достроенных пар | [Y03](https://www.vivo.com/en/products/param/y03), [Y17s](https://www.vivo.com/en/products/param/y17s), [Y27](https://www.vivo.com/en/products/param/y27), [V30](https://www.vivo.com/en/products/param/v30), [Y36](https://www.vivo.com/en/products/param/y36) |

Планшеты проверены по отдельным спецификациям [Xiaomi Pad 5](https://www.mi.com/global/product/xiaomi-pad-5/specs/), [Pad 6](https://www.mi.com/global/product/xiaomi-pad-6/specs/), [Pad 7](https://www.mi.com/global/product/xiaomi-pad-7/specs/), [Pad 7 Pro](https://www.mi.com/global/product/xiaomi-pad-7-pro/specs/), [Redmi Pad](https://www.mi.com/global/product/redmi-pad/specs/), [Pad SE](https://www.mi.com/global/product/redmi-pad-se/specs/), [Pad Pro Wi-Fi](https://www.mi.com/global/product/redmi-pad-pro/specs/), [Pad Pro 5G](https://www.mi.com/global/product/redmi-pad-pro-5g/specs/), [OnePlus Pad](https://www.oneplus.com/global/oneplus-pad/specs), [Pad 2](https://www.oneplus.com/global/oneplus-pad-2/specs), [OPPO Pad Air](https://www.oppo.com/en/accessories/oppo-pad-air/specs/). Redmi Pad Pro Wi-Fi и 5G — разные записи. «Data Sharing to 5G» у OnePlus Pad не означает встроенный сотовый модем.

Некоторые старые прямые страницы возвращают ошибку/редирект. Недоступный `redmi-note-14-pro/specs` не использован для добавления непроверенной 4G-конфигурации. Каталог не содержит несуществующих моделей, придуманных региональных сочетаний памяти или демонстрационных цен.
