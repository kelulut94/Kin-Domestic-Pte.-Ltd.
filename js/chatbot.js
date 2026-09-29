// FAQ chatbot: a chat bubble with tap-to-ask questions and simple keyword matching.
// No AI and nothing is sent anywhere; answers come from the TOPICS list below.
// To change an answer, edit its "answer" text. Keep it in line with fees.html and guide.html.
(function () {
  var cfg = window.KIN_CONFIG || {};
  var WA = cfg.whatsappNumber || "6593757030";
  var EMAIL = cfg.email || "hello@kindomestic.com";
  var WA_URL = "https://wa.me/" + WA + "?text=" + encodeURIComponent("Hello Kin Domestic, I have a question.");
  var WA_TXT = WA.replace(/^65/, "").replace(/(\d{4})(\d{4})/, "$1 $2");

  var CONTACT_HTML =
    'You can <a href="' + WA_URL + '" target="_blank" rel="noopener">WhatsApp us at ' + WA_TXT + '</a>, ' +
    'email <a href="mailto:' + EMAIL + '">' + EMAIL + '</a>, or fill in our ' +
    '<a href="enquire.html">enquiry form</a>.';

  var TOPICS = [
    {
      q: "What are your fees?",
      keys: ["fee", "fees", "price", "cost", "how much", "package", "588", "1288", "charge"],
      answer:
        "Our agency fee packages for Myanmar helpers:<br>" +
        "• <b>$588</b> for fresh or experienced helpers<br>" +
        "• <b>$1,288</b> for local transfer helpers (no placement fee)<br>" +
        "Both include <b>free doorstep handover</b> and a <b>free replacement within 12 months</b>. " +
        'Government and third-party costs are listed on our <a href="fees.html">Fees &amp; Packages</a> page.'
    },
    {
      q: "Fresh, experienced or transfer?",
      keys: ["fresh", "experienced", "transfer", "difference", "type", "new helper", "ex-overseas"],
      answer:
        "<b>Fresh</b> helpers are working overseas for the first time. " +
        "<b>Experienced</b> helpers have worked overseas before. " +
        "<b>Transfer</b> helpers are already working in Singapore and are looking for new employers, " +
        'so they can usually start sooner. <a href="biodata.html">Browse helpers by type</a>.'
    },
    {
      q: "What is the placement fee?",
      keys: ["placement", "loan", "salary deduction", "advance"],
      answer:
        "For fresh and experienced helpers, the placement fee is an advance paid on the helper's behalf " +
        "and recovered through her monthly salary over 2–6 months, so it is not ultimately borne by the employer. " +
        "Transfer helpers have <b>no placement fee</b>."
    },
    {
      q: "How does hiring work?",
      keys: ["how", "process", "steps", "hire", "hiring", "start", "get started", "procedure", "long"],
      answer:
        "1. Tell us your needs (childcare, eldercare, cooking, pets)<br>" +
        "2. Shortlist helper biodata<br>" +
        "3. Interview your shortlisted helpers<br>" +
        "4. We handle the work permit, medical and insurance<br>" +
        "5. Free doorstep handover to your home<br>" +
        'More in our <a href="guide.html">Employer Guide</a>.'
    },
    {
      q: "Free replacement?",
      keys: ["replace", "replacement", "not suitable", "change helper", "guarantee"],
      answer:
        "If the match isn't right, we provide a <b>free replacement within 12 months</b>. " +
        '<a href="' + WA_URL + '" target="_blank" rel="noopener">WhatsApp us</a> for the full terms.'
    },
    {
      q: "Doorstep handover?",
      keys: ["handover", "doorstep", "deliver", "bring", "send helper"],
      answer: "We bring your new helper to your home, <b>free of charge</b>, so she can settle in from day one."
    },
    {
      q: "See available helpers",
      keys: ["helper", "helpers", "biodata", "profile", "available", "maid", "myanmar", "see", "view", "browse"],
      answer:
        'Browse our <a href="biodata.html">helper biodata</a> and filter by type, nationality and skills. ' +
        "Biodata is shared with the helper's consent; contact us for full details."
    },
    {
      q: "Talk to a person",
      keys: ["contact", "talk", "call", "whatsapp", "email", "phone", "person", "human", "agent", "speak"],
      answer: CONTACT_HTML
    }
  ];

  var FALLBACK =
    "Sorry, I don't have an answer for that yet. Our team will be happy to help. " + CONTACT_HTML;

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // Build UI
  var launcher = el("button", "kb-launcher");
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open chat: questions about hiring a helper");
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
    '<span class="kb-launcher-label">Questions?</span>';

  var panel = el("div", "kb-panel");
  panel.id = "kb-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Kin Domestic help chat");
  panel.hidden = true;
  launcher.setAttribute("aria-controls", "kb-panel");

  var head = el("div", "kb-head",
    '<div><strong>Kin Domestic</strong><span>Quick answers · Care that feels like kin</span></div>');
  var close = el("button", "kb-close", "&times;");
  close.type = "button";
  close.setAttribute("aria-label", "Close chat");
  head.appendChild(close);

  var log = el("div", "kb-log");
  log.setAttribute("aria-live", "polite");
  var chips = el("div", "kb-chips");
  var form = el("form", "kb-form");
  var input = el("input");
  input.type = "text";
  input.placeholder = "Type a question…";
  input.setAttribute("aria-label", "Type a question");
  input.maxLength = 200;
  var send = el("button", "kb-send", "Send");
  send.type = "submit";
  form.appendChild(input);
  form.appendChild(send);

  panel.appendChild(head);
  panel.appendChild(log);
  panel.appendChild(chips);
  panel.appendChild(form);
  document.body.appendChild(panel);
  document.body.appendChild(launcher);

  function addBot(html) {
    var m = el("div", "kb-msg kb-bot", html);
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
  }

  function addUser(text) {
    var m = el("div", "kb-msg kb-user");
    m.textContent = text; // visitor text is never treated as HTML
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
  }

  TOPICS.forEach(function (t) {
    var b = el("button", "kb-chip");
    b.type = "button";
    b.textContent = t.q;
    b.addEventListener("click", function () {
      addUser(t.q);
      addBot(t.answer);
    });
    chips.appendChild(b);
  });

  function match(text) {
    var s = " " + text.toLowerCase().replace(/[^a-z0-9$ ]/g, " ").replace(/\s+/g, " ") + " ";
    var best = null, bestScore = 0;
    TOPICS.forEach(function (t) {
      var score = 0;
      t.keys.forEach(function (k) {
        if (s.indexOf(" " + k + " ") !== -1 || (k.length > 4 && s.indexOf(k) !== -1)) score += k.length > 4 ? 2 : 1;
      });
      if (score > bestScore) { best = t; bestScore = score; }
    });
    return best;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    addUser(text);
    input.value = "";
    var t = match(text);
    addBot(t ? t.answer : FALLBACK);
  });

  var greeted = false;
  function open() {
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    launcher.classList.add("kb-open");
    if (!greeted) {
      addBot("Hi! 👋 I can answer common questions about hiring a helper. Tap a question below or type your own.");
      greeted = true;
    }
    input.focus();
  }
  function shut() {
    panel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    launcher.classList.remove("kb-open");
    launcher.focus();
  }

  launcher.addEventListener("click", function () { panel.hidden ? open() : shut(); });
  close.addEventListener("click", shut);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden) shut();
  });
})();
