// Arquivo principal do comparador de equipamentos, integrando UI, filtros, cálculos e gráficos.

// Resumo: orquestra UI do comparador e ciclo de vida, cuida de filtros, estado, gráficos e exportações.
import { computeEnergyTotals } from "./energy.js";
import { computeLifecycleCurves, tecnologiaNormalizada, BETA } from "./lifecycle.js";
import { createComparadorCharts, createLifecycleCharts, destroyChartGroup, BLUE_PALETTE, withAlpha } from "./charts.js";
import { downloadExcel } from "./export-excel.js";
import { downloadPdfExport } from "./export-pdf.js";

// Estado principal do comparador (seleção, filtros e perfil de uso)
const state = {
  filters: { tipo: "all", tecnologia: "all", funcao: "all", potencia: "all", tensao: "all", classe: "all" },
  equipments: [
    { key: 1, equipmentId: "", custoAq: "", custoInst: "", anosVida: "", manut: "", descarte: "", mode: "select", customName: "", customConsumo: "", customTec: "", customBtu: "", customIdrs: "", customClasse: "" },
    { key: 2, equipmentId: "", custoAq: "", custoInst: "", anosVida: "", manut: "", descarte: "", mode: "select", customName: "", customConsumo: "", customTec: "", customBtu: "", customIdrs: "", customClasse: "" },
  ],
  equipment1: null,
  equipment2: null,
  usage: {
    horasUso: 5.698,
    tarifaKwh: 1.80,
    diasAno: 253,
    taxaReal: 0.01,
    temperaturaUso: 26.2,
  },
};

// Estado do módulo de ciclo de vida (filtragem + seleção)
const lcState = {
  filters: { tipo: "all", tecnologia: "all", funcao: "all", potencia: "all", tensao: "all", classe: "all" },
  equipments: [{ key: 1, equipmentId: "", anosVida: "" }],
  filtered: [],
};

let equipmentData = [];
let filteredEquipment = [];
let charts = { consumo: null, custo: null, total: null };
let lcCharts = { conf: null, densidade: null };
let lastComputed = [];
let lastCashflowData = null;
let lastLifecycle = null;

// Referências de UI do comparador (filtros, cards e tabelas)
const loaderEl = document.getElementById("equipment-loader");
const errorEl = document.getElementById("equipment-error");
const uiEl = document.getElementById("equipment-ui");
const selectionCard = document.getElementById("selection-card");
const usageCard = document.getElementById("usage-card");
const chartsCard = document.getElementById("charts-card");
const cbExportRow = document.getElementById("cb-export-row");
const exportCard = document.getElementById("export-card");
const resultCount = document.getElementById("result-count");
const equipmentListEl = document.getElementById("equipment-list");
const addEquipmentBtn = document.getElementById("add-equipment");
const summaryGrid = document.getElementById("summary-grid");
const cashflowCard = document.getElementById("cashflow-card");
const cfTitle1 = document.getElementById("cf-title-1");
const cfTitle2 = document.getElementById("cf-title-2");
const cfBody1 = document.getElementById("cf-body-1");
const cfBody2 = document.getElementById("cf-body-2");
const cfBodyDiff = document.getElementById("cf-body-diff");
const cfPaybackCanvas = document.getElementById("cf-payback");
let cfPaybackChart = null;

// Referências de UI do módulo de ciclo de vida
const lcLoaderEl = document.getElementById("lc-equipment-loader");
const lcErrorEl = document.getElementById("lc-equipment-error");
const lcUiEl = document.getElementById("lc-equipment-ui");
const lcResultCount = document.getElementById("lc-result-count");
const lcSelectionCard = document.getElementById("lc-selection-card");
const lcEquipmentListEl = document.getElementById("lc-equipment-list");

const lcFilterFields = {
  tipo: document.getElementById("lc-filter-tipo"),
  tecnologia: document.getElementById("lc-filter-tecnologia"),
  funcao: document.getElementById("lc-filter-funcao"),
  potencia: document.getElementById("lc-filter-potencia"),
  tensao: document.getElementById("lc-filter-tensao"),
  classe: document.getElementById("lc-filter-classe"),
};

function findEquipmentPreset(marca, tecnologia, potencia) {
  const m = marca.toLowerCase();
  const t = tecnologia.toLowerCase();
  const p = potencia?.toString();
  return equipmentData.find(
    (eq) =>
      eq.marca?.toLowerCase().includes(m) &&
      eq.tecnologia?.toLowerCase().includes(t) &&
      eq.potencia_btu?.toString() === p
  );
}

const filterFields = {
  tipo: document.getElementById("filter-tipo"),
  tecnologia: document.getElementById("filter-tecnologia"),
  funcao: document.getElementById("filter-funcao"),
  potencia: document.getElementById("filter-potencia"),
  tensao: document.getElementById("filter-tensao"),
  classe: document.getElementById("filter-classe"),
};

const usageInputs = {
  horas: document.getElementById("horas-uso"),
  tarifa: document.getElementById("tarifa"),
  dias: document.getElementById("dias-ano"),
  taxa: document.getElementById("taxa-real"),
  horasVal: document.getElementById("horas-uso-val"),
  tarifaVal: document.getElementById("tarifa-val"),
  diasVal: document.getElementById("dias-ano-val"),
  taxaVal: document.getElementById("taxa-real-val"),
};

function setRangeFill(el) {
  if (!el) return;
  const min = parseFloat(el.min || "0");
  const max = parseFloat(el.max || "100");
  const val = parseFloat(el.value || min);
  const pct = ((val - min) * 100) / (max - min || 1);
  el.style.setProperty("--fill", `${Math.min(Math.max(pct, 0), 100)}%`);
}

function initRangeFill() {
  const ranges = document.querySelectorAll('input[type="range"]');
  ranges.forEach((el) => {
    setRangeFill(el);
    el.addEventListener("input", () => setRangeFill(el));
    el.addEventListener("change", () => setRangeFill(el));
  });
}

function getLifeYearsMin() {
  const anos = Math.min(
    ...state.equipments.map((e) => {
      const n = parseNumber(e.anosVida, 10);
      return n > 0 ? n : Infinity;
    })
  );
  return Number.isFinite(anos) && anos > 0 ? anos : 1;
}

function uniqueValues(field) {
  const values = new Set();
  equipmentData.forEach((eq) => {
    if (eq[field]) values.add(eq[field]);
  });
  return Array.from(values).filter(Boolean).sort((a, b) => (a > b ? 1 : -1));
}

function populateFilterOptions() {
  filterFields.tipo.innerHTML =
    '<option value="all">Todos</option>' +
    uniqueValues("tipo")
      .map((v) => `<option value="${v}">${v}</option>`)
      .join("");
  filterFields.funcao.innerHTML =
    '<option value="all">Todas</option>' +
    uniqueValues("funcao")
      .map((v) => `<option value="${v}">${v}</option>`)
      .join("");
  filterFields.potencia.innerHTML =
    '<option value="all">Todas</option>' +
    uniqueValues("potencia_btu")
      .map((v) => `<option value="${v}">${v.toLocaleString("pt-BR")} BTU/h</option>`)
      .join("");
  filterFields.tensao.innerHTML =
    '<option value="all">Todas</option>' +
    uniqueValues("tensao")
      .map((v) => `<option value="${v}">${v}V</option>`)
      .join("");
  filterFields.classe.innerHTML =
    '<option value="all">Todas</option>' +
    uniqueValues("classe")
      .map((v) => `<option value="${v}">${v}</option>`)
      .join("");
}

function lcPopulateFilterOptions() {
  if (!lcFilterFields.tipo) return;
  lcFilterFields.tipo.innerHTML =
    '<option value="all">Todos</option>' +
    uniqueValues("tipo")
      .map((v) => `<option value="${v}">${v}</option>`)
      .join("");
  lcFilterFields.funcao.innerHTML =
    '<option value="all">Todas</option>' +
    uniqueValues("funcao")
      .map((v) => `<option value="${v}">${v}</option>`)
      .join("");
  lcFilterFields.potencia.innerHTML =
    '<option value="all">Todas</option>' +
    uniqueValues("potencia_btu")
      .map((v) => `<option value="${v}">${v.toLocaleString("pt-BR")} BTU/h</option>`)
      .join("");
  lcFilterFields.tensao.innerHTML =
    '<option value="all">Todas</option>' +
    uniqueValues("tensao")
      .map((v) => `<option value="${v}">${v}V</option>`)
      .join("");
  lcFilterFields.classe.innerHTML =
    '<option value="all">Todas</option>' +
    uniqueValues("classe")
      .map((v) => `<option value="${v}">${v}</option>`)
      .join("");
}

function applyFilters() {
  filteredEquipment = equipmentData.filter((eq) => {
    if (state.filters.tipo !== "all" && eq.tipo !== state.filters.tipo) return false;
    if (state.filters.tecnologia !== "all" && eq.tecnologia !== state.filters.tecnologia) return false;
    if (state.filters.funcao !== "all" && eq.funcao !== state.filters.funcao) return false;
    if (state.filters.potencia !== "all" && eq.potencia_btu.toString() !== state.filters.potencia) return false;
    if (state.filters.tensao !== "all" && eq.tensao.toString() !== state.filters.tensao) return false;
    if (state.filters.classe !== "all" && (eq.classe || "").toString() !== state.filters.classe) return false;
    return true;
  });

  resultCount.textContent = `${filteredEquipment.length} Equipamentos Encontrados`;

  state.equipments.forEach((entry) => {
    if (
      entry.equipmentId &&
      !filteredEquipment.find((eq) => eq.id.toString() === entry.equipmentId.toString())
    ) {
      entry.equipmentId = "";
    }
  });

  renderEquipmentCards();
  updateVisibility();
  updateCharts();
  syncLifeCycleDefaults();
}

function lcApplyFilters() {
  lcState.filtered = equipmentData.filter((eq) => {
    if (lcState.filters.tipo !== "all" && eq.tipo !== lcState.filters.tipo) return false;
    if (lcState.filters.tecnologia !== "all" && eq.tecnologia !== lcState.filters.tecnologia) return false;
    if (lcState.filters.funcao !== "all" && eq.funcao !== lcState.filters.funcao) return false;
    if (lcState.filters.potencia !== "all" && eq.potencia_btu.toString() !== lcState.filters.potencia) return false;
    if (lcState.filters.tensao !== "all" && eq.tensao.toString() !== lcState.filters.tensao) return false;
    if (lcState.filters.classe !== "all" && (eq.classe || "").toString() !== lcState.filters.classe) return false;
    return true;
  });

  if (lcResultCount) lcResultCount.textContent = `${lcState.filtered.length} Equipamentos Encontrados`;

  lcState.equipments.forEach((entry) => {
    if (
      entry.equipmentId &&
      !lcState.filtered.find((eq) => eq.id.toString() === entry.equipmentId.toString())
    ) {
      entry.equipmentId = "";
    }
  });

  lcRenderEquipmentCards();
  lcUpdateVisibility();
}

function renderEquipmentCards() {
  const optionList =
    '<option value="">Selecione</option>' +
    filteredEquipment
      .map(
        (eq) => `<option value="${eq.id}">${eq.marca} - ${eq.funcao} 
        - ${eq.potencia_btu} BTU/h (${eq.tecnologia}) - ${eq.tipo} - ${eq.tensao} V 
        - IDRS: ${eq.idrs} - Classe: ${eq.classe} - Modelo: ${eq.modelo_concat}</option>`
      )
      .join("");

  equipmentListEl.innerHTML =
    state.equipments.slice(0, 2)
      .map(
        (entry, idx) => `
      <div class="equipment-card" data-key="${entry.key}">
        <h4>Equipamento ${idx + 1}</h4>
        <div class="mode-select" ${entry.mode === "manual" ? 'style="display:none;"' : ""}>
          <label>Equipamento (INMETRO)</label>
          <select data-role="equipment-select" data-key="${entry.key}">
            ${optionList}
          </select>
        </div>
        <div class="mode-manual" ${entry.mode === "manual" ? "" : 'style="display:none;"'}>
            <div class="grid manual-cols-4 gap">
            <div>
              <label>Equipamento (Manual)</label>
              <input type="text" data-role="custom-nome" data-key="${entry.key}" value="${entry.customName ?? ""}" placeholder="Ex.: CGF Brisa 3000" />
            </div>
            <div>
              <label>Capacidade (BTU/h)</label>
              <input type="number" data-role="custom-btu" data-key="${entry.key}" min="0" step="1" value="${entry.customBtu ?? 0}" />
            </div>
            <div>
              <label>Tecnologia</label>
              <select data-role="custom-tec" data-key="${entry.key}">
                <option value="" ${!entry.customTec ? "selected" : ""}>Selecione</option>
                <option value="Inverter" ${entry.customTec === "Inverter" ? "selected" : ""}>Inverter</option>
                <option value="Convencional" ${entry.customTec === "Convencional" ? "selected" : ""}>Convencional</option>
              </select>
            </div>
            <div>
              <label>IDRS</label>
              <input type="number" data-role="custom-idrs" data-key="${entry.key}" min="0" step="0.01" value="${entry.customIdrs ?? 0}" />
            </div>
          </div>
          <div class="grid manual-cols-4 gap">
            <div>
              <label>Aquisição (R$)</label>
              <input type="number" data-role="custo-aq" data-key="${entry.key}" step="0.01" value="${entry.custoAq}" />
            </div>
            <div>
              <label>Instalação (R$)</label>
              <input type="number" data-role="custo-inst" data-key="${entry.key}" step="0.01" value="${entry.custoInst}" />
            </div>
            <div>
              <label>Manutenção (R$)</label>
              <input type="number" data-role="cf-manut" data-key="${entry.key}" min="0" step="1" value="${entry.manut ?? 0}" />
            </div>
            <div>
              <label>Consumo (kWh/Ano)</label>
              <input type="number" data-role="custom-consumo" data-key="${entry.key}" min="0" step="0.01" value="${entry.customConsumo ?? 0}" />
            </div>
          </div>
          <div class="grid manual-cols-3 gap">
            <div>
              <label>Classe</label>
              <select data-role="custom-classe" data-key="${entry.key}">
                <option value="">Selecione</option>
                <option value="A" ${entry.customClasse === "A" ? "selected" : ""}>A</option>
                <option value="B" ${entry.customClasse === "B" ? "selected" : ""}>B</option>
                <option value="C" ${entry.customClasse === "C" ? "selected" : ""}>C</option>
                <option value="D" ${entry.customClasse === "D" ? "selected" : ""}>D</option>
                <option value="E" ${entry.customClasse === "E" ? "selected" : ""}>E</option>
                <option value="F" ${entry.customClasse === "F" ? "selected" : ""}>F</option>
              </select>
            </div>
            <div>
              <label>Vida Útil (Anos)</label>
              <input type="number" data-role="cf-anos" data-key="${entry.key}" min="1" max="25" step="1" value="${entry.anosVida ?? 10}" />
            </div>
            <div>
              <label>Valor Residual (R$)</label>
              <input type="number" data-role="cf-desc" data-key="${entry.key}" min="0" step="1" value="${entry.descarte ?? 0}" />
            </div>
          </div>
        </div>
        <div ${entry.mode === "manual" ? "style=\"display:none;\"" : ""}>
          <div class="grid cols-3 gap">
            <div>
              <label>Aquisição (R$)</label>
              <input type="number" data-role="custo-aq" data-key="${entry.key}" step="0.01" value="${entry.custoAq}" />
            </div>
            <div>
              <label>Instalação (R$)</label>
              <input type="number" data-role="custo-inst" data-key="${entry.key}" step="0.01" value="${entry.custoInst}" />
            </div>
            <div>
              <label>Manutenção (R$)</label>
              <input type="number" data-role="cf-manut" data-key="${entry.key}" min="0" step="1" value="${entry.manut ?? 0}" />
            </div>
          </div>
        </div>
        <div class="grid cols-2 gap" ${entry.mode === "manual" ? "style=\"display:none;\"" : ""}>
          <div>
            <label>Vida Útil (Anos)</label>
            <input type="number" data-role="cf-anos" data-key="${entry.key}" min="1" max="25" step="1" value="${entry.anosVida ?? 10}" />
          </div>
          <div>
            <label>Valor Residual (R$)</label>
            <input type="number" data-role="cf-desc" data-key="${entry.key}" min="0" step="1" value="${entry.descarte ?? 0}" />
          </div>
        </div>
      </div>
    `
      )
      .join("") || '<div class="notice">Nenhum equipamento disponivel com estes filtros.</div>';

  state.equipments.forEach((entry) => {
    const select = equipmentListEl.querySelector(`select[data-key="${entry.key}"]`);
    if (select) select.value = entry.equipmentId?.toString() || "";
  });

  if (addEquipmentBtn) {
    const second = state.equipments[1];
    const manual = second?.mode === "manual";
    addEquipmentBtn.textContent = manual ? "↻ Equipamentos Listados" : "+ Equipamento Não Listado";
    addEquipmentBtn.classList.toggle("add-equipment-manual", manual);
  }
}

function lcRenderEquipmentCards() {
  if (!lcEquipmentListEl) return;
  const optionList =
    '<option value="">Selecione</option>' +
    lcState.filtered
      .map(
        (eq) => `<option value="${eq.id}">${eq.marca} - ${eq.funcao} 
        - ${eq.potencia_btu} BTU/h (${eq.tecnologia}) - ${eq.tipo} - ${eq.tensao} V 
        - IDRS: ${eq.idrs} - Classe: ${eq.classe} - Modelo: ${eq.modelo_concat}</option>`
      )
      .join("");

  lcEquipmentListEl.innerHTML =
    lcState.equipments
      .map(
        (entry) => `
      <div class="equipment-card" data-key="${entry.key}">
        <h4>Equipamento</h4>
        <div class="mode-select">
          <label>Equipamento (INMETRO)</label>
          <select data-role="lc-equipment-select" data-key="${entry.key}">
            ${optionList}
          </select>
        </div>
        <div class="grid cols-2 gap">
          <div>
            <label>Vida Útil Estimada (Anos)</label>
            <input type="number" data-role="lc-anos" data-key="${entry.key}" min="1" max="25" step="1" value="${entry.anosVida ?? 10}" />
          </div>
        </div>
      </div>
    `
      )
      .join("") || '<div class="notice">Nenhum equipamento disponivel com estes filtros.</div>';

  lcState.equipments.forEach((entry) => {
    const select = lcEquipmentListEl.querySelector(`select[data-key="${entry.key}"]`);
    if (select) select.value = entry.equipmentId?.toString() || "";
    const anosInput = lcEquipmentListEl.querySelector(`input[data-role="lc-anos"][data-key="${entry.key}"]`);
    if (anosInput) anosInput.value = entry.anosVida?.toString() || "10";
  });
}

function getSelectedEntries() {
  return state.equipments
    .map((entry) => {
      if (entry.mode === "manual") {
        const parsed = parseCustomEquipment(entry);
        if (!parsed) return null;
        return { ...entry, eq: parsed };
      }
      const eq = filteredEquipment.find((e) => e.id.toString() === entry.equipmentId);
      if (!eq) return null;
      return { ...entry, eq };
    })
    .filter(Boolean);
}

function lcGetSelectedEntries() {
  return lcState.equipments
    .map((entry) => {
      const eq = lcState.filtered.find((e) => e.id.toString() === entry.equipmentId);
      if (!eq) return null;
      return { ...entry, eq };
    })
    .filter(Boolean);
}

function parseNumber(value, fallback = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatNumberBr(value, decimals = 2) {
  const n = Number.isFinite(value) ? value : 0;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatCurrencyBr(value) {
  return `R$ ${formatNumberBr(value, 2)}`;
}

function formatPercentBr(value, decimals = 2) {
  const n = Number.isFinite(value) ? value : 0;
  return `${(n * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

function parseCustomEquipment(entry) {
  const nome = (entry.customName || "").trim();
  const consumo = parseNumber(entry.customConsumo, 0);
  const potencia = parseNumber(entry.customBtu, 0);
  const tecnologia = entry.customTec || "Inverter";
  const idrs = parseNumber(entry.customIdrs, 0);
  const classeRaw = (entry.customClasse || "").toString().trim().toUpperCase();
  const classe = ["A", "B", "C", "D", "E", "F"].includes(classeRaw) ? classeRaw : "";
  if (!nome || consumo <= 0) return null;

  return {
    id: `custom-${entry.key}`,
    marca: nome,
    tipo: "Custom",
    funcao: "Quente e Frio",
    tecnologia,
    tensao: "",
    potencia_btu: potencia || 0,
    potencia_w: 0,
    modelo_concat: nome,
    consumo_kwh_ano: consumo,
    idrs,
    classe,
    p_29_parcial: null,
    p_35_parcial: null,
    p_29_total: null,
    p_35_total: null,
  };
}

function formatHoursPerDay(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const mm = m.toString().padStart(2, "0");
  return `${h}h${mm}min/dia`;
}

function attachEvents() {
  // Liga filtros, selects de equipamentos e sliders de uso aos calculos
  Object.entries(filterFields).forEach(([key, el]) => {
    el.addEventListener("change", () => {
      state.filters[key] = el.value;
      applyFilters();
    });
  });

addEquipmentBtn?.addEventListener("click", () => {
  // Alterna o 2o equipamento entre modo listado (INMETRO) e entrada manual
  const second = state.equipments[1];
  if (!second) return;

  const togglingToManual = second.mode !== "manual";
  if (togglingToManual) {
    second.previousEquipmentId = second.equipmentId || "";
    second.mode = "manual";
    second.equipmentId = "";
    second.customName = second.customName || "";
    second.customConsumo = second.customConsumo || 0;
    second.customTec = second.customTec || "";
    second.customBtu = second.customBtu || 0;
    second.customIdrs = second.customIdrs || 0;
    second.customClasse = second.customClasse || "";
  } else {
    second.mode = "select";
    second.equipmentId = second.previousEquipmentId || "";
  }

  renderEquipmentCards();
  updateVisibility();
  updateCharts();
  syncLifeCycleDefaults();
});

  equipmentListEl.addEventListener("change", (evt) => {
    const target = evt.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const { role, key } = target.dataset;
    if (!role || !key) return;
    const entry = state.equipments.find((e) => e.key.toString() === key);
    if (!entry) return;

    if (role === "equipment-select") {
      entry.equipmentId = target.value;
      entry.mode = "select";
      renderEquipmentCards();
      updateVisibility();
      updateCharts();
      syncLifeCycleDefaults();
    }
    if (role === "custom-tec") {
      entry.customTec = target.value;
      updateCharts();
    }
    if (role === "custom-classe") {
      entry.customClasse = target.value;
      updateCharts();
    }
  });

  equipmentListEl.addEventListener("input", (evt) => {
    const target = evt.target;
    if (!(target instanceof HTMLInputElement)) return;
    const { role, key } = target.dataset;
    if (!role || !key) return;
    const entry = state.equipments.find((e) => e.key.toString() === key);
    if (!entry) return;

    if (role === "custo-aq") entry.custoAq = parseNumber(target.value, 0);
    if (role === "custo-inst") entry.custoInst = parseNumber(target.value, 0);
    if (role === "cf-anos") entry.anosVida = parseNumber(target.value, 10);
    if (role === "cf-manut") entry.manut = parseNumber(target.value, 0);
    if (role === "cf-desc") entry.descarte = parseNumber(target.value, 0);
    if (role === "custom-consumo") entry.customConsumo = parseNumber(target.value, 0);
    if (role === "custom-nome") entry.customName = target.value;
    if (role === "custom-btu") entry.customBtu = parseNumber(target.value, 0);
    if (role === "custom-idrs") entry.customIdrs = parseNumber(target.value, 0);
    updateCharts();
    updateVisibility();
  });

  usageInputs.horas.addEventListener("input", () => {
    state.usage.horasUso = parseNumber(usageInputs.horas.value, 5.698);
    usageInputs.horasVal.textContent = formatHoursPerDay(state.usage.horasUso);
    updateCharts();
    syncLifeCycleDefaults();
  });
  usageInputs.tarifa.addEventListener("input", () => {
    state.usage.tarifaKwh = parseNumber(usageInputs.tarifa.value, 0.63);
    usageInputs.tarifaVal.textContent = formatCurrencyBr(state.usage.tarifaKwh);
    updateCharts();
  });
  usageInputs.taxa.addEventListener("input", () => {
    state.usage.taxaReal = parseNumber(usageInputs.taxa.value, 0.01);
    usageInputs.taxaVal.textContent = formatPercentBr(state.usage.taxaReal, 2);
    updateCharts();
  });
  usageInputs.dias.addEventListener("input", () => {
    state.usage.diasAno = parseNumber(usageInputs.dias.value, 255);
    usageInputs.diasVal.textContent = `${state.usage.diasAno} dias`;
    updateCharts();
    syncLifeCycleDefaults();
  });
  // Ajuste inicial dos labels
  usageInputs.horas.value = state.usage.horasUso.toString();
  usageInputs.tarifa.value = state.usage.tarifaKwh.toString();
  usageInputs.dias.value = state.usage.diasAno.toString();
  usageInputs.taxa.value = state.usage.taxaReal.toString();
  usageInputs.horasVal.textContent = formatHoursPerDay(state.usage.horasUso);
  usageInputs.tarifaVal.textContent = formatCurrencyBr(state.usage.tarifaKwh);
  usageInputs.diasVal.textContent = `${state.usage.diasAno} dias`;
  usageInputs.taxaVal.textContent = formatPercentBr(state.usage.taxaReal, 2);
  setRangeFill(usageInputs.horas);
  setRangeFill(usageInputs.tarifa);
  setRangeFill(usageInputs.dias);
  setRangeFill(usageInputs.taxa);
}

function initLifecycleSelectors() {
  if (!lcFilterFields.tipo) return;
  lcPopulateFilterOptions();
  if (lcFilterFields.potencia) lcFilterFields.potencia.value = lcState.filters.potencia;
  if (lcFilterFields.funcao) lcFilterFields.funcao.value = lcState.filters.funcao;

  lcApplyFilters();
  attachLifecycleEvents();
  desenharCiclo();

  if (lcLoaderEl) lcLoaderEl.classList.add("hidden");
  if (lcUiEl) lcUiEl.classList.remove("hidden");
  lcUpdateVisibility();
}

function attachLifecycleEvents() {
  Object.entries(lcFilterFields).forEach(([key, el]) => {
    if (!el) return;
    el.addEventListener("change", () => {
      lcState.filters[key] = el.value;
      lcApplyFilters();
      desenharCiclo();
    });
  });

  if (lcEquipmentListEl) {
    lcEquipmentListEl.addEventListener("change", (evt) => {
      const target = evt.target;
      if (!(target instanceof HTMLSelectElement)) return;
      const { role, key } = target.dataset;
      if (role !== "lc-equipment-select" || !key) return;
      const entry = lcState.equipments.find((e) => e.key.toString() === key);
      if (!entry) return;
      entry.equipmentId = target.value;
      desenharCiclo();
    });
  }

  if (lcEquipmentListEl) {
    lcEquipmentListEl.addEventListener("input", (evt) => {
      const target = evt.target;
      if (!(target instanceof HTMLInputElement)) return;
      const { role, key } = target.dataset;
      if (role !== "lc-anos" || !key) return;
      const entry = lcState.equipments.find((e) => e.key.toString() === key);
      if (!entry) return;
      entry.anosVida = parseNumber(target.value, 10);
      desenharCiclo();
    });
  }

  if (lcInputs.horas) {
    lcInputs.horas.addEventListener("input", () => {
      const hVal = parseNumber(lcInputs.horas.value, 8);
      lcInputs.horasVal.textContent = formatHoursPerDay(hVal);
      desenharCiclo();
    });
  }
  if (lcInputs.manutencao) {
    lcInputs.manutencao.addEventListener("change", () => desenharCiclo());
  }
  if (lcInputs.ambiente) {
    lcInputs.ambiente.addEventListener("change", () => desenharCiclo());
  }
  if (lcInputs.temperatura) {
    lcInputs.temperatura.addEventListener("input", () => {
      lcInputs.temperaturaVal.textContent = `${parseNumber(lcInputs.temperatura.value, 25).toFixed(1)} C`;
      desenharCiclo();
    });
  }
}

function destroyCharts() {
  destroyChartGroup(charts);
}

function destroyPaybackChart() {
  if (cfPaybackChart) {
    cfPaybackChart.destroy();
    cfPaybackChart = null;
  }
}

function updateVisibility() {
  // Controla a exibição de cards conforme existência de dados e seleção mínima
  const selected = getSelectedEntries();
  const hasData = filteredEquipment.length > 0;
  selectionCard.classList.toggle("hidden", !hasData);
  usageCard.classList.toggle("hidden", !hasData);
  chartsCard.classList.toggle("hidden", selected.length < 2);
  if (cashflowCard) cashflowCard.classList.toggle("hidden", selected.length < 2);
  if (exportCard) exportCard.classList.toggle("hidden", selected.length < 2);
  if (cbExportRow) cbExportRow.classList.toggle("hidden", selected.length < 2);
}

function lcUpdateVisibility() {
  if (!lcSelectionCard) return;
  const hasData = lcState.filtered.length > 0;
  lcSelectionCard.classList.toggle("hidden", !hasData);
}

function updateCharts() {
  const selected = getSelectedEntries();
  state.equipment1 = selected[0]?.eq || null;
  state.equipment2 = selected[1]?.eq || null;

  if (selected.length < 2) {
    chartsCard.classList.add("hidden");
    summaryGrid.innerHTML = "";
    destroyChartGroup(charts);
    return;
  }

  const COLORS = BLUE_PALETTE;
  // Usa a menor vida útil entre os equipamentos para que os gráficos sigam o mesmo horizonte das tabelas.
  const lifeYears = getLifeYearsMin();

  const computed = computeEnergyTotals(selected, state.usage, lifeYears).map((entry, idx) => ({
    ...entry,
    color: COLORS[idx % COLORS.length],
  }));
  lastComputed = computed;

  // Calcula VP total para identificar o melhor custo-beneficio e montar o texto comparativo.
  const totals = computed.map((c) => c.totalVidaPV);
  const minIdx = totals.indexOf(Math.min(...totals));
  const maxIdx = totals.indexOf(Math.max(...totals));
  const saving = maxIdx === minIdx ? 0 : totals[maxIdx] - totals[minIdx];
  const comparisonText =
    saving > 0
      ? `O equipamento da marca ${computed[minIdx].eq.marca} tem a melhor relação custo-benefício na vida útil (${lifeYears} anos), economizando ${formatCurrencyBr(saving)} em relação ao equipamento da marca ${computed[maxIdx].eq.marca}.`
      : "Custos totais equivalentes entre os equipamentos selecionados para a vida útil informada (VP).";

  const cashflowInfo = updateCashflow(computed);

  summaryGrid.innerHTML =
    computed
      .map(
        (item) => `
        <div class="stat">
          <div class="muted">${item.eq.marca}</div>
          <div style="font-size:1.5rem; font-weight:800; color:${item.color};">${formatNumberBr(item.consumoTotal, 2)} kWh de Consumo Elétrico</div>
          <div class="muted">Classe ${item.eq.classe} | IDRS ${formatNumberBr(item.eq.idrs, 2)}</div>
          <div><strong>COA-Energia Anual (VP):</strong> ${formatCurrencyBr(item.custoEnergiaPV / lifeYears)}</div>
          <div><strong>COA-Energia em ${lifeYears} Anos (VP):</strong> ${formatCurrencyBr(item.custoEnergiaPV)}</div>
          <div><strong>COA Anual (VP):</strong> ${formatCurrencyBr(item.coaPV / lifeYears)}</div>
          <div><strong>COA em ${lifeYears} Anos (VP):</strong> ${formatCurrencyBr(item.coaPV)}</div>
        </div>
      `
      )
      .join("") +
    `
    <div class="stat comparison-card">
      <div class="muted">Resumo Financeiro</div>
      <div><strong>Payback (VP):</strong> ${cashflowInfo?.resumo || "Defina dois equipamentos para ver o payback."}</div>
      <div><strong>Comparativo:</strong> ${comparisonText}</div>
    </div>
    `;

  // Adiciona um card extra no grid com resumo financeiro (payback + comparativo de VP).
  const labels = computed.map((c) => `${c.eq.marca}
(${c.eq.tecnologia || tecnologiaNormalizada(c.eq)})`);
  const colorScale = computed.map((c) => c.color);
  const consumos = computed.map((c) => c.consumoTotal);
  const custosEnergia = computed.map((c) => c.custoEnergiaPV);
  const custosAq = computed.map((c) => c.custoAq);
  const custosInst = computed.map((c) => c.custoInst);

  destroyChartGroup(charts);
  charts = createComparadorCharts({ labels, consumos, custosEnergia, custosAq, custosInst, colorScale, lifeYears });

  chartsCard.classList.remove("hidden");
}

function buildCashflowRows(item, params) {
  const capex = (item.custoAq || 0) + (item.custoInst || 0);
  const years = params.anos;
  const energiaAnual = item.custoEnergiaAnual ?? item.custoEnergia ?? 0;
  const manut = params.manut;
  const descarte = params.descarte;
  const taxa = params.taxaReal ?? 0.01;

  const rows = [
    {
      ano: 0,
      capex,
      energia: 0,
      manutencao: 0,
      descarte: 0,
      coa: 0,
      vpCoa: 0,
      total: capex,
      vpTotal: capex,
    },
  ];
  for (let ano = 1; ano <= years; ano++) {
    const capexAno = 0;
    const energiaAno = energiaAnual;
    const manutAno = manut;
    const descarteAno = ano === years ? descarte : 0;
    const coa = energiaAno + manutAno + descarteAno;
    const vpCoa = coa / (1 + taxa) ** ano;
    const vpCapex = capexAno / (1 + taxa) ** Math.max(ano - 1, 0);
    const total = capexAno + coa;
    const vpTotal = vpCapex + vpCoa;

    rows.push({
      ano,
      capex: capexAno,
      energia: energiaAno,
      manutencao: manutAno,
      descarte: descarteAno,
      coa,
      vpCoa,
      total,
      vpTotal,
    });
  }
  return rows;
}

function renderCashflowTable(targetEl, rows, includePayback = false, totals) {
  if (!targetEl) return;
  const sumField = (field) => rows.reduce((acc, r) => acc + (Number.isFinite(r[field]) ? r[field] : 0), 0);
  const totalsRow = totals || {
    ano: "Total",
    capex: sumField("capex"),
    manutencao: sumField("manutencao"),
    energia: sumField("energia"),
    descarte: sumField("descarte"),
    coa: sumField("coa"),
    vpCoa: sumField("vpCoa"),
    vpTotal: sumField("vpTotal"),
  };

  targetEl.innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td>${r.ano}</td>
        <td>${formatNumberBr(r.capex, 2)}</td>
        <td>${formatNumberBr(r.manutencao, 2)}</td>
        <td>${formatNumberBr(r.energia, 2)}</td>
        <td>${formatNumberBr(r.descarte, 2)}</td>
        <td>${formatNumberBr(r.coa, 2)}</td>
        <td>${formatNumberBr(r.vpCoa, 2)}</td>
        ${includePayback ? `<td>${r.payback !== undefined ? formatNumberBr(r.payback, 2) : ""}</td>` : ""}
      </tr>`
    )
    .join("") +
    `
    <tr>
      <td>${totalsRow.ano}</td>
      <td>${formatNumberBr(totalsRow.capex, 2)}</td>
      <td>${formatNumberBr(totalsRow.manutencao, 2)}</td>
      <td>${formatNumberBr(totalsRow.energia, 2)}</td>
      <td>${formatNumberBr(totalsRow.descarte, 2)}</td>
      <td>${formatNumberBr(totalsRow.coa, 2)}</td>
      <td>${formatNumberBr(totalsRow.vpCoa, 2)}</td>
      ${includePayback ? `<td>${""}</td>` : ""}
    </tr>`;
}

function updateCashflow(computed) {
  const selected = getSelectedEntries();
  if (selected.length < 2 || !cashflowCard) {
    cashflowCard?.classList.add("hidden");
    lastCashflowData = null;
    return { resumo: "" };
  }

  const anos = getLifeYearsMin();
  const manut1 = parseNumber(state.equipments[0]?.manut, 0);
  const manut2 = parseNumber(state.equipments[1]?.manut, 0);
  const desc1 = parseNumber(state.equipments[0]?.descarte, 0);
  const desc2 = parseNumber(state.equipments[1]?.descarte, 0);
  const taxaReal = parseNumber(state.usage.taxaReal, 0.01);

  const eq1 = computed[0];
  const eq2 = computed[1];

  if (cfTitle1) cfTitle1.textContent = `Fluxo de Caixa - ${eq1.eq.marca}`;
  if (cfTitle2) cfTitle2.textContent = `Fluxo de Caixa - ${eq2.eq.marca}`;

  // Monta as tabelas individuais e a diferenca ano a ano para alimentar o payback.
  const rows1 = buildCashflowRows(eq1, { anos, manut: manut1, descarte: desc1, taxaReal });
  const rows2 = buildCashflowRows(eq2, { anos, manut: manut2, descarte: desc2, taxaReal });

  const rowsDiff = rows2.map((r2, idx) => {
    const r1 = rows1[idx];
    const capexDiff = r2.capex - r1.capex;
    const energiaDiff = r2.energia - r1.energia;
    const manutDiff = r2.manutencao - r1.manutencao;
    const descDiff = r2.descarte - r1.descarte;
    const coaDiff = r2.coa - r1.coa;
    const vpCoaDiff = r2.vpCoa - r1.vpCoa;
    const vpCapexDiff = capexDiff / (1 + taxaReal) ** Math.max(r2.ano - 1, 0);
    const vpTotalDiff = vpCapexDiff + vpCoaDiff;
    return {
      ano: r2.ano,
      capex: capexDiff,
      manutencao: manutDiff,
      energia: energiaDiff,
      descarte: descDiff,
      coa: coaDiff,
      vpCoa: vpCoaDiff,
      vpTotal: vpTotalDiff,
      payback: 0,
    };
  });

  let acumuladoVPDiff = 0;
  // Soma cumulativa do VP diferencial para localizar o ponto de payback.
  rowsDiff.forEach((row) => {
    acumuladoVPDiff += row.vpTotal;
    row.payback = acumuladoVPDiff;
  });

  const sumField = (rows, field) =>
    rows.reduce((acc, r) => acc + (Number.isFinite(r[field]) ? r[field] : 0), 0);

  const totals1 = {
    ano: "Total",
    capex: sumField(rows1, "capex"),
    manutencao: sumField(rows1, "manutencao"),
    energia: sumField(rows1, "energia"),
    descarte: sumField(rows1, "descarte"),
    coa: sumField(rows1, "coa"),
    vpCoa: sumField(rows1, "vpCoa"),
    vpTotal: sumField(rows1, "vpTotal"),
  };

  const totals2 = {
    ano: "Total",
    capex: sumField(rows2, "capex"),
    manutencao: sumField(rows2, "manutencao"),
    energia: sumField(rows2, "energia"),
    descarte: sumField(rows2, "descarte"),
    coa: sumField(rows2, "coa"),
    vpCoa: sumField(rows2, "vpCoa"),
    vpTotal: sumField(rows2, "vpTotal"),
  };

  const totalsDiff = {
    ano: "Total",
    capex: sumField(rowsDiff, "capex"),
    manutencao: sumField(rowsDiff, "manutencao"),
    energia: sumField(rowsDiff, "energia"),
    descarte: sumField(rowsDiff, "descarte"),
    coa: sumField(rowsDiff, "coa"),
    vpCoa: sumField(rowsDiff, "vpCoa"),
    vpTotal: sumField(rowsDiff, "vpTotal"),
  };

  lastCashflowData = { rows1, rows2, rowsDiff, totals1, totals2, totalsDiff };

  renderCashflowTable(cfBody1, rows1, false, totals1);
  renderCashflowTable(cfBody2, rows2, false, totals2);
  renderCashflowTable(cfBodyDiff, rowsDiff, true, totalsDiff);

  destroyPaybackChart();
  if (cfPaybackCanvas) {
    let labelsBase = rowsDiff.map((r) => r.ano);
    let paybacksBase = rowsDiff.map((r) => r.payback);
    const cumulativeFromRows = (rows) => {
      let acc = 0;
      return rows.map((r) => {
        acc += r.vpTotal;
        return acc;
      });
    };
    const cumEq1Base = cumulativeFromRows(rows1);
    const cumEq2Base = cumulativeFromRows(rows2);

    // adensa a série com pontos intermediários entre cada ano (ex.: 8.5) para um preenchimento mais regular
    const labels = [];
    const paybacks = [];
    const cumEq1 = [];
    const cumEq2 = [];
    for (let i = 0; i < labelsBase.length; i++) {
      labels.push(labelsBase[i]);
      paybacks.push(paybacksBase[i]);
      cumEq1.push(cumEq1Base[i]);
      cumEq2.push(cumEq2Base[i]);
      if (i < labelsBase.length - 1) {
        const midLabel = (labelsBase[i] + labelsBase[i + 1]) / 2;
        const midPayback = paybacksBase[i] + (paybacksBase[i + 1] - paybacksBase[i]) * 0.5;
        const midCum1 = cumEq1Base[i] + (cumEq1Base[i + 1] - cumEq1Base[i]) * 0.5;
        const midCum2 = cumEq2Base[i] + (cumEq2Base[i + 1] - cumEq2Base[i]) * 0.5;
        labels.push(midLabel);
        paybacks.push(midPayback);
        cumEq1.push(midCum1);
        cumEq2.push(midCum2);
      }
    }

    const len = paybacks.length;
    const crossIdx = paybacks.findIndex((v) => v >= 0);
    const negData = Array(len).fill(null);
    const posData = Array(len).fill(null);
    if (crossIdx === -1) {
      for (let i = 0; i < len; i++) negData[i] = paybacks[i];
    } else if (crossIdx === 0) {
      for (let i = 0; i < len; i++) posData[i] = paybacks[i];
    } else {
      for (let i = 0; i < len; i++) {
        if (i < crossIdx) negData[i] = paybacks[i];
        else posData[i] = paybacks[i];
      }
      negData[crossIdx] = 0;
      posData[crossIdx - 1] = 0;
    }

    cfPaybackChart = new Chart(cfPaybackCanvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Curva Resultante",
            data: paybacks,
            borderColor: BLUE_PALETTE[0],
            backgroundColor: withAlpha(BLUE_PALETTE[0], "33"),
            tension: 0.15,
            fill: false,
            pointRadius: 3,
            pointHoverRadius: 5,
            spanGaps: true,
            borderWidth: 3,
            pointBorderWidth: 2,
            pointBackgroundColor: "#fff",
            pointStyle: "circle",
          },
          {
            label: `${eq1.eq.marca} (VP Operação)`,
            data: cumEq1,
            borderColor: BLUE_PALETTE[4],
            backgroundColor: "transparent",
            tension: 0.15,
            fill: false,
            pointRadius: 2,
            pointHoverRadius: 4,
            spanGaps: true,
            borderWidth: 2.4,
            pointBorderWidth: 1.6,
            pointBackgroundColor: "#fff",
            pointStyle: "circle",
          },
          {
            label: `${eq2.eq.marca} (VP Operação)`,
            data: cumEq2,
            borderColor: BLUE_PALETTE[2],
            backgroundColor: "transparent",
            tension: 0.15,
            fill: false,
            pointRadius: 2,
            pointHoverRadius: 4,
            spanGaps: true,
            borderWidth: 2.4,
            pointBorderWidth: 1.6,
            pointBackgroundColor: "#fff",
            pointStyle: "circle",
          },
          {
            label: "Investimento",
            data: negData,
            borderColor: "rgba(229, 83, 83, 0.7)",
            borderWidth: 1.2,
            backgroundColor: "rgba(229, 83, 83, 0.18)",
            tension: 0.15,
            fill: "origin",
            pointRadius: 0,
            pointHoverRadius: 0,
            spanGaps: true,
            pointStyle: "rectRounded",
          },
          {
            label: "Lucro",
            data: posData,
            borderColor: "rgba(46, 160, 67, 0.7)",
            borderWidth: 1.2,
            backgroundColor: "rgba(46, 160, 67, 0.18)",
            tension: 0.15,
            fill: "origin",
            pointRadius: 0,
            pointHoverRadius: 0,
            spanGaps: true,
            pointStyle: "rectRounded",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1.6,
        layout: { padding: { top: 8, bottom: 8, left: 6, right: 6 } },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: true,
            labels: {
              usePointStyle: true,
              boxWidth: 18,
              boxHeight: 8,
              padding: 12,
            },
          },
          tooltip: { intersect: false, mode: "index" },
        },
        scales: {
          x: {
            title: { display: true, text: "Ano" },
            ticks: {
              callback: (value, index) => {
                const lbl = labels[index];
                return Number.isInteger(lbl) ? lbl : "";
              },
            },
          },
          y: { title: { display: true, text: "R$ acumulado" } },
        },
      },
    });
  }

  // Texto resumido do payback usado no card financeiro.
  const paybackRow = rowsDiff.find((r) => r.payback >= 0);
  const resumo =
    paybackRow !== undefined
      ? `Payback (VP) estimado no ano ${paybackRow.ano}. A diferença acumulada ao final do período é de ${formatCurrencyBr(rowsDiff[rowsDiff.length - 1].payback)}.`
      : `Sem payback (VP) dentro de ${anos} anos. Diferença acumulada: ${formatCurrencyBr(rowsDiff[rowsDiff.length - 1].payback)}.`;

  cashflowCard.classList.remove("hidden");
  return { resumo };
}

// Export helpers (comparador)
function getComparisonDataset() {
  return {
    lifeYears: getLifeYearsMin(),
    usage: { ...state.usage },
    computed: lastComputed || [],
    cashflow: lastCashflowData,
  };
}

function getLifecycleDataset() {
  if (!lastLifecycle?.resultados?.length) return null;
  return {
    baseParams: lastLifecycle.baseParams,
    resultados: lastLifecycle.resultados,
  };
}

function handleExcelExport() {
  downloadExcel(getComparisonDataset(), getLifecycleDataset());
}

function handlePdfExport() {
  downloadPdfExport({
    dataset: getComparisonDataset(),
    charts,
    paybackChart: cfPaybackChart,
  });
}

// Versão simplificada do carregamento (sem fallback).
const loadEquipmentData = async () => {
  loaderEl.classList.remove("hidden");
  errorEl.classList.add("hidden");
  uiEl.classList.add("hidden");
  selectionCard.classList.add("hidden");
  usageCard.classList.add("hidden");
  chartsCard.classList.add("hidden");
  lcLoaderEl?.classList.remove("hidden");
  lcErrorEl?.classList.add("hidden");
  lcUiEl?.classList.add("hidden");
  lcSelectionCard?.classList.add("hidden");

  const dataUrl = new URL("data/equipamentos_integrados.json", window.location.href).toString();

  try {
    const response = await fetch(dataUrl, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Status HTTP ${response.status} ao buscar ${dataUrl}`);
    }

    const text = await response.text();
    console.info("Equipamentos carregados de:", dataUrl);

    const sanitized = text.replace(/:\s*NaN\b/gi, ": null");
    const data = JSON.parse(sanitized);

    equipmentData = data.map((item, index) => ({
      id: index + 1,
      marca: item.marca || "",
      tipo: item.tipo || "",
      funcao: item.funcao || "",
      tecnologia: item.tecnologia || "",
      tensao: item.tensao || 220,
      potencia_btu: item.potencia_btu || 0,
      potencia_w: item.potencia_w || 0,
      modelo_concat: item.modelo_concat || "",
      p_29_parcial: Number.isFinite(item.p_29_parcial) ? item.p_29_parcial : null,
      p_35_parcial: Number.isFinite(item.p_35_parcial) ? item.p_35_parcial : null,
      p_29_total: Number.isFinite(item.p_29_total) ? item.p_29_total : null,
      p_35_total: Number.isFinite(item.p_35_total) ? item.p_35_total : null,
      consumo_kwh_ano: item.consumo_kwh_ano || 0,
      idrs: item.idrs || 0,
      classe: item.classe || item.Classe || "",
    }));

      populateFilterOptions();
      if (filterFields.potencia) filterFields.potencia.value = state.filters.potencia;
      if (filterFields.funcao) filterFields.funcao.value = state.filters.funcao;

      initLifecycleSelectors();
      applyFilters();
      attachEvents();

    loaderEl.classList.add("hidden");
    uiEl.classList.remove("hidden");
    selectionCard.classList.toggle("hidden", equipmentData.length === 0);
    usageCard.classList.toggle("hidden", equipmentData.length === 0);
  } catch (err) {
    console.error("Erro ao carregar JSON", err);
    loaderEl.classList.add("hidden");
    const isFile = window.location.protocol === "file:";
    const hint = isFile
      ? "Use um servidor local (ex.: python -m http.server) porque file:// bloqueia requisiÃ§Ãµes."
      : "Verifique se a pasta data/ estÃ¡ no mesmo nÃ­vel do index.html.";
    errorEl.textContent =
      "NÃ£o foi possÃ­vel carregar a base de equipamentos. " +
      hint +
      " Caminho tentado: " +
      dataUrl +
      ". Detalhe: " +
      (err instanceof Error ? err.message : String(err));
    if (lcLoaderEl) lcLoaderEl.classList.add("hidden");
    if (lcErrorEl) {
      lcErrorEl.textContent = errorEl.textContent;
      lcErrorEl.classList.remove("hidden");
    }
    errorEl.classList.remove("hidden");
  }
};

// Ciclo de Vida (comparando a seleção do comparador)
const lcInputs = {
  horas: document.getElementById("lc-horas"),
  horasVal: document.getElementById("lc-horas-val"),
  manutencao: document.getElementById("lc-manutencao"),
  ambiente: document.getElementById("lc-ambiente"),
  temperatura: document.getElementById("lc-temperatura"),
  temperaturaVal: document.getElementById("lc-temperatura-val"),
};

const lcResultCard = document.getElementById("lc-resultados");
const lcStats = document.getElementById("lc-stats");
const lcInterpretacao = document.getElementById("lc-interpretacao");
const lcAlert = document.getElementById("lc-alerta");
let lcAlertTimer = null;

function destroyLcCharts() {
  destroyChartGroup(lcCharts);
}

function syncLifeCycleDefaults() {
  lcInputs.horas.value = state.usage.horasUso.toString();
  if (lcInputs.temperatura) lcInputs.temperatura.value = state.usage.temperaturaUso.toString();
  if (lcInputs.horasVal) lcInputs.horasVal.textContent = formatHoursPerDay(parseNumber(lcInputs.horas.value, 8));
  if (lcInputs.temperaturaVal) lcInputs.temperaturaVal.textContent = `${parseNumber(lcInputs.temperatura.value, 25).toFixed(1)} C`;
  setRangeFill(lcInputs.horas);
  setRangeFill(lcInputs.temperatura);
}

function desenharCiclo() {
  const selected = lcGetSelectedEntries();
  if (selected.length < 1) {
    if (lcAlert) {
      lcAlert.textContent = "Selecione um equipamento acima para gerar as curvas.";
      lcAlert.classList.remove("hidden");
      if (lcAlertTimer) clearTimeout(lcAlertTimer);
      lcAlertTimer = window.setTimeout(() => lcAlert.classList.add("hidden"), 4000);
    }
    lcResultCard?.classList.add("hidden");
    lastLifecycle = null;
    destroyLcCharts();
    return;
  }

  if (lcAlertTimer) clearTimeout(lcAlertTimer);
  lcAlert?.classList.add("hidden");

  const baseParams = {
    horasUso: parseNumber(lcInputs.horas.value, state.usage.horasUso),
    manutencao: lcInputs.manutencao.value,
    ambiente: lcInputs.ambiente.value,
    temperatura: parseNumber(lcInputs.temperatura.value, 25),
  };

  const equipamentos = selected
    .slice(0, 3)
    .map((item) => ({
      rotulo: `${item.eq.marca} (${item.eq.tecnologia || tecnologiaNormalizada(item.eq)})`,
      eq: item.eq,
      vidaEstimada: parseNumber(item.anosVida, 10),
    }));
  const resultados = computeLifecycleCurves(equipamentos, baseParams);
  lastLifecycle = { resultados, baseParams };

  lcStats.innerHTML = resultados
    .map(
      (r) => `
      <div class="stat">
        <div class="muted">${r.rotulo}</div>
        <div><strong>MTTF:</strong> ${r.mttf.toFixed(2)} anos</div>
        <div><strong>Vida caracteristica (eta):</strong> ${r.eta_aj.toFixed(2)} anos</div>
        <div><strong>Fator de aceleracao:</strong> ${r.AF.toFixed(3)}</div>
        <div class="muted">Tecnologia: ${r.params.tecnologia}</div>
      </div>
    `
    )
    .join("");

  lcInterpretacao.textContent = `Beta = ${BETA.toFixed(1)} (regime de desgaste). Considerando ${baseParams.horasUso}h/dia, ${baseParams.ambiente} e manutencao ${baseParams.manutencao}, a tecnologia de cada equipamento gera curvas proprias de confiabilidade.`;

  destroyLcCharts();
  lcCharts = createLifecycleCharts(resultados);

  lcResultCard.classList.remove("hidden");
}

export function initComparador() {
  loadEquipmentData();
  const btnExcelCB = document.getElementById("btn-export-excel-cb");
  const btnPdfCB = document.getElementById("btn-export-pdf-cb");
  const btnExcelLC = document.getElementById("btn-export-excel-lc");
  const btnPdfLC = document.getElementById("btn-export-pdf-lc");
  if (btnExcelCB) btnExcelCB.addEventListener("click", handleExcelExport);
  if (btnPdfCB) btnPdfCB.addEventListener("click", handlePdfExport);
  // exportação do ciclo de vida removida/ocultada até configuração futura
  initRangeFill();
}
