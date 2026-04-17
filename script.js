/*
  ============================================================================
  Project 5 APIs: NASA Space Dashboard
  ============================================================================

  This script powers the NASA dashboard by:
  1) requesting data from NASA-related APIs with the browser's built-in fetch()
  2) caching successful responses in localStorage to reduce repeat API calls
  3) rendering the returned JSON into accessible HTML panels
  4) lazy-loading the heavier gallery panels so we do not spend requests up front
  5) animating panels/cards with Popmotion, with a CSS fallback if Popmotion fails

  - fetch():
    The assignment slides emphasize browser-native network requests and AJAX.
    fetch() is built into modern browsers, so it matches the course material and
    avoids bringing in axios when CORS / browser fetch behavior are the focus.

  - NASA APOD + NEO endpoints:
    These are direct NASA API endpoints that return current JSON data and fit the
    assignment requirement of displaying API data on the page.

  - NASA Image and Video Library for Mars and Moon:
    The older Mars rover endpoint can be less reliable for this project, while the
    NASA image library is a good fit for media galleries and does not consume the
    same key-gated quota in the same way as api.nasa.gov endpoints.

  - localStorage caching:
    NASA's DEMO_KEY rate-limits quickly. Even with a personal key, caching helps
    make the page faster, reduces redundant requests, and demonstrates a useful
    browser feature discussed in class.

  - IntersectionObserver lazy loading:
    Mars and Moon galleries are not needed the instant the page boots. Delaying
    those requests until the panels are near the viewport reduces waste.

  - Popmotion stagger / tween / composite / framesync:
    These APIs let us demonstrate a unique animation library from the assignment.
    We use staggered entrance animations so the panels and cards arrive in a
    readable sequence instead of appearing all at once.

  IMPORTANT RUNTIME NOTE
  ----------------------------------------------------------------------------
  Run this through a local web server such as:
    python -m http.server 8000
  Then open:
    http://localhost:8000/

  Opening the page with file:// can cause fetch-related failures or confusing
  browser security behavior during development.
*/
(function () {
  'use strict';

  const API_KEY = 'pNPnqIIfr0LL3p92BAFKJUpkSf8RT4wlJgvhIVO8';

  /*
   detect whether the page is being opened as file:// 
  */
  const IS_FILE_PROTOCOL = window.location.protocol === 'file:';

  /*
    CONFIGURATION
    --------------------------------------------------------------------------
    These values centralize settings that may need tuning later

    TTL means "time to live" for cached data in milliseconds.
    For APOD and NEO, one day is a reasonable cache duration because those data
    sets are date-oriented and do not need to be re-fetched every refresh.
  */
  const CONFIG = {
    apodTtlMs: 24 * 60 * 60 * 1000,
    neoTtlMs: 24 * 60 * 60 * 1000,
    marsTtlMs: 24 * 60 * 60 * 1000,
    moonTtlMs: 24 * 60 * 60 * 1000,
    lazyRootMargin: '150px 0px',
    galleryLimit: 8
  };

  /*
    ENDPOINTS
    --------------------------------------------------------------------------
    - apod: direct NASA endpoint for a featured daily astronomy item
    - neoBase: direct NASA endpoint for near-earth-object JSON data
    - marsLibrary: NASA image search for Mars rover media cards
    - moonLibrary: NASA image search for lunar / moon rover media cards

     Mars and Moon are kept on the media search API because that API fits a card gallery design and reduces strain on the key-gated NASA
    endpoints that are more likely to rate-limit
  */
  const ENDPOINTS = {
    apod: `https://api.nasa.gov/planetary/apod?api_key=${API_KEY}`,
    neoBase: `https://api.nasa.gov/neo/rest/v1/feed?api_key=${API_KEY}`,
    marsLibrary: 'https://images-api.nasa.gov/search?q=mars%20rover&media_type=image',
    moonLibrary: 'https://images-api.nasa.gov/search?q=lunar%20rover&media_type=image'
  };

  /*
    PANEL LOAD TRACKING
    --------------------------------------------------------------------------
    Mars and Moon are lazy-loaded. These booleans prevent duplicate fetches.
  */
  const panelLoadState = { mars: false, moon: false };

  /*
    DOM HELPERS
    --------------------------------------------------------------------------
    These small helpers reduce repeated selector strings throughout the file.
  */
  function getPanel(panelId) {
    return document.getElementById(`panel-${panelId}`);
  }

  function getContent(panelId) {
    return document.querySelector(`#panel-${panelId} .panel__content`);
  }

  /*
    PANEL STATE HELPERS
    --------------------------------------------------------------------------
    - CSS can react to loading / ready / error without extra class juggling
    - visual state stays in sync with the panel markup
    - the code becomes easier to debug in DevTools

    three states:
    - loading: show the spinner, hide content and old error text
    - ready: show the content, hide the spinner
    - error: show the error box, hide the content and spinner
  */
  function showLoader(panelId) {
    const panel = getPanel(panelId);
    if (!panel) return;
    panel.setAttribute('data-state', 'loading');

    const errorElement = panel.querySelector('.panel__error');
    if (errorElement) {
      errorElement.textContent = '';
      errorElement.hidden = true;
    }
  }

  function hideLoader(panelId) {
    const panel = getPanel(panelId);
    if (!panel) return;
    panel.setAttribute('data-state', 'ready');
  }

  function showError(panelId, message) {
    const panel = getPanel(panelId);
    if (!panel) return;
    panel.setAttribute('data-state', 'error');

    const errorElement = panel.querySelector('.panel__error');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.hidden = false;
    }
  }

  /*
    FORMATTERS / TEXT UTILITIES
    --------------------------------------------------------------------------
    These keep the render functions cleaner.

    - formatDate(): converts ISO strings into readable month/day/year text
    - escapeHtml(): defensive utility for innerHTML template insertion
    - truncateText(): keeps gallery cards compact and readable
  */
  function formatDate(isoString) {
    if (!isoString) return 'Unknown date';

    try {
      const safeString = isoString.length === 10 ? `${isoString}T00:00:00` : isoString;
      const date = new Date(safeString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return isoString;
    }
  }

  function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function truncateText(text, maxLength) {
    const clean = String(text || '').trim();
    if (clean.length <= maxLength) return clean;
    return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
  }

  /*
    CACHE UTILITIES
    --------------------------------------------------------------------------
    - reduces repeated API traffic
    - speeds up reloads
    - helps recover from temporary 429 rate limits by using stale data
    - demonstrates localStorage, which is one of the browser features mentioned
      in the course slide deck

  */
  function cacheKeyFor(prefix, suffix) {
    return `nasa-dashboard:${prefix}:${suffix}`;
  }

  function readCache(key, ttlMs) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (Date.now() - parsed.timestamp > ttlMs) return null;

      return parsed.data;
    } catch (error) {
      return null;
    }
  }

  function readStaleCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.data ?? null;
    } catch (error) {
      return null;
    }
  }

  function writeCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
    } catch (error) {
      console.warn('Cache write failed:', key, error);
    }
  }

  /*
    FOOTER STATUS / RATE LIMIT FEEDBACK
    --------------------------------------------------------------------------
    Status text makes it easier to understand whether the page is using a custom key, cached data, or
    has very little quota remaining
  */
  function setFooterStatus(message) {
    const statusEl = document.getElementById('api-status');
    if (statusEl) statusEl.textContent = message;
  }

  function logRateLimitHeaders(response) {
    const limit = response.headers.get('X-RateLimit-Limit');
    const remaining = response.headers.get('X-RateLimit-Remaining');

    if (!limit && !remaining) return;

    if (remaining) {
      setFooterStatus(`NASA API remaining quota: ${remaining}${limit ? ` / ${limit}` : ''}`);
    }
  }

  /*
    fetchJsonWithCache()
    --------------------------------------------------------------------------
    This is the core fetch helper for the project.

    - fetch() is the browser-native network API
    - the course slides specifically discuss fetch and promises/AJAX
    - the project instructions say not to use axios as a CORS workaround

    What's Happening:
    1) checks localStorage for a fresh cached copy first
    2) if not cached, performs a network fetch
    3) logs rate-limit headers when NASA exposes them
    4) if NASA returns 429 and we have stale cache, uses stale cache as fallback
    5) stores successful JSON in cache for next time

    RETURN FORMAT
    Return both the data and a source label (cache/network/stale-cache) so the
    UI can explain where the visible data came from.
  */
  async function fetchJsonWithCache({ url, cacheKey, ttlMs }) {
    const freshCache = readCache(cacheKey, ttlMs);
    if (freshCache) {
      return { data: freshCache, source: 'cache' };
    }

    const response = await fetch(url);
    logRateLimitHeaders(response);

    if (response.status === 429) {
      const staleCache = readStaleCache(cacheKey);
      if (staleCache) {
        return { data: staleCache, source: 'stale-cache' };
      }
      throw new Error('HTTP 429: Too Many Requests');
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    writeCache(cacheKey, data);
    return { data, source: 'network' };
  }

  function describeSource(source) {
    if (source === 'cache') return 'Loaded from local cache.';
    if (source === 'stale-cache') return 'NASA rate limit hit; showing cached data.';
    return 'Loaded live from NASA.';
  }

  function annotatePanelSource(panelId, source) {
    const panel = getPanel(panelId);
    if (!panel) return;

    let sourceNote = panel.querySelector('.panel__source-note');
    if (!sourceNote) {
      sourceNote = document.createElement('p');
      sourceNote.className = 'panel__source-note';
      panel.appendChild(sourceNote);
    }

    sourceNote.textContent = describeSource(source);
  }

  /*
    ERROR MESSAGE BUILDER
    --------------------------------------------------------------------------
    API errors can look identical to non-technical users. This helper turns them
    into more actionable messages based on likely causes.
  */
  function readableFailureHint(baseMessage) {
    if (IS_FILE_PROTOCOL) {
      return `${baseMessage} Open the project through localhost instead of file://.`;
    }

    return `${baseMessage} Check the browser console and network tab for the exact response.`;
  }

  /*
    APOD PANEL
    --------------------------------------------------------------------------
    APOD is visually strong and returns a clear JSON shape that works well for a featured card layout.

    - requests today's APOD entry
    - caches by date
    - passes the result to renderAPOD()
    - updates the panel state and source note
  */
  async function fetchAPOD() {
    const panelId = 'apod';
    showLoader(panelId);

    try {
      const today = todayIsoDate();
      const url = `${ENDPOINTS.apod}&date=${today}`;
      const cacheKey = cacheKeyFor('apod', today);

      const { data, source } = await fetchJsonWithCache({
        url,
        cacheKey,
        ttlMs: CONFIG.apodTtlMs
      });

      renderAPOD(data);
      hideLoader(panelId);
      annotatePanelSource(panelId, source);
    } catch (error) {
      console.error('APOD fetch failed:', error);
      showError(panelId, readableFailureHint('Could not load Astronomy Picture of the Day.'));
    }
  }

  /*
    WHY renderAPOD() IS SEPARATE
    --------------------------------------------------------------------------
    Splitting fetch and render keeps concerns clean:
    - fetch function handles network/caching/errors
    - render function handles DOM creation and formatting

    The APOD API can return either an image or a video. both are supported by using
    a real <img> when the response is an image and a styled placeholder/link when
    the response is a video.
  */
  function renderAPOD(data) {
    const content = getContent('apod');
    if (!content) return;
    content.innerHTML = '';

    const mediaWrap = document.createElement('div');
    mediaWrap.className = 'hero-media';

    if (data.media_type === 'video') {
      mediaWrap.innerHTML = `
        <div class="media-placeholder">
          <div class="media-placeholder__icon" aria-hidden="true">🎬</div>
          <p><strong>${escapeHtml(data.title)}</strong></p>
          <p><a href="${escapeHtml(data.url)}" target="_blank" rel="noopener noreferrer">Open NASA video</a></p>
        </div>
      `;
    } else {
      const img = document.createElement('img');
      img.src = data.hdurl || data.url;
      img.alt = data.title || 'NASA Astronomy Picture of the Day';
      img.loading = 'lazy';
      img.className = 'feature-image';
      mediaWrap.appendChild(img);
    }

    const title = document.createElement('h3');
    title.textContent = data.title || 'Astronomy Picture of the Day';

    const meta = document.createElement('p');
    meta.className = 'panel-meta';
    meta.textContent = formatDate(data.date);

    const copy = document.createElement('p');
    copy.textContent = data.explanation || 'No description available.';

    content.appendChild(mediaWrap);
    content.appendChild(title);
    content.appendChild(meta);
    content.appendChild(copy);
  }

  /*
    MARS GALLERY PANEL
    --------------------------------------------------------------------------
    NASA's image search API is used to build a gallery of Mars rover-related media cards
  */
  async function fetchMars() {
    const panelId = 'mars';
    showLoader(panelId);

    try {
      const cacheKey = cacheKeyFor('mars', 'image-library-search');
      const { data, source } = await fetchJsonWithCache({
        url: ENDPOINTS.marsLibrary,
        cacheKey,
        ttlMs: CONFIG.marsTtlMs
      });

      const items = (data?.collection?.items || [])
        .filter((item) => item?.links?.[0]?.href && item?.data?.[0])
        .slice(0, CONFIG.galleryLimit);

      if (!items.length) {
        throw new Error('No Mars rover image-library results found.');
      }

      renderMars(items);
      hideLoader(panelId);
      annotatePanelSource(panelId, source);
    } catch (error) {
      console.error('Mars fetch failed:', error);
      showError(panelId, readableFailureHint('Could not load Mars rover imagery.'));
    }
  }

  function renderMars(items) {
    const content = getContent('mars');
    if (!content) return;
    content.innerHTML = '';

    const meta = document.createElement('p');
    meta.className = 'panel-meta';
    meta.textContent = 'NASA Image and Video Library search results for Mars rover imagery';
    content.appendChild(meta);

    const grid = document.createElement('div');
    grid.className = 'mission-grid';

    items.forEach((item) => {
      const metaData = item.data[0];
      const href = item.links[0].href;
      const link = metaData.nasa_id
        ? `https://images.nasa.gov/details-${encodeURIComponent(metaData.nasa_id)}`
        : '#';

      const card = document.createElement('article');
      card.className = 'mission-card';
      card.innerHTML = `
        <img src="${escapeHtml(href)}" alt="${escapeHtml(metaData.title || 'Mars rover image')}" loading="lazy">
        <div class="mission-card__body">
          <h3>${escapeHtml(truncateText(metaData.title || 'Mars rover image', 64))}</h3>
          <p>${escapeHtml(truncateText(metaData.description || 'NASA Mars rover media item.', 120))}</p>
          <p class="mission-card__meta">${escapeHtml(formatDate(metaData.date_created || ''))}</p>
          <p><a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Open on NASA</a></p>
        </div>
      `;
      grid.appendChild(card);
    });

    content.appendChild(grid);
    animateCardCollection(grid.querySelectorAll('.mission-card'));
  }

  /*
    NEO PANEL
    --------------------------------------------------------------------------
    WHY NEO?
    This gives the page a second true JSON/data-table style API instead of only
    image-based content. That helps show variety in API handling.

    NEO data is structured and comparative, so an HTML table is the clearest way
    to display names, diameters, hazard flags, and miss distances.
  */
  async function fetchNEO() {
    const panelId = 'neo';
    showLoader(panelId);

    try {
      const today = todayIsoDate();
      const cacheKey = cacheKeyFor('neo', today);
      const url = `${ENDPOINTS.neoBase}&start_date=${today}&end_date=${today}`;

      const { data, source } = await fetchJsonWithCache({
        url,
        cacheKey,
        ttlMs: CONFIG.neoTtlMs
      });

      const todayNeos = data?.near_earth_objects?.[today];
      if (!Array.isArray(todayNeos)) {
        throw new Error('No NEO data for today.');
      }

      renderNEO(todayNeos.slice(0, 10), data.element_count || todayNeos.length, today);
      hideLoader(panelId);
      annotatePanelSource(panelId, source);
    } catch (error) {
      console.error('NEO fetch failed:', error);
      showError(panelId, readableFailureHint('Could not load Near Earth Objects.'));
    }
  }

  function renderNEO(neos, totalCount, date) {
    const content = getContent('neo');
    if (!content) return;
    content.innerHTML = '';

    const count = document.createElement('p');
    count.className = 'panel-meta';
    count.textContent = `Detected for ${formatDate(date)}: ${totalCount} objects${totalCount > neos.length ? ` (showing ${neos.length})` : ''}`;
    content.appendChild(count);

    const table = document.createElement('table');
    table.className = 'neo-table';
    table.innerHTML = `
      <caption>Near Earth Objects for ${escapeHtml(formatDate(date))}</caption>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Diameter (km)</th>
          <th scope="col">Hazardous</th>
          <th scope="col">Miss Distance (km)</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');
    neos.forEach((neo) => {
      const min = neo?.estimated_diameter?.kilometers?.estimated_diameter_min;
      const max = neo?.estimated_diameter?.kilometers?.estimated_diameter_max;
      const missDistance = neo?.close_approach_data?.[0]?.miss_distance?.kilometers;

      const row = document.createElement('tr');
      if (neo.is_potentially_hazardous_asteroid) row.classList.add('hazardous');

      row.innerHTML = `
        <td>${escapeHtml(neo.name || 'Unknown')}</td>
        <td>${min && max ? `${Number(min).toFixed(2)} - ${Number(max).toFixed(2)}` : 'Unknown'}</td>
        <td>${neo.is_potentially_hazardous_asteroid ? 'Yes' : 'No'}</td>
        <td>${missDistance ? Number(missDistance).toLocaleString('en-US', { maximumFractionDigits: 0 }) : 'Unknown'}</td>
      `;
      tbody.appendChild(row);
    });

    content.appendChild(table);
  }

  /*
    MOON ROVER PANEL
    --------------------------------------------------------------------------
    Same as Mars Rover
  */
  async function fetchMoonRovers() {
    const panelId = 'moon';
    showLoader(panelId);

    try {
      const cacheKey = cacheKeyFor('moon', 'lunar-rover-media');
      const { data, source } = await fetchJsonWithCache({
        url: ENDPOINTS.moonLibrary,
        cacheKey,
        ttlMs: CONFIG.moonTtlMs
      });

      let items = data?.collection?.items || [];

      /*
        Fallback search
      */
      if (!items.length) {
        const fallback = await fetchJsonWithCache({
          url: 'https://images-api.nasa.gov/search?q=moon%20rover&media_type=image',
          cacheKey: cacheKeyFor('moon', 'moon-rover-media-fallback'),
          ttlMs: CONFIG.moonTtlMs
        });
        items = fallback.data?.collection?.items || [];
      }

      const filtered = items
        .filter((item) => item?.links?.[0]?.href && item?.data?.[0])
        .slice(0, CONFIG.galleryLimit);

      if (!filtered.length) {
        throw new Error('No lunar rover media results found.');
      }

      renderMoonRovers(filtered);
      hideLoader(panelId);
      annotatePanelSource(panelId, source);
    } catch (error) {
      console.error('Moon rover fetch failed:', error);
      showError(panelId, readableFailureHint('Could not load Moon rover media.'));
    }
  }

  function renderMoonRovers(items) {
    const content = getContent('moon');
    if (!content) return;
    content.innerHTML = '';

    const intro = document.createElement('p');
    intro.className = 'panel-meta';
    intro.textContent = 'NASA Image and Video Library results for lunar / moon rover imagery';
    content.appendChild(intro);

    const grid = document.createElement('div');
    grid.className = 'mission-grid';

    items.forEach((item) => {
      const meta = item.data[0];
      const href = item.links[0].href;
      const link = meta.nasa_id
        ? `https://images.nasa.gov/details-${encodeURIComponent(meta.nasa_id)}`
        : '#';

      const card = document.createElement('article');
      card.className = 'mission-card';
      card.innerHTML = `
        <img src="${escapeHtml(href)}" alt="${escapeHtml(meta.title || 'Moon rover media')}" loading="lazy">
        <div class="mission-card__body">
          <h3>${escapeHtml(truncateText(meta.title || 'Moon rover media', 64))}</h3>
          <p>${escapeHtml(truncateText(meta.description || 'NASA lunar rover media item.', 120))}</p>
          <p class="mission-card__meta">${escapeHtml(formatDate(meta.date_created || ''))}</p>
          <p><a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Open on NASA</a></p>
        </div>
      `;
      grid.appendChild(card);
    });

    content.appendChild(grid);
    animateCardCollection(grid.querySelectorAll('.mission-card'));
  }

  /*
    LAZY LOADING
    --------------------------------------------------------------------------
    IntersectionObserver
    - reduces unnecessary initial requests
    - improves page startup performance
    - keeps the assignment API demo efficient

    Mars and Moon are gallery-heavy panels, so they are ideal candidates for
    loading only when the user is near them.
  */
  function setupLazyPanelLoading() {
    if (!('IntersectionObserver' in window)) {
      if (!panelLoadState.mars) {
        panelLoadState.mars = true;
        fetchMars();
      }
      if (!panelLoadState.moon) {
        panelLoadState.moon = true;
        fetchMoonRovers();
      }
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        if (entry.target.id === 'panel-mars' && !panelLoadState.mars) {
          panelLoadState.mars = true;
          fetchMars();
          observer.unobserve(entry.target);
        }

        if (entry.target.id === 'panel-moon' && !panelLoadState.moon) {
          panelLoadState.moon = true;
          fetchMoonRovers();
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: CONFIG.lazyRootMargin });

    const marsPanel = getPanel('mars');
    const moonPanel = getPanel('moon');
    if (marsPanel) observer.observe(marsPanel);
    if (moonPanel) observer.observe(moonPanel);
  }

  /*
    PANEL / CARD ANIMATION ENTRY POINTS
    --------------------------------------------------------------------------
    The assignment requires a unique Popmotion animation on the page. A
    staggered entrance pattern is used because it is visually obvious and interactive:
    panels and cards fade/slide in one after another instead of popping in at once.

    There's a CSS fallback so the page remains usable even if the Popmotion
    CDN fails or the API surface differs.
  */
  function animatePanels() {
    const panels = Array.from(document.querySelectorAll('.panel'));
    if (!panels.length) return;

    panels.forEach((panel) => panel.classList.add('is-pre-animated'));

    if (!runPopmotionStagger(panels, 140)) {
      panels.forEach((panel, index) => {
        setTimeout(() => panel.classList.add('is-visible'), index * 120);
      });
    }
  }

  function animateCardCollection(nodeList) {
    const cards = Array.from(nodeList || []);
    if (!cards.length) return;

    cards.forEach((card) => card.classList.add('is-pre-animated'));

    if (!runPopmotionStagger(cards, 85)) {
      cards.forEach((card, index) => {
        setTimeout(() => card.classList.add('is-visible'), index * 70);
      });
    }
  }

  /*
    runPopmotionStagger()
    --------------------------------------------------------------------------
    POPMOTION APIS USED HERE
    - stagger(): starts multiple animations with a delay between each one
    - tween(): interpolates values over time from a start to an end
    - composite(): combines opacity + y translation into one grouped action
    - framesync.update/render(): schedules updates in sync with the browser frame

    
    - stagger is the clearest "unique animation" for a dashboard-style UI
    - tween gives a simple smooth motion without needing physics-heavy config
    - composite lets opacity and movement update together
    - framesync helps reduce unnecessary rendering work and keeps animation timing
      tied to browser repaint cycles

    Each element starts slightly lower and invisible, then moves up and fades in.
    Because stagger is used, the elements appear in sequence instead of all at once.
  */
  function runPopmotionStagger(elements, intervalMs) {
    const pm = window.popmotion;
    const hasLegacyApis = pm
      && typeof pm.stagger === 'function'
      && typeof pm.composite === 'function'
      && typeof pm.tween === 'function';

    if (!hasLegacyApis) return false;

    try {
      const actions = elements.map(() => pm.composite({
        opacity: pm.tween({ from: 0, to: 1, duration: 420 }),
        y: pm.tween({ from: 18, to: 0, duration: 420 })
      }));

      const applyValues = (values) => {
        const painter = () => {
          values.forEach((value, index) => {
            if (!value) return;

            const el = elements[index];
            el.style.opacity = String(value.opacity);
            el.style.transform = `translateY(${value.y}px)`;

            if (value.opacity >= 0.99 && Math.abs(value.y) < 0.5) {
              el.classList.add('is-visible');
            }
          });
        };

        if (pm.framesync?.render) {
          pm.framesync.render(painter);
        } else {
          painter();
        }
      };

      const starter = () => pm.stagger(actions, intervalMs).start(applyValues);

      if (pm.framesync?.update) {
        pm.framesync.update(starter);
      } else {
        starter();
      }

      return true;
    } catch (error) {
      console.warn('Popmotion animation failed, using CSS fallback:', error);
      return false;
    }
  }

  /*
    INITIALIZATION
    --------------------------------------------------------------------------
    - APOD and NEO load immediately because they are the primary data panels
    - Mars and Moon are lazy-loaded
    - animations start right away for visual polish
  */
  function initDashboard() {
    if (IS_FILE_PROTOCOL) {
      setFooterStatus('You are running this from file://. Use http://localhost for the NASA fetch calls.');
    } else {
      setFooterStatus('Using your custom NASA API key.');
    }

    fetchAPOD();
    fetchNEO();
    setupLazyPanelLoading();
    animatePanels();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
  } else {
    initDashboard();
  }
})();
