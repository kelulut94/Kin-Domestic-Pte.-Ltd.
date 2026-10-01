const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const multer = require("multer");
const { html, raw, csrfField, options, statusBadge, photoUrl } = require("../views");
const { requireRole, checkCsrf } = require("../auth");
const { SKILLS, NATIONALITIES, HELPER_TYPES, MARITAL_STATUSES } = require("../constants");
const { getProfile, cleanProfileInput, missingForSubmit, parseSkillsSafe } = require("../models");
const { profileDetail } = require("../profileView");

// Detect image type from the file contents, not the client-supplied name or MIME type.
function imageExt(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

const CONTENT_TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

module.exports = function helperRoutes(app, { db, cfg }) {
  const guard = requireRole("helper");
  fs.mkdirSync(cfg.uploadDir, { recursive: true });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 5 } });

  app.get("/me", guard, (req, res) => {
    const p = getProfile(db, req.user.id);
    const views = db.prepare("SELECT COUNT(*) AS n FROM profile_views WHERE helper_id = ? AND viewed_at > ?")
      .get(req.user.id, Date.now() - 30 * 86400000).n;
    const missing = missingForSubmit(p);
    let action = "";
    if (p.status === "draft" || p.status === "rejected") {
      action = missing.length
        ? html`<p>To submit your profile, add: <b>${missing.join(", ")}</b>.</p>
               <a class="btn" href="/me/profile">Complete my profile</a>`
        : html`<form method="post" action="/me/profile/submit">${csrfField(req)}
                 <button class="btn">Submit profile for review</button></form>`;
    } else if (p.status === "pending") {
      action = html`<p>Our team is reviewing your profile. This usually takes one working day.</p>`;
    } else {
      const hide = p.status === "approved";
      action = html`
        <form method="post" action="/me/profile/visibility" class="inline">${csrfField(req)}
          <input type="hidden" name="visible" value="${hide ? "0" : "1"}">
          <button class="btn ${hide ? "btn-ghost" : ""}">${hide ? "Hide my profile" : "Show my profile again"}</button>
        </form>`;
    }
    res.page("My profile", html`
      <h1>Hello, ${p.first_name || req.user.name}</h1>
      <div class="card">
        <p>Profile status: ${statusBadge(p.status)}</p>
        ${p.status === "rejected" && p.review_note ? html`<p class="notice">Note from our team: ${p.review_note}</p>` : ""}
        ${p.status === "approved" ? html`<p><b>${views}</b> agencies viewed your profile in the last 30 days.</p>` : ""}
        ${action}
      </div>
      <p><a href="/me/profile">Edit my profile</a> &middot; <a href="/messages">My messages</a></p>
      <h2>Preview</h2>
      <div class="card">${profileDetail(p, { full: true, showPhone: true })}</div>`);
  });

  app.get("/me/profile", guard, (req, res) => {
    const p = getProfile(db, req.user.id);
    const skills = parseSkillsSafe(p.skills);
    res.page("Edit profile", html`
      <h1>Edit my profile</h1>
      <p class="muted">Do not include your passport number, FIN, work permit number, date of birth or home address.</p>

      <h2>Photo</h2>
      <div class="photo-row">
        <img src="${photoUrl(p)}" alt="" width="120" height="120">
        <form method="post" action="/me/profile/photo" enctype="multipart/form-data" class="form">
          ${csrfField(req)}
          <label>Upload a clear, recent photo of your face (JPG, PNG or WebP, up to 3 MB)
            <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required></label>
          <button class="btn btn-sm">Upload photo</button>
        </form>
      </div>

      <form method="post" action="/me/profile" class="form grid">
        ${csrfField(req)}
        <h2 class="full">About you</h2>
        <label>First name<input name="first_name" required maxlength="60" value="${p.first_name}"></label>
        <label>Age<input type="number" name="age" min="18" max="65" required value="${p.age}"></label>
        <label>Nationality<select name="nationality" required><option value="">Choose…</option>
          ${options(NATIONALITIES.map((n) => [n, n]), p.nationality)}</select></label>
        <label>Helper type<select name="helper_type" required><option value="">Choose…</option>
          ${options(Object.entries(HELPER_TYPES), p.helper_type)}</select></label>
        <label>Country you are in now<input name="location" maxlength="80" value="${p.location}"></label>
        <label>Languages<input name="languages" maxlength="200" placeholder="e.g. English (basic), Burmese" value="${p.languages}"></label>
        <label>Education<input name="education" maxlength="100" value="${p.education}"></label>
        <label>Religion<input name="religion" maxlength="60" value="${p.religion}"></label>
        <label>Marital status<select name="marital_status"><option value="">Choose…</option>
          ${options(MARITAL_STATUSES.map((m) => [m, m]), p.marital_status)}</select></label>
        <label>Number of children<input type="number" name="children" min="0" max="20" value="${p.children}"></label>
        <label>Height (cm)<input type="number" name="height_cm" min="100" max="220" value="${p.height_cm}"></label>
        <label>Weight (kg)<input type="number" name="weight_kg" min="30" max="200" value="${p.weight_kg}"></label>

        <fieldset class="full"><legend>Skills</legend>
          ${Object.entries(SKILLS).map(([k, label]) => html`
            <label class="check"><input type="checkbox" name="skills" value="${k}"${skills.includes(k) ? raw(" checked") : ""}> ${label}</label>`)}
        </fieldset>

        <h2 class="full">Work</h2>
        <label>Years of work experience<input type="number" name="years_experience" min="0" max="50" value="${p.years_experience}"></label>
        <label>Expected salary (S$ / month)<input type="number" name="expected_salary" min="0" max="100000" value="${p.expected_salary}"></label>
        <label>Available from<input type="date" name="available_from" value="${p.available_from}"></label>
        <label>Rest days wanted<input name="rest_days" maxlength="60" placeholder="e.g. 4 per month" value="${p.rest_days}"></label>
        <label class="full">Work experience <span class="muted">(country, years, duties)</span>
          <textarea name="experience" rows="5" maxlength="3000">${p.experience}</textarea></label>
        <label class="full">Introduce yourself
          <textarea name="about" rows="4" maxlength="2000">${p.about}</textarea></label>

        <h2 class="full">Contact</h2>
        <label>Phone / WhatsApp<input name="phone" maxlength="30" value="${p.phone}"></label>
        <label class="check"><input type="checkbox" name="share_phone" value="1"${p.share_phone ? raw(" checked") : ""}>
          Show my phone number to verified, subscribed agencies</label>

        <div class="full"><button class="btn">Save profile</button></div>
      </form>`);
  });

  app.post("/me/profile", guard, (req, res) => {
    const v = cleanProfileInput(req.body);
    if (!v.first_name) {
      res.flash("First name is required.", "error");
      return res.redirect("/me/profile");
    }
    db.prepare(`UPDATE helper_profiles SET
      first_name = ?, age = ?, nationality = ?, helper_type = ?, location = ?, skills = ?, languages = ?,
      education = ?, religion = ?, marital_status = ?, children = ?, height_cm = ?, weight_kg = ?,
      years_experience = ?, experience = ?, expected_salary = ?, available_from = ?, rest_days = ?,
      about = ?, phone = ?, share_phone = ?, updated_at = ?
      WHERE user_id = ?`).run(
      v.first_name, v.age, v.nationality, v.helper_type, v.location, v.skills, v.languages,
      v.education, v.religion, v.marital_status, v.children, v.height_cm, v.weight_kg,
      v.years_experience, v.experience, v.expected_salary, v.available_from, v.rest_days,
      v.about, v.phone, v.share_phone, Date.now(), req.user.id);
    res.flash("Profile saved.", "success");
    res.redirect("/me");
  });

  app.post("/me/profile/photo", guard, (req, res, next) => {
    upload.single("photo")(req, res, (err) => {
      if (err) {
        res.flash(err.code === "LIMIT_FILE_SIZE" ? "Photo must be 3 MB or smaller." : "Upload failed. Please try again.", "error");
        return res.redirect("/me/profile");
      }
      checkCsrf(req, res, () => {
        const ext = req.file && imageExt(req.file.buffer);
        if (!ext) {
          res.flash("Please upload a JPG, PNG or WebP photo.", "error");
          return res.redirect("/me/profile");
        }
        const name = `${req.user.id}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
        try {
          fs.writeFileSync(path.join(cfg.uploadDir, name), req.file.buffer);
        } catch (e) {
          return next(e);
        }
        const old = db.prepare("SELECT photo FROM helper_profiles WHERE user_id = ?").get(req.user.id).photo;
        db.prepare("UPDATE helper_profiles SET photo = ?, updated_at = ? WHERE user_id = ?").run(name, Date.now(), req.user.id);
        if (old) fs.rm(path.join(cfg.uploadDir, path.basename(old)), { force: true }, () => {});
        res.flash("Photo updated.", "success");
        res.redirect("/me/profile");
      });
    });
  });

  app.post("/me/profile/submit", guard, (req, res) => {
    const p = getProfile(db, req.user.id);
    const missing = missingForSubmit(p);
    if (!["draft", "rejected"].includes(p.status)) return res.redirect("/me");
    if (missing.length) {
      res.flash(`Please add: ${missing.join(", ")}.`, "error");
      return res.redirect("/me/profile");
    }
    db.prepare("UPDATE helper_profiles SET status = 'pending', updated_at = ? WHERE user_id = ?").run(Date.now(), req.user.id);
    res.flash("Thank you! Your profile has been sent for review.", "success");
    res.redirect("/me");
  });

  app.post("/me/profile/visibility", guard, (req, res) => {
    const [from, to] = req.body.visible === "1" ? ["hidden", "approved"] : ["approved", "hidden"];
    db.prepare("UPDATE helper_profiles SET status = ? WHERE user_id = ? AND status = ?").run(to, req.user.id, from);
    res.flash(to === "hidden" ? "Your profile is hidden from agencies." : "Your profile is visible again.", "success");
    res.redirect("/me");
  });

  // Photos: owner and admins always; agencies only for live profiles.
  app.get("/photos/:id", requireRole("helper", "agency", "admin"), (req, res) => {
    const id = Number(req.params.id);
    const p = db.prepare("SELECT user_id, photo, status FROM helper_profiles WHERE user_id = ?").get(id);
    const allowed = p && p.photo && (
      req.user.role === "admin" || req.user.id === id || (req.user.role === "agency" && p.status === "approved"));
    if (!allowed) return res.status(404).end();
    const file = path.join(cfg.uploadDir, path.basename(p.photo));
    const ext = path.extname(file).slice(1);
    res.set({ "Cache-Control": "private, max-age=86400", "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream" });
    res.sendFile(file, (err) => { if (err && !res.headersSent) res.status(404).end(); });
  });
};
