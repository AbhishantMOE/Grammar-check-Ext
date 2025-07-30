const API_KEY = "AIzaSyCzo4iMxp6l1BHLLkTcpRJ2WQ58DvCiVUc";
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "modify_text") {
    const { text, prompt } = request;

    fetch(`${GEMINI_API_URL}?key=${API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${prompt}: ${text}`,
              },
            ],
          },
        ],
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.candidates && data.candidates.length > 0) {
          const modifiedText = data.candidates[0].content.parts[0].text;
          sendResponse({ modifiedText });
        } else {
          console.error("No candidates returned from Gemini API:", data);
          sendResponse({ modifiedText: text }); // Return original text on error
        }
      })
      .catch((error) => {
        console.error("Error calling Gemini API:", error);
        sendResponse({ modifiedText: text }); // Return original text on error
      });

    return true; // Indicates that the response is sent asynchronously
  }
});
