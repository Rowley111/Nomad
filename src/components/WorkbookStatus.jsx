import React from "react";
import { workbookSummary } from "../domain/workbook.js";

export default function WorkbookStatus() {
  const summary = workbookSummary();
  return <details className="panel workbook-status">
    <summary>Таблица владельца: {summary.models} моделей · {summary.variants} конфигураций</summary>
    <p>Данные из {summary.name} подключены автоматически. Расчёт таблицы: {summary.calculatedOn}.</p>
    <p>Ориентиры есть у {summary.pricedVariants} строк; {summary.noPriceVariants} строк без цены. Это черновые суммы из таблицы, а не проверенные объявления или состоявшиеся сделки. Память и региональную модификацию нужно сверять на устройстве.</p>
    <p>Ваш сохранённый прайс имеет приоритет. Ориентиры Excel не перезаписывают товары, закупки, продажи и индивидуальные цены.</p>
  </details>;
}
