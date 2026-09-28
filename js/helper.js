// Profile page: reads ?id= from the URL and renders that helper's biodata.
(function () {
  var H = window.KinHelpers;
  var root = document.getElementById("profile");
  var id = new URLSearchParams(window.location.search).get("id");

  function row(label, value) {
    if (value === undefined || value === null || value === "") return "";
    return "<tr><th scope=\"row\">" + H.escapeHtml(label) + "</th><td>" +
      H.escapeHtml(value) + "</td></tr>";
  }

  function yesNo(v) {
    return v === true ? "Yes" : v === false ? "No" : v;
  }

  // "video" may be a local MP4 (e.g. videos/helpers/KD-1824.mp4) or a YouTube link.
  function videoSection(h) {
    if (!h.video) return "";
    var yt = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(h.video);
    var player;
    if (yt) {
      player = '<div class="video-embed"><iframe src="https://www.youtube-nocookie.com/embed/' + yt[1] +
        '" title="Introduction video of ' + H.escapeHtml(h.firstName) + '" loading="lazy" ' +
        'allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>';
    } else if (/^videos\/[\w.\/-]+\.(mp4|webm|mov)$/i.test(h.video)) {
      player = '<video class="helper-video" controls playsinline preload="metadata" src="' +
        H.escapeHtml(h.video) + '"' + (h.photo ? ' poster="' + H.escapeHtml(h.photo) + '"' : "") +
        '>Your browser cannot play this video.</video>';
    } else {
      return "";
    }
    return "<section><h2>Introduction video</h2>" + player + "</section>";
  }

  function notFound(msg) {
    document.title = "Helper not found | Kin Domestic";
    root.innerHTML =
      '<div class="empty"><p>' + H.escapeHtml(msg) + "</p>" +
      '<p><a class="button" href="biodata.html">Back to all helpers</a></p></div>';
  }

  function render(h) {
    var p = h.particulars || {};
    var pref = h.preferences || {};
    var skills = h.skills || {};

    document.title = h.id + " – " + h.firstName + " | Kin Domestic";

    var experience = (h.experience || []).length
      ? "<ul class=\"experience\">" + h.experience.map(function (e) {
          return "<li><strong>" + H.escapeHtml(e.country) + "</strong>" +
            " <span class=\"muted\">(" + H.escapeHtml(e.years) + ")</span><br>" +
            H.escapeHtml(e.duties) + "</li>";
        }).join("") + "</ul>"
      : "<p class=\"muted\">No overseas work experience (fresh helper).</p>";

    var skillRows = Object.keys(skills).map(function (k) {
      return row(H.capitalize(k), skills[k]);
    }).join("");

    var languages = (h.languages || []).map(function (l) {
      return '<li class="chip">' + H.escapeHtml(l) + "</li>";
    }).join("");

    var statusNote = h.status !== "available"
      ? '<p class="status-note">This helper is currently <strong>' +
          H.escapeHtml(h.status) + "</strong>. Contact us for similar profiles.</p>"
      : "";

    var videoHtml = videoSection(h);

    var sampleNote = h.sample
      ? '<p class="sample-note">SAMPLE PROFILE – fictional data for layout testing.</p>'
      : "";

    root.innerHTML =
      '<p><a href="biodata.html">&larr; Back to all helpers</a></p>' +
      sampleNote +
      '<div class="profile">' +
        '<div class="profile__aside">' +
          '<img class="profile__photo" src="' + H.escapeHtml(h.photo || "images/helpers/placeholder.svg") +
            '" onerror="this.onerror=null;this.src=\'images/helpers/placeholder.svg\'" alt="Photo of ' + H.escapeHtml(h.firstName) + '">' +
          statusNote +
          (h.status === "available"
            ? '<a class="button button--whatsapp" target="_blank" rel="noopener" href="' +
                H.escapeHtml(H.whatsappLink(h)) + '">Enquire about this helper</a>' +
              '<a class="btn btn-ghost" href="enquire.html?helper=' + encodeURIComponent(h.id) +
                '">Send an enquiry form</a>'
            : "") +
        "</div>" +
        '<div class="profile__main">' +
          '<p class="helper-card__id">' + H.escapeHtml(h.id) + "</p>" +
          "<h1>" + H.escapeHtml(h.firstName) + "</h1>" +
          '<p><span class="badge badge--' + H.escapeHtml(h.type) + '">' +
            H.escapeHtml(H.TYPE_LABELS[h.type] || h.type) + "</span></p>" +

          videoHtml +

          "<section><h2>Basic particulars</h2><table class=\"facts\">" +
            row("Age", h.age) +
            row("Nationality", h.nationality) +
            row("Height", p.height) +
            row("Weight", p.weight) +
            row("Religion", p.religion) +
            row("Marital status", p.maritalStatus) +
            row("Children", p.children) +
            row("Education", p.education) +
          "</table></section>" +

          "<section><h2>Work experience</h2>" + experience + "</section>" +

          "<section><h2>Skills</h2><table class=\"facts\">" + skillRows + "</table></section>" +

          "<section><h2>Languages</h2><ul class=\"chips\">" + languages + "</ul></section>" +

          "<section><h2>Preferences</h2><table class=\"facts\">" +
            row("Rest days", pref.restDays) +
            row("Can handle dogs", yesNo(pref.handleDogs)) +
            row("Can handle cats", yesNo(pref.handleCats)) +
            row("Other", pref.otherNotes) +
          "</table></section>" +

          "<section><h2>Availability</h2><p>" + H.escapeHtml(h.availability) + "</p></section>" +

          "<section><h2>Agency remarks</h2><p>" + H.escapeHtml(h.remarks) + "</p></section>" +
        "</div>" +
      "</div>";
  }

  if (!id) {
    notFound("No helper was specified.");
    return;
  }

  H.loadHelpers()
    .then(function (helpers) {
      var h = helpers.filter(function (x) { return x.id === id; })[0];
      if (!h) notFound("We couldn't find helper " + id + ". They may no longer be listed.");
      else render(h);
    })
    .catch(function () {
      notFound("Sorry, we could not load this profile right now. Please try again later.");
    });
})();
