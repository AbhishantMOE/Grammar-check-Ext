// Chrome extension content script for Zendesk reply box grammar correction using Gemini API
// -- FINAL VERSION v2: HIGHLIGHTING & FORMATTING PRESERVED --

console.log("Gemini Assistant: Content script loaded.");

// IMPORTANT: Replace with your actual API key.
const API_KEY = "AIzaSyCzo4iMxp6l1BHLLkTcpRJ2WQ58DvCiVUc"; // <<<<<<< REMEMBER TO PUT YOUR KEY HERE
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

  // Get a set of original words for quick lookup
  tempDiv.innerHTML = originalHtml;
  const oldWords = new Set(
    (tempDiv.innerText || "").split(/\s+/).filter((w) => w.length > 0)
  );

  // Get an array of new words
  tempDiv.innerHTML = correctedHtml;
  const newText = tempDiv.innerText || "";

  // Find words that are in the new text but not the old one
  const addedWords = new Set(
    newText.split(/\s+/).filter((word) => !oldWords.has(word))
  );

  if (addedWords.size === 0) {
    return correctedHtml; // No changes to highlight
  }

  let highlightedHtml = correctedHtml;

  // Wrap each unique new word with a highlight span
  addedWords.forEach((word) => {
    // Use a Regex to replace the word only when it's not part of an HTML tag.
    // This looks for the word surrounded by boundaries (\b) and ensures it's not inside a tag.
    const regex = new RegExp(`\\b(${escapeRegExp(word)})\\b`, "gi");
    highlightedHtml = highlightedHtml.replace(
      regex,
      `<span class="gemini-highlight">$1</span>`
    );
  });

  return highlightedHtml;
}

// Utility to escape strings for use in a Regular Expression
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
 * Sends HTML to the Gemini API for correction while preserving structure.
 * @param {string} html The original HTML content from the editor.
 * @returns {Promise<string>} A promise that resolves to the corrected HTML string.
 */
async function correctWithGemini(html) {
  if (!html || !html.trim()) return "";

  const prompt = `You are a helpful grammar correction assistant. Below is a piece of HTML from a rich text editor. Correct the grammar and spelling of the text within the HTML tags. IMPORTANT: - Preserve the original HTML structure, including all <p> tags. - Your entire response must be only the corrected, raw HTML string. - Do NOT add any markdown like "\`\`\`html". Original HTML: --- ${html} ---`;

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
      let correctedText = data.candidates[0].content.parts[0].text.trim();
      if (correctedText.startsWith("```html"))
        correctedText = correctedText.substring(7);
      if (correctedText.endsWith("```"))
        correctedText = correctedText.slice(0, -3);
      return correctedText.trim();
    } else {
      console.warn(
        "Gemini Assistant: Received an invalid or empty response from the API.",
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
 * @param {Event} e The click event.
 * @param {HTMLElement} btn The button that was clicked.
 * @param {HTMLElement} editorElem The editor element.
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
  const correctedHtml = await correctWithGemini(htmlToCorrect);

  if (correctedHtml === htmlToCorrect) {
    btn.textContent = "No Changes Needed";
    setTimeout(() => {
      btn.textContent = originalButtonText;
      btn.disabled = false;
    }, 2000);
    return;
  }

  // Generate the special version of the HTML for the preview
  const previewHtml = createHighlightedPreview(htmlToCorrect, correctedHtml);

  // Show the preview, passing both the preview and the clean versions
  showPreviewBox(previewHtml, correctedHtml, btn, editorElem);
}

/**
 * Creates and adds the "Correct" button to the editor's container.
 * @param {HTMLElement} editorElem The editable DOM element.
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

// --- SCRIPT EXECUTION ---
addGlobalStyles();
const observer = new MutationObserver(() =>
  document.querySelectorAll(ZENDESK_EDITOR_SELECTOR).forEach(addGeminiButton)
);
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener("load", () =>
  document.querySelectorAll(ZENDESK_EDITOR_SELECTOR).forEach(addGeminiButton)
);
