// Exporta relatórios em PDF com layout inspirado nos mockups fornecidos.

// Resumo: gera o PDF do comparador com tabelas, graficos e fluxo de caixa, carregando logo e fontes.
import { tecnologiaNormalizada } from "./lifecycle.js";

const LOGO_SRC = "assets/logo_horizontal_azul.jpg";
const FONT_FAMILY = "Manrope";
const FONT_SOURCES = {
  normal: [
    new URL("assets/fonts/Manrope-Regular.ttf", window.location.href).toString(),
    "https://raw.githubusercontent.com/googlefonts/manrope/main/fonts/ttf/Manrope-Regular.ttf",
  ],
  bold: [
    new URL("assets/fonts/Manrope-Bold.ttf", window.location.href).toString(),
    "https://raw.githubusercontent.com/googlefonts/manrope/main/fonts/ttf/Manrope-Bold.ttf",
  ],
};

const THEME = {
  margin: 44,
  footerReserve: 30,
  colors: {
    primary: [0, 103, 168],
    headerBg: [0, 108, 143],
    headerText: [255, 255, 255],
    stripe1: [241, 244, 248],
    stripe2: [229, 235, 240],
    border: [200, 205, 210],
    text: [32, 38, 46],
  },
  table: {
    headerHeight: 22,
    rowPaddingY: 5,
    paddingX: 6,
    lineHeight: 1.2,
  },
};

let logoDataUrlPromise = null;
let manropeLoaded = false;
let activeFont = FONT_FAMILY;
let fontReady = false;

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

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadFontBase64(urls = []) {
  for (const url of urls) {
    if (!url) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buffer = await res.arrayBuffer();
      return bufferToBase64(buffer);
    } catch (err) {
      console.warn("Falha ao carregar fonte Manrope de", url, err);
    }
  }
  return null;
}

async function ensureManrope(doc) {
  if (fontReady) {
    doc.setFont(activeFont, "normal");
    return;
  }

  const [normal, bold] = await Promise.all([loadFontBase64(FONT_SOURCES.normal), loadFontBase64(FONT_SOURCES.bold)]);
  if (normal) {
    doc.addFileToVFS(`${FONT_FAMILY}-Regular.ttf`, normal);
    doc.addFont(`${FONT_FAMILY}-Regular.ttf`, FONT_FAMILY, "normal");
  }
  if (bold) {
    doc.addFileToVFS(`${FONT_FAMILY}-Bold.ttf`, bold);
    doc.addFont(`${FONT_FAMILY}-Bold.ttf`, FONT_FAMILY, "bold");
  }

  manropeLoaded = Boolean(normal);
  activeFont = normal ? FONT_FAMILY : "helvetica";
  fontReady = true;
  if (!normal) console.warn("Usando Helvetica por fallback (Manrope não carregada).");
  doc.setFont(activeFont, "normal");
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

function formatDateTimeBrWithGmt(date = new Date()) {
  const dateStr = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const prettyDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  const timeStr = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const hours = Math.floor(Math.abs(offsetMinutes) / 60);
  const mins = Math.abs(offsetMinutes) % 60;
  const gmt = `GMT ${sign}${hours}${mins ? `:${String(mins).padStart(2, "0")}` : ""}`;
  return `${prettyDate}, ${timeStr} (${gmt})`;
}

function chartToImage(chart) {
  if (!chart) return null;
  const rect = chart.canvas?.getBoundingClientRect?.();
  const cssWidth = rect?.width || null;
  const cssHeight = rect?.height || null;
  const canvasWidth = chart.canvas?.width || chart.width || cssWidth || null;
  const canvasHeight = chart.canvas?.height || chart.height || cssHeight || null;
  return {
    dataUrl: chart.toBase64Image("image/png", 2),
    width: canvasWidth || 1,
    height: canvasHeight || 1,
    cssWidth: cssWidth || canvasWidth || 1,
    cssHeight: cssHeight || canvasHeight || 1,
  };
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
  if (!logoInfo?.dataUrl) return null;
  const logoWidth = 150; // um pouco maior para equilibrar com o título
  const ratio = logoInfo.height / (logoInfo.width || 1);
  const logoHeight = logoWidth * ratio;
  const x = pageWidth - margin - logoWidth;
  const y = margin - 15; // leve ajuste para alinhar com o título
  doc.addImage(logoInfo.dataUrl, "JPEG", x, y, logoWidth, logoHeight);
  return { x, y, width: logoWidth, height: logoHeight };
}

function drawFooter(doc, pageNumber, margin, colorPrimary, dateText) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const y = pageHeight - margin + 12;
  doc.setFont(activeFont, "normal");
  doc.setFontSize(11);
  doc.setTextColor(...colorPrimary);
  doc.text(`Data de Exportação: ${dateText}`, margin, y);
  doc.setFont(activeFont, "bold");
  doc.text(String(pageNumber), doc.internal.pageSize.getWidth() - margin, y, { align: "right" });
}

function drawTitleBlock(doc, pageWidth, margin, colorPrimary, sectionTitle, logoMeta) {
  doc.setTextColor(...colorPrimary);
  doc.setFont(activeFont, "bold");
  doc.setFontSize(20);
  const headerShift = logoMeta?.width ? logoMeta.width * 0.55 : 32;
  const headerCenterX = pageWidth / 2 - headerShift;
  const sectionCenterX = pageWidth / 2;
  const baseY = margin + 12;
  doc.text("Relatório do Portal de Calculadoras", headerCenterX, baseY, { align: "center" });
  doc.setFontSize(18);
  doc.text("Módulo Ar-Condicionado", headerCenterX, baseY + 22, { align: "center" });
  doc.setFontSize(17);

  // título da página/seção
  doc.text(sectionTitle, sectionCenterX, baseY + 70, { align: "center" });
  return baseY + 90;
}

function drawSubTitle(doc, section, text, colorPrimary, fontSize = 15) {
  const pageWidth = doc.internal.pageSize.getWidth();
  section.ensureSpace(fontSize + 16);
  doc.setTextColor(...colorPrimary);
  doc.setFont(activeFont, "bold");
  doc.setFontSize(fontSize);
  const y = section.getY() + fontSize;
  doc.text(text, pageWidth / 2, y, { align: "center" });
  section.setY(y + 10);
}

function splitCellText(doc, text, maxWidth) {
  const safeText = text === null || text === undefined ? "" : String(text);
  return doc.splitTextToSize(safeText, Math.max(maxWidth, 20));
}

function drawTable(doc, section, config) {
  const {
    columns,
    rows,
    colWidths,
    colors,
    align = [],
    title,
    fontSize = 9,
    headerHeight = THEME.table.headerHeight,
    rowPaddingY = THEME.table.rowPaddingY,
    paddingX = THEME.table.paddingX,
  } = config;
  if (!columns?.length || !rows?.length) return;

  const pageWidth = doc.internal.pageSize.getWidth();
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const startX = config.x ?? (pageWidth - tableWidth) / 2;

  const renderTitle = () => {
    if (!title) return;
    drawSubTitle(doc, section, title, colors.primary, 15);
  };

  const renderHeaderRow = () => {
    section.ensureSpace(headerHeight + 4, { afterAddPage: renderTitle });
    let cursorX = startX;
    doc.setFillColor(...colors.headerBg);
    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.5);
    doc.rect(startX, section.getY(), tableWidth, headerHeight, "F");
    doc.setTextColor(...colors.headerText);
      doc.setFont(activeFont, "bold");
    doc.setFontSize(fontSize);
    columns.forEach((col, idx) => {
      const cellX = cursorX + colWidths[idx] / 2;
      doc.text(String(col), cellX, section.getY() + headerHeight / 2 + 3, { align: "center" });
      cursorX += colWidths[idx];
    });
    section.addY(headerHeight);
  };

  const computeRowHeight = (row) => {
    const heights = row.map((cell, idx) => {
      const lines = splitCellText(doc, cell, colWidths[idx] - paddingX * 2);
      return lines.length * fontSize * THEME.table.lineHeight + rowPaddingY * 2;
    });
    return Math.max(...heights);
  };

  renderTitle();
  renderHeaderRow();

  rows.forEach((row, ridx) => {
    const rowHeight = computeRowHeight(row);
    const stripe = ridx % 2 === 0 ? colors.stripe1 : colors.stripe2;
    const onPageBreak = () => {
      renderTitle();
      renderHeaderRow();
    };
    section.ensureSpace(rowHeight + 2, { afterAddPage: onPageBreak });

    let cursorX = startX;
    row.forEach((cell, cidx) => {
      const w = colWidths[cidx];
      const cellLines = splitCellText(doc, cell, w - paddingX * 2);
      doc.setFillColor(...stripe);
      doc.setDrawColor(...colors.border);
      doc.rect(cursorX, section.getY(), w, rowHeight, "F");
      doc.setTextColor(...THEME.colors.text);
      doc.setFont(activeFont, "normal");
      doc.setFontSize(fontSize);
      const alignOpt = align[cidx] || "center";
      const textX = alignOpt === "right" ? cursorX + w - paddingX : alignOpt === "center" ? cursorX + w / 2 : cursorX + paddingX;
      const baseY = section.getY() + rowPaddingY + fontSize;
      cellLines.forEach((line, lineIdx) => {
        const lineY = baseY + lineIdx * fontSize * THEME.table.lineHeight;
        doc.text(String(line), textX, lineY, { align: alignOpt });
      });
      cursorX += w;
    });
    section.addY(rowHeight);
  });

  section.addY(20); // espaço após a tabela
}

function drawChart(doc, section, img, { width, maxHeight }) {
  if (!img?.dataUrl) return;
  const pageWidth = doc.internal.pageSize.getWidth();
  const naturalRatio =
    img.cssHeight && img.cssWidth
      ? img.cssHeight / img.cssWidth
      : img.height && img.width
      ? img.height / img.width
      : 0.6;
  const maxAllowedWidth = Math.min(
    width,
    pageWidth - THEME.margin * 2,
    (img.cssWidth || img.width || pageWidth) * 0.9
  );
  let chartWidth = maxAllowedWidth;
  let chartHeight = chartWidth * naturalRatio;
  if (chartHeight > maxHeight) {
    const scale = maxHeight / chartHeight;
    chartHeight = maxHeight;
    chartWidth = chartWidth * scale;
  }
  const x = (pageWidth - chartWidth) / 2;
  section.ensureSpace(chartHeight + 12);
  const y = section.getY();
  doc.addImage(img.dataUrl, "PNG", x, y, chartWidth, chartHeight);
  section.setY(y + chartHeight + 14);
}

function createSection(doc, sectionTitle, logoInfo, { addPage = false } = {}) {
  if (addPage) doc.addPage();
  const pageWidth = doc.internal.pageSize.getWidth();
  const logoMeta = drawLogo(doc, logoInfo, THEME.margin, pageWidth);
  const headerBottom = drawTitleBlock(doc, pageWidth, THEME.margin, THEME.colors.primary, sectionTitle, logoMeta);

  let y = headerBottom;
  const maxY = doc.internal.pageSize.getHeight() - THEME.margin - THEME.footerReserve;

  return {
    getY: () => y,
    setY: (val) => {
      y = val;
    },
    addY: (delta) => {
      y += delta;
    },
    ensureSpace: (height, { afterAddPage } = {}) => {
      if (y + height <= maxY) return false;
      doc.addPage();
      const newLogoMeta = drawLogo(doc, logoInfo, THEME.margin, pageWidth);
      const newHeaderBottom = drawTitleBlock(doc, pageWidth, THEME.margin, THEME.colors.primary, sectionTitle, newLogoMeta);
      y = newHeaderBottom;
      afterAddPage?.();
      return true;
    },
    contentWidth: pageWidth - THEME.margin * 2,
  };
}

function validateDataset(dataset) {
  const errors = [];
  if (!dataset) {
    errors.push("Dataset não informado.");
  } else {
    if (!dataset.usage) errors.push("Perfil de uso ausente.");
    if (!Array.isArray(dataset.computed) || dataset.computed.length < 2) errors.push("Selecione dois equipamentos para comparar.");
    if (!dataset.usage?.horasUso && dataset.usage?.horasUso !== 0) errors.push("Horas de uso não informadas.");
    if (!dataset.usage?.tarifaKwh && dataset.usage?.tarifaKwh !== 0) errors.push("Tarifa energética não informada.");
  }
  return { ok: errors.length === 0, errors };
}

function equipmentLabel(eq) {
  return `${eq.marca} – ${formatNumberBr(eq.potencia_btu, 0)} BTU/h`;
}

export async function downloadPdfExport({ dataset, charts, paybackChart }) {
  if (!window.jspdf) {
    console.warn("jsPDF não encontrado no window.");
    return;
  }
  const validation = validateDataset(dataset);
  if (!validation.ok) {
    alert(`Não foi possível gerar o PDF:\n- ${validation.errors.join("\n- ")}`);
    return;
  }

  const logoInfo = await loadLogoDataUrl();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  await ensureManrope(doc);

  const dateText = formatDateTimeBrWithGmt();
  const lifeYears = dataset.lifeYears || 0;
  const [eq1, eq2] = dataset.computed;

  // Página 1: características gerais
  const page1 = createSection(doc, "Características Gerais", logoInfo);
  const usageRows = [
    ["Vida Útil Característica", `${lifeYears} anos`],
    ["Horas de Uso ao Dia", formatHoursPerDay(dataset.usage.horasUso)],
    ["Dias de Uso ao Ano", `${formatNumberBr(dataset.usage.diasAno, 0)} dias`],
    ["Tarifa Energética", formatCurrencyBr(dataset.usage.tarifaKwh)],
    ["Taxa de Juros Real", formatPercentBr(dataset.usage.taxaReal, 2)],
  ];
  const usageCols = ["Condições de Uso", "Valor"];
  const usageColWidths = calcColWidths(doc, usageCols, usageRows, {
    maxWidth: page1.contentWidth * 0.64,
    minWidths: [150, 120],
    padding: 7,
    fontSize: 9,
  });
  drawTable(doc, page1, {
    columns: usageCols,
    rows: usageRows,
    colWidths: usageColWidths,
    colors: THEME.colors,
    title: "Condições de Uso Geral",
    align: ["center", "center"],
    fontSize: 9,
  });

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
    ["COA Anual", formatCurrencyBr(eq1.coaAnual), formatCurrencyBr(eq2.coaAnual)],
    [`COA em ${lifeYears} Anos`, formatCurrencyBr(eq1.coaTotal), formatCurrencyBr(eq2.coaTotal)],
  ];
  const colWidths = calcColWidths(doc, tableCols, tableRows, {
    maxWidth: page1.contentWidth * 0.88,
    minWidths: [150, 130, 130],
    padding: 7,
    fontSize: 9,
  });
  drawTable(doc, page1, {
    columns: tableCols,
    rows: tableRows,
    colWidths,
    colors: THEME.colors,
    title: "Relação Consumo-Custo dos Equipamentos",
    align: ["center", "center", "center"],
    fontSize: 9,
  });

  // Página 2: gráficos de consumo/custo
  const page2 = createSection(doc, "Resultados de Consumo e Custo no Tempo", logoInfo, { addPage: true });
  const chartWidth = page2.contentWidth * 0.85;
  const chartHeight = Math.min(190, chartWidth * 0.85);
  drawChart(doc, page2, chartToImage(charts?.consumo), { width: chartWidth, maxHeight: chartHeight });
  drawChart(doc, page2, chartToImage(charts?.custo), { width: chartWidth, maxHeight: chartHeight });
  drawChart(doc, page2, chartToImage(charts?.total), { width: chartWidth, maxHeight: chartHeight });

  // Página 3: fluxo de caixa de cada equipamento
  if (dataset.cashflow) {
    const page3 = createSection(doc, "Fluxo de Caixa dos Equipamentos na Vida Útil", logoInfo, { addPage: true });
    const renderCashflowTable = (title, rows, totals) => {
      const headers = ["Ano", "CO", "Manutenção", "Energia", "CD", "COA", "VP"];
      const formatted = (rows || []).map((r) => [
        r.ano.toString(),
        formatCurrencyBr(r.capex),
        formatCurrencyBr(r.manutencao),
        formatCurrencyBr(r.energia),
        formatCurrencyBr(r.descarte),
        formatCurrencyBr(r.coa),
        formatCurrencyBr(r.vpCoa ?? r.vpTotal),
      ]);
      if (totals) {
        formatted.push([
          "Total",
          formatCurrencyBr(totals.capex),
          formatCurrencyBr(totals.manutencao),
          formatCurrencyBr(totals.energia),
          formatCurrencyBr(totals.descarte),
          formatCurrencyBr(totals.coa),
          formatCurrencyBr(totals.vpCoa ?? totals.vpTotal),
        ]);
      }
      const widths = calcColWidths(doc, headers, formatted, {
        maxWidth: page3.contentWidth * 0.80,
        minWidths: [35, 74, 90, 90, 60, 90, 80],
        padding: 6,
        fontSize: 9,
      });
      drawTable(doc, page3, {
        columns: headers,
        rows: formatted,
        colWidths: widths,
        colors: THEME.colors,
        title,
        align: ["center", "center", "center", "center", "center", "center", "center"],
        fontSize: 9,
      });
    };

    renderCashflowTable(equipmentLabel(eq1.eq), dataset.cashflow.rows1, dataset.cashflow.totals1);
    renderCashflowTable(equipmentLabel(eq2.eq), dataset.cashflow.rows2, dataset.cashflow.totals2);
  }

  // Página 4: diferença + payback
  if (dataset.cashflow) {
    const page4 = createSection(doc, "Fluxo de Caixa da Diferença e Payback", logoInfo, { addPage: true });
    const title = `${eq1.eq.marca} e ${eq2.eq.marca} – ${formatNumberBr(eq1.eq.potencia_btu, 0)} BTU/h`;
    const headers = ["Ano", "CO", "Manutenção", "Energia", "CD", "COA", "VP", "Payback"];
    const rowsDiff = (dataset.cashflow.rowsDiff || []).map((r) => [
      r.ano.toString(),
      formatCurrencyBr(r.capex),
      formatCurrencyBr(r.manutencao),
      formatCurrencyBr(r.energia),
      formatCurrencyBr(r.descarte),
      formatCurrencyBr(r.coa),
      formatCurrencyBr(r.vpCoa ?? r.vpTotal),
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
        formatCurrencyBr(t.coa),
        formatCurrencyBr(t.vpCoa ?? t.vpTotal),
        formatCurrencyBr(t.payback ?? 0),
      ]);
    }
    const widths = calcColWidths(doc, headers, rowsDiff, {
      maxWidth: page4.contentWidth * 0.80,
      minWidths: [35, 66, 80, 80, 60, 80, 70, 76],
      padding: 5,
      fontSize: 9,
    });
    drawTable(doc, page4, {
      columns: headers,
      rows: rowsDiff,
      colWidths: widths,
      colors: THEME.colors,
      title,
      align: ["center", "center", "center", "center", "center", "center", "center", "center"],
      fontSize: 9,
    });

    drawSubTitle(doc, page4, "Curva de Payback", THEME.colors.primary, 15);
    const paybackImg = chartToImage(paybackChart);
    drawChart(doc, page4, paybackImg, { width: page4.contentWidth * 0.96, maxHeight: 265 });
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(doc, i, THEME.margin, THEME.colors.primary, dateText);
  }

  doc.save("Relatório Custo-Benefício - Ar-Condicionado.pdf");
}
