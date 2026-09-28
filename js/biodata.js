// Listing page: renders available helpers and applies filters.
(function () {
  var H = window.KinHelpers;
  var grid = document.getElementById("helper-grid");
  var countEl = document.getElementById("result-count");
  var form = document.getElementById("filters");
  var natSelect = document.getElementById("filter-nationality");
  var allHelpers = [];

  function card(h) {
    var skills = (h.keySkills || []).slice(0, 3).map(function (s) {
      return '<li class="chip">' + H.escapeHtml(H.capitalize(s)) + "</li>";
    }).join("");
    var href = "helper.html?id=" + encodeURIComponent(h.id);
    return (
      '<article class="helper-card">' +
        '<a class="helper-card__link" href="' + H.escapeHtml(href) + '">' +
          '<img class="helper-card__photo" src="' + H.escapeHtml(h.photo || "images/helpers/placeholder.svg") +
            '" alt="Photo of ' + H.escapeHtml(h.firstName) + '" loading="lazy">' +
          '<div class="helper-card__body">' +
            '<p class="helper-card__id">' + H.escapeHtml(h.id) + "</p>" +
            '<h2 class="helper-card__name">' + H.escapeHtml(h.firstName) + "</h2>" +
            '<p class="helper-card__meta">' + H.escapeHtml(h.age) + " yrs · " +
              H.escapeHtml(h.nationality) + "</p>" +
            '<p><span class="badge badge--' + H.escapeHtml(h.type) + '">' +
              H.escapeHtml(H.TYPE_LABELS[h.type] || h.type) + "</span></p>" +
            '<ul class="chips">' + skills + "</ul>" +
            '<span class="helper-card__cta">View biodata &rarr;</span>' +
          "</div>" +
        "</a>" +
      "</article>"
    );
  }

  function hasSkill(h, skill) {
    if ((h.keySkills || []).indexOf(skill) !== -1) return true;
    var level = h.skills && h.skills[skill];
    return !!level && !/willing to learn|^no/i.test(level);
  }

  function render() {
    var type = form.elements.type.value;
    var nat = form.elements.nationality.value;
    var skills = Array.prototype.map.call(
      form.querySelectorAll('input[name="skill"]:checked'), function (el) { return el.value; }
    );

    var list = allHelpers.filter(function (h) {
      if (type && h.type !== type) return false;
      if (nat && h.nationality !== nat) return false;
      return skills.every(function (s) { return hasSkill(h, s); });
    });

    if (allHelpers.length === 0) {
      grid.innerHTML =
        '<p class="empty">No helpers are currently available. Please check back soon, ' +
        'or <a href="contact.html">contact us</a> and we will let you know when new ' +
        "profiles are added.</p>";
      countEl.textContent = "";
      return;
    }
    if (list.length === 0) {
      grid.innerHTML =
        '<p class="empty">No helpers match these filters. Try removing a filter, or ' +
        '<a href="contact.html">contact us</a> for help.</p>';
    } else {
      grid.innerHTML = list.map(card).join("");
    }
    countEl.textContent = list.length + " of " + allHelpers.length + " available helper" +
      (allHelpers.length === 1 ? "" : "s") + " shown";
  }

  function populateNationalities() {
    var nats = allHelpers.map(function (h) { return h.nationality; })
      .filter(function (n, i, arr) { return n && arr.indexOf(n) === i; })
      .sort();
    nats.forEach(function (n) {
      var opt = document.createElement("option");
      opt.value = n;
      opt.textContent = n;
      natSelect.appendChild(opt);
    });
  }

  // Pre-select filters from links such as biodata.html?type=fresh&skill=cooking
  function applyUrlFilters() {
    var params = new URLSearchParams(window.location.search);
    var type = params.get("type");
    var nat = params.get("nationality");
    if (type && form.elements.type.querySelector('option[value="' + CSS.escape(type) + '"]')) {
      form.elements.type.value = type;
    }
    if (nat && natSelect.querySelector('option[value="' + CSS.escape(nat) + '"]')) {
      natSelect.value = nat;
    }
    params.getAll("skill").forEach(function (skill) {
      var box = form.querySelector('input[name="skill"][value="' + CSS.escape(skill) + '"]');
      if (box) box.checked = true;
    });
  }

  form.addEventListener("change", render);
  form.addEventListener("reset", function () { setTimeout(render, 0); });

  H.loadHelpers()
    .then(function (helpers) {
      allHelpers = helpers.filter(function (h) { return h.status === "available"; });
      populateNationalities();
      applyUrlFilters();
      render();
    })
    .catch(function () {
      grid.innerHTML =
        '<p class="empty">Sorry, we could not load helper profiles right now. Please try again later ' +
        'or <a href="contact.html">contact us</a>.</p>';
    });
})();
