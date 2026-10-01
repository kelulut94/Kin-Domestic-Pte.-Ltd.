// Confirm dialogs for destructive buttons: <button data-confirm="Are you sure?">
document.addEventListener("click", function (e) {
  var el = e.target.closest("[data-confirm]");
  if (el && !window.confirm(el.getAttribute("data-confirm"))) e.preventDefault();
});
