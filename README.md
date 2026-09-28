# Kin Domestic Pte. Ltd. – Website

Static website for Kin Domestic Pte. Ltd. No build step; plain HTML, CSS and JavaScript.

## Structure

| Path | Purpose |
| --- | --- |
| `index.html` | Home page |
| `biodata.html` | Filterable grid of available helpers |
| `helper.html` | Single helper profile, loaded via `helper.html?id=<id>` |
| `data/helpers.json` | Helper biodata (the only file to edit when adding/removing helpers) |
| `images/helpers/` | Helper photos (`placeholder.svg` is used by the sample entries) |
| `css/styles.css` | Site styles |
| `js/config.js` | Site settings: **WhatsApp number** and data file path |
| `js/helpers-common.js`, `js/biodata.js`, `js/helper.js` | Page scripts |
| `sitemap.xml` | Sitemap (replace `https://www.example.com` with the live domain) |

## Running locally

The pages load `data/helpers.json` with `fetch`, which browsers block for `file://` URLs.
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

1. Set the agency's WhatsApp number in `js/config.js` (digits only, with country code, e.g. `6591234567`).
2. Replace the three `SAMPLE-00x` entries in `data/helpers.json` with real, consented profiles.
3. Update the domain in `sitemap.xml`.

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
