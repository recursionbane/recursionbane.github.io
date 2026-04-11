// TIMEMACHINE — fetches a Wikipedia summary + a background image for the
// user's era query, and offers a Britannica search link.

const form     = document.getElementById('travel-form');
const queryEl  = document.getElementById('query');
const result   = document.getElementById('result');
const titleEl  = document.getElementById('title');
const extract  = document.getElementById('extract');
const britLink = document.getElementById('britannica');
const wikiLink = document.getElementById('wiki');
const credit   = document.getElementById('credit');
const errBox   = document.getElementById('error');
const errMsg   = document.getElementById('error-msg');
const loading  = document.getElementById('loading');
const bg       = document.getElementById('bg');

const WIKI_API = 'https://en.wikipedia.org/api/rest_v1';
const WIKI_W   = 'https://en.wikipedia.org/w/api.php';

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = queryEl.value.trim();
  if (!q) return;
  await travel(q);
});

async function travel(q) {
  showLoading();
  try {
    // 1. Resolve the query to a real Wikipedia title via the search endpoint.
    const title = await resolveTitle(q);
    if (!title) throw new Error(`No Wikipedia entry found for "${q}".`);

    // 2. Fetch the page summary (extract + thumbnail/originalimage).
    const summary = await fetchSummary(title);

    // 3. Try to find a richer background image (prefer paintings/historical art).
    const imageUrl = await findBackgroundImage(title, summary);

    render(q, summary, imageUrl);
  } catch (err) {
    showError(err.message || String(err));
  }
}

async function resolveTitle(q) {
  const url = `${WIKI_W}?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&origin=*&srlimit=1`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Wikipedia search failed.');
  const j = await r.json();
  const hit = j?.query?.search?.[0];
  return hit ? hit.title : null;
}

async function fetchSummary(title) {
  const url = `${WIKI_API}/page/summary/${encodeURIComponent(title)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Could not load Wikipedia summary.');
  return r.json();
}

// Try to grab a more atmospheric image: page images endpoint returns several
// candidates; we prefer files that look like paintings/photos over icons.
async function findBackgroundImage(title, summary) {
  try {
    const url = `${WIKI_W}?action=query&prop=images&titles=${encodeURIComponent(title)}&format=json&origin=*&imlimit=30`;
    const r = await fetch(url);
    if (r.ok) {
      const j = await r.json();
      const pages = j?.query?.pages || {};
      const first = Object.values(pages)[0];
      const files = (first?.images || [])
        .map(i => i.title)
        .filter(t =>
          /\.(jpe?g|png)$/i.test(t) &&
          !/\b(icon|logo|flag|coat[_ ]of[_ ]arms|map|locator|symbol|wiki|commons|edit|disambig)/i.test(t)
        );

      for (const f of files.slice(0, 6)) {
        const direct = await commonsImageUrl(f);
        if (direct) return direct;
      }
    }
  } catch (_) { /* fall through */ }

  // Fallback to the summary's own image.
  return summary?.originalimage?.source || summary?.thumbnail?.source || null;
}

async function commonsImageUrl(fileTitle) {
  const url = `${WIKI_W}?action=query&titles=${encodeURIComponent(fileTitle)}&prop=imageinfo&iiprop=url|size&iiurlwidth=1920&format=json&origin=*`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  const pages = j?.query?.pages || {};
  const info = Object.values(pages)[0]?.imageinfo?.[0];
  if (!info) return null;
  // Skip tiny / square icons.
  if (info.width && info.width < 600) return null;
  return info.thumburl || info.url;
}

function render(originalQuery, summary, imageUrl) {
  hideLoading();
  errBox.hidden = true;
  result.hidden = false;

  titleEl.textContent = summary.title || originalQuery;
  extract.textContent = summary.extract || 'No summary available.';

  britLink.href = `https://www.britannica.com/search?query=${encodeURIComponent(originalQuery)}`;
  wikiLink.href = summary.content_urls?.desktop?.page
    || `https://en.wikipedia.org/wiki/${encodeURIComponent(summary.title || originalQuery)}`;

  if (imageUrl) {
    // Preload before swapping so the transition is clean.
    const img = new Image();
    img.onload = () => { bg.style.backgroundImage = `url("${imageUrl}")`; };
    img.src = imageUrl;
    credit.textContent = 'Background: Wikimedia Commons.';
  } else {
    bg.style.backgroundImage = '';
    credit.textContent = '';
  }

  // Re-trigger the rise animation on subsequent travels.
  const card = result.querySelector('.card');
  card.style.animation = 'none';
  void card.offsetWidth;
  card.style.animation = '';
}

function showLoading() {
  errBox.hidden = true;
  result.hidden = true;
  loading.hidden = false;
}
function hideLoading() { loading.hidden = true; }

function showError(msg) {
  hideLoading();
  result.hidden = true;
  errBox.hidden = false;
  errMsg.textContent = msg;
}
