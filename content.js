// Chrome extension content script for Zendesk reply box grammar correction using Gemini API
// -- FINAL VERSION v4: CORRECTED DATA PARSING --

console.log("Gemini Assistant: Content script loaded.");

// IMPORTANT: Replace with your actual API key.
const API_KEY = "AIzaSyCzo4iMxp6l1BHLLkTcpRJ2WQ58DvCiVUc"; // <<<<<<< REMEMBER TO PUT YOUR KEY HERE
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const ZENDESK_EDITOR_SELECTOR =
  "[data-test-id='omnicomposer-rich-text-ckeditor']";

/**
 * Sends text to the Gemini API for correction.
 * @param {string} text The plain text to correct.
 * @returns {Promise<string>} A promise that resolves to the corrected text as an HTML string.
 */
async function correctWithGemini(text) {
  if (!text || !text.trim()) {
    return "";
  }

  const prompt = `You are a helpful grammar correction assistant. Rewrite the following text to fix all grammar, spelling, and clarity issues.
  IMPORTANT:
  - Your entire response must consist of ONLY the corrected text as a raw HTML string.
  - Wrap each paragraph in <p> tags.
  - Do NOT include "\`\`\`html", "\`\`\`", or any other markdown formatting in your response.

  Original Text:
  "${text}"`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();

    // --- THIS IS THE CORRECTED LOGIC ---
    // Defensively parse the response with the correct [0] indices.
    if (
      data &&
      data.candidates &&
      data.candidates.length > 0 &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts.length > 0 &&
      data.candidates[0].content.parts[0].text
    ) {
      // Access the response with the correct path.
      let correctedText = data.candidates[0].content.parts[0].text.trim();

      // Manually remove markdown code blocks as a safety net.
      if (correctedText.startsWith("```html")) {
        correctedText = correctedText.substring(7);
      }
      if (correctedText.endsWith("```")) {
        correctedText = correctedText.slice(0, -3);
      }

      return correctedText.trim();
    } else {
      console.warn(
        "Gemini Assistant: Received an invalid or empty response from the API.",
        JSON.stringify(data)
      );
      // Fallback: return the original text formatted as HTML
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

    // Check if the corrected text is different from the original before proceeding.
    if (
      correctedHtml.trim() ===
      `<p>${textToCorrect.replace(/\n/g, "</p><p>")}</p>`.trim()
    ) {
      console.log(
        "Gemini Assistant: No changes were made or the API returned the original text."
      );
      btn.textContent = "No Changes Needed";
      setTimeout(() => {
        btn.textContent = originalButtonText;
      }, 2000);
      btn.disabled = false;
      return;
    }

    try {
      const blob = new Blob([correctedHtml], { type: "text/html" });
      const clipboardItem = new ClipboardItem({ "text/html": blob });

      await navigator.clipboard.write([clipboardItem]);

      console.log(
        "Gemini Assistant: Corrected text copied to clipboard. Notifying user to paste."
      );

      btn.textContent = "✅ Ready to Paste! (Press Ctrl+V)";
      btn.disabled = false;
      btn.classList.add("ready-to-paste");

      editorElem.focus();
      document.execCommand("selectAll", false, null);
    } catch (err) {
      console.error("Gemini Assistant: Failed to use Clipboard API.", err);
      alert(
        "A critical error occurred while trying to copy the corrected text."
      );
      btn.textContent = originalButtonText;
      btn.disabled = false;
    }
  };

  editorElem.addEventListener("focus", () => {
    if (btn.classList.contains("ready-to-paste")) {
      btn.textContent = originalButtonText;
      btn.classList.remove("ready-to-paste");
    }
  });
}

/**
 * Injects the necessary CSS for the button into the page.
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
