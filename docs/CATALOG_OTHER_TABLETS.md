# Каталог остальных брендов и планшетов

Проверка источников: 4 ноября 2026. Данные находятся в `src/data/catalogs/other-tablets.js`: 103 позиции — 64 смартфона и 39 планшетных модификаций. Это выборка популярных поколений, а не перечень всех устройств мира. Цен в этом файле нет.

41 позиция имеет подтверждённые конфигурации. У остальных `configs: []`, `verified: false`: официальная страница подтверждает существование модели, но однозначную пару физической ОЗУ и накопителя в этой проверке не удалось получить. Для оценки такую конфигурацию нужно подтвердить в конструкторе. Нельзя строить все комбинации из раздельно перечисленных объёмов памяти.

## Подтверждённые конфигурации

- [Motorola moto g54 5G — технические данные](https://en-us.support.motorola.com/app/answers/detail/a_id/176176/~/moto-g54-5g---technischen-daten): 8 ГБ физической ОЗУ / 256 ГБ. [Официальный каталог moto g](https://www.motorola.in/smartphones/moto-g-family) показывает moto g84 5G 12/256.
- [Nothing Phone (2)](https://checkout-eu.nothing.tech/pages/phone-2): официальная форма выбора и раздел Capacity явно задают пары 8/128, 12/256, 12/512. У Phone (1) и Phone (2a) оставлены пустые конфигурации, чтобы не выводить пары только из отдельных списков RAM/storage.
- [ZTE Blade A35 — официальный технический лист](https://zteargentina.com.ar/storage/products/custom/product_20250604_150755.pdf): физическая ОЗУ 2 ГБ, накопитель 64 ГБ. Дополнительные 4 ГБ FUSION RAM не включены в ОЗУ.
- [HONOR Pad 9](https://www.honor.com/global/tablets/honor-pad-9/): накопитель 256 ГБ, физическая ОЗУ 8 ГБ; рекламные 16 ГБ включают виртуальное расширение 8+8 и не используются как физическая память.
- [Определение модели iPad](https://support.apple.com/en-us/108043) содержит поколения, объёмы накопителя, номера Wi-Fi/Cellular и тип сенсора. Apple RAM не угадывается: `ram: null`. Дополнительно открыты [спецификации iPad Pro M4](https://support.apple.com/en-us/119891) и [iPad Pro 12.9 шестого поколения](https://support.apple.com/en-us/111841). Один дополнительный переход к Apple вернул 429; повторных обходных запросов не выполнялось.
- [Определение iPhone](https://support.apple.com/en-gb/108044) подтверждает SE второго/третьего поколения и накопители. Эти модели используют профиль `fingerprint`, а не Face ID.

У iPad Pro M4, Air M2/M3 и mini A17 Pro в модификации Cellular отмечено `simModes: ["esim"]`. У Wi-Fi-моделей — `simModes: ["wifi"]`. Старые Cellular не получают предположение об одинаковых SIM-возможностях всех регионов. iPad Pro с Face ID выделены профилем `faceid`; Air, mini и обычные iPad — `fingerprint`.

## Официальные списки существования моделей

- [Motorola — список поддерживаемых Android 15 телефонов](https://en-us.support.motorola.com/app/answers/detail/a_id/186612/~/android-15-phones): moto g, edge и razr. Список не используется как источник памяти.
- [HONOR — карта сайта](https://www.honor.com/global/sitemap/): выбранные смартфоны и планшеты. У динамических страниц спецификаций поле памяти не отобразилось в доступном представлении, поэтому оно не заполнялось предположением.
- [Huawei — перечень применимых устройств в официальной поддержке](https://consumer.huawei.com/uk/support/content/en-gb15994486/), [nova Y72](https://consumer.huawei.com/by/phones/nova-y72/specs/), [MatePad 11.5 (2023), японская поддержка](https://consumer.huawei.com/jp/support/tablets/matepad-11-5/). Глобальная старая ссылка nova Y72 перенаправляется на общий каталог; RAM из неё не извлекалась.
- [ZTE — официальный каталог](https://www.ztedevices.com/en/products/) и [Blade A55 Malaysia](https://www.ztedevices.com.my/zte/blade-a-series/66b206e83f209-blade-a55).
- [TECNO — официальный список сравнения](https://www.tecno-mobile.com/phones/product-compare-list/): выбранные CAMON, POVA и SPARK. Их варианты 5G сохранены в именах.
- [Infinix Nigeria](https://ng.infinixmobility.com/category/17), [официальный список с NOTE 40 Pro 5G](https://af.infinixmobility.com/smartphones?cId=15&cName=Latest+Product). NOTE 40 Pro и NOTE 40 Pro 5G разделены.
- [Nokia G22/G42 в пресс-материале HMD](https://www.hmd.com/en_gb/press/nokia-g-22-best-inventions-by-time), [Nokia G42 specs](https://www.hmd.com/en_in/nokia-g-42/specs), [официальный лист HMD Pulse Pro](https://www.hmd.com/assets/wcfotm6rrl7u/4pk6nBJt06h85KOioYpxNP/d5767e840afe95d3c66c7b5a3ca71438/Ecodesign_product_information_sheet_-_HMD_Pulse_Pro.pdf). В Pulse Pro раздельные списки RAM и storage не превращались в декартово произведение.
- [Sony Xperia 1 V](https://www.sony.co.uk/electronics/support/mobile-phones-tablets-mobile-phones/xperia-1-v-256gb/specifications), [Xperia 5 V](https://www.sony.co.uk/electronics/support/mobile-phones-tablets-mobile-phones/xperia-5-v-128gb/specifications), [Xperia 10 VI](https://www.sony.co.uk/electronics/support/mobile-phones-tablets-mobile-phones/xperia-10-vi/specifications).
- [ASUS Zenfone 10](https://press.asus.com/news/press-releases/asus-unveils-the-mighty-new-zenfone10), [Zenfone 11 Ultra](https://www.asus.com/au/mobile-handhelds/phones/zenfone/zenfone-11-ultra/techspec/).
- [Lenovo Tab M11 PSREF](https://psref.lenovo.com/product/Lenovo%20Tablets/Tab_M11?tab=spec): Wi-Fi добавлен отдельно; конкретная аппаратная конфигурация подтверждается по MTM/маркировке, неизвестная память не угадывается.

Проверено локально: модуль импортируется; повторных имён внутри выборки нет; ESLint для файла проходит. Общую проверку объединённого каталога и UI выполняет основной этап задачи.
