// Chrome extension content script for Zendesk reply box grammar correction using Gemini API
// -- FINAL VERSION with PREVIEW & HIGHLIGHTING --

console.log("Gemini Assistant: Content script loaded.");

// IMPORTANT: Replace with your actual API key.
const API_KEY = "AIzaSyCzo4iMxp6l1BHLLkTcpRJ2WQ58DvCiVUc"; // <<<<<<< REMEMBER TO PUT YOUR KEY HERE
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const ZENDESK_EDITOR_SELECTOR =
  "[data-test-id='omnicomposer-rich-text-ckeditor']";

/**
 * A simple diffing utility to compare two strings and highlight differences.
 * This is a basic implementation for demonstration.
 * @param {string} oldStr The original string.
 * @param {string} newStr The new string.
 * @returns {string} An HTML string with additions highlighted.
 */
function getHighlightedDiff(oldStr, newStr) {
  // Basic cleanup to handle HTML tags by treating them as text
  const cleanOld = oldStr
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cleanNew = newStr
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const oldWords = cleanOld.split(" ");
  const newWords = cleanNew.split(" ");

  const newWordsSet = new Set(newWords);
  let resultHtml = "";

  for (const word of newWords) {
    if (!new Set(oldWords).has(word)) {
      resultHtml += `<span class="gemini-highlight">${word}</span> `;
    } else {
      resultHtml += `${word} `;
    }
  }
  return `<p>${resultHtml.trim()}</p>`;
}

/**
 * Shows a modal preview box with the highlighted changes.
 * @param {string} originalText The original plain text.
 * @param {string} correctedHtml The corrected HTML from Gemini.
 * @param {HTMLElement} mainButton The main "Correct" button on the page.
 * @param {HTMLElement} editorElem The editor element to focus on paste.
 */
function showPreviewBox(originalText, correctedHtml, mainButton, editorElem) {
  // Remove any existing preview box
  const existingOverlay = document.getElementById("gemini-preview-overlay");
  if (existingOverlay) existingOverlay.remove();

  // Create overlay
  const overlay = document.createElement("div");
  overlay.id = "gemini-preview-overlay";

  // Create preview box
  const previewBox = document.createElement("div");
  previewBox.id = "gemini-preview-box";

  // Generate highlighted diff HTML
  const diffHtml = getHighlightedDiff(originalText, correctedHtml);

  previewBox.innerHTML = `
        <h3>Correction Preview</h3>
        <div class="gemini-preview-content">${diffHtml}</div>
        <div class="gemini-preview-actions">
            <button id="gemini-cancel-btn">Cancel</button>
            <button id="gemini-accept-btn">Accept & Copy</button>
        </div>
    `;

  overlay.appendChild(previewBox);
  document.body.appendChild(overlay);

  // Add event listeners
  document.getElementById("gemini-cancel-btn").onclick = () => {
    overlay.remove();
    mainButton.textContent = "✨ Correct";
    mainButton.disabled = false;
  };

  document.getElementById("gemini-accept-btn").onclick = async () => {
    try {
      const blob = new Blob([correctedHtml], { type: "text/html" });
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
    }
  };
}

/**
 * Sends text to the Gemini API for correction.
 * @param {string} text The plain text to correct.
 * @returns {Promise<string>} A promise that resolves to the corrected text as an HTML string.
 */
async function correctWithGemini(text) {
  if (!text || !text.trim()) {
    return "";
  }
  const prompt = `You are a helpful grammar correction assistant. Rewrite the following text to fix all grammar, spelling, and clarity issues. IMPORTANT: Your entire response must consist of ONLY the corrected text as a raw HTML string. Wrap each paragraph in <p> tags. Do NOT include "\`\`\`html", "\`\`\`", or any other markdown formatting in your response. Original Text: "${text}"`;

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
      return `<p>${text.replace(/\n/g, "</p><p>")}</p>`;
    }
  } catch (error) {
    console.error("Gemini Assistant: Exception while contacting API.", error);
    alert("Error contacting Gemini API. Check the console for details.");
    return `<p>${text.replace(/\n/g, "</p><p>")}</p>`;
  }
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

  let originalButtonText = "✨ Correct";

  btn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (btn.classList.contains("ready-to-paste")) {
      btn.textContent = originalButtonText;
      btn.classList.remove("ready-to-paste");
      return;
    }

    btn.textContent = "⏳ Correcting...";
    btn.disabled = true;

    const textToCorrect = editorElem.innerText;
    const correctedHtml = await correctWithGemini(textToCorrect);

    // Show the preview box instead of copying directly
    showPreviewBox(textToCorrect, correctedHtml, btn, editorElem);
  };

  editorElem.addEventListener("focus", () => {
    if (btn.classList.contains("ready-to-paste")) {
      btn.textContent = originalButtonText;
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
        position: absolute; bottom: 8px; right: 8px; z-index: 10000;
        font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background-color: #4285F4; color: white; border: none; border-radius: 8px;
        padding: 6px 14px; cursor: pointer; opacity: 0.9;
        transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      .gemini-correct-btn:hover { opacity: 1; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
      .gemini-correct-btn:disabled { background-color: #BDBDBD; cursor: not-allowed; }
      .gemini-correct-btn.ready-to-paste { background-color: #34A853; }

      #gemini-preview-overlay {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background-color: rgba(0, 0, 0, 0.6); z-index: 99998;
        display: flex; align-items: center; justify-content: center;
      }
      #gemini-preview-box {
        background-color: white; border-radius: 12px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        width: 90%; max-width: 600px;
        padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        z-index: 99999;
      }
      #gemini-preview-box h3 {
        margin-top: 0; color: #333;
      }
      .gemini-preview-content {
        background-color: #f9f9f9; border: 1px solid #ddd;
        border-radius: 8px; padding: 15px;
        max-height: 400px; overflow-y: auto;
        line-height: 1.6;
      }
      .gemini-highlight {
        background-color: #d4edda; /* Light green */
        color: #155724; /* Dark green */
        padding: 2px 4px; border-radius: 4px;
        font-weight: bold;
      }
      .gemini-preview-actions {
        margin-top: 20px; text-align: right;
      }
      .gemini-preview-actions button {
        padding: 10px 20px; border-radius: 8px; border: none;
        cursor: pointer; font-weight: bold;
        transition: background-color 0.2s;
      }
      #gemini-cancel-btn {
        background-color: #eee; color: #333; margin-right: 10px;
      }
      #gemini-cancel-btn:hover { background-color: #ddd; }
      #gemini-accept-btn {
        background-color: #4285F4; color: white;
      }
      #gemini-accept-btn:hover { background-color: #3367D6; }
    `;
  document.head.appendChild(style);
}

/**
 * Main function that finds and enhances all editors on the page.
 */
function findAndEnhanceEditors() {
  document.querySelectorAll(ZENDESK_EDITOR_SELECTOR).forEach(addGeminiButton);
}

// --- SCRIPT EXECUTION ---
addGlobalStyles();
const observer = new MutationObserver(findAndEnhanceEditors);
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener("load", findAndEnhanceEditors);
