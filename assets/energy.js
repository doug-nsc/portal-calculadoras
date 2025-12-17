// Arquivo responsável por cálculos relacionados ao consumo de energia e custos associados.

// Resumo: estima consumo anual ajustando por horas/dias de uso e calcula custos presentes.
const BASE_ANNUAL_HOURS = 2080; // consumo_kwh_ano refere-se a 2080h/ano (365 dias * 5,698h/dia)

// Consumo anual direto a partir do valor medio informado pelo INMETRO.
export function estimateAnnualConsumption(eq) {
  const consumo = Number.isFinite(eq?.consumo_kwh_ano) ? eq.consumo_kwh_ano : 0;
  return consumo > 0 ? consumo : 0;
}

// Ajusta o consumo anual declarado para o perfil de uso informado (dias/ano e horas/dia).
export function calculateConsumption(eq, usage) {
  const consumoBase = estimateAnnualConsumption(eq);
  const horas = Number.isFinite(usage?.horasUso) ? usage.horasUso : 5.698;
  const dias = Number.isFinite(usage?.diasAno) ? usage.diasAno : BASE_ANNUAL_HOURS / Math.max(horas, 1);
  const fator = (horas * dias) / BASE_ANNUAL_HOURS;
  return consumoBase * fator;
}

function presentValueAnnuity(pmt, rate, periods) {
  if (rate === 0) return pmt * periods;
  return pmt * ((1 - (1 + rate) ** -periods) / rate);
}

export function computeEnergyTotals(entries, usage, lifeYears = 1) {
  const taxaReal = Number.isFinite(usage.taxaReal) ? usage.taxaReal : 0.01;

  return entries.map((entry) => {
    const manutAnual = entry.manut || 0;
    const descarte = entry.descarte || 0;
    const consumoAnual = calculateConsumption(entry.eq, usage);
    const consumoTotal = consumoAnual * lifeYears;
    const custoEnergiaAnual = consumoAnual * usage.tarifaKwh;
    const custoEnergiaTotal = custoEnergiaAnual * lifeYears;
    const custoEnergiaPV = presentValueAnnuity(custoEnergiaAnual, taxaReal, lifeYears);

  const manutPV = presentValueAnnuity(manutAnual, taxaReal, lifeYears);
  const descartePV = descarte / (1 + taxaReal) ** lifeYears;
  const coaAnual = custoEnergiaAnual + manutAnual;
  const coaTotal = custoEnergiaTotal + manutAnual * lifeYears + descarte;
  const coaPV = custoEnergiaPV + manutPV + descartePV;

    const capex = (entry.custoAq || 0) + (entry.custoInst || 0);
    const custoTotalPrimeiroAno = capex + custoEnergiaAnual;
    const totalVida = custoEnergiaTotal + capex;
    const totalVidaPV = custoEnergiaPV + capex + manutPV + descartePV; // capex acontece no ano 0

    return {
      ...entry,
      consumoAnual,
      consumoTotal,
      custoEnergiaAnual,
      custoEnergiaTotal,
      custoEnergiaPV,
      manutAnual,
      descarte,
      coaAnual,
      coaTotal,
      coaPV,
      custoTotalPrimeiroAno,
      totalVida,
      totalVidaPV,
    };
  });
}
