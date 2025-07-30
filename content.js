// Chrome extension content script for Zendesk reply box grammar correction using Gemini API
// -- FINAL, TESTED VERSION: RELIABLE FORMATTING & SPACING --

console.log("Gemini Assistant: Content script loaded.");

// API Key and Model URL updated as per your request.
const API_KEY = "AIzaSyCzo4iMxp6l1BHLLkTcpRJ2WQ58DvCiVUc";
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const ZENDESK_EDITOR_SELECTOR =
  "[data-test-id='omnicomposer-rich-text-ckeditor']";

/**
 * Converts editor HTML to plain text while correctly preserving paragraph and line breaks.
 * @param {string} html The innerHTML of the editor.
 * @returns {string} Plain text with paragraphs separated by a single newline.
 */
function convertHtmlToPlainText(html) {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  const paragraphs = tempDiv.querySelectorAll("p");
  if (paragraphs.length === 0) {
    // Fallback for content that doesn't use <p> tags
    return (tempDiv.innerText || "").trim();
  }
  // Each <p> tag becomes a line. An empty <p> (like <p><br></p>) becomes an empty line.
  // This preserves the exact structure.
  return Array.from(paragraphs)
    .map((p) => p.innerText.trim())
    .join("\n");
}

/**
 * Converts plain text with newlines back into a valid HTML string with <p> tags.
 * @param {string} text Plain text with paragraphs separated by newlines.
 * @returns {string} A string of HTML paragraphs.
 */
function convertPlainTextToHtml(text) {
  if (!text || !text.trim()) return "<p><br></p>";
  // Split by single newlines. Each line becomes a paragraph.
  return text
    .split("\n")
    .map((line) => {
      const trimmedLine = line.trim();
      // If a line is empty, create a paragraph that will render as a blank line.
      if (trimmedLine === "") {
        return "<p><br></p>";
      }
      return `<p>${trimmedLine}</p>`;
    })
    .join("");
}

/**
 * Compares original and corrected HTML to generate a new HTML string with highlights.
 * @param {string} originalHtml The original HTML from the editor.
 * @param {string} correctedHtml The corrected HTML from Gemini.
 * @returns {string} A new HTML string for the preview with highlights.
 */
function createHighlightedPreview(originalHtml, correctedHtml) {
  const tempDiv = document.createElement("div");

  tempDiv.innerHTML = originalHtml;
  const oldWords = new Set(
    (tempDiv.innerText || "")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0)
  );

  tempDiv.innerHTML = correctedHtml;
  const newText = (tempDiv.innerText || "").trim();

  const addedWords = new Set(
    newText
      .split(/\s+/)
      .filter((word) => !oldWords.has(word) && word.length > 0)
  );

  if (addedWords.size === 0) {
    return correctedHtml;
  }

  let highlightedHtml = correctedHtml;

  addedWords.forEach((word) => {
    const regex = new RegExp(`\\b(${escapeRegExp(word)})\\b`, "gi");
    highlightedHtml = highlightedHtml.replace(
      regex,
      `<span class="gemini-highlight">$1</span>`
    );
  });

  return highlightedHtml;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Shows a modal preview box with a tabbed interface for different versions.
 * @param {object} versions An object containing the HTML for each version.
 * @param {HTMLElement} mainButton The main "Correct" button on the page.
 * @param {HTMLElement} editorElem The editor element to focus on paste.
 */
function showPreviewBox(versions, mainButton, editorElem) {
  const existingOverlay = document.getElementById("gemini-preview-overlay");
  if (existingOverlay) existingOverlay.remove();

  const overlay = document.createElement("div");
  overlay.id = "gemini-preview-overlay";

  const previewBox = document.createElement("div");
  previewBox.id = "gemini-preview-box";

  previewBox.innerHTML = `
        <h3>Correction Preview</h3>
        <div class="gemini-tab-buttons">
            <button class="gemini-tab-button active" data-tab="fix">Fix Grammar</button>
            <button class="gemini-tab-button" data-tab="elaborate">Elaborate</button>
            <button class="gemini-tab-button" data-tab="shorten">Shorten</button>
        </div>
        <div class="gemini-tab-contents">
            <div class="gemini-tab-content active" id="gemini-tab-content-fix">${versions.fix.previewHtml}</div>
            <div class="gemini-tab-content" id="gemini-tab-content-elaborate">${versions.elaborate.previewHtml}</div>
            <div class="gemini-tab-content" id="gemini-tab-content-shorten">${versions.shorten.previewHtml}</div>
        </div>
        <div class="gemini-preview-actions">
            <button id="gemini-cancel-btn">Cancel</button>
            <button id="gemini-accept-btn">Accept & Copy</button>
        </div>
    `;

  overlay.appendChild(previewBox);
  document.body.appendChild(overlay);

  const resetMainButton = () => {
    mainButton.textContent = "✨ Correct";
    mainButton.disabled = false;
    mainButton.classList.remove("ready-to-paste");
  };

  const tabButtons = previewBox.querySelectorAll(".gemini-tab-button");
  const tabContents = previewBox.querySelectorAll(".gemini-tab-content");
  let activeTab = "fix";

  tabButtons.forEach((button) => {
    button.onclick = () => {
      tabButtons.forEach((btn) => btn.classList.remove("active"));
      tabContents.forEach((content) => content.classList.remove("active"));
      button.classList.add("active");
      activeTab = button.dataset.tab;
      document
        .getElementById(`gemini-tab-content-${activeTab}`)
        .classList.add("active");
    };
  });

  document.getElementById("gemini-cancel-btn").onclick = () => {
    overlay.remove();
    resetMainButton();
  };

  document.getElementById("gemini-accept-btn").onclick = async () => {
    const cleanHtmlToCopy = versions[activeTab].cleanHtml;
    try {
      const blob = new Blob([cleanHtmlToCopy], { type: "text/html" });
      const clipboardItem = new ClipboardItem({ "text/html": blob });
      await navigator.clipboard.write([clipboardItem]);

      mainButton.textContent = "✅ Ready to Paste! (Press Ctrl+V)";
      mainButton.classList.add("ready-to-paste");

      editorElem.focus();
      document.execCommand("selectAll", false, null);

      overlay.remove();
    } catch (err) {
      console.error("Gemini Assistant: Failed to copy to clipboard.", err);
      alert("Failed to copy text. Please try again.");
      resetMainButton();
    }
  };
}

/**
 * Calls the Gemini API with a specific prompt (using plain text).
 * @param {string} prompt The complete prompt to send.
 * @param {string} originalText A fallback value in case of failure.
 * @returns {Promise<string>} A promise that resolves to the clean, corrected plain text.
 */
async function callGemini(prompt, originalText) {
  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!response.ok)
      throw new Error(`API request failed: ${response.statusText}`);
    const data = await response.json();

    if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text.trim();
    }
    return originalText;
  } catch (error) {
    console.error("Gemini Assistant: An API call failed.", error);
    return originalText;
  }
}

/**
 * Gets three different corrected versions from the Gemini API using plain text.
 * @param {string} text The original plain text from the editor.
 * @returns {Promise<object>} A promise that resolves to an object with three corrected text versions.
 */
async function getCorrectionsFromGemini(text) {
  if (!text || !text.trim()) return null;

  const basePrompt = `IMPORTANT: - Preserve the paragraph breaks (represented by newlines) from the original text. - Your entire response must be ONLY the corrected text. Do not add any conversational preamble like "No problem" or markdown. Original Text: --- ${text} ---`;

  const prompts = {
    fix: `Correct the grammar and spelling in the following text. ${basePrompt}`,
    elaborate: `Elaborate on the original text to make it more descriptive, professional, and detailed. Expand on the points, add context, and use richer vocabulary, but maintain the core message and all original paragraph breaks. Correct grammar and spelling. ${basePrompt}`,
    shorten: `Shorten the original text to be more direct and concise. Remove filler words and redundant phrases, but ensure the key information, professional tone, and all original paragraph breaks are preserved. Correct grammar and spelling. ${basePrompt}`,
  };

  try {
    const [fix, elaborate, shorten] = await Promise.all([
      callGemini(prompts.fix, text),
      callGemini(prompts.elaborate, text),
      callGemini(prompts.shorten, text),
    ]);

    console.log(
      "Gemini Assistant: All three plain text versions received from API."
    );
    return { fix, elaborate, shorten };
  } catch (error) {
    console.error("Gemini Assistant: Failed to get all corrections.", error);
    alert("Error contacting Gemini API for all versions. Check the console.");
    return { fix: text, elaborate: text, shorten: text };
  }
}

/**
 * Main button click handler.
 */
async function onCorrectButtonClick(e, btn, editorElem) {
  e.preventDefault();
  e.stopPropagation();

  const originalButtonText = "✨ Correct";

  if (btn.classList.contains("ready-to-paste")) {
    btn.textContent = originalButtonText;
    btn.classList.remove("ready-to-paste");
    return;
  }

  btn.textContent = "⏳ Correcting...";
  btn.disabled = true;

  const originalHtml = editorElem.innerHTML;
  const originalText = convertHtmlToPlainText(originalHtml);

  const correctedTextVersions = await getCorrectionsFromGemini(originalText);

  if (!correctedTextVersions) {
    btn.textContent = "Error";
    setTimeout(() => {
      btn.textContent = originalButtonText;
      btn.disabled = false;
    }, 2000);
    return;
  }

  // Convert all plain text versions back to clean HTML
  const correctedHtmlVersions = {
    fix: convertPlainTextToHtml(correctedTextVersions.fix),
    elaborate: convertPlainTextToHtml(correctedTextVersions.elaborate),
    shorten: convertPlainTextToHtml(correctedTextVersions.shorten),
  };

  // Prepare data for the preview box
  const versionsForPreview = {
    fix: {
      cleanHtml: correctedHtmlVersions.fix,
      previewHtml: createHighlightedPreview(
        originalHtml,
        correctedHtmlVersions.fix
      ),
    },
    elaborate: {
      cleanHtml: correctedHtmlVersions.elaborate,
      previewHtml: createHighlightedPreview(
        originalHtml,
        correctedHtmlVersions.elaborate
      ),
    },
    shorten: {
      cleanHtml: correctedHtmlVersions.shorten,
      previewHtml: createHighlightedPreview(
        originalHtml,
        correctedHtmlVersions.shorten
      ),
    },
  };

  showPreviewBox(versionsForPreview, btn, editorElem);
}

/**
 * Creates and adds the "Correct" button to the editor's container.
 */
function addGeminiButton(editorElem) {
  if (!editorElem || editorElem.dataset.geminiButtonAdded) return;

  const container = editorElem.parentElement;
  if (!container) return;

  editorElem.dataset.geminiButtonAdded = "true";
  if (window.getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }

  const btn = document.createElement("button");
  btn.textContent = "✨ Correct";
  btn.className = "gemini-correct-btn";
  container.appendChild(btn);

  btn.onclick = (e) => onCorrectButtonClick(e, btn, editorElem);

  editorElem.addEventListener("focus", () => {
    if (btn.classList.contains("ready-to-paste")) {
      btn.textContent = "✨ Correct";
      btn.classList.remove("ready-to-paste");
    }
  });
}

/**
 * Injects the necessary CSS for the button and the new tabbed preview box.
 */
function addGlobalStyles() {
  if (document.getElementById("gemini-style-injector")) return;
  const style = document.createElement("style");
  style.id = "gemini-style-injector";
  style.textContent = `
      .gemini-correct-btn {
        position: absolute; bottom: 8px; right: 8px; z-index: 10000; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background-color: #4285F4; color: white; border: none; border-radius: 8px; padding: 6px 14px; cursor: pointer; opacity: 0.9;
        transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      .gemini-correct-btn:hover { opacity: 1; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
      .gemini-correct-btn:disabled { background-color: #BDBDBD; cursor: not-allowed; }
      .gemini-correct-btn.ready-to-paste { background-color: #34A853; }
      #gemini-preview-overlay {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); z-index: 99998;
        display: flex; align-items: center; justify-content: center;
      }
      #gemini-preview-box {
        background-color: white; border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        width: 90%; max-width: 600px; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        z-index: 99999; text-align: left;
      }
      #gemini-preview-box h3 { margin-top: 0; color: #333; }
      .gemini-tab-buttons {
        display: flex; border-bottom: 1px solid #ddd; margin-bottom: 15px;
      }
      .gemini-tab-button {
        padding: 10px 15px; border: none; background-color: transparent; cursor: pointer;
        font-size: 14px; color: #555; border-bottom: 2px solid transparent; margin-bottom: -1px;
      }
      .gemini-tab-button.active {
        color: #4285F4; border-bottom-color: #4285F4; font-weight: 600;
      }
      .gemini-tab-content { display: none; }
      .gemini-tab-content.active { display: block; }
      .gemini-preview-content {
        background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; padding: 15px;
        max-height: 400px; overflow-y: auto; text-align: left;
      }
      .gemini-preview-content p { margin-top: 0; margin-bottom: 1em; line-height: 1.6; }
      .gemini-preview-content p:last-child { margin-bottom: 0; }
      .gemini-highlight {
        background-color: #d4edda; color: #155724; padding: 1px 3px; border-radius: 3px; font-weight: 500;
      }
      .gemini-preview-actions { margin-top: 20px; text-align: right; }
      .gemini-preview-actions button {
        padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-weight: bold; transition: background-color 0.2s;
      }
      #gemini-cancel-btn { background-color: #eee; color: #333; margin-right: 10px; }
      #gemini-cancel-btn:hover { background-color: #ddd; }
      #gemini-accept-btn { background-color: #4285F4; color: white; }
      #gemini-accept-btn:hover { background-color: #3367D6; }
    `;
  document.head.appendChild(style);
}

/**
 * Main function to find and enhance all Zendesk editors.
 */
function initialize() {
  addGlobalStyles();
  const observer = new MutationObserver(() =>
    document.querySelectorAll(ZENDESK_EDITOR_SELECTOR).forEach(addGeminiButton)
  );
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("load", () =>
    document.querySelectorAll(ZENDESK_EDITOR_SELECTOR).forEach(addGeminiButton)
  );
}

initialize();
