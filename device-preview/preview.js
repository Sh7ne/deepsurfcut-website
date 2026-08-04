const buttons = document.querySelectorAll("[data-mode]");
const previews = document.querySelectorAll("figure img");

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.mode;

    buttons.forEach((item) => {
      item.setAttribute("aria-pressed", String(item === button));
    });

    previews.forEach((preview) => {
      preview.src = preview.dataset[mode];
      preview.alt = `DeepSurfCut ${mode} in ${preview.dataset.label}`;
    });
  });
});
