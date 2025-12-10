// Arquivo responsável por configurações, plugins e construtores de gráficos usando Chart.js

export const BLUE_PALETTE = ["#0b5c8a", "#0d6fb2", "#1380c9", "#1992dd", "#3aa9f2"];

export const withAlpha = (hex, alpha = "b3") => `${hex}${alpha}`;

// Plugins e construtores compartilhados para os gráficos do comparador e das curvas de ciclo de vida
const valueLabelPlugin = {
  id: "valueLabel",
  afterDatasetsDraw(chart, args, opts) {
    if (!opts?.display) return;
    const { ctx } = chart;
    ctx.save();
    const decimals = Number.isFinite(opts.decimals) ? opts.decimals : 2;
    const formatter = typeof opts.formatter === "function" ? opts.formatter : null;
    const prefix = opts.prefix || "";
    const suffix = opts.suffix || "";
    const color = opts.color || "#323c4a";
    const font = opts.font || "bold 12px 'Manrope', sans-serif";
    const padding = Number.isFinite(opts.padding) ? opts.padding : 4;

    const isSameStack = (d, ref) => {
      const a = d.stack || "__default";
      const b = ref.stack || "__default";
      return a === b;
    };

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (!chart.isDatasetVisible(datasetIndex)) return;

      meta.data.forEach((bar, index) => {
        // Stacked: só desenha no topo do stack visível
        if (opts.stacked) {
          let lastVisibleSameStack = -1;
          chart.data.datasets.forEach((d, i) => {
            if (!chart.isDatasetVisible(i)) return;
            if (isSameStack(d, dataset)) lastVisibleSameStack = i;
          });
          if (lastVisibleSameStack !== datasetIndex) return;
        }

        // Valor a exibir
        let value = dataset.data[index];
        if (opts.stacked) {
          value = chart.data.datasets.reduce((acc, d, i) => {
            if (!chart.isDatasetVisible(i)) return acc;
            if (!isSameStack(d, dataset)) return acc;
            const v = d.data[index];
            return acc + (Number.isFinite(v) ? v : 0);
          }, 0);
        }
        if (!Number.isFinite(value)) return;

        const { x, y } = bar.tooltipPosition();
        ctx.fillStyle = color;
        ctx.font = font;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        const formatted = formatter ? formatter(value) : `${prefix}${value.toFixed(decimals)}${suffix}`;
        ctx.fillText(formatted, x, y - padding);
      });
    });

    ctx.restore();
  },
};

Chart.register(valueLabelPlugin);
// Plugin de linhas de interseção: aceita alvo em y (encontra x) ou alvo em x (encontra y) no 1° dataset.
const crosshairPlugin = {
  id: "crosshairX",
  afterDraw(chart, args, opts) {
    if (!opts || (typeof opts.yValue !== "number" && typeof opts.xValue !== "number")) return;
    const xScale = chart.scales?.x;
    const yScale = chart.scales?.y;
    if (!xScale || !yScale) return;

    const labels = chart.data.labels || [];
    const data = chart.data.datasets?.[0]?.data || [];
    if (!labels.length || !data.length) return;

    const labelNums = labels.map((l) => Number(l));
    const getYAtX = (xTarget) => {
      for (let i = 0; i < labelNums.length - 1; i++) {
        const x1 = labelNums[i];
        const x2 = labelNums[i + 1];
        const y1 = data[i];
        const y2 = data[i + 1];
        if (![x1, x2, y1, y2].every(Number.isFinite)) continue;
        if (xTarget === x1) return y1;
        if (xTarget === x2) return y2;
        if ((xTarget > x1 && xTarget < x2) || (xTarget < x1 && xTarget > x2)) {
          const t = (xTarget - x1) / (x2 - x1);
          return y1 + t * (y2 - y1);
        }
      }
      return null;
    };

    let xVal = null;
    let yVal = null;

    if (typeof opts.yValue === "number") {
      const yTarget = opts.yValue;
      const pickRight = opts.side === "right";
      const range = pickRight ? [...Array(data.length - 1).keys()].reverse() : [...Array(data.length - 1).keys()];
      for (const i of range) {
        const y1 = data[i];
        const y2 = data[i + 1];
        if (!Number.isFinite(y1) || !Number.isFinite(y2)) continue;
        const x1 = labelNums[i];
        const x2 = labelNums[i + 1];
        if (!Number.isFinite(x1) || !Number.isFinite(x2)) continue;
        if (y1 === yTarget) { xVal = x1; yVal = yTarget; break; }
        const crossed = (y1 - yTarget) * (y2 - yTarget) <= 0;
        if (crossed && y2 !== y1) {
          const t = (yTarget - y1) / (y2 - y1);
          xVal = x1 + t * (x2 - x1);
          yVal = yTarget;
          break;
        }
      }
    } else if (typeof opts.xValue === "number") {
      xVal = opts.xValue;
      yVal = getYAtX(xVal);
    }

    if (!Number.isFinite(xVal) || !Number.isFinite(yVal)) return;

    let xPixel;
    if (xScale.type === "category") {
      let nearestIdx = 0;
      let minDiff = Number.POSITIVE_INFINITY;
      labelNums.forEach((ln, idx) => {
        if (!Number.isFinite(ln)) return;
        const diff = Math.abs(ln - xVal);
        if (diff < minDiff) {
          minDiff = diff;
          nearestIdx = idx;
        }
      });
      xPixel = xScale.getPixelForValue(nearestIdx);
    } else {
      xPixel = xScale.getPixelForValue(xVal);
    }
    const yPixel = yScale.getPixelForValue(yVal);

    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = opts.color || "#777";
    ctx.lineWidth = opts.width || 1;
    if (opts.dash) ctx.setLineDash(opts.dash);

    ctx.beginPath();
    ctx.moveTo(xPixel, yScale.top);
    ctx.lineTo(xPixel, yScale.bottom);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(xScale.left, yPixel);
    ctx.lineTo(xScale.right, yPixel);
    ctx.stroke();

    ctx.restore();
  },
};

Chart.register(crosshairPlugin);


const formatCurrency = (v) =>
  `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatNumber = (v, decimals = 0) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export function destroyChartGroup(group) {
  Object.values(group).forEach((c) => c && c.destroy());
  Object.keys(group).forEach((k) => (group[k] = null));
}

export function createComparadorCharts({
  labels,
  consumos,
  custosEnergia,
  custosAq,
  custosInst,
  colorScale,
  lifeYears = 1,
}) {
  const lifeLabel = lifeYears > 1 ? ` (vida útil ${lifeYears} anos)` : "";
  const consumoChart = new Chart(document.getElementById("chart-consumo"), {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: `Consumo${lifeLabel || " (anual)"} (kWh)`, data: consumos, backgroundColor: colorScale }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.6,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatNumber(ctx.parsed.y, 0)} kWh`,
          },
        },
        valueLabel: { display: true, suffix: " kWh", decimals: 0, formatter: (v) => `${formatNumber(v, 0)} kWh` },
        legend: { padding: 14, labels: { padding: 12, boxWidth: 30 } },
      },
      layout: { padding: { top: 10 } },
      scales: {
        x: {
          title: { display: false },
          ticks: {
            callback: (val, idx) => (labels[idx] ? labels[idx].split("\n") : undefined),
            maxRotation: 0,
            minRotation: 0,
          },
        },
        y: {
          title: { display: true, text: `kWh${lifeLabel}` },
          grace: "8%",
          grid: { color: "rgba(0,0,0,0.06)" },
        },
      },
    },
  });

  const custoChart = new Chart(document.getElementById("chart-custo"), {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: `Custo de Energia${lifeLabel || " (anual)"}`, data: custosEnergia, backgroundColor: colorScale }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.6,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
          },
        },
        valueLabel: { display: true, formatter: formatCurrency },
        legend: { padding: 14, labels: { padding: 12, boxWidth: 30 } },
      },
      layout: { padding: { top: 10 } },
      scales: {
        x: {
          title: { display: false },
          ticks: {
            callback: (val, idx) => (labels[idx] ? labels[idx].split("\n") : undefined),
            maxRotation: 0,
            minRotation: 0,
          },
        },
        y: {
          title: { display: true, text: `R$${lifeLabel}` },
          grace: "8%",
          grid: { color: "rgba(0,0,0,0.06)" },
        },
      },
    },
  });

  const totalChart = new Chart(document.getElementById("chart-total"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Aquisição", data: custosAq, backgroundColor: "#b71c1c", borderColor: "#8e1111", borderWidth: 1, stack: "total" },
        { label: "Instalação", data: custosInst, backgroundColor: "#f4c542", borderColor: "#d4a317", borderWidth: 1, stack: "total" },
        {
          label: lifeLabel ? `Energia${lifeLabel}` : "Energia (1 ano)",
          data: custosEnergia,
          backgroundColor: "#ef7f1a",
          borderColor: "#c76312",
          borderWidth: 1,
          stack: "total",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.6,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
          },
        },
        valueLabel: { display: true, stacked: true, formatter: formatCurrency },
        legend: { padding: 14, labels: { padding: 12, boxWidth: 30 } },
      },
      layout: { padding: { top: 10 } },
      scales: {
        x: {
          stacked: true,
          title: { display: false },
          ticks: {
            callback: (val, idx) => (labels[idx] ? labels[idx].split("\n") : undefined),
            maxRotation: 0,
            minRotation: 0,
          },
        },
        y: {
          stacked: true,
          title: { display: true, text: `R$${lifeLabel}` },
          grace: "10%",
          grid: { color: "rgba(0,0,0,0.06)" },
        },
      },
    },
  });

  return { consumo: consumoChart, custo: custoChart, total: totalChart };
}

export function createLifecycleCharts(resultados) {
  const palette = BLUE_PALETTE;
  const maxTempoGlobal = Math.max(...resultados.map((r) => r.maxTime));
  const confiabilidadeLabels = [];
  for (let t = 0; t <= maxTempoGlobal; t += 0.5) confiabilidadeLabels.push(t);
  // Posição do crosshair horizontal no gráfico de densidade: alvo fixo em y=5
  const conf = new Chart(document.getElementById("lc-confiabilidade"), {
    type: "line",
    data: {
      labels: confiabilidadeLabels,
      datasets: resultados.map((r, idx) => ({
        label: `R(t) - ${r.rotulo}`,
        data: r.confiabilidade.map((p) => p.R),
        borderColor: palette[idx % palette.length],
        tension: 0.25,
        fill: false,
        pointRadius: 2.5,
        pointHoverRadius: 4,
        pointHitRadius: 12,
        pointStyle: "circle",
        pointBackgroundColor: "#fff",
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.6,
      interaction: { mode: "index", axis: "x", intersect: false },
      plugins: {
        tooltip: {
          mode: "index",
          intersect: false,
          titleFont: { size: 12, family: "Manrope, 'Segoe UI', sans-serif" },
          bodyFont: { size: 12, family: "Manrope, 'Segoe UI', sans-serif" },
        },
        legend: { labels: { font: { size: 12, weight: "700" } } },
        crosshairX: { yValue: 50, color: "#777", width: 2.5, dash: [6, 4] },
      },
      scales: {
        x: {
          title: { display: true, text: "Tempo (anos)" },
          ticks: {
            maxRotation: 0,
            minRotation: 0,
            autoSkip: true,
            autoSkipPadding: 12,
            maxTicksLimit: 18,
            font: { size: 12 },
            callback: (val, idx) => {
              const label = confiabilidadeLabels[idx];
              return Number(label) % 1 === 0 ? label : "";
            },
          },
        },
        y: { title: { display: true, text: "Confiabilidade (%)" }, ticks: { font: { size: 12 } } },
      },
    },
  });

  const densidade = new Chart(document.getElementById("lc-densidade"), {
    type: "line",
    data: {
      labels: confiabilidadeLabels,
      datasets: resultados.map((r, idx) => ({
        label: `f(t) - ${r.rotulo}`,
        data: r.densidade.map((p) => p.f),
        borderColor: palette[(idx + 4) % palette.length],
        tension: 0.25,
        fill: false,
        pointRadius: 2.5,
        pointHoverRadius: 4,
        pointHitRadius: 12,
        pointStyle: "circle",
        pointBackgroundColor: "#fff",
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.6,
      interaction: { mode: "index", axis: "x", intersect: false },
      plugins: {
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}%` },
          titleFont: { size: 12, family: "Manrope, 'Segoe UI', sans-serif" },
          bodyFont: { size: 12, family: "Manrope, 'Segoe UI', sans-serif" },
        },
        legend: { labels: { font: { size: 12, weight: "700" } } },
        crosshairX: { yValue: 5, side: "right", color: "#777", width: 2.5, dash: [6, 4] },
      },
      scales: {
        x: {
          title: { display: true, text: "Tempo (anos)" },
          ticks: {
            maxRotation: 0,
            minRotation: 0,
            autoSkip: true,
            autoSkipPadding: 12,
            maxTicksLimit: 18,
            font: { size: 12 },
            callback: (val, idx) => {
              const label = confiabilidadeLabels[idx];
              return Number(label) % 1 === 0 ? label : "";
            },
          },
        },
        y: { title: { display: true, text: "Densidade (%)" }, ticks: { font: { size: 12 } } },
      },
    },
  });

  return { conf, densidade };
}
