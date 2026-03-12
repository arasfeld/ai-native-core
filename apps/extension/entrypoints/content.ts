export default defineContentScript({
  matches: ["*://*/*"],
  main() {
    console.log("AI Native Core content script loaded.");
  },
});
