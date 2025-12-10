// Arquivo responsável por exportar os dados do comparador e análise de ciclo de vida para PDF.

import { tecnologiaNormalizada } from "./lifecycle.js";

const formatNumberBr = (value, decimals = 2) =>
  Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const formatCurrencyBr = (value) => `R$ ${formatNumberBr(value, 2)}`;
const formatPercentBr = (value, decimals = 2) =>
  `${Number((value || 0) * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;

const formatHoursPerDay = (hours) => {
  const h = Math.floor(hours || 0);
  const m = Math.round(((hours || 0) - h) * 60)
    .toString()
    .padStart(2, "0");
  return `${h}h${m}min`;
};

function chartToImage(chart) {
  if (!chart) return null;
  return chart.toBase64Image("image/png", 1);
}

export function downloadPdfExport({ dataset, charts, paybackChart }) {
  if (!window.jspdf || !dataset?.computed?.length) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 32;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const addPageIfNeeded = (heightNeeded) => {
    if (y + heightNeeded > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const drawGridTable = ({ title, columns, rows, colWidths, startX }) => {
    if (!rows?.length || !columns?.length) return 0;
    const rowHeight = 18;
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    const colX = [];
    let acc = startX;
    colWidths.forEach((w) => {
      colX.push(acc);
      acc += w;
    });

    const tableHeight = rowHeight * (rows.length + 1) + 18;
    addPageIfNeeded(tableHeight + 8);

    doc.setFontSize(12);
    doc.text(title, startX, y);
    y += 14;
    doc.setFontSize(10);

    let topLineY = y;
    doc.line(startX, topLineY, startX + totalWidth, topLineY);

    const drawRow = (vals) => {
      vals.forEach((v, idx) => {
        doc.text(v, colX[idx] + 2, y + rowHeight - 6);
      });
      doc.line(startX, y + rowHeight, startX + totalWidth, y + rowHeight);
      y += rowHeight;
    };

    drawRow(columns);
    rows.forEach((r) => drawRow(r));

    let xLine = startX;
    doc.line(startX, topLineY, startX, y);
    colWidths.forEach((w) => {
      xLine += w;
      doc.line(xLine, topLineY, xLine, y);
    });
    return y; // y j? est? no fim da tabela
  };

  const addChartImage = (chart, title = "") => {
    if (!chart) return;
    const img = chartToImage(chart);
    if (!img) return;
    const cw = chart.canvas?.width || 800;
    const ch = chart.canvas?.height || 500;
    const ratio = ch / cw;
    const targetWidth = contentWidth;
    const targetHeight = targetWidth * ratio;
    addPageIfNeeded(targetHeight + (title ? 10 : 0) + 8);
    if (title) {
      doc.setFontSize(11);
      doc.text(title, margin, y);
      y += 10;
    }
    doc.addImage(img, "PNG", margin, y, targetWidth, targetHeight);
    y += targetHeight + 8;
  };

  const addTableFull = (title, rows, totals, includePayback = false) => {
    if (!rows?.length) return 0;
    const headers = ["Ano", "CAPEX", "Manut.", "Energia", "Residual", "Opex", "VP"];
    if (includePayback) headers.push("Payback");
    const colWidths = includePayback ? [45, 75, 75, 75, 75, 75, 75, 75] : [52, 82, 82, 82, 82, 82, 82];
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    const colX = [];
    let acc = margin;
    colWidths.forEach((w) => {
      colX.push(acc);
      acc += w;
    });
    const rowHeight = 18;
    const allRows = rows.slice();
    if (totals) allRows.push({ ...totals, ano: "Total" });
    const tableHeight = rowHeight * (allRows.length + 1) + 18;
    addPageIfNeeded(tableHeight + 8);

    doc.setFontSize(12);
    doc.text(title, margin, y);
    y += 14;
    doc.setFontSize(10);

    let topLineY = y;
    doc.line(margin, topLineY, margin + totalWidth, topLineY);
    const drawRow = (vals) => {
      vals.forEach((v, idx) => {
        doc.text(v, colX[idx] + 2, y + rowHeight - 6);
      });
      doc.line(margin, y + rowHeight, margin + totalWidth, y + rowHeight);
      y += rowHeight;
    };
    drawRow(headers);
    allRows.forEach((r) => {
      const vals = [
        r.ano.toString(),
        formatNumberBr(r.capex, 2),
        formatNumberBr(r.manutencao, 2),
        formatNumberBr(r.energia, 2),
        formatNumberBr(r.descarte, 2),
        formatNumberBr(r.opex, 2),
        formatNumberBr(r.vpOpex ?? r.vpTotal, 2),
      ];
      if (includePayback) vals.push(r.payback !== undefined ? formatNumberBr(r.payback, 2) : "");
      drawRow(vals);
    });
    let xLine = margin;
    doc.line(margin, topLineY, margin, y);
    colWidths.forEach((w) => {
      xLine += w;
      doc.line(xLine, topLineY, xLine, y);
    });
    y += 8;
    return y;
  };

  // Cabe?alho
  doc.setFontSize(16);
  doc.text("Relat?rio da Rela??o Custo-Benef?cio - M?dulo Ar-Condicionado", pageWidth / 2, y, { align: "center" });
  y += 24;

  // P?gina 1: Configura??es Gerais (topo) e Comparador (abaixo)
  if (dataset.computed.length >= 2) {
    const eq1 = dataset.computed[0];
    const eq2 = dataset.computed[1];
    const lifeYears = dataset.lifeYears || 0;

    const cfgCols = ["Condi??es de Uso", "Valor"];
    const cfgRows = [
      ["Vida ?til", `${lifeYears} Anos`],
      ["Horas por Dia", formatHoursPerDay(dataset.usage.horasUso)],
      ["Dias ao Ano", `${formatNumberBr(dataset.usage.diasAno, 0)} dias`],
      ["Tarifa Energ?tica", formatCurrencyBr(dataset.usage.tarifaKwh)],
      ["Taxa de Juros Real", formatPercentBr(dataset.usage.taxaReal, 2)],
    ];
    const cfgWidths = [220, 160];
    const cfgWidthTotal = cfgWidths.reduce((a, b) => a + b, 0);
    drawGridTable({
      title: "Configura??es Gerais",
      columns: cfgCols,
      rows: cfgRows,
      colWidths: cfgWidths,
      startX: margin + (contentWidth - cfgWidthTotal) / 2,
    });
    y += 10;

    const tableCols = [
      "Grandeza",
      `${eq1.eq.marca} (${eq1.eq.tecnologia || tecnologiaNormalizada(eq1.eq)})`,
      `${eq2.eq.marca} (${eq2.eq.tecnologia || tecnologiaNormalizada(eq2.eq)})`,
    ];
    const tableRows = [
      ["Capacidade T?rmica", `${formatNumberBr(eq1.eq.potencia_btu, 0)} BTU/h`, `${formatNumberBr(eq2.eq.potencia_btu, 0)} BTU/h`],
      ["Consumo Anual", `${formatNumberBr(eq1.consumoAnual, 0)} kWh/Ano`, `${formatNumberBr(eq2.consumoAnual, 0)} kWh/Ano`],
      ["IDRS", formatNumberBr(eq1.eq.idrs, 2), formatNumberBr(eq2.eq.idrs, 2)],
      ["Classe", `${eq1.eq.classe || ""}`, `${eq2.eq.classe || ""}`],
      [`Consumo em ${lifeYears} Anos`, `${formatNumberBr(eq1.consumoTotal, 2)} kWh`, `${formatNumberBr(eq2.consumoTotal, 2)} kWh`],
      ["COA-Energia Anual", formatCurrencyBr(eq1.custoEnergiaAnual), formatCurrencyBr(eq2.custoEnergiaAnual)],
      [`COA-Energia em ${lifeYears} Anos`, formatCurrencyBr(eq1.custoEnergiaTotal), formatCurrencyBr(eq2.custoEnergiaTotal)],
      ["COA Anual", formatCurrencyBr(eq1.opexAnual), formatCurrencyBr(eq2.opexAnual)],
      [`COA em ${lifeYears} Anos`, formatCurrencyBr(eq1.opexTotal), formatCurrencyBr(eq2.opexTotal)],
    ];
    const colWidths = [180, (contentWidth - 180) / 2, (contentWidth - 180) / 2];
    const tblWidthTotal = colWidths.reduce((a, b) => a + b, 0);
    drawGridTable({
      title: "Comparador - Custo-Benef?cio",
      columns: tableCols,
      rows: tableRows,
      colWidths,
      startX: margin + (contentWidth - tblWidthTotal) / 2,
    });
  }

  // P?gina 2: tr?s gr?ficos empilhados
  doc.addPage();
  y = margin;
  addChartImage(charts?.consumo, "");
  addChartImage(charts?.custo, "");
  addChartImage(charts?.total, "");

  // P?gina 3: fluxo de caixa (duas tabelas empilhadas)
  if (dataset.cashflow) {
    doc.addPage();
    y = margin;
    addTableFull("Fluxo de Caixa - Equipamento 1", dataset.cashflow.rows1, dataset.cashflow.totals1);
    addTableFull("Fluxo de Caixa - Equipamento 2", dataset.cashflow.rows2, dataset.cashflow.totals2);
  }

  // P?gina 4: tabela de diferen?a e gr?fico de payback lado a lado
  if (dataset.cashflow) {
    doc.addPage();
    y = margin;
    const half = (contentWidth - 12) / 2;
    const tableCols = ["Ano", "CAPEX", "Manut.", "Energia", "Residual", "Opex", "VP", "Payback"];
    const baseWidths = [40, 60, 60, 60, 60, 60, 60, 60];
    const scale = half / baseWidths.reduce((a, b) => a + b, 0);
    const colWidths = baseWidths.map((w) => w * scale);
    const tableHeightStart = y;
    // desenha tabela ? esquerda
    const savedY = y;
    const tableHeight = (() => {
      if (!dataset.cashflow.rowsDiff?.length) return 0;
      const headers = tableCols;
      const rows = dataset.cashflow.rowsDiff.slice();
      if (dataset.cashflow.totalsDiff) rows.push({ ...dataset.cashflow.totalsDiff, ano: "Total" });
      const rowHeight = 18;
      const totalWidth = colWidths.reduce((a, b) => a + b, 0);
      addPageIfNeeded(rowHeight * (rows.length + 1) + 20);
      doc.setFontSize(12);
      doc.text("Fluxo de Caixa - Diferen?a (com payback)", margin, y);
      y += 14;
      doc.setFontSize(10);
      let top = y;
      doc.line(margin, top, margin + totalWidth, top);
      const drawRow = (vals) => {
        vals.forEach((v, idx) => doc.text(v, margin + colWidths.slice(0, idx).reduce((a, b) => a + b, 0) + 2, y + rowHeight - 6));
        doc.line(margin, y + rowHeight, margin + totalWidth, y + rowHeight);
        y += rowHeight;
      };
      drawRow(headers);
      rows.forEach((r) => {
        const vals = [
          r.ano.toString(),
          formatNumberBr(r.capex, 2),
          formatNumberBr(r.manutencao, 2),
          formatNumberBr(r.energia, 2),
          formatNumberBr(r.descarte, 2),
          formatNumberBr(r.opex, 2),
          formatNumberBr(r.vpOpex ?? r.vpTotal, 2),
          formatNumberBr(r.payback ?? 0, 2),
        ];
        drawRow(vals);
      });
      let xLine = margin;
      doc.line(margin, top, margin, y);
      colWidths.forEach((w) => {
        xLine += w;
        doc.line(xLine, top, xLine, y);
      });
      return y - savedY;
    })();
    y = savedY; // reset to top for aligned layout

    // gr?fico ? direita
    if (paybackChart) {
      const img = chartToImage(paybackChart);
      if (img) {
        const cw = paybackChart.canvas?.width || 800;
        const ch = paybackChart.canvas?.height || 500;
        const ratio = ch / cw;
        const chartHeight = half * ratio;
        addPageIfNeeded(Math.max(chartHeight, tableHeight) + 10);
        doc.addImage(img, "PNG", margin + half + 12, y, half, chartHeight);
      }
    }
    y = tableHeightStart + Math.max(tableHeight, 0) + 8;
  }

  doc.save("comparador-custo-beneficio.pdf");
}
