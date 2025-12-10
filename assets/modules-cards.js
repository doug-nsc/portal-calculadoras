// Arquivo responsável por renderizar os cards dos módulos de produtos na tela inicial.

// Lista os módulos exibidos na tela inicial (ativos e futuros)
const productModules = [
  {
    id: "ar-condicionado",
    name: "Ar-Condicionado",
    description: "Análise completa de climatização com modelos Weibull, AFT e Arrhenius",
    status: "active",
    features: [
      "517 equipamentos INMETRO",
      "Análise de consumo e custo",
      "Estimativa de vida útil (MTTF)",
      "Curvas de confiabilidade",
    ],
  },
  {
    id: "pneus",
    name: "Pneus",
    description: "Comparação de pneus para frota pública com análise de durabilidade e custo por quilômetro",
    status: "soon",
    features: ["Análise de desgaste", "Custo por km rodado", "Segurança e grip"],
  },
  {
    id: "computadores",
    name: "Computadores",
    description: "Avaliação de desktops, notebooks e estações de trabalho com TCO e obsolescência",
    status: "soon",
    features: ["TCO (Total Cost of Ownership)", "Benchmark de performance", "Análise de obsolescência"],
  },
  {
    id: "mesas",
    name: "Mesas",
    description: "Comparação de mobiliário com foco em durabilidade, ergonomia e custo-benefício",
    status: "soon",
    features: ["Durabilidade de materiais", "Ergonomia e normas", "Manutenção e garantia"],
  },
  {
    id: "cadeiras",
    name: "Cadeiras",
    description: "Avaliação de cadeiras de escritório com foco em ergonomia e vida útil",
    status: "soon",
    features: ["Análise ergonômica", "Conformidade NR-17", "Testes de resistência"],
  },
];

const moduleActive = document.getElementById("module-active");
const moduleSoon = document.getElementById("module-soon");

const tabTargetMap = {
  comparador: {
    "ar-condicionado": "comparador",
    pneus: "comparador-pneus",
    computadores: "comparador-computadores",
    mesas: "comparador-mesas",
    cadeiras: "comparador-cadeiras",
  },
  ciclo: {
    "ar-condicionado": "ciclo",
    pneus: "ciclo-pneus",
    computadores: "ciclo-computadores",
    mesas: "ciclo-mesas",
    cadeiras: "ciclo-cadeiras",
  },
};

function getTabTarget(moduleId, prefix) {
  return tabTargetMap[prefix]?.[moduleId] || prefix;
}

export function renderModules() {
  // Distribui módulos entre colunas de ativos e futuros, ligando cada botão à respectiva aba
  const active = productModules.filter((m) => m.status === "active");
  const soon = productModules.filter((m) => m.status !== "active");

  moduleActive.innerHTML = active
    .map((m) => {
      const comparadorTarget = getTabTarget(m.id, "comparador");
      const cicloTarget = getTabTarget(m.id, "ciclo");
      return `
      <div class="module-card">
        <div class="badge success badge-top-right">Ativo</div>
        <h4 style="margin:4px 0 2px;">${m.name}</h4>
        <p class="muted" style="margin:0 0 6px;">${m.description}</p>
        <ul style="margin:0; padding-left:16px; color:var(--muted); display:grid; gap:4px;">
          ${m.features.map((f) => `<li>${f}</li>`).join("")}
        </ul>
        <div class="actions">
          <button class="btn compare" data-go-tab="${comparadorTarget}">Custo-Benefício →</button>
          <button class="btn compare" data-go-tab="${cicloTarget}">Ciclo de Vida →</button>
        </div>
      </div>
    `;
    })
    .join("");

  moduleSoon.innerHTML = soon
    .map((m) => {
      const comparadorTarget = getTabTarget(m.id, "comparador");
      const cicloTarget = getTabTarget(m.id, "ciclo");
      return `
      <div class="module-card dashed">
        <div class="badge muted badge-top-right">Em breve</div>
        <h4 style="margin:4px 0 2px;">${m.name}</h4>
        <p class="muted" style="margin:0 0 6px;">${m.description}</p>
        <ul style="margin:0; padding-left:16px; color:var(--muted); display:grid; gap:4px;">
          ${m.features.map((f) => `<li>${f}</li>`).join("")}
        </ul>
        <div class="actions">
          <button class="btn compare" data-go-tab="${comparadorTarget}">Custo-Benefício →</button>
          <button class="btn compare" data-go-tab="${cicloTarget}">Ciclo de Vida →</button>
        </div>
      </div>
    `;
    })
    .join("");
}