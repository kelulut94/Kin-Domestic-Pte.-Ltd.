// Shared helpers for biodata.html and helper.html.
(function () {
  var TYPE_LABELS = {
    fresh: "Fresh",
    transfer: "Transfer",
    experienced: "Experienced"
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function capitalize(s) {
    s = String(s || "");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function loadHelpers() {
    return fetch(window.KIN_CONFIG.helpersDataUrl, { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        return Array.isArray(data) ? data : data.helpers || [];
      });
  }

  function whatsappLink(helper) {
    var msg =
      "Hello Kin Domestic, I would like to enquire about helper " +
      helper.id + " (" + helper.firstName + ").";
    return "https://wa.me/" + window.KIN_CONFIG.whatsappNumber +
      "?text=" + encodeURIComponent(msg);
  }

  window.KinHelpers = {
    TYPE_LABELS: TYPE_LABELS,
    escapeHtml: escapeHtml,
    capitalize: capitalize,
    loadHelpers: loadHelpers,
    whatsappLink: whatsappLink
  };
})();
