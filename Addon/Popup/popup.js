document.addEventListener('DOMContentLoaded', () => {
  // Find the currently active tab.
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    // Error checking: Stop if tabs are empty or undefined.
    if (!tabs || tabs.length === 0) return;

    const tab = tabs[0];
    const url = new URL(tab.url);
    const hostname = url.hostname;

    const siteNameEl = document.getElementById('site-name');
    const statusTextEl = document.getElementById('status-text');
    const toggleBtn = document.getElementById('toggle-btn');

    siteNameEl.innerText = hostname;

    // Read the status from Storage.
    chrome.storage.local.get([hostname], (result) => {
      let isDeactivated = result[hostname] === true;
      updateUI(isDeactivated, hostname, statusTextEl, toggleBtn);
    });

    // Update the button click section in popup.js as follows:
    toggleBtn.onclick = () => {
    chrome.storage.local.get([hostname], (result) => {
        let newState = !result[hostname];
        chrome.storage.local.set({ [hostname]: newState }, () => {
        updateUI(newState, hostname, statusTextEl, toggleBtn);
      
      // Inform the background to update the menu instantly, or refresh the page.
      chrome.tabs.reload(tab.id); 
    });
  });
};
  });
});

function updateUI(deactive, hostname, statusTextEl, toggleBtn) {
  if (deactive) {
    statusTextEl.innerHTML = `MorgiFile is <b style="color:#cf6679">deactive</b> on <span class="hostname">${hostname}</span>.`;
    toggleBtn.innerText = "Activate";
    toggleBtn.className = "btn-active";
  } else {
    statusTextEl.innerHTML = `MorgiFile is <b style="color:#03dac6">active</b> on <span class="hostname">${hostname}</span>.`;
    toggleBtn.innerText = "Deactivate";
    toggleBtn.className = "btn-deactive";
  }
}
