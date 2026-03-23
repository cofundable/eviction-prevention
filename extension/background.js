chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "save-case") {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const caseId =
          new URL(location.href).searchParams.get("caseId") || document.title;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(
          new Blob([document.documentElement.outerHTML], { type: "text/html" })
        );
        a.download = caseId + ".html";
        a.click();
      },
    });
  }
});
