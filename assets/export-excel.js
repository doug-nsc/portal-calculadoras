// Arquivo responsável por exportar os dados do comparador e análise de ciclo de vida para Excel.

import { tecnologiaNormalizada } from "./lifecycle.js";

function buildWorkbook(ds, lc) {
  if (!ds?.computed?.length || !window.XLSX) return null;
  const wb = XLSX.utils.book_new();

  const resumo = ds.computed.map((c) => ({
    Marca: c.eq.marca,
    Tecnologia: c.eq.tecnologia || tecnologiaNormalizada(c.eq),
    ConsumoTotal_kWh: c.consumoTotal,
    CustoEnergia_Total: c.custoEnergiaTotal,
    OPEX_Total: c.opexTotal,
    Total_Vida: c.totalVida,
    Total_Vida_PV: c.totalVidaPV,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "CB_Resumo");

  if (ds.cashflow) {
    const wsCF1 = XLSX.utils.json_to_sheet(ds.cashflow.rows1 || []);
    const wsCF2 = XLSX.utils.json_to_sheet(ds.cashflow.rows2 || []);
    const wsCFD = XLSX.utils.json_to_sheet(ds.cashflow.rowsDiff || []);
    XLSX.utils.book_append_sheet(wb, wsCF1, "CB_Fluxo_Equip1");
    XLSX.utils.book_append_sheet(wb, wsCF2, "CB_Fluxo_Equip2");
    XLSX.utils.book_append_sheet(wb, wsCFD, "CB_Fluxo_Diferenca");
  }

  if (lc?.resultados?.length) {
    const resumoLC = lc.resultados.map((r) => ({
      Equipamento: r.rotulo,
      MTTF_anos: r.mttf,
      Vida_caracteristica_eta: r.eta_aj,
      Fator_aceleracao: r.AF,
      Tecnologia: r.params?.tecnologia,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumoLC), "LC_Resumo");
  }

  return wb;
}

export function downloadExcel(ds, lc) {
  const wb = buildWorkbook(ds, lc);
  if (!wb) return;
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "comparador-custo-beneficio.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
