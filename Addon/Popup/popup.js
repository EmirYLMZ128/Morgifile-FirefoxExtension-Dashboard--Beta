document.addEventListener('DOMContentLoaded', () => {
  // Mevcut aktif sekmeyi bul
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    // Hata kontrolü: Eğer tabs boşsa veya tanımsızsa dur
    if (!tabs || tabs.length === 0) return;

    const tab = tabs[0];
    const url = new URL(tab.url);
    const hostname = url.hostname;

    const siteNameEl = document.getElementById('site-name');
    const statusTextEl = document.getElementById('status-text');
    const toggleBtn = document.getElementById('toggle-btn');

    siteNameEl.innerText = hostname;

    // Storage'dan durumu oku
    chrome.storage.local.get([hostname], (result) => {
      let isDeactivated = result[hostname] === true;
      updateUI(isDeactivated, hostname, statusTextEl, toggleBtn);
    });

    // popup.js içinde buton tıklama kısmını şu şekilde güncelle
    toggleBtn.onclick = () => {
    chrome.storage.local.get([hostname], (result) => {
        let newState = !result[hostname];
        chrome.storage.local.set({ [hostname]: newState }, () => {
        updateUI(newState, hostname, statusTextEl, toggleBtn);
      
      // Menüyü anında güncellemesi için background'a haber ver veya sayfayı yenile
      chrome.tabs.reload(tab.id); 
    });
  });
};
  });
});

function updateUI(deactive, hostname, statusTextEl, toggleBtn) {
  if (deactive) {
    statusTextEl.innerHTML = `MorgiFile <span class="hostname">${hostname}</span> sitesinde <b style="color:#cf6679">devre dışıdır</b>.`;
    toggleBtn.innerText = "Bu sitede aktif et";
    toggleBtn.className = "btn-active";
  } else {
    statusTextEl.innerHTML = `MorgiFile <span class="hostname">${hostname}</span> sitesinde <b style="color:#03dac6">aktiftir</b>.`;
    toggleBtn.innerText = "Bu sitede deaktif et";
    toggleBtn.className = "btn-deactive";
  }
}
