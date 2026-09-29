# Kin Domestic Pte. Ltd. – Website

Static website for Kin Domestic Pte. Ltd. No build step; plain HTML, CSS and JavaScript.

## Structure

| Path | Purpose |
| --- | --- |
| `index.html` | Home page |
| `about.html` | About Us |
| `fees.html` | Fees & Packages (Myanmar fresh/experienced and local transfer) |
| `guide.html` | Employer Guide: hiring process and FAQ |
| `contact.html` | Contact (WhatsApp, email) |
| `enquire.html` | Enquiry form: embedded Zoho Form (hellokindo1 / KinDomesticEnquiry); submissions are emailed to hello@kindomestic.com by Zoho |
| `biodata.html` | Filterable grid of available helpers; accepts `?type=`, `?nationality=` and `?skill=` to pre-select filters |
| `helper.html` | Single helper profile, loaded via `helper.html?id=<id>` |
| `data/helpers.json` | Helper biodata (the only file to edit when adding/removing helpers) |
| `images/helpers/` | Helper photos (`placeholder.svg` is used by the sample entries) |
| `images/logo.png`, `images/logo-light.png`, `images/hero.jpg` | Logo (for light backgrounds), light logo (for dark backgrounds such as the footer) and home page photo |
| `videos/helpers/` | Optional helper introduction videos (MP4, under 20 MB) |
| `docs/helper-profile-checklist.md` | What to provide when adding a helper |
| `css/styles.css` | Site styles (brand colours: plum `#824C4C`, dusty rose `#A77B7C`, blush `#E8C8C0`, cream `#FDF6F1`, rust `#B5533C`) |
| `js/config.js` | Site settings: **WhatsApp number**, **email** and data file path |
| `js/site.js` | Mobile menu toggle (all pages) |
| `js/zoho-embed.js` | Auto-resizes the embedded Zoho form |
| `js/chatbot.js` | FAQ chat bubble on every page (no AI; answers are in the `TOPICS` list at the top of the file) |
| `js/helpers-common.js`, `js/biodata.js`, `js/helper.js` | Biodata page scripts |
| `sitemap.xml` | Sitemap for https://www.kindomestic.com |
| `CNAME` | Custom domain for GitHub Pages (`www.kindomestic.com`) |

## Hosting

Hosted on GitHub Pages with the custom domain `www.kindomestic.com` (set by the `CNAME` file).
DNS is managed at GoDaddy:

| Type | Name | Value |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | kelulut94.github.io |

## Running locally

Every page shares the same header and footer; when changing the menu, contact number or footer, update all `.html` files.
After changing CSS or JS, bump the `?v=` number on the `<link>`/`<script>` tags so browsers load the new version.

The biodata pages load `data/helpers.json` with `fetch`, which browsers block for `file://` URLs.
Serve the folder over HTTP instead:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/biodata.html
```

## Helper biodata

### Listing page (`biodata.html`)

- Shows only helpers whose `status` is `"available"`. Helpers marked `"reserved"` or `"placed"` are hidden.
- Filters: type (fresh / transfer / experienced), nationality (built from the data), and skills
  (childcare, eldercare, cooking, pets). Ticking several skills shows helpers who have all of them.
  A skill matches if it is in `keySkills`, or its `skills` entry is anything other than "Willing to learn" or "No…".
- If no helpers are available, a friendly "no helpers currently available" message is shown.
- Each card shows photo, helper ID, first name, age, nationality, type and the first 3 `keySkills`, and links to `helper.html?id=<id>`.

### Profile page (`helper.html`)

Shows photo, basic particulars, work experience, skills, languages, preferences, availability and
agency remarks. The **Enquire about this helper** button opens WhatsApp with a pre-filled message
containing the helper ID. The button is only shown for available helpers; reserved/placed profiles
show a status notice instead.

Both pages display: *"Biodata is shared with the helper's consent. Contact us for full details."*

### Before going live

1. Replace the three `SAMPLE-00x` entries in `data/helpers.json` with real, consented profiles.

The agency WhatsApp number (+65 9375 7030) and email (hello@kindomestic.com) are set in `js/config.js` and also appear in the header/footer of every page.

### Adding a helper

Add an object to the `helpers` array in `data/helpers.json`:

```json
{
  "id": "KD-0001",
  "status": "available",
  "firstName": "Ana",
  "age": 29,
  "nationality": "Philippines",
  "type": "experienced",
  "photo": "images/helpers/KD-0001.jpg",
  "keySkills": ["childcare", "cooking", "housekeeping"],
  "particulars": { "height": "", "weight": "", "religion": "", "maritalStatus": "", "children": 0, "education": "" },
  "experience": [{ "country": "", "years": "", "duties": "" }],
  "skills": { "childcare": "", "eldercare": "", "cooking": "", "pets": "", "housekeeping": "" },
  "languages": [""],
  "preferences": { "restDays": "", "handleDogs": true, "handleCats": true, "otherNotes": "" },
  "availability": "",
  "remarks": ""
}
```

- `video` (optional): a local MP4 such as `"videos/helpers/KD-0001.mp4"`, or a YouTube link (use "Unlisted"). Shows an
  "Introduction video" section on the profile and a "▶ Video" badge on the card.
- `status`: `available` | `reserved` | `placed`
- `type`: `fresh` | `transfer` | `experienced`
- Store **age only**, not date of birth.

### Privacy: never publish these

Everything in `data/helpers.json` is public. **Do not** add any of the following to the data, the pages, or photos:

- Passport number
- FIN
- Work permit number
- Exact date of birth
- Home or employer addresses
- Personal contact details (phone, email, social media)

Only publish biodata with the helper's consent.
