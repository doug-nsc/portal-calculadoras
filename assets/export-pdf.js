// Exporta relatórios em PDF com layout inspirado nos mockups fornecidos.

import { tecnologiaNormalizada } from "./lifecycle.js";

const LOGO_SRC = "assets/logo_horizontal_azul.jpg";
let logoDataUrlPromise = null;

async function loadLogoDataUrl() {
  if (logoDataUrlPromise) return logoDataUrlPromise;
  logoDataUrlPromise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width || 0;
        canvas.height = img.naturalHeight || img.height || 0;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        resolve({
          dataUrl: canvas.toDataURL("image/jpeg"),
          width: canvas.width || 1,
          height: canvas.height || 1,
        });
      } catch (err) {
        console.warn("Não foi possível preparar a logo para o PDF:", err);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = new URL(LOGO_SRC, window.location.href).toString();
  });
  return logoDataUrlPromise;
}

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

function todayBr() {
  return new Date().toLocaleDateString("pt-BR");
}

function measureText(doc, text, fontSize = 10) {
  const prev = doc.getFontSize();
  doc.setFontSize(fontSize);
  const width = doc.getTextWidth(String(text ?? ""));
  doc.setFontSize(prev);
  return width;
}

function calcColWidths(doc, columns, rows, { maxWidth, padding = 6, minWidths = [], fontSize = 10 } = {}) {
  if (!Array.isArray(columns) || !columns.length) return [];
  const colCount = columns.length;
  const widths = new Array(colCount).fill(0);
  columns.forEach((col, idx) => {
    widths[idx] = Math.max(widths[idx], measureText(doc, col, fontSize));
  });
  (rows || []).forEach((row) => {
    row.forEach((cell, idx) => {
      widths[idx] = Math.max(widths[idx], measureText(doc, cell, fontSize));
    });
  });
  const padded = widths.map((w, idx) => Math.max(minWidths[idx] || 0, w + padding * 2));
  const total = padded.reduce((a, b) => a + b, 0);
  if (maxWidth && total > maxWidth) {
    const scale = maxWidth / total;
    return padded.map((w, idx) => Math.max(minWidths[idx] || 0, w * scale));
  }
  return padded;
}

function drawLogo(doc, logoInfo, margin, pageWidth) {
  if (!logoInfo?.dataUrl) return;
  const logoWidth = 120;
  const ratio = logoInfo.height / (logoInfo.width || 1);
  const logoHeight = logoWidth * ratio;
  const x = pageWidth - margin - logoWidth;
  const y = margin - 4;
  doc.addImage(logoInfo.dataUrl, "JPEG", x, y, logoWidth, logoHeight);
}

function drawFooter(doc, pageNumber, totalPages, margin, colorPrimary, dateText) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const y = pageHeight - margin + 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...colorPrimary);
  doc.text(`Data de exportação: ${dateText}`, margin, y);
  doc.text(String(pageNumber), doc.internal.pageSize.getWidth() - margin, y, { align: "right" });
}

function drawTitleBlock(doc, pageWidth, y, colorPrimary, sectionTitle) {
  const center = pageWidth / 2;
  doc.setTextColor(...colorPrimary);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Relatório do Portal de Calculadoras", center, y, { align: "center" });
  y += 26;
  doc.text("Módulo Ar-Condicionado", center, y, { align: "center" });
  y += 36;
  doc.setFontSize(18);
  doc.text(sectionTitle, center, y, { align: "center" });
  y += 28;
  return y;
}

function drawSubTitle(doc, pageWidth, y, text, colorPrimary) {
  doc.setTextColor(...colorPrimary);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(text, pageWidth / 2, y, { align: "center" });
  return y + 20;
}

function drawTable(doc, { x, y, columns, rows, colWidths, rowHeight = 24, colors }) {
  if (!columns?.length || !rows?.length) return y;
  const { headerBg, headerText, stripe1, stripe2, border } = colors;
  doc.setLineWidth(0.5);
  doc.setDrawColor(...border);

  // Header
  let cursorX = x;
  doc.setFillColor(...headerBg);
  doc.rect(x, y, colWidths.reduce((a, b) => a + b, 0), rowHeight, "F");
  doc.setTextColor(...headerText);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  columns.forEach((col, idx) => {
    const cellX = cursorX + colWidths[idx] / 2;
    doc.text(String(col), cellX, y + rowHeight / 2 + 3, { align: "center" });
    cursorX += colWidths[idx];
  });

  // Rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  let currentY = y + rowHeight;
  rows.forEach((row, ridx) => {
    cursorX = x;
    const fill = ridx % 2 === 0 ? stripe1 : stripe2;
    row.forEach((cell, cidx) => {
      const w = colWidths[cidx];
      doc.setFillColor(...fill);
      doc.rect(cursorX, currentY, w, rowHeight, "F");
      doc.setTextColor(20, 20, 20);
      doc.text(String(cell ?? ""), cursorX + w / 2, currentY + rowHeight / 2 + 3, { align: "center" });
      cursorX += w;
    });
    currentY += rowHeight;
  });

  return currentY + 10;
}

function drawChart(doc, img, opts) {
  if (!img) return opts.y;
  const { x, y, width, height } = opts;
  doc.addImage(img, "PNG", x, y, width, height);
  return y + height + 16;
}

export async function downloadPdfExport({ dataset, charts, paybackChart }) {
  if (!window.jspdf || !dataset?.computed?.length) return;
  const logoInfo = await loadLogoDataUrl();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const colors = {
    primary: [0, 103, 168],
    headerBg: [0, 108, 143],
    headerText: [255, 255, 255],
    stripe1: [241, 244, 248],
    stripe2: [229, 235, 240],
    border: [200, 205, 210],
  };

  const dateText = todayBr();
  let y = margin + 6;

  const drawHeader = (sectionTitle, addPage = false) => {
    if (addPage) doc.addPage();
    y = margin + 6;
    drawLogo(doc, logoInfo, margin, pageWidth);
    y = drawTitleBlock(doc, pageWidth, y, colors.primary, sectionTitle);
    return y;
  };

  // Página 1: Características + Comparação
  drawHeader("Características Gerais");

  const lifeYears = dataset.lifeYears || 0;
  const usageRows = [
    ["Vida Útil Característica", `${lifeYears} Anos`],
    ["Horas de Uso ao Dia", formatHoursPerDay(dataset.usage.horasUso)],
    ["Dias de Uso ao Ano", `${formatNumberBr(dataset.usage.diasAno, 0)} dias`],
    ["Tarifa Energética", formatCurrencyBr(dataset.usage.tarifaKwh)],
    ["Taxa de Juros Real", formatPercentBr(dataset.usage.taxaReal, 2)],
  ];
  const usageCols = ["Condições de Uso", "Valor"];
  const usageColWidths = calcColWidths(doc, usageCols, usageRows, {
    maxWidth: contentWidth * 0.65,
    minWidths: [150, 120],
    padding: 8,
    fontSize: 11,
  });
  const usageTableWidth = usageColWidths.reduce((a, b) => a + b, 0);
  y = drawTable(doc, {
    x: margin + (contentWidth - usageTableWidth) / 2,
    y,
    columns: usageCols,
    rows: usageRows,
    colWidths: usageColWidths,
    rowHeight: 26,
    colors,
  });

  y += 8;
  y = drawSubTitle(doc, pageWidth, y, "Relação Consumo-Custo dos Equipamentos", colors.primary);

  const eq1 = dataset.computed[0];
  const eq2 = dataset.computed[1];
  const tableCols = [
    "Grandeza",
    `${eq1.eq.marca} (${eq1.eq.tecnologia || tecnologiaNormalizada(eq1.eq)})`,
    `${eq2.eq.marca} (${eq2.eq.tecnologia || tecnologiaNormalizada(eq2.eq)})`,
  ];
  const tableRows = [
    ["Capacidade Térmica", `${formatNumberBr(eq1.eq.potencia_btu, 0)} BTU/h`, `${formatNumberBr(eq2.eq.potencia_btu, 0)} BTU/h`],
    ["Consumo Anual", `${formatNumberBr(eq1.consumoAnual, 0)} kWh/Ano`, `${formatNumberBr(eq2.consumoAnual, 0)} kWh/Ano`],
    ["IDRS", formatNumberBr(eq1.eq.idrs, 2), formatNumberBr(eq2.eq.idrs, 2)],
    ["Classe", `${eq1.eq.classe || ""}`, `${eq2.eq.classe || ""}`],
    [`Consumo em ${lifeYears} Anos`, `${formatNumberBr(eq1.consumoTotal, 2)} kWh`, `${formatNumberBr(eq2.consumoTotal, 2)} kWh`],
    ["COA-Energia Anual", formatCurrencyBr(eq1.custoEnergiaAnual), formatCurrencyBr(eq2.custoEnergiaAnual)],
    [`COA-Energia em ${lifeYears} Anos`, formatCurrencyBr(eq1.custoEnergiaTotal), formatCurrencyBr(eq2.custoEnergiaTotal)],
    ["COA Anual", formatCurrencyBr(eq1.opexAnual), formatCurrencyBr(eq2.opexAnual)],
    [`COA em ${lifeYears} Anos`, formatCurrencyBr(eq1.opexTotal), formatCurrencyBr(eq2.opexTotal)],
  ];
  const colWidths = calcColWidths(doc, tableCols, tableRows, {
    maxWidth: contentWidth,
    minWidths: [150, 120, 120],
    padding: 8,
    fontSize: 11,
  });
  const tblWidthTotal = colWidths.reduce((a, b) => a + b, 0);
  y = drawTable(doc, {
    x: margin + (contentWidth - tblWidthTotal) / 2,
    y,
    columns: tableCols,
    rows: tableRows,
    colWidths,
    rowHeight: 26,
    colors,
  });

  // Página 2: Gráficos empilhados
  drawHeader("Resultados de Consumo e Custo no Tempo", true);
  const chartWidth = contentWidth * 0.9;
  const chartHeight = 180;
  const chartMarginX = margin + (contentWidth - chartWidth) / 2;

  y = drawChart(doc, chartToImage(charts?.consumo), {
    x: chartMarginX,
    y,
    width: chartWidth,
    height: chartHeight,
  });
  y = drawChart(doc, chartToImage(charts?.custo), {
    x: chartMarginX,
    y,
    width: chartWidth,
    height: chartHeight,
  });
  y = drawChart(doc, chartToImage(charts?.total), {
    x: chartMarginX,
    y,
    width: chartWidth,
    height: chartHeight,
  });

  // Página 3: Fluxo de caixa de cada equipamento
  if (dataset.cashflow) {
    drawHeader("Fluxo de Caixa dos Equipamentos na Vida Útil", true);

    const renderCashflowTable = (title, rows, totals) => {
      y = drawSubTitle(doc, pageWidth, y, title, colors.primary) - 4;
      const headers = ["Ano", "CO", "Manutenção", "Energia", "CD", "COA", "VP"];
      const formatted = (rows || []).map((r) => [
        r.ano.toString(),
        formatCurrencyBr(r.capex),
        formatCurrencyBr(r.manutencao),
        formatCurrencyBr(r.energia),
        formatCurrencyBr(r.descarte),
        formatCurrencyBr(r.opex),
        formatCurrencyBr(r.vpOpex ?? r.vpTotal),
      ]);
      if (totals) {
        formatted.push([
          "Total",
          formatCurrencyBr(totals.capex),
          formatCurrencyBr(totals.manutencao),
          formatCurrencyBr(totals.energia),
          formatCurrencyBr(totals.descarte),
          formatCurrencyBr(totals.opex),
          formatCurrencyBr(totals.vpOpex ?? totals.vpTotal),
        ]);
      }
      const widths = calcColWidths(doc, headers, formatted, {
        maxWidth: contentWidth,
        minWidths: [50, 80, 100, 90, 70, 90, 80],
        padding: 6,
        fontSize: 11,
      });
      const tWidth = widths.reduce((a, b) => a + b, 0);
      y = drawTable(doc, {
        x: margin + (contentWidth - tWidth) / 2,
        y,
        columns: headers,
        rows: formatted,
        colWidths: widths,
        rowHeight: 24,
        colors,
      });
    };

    const eqLabel = (eq) => `${eq.marca} – ${formatNumberBr(eq.potencia_btu, 0)} BTU/h`;
    renderCashflowTable(eqLabel(eq1.eq), dataset.cashflow.rows1, dataset.cashflow.totals1);
    y += 8;
    renderCashflowTable(eqLabel(eq2.eq), dataset.cashflow.rows2, dataset.cashflow.totals2);
  }

  // Página 4: Diferença e Payback
  if (dataset.cashflow) {
    drawHeader("Fluxo de Caixa da Diferença e Payback", true);
    const title = `${eq1.eq.marca} e ${eq2.eq.marca} – ${formatNumberBr(eq1.eq.potencia_btu, 0)} BTU/h`;
    y = drawSubTitle(doc, pageWidth, y, title, colors.primary) - 4;

    const headers = ["Ano", "CO", "Manutenção", "Energia", "CD", "COA", "VP", "Payback"];
    const rowsDiff = (dataset.cashflow.rowsDiff || []).map((r) => [
      r.ano.toString(),
      formatCurrencyBr(r.capex),
      formatCurrencyBr(r.manutencao),
      formatCurrencyBr(r.energia),
      formatCurrencyBr(r.descarte),
      formatCurrencyBr(r.opex),
      formatCurrencyBr(r.vpOpex ?? r.vpTotal),
      formatCurrencyBr(r.payback ?? 0),
    ]);
    if (dataset.cashflow.totalsDiff) {
      const t = dataset.cashflow.totalsDiff;
      rowsDiff.push([
        "Total",
        formatCurrencyBr(t.capex),
        formatCurrencyBr(t.manutencao),
        formatCurrencyBr(t.energia),
        formatCurrencyBr(t.descarte),
        formatCurrencyBr(t.opex),
        formatCurrencyBr(t.vpOpex ?? t.vpTotal),
        formatCurrencyBr(t.payback ?? 0),
      ]);
    }
    const widths = calcColWidths(doc, headers, rowsDiff, {
      maxWidth: contentWidth,
      minWidths: [45, 70, 90, 90, 70, 90, 80, 80],
      padding: 6,
      fontSize: 11,
    });
    const tableWidth = widths.reduce((a, b) => a + b, 0);
    y = drawTable(doc, {
      x: margin + (contentWidth - tableWidth) / 2,
      y,
      columns: headers,
      rows: rowsDiff,
      colWidths: widths,
      rowHeight: 24,
      colors,
    });

    y += 6;
    y = drawSubTitle(doc, pageWidth, y, "Curva de Payback", colors.primary);
    y = drawChart(doc, chartToImage(paybackChart), {
      x: margin + (contentWidth - chartWidth) / 2,
      y,
      width: chartWidth,
      height: chartWidth * 0.55,
    });
  }

  // Rodapés (data + número da página)
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(doc, i, totalPages, margin, colors.primary, dateText);
  }

  doc.save("Relatório Custo-Benefício - Ar-Condicionado.pdf");
}
