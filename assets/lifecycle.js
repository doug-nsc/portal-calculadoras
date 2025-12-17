// Arquivo responsável por cálculos relacionados ao ciclo de vida dos equipamentos.

// Resumo: calcula penalizacoes de uso/manutencao/ambiente e gera curvas Weibull de ciclo de vida.
export const BETA = 2.0;
export const ETA0 = 10;

const GAMMA = {
  // Penaliza apenas acima do limite neutro (5h42min/dia)
  horas: -0.04,
  manut: { regular: 0, irregular: -0.1, sem: -0.25 },
  amb: { ideal: 0, quente: -0.1, severo: -0.2 },
  tec: { inverter: 0, convencional: -0.12 },
  temp: -0.025,
};

const TEMP_NEUTRA_C = 26.2;
const HORAS_NEUTRAS = 5.7; // 5h42min

export function tecnologiaNormalizada(eq) {
  const tech = (eq?.tecnologia || "").toLowerCase();
  return tech.includes("conv") ? "convencional" : "inverter";
}

export function gammaFunc(z) {
  return Math.sqrt((2 * Math.PI) / z) * Math.pow(z / Math.E, z);
}

function penalizacaoTemperatura(tempC) {
  if (!Number.isFinite(tempC)) return 0;
  const delta = tempC - TEMP_NEUTRA_C;
  return delta > 0 ? GAMMA.temp * delta : 0;
}

export function weibullAFT(params) {
  const gammaManut = GAMMA.manut[params.manutencao] || 0;
  const gammaAmb = GAMMA.amb[params.ambiente] || 0;
  const gammaTec = GAMMA.tec[params.tecnologia] || 0;
  const gammaTemp = penalizacaoTemperatura(params.temperatura);

  const etaBase = Number.isFinite(params?.etaBase) && params.etaBase > 0 ? params.etaBase : ETA0;
  const horasPenal = GAMMA.horas * Math.max(0, params.horasUso - HORAS_NEUTRAS);
  const eta_x = etaBase * Math.exp(horasPenal + gammaManut + gammaAmb + gammaTec + gammaTemp);

  const eta_aj = eta_x;
  const AF = 1; // Arrhenius desativado; penalizacao linear de temperatura no termo exponencial
  const mttf = eta_aj * gammaFunc(1 + 1 / BETA);

  return { eta_aj, AF, mttf };
}

export function computeLifecycleCurves(equipments, baseParams) {
  return equipments.map((item) => {
    const params = {
      ...baseParams,
      tecnologia: tecnologiaNormalizada(item.eq),
      etaBase: Number.isFinite(item.vidaEstimada) && item.vidaEstimada > 0 ? item.vidaEstimada : undefined,
    };
    const { eta_aj, AF, mttf } = weibullAFT(params);
    const maxTime = Math.ceil(mttf * 3);

    const confiabilidade = [];
    for (let t = 0; t <= maxTime; t += 0.5) {
      const R = Math.exp(-Math.pow(t / eta_aj, BETA)) * 100;
      confiabilidade.push({ t, R });
    }

    const taxaFalha = [];
    for (let t = 0.5; t <= maxTime; t += 0.5) {
      const h = (BETA / eta_aj) * Math.pow(t / eta_aj, BETA - 1) * 100;
      taxaFalha.push({ t, h });
    }

    const densidade = confiabilidade.map((point) => {
      const t = point.t;
      if (t === 0) return { t, f: 0 };
      const f = (BETA / eta_aj) * Math.pow(t / eta_aj, BETA - 1) * Math.exp(-Math.pow(t / eta_aj, BETA)) * 100;
      return { t, f };
    });

    return { ...item, params, eta_aj, AF, mttf, maxTime, confiabilidade, taxaFalha, densidade };
  });
}
