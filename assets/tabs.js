// Gerencia abas e dropdowns do topo
export function initTabs() {
  const tabTriggers = document.querySelectorAll("[data-tab-target]");
  const tabContents = document.querySelectorAll(".tab-content");

  const setActiveTab = (target) => {
    tabContents.forEach((sec) => sec.classList.toggle("active", sec.id === `tab-${target}`));
    tabTriggers.forEach((btn) => {
      const prefix = btn.dataset.tabPrefix;
      const matches = btn.dataset.tabTarget === target || (prefix && target.startsWith(prefix));
      btn.classList.toggle("active", Boolean(matches));
    });
  };

  tabTriggers.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tabTarget;
      if (target) setActiveTab(target);
    });
  });

  // Navega para a aba via data-go-tab (cards)
  document.addEventListener("click", (evt) => {
    const target = evt.target;
    if (target instanceof HTMLElement && target.dataset.goTab) {
      const tab = target.dataset.goTab;
      setActiveTab(tab);
    }
  });

  setActiveTab("inicio");
}