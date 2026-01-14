// =====================
// SITE DISABLE CHECK
// =====================
chrome.storage.local.get([window.location.hostname], (res) => {
  if (res[window.location.hostname] === true) {
    console.log("MorgiFile bu sitede deaktif.");
    return;
  }
  mainEklentiKodlari();
});

// =====================
// GLOBALS
// =====================
let lastX = 0;
let lastY = 0;
let categoryCache = null;

const BG_IMAGE_REGEX = /url\(["']?([^"']*)["']?\)/;

// =====================
// MAIN
// =====================
function mainEklentiKodlari() {
  document.addEventListener(
    "contextmenu",
    (e) => {
      lastX = e.clientX;
      lastY = e.clientY;
    },
    true
  );

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "LOG_NEAREST_IMAGE") {
      const images = findBestImages(lastX, lastY);
      if (!images.length) return;

      images.length === 1
        ? showCategoryModal(images[0].url)
        : showInitialPicker(images);
    }
  });
}

// =====================
// SHADOW HOST
// =====================
function createShadowHost(id) {
  document.getElementById(id)?.remove();

  const host = document.createElement("div");
  host.id = id;
  host.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999999;";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  const overlay = document.createElement("div");
  overlay.className = "radar-overlay";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) host.remove();
  });

  const style = document.createElement("style");
  style.textContent = STYLES;

  shadow.append(style, overlay);
  return { host, shadow, overlay };
}

// =====================
// INITIAL PICKER
// =====================
function showInitialPicker(images) {
  const { host, shadow, overlay } = createShadowHost("morgi-picker-host");

  const modal = document.createElement("div");
  modal.className = "picker-modal";
  modal.innerHTML = `
    <h2 style="color:#fff;text-align:center;">Hangi Görseli Kaydetmek İstersiniz?</h2>
    <div class="grid"></div>
  `;

  const grid = modal.querySelector(".grid");

  images.forEach((imgData) => {
    const item = document.createElement("div");
    item.className = "grid-item";

    const img = new Image();
    img.src = imgData.url;
    img.onload = () => {
      item.querySelector(
        ".img-resolution"
      ).innerText = `${img.naturalWidth} x ${img.naturalHeight} PX`;
    };

    item.innerHTML = `
      <img src="${imgData.url}">
      <span class="img-resolution">Yükleniyor...</span>
    `;

    item.onclick = () => {
      host.remove();
      showCategoryModal(imgData.url);
    };

    grid.appendChild(item);
  });

  overlay.appendChild(modal);
}

// =====================
// CATEGORY MODAL
// =====================
async function showCategoryModal(imgUrl) {

  // 🚀 BURASI KRİTİK: Her açılışta eski listeyi unut ki taze liste çekilsin
  categoryCache = null;

  const { host, shadow, overlay } = createShadowHost("morgi-main-host");
  overlay.appendChild(buildModalHTML(imgUrl, location.hostname));
  setupModalLogic(shadow, host, imgUrl);
}

// =====================
// MODAL HTML
// =====================
function buildModalHTML(imgUrl, siteAddress) {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="left"><img src="${imgUrl}"></div>
    <div class="right">
      <div>
        <h2>🐾 MorgiFile Detayları</h2>
        <div class="info-row">
          <label>Görselin Adresi</label>
          <a href="${imgUrl}" target="_blank" class="info-link">${imgUrl.substring(
    0,
    45
  )}...</a>
        </div>
        <div class="info-row">
          <label>Görselin Boyutları</label>
          <div class="info-val" id="radar-res-val">Yükleniyor...</div>
        </div>
        <div class="info-row">
          <label>Site Adresi</label>
          <div class="info-val">${siteAddress}</div>
        </div>
        <label>Koleksiyon / Kategori</label>
        <div class="custom-select-wrapper">
          <div class="custom-select" id="radar-trigger">Bir kategori seçin...</div>
          <div class="custom-options" id="radar-options"></div>
        </div>
      </div>
      <button id="save-btn">Kategori Seçin</button>
    </div>
  `;
  return modal;
}

// =====================
// MODAL LOGIC
// =====================
async function setupModalLogic(shadow, host, imgUrl) {
  const resEl = shadow.getElementById("radar-res-val");
  const btn = shadow.getElementById("save-btn");
  const trigger = shadow.getElementById("radar-trigger");
  const optionsMenu = shadow.getElementById("radar-options");

  const img = new Image();
  img.src = imgUrl;
  img.onload = () => {
    resEl.innerText = `${img.naturalWidth} x ${img.naturalHeight} PX`;
  };

  const categories = await loadCategories();
  categories.forEach((cat) => {
    // 🛡️ KORUMA: Eğer kategori ismi buysa, listeye ekleme (atla)
    if (cat.name === "Kategorize Edilmemiş Favoriler") {
      return; 
    }

    const div = document.createElement("div");
    div.className = "custom-option";
    div.innerText = cat.name;
    div.onclick = (e) => {
      e.stopPropagation();
      trigger.innerText = cat.name;
      optionsMenu.classList.remove("show");
      btn.innerText = `💾 ${cat.name} Kategorisine Ekle`;
      btn.classList.add("active");
      btn.dataset.category = cat.name;
    };
    optionsMenu.appendChild(div);
  });

  trigger.onclick = (e) => {
    e.stopPropagation();
    optionsMenu.classList.toggle("show");
  };

  shadow.addEventListener("click", () =>
    optionsMenu.classList.remove("show")
  );

  btn.onclick = () => handleSave(btn, shadow, host, imgUrl);
}

// =====================
// SAVE HANDLER
// =====================
async function handleSave(btn, shadow, host, imgUrl) {
  // 🔒 DUPLICATE CHECK (SERVER'A GİTMEDEN)
  const exists = await isImageAlreadySaved(imgUrl);
  if (exists) {
    showInlineMessage("⚠️ Bu görsel zaten kaydedilmiş");
    return;
  }

  if (!btn.classList.contains("active")) return;

  const { width, height } = parseResolution(
    shadow.getElementById("radar-res-val").innerText
  );

  const payload = {
    site: location.hostname,
    originalUrl: imgUrl,
    category: btn.dataset.category,
    width,
    height
  };

  btn.innerText = "⏳ Kaydediliyor...";
  btn.classList.remove("active");
  btn.style.background = "#4b4b4b";

  try {
    const res = await fetch("http://127.0.0.1:8000/add-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      // ✅ BAŞARILI → LOCAL'E İŞARETLE
      markImageAsSaved(imgUrl);

      btn.innerText = "✅ Başarıyla Kaydedildi!";
      btn.style.background = "#10b981";
      setTimeout(() => host.remove(), 1200);
    } else {
      btn.innerText = "❌ Hata Oluştu!";
      btn.style.background = "#ef4444";
    }
  } catch {
    btn.innerText = "📡 Bağlantı Yok!";
    btn.style.background = "#ef4444";
  }
}

// =====================
// HELPERS
// =====================
function parseResolution(text) {
  const m = text.match(/(\d+)\s*x\s*(\d+)/);
  return m
    ? { width: parseInt(m[1]), height: parseInt(m[2]) }
    : { width: 0, height: 0 };
}


async function loadCategories() {

  if (categoryCache) return categoryCache;
  try {
    const res = await fetch(chrome.runtime.getURL("categories.json"));
    const data = await res.json();
    categoryCache = data.categories;
  } catch {

    categoryCache = [{ name: "Genel"}];

  }

  return categoryCache;
} 

// =====================
// DUPLICATE CHECK (LOCAL)
// =====================
function isImageAlreadySaved(url) {
  return new Promise((resolve) => {
    chrome.storage.local.get(["savedImages"], (res) => {
      const list = res.savedImages || [];
      resolve(list.includes(url));
    });
  });
}

function markImageAsSaved(url) {
  chrome.storage.local.get(["savedImages"], (res) => {
    const list = res.savedImages || [];
    if (!list.includes(url)) {
      list.push(url);
      chrome.storage.local.set({ savedImages: list });
    }
  });
}

// =====================
// IMAGE FINDER
// =====================
function findBestImages(x, y) {
  const els = document.querySelectorAll(
    "img,[role='img'],[style*='background-image']"
  );
  const matches = [];

  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) continue;

    const dx = Math.max(r.left - x, 0, x - r.right);
    const dy = Math.max(r.top - y, 0, y - r.bottom);
    const dist = Math.hypot(dx, dy);
    if (dist > 30) continue;

    let url =
      el.tagName === "IMG"
        ? el.currentSrc || el.src
        : (getComputedStyle(el).backgroundImage.match(BG_IMAGE_REGEX) || [])[1];

    if (url && !url.includes("data:image/svg")) {
      matches.push({ url, area: r.width * r.height, dist });
    }
  }

  return [...new Map(matches.map((m) => [m.url, m])).values()].sort(
    (a, b) => a.dist - b.dist || b.area - a.area
  );
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action !== "LOG_NEAREST_IMAGE") return;
  document.addEventListener(
    "contextmenu",
    (e) => {
      lastX = e.clientX;
      lastY = e.clientY;
    },
    true
  );
  const images = findBestImages(lastX, lastY);

  // 👇 TAM OLARAK BURASI
  if (!images.length) {
    showInlineMessage("Bu noktada görsel bulunamadı");
    return;
  }

  // buradan sonra modal / picker / save akışı
  if (images.length === 1) {
    showCategoryModal(images[0].url);
  } else {
    showInitialPicker(images);
  }
});

function showInlineMessage(text) {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #1e1e1e;
    color: #fff;
    padding: 12px 20px;
    border-radius: 12px;
    border: 1px solid #333;
    z-index: 99999999;
    font-size: 14px;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}


// =====================
// STYLES (UNCHANGED)
// =====================
const STYLES = `
/* Menü konteynerinin kendisi (opsiyonel ama daha temiz durur) */
.custom-options {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: #252525;
    border: 1px solid #333;
    border-radius: 10px; /* Ana çerçeve yuvarlağı */
    display: none;
    z-index: 100;
    box-shadow: 0 10px 20px rgba(0,0,0,0.5);
    overflow: hidden; /* İçerideki çocukların taşmasını engeller, radiusu korur */
}

/* İlk seçeneğin üst köşelerini yuvarla */
.custom-option:first-child {
    border-top-left-radius: 10px;
    border-top-right-radius: 10px;
}

/* Son seçeneğin alt köşelerini yuvarla ve alt çizgiyi kaldır */
.custom-option:last-child {
    border-bottom-left-radius: 10px;
    border-bottom-right-radius: 10px;
    border-bottom: none;
}

.custom-options {
    max-height: 250px; /* Çok fazla kategori varsa kutu devleşmesin */
    overflow-y: auto;  /* Kaydırma çubuğu çıksın */
}

.radar-overlay {
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.85);
    display: flex;
    justify-content: center;
    align-items: center;
    backdrop-filter: blur(8px);
    font-family: sans-serif;
}

.picker-modal {
    background: #1e1e1e;
    padding: 30px;
    border-radius: 20px;
    width: 90vw;
    max-width: 1000px;
    max-height: 85vh;
    border: 1px solid #333;
    display: flex;
    flex-direction: column;
}

.grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 20px;
    overflow-y: auto;
    padding: 10px;
    margin-top: 20px;
}

.grid-item {
    cursor: pointer;
    border: 2px solid #333;
    padding: 15px;
    border-radius: 15px;
    background: #252525;
    transition: 0.3s;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.grid-item:hover {
    border-color: #6366f1;
    transform: scale(1.02);
}

.grid-item img {
    width: 100%;
    height: 250px;
    object-fit: contain;
    border-radius: 8px;
    margin-bottom: 10px;
}

.img-resolution {
    background: #121212;
    color: #6366f1;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: bold;
    border: 1px solid #333;
}

.modal {
    display: flex;
    background: #121212;
    width: 90vw;
    max-width: 900px;
    height: 600px;
    border-radius: 20px;
    overflow: visible;
    box-shadow: 0 30px 60px rgba(0,0,0,0.5);
    border: 1px solid #2a2a2a;
    color: white;
}

.left {
    border-radius: 20px 0px 0px 20px;
    flex: 1.2;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
}

.left img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
}

.right {
    flex: 1;
    padding: 40px;
    border-radius: 0px 20px 20px 0px;
    background: #1e1e1e;
    border-left: 1px solid #2a2a2a;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
}

.custom-select-wrapper {
    position: relative;
    overflow: visible;
    margin-top: 10px;
}

.custom-select {
    background: #2a2a2a;
    color: #eee;
    padding: 14px;
    border-radius: 10px;
    border: 1px solid #333;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.custom-options.show {
    display: block;
}

.custom-option {
    padding: 12px 15px;
    cursor: pointer;
    border-bottom: 1px solid #2a2a2a;
}

.custom-option:hover {
    background: #6366f1;
    color: white;
}

button {
    width: 100%;
    padding: 18px;
    border-radius: 12px;
    border: none;
    background: #2a2a2a;
    color: #555;
    font-size: 16px;
    font-weight: bold;
    cursor: not-allowed;
    transition: 0.3s;
}

button.active {
    background: #6366f1;
    color: white;
    cursor: pointer;
}

label {
    color: #777;
    font-size: 11px;
    text-transform: uppercase;
    font-weight: bold;
}

.info-val {
    color: #bbb;
    margin: 8px 0 25px 0;
}

.info-row {
    margin-bottom: 20px;
}

.info-link {
    color: #6366f1;
    text-decoration: none;
    font-size: 13px;
    word-break: break-all;
    display: block;
    margin-top: 5px;
}

h2 {
    margin: 0;
}
`;
