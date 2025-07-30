// Chrome extension content script for Zendesk reply box grammar correction using Gemini API
// -- FINAL VERSION: RELIABLE PREVIEW & FORMATTING --

console.log("Gemini Assistant: Content script loaded.");

// API Key and Model URL updated as per your request.
const API_KEY = "AIzaSyCzo4iMxp6l1BHLLkTcpRJ2WQ58DvCiVUc";
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const ZENDESK_EDITOR_SELECTOR =
  "[data-test-id='omnicomposer-rich-text-ckeditor']";

/**
 * Compares original and corrected HTML to generate a new HTML string
 * with all new words highlighted in green.
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
 * Shows a modal preview box.
 * @param {string} previewHtml The HTML with highlights to display.
 * @param {string} cleanCopyToClipboardHtml The non-highlighted HTML to be copied.
 * @param {HTMLElement} mainButton The main "Correct" button on the page.
 * @param {HTMLElement} editorElem The editor element to focus on paste.
 */
function showPreviewBox(
  previewHtml,
  cleanCopyToClipboardHtml,
  mainButton,
  editorElem
) {
  const existingOverlay = document.getElementById("gemini-preview-overlay");
  if (existingOverlay) existingOverlay.remove();

  const overlay = document.createElement("div");
  overlay.id = "gemini-preview-overlay";

  const previewBox = document.createElement("div");
  previewBox.id = "gemini-preview-box";

  previewBox.innerHTML = `
        <h3>Correction Preview</h3>
        <div class="gemini-preview-content">${previewHtml}</div>
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

  document.getElementById("gemini-cancel-btn").onclick = () => {
    overlay.remove();
    resetMainButton();
  };

  document.getElementById("gemini-accept-btn").onclick = async () => {
    try {
      const blob = new Blob([cleanCopyToClipboardHtml], { type: "text/html" });
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
 * Sends HTML to the Gemini API and robustly extracts the corrected HTML block.
 * @param {string} html The original HTML content from the editor.
 * @returns {Promise<string>} A promise that resolves to the clean, corrected HTML string.
 */
async function getCorrectionFromGemini(html) {
  if (!html || !html.trim()) return "";

  const prompt = `You are a helpful grammar correction assistant. Below is a piece of HTML from a rich text editor. Correct the grammar and spelling of the text within the HTML tags. IMPORTANT: - Preserve the original HTML structure, including all <p> tags. - Your entire response must be only the corrected, raw HTML string. - Do NOT add any markdown like "\`\`\`html" or conversational preamble. Original HTML: --- ${html} ---`;

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
      const rawResponse = data.candidates[0].content.parts[0].text.trim();
      const firstTagIndex = rawResponse.search(/<[a-z][\s\S]*>/i);

      if (firstTagIndex !== -1) {
        const cleanedHtml = rawResponse.substring(firstTagIndex);
        console.log(
          "Gemini Assistant: Successfully extracted HTML block from response."
        );
        return cleanedHtml;
      } else {
        console.warn(
          "Gemini Assistant: API response did not contain a valid HTML block.",
          rawResponse
        );
        return html;
      }
    } else {
      console.warn(
        "Gemini Assistant: Received an invalid response structure from API.",
        JSON.stringify(data)
      );
      return html;
    }
  } catch (error) {
    console.error("Gemini Assistant: Exception while contacting API.", error);
    alert("Error contacting Gemini API. Check the console for details.");
    return html;
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

  const htmlToCorrect = editorElem.innerHTML;
  const correctedHtml = await getCorrectionFromGemini(htmlToCorrect);

  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = htmlToCorrect;
  const originalText = tempDiv.innerText.trim();
  tempDiv.innerHTML = correctedHtml;
  const correctedText = tempDiv.innerText.trim();

  if (originalText === correctedText) {
    btn.textContent = "No Changes Needed";
    setTimeout(() => {
      btn.textContent = originalButtonText;
      btn.disabled = false;
    }, 2000);
    return;
  }

  const previewHtml = createHighlightedPreview(htmlToCorrect, correctedHtml);
  showPreviewBox(previewHtml, correctedHtml, btn, editorElem);
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
 * Injects the necessary CSS for the button and preview box into the page.
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
        width: 90%; max-width: 600px; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        z-index: 99999; text-align: left;
      }
      #gemini-preview-box h3 { margin-top: 0; color: #333; }
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
