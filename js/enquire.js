// Enquiry form: composes the enquiry and opens WhatsApp or the visitor's email app.
// Nothing is stored or sent to a server; the visitor sends the message themselves.
(function () {
  var form = document.getElementById("enquiry-form");
  var errorEl = document.getElementById("form-error");
  if (!form) return;

  // Pre-fill the helper ID from links such as enquire.html?helper=KD-1824
  var helper = new URLSearchParams(window.location.search).get("helper");
  if (helper) form.elements.helper.value = helper.slice(0, 40);

  var via = "whatsapp";
  form.querySelectorAll('button[type="submit"]').forEach(function (btn) {
    btn.addEventListener("click", function () { via = btn.getAttribute("data-via"); });
  });

  function value(name) {
    return (form.elements[name].value || "").trim();
  }

  function buildMessage() {
    var needs = Array.prototype.map.call(
      form.querySelectorAll('input[name="needs"]:checked'), function (el) { return el.value; }
    );
    var lines = [
      "Hello Kin Domestic, I would like to enquire about hiring a helper.",
      "",
      "Name: " + value("name"),
      "Phone: " + value("phone")
    ];
    function add(label, v) { if (v) lines.push(label + ": " + v); }
    add("Email", value("email"));
    add("Helper ID", value("helper"));
    add("Type of helper", value("type"));
    add("Needed", value("start"));
    add("Household", value("household"));
    add("People at home", value("people"));
    add("Help needed", needs.join(", "));
    if (value("message")) lines.push("", value("message"));
    return lines.join("\n");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var missing = [];
    if (!value("name")) missing.push("your name");
    if (!value("phone")) missing.push("your phone number");
    var email = value("email");
    if (missing.length) {
      errorEl.textContent = "Please fill in " + missing.join(" and ") + ".";
      errorEl.hidden = false;
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorEl.textContent = "Please check your email address.";
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;

    var msg = buildMessage();
    var cfg = window.KIN_CONFIG;
    if (via === "email") {
      var subject = "Helper enquiry" + (value("helper") ? " – " + value("helper") : "") + " – " + value("name");
      window.location.href = "mailto:" + cfg.email +
        "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(msg);
    } else {
      window.open("https://wa.me/" + cfg.whatsappNumber + "?text=" + encodeURIComponent(msg), "_blank", "noopener");
    }
  });
})();
