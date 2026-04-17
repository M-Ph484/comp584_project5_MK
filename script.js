/*
  ============================================================================
  Project 5 APIs: NASA Space Dashboard 
  ============================================================================
  
  This script handles all NASA API interactions, DOM rendering, and animations
  for the space dashboard. Key features implemented:
  
  - Fetch API for NASA Open API requests with error handling
  - DOM manipulation for rendering API data into panels
  - Popmotion stagger animation for panel entrance effects
  - State management via data attributes for loading/error/ready states
  - Responsive image grids and accessible HTML tables
  
  APIs Used:
  - NASA APOD (Astronomy Picture of the Day): https://api.nasa.gov/planetary/apod
  - NASA Mars Rover Photos: https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/latest_photos
  - NASA NeoWs (Near Earth Object Web Service): https://api.nasa.gov/neo/rest/v1/feed
  
  Animation Library:
  - Popmotion: https://popmotion.io/ (loaded via CDN in index.html)
  
  COMMON ISSUES AND SOLUTIONS:
  ============================================================================
  
  If you're seeing "Could not load" errors, here are the most common causes:
  
  1. CORS Issues (file:// protocol):
     - Problem: Opening index.html directly in browser (file:// URL)
     - Solution: Serve files through a web server instead
     - Quick fix: Use VS Code Live Server extension or Python's http.server
     - Command: python -m http.server 8000 (then visit http://localhost:8000)
  
  2. Rate Limiting (HTTP 429 errors):
     - Problem: DEMO_KEY has 1000 requests/hour limit, shared across all users
     - Solution: Get a free personal API key at https://api.nasa.gov/
     - Replace DEMO_KEY with your personal key in the API_KEY constant below
  
  3. Network/Connectivity Issues:
     - Problem: No internet connection or NASA APIs temporarily down
     - Solution: Check internet connection, try again later
     - NASA APIs are generally very reliable but can have brief outages
  
  4. Individual Image Loading Failures:
     - Problem: Some Mars rover image URLs may be broken or slow to load
     - Solution: The code handles this gracefully with placeholder fallbacks
     - This is normal and doesn't break the overall functionality
  
  5. Browser Security Restrictions:
     - Problem: Some browsers block mixed content (HTTP API calls from HTTPS pages)
     - Solution: Ensure you're serving the page over HTTP for development
     - For production, use HTTPS and ensure all API calls are HTTPS
*/

// Wrap everything in an IIFE (Immediately Invoked Function Expression) to avoid polluting global scope
(function() {
  'use strict';

  /*
    NASA API CONSTANTS
    ============================================================================
    
    All NASA API endpoints require an api_key parameter. We use DEMO_KEY which
    provides limited rate-limited access without registration. For production
    use, you would register for a free API key at https://api.nasa.gov/
    
    Why DEMO_KEY:
    - No registration required for development/educational use
    - 1000 requests per hour limit (sufficient for this dashboard)
    - Same functionality as registered keys
    - Easy to upgrade to personal key later
    
    URL Construction:
    - Each URL includes the base endpoint and api_key parameter
    - Additional parameters are added by individual fetch functions
    - Using template literals for clean, readable URL construction
  */
  
  const API_KEY = 'DEMO_KEY';
  
  // APOD (Astronomy Picture of the Day) endpoint
  // Fetches today's featured space image/video with title and explanation
  const APOD_URL = `https://api.nasa.gov/planetary/apod?api_key=${API_KEY}`;
  
  // Mars Rover Photos endpoint - Curiosity rover's latest photos
  // Returns array of recent photos with metadata (camera, date, sol)
  const MARS_URL = `https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/latest_photos?api_key=${API_KEY}`;
  
  // Near Earth Objects endpoint - today's close approach data
  // Note: start_date and end_date will be added dynamically for today's date
  const NEO_BASE_URL = `https://api.nasa.gov/neo/rest/v1/feed?api_key=${API_KEY}`;

  /*
    UTILITY FUNCTIONS - Panel State Management
    ============================================================================
    
    These functions manage the visual state of each panel using data attributes.
    This approach keeps state management simple and leverages CSS for styling:
    
    - data-state="loading": Shows spinner, hides content and error
    - data-state="error": Shows error message, hides spinner and content  
    - data-state="ready": Shows content, hides spinner and error
    
    Why data attributes over JavaScript state objects:
    - CSS can directly style based on data attributes
    - No need for complex state synchronization
    - Visual state is always in sync with DOM
    - Easy to debug by inspecting HTML
  */

  /**
   * Shows loading spinner for a specific panel
   * 
   * @param {string} panelId - The ID of the panel (e.g., 'apod', 'mars', 'neo')
   * 
   * How it works:
   * 1. Finds the panel element using document.getElementById
   * 2. Sets data-state attribute to 'loading'
   * 3. CSS rules automatically show spinner and hide other content
   * 4. Removes any previous error messages from the error container
   */
  function showLoader(panelId) {
    const panel = document.getElementById(`panel-${panelId}`);
    if (panel) {
      // Set loading state - CSS will handle showing/hiding elements
      panel.setAttribute('data-state', 'loading');
      
      // Clear any previous error messages
      const errorElement = panel.querySelector('.panel__error');
      if (errorElement) {
        errorElement.textContent = '';
        errorElement.hidden = true;
      }
    }
  }

  /**
   * Hides loading spinner for a specific panel
   * 
   * @param {string} panelId - The ID of the panel to update
   * 
   * This function is called after successful API responses to transition
   * from loading state to ready state. The CSS handles the visual changes.
   */
  function hideLoader(panelId) {
    const panel = document.getElementById(`panel-${panelId}`);
    if (panel) {
      // Set ready state - content will be visible, loader hidden
      panel.setAttribute('data-state', 'ready');
    }
  }

  /**
   * Shows error message for a specific panel
   * 
   * @param {string} panelId - The ID of the panel that encountered an error
   * @param {string} message - Human-readable error message to display
   * 
   * How error handling works:
   * 1. Sets panel to error state (hides loader, shows error container)
   * 2. Inserts the error message text into the error element
   * 3. Makes error element visible by removing hidden attribute
   * 4. CSS styling makes error messages visually distinct (red background)
   */
  function showError(panelId, message) {
    const panel = document.getElementById(`panel-${panelId}`);
    if (panel) {
      // Set error state
      panel.setAttribute('data-state', 'error');
      
      // Display error message
      const errorElement = panel.querySelector('.panel__error');
      if (errorElement) {
        errorElement.textContent = message;
        errorElement.hidden = false;
      }
    }
  }

  /*
    DATE FORMATTING UTILITY
    ============================================================================
    
    NASA APIs return dates in ISO format (YYYY-MM-DD). This function converts
    them to human-readable format for better user experience.
    
    Why custom formatting over toLocaleDateString():
    - Consistent format across all browsers and locales
    - Specific format that works well in our dashboard layout
    - Handles edge cases like invalid dates gracefully
    
    Input: "2024-04-16" (ISO date string)
    Output: "April 16, 2024" (human-readable format)
  */

  /**
   * Converts ISO date string to human-readable format
   * 
   * @param {string} isoString - Date in YYYY-MM-DD format from NASA APIs
   * @returns {string} Human-readable date like "April 16, 2024"
   * 
   * How it works:
   * 1. Appends 'T00:00:00' to create valid ISO datetime string
   * 2. Creates Date object from the ISO string
   * 3. Uses toLocaleDateString with specific formatting options
   * 4. Returns formatted string or fallback for invalid dates
   * 
   * The 'T00:00:00' addition ensures the date is interpreted as local time
   * rather than UTC, preventing off-by-one day errors in different timezones.
   */
  function formatDate(isoString) {
    try {
      // Create Date object from ISO string, ensuring local timezone interpretation
      const date = new Date(isoString + 'T00:00:00');
      
      // Format using built-in Intl.DateTimeFormat for consistency
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      // Fallback for invalid date strings
      console.warn('Invalid date format:', isoString);
      return isoString; // Return original string if formatting fails
    }
  }

  /*
    INITIALIZATION
    ============================================================================
    
    The dashboard initializes when the DOM is fully loaded. We use
    DOMContentLoaded event instead of window.onload because:
    
    - DOMContentLoaded fires when HTML is parsed (faster)
    - window.onload waits for all images/resources (slower)
    - We don't need external resources loaded to start API calls
    - Better user experience with faster initialization
  */

  /**
   * Initialize the NASA Space Dashboard
   * 
   * This function is called when the DOM is ready and starts all dashboard
   * functionality:
   * 1. Fetches data from all three NASA APIs
   * 2. Renders the data into their respective panels
   * 3. Triggers entrance animations for visual polish
   * 
   * Each API call is independent - if one fails, others continue working.
   * This provides graceful degradation if any NASA service is unavailable.
   */
  function initDashboard() {
    console.log('NASA Space Dashboard initializing...');
    
    // Start all API fetches simultaneously for better performance
    // Each fetch is independent and handles its own errors
    fetchAPOD();
    fetchMars();
    fetchNEO();
    
    // Start entrance animations immediately (panels animate while loading)
    animatePanels();
  }

  // Wait for DOM to be fully loaded before initializing
  // This ensures all panel elements exist before we try to manipulate them
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
  } else {
    // DOM is already loaded (script loaded after DOMContentLoaded)
    initDashboard();
  }

  /*
    PLACEHOLDER FUNCTIONS
    ============================================================================
    
    These functions will be implemented in subsequent tasks:
    - fetchAPOD(): Fetch and render Astronomy Picture of the Day
    - fetchMars(): Fetch and render Mars Rover Photos
    - fetchNEO(): Fetch and render Near Earth Objects data
    - animatePanels(): Popmotion stagger animation for panel entrance
    
    For now, they're defined as placeholders to prevent errors.
  */

  /*
    ASTRONOMY PICTURE OF THE DAY (APOD) IMPLEMENTATION
    ============================================================================
    
    The APOD API provides NASA's daily featured space image or video with
    educational content. This implementation handles both media types:
    
    - Images: Display directly with title, explanation, and date
    - Videos: Show placeholder with link to external video
    
    API Endpoint: https://api.nasa.gov/planetary/apod
    Response Fields Used:
    - title: Image/video title for heading and alt text
    - date: Publication date in YYYY-MM-DD format
    - media_type: "image" or "video" determines rendering approach
    - url: Direct link to image file or video page
    - hdurl: High-resolution image URL (optional, fallback to url)
    - explanation: Educational description of the image/video
  */

  /**
   * Fetches today's Astronomy Picture of the Day from NASA
   * 
   * This function handles the complete APOD workflow:
   * 1. Shows loading spinner in the APOD panel
   * 2. Makes HTTP request to NASA APOD API
   * 3. Validates response and checks for errors
   * 4. Calls renderAPOD to display the data
   * 5. Shows error message if anything fails
   * 
   * Error handling covers:
   * - Network failures (no internet, DNS issues)
   * - HTTP errors (404, 500, rate limiting)
   * - Invalid JSON responses
   * - Missing required fields in API response
   */
  async function fetchAPOD() {
    console.log('📸 Fetching Astronomy Picture of the Day...');
    
    // Show loading state immediately for user feedback
    showLoader('apod');
    
    try {
      // Fetch data from NASA APOD API
      // The fetch() API returns a Promise that resolves to the Response object
      const response = await fetch(APOD_URL);
      
      /*
        Check if HTTP request was successful
        
        Important: fetch() only rejects on network errors, NOT HTTP error status codes.
        A 404 or 500 response is considered a "successful" fetch that needs manual checking.
        
        response.ok is true for status codes 200-299, false for 400+ and 500+
        This ensures we catch and handle HTTP errors properly.
      */
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Parse JSON response
      // This can throw if the response isn't valid JSON
      const data = await response.json();
      
      /*
        Validate required fields are present
        
        The NASA API should always include these fields, but we check defensively
        to provide better error messages if the API response format changes.
      */
      if (!data.title || !data.date || !data.media_type || !data.url) {
        throw new Error('Invalid APOD response: missing required fields');
      }
      
      console.log('APOD data received:', data.title);
      
      // Hide loading spinner and render the APOD data
      hideLoader('apod');
      renderAPOD(data);
      
    } catch (error) {
      /*
        Error handling with user-friendly messages
        
        Different error types get different messages:
        - Network errors: "Could not connect to NASA API"
        - HTTP errors: "NASA API returned error: HTTP 429"
        - JSON parsing errors: "Invalid response from NASA API"
        - Validation errors: Custom message about missing fields
        - CORS errors: Specific guidance for local development
      */
      console.error('APOD fetch error:', error);
      
      let errorMessage = 'Could not load Astronomy Picture of the Day. ';
      
      if (error.message.includes('HTTP')) {
        errorMessage += `NASA API error: ${error.message}`;
        if (error.message.includes('429')) {
          errorMessage += ' (Rate limit exceeded - please try again later)';
        }
      } else if (error.message.includes('Invalid')) {
        errorMessage += error.message;
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        errorMessage += 'Network error - please check your internet connection. If running locally, try serving the files through a web server instead of opening directly in browser.';
      } else {
        errorMessage += 'Please check your internet connection and try again.';
      }
      
      showError('apod', errorMessage);
    }
  }

  /**
   * Renders APOD data into the DOM
   * 
   * @param {Object} data - APOD API response object
   * @param {string} data.title - Image/video title
   * @param {string} data.date - Publication date (YYYY-MM-DD)
   * @param {string} data.media_type - "image" or "video"
   * @param {string} data.url - Media URL
   * @param {string} [data.hdurl] - High-resolution image URL (optional)
   * @param {string} data.explanation - Educational description
   * 
   * This function creates accessible HTML structure:
   * - Images get proper alt text for screen readers
   * - Videos get descriptive link text
   * - All content is semantically structured with headings and paragraphs
   * - Date formatting makes dates human-readable
   * 
   * Media Type Handling:
   * - Images: Display directly with <img> element
   * - Videos: Show placeholder image with link to video
   */
  function renderAPOD(data) {
    const contentElement = document.querySelector('#panel-apod .panel__content');
    if (!contentElement) {
      console.error('APOD content element not found');
      return;
    }
    
    // Clear any existing content
    contentElement.innerHTML = '';
    
    /*
      Create media element based on type
      
      NASA APOD can be either an image or a video:
      - Images: Display directly using <img> with proper alt text
      - Videos: Usually YouTube embeds, show placeholder with link
      
      For videos, we create a visual placeholder instead of embedding
      because embedded videos can slow page load and use bandwidth.
    */
    let mediaElement;
    
    if (data.media_type === 'image') {
      /*
        Image rendering with accessibility
        
        - src: Use hdurl (high-res) if available, fallback to regular url
        - alt: Descriptive alt text using the APOD title
        - loading: "lazy" for performance (loads when scrolled into view)
        - CSS handles responsive sizing and styling
      */
      mediaElement = document.createElement('img');
      mediaElement.src = data.hdurl || data.url;
      mediaElement.alt = data.title;
      mediaElement.loading = 'lazy';
      mediaElement.style.width = '100%';
      mediaElement.style.borderRadius = '8px';
      
    } else if (data.media_type === 'video') {
      /*
        Video placeholder with link
        
        Instead of embedding videos (which can be slow and use bandwidth),
        we create a placeholder that links to the video. This approach:
        - Loads faster than embedded videos
        - Uses less bandwidth
        - Gives users control over when to watch
        - Works with any video platform (YouTube, Vimeo, etc.)
      */
      const videoContainer = document.createElement('div');
      videoContainer.style.cssText = `
        background: linear-gradient(135deg, #1a1a2e, #16213e);
        border: 2px dashed var(--color-accent);
        border-radius: 8px;
        padding: 2rem;
        text-align: center;
        margin-bottom: 1rem;
      `;
      
      // Video icon (using emoji for simplicity)
      const videoIcon = document.createElement('div');
      videoIcon.textContent = '🎬';
      videoIcon.style.fontSize = '3rem';
      videoIcon.style.marginBottom = '1rem';
      
      // Video link
      const videoLink = document.createElement('a');
      videoLink.href = data.url;
      videoLink.target = '_blank';
      videoLink.rel = 'noopener noreferrer';
      videoLink.textContent = `Watch Today's Space Video: ${data.title}`;
      videoLink.style.cssText = `
        color: var(--color-accent);
        text-decoration: none;
        font-weight: 600;
        font-size: 1.1rem;
      `;
      
      videoContainer.appendChild(videoIcon);
      videoContainer.appendChild(videoLink);
      mediaElement = videoContainer;
    }
    
    /*
      Create content structure
      
      The APOD content follows a consistent structure:
      1. Media element (image or video placeholder)
      2. Title as <h3> for proper heading hierarchy
      3. Publication date in human-readable format
      4. Explanation text for educational content
      
      This structure is accessible and provides good information hierarchy.
    */
    
    // Title element
    const titleElement = document.createElement('h3');
    titleElement.textContent = data.title;
    titleElement.style.cssText = `
      color: var(--color-heading);
      margin: 1rem 0 0.5rem 0;
      font-size: 1.25rem;
      line-height: 1.3;
    `;
    
    // Date element
    const dateElement = document.createElement('p');
    dateElement.textContent = formatDate(data.date);
    dateElement.style.cssText = `
      color: var(--color-text-dim);
      font-size: 0.9rem;
      margin: 0 0 1rem 0;
      font-style: italic;
    `;
    
    // Explanation element
    const explanationElement = document.createElement('p');
    explanationElement.textContent = data.explanation;
    explanationElement.style.cssText = `
      color: var(--color-text);
      line-height: 1.6;
      margin: 0;
    `;
    
    /*
      Append elements to DOM in logical order
      
      Order matters for screen readers and visual hierarchy:
      1. Media (image/video) - the main visual content
      2. Title - identifies what we're looking at
      3. Date - provides temporal context
      4. Explanation - educational content
    */
    contentElement.appendChild(mediaElement);
    contentElement.appendChild(titleElement);
    contentElement.appendChild(dateElement);
    contentElement.appendChild(explanationElement);
    
    console.log('📸 APOD rendered successfully');
  }

  /*
    MARS ROVER PHOTOS IMPLEMENTATION
    ============================================================================
    
    The Mars Rover Photos API provides access to images taken by NASA's Mars
    rovers. This implementation uses the Curiosity rover's latest photos.
    
    API Endpoint: https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/latest_photos
    Response Structure:
    - latest_photos: Array of photo objects
    - Each photo contains: id, img_src, earth_date, sol, rover, camera
    
    Photo Object Fields Used:
    - img_src: Direct URL to the photo image file
    - earth_date: Date photo was taken (YYYY-MM-DD format)
    - sol: Martian day number (Mars mission day)
    - rover.name: Name of the rover (e.g., "Curiosity")
    - camera.full_name: Full camera name (e.g., "Front Hazard Avoidance Camera")
    
    Display Strategy:
    - Show 6-12 photos in responsive grid layout
    - Include caption with Earth date and Martian sol
    - Each image has descriptive alt text with rover and camera info
    - Handle edge case where fewer than 6 photos are available
  */

  /**
   * Fetches latest Mars Rover photos from NASA
   * 
   * This function retrieves the most recent photos taken by the Curiosity rover
   * and displays them in a responsive image grid. The workflow:
   * 
   * 1. Shows loading spinner in Mars panel
   * 2. Fetches data from NASA Mars Rover Photos API
   * 3. Validates response and extracts photo array
   * 4. Calls renderMars to display photos in grid layout
   * 5. Handles errors gracefully with user-friendly messages
   * 
   * Error scenarios covered:
   * - Network connectivity issues
   * - NASA API service unavailable (HTTP errors)
   * - Invalid or malformed JSON responses
   * - Empty photo arrays or missing required fields
   * - Individual photo loading failures (handled in renderMars)
   */
  async function fetchMars() {
    console.log('🔴 Fetching Mars Rover photos...');
    
    // Show loading state for immediate user feedback
    showLoader('mars');
    
    try {
      // Fetch latest photos from Curiosity rover
      const response = await fetch(MARS_URL);
      
      /*
        Validate HTTP response status
        
        The Mars Rover API can return various HTTP error codes:
        - 429: Rate limit exceeded (too many requests)
        - 500: Internal server error at NASA
        - 503: Service temporarily unavailable
        
        We check response.ok to catch these before trying to parse JSON.
      */
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Parse JSON response
      const data = await response.json();
      
      /*
        Validate response structure
        
        The API should return an object with a 'latest_photos' array.
        We validate this structure exists before trying to use it.
      */
      if (!data.latest_photos || !Array.isArray(data.latest_photos)) {
        throw new Error('Invalid Mars API response: missing latest_photos array');
      }
      
      const photos = data.latest_photos;
      
      /*
        Handle empty photo array
        
        Sometimes the latest_photos array can be empty if:
        - Rover is in maintenance mode
        - Communication issues with Mars
        - Data processing delays at NASA
        
        We provide a helpful message rather than showing an error.
      */
      if (photos.length === 0) {
        throw new Error('No recent photos available from Mars rover');
      }
      
      console.log(`🔴 Received ${photos.length} Mars photos`);
      
      // Hide loading spinner and render photos
      hideLoader('mars');
      renderMars(photos);
      
    } catch (error) {
      /*
        Comprehensive error handling with context-specific messages
        
        Different error types get different user-facing messages:
        - HTTP errors: Include status code for technical users
        - Network errors: Suggest connectivity check and local server setup
        - Data validation errors: Explain what went wrong
        - Empty results: Explain this is normal and temporary
        - CORS errors: Provide guidance for local development
      */
      console.error('Mars fetch error:', error);
      
      let errorMessage = 'Could not load Mars Rover photos. ';
      
      if (error.message.includes('HTTP')) {
        errorMessage += `NASA API error: ${error.message}. This may be temporary.`;
        if (error.message.includes('429')) {
          errorMessage += ' (Rate limit exceeded - please try again later)';
        }
      } else if (error.message.includes('No recent photos')) {
        errorMessage += 'The rover has not transmitted new photos recently. Please try again later.';
      } else if (error.message.includes('Invalid')) {
        errorMessage += 'Received unexpected data format from NASA API.';
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        errorMessage += 'Network error - please check your internet connection. If running locally, try serving the files through a web server instead of opening directly in browser.';
      } else {
        errorMessage += 'Please check your internet connection and try again.';
      }
      
      showError('mars', errorMessage);
    }
  }

  /**
   * Renders Mars Rover photos into a responsive grid
   * 
   * @param {Array} photos - Array of photo objects from Mars Rover API
   * @param {Object} photos[].img_src - Direct URL to photo image
   * @param {string} photos[].earth_date - Earth date when photo was taken
   * @param {number} photos[].sol - Martian sol (day) number
   * @param {Object} photos[].rover - Rover information object
   * @param {string} photos[].rover.name - Name of the rover
   * @param {Object} photos[].camera - Camera information object
   * @param {string} photos[].camera.full_name - Full name of camera used
   * 
   * This function creates an accessible, responsive photo grid:
   * - Limits display to 6-12 photos for optimal loading and layout
   * - Creates descriptive alt text for each image
   * - Displays caption with Earth date and Martian sol information
   * - Uses CSS Grid for responsive layout (defined in style.css)
   * - Handles individual image loading errors gracefully
   * 
   * Grid Layout:
   * - CSS Grid with auto-fit columns (minimum 120px width)
   * - Images maintain 4:3 aspect ratio with object-fit: cover
   * - Responsive: adjusts column count based on available space
   */
  function renderMars(photos) {
    const contentElement = document.querySelector('#panel-mars .panel__content');
    if (!contentElement) {
      console.error('Mars content element not found');
      return;
    }
    
    // Clear any existing content
    contentElement.innerHTML = '';
    
    /*
      Photo count management
      
      Requirements specify 6-12 photos for optimal user experience:
      - Minimum 6: Ensures substantial content
      - Maximum 12: Prevents overwhelming layout and slow loading
      - If fewer than 6 available: Show all (graceful degradation)
      
      slice(0, 12) safely handles arrays of any length.
    */
    const displayPhotos = photos.slice(0, 12);
    console.log(`🔴 Displaying ${displayPhotos.length} Mars photos`);
    
    /*
      Create caption with mission information
      
      The caption provides context about when and where photos were taken:
      - Earth date: Familiar reference point for users
      - Sol: Mars mission day (educational value)
      - Rover name: Identifies which rover took the photos
      
      We use the first photo's metadata since all photos in latest_photos
      are from the same sol and rover.
    */
    if (displayPhotos.length > 0) {
      const firstPhoto = displayPhotos[0];
      const captionElement = document.createElement('div');
      captionElement.className = 'mars-caption';
      
      /*
        Caption content with educational context
        
        Format: "Photos from Sol 1234 (April 16, 2024) by Curiosity rover"
        - Sol number: Mars mission day (unique to Mars exploration)
        - Earth date: Familiar reference in human-readable format
        - Rover name: Credits the specific rover
      */
      captionElement.innerHTML = `
        Photos from <strong>Sol ${firstPhoto.sol}</strong> 
        (${formatDate(firstPhoto.earth_date)}) 
        by <strong>${firstPhoto.rover.name}</strong> rover
      `;
      
      contentElement.appendChild(captionElement);
    }
    
    /*
      Create responsive image grid
      
      The grid container uses CSS Grid (defined in style.css):
      - Class 'mars-grid' applies responsive grid layout
      - auto-fit columns with minmax(120px, 1fr) sizing
      - Automatic wrapping and spacing via CSS gap property
      
      This approach separates layout logic (CSS) from content logic (JS).
    */
    const gridElement = document.createElement('div');
    gridElement.className = 'mars-grid';
    
    /*
      Render individual photos with accessibility
      
      Each photo gets:
      - Descriptive alt text combining rover name and camera name
      - Lazy loading for performance (loads when scrolled into view)
      - Error handling for individual image load failures
      - Consistent aspect ratio via CSS (4:3 ratio)
    */
    displayPhotos.forEach((photo, index) => {
      /*
        Create image element with accessibility attributes
        
        Alt text format: "Curiosity rover - Front Hazard Avoidance Camera"
        - Identifies the rover that took the photo
        - Specifies which camera was used
        - Provides context for screen reader users
        - Follows accessibility best practices for descriptive alt text
      */
      const imgElement = document.createElement('img');
      imgElement.src = photo.img_src;
      imgElement.alt = `${photo.rover.name} rover - ${photo.camera.full_name}`;
      imgElement.loading = 'lazy'; // Performance optimization
      
      /*
        Individual image error handling
        
        If a specific image fails to load (broken URL, network timeout),
        we replace it with a placeholder rather than breaking the entire grid.
        This provides graceful degradation for individual image failures.
      */
      imgElement.onerror = function() {
        console.warn(`Failed to load Mars photo ${index + 1}:`, photo.img_src);
        
        // Create placeholder for failed image
        const placeholder = document.createElement('div');
        placeholder.style.cssText = `
          background: linear-gradient(135deg, #1a1a2e, #16213e);
          border: 2px dashed var(--color-text-dim);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          aspect-ratio: 4 / 3;
          color: var(--color-text-dim);
          font-size: 0.8rem;
          text-align: center;
          padding: 1rem;
        `;
        placeholder.textContent = 'Image unavailable';
        
        // Replace failed image with placeholder
        imgElement.parentNode.replaceChild(placeholder, imgElement);
      };
      
      /*
        Image loading success feedback
        
        Log successful loads for debugging and monitoring.
        In production, this could be used for analytics.
      */
      imgElement.onload = function() {
        console.log(`✅ Mars photo ${index + 1} loaded successfully`);
      };
      
      // Add image to grid
      gridElement.appendChild(imgElement);
    });
    
    // Add grid to panel content
    contentElement.appendChild(gridElement);
    
    console.log('🔴 Mars photos rendered successfully');
  }

  /*
    NEAR EARTH OBJECTS (NEO) IMPLEMENTATION
    ============================================================================
    
    The Near Earth Object Web Service (NeoWs) provides data about asteroids
    and comets that come close to Earth. This implementation fetches today's
    close approach data and displays it in an accessible HTML table.
    
    API Endpoint: https://api.nasa.gov/neo/rest/v1/feed
    Query Parameters:
    - start_date: YYYY-MM-DD format (today's date)
    - end_date: YYYY-MM-DD format (same as start_date for single day)
    - api_key: DEMO_KEY for authentication
    
    Response Structure:
    - element_count: Total number of NEOs found
    - near_earth_objects: Object with date keys containing NEO arrays
    - Each NEO contains: name, estimated_diameter, is_potentially_hazardous_asteroid, close_approach_data
    
    NEO Object Fields Used:
    - name: Official designation (e.g., "(2024 AB1)")
    - estimated_diameter.kilometers: Size range in kilometers
    - is_potentially_hazardous_asteroid: Boolean hazard classification
    - close_approach_data[0].miss_distance.kilometers: Closest approach distance
    
    Display Strategy:
    - Show data in accessible HTML table with proper caption and scope attributes
    - Highlight potentially hazardous asteroids with distinct styling
    - Limit to first 10 objects for readability
    - Include total count above table for context
  */

  /**
   * Fetches today's Near Earth Objects data from NASA
   * 
   * This function retrieves asteroids and comets that are making close
   * approaches to Earth today. The workflow:
   * 
   * 1. Generates today's date in YYYY-MM-DD format
   * 2. Constructs API URL with start_date and end_date parameters
   * 3. Shows loading spinner in NEO panel
   * 4. Fetches data from NASA NeoWs API
   * 5. Validates response structure and extracts NEO array
   * 6. Calls renderNEO to display data in accessible table
   * 7. Handles various error scenarios with helpful messages
   * 
   * Date Handling:
   * - Uses local timezone to determine "today"
   * - Formats date as YYYY-MM-DD for API compatibility
   * - Same date used for both start_date and end_date (single day query)
   * 
   * Error scenarios covered:
   * - Network connectivity issues
   * - NASA API service errors (rate limiting, server errors)
   * - Invalid JSON responses
   * - Missing or malformed data structures
   * - Empty result sets (no NEOs for today)
   */
  async function fetchNEO() {
    console.log('☄️ Fetching Near Earth Objects...');
    
    // Show loading state immediately
    showLoader('neo');
    
    try {
      /*
        Generate today's date in API-required format
        
        The NeoWs API requires dates in YYYY-MM-DD format.
        We use toISOString().slice(0, 10) to get this format:
        - toISOString() returns "2024-04-16T14:30:00.000Z"
        - slice(0, 10) extracts "2024-04-16"
        
        Using the same date for start_date and end_date queries a single day.
      */
      const today = new Date().toISOString().slice(0, 10);
      console.log(`☄️ Fetching NEOs for ${today}`);
      
      /*
        Construct API URL with date parameters
        
        The NeoWs feed endpoint requires both start_date and end_date.
        For a single day query, both parameters use the same date.
        This approach is more explicit than using the default date range.
      */
      const neoUrl = `${NEO_BASE_URL}&start_date=${today}&end_date=${today}`;
      
      // Fetch data from NASA NeoWs API
      const response = await fetch(neoUrl);
      
      /*
        Validate HTTP response
        
        The NeoWs API can return various error codes:
        - 400: Bad request (invalid date format)
        - 429: Rate limit exceeded
        - 500: Internal server error
        - 503: Service unavailable
        
        We check response.ok before attempting JSON parsing.
      */
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Parse JSON response
      const data = await response.json();
      
      /*
        Validate response structure
        
        The NeoWs API returns a complex nested structure:
        - Top level: element_count and near_earth_objects
        - near_earth_objects: Object with date keys (YYYY-MM-DD)
        - Each date key: Array of NEO objects
        
        We validate this structure exists before accessing nested data.
      */
      if (!data.near_earth_objects || typeof data.near_earth_objects !== 'object') {
        throw new Error('Invalid NEO API response: missing near_earth_objects');
      }
      
      /*
        Extract today's NEO array
        
        The near_earth_objects is an object with date keys:
        {
          "2024-04-16": [array of NEO objects],
          "2024-04-17": [array of NEO objects]
        }
        
        We extract the array for today's date key.
      */
      const todayNEOs = data.near_earth_objects[today];
      
      if (!todayNEOs || !Array.isArray(todayNEOs)) {
        throw new Error(`No NEO data found for ${today}`);
      }
      
      /*
        Handle empty results
        
        Some days have no close approaches. This is normal and not an error.
        We provide an informative message rather than showing an error state.
      */
      if (todayNEOs.length === 0) {
        throw new Error(`No Near Earth Objects detected for ${today}. This is normal - not every day has close approaches.`);
      }
      
      console.log(`☄️ Found ${todayNEOs.length} NEOs for ${today}`);
      
      // Hide loading spinner and render NEO table
      hideLoader('neo');
      renderNEO({
        neos: todayNEOs,
        totalCount: data.element_count,
        date: today
      });
      
    } catch (error) {
      /*
        Comprehensive error handling with educational context
        
        NEO-specific errors get explanatory messages:
        - Date format errors: Explain API requirements
        - Empty results: Explain this is normal variation
        - Network errors: Suggest connectivity check and local server setup
        - API errors: Include status codes for technical users
        - CORS errors: Provide guidance for local development
      */
      console.error('NEO fetch error:', error);
      
      let errorMessage = 'Could not load Near Earth Objects data. ';
      
      if (error.message.includes('HTTP')) {
        errorMessage += `NASA API error: ${error.message}. The service may be temporarily unavailable.`;
        if (error.message.includes('429')) {
          errorMessage += ' (Rate limit exceeded - please try again later)';
        }
      } else if (error.message.includes('No NEO data found')) {
        errorMessage += 'No asteroid data available for today. This can happen due to data processing delays.';
      } else if (error.message.includes('No Near Earth Objects detected')) {
        errorMessage += 'No asteroids are making close approaches today. This is perfectly normal!';
      } else if (error.message.includes('Invalid')) {
        errorMessage += 'Received unexpected data format from NASA API.';
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        errorMessage += 'Network error - please check your internet connection. If running locally, try serving the files through a web server instead of opening directly in browser.';
      } else {
        errorMessage += 'Please check your internet connection and try again.';
      }
      
      showError('neo', errorMessage);
    }
  }

  /**
   * Renders Near Earth Objects data into an accessible HTML table
   * 
   * @param {Object} data - NEO data object
   * @param {Array} data.neos - Array of NEO objects
   * @param {number} data.totalCount - Total count from API response
   * @param {string} data.date - Date string for context
   * 
   * This function creates a fully accessible HTML table following WCAG guidelines:
   * - Table caption describes the data and context
   * - Column headers use proper scope attributes
   * - Potentially hazardous asteroids get visual highlighting
   * - Data is limited to first 10 rows for readability
   * - Numeric data is right-aligned for easy comparison
   * 
   * Table Structure:
   * - Name: Official asteroid designation
   * - Est. Diameter (km): Size range (min-max)
   * - Hazardous: Yes/No with visual highlighting
   * - Miss Distance (km): Closest approach distance
   * 
   * Accessibility Features:
   * - <caption> element provides table context
   * - <th scope="col"> identifies column headers
   * - Hazardous rows get class="hazardous" for CSS styling
   * - Numeric formatting for better readability
   */
  function renderNEO(data) {
    const contentElement = document.querySelector('#panel-neo .panel__content');
    if (!contentElement) {
      console.error('NEO content element not found');
      return;
    }
    
    // Clear any existing content
    contentElement.innerHTML = '';
    
    const { neos, totalCount, date } = data;
    
    /*
      Display total count with context
      
      Shows the total number of NEOs detected today, providing context
      for the limited table display (max 10 rows). Format:
      "Found 23 Near Earth Objects for April 16, 2024 (showing first 10)"
    */
    const countElement = document.createElement('p');
    countElement.style.cssText = `
      color: var(--color-text-dim);
      font-size: 0.9rem;
      margin-bottom: 1rem;
      text-align: center;
    `;
    
    const displayCount = Math.min(neos.length, 10);
    const countText = totalCount > 10 
      ? `Found ${totalCount} Near Earth Objects for ${formatDate(date)} (showing first 10)`
      : `Found ${totalCount} Near Earth Objects for ${formatDate(date)}`;
    
    countElement.textContent = countText;
    contentElement.appendChild(countElement);
    
    /*
      Create accessible HTML table
      
      The table follows accessibility best practices:
      - <table> with proper class for CSS styling
      - <caption> describes table content and context
      - <thead> and <tbody> provide semantic structure
      - <th scope="col"> identifies column headers
      - Consistent data formatting and alignment
    */
    const tableElement = document.createElement('table');
    tableElement.className = 'neo-table';
    
    /*
      Table caption for accessibility
      
      The caption provides context for screen readers and users:
      - Describes what data is shown
      - Explains the date context
      - Notes the row limit if applicable
      
      Required by WCAG guidelines for data tables.
    */
    const captionElement = document.createElement('caption');
    captionElement.textContent = `Near Earth Objects detected on ${formatDate(date)}`;
    tableElement.appendChild(captionElement);
    
    /*
      Table header with proper scope attributes
      
      Each <th> element gets scope="col" to identify it as a column header.
      This helps screen readers understand the table structure and
      associate data cells with their headers.
      
      Column design:
      - Name: Left-aligned text (asteroid designations)
      - Est. Diameter: Right-aligned numbers (size comparison)
      - Hazardous: Center-aligned status (Yes/No)
      - Miss Distance: Right-aligned numbers (distance comparison)
    */
    const theadElement = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    const headers = [
      { text: 'Name', scope: 'col' },
      { text: 'Est. Diameter (km)', scope: 'col' },
      { text: 'Hazardous', scope: 'col' },
      { text: 'Miss Distance (km)', scope: 'col' }
    ];
    
    headers.forEach(header => {
      const th = document.createElement('th');
      th.textContent = header.text;
      th.scope = header.scope;
      headerRow.appendChild(th);
    });
    
    theadElement.appendChild(headerRow);
    tableElement.appendChild(theadElement);
    
    /*
      Table body with NEO data
      
      Process up to 10 NEOs for optimal readability:
      - Extract and format required data from each NEO object
      - Apply hazardous styling to dangerous asteroids
      - Format numeric data for readability
      - Handle missing or invalid data gracefully
    */
    const tbodyElement = document.createElement('tbody');
    
    // Limit to first 10 NEOs for readability
    const displayNEOs = neos.slice(0, 10);
    
    displayNEOs.forEach((neo, index) => {
      /*
        Extract and validate NEO data
        
        Each NEO object has a complex nested structure. We extract:
        - name: Official designation (always present)
        - diameter: Size range in kilometers (may be missing)
        - hazardous: Boolean flag (always present)
        - distance: Closest approach distance (may be missing)
        
        We handle missing data gracefully with fallback values.
      */
      const row = document.createElement('tr');
      
      // Apply hazardous styling if needed
      if (neo.is_potentially_hazardous_asteroid) {
        row.className = 'hazardous';
      }
      
      /*
        Name cell - asteroid designation
        
        Names are typically in format "(2024 AB1)" or "433 Eros".
        We display them as-is since they're official designations.
      */
      const nameCell = document.createElement('td');
      nameCell.textContent = neo.name || 'Unknown';
      row.appendChild(nameCell);
      
      /*
        Diameter cell - size range in kilometers
        
        The API provides min and max diameter estimates:
        estimated_diameter: {
          kilometers: {
            estimated_diameter_min: 0.1,
            estimated_diameter_max: 0.3
          }
        }
        
        We format this as "0.1 - 0.3" for readability.
        If data is missing, we show "Unknown".
      */
      const diameterCell = document.createElement('td');
      if (neo.estimated_diameter && neo.estimated_diameter.kilometers) {
        const min = neo.estimated_diameter.kilometers.estimated_diameter_min;
        const max = neo.estimated_diameter.kilometers.estimated_diameter_max;
        
        // Format with appropriate decimal places
        const minStr = min < 1 ? min.toFixed(2) : min.toFixed(1);
        const maxStr = max < 1 ? max.toFixed(2) : max.toFixed(1);
        
        diameterCell.textContent = `${minStr} - ${maxStr}`;
      } else {
        diameterCell.textContent = 'Unknown';
      }
      row.appendChild(diameterCell);
      
      /*
        Hazardous cell - potentially dangerous classification
        
        NASA classifies asteroids as "Potentially Hazardous" based on:
        - Size (larger than ~140 meters)
        - Orbit (comes within ~7.5 million km of Earth)
        
        We show "Yes" or "No" with appropriate styling.
      */
      const hazardousCell = document.createElement('td');
      hazardousCell.textContent = neo.is_potentially_hazardous_asteroid ? 'Yes' : 'No';
      hazardousCell.style.textAlign = 'center';
      row.appendChild(hazardousCell);
      
      /*
        Miss distance cell - closest approach distance
        
        The close_approach_data is an array of approach events.
        We use the first (closest) approach for today's data:
        close_approach_data: [{
          miss_distance: {
            kilometers: "1234567.89"
          }
        }]
        
        Distance is formatted with thousands separators for readability.
      */
      const distanceCell = document.createElement('td');
      if (neo.close_approach_data && neo.close_approach_data.length > 0) {
        const distance = neo.close_approach_data[0].miss_distance?.kilometers;
        if (distance) {
          // Format large numbers with thousands separators
          const distanceNum = parseFloat(distance);
          distanceCell.textContent = distanceNum.toLocaleString('en-US', {
            maximumFractionDigits: 0
          });
        } else {
          distanceCell.textContent = 'Unknown';
        }
      } else {
        distanceCell.textContent = 'Unknown';
      }
      row.appendChild(distanceCell);
      
      tbodyElement.appendChild(row);
    });
    
    tableElement.appendChild(tbodyElement);
    contentElement.appendChild(tableElement);
    
    console.log(`☄️ NEO table rendered with ${displayNEOs.length} objects`);
  }

  /*
    POPMOTION STAGGER ANIMATION IMPLEMENTATION
    ============================================================================
    
    Popmotion is a functional animation library that provides smooth, performant
    animations with a declarative API. We use three key Popmotion features:
    
    1. stagger(): Animates multiple elements in sequence with delays
    2. framesync: Optimized frame scheduling (better than requestAnimationFrame)
    3. composite: Combines multiple animations into a single optimized animation
    
    Why Popmotion over CSS animations or raw JavaScript:
    - Better performance through optimized frame scheduling
    - Functional API that's easier to compose and debug
    - Built-in stagger functionality (would require complex CSS or JS otherwise)
    - Automatic GPU acceleration when possible
    - Handles animation cleanup and memory management
    
    Animation Strategy:
    - Panels start invisible and slightly offset (opacity: 0, y: 20)
    - Stagger animates them to visible and in-place (opacity: 1, y: 0)
    - Each panel animates with 150ms delay between them
    - Individual animations last 500ms with smooth easing
    - Animation starts immediately on page load (before API data arrives)
    
    Library Loading:
    - Popmotion is loaded via CDN in index.html
    - Available as window.popmotion global object
    - We destructure the APIs we need for cleaner code
  */

  /**
   * Animates all panels into view using Popmotion stagger
   * 
   * This function creates the entrance animation for all three panels:
   * 1. Selects all .panel elements from the DOM
   * 2. Sets initial state (invisible, offset downward)
   * 3. Uses Popmotion stagger to animate them in sequence
   * 4. Each panel fades in and slides up to final position
   * 5. Uses framesync and composite for optimal performance
   * 
   * Animation Parameters:
   * - Delay between panels: 150ms (within 80-200ms requirement range)
   * - Duration per panel: 500ms (within 300-600ms requirement range)
   * - Initial state: opacity 0, translateY 20px (slightly below final position)
   * - Final state: opacity 1, translateY 0px (natural position)
   * - Easing: smooth ease-out for natural feel
   * 
   * Performance Optimizations:
   * - framesync.update: Better frame scheduling than requestAnimationFrame
   * - composite: Combines opacity and transform into single GPU operation
   * - transform: translateY uses GPU acceleration automatically
   * 
   * Error Handling:
   * - Graceful fallback if Popmotion library fails to load
   * - Continues without animation rather than breaking the page
   * - Logs helpful error messages for debugging
   */
  function animatePanels() {
    console.log('✨ Starting panel entrance animations...');
    
    /*
      Check if Popmotion library is available
      
      The library is loaded via CDN, so we need to verify it loaded successfully.
      If it's not available, we gracefully skip animations rather than breaking
      the page functionality. This provides progressive enhancement.
    */
    if (typeof window.popmotion === 'undefined') {
      console.warn('⚠️ Popmotion library not loaded, skipping animations');
      return;
    }
    
    /*
      Destructure Popmotion APIs for cleaner code
      
      We extract the specific functions we need from the global popmotion object:
      - stagger: Creates sequential animations with delays
      - framesync: Optimized frame scheduling system
      - composite: Combines multiple animations efficiently
      - animate: Core animation function
      - easeOut: Smooth easing curve for natural motion
      
      Destructuring makes the code more readable and allows for easier testing
      by mocking individual functions if needed.
    */
    const { stagger, framesync, composite, animate, easeOut } = window.popmotion;
    
    /*
      Select all panel elements
      
      We use querySelectorAll to get all elements with the .panel class.
      This automatically includes all three panels (APOD, Mars, NEO) without
      needing to hardcode their IDs. If panels are added or removed in the
      future, the animation will automatically adapt.
    */
    const panels = document.querySelectorAll('.panel');
    
    if (panels.length === 0) {
      console.warn('⚠️ No panels found for animation');
      return;
    }
    
    console.log(`✨ Animating ${panels.length} panels`);
    
    /*
      Set initial state for all panels
      
      Before starting the animation, we set all panels to their starting state:
      - opacity: 0 makes them invisible
      - transform: translateY(20px) positions them slightly below final position
      
      This ensures a consistent starting point regardless of CSS initial state.
      The 20px offset creates a subtle "slide up" effect that feels natural.
    */
    panels.forEach(panel => {
      panel.style.opacity = '0';
      panel.style.transform = 'translateY(20px)';
    });
    
    /*
      Create stagger animation with Popmotion
      
      stagger() creates a sequence of animations with delays between them:
      - First parameter: array of elements to animate
      - Second parameter: animation configuration object
      
      Animation Configuration:
      - from: starting values {opacity: 0, y: 20}
      - to: ending values {opacity: 1, y: 0}
      - delay: 150ms between each panel (meets 80-200ms requirement)
      - duration: 500ms per panel (meets 300-600ms requirement)
      - ease: easeOut for smooth, natural motion
      
      The stagger automatically handles:
      - Timing coordination between panels
      - Smooth interpolation between from/to values
      - GPU acceleration for transform properties
      - Memory cleanup when animation completes
    */
    const staggerAnimation = stagger(Array.from(panels), {
      /*
        Animation values
        
        from/to objects define the start and end states:
        - opacity: 0 → 1 creates fade-in effect
        - y: 20 → 0 creates slide-up effect (translateY in pixels)
        
        Popmotion automatically handles the CSS property mapping:
        - opacity maps directly to CSS opacity
        - y maps to CSS transform: translateY()
      */
      from: { opacity: 0, y: 20 },
      to: { opacity: 1, y: 0 },
      
      /*
        Timing configuration
        
        delay: Time between each panel starting its animation
        - 150ms provides smooth sequential appearance
        - Not too fast (jarring) or too slow (sluggish)
        - Within requirement range of 80-200ms
        
        duration: How long each individual panel animation takes
        - 500ms provides smooth, visible motion
        - Not too fast (abrupt) or too slow (sluggish)
        - Within requirement range of 300-600ms
      */
      delay: 150, // milliseconds between panels
      duration: 500, // milliseconds per panel
      
      /*
        Easing function for natural motion
        
        easeOut starts fast and slows down at the end:
        - Creates natural, physics-like motion
        - Feels more organic than linear timing
        - Standard choice for entrance animations
        - Draws attention without being distracting
      */
      ease: easeOut
    });
    
    /*
      Enhanced animation with framesync and composite
      
      framesync provides optimized frame scheduling:
      - Better performance than raw requestAnimationFrame
      - Automatically batches DOM updates for efficiency
      - Handles browser tab visibility and performance throttling
      - Provides consistent frame timing across different devices
      
      composite combines multiple animations:
      - Opacity and transform animations run as single GPU operation
      - Reduces layout thrashing and repaints
      - Better performance, especially on mobile devices
      - Smoother visual result with less jank
    */
    
    /*
      Use framesync for optimized frame scheduling
      
      framesync.update() is Popmotion's enhanced version of requestAnimationFrame:
      - Automatically handles browser performance optimizations
      - Batches multiple animations for better performance
      - Continues running efficiently even when tab is not visible
      - Provides more consistent timing than raw requestAnimationFrame
      
      Why framesync over requestAnimationFrame:
      - Built-in performance optimizations
      - Better handling of multiple simultaneous animations
      - Automatic cleanup and memory management
      - Consistent behavior across different browsers and devices
    */
    if (framesync && framesync.update) {
      console.log('✨ Using framesync for optimized frame scheduling');
      
      framesync.update(() => {
        /*
          Start the stagger animation within framesync callback
          
          This ensures the animation starts at the optimal time:
          - Synchronized with browser's repaint cycle
          - Batched with other DOM updates for efficiency
          - Automatically handles performance throttling
        */
        staggerAnimation.start();
      });
      
    } else {
      /*
        Fallback to direct animation start
        
        If framesync is not available (older Popmotion version or loading issue),
        we start the animation directly. This provides graceful degradation
        while still delivering the core animation functionality.
      */
      console.log('✨ framesync not available, using direct animation start');
      staggerAnimation.start();
    }
    
    /*
      Use composite for combined opacity and transform animation
      
      composite() combines multiple animation properties into a single
      optimized animation that runs on the GPU:
      
      Benefits of composite:
      - Single GPU operation instead of separate opacity and transform animations
      - Reduces browser workload and improves performance
      - Smoother animation with less visual jank
      - Better battery life on mobile devices
      
      Why composite over separate animations:
      - More efficient use of GPU resources
      - Consistent timing between opacity and transform changes
      - Reduced chance of animation conflicts or timing issues
      - Better performance on lower-end devices
    */
    if (composite) {
      console.log('✨ Using composite for optimized opacity and transform animation');
      
      /*
        Create composite animation for enhanced performance
        
        composite combines the opacity and transform animations:
        - Both properties animate together as single GPU operation
        - Eliminates potential timing differences between properties
        - Provides smoother visual result with better performance
        
        The composite animation runs alongside the stagger animation,
        providing additional optimization without changing the visual result.
      */
      panels.forEach((panel, index) => {
        /*
          Create individual composite animation for each panel
          
          Each panel gets its own composite animation that starts after
          the appropriate stagger delay. This provides the performance
          benefits of composite while maintaining the stagger timing.
        */
        const panelComposite = composite({
          /*
            Opacity animation component
            
            Animates from 0 to 1 over the duration with easing.
            This component handles the fade-in effect.
          */
          opacity: animate({
            from: 0,
            to: 1,
            duration: 500,
            ease: easeOut
          }),
          
          /*
            Transform animation component
            
            Animates translateY from 20px to 0px over the duration.
            This component handles the slide-up effect.
          */
          y: animate({
            from: 20,
            to: 0,
            duration: 500,
            ease: easeOut
          })
        });
        
        /*
          Start composite animation with stagger delay
          
          Each panel's composite animation starts after the appropriate delay:
          - Panel 0: 0ms delay
          - Panel 1: 150ms delay  
          - Panel 2: 300ms delay
          
          This maintains the stagger timing while using composite optimization.
        */
        setTimeout(() => {
          panelComposite.start(values => {
            /*
              Apply composite values to panel
              
              The composite animation provides optimized values that we
              apply to the panel's style properties. This gives us the
              performance benefits while maintaining full control.
            */
            panel.style.opacity = values.opacity;
            panel.style.transform = `translateY(${values.y}px)`;
          });
        }, index * 150);
      });
      
    } else {
      /*
        Fallback message for missing composite
        
        If composite is not available, the stagger animation still works
        perfectly. We just don't get the additional GPU optimization.
        This provides graceful degradation.
      */
      console.log('✨ composite not available, using standard stagger animation');
    }
    
    /*
      Animation completion logging
      
      Log when the animation sequence completes for debugging and monitoring.
      The total time is calculated as: (number of panels - 1) * delay + duration
      For 3 panels: (3-1) * 150ms + 500ms = 800ms total
    */
    const totalAnimationTime = (panels.length - 1) * 150 + 500;
    setTimeout(() => {
      console.log('✨ Panel entrance animations completed');
    }, totalAnimationTime);
  }

})();