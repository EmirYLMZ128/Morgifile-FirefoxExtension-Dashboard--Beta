import os
import json
import uuid
import urllib.parse
from typing import Optional, List
from contextlib import asynccontextmanager

import asyncio
import time
import shutil
import pathlib

import requests
from httpx import AsyncClient

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from pydantic import BaseModel






db_lock = asyncio.Lock()

# =====================
# APP SETUP
# =====================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_FILE = os.path.join("Dashboard", "database", "images.json")
CAT_LIST = os.path.join("..", "Addon", "categories.json")
DOWNLOADS_PATH = str(os.path.join(pathlib.Path.home(), "Downloads"))
SAFE_STORAGE = os.path.join(os.getenv('APPDATA'), 'MorgiFile', 'Safe')
os.makedirs(SAFE_STORAGE, exist_ok=True)

# =====================
# SCHEMAS
# =====================
class ImageSaveSchema(BaseModel):
    site: str
    originalUrl: str
    category: str
    width: int = 0
    height: int = 0
    aspectRatio: Optional[str] = None
    


class CategoryCreateSchema(BaseModel):
    name: str

class CategoryRenameSchema(BaseModel):
    oldName: str
    newName: str
    merge: bool = False

class CategoryDeleteSchema(BaseModel):
    name: str
    action: Optional[str] = None   # delete_images | move_images
    moveTo: Optional[str] = None


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        dead_connections = []

        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                dead_connections.append(connection)

        # Ölmüş socket'leri temizle
        for dc in dead_connections:
            self.disconnect(dc)


manager = ConnectionManager()

# =====================
# DB HELPERS
# =====================
def init_db():
    os.makedirs(os.path.dirname(DB_FILE), exist_ok=True)
    if not os.path.exists(DB_FILE):
        write_db([])


def read_db() -> List[dict]:
    try:
        with open(DB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError:
        return []


def write_db(data: List[dict]):
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

def init_categories():
    os.makedirs(os.path.dirname(CAT_LIST), exist_ok=True)
    if not os.path.exists(CAT_LIST):
        write_categories({
            "categories": [
                { "name": "Kategorize Edilmemiş Favoriler" }
            ]
        })


def read_categories() -> dict:
    try:
        if not os.path.exists(CAT_LIST):
            return {"categories": []}
        with open(CAT_LIST, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return {"categories": []}

def write_categories(data: dict):
    with open(CAT_LIST, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)


def check_images_health():
    data = read_db()  # Mevcut JSON listeni yükleyen fonksiyonun
    updated = False
    
    print("🔍 Görsel sağlık kontrolü başlatılıyor...")
    
    for img in data:
        # Zaten ölü olarak işaretlenmişse veya yerel dosyaysa atla
        if img.get("isDead") or img["originalUrl"].startswith("images/"):
            continue
            
        try:
            # Sadece başlıkları kontrol et (resmi indirmez, çok hızlıdır)
            # allow_redirects=True önemli, çünkü Instagram yönlendirme yapabilir
            response = requests.head(img["originalUrl"], timeout=5, allow_redirects=True)
            
            # Eğer status 400 ve üzerindeyse (404, 410 vb.) bu link ölmüştür
            if response.status_code >= 400:
                print(f"💀 Ölü görsel tespit edildi (Status {response.status_code}): {img['id']}")
                img["isDead"] = True
                updated = True
        except Exception as e:
            # Zaman aşımı veya erişim hatası durumunda da ölü sayabiliriz
            # Ama internetin kesik olma ihtimaline karşı dikkatli olmalı
            print(f"⚠️ Bağlantı hatası ({img['id']}): {e}")
            # Opsiyonel: img["isDead"] = True (Burayı şimdilik kapalı tutabilirsin)

    if updated:
        write_db(data)
        print("✅ JSON güncellendi.")
    else:
        print("✨ Tüm görseller sağlıklı veya zaten işaretlenmiş.")


init_db()
init_categories()

# =====================
# ENDPOINTS
# =====================
@app.on_event("startup")
async def startup_event():
    # Uygulama açıldığında bir kez kontrol et
    check_images_health()


@app.post("/images/{img_id}/verify-and-shield")
async def verify_shield(img_id: str):
    # 1. Downloads tara
    try:
        files = [os.path.join(DOWNLOADS_PATH, f) for f in os.listdir(DOWNLOADS_PATH)]
    except Exception:
        raise HTTPException(status_code=500, detail="İndirme klasörüne erişilemedi.")

    if not files:
        raise HTTPException(status_code=404, detail="İndirme klasörü boş görünüyor.")

    # 2. En yeniye göre diz
    files.sort(key=os.path.getmtime, reverse=True)

    # 3. Son 60 saniye içindeki görseli bul
    target_file = None
    now = time.time()
    for f in files:
        if os.path.isfile(f) and (now - os.path.getmtime(f) < 60):
            if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                target_file = f
                break

    if target_file:
        ext = os.path.splitext(target_file)[1]
        new_name = f"{img_id}{ext}"
        final_path = os.path.join(SAFE_STORAGE, new_name)
        
        # Dosyayı taşı
        shutil.move(target_file, final_path)
        
        # 🔥 İŞTE EKSİK OLAN KISIM: DB GÜNCELLEME
        all_images = read_db() # JSON dosyanı oku
        updated = False
        
        for img in all_images:
            if img["id"] == img_id:
                img["isSafe"] = True
                img["SafePath"] = final_path
                updated = True
                break
        # ... (dosya taşıma ve JSON yazma işlemleri bittikten sonra)
        if updated:
            write_db(all_images)
            
            # 📡 WEB SOCKET YAYINI: Tüm istemcilere "veriler değişti, yenilenin" de
            if manager: # Senin WebSocket manager nesnenin adı neyse (genelde manager olur)
                await manager.broadcast({"type": "RELOAD_DATA", "message": "Görsel kalkan altına alındı!"})
                
            return {"status": "success", "safe_path": final_path}
        else:
            raise HTTPException(status_code=404, detail="Görsel veritabanında bulunamadı.")
    
    raise HTTPException(status_code=404, detail="Yeni bir görsel dosyası bulunamadı.")
    
@app.post("/add-image")
async def add_image(data: ImageSaveSchema):
    async with db_lock:
        try:
            db = read_db()

            # DUPLICATE CHECK
            if any(img.get("originalUrl") == data.originalUrl for img in db):
                return {
                    "status": "already_exists",
                    "message": "Bu görsel zaten kayıtlı."
                }

            new_entry = {
                "id": str(uuid.uuid4()),
                "site": data.site,
                "originalUrl": data.originalUrl,
                "ProxyUrl": str(),
                "SafePath":str(),
                "category": data.category,
                "width": data.width,
                "height": data.height,
                "isFavorite": False,
                "isDeleted": False,
                "isDead": False,
                "isCORS":False,
                "isSafe": False
            }

            db.append(new_entry)
            write_db(db)

            await manager.broadcast({
                "type": "NEW_IMAGE",
                "payload": new_entry
            })

            return {
                "status": "success",
                "id": new_entry["id"]
            }

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Sunucu kayıt hatası: {str(e)}"
            )


@app.get("/images")
async def get_images():
    try:
        # check_images_health()  <-- BURAYI YORUMA AL VEYA SİL
        with open(DB_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data
    except Exception as e:
        raise HTTPException(status_code=500, detail="Veriler okunamadı")

@app.get("/categories")
async def get_categories():
    cats = read_categories()
    return {
        "categories": cats.get("categories", [])
    }


@app.post("/categories")
async def add_category(data: CategoryCreateSchema):
    cats = read_categories()
    categories = cats.get("categories", [])

    name = data.name.strip()

    if not name:
        raise HTTPException(400, "Kategori adı boş")

    if any(c["name"].lower() == name.lower() for c in categories):
        raise HTTPException(409, "Kategori zaten var")

    new_cat = { "name": name }
    categories.append(new_cat)

    write_categories({ "categories": categories })

    return new_cat


@app.delete("/categories")
async def delete_category(data: CategoryDeleteSchema):
    cats = read_categories()
    categories = cats.get("categories", [])
    name = data.name

    if not any(c["name"] == name for c in categories):
        raise HTTPException(404, "Kategori yok")

    images = read_db()

    # 👉 Silinmemiş ve bu kategoriye ait görseller
    related = [
        img for img in images
        if img.get("category") == name and not img.get("isDeleted")
    ]

    # 🔍 SADECE KONTROL (ilk istek)
    if related and not data.action:
        return {
            "status": "has_images",
            "count": len(related)
        }

    # ⭐ FAVORİ / NORMAL AYRIMI
    favorite_images = [img for img in related if img.get("isFavorite")]
    normal_images = [img for img in related if not img.get("isFavorite")]

    # ⭐ FAVORİLER ASLA SİLİNMEZ
    if favorite_images:
        # Eğer bu kategori henüz yoksa listeye ekle
        if not any(c["name"] == "Kategorize Edilmemiş Favoriler" for c in categories):
            categories.append({"name": "Kategorize Edilmemiş Favoriler"})

        for img in favorite_images:
            img["category"] = "Kategorize Edilmemiş Favoriler"

    # 🔥 NORMAL GÖRSELLERİ SİL
    if data.action == "delete_images":
        for img in normal_images:
            img["isDeleted"] = True

    # 🔁 NORMAL GÖRSELLERİ TAŞI
    elif data.action == "move_images":
        if not data.moveTo:
            raise HTTPException(400, "moveTo gerekli")

        for img in normal_images:
            img["category"] = data.moveTo

    # ❌ KATEGORİYİ SİL
    categories = [c for c in categories if c["name"] != name]

    write_db(images)
    write_categories({ "categories": categories })

    await manager.broadcast({
        "type": "CATEGORIES_UPDATED",
        "payload": read_categories().get("categories", [])
    })

    return {
        "status": "deleted",
        "affected": len(related),
        "favorites_protected": len(favorite_images)
    }


@app.patch("/categories/rename")
async def rename_category(data: CategoryRenameSchema):
    old = data.oldName.strip()
    new = data.newName.strip()

    if not old or not new:
        raise HTTPException(400, "Kategori adı boş olamaz")

    cats = read_categories()
    categories = cats.get("categories", [])

    exists_old = any(c["name"] == old for c in categories)
    exists_new = any(c["name"] == new for c in categories)

    if not exists_old:
        raise HTTPException(404, "Eski kategori bulunamadı")

    # ⚠️ Aynı isim varsa
    if exists_new and not data.merge:
        return {
            "status": "conflict",
            "message": "Kategori zaten var",
            "canMerge": True
        }

    # =====================
    # KATEGORİ LİSTESİ
    # =====================
    new_categories = []
    for c in categories:
        if c["name"] == old:
            if not exists_new:
                new_categories.append({ "name": new })
        else:
            new_categories.append(c)

    write_categories({ "categories": new_categories })

    # =====================
    # GÖRSELLER
    # =====================
    images = read_db()
    for img in images:
        if img.get("category") == old:
            img["category"] = new

    write_db(images)

    return {
        "status": "merged" if exists_new else "renamed",
        "old": old,
        "new": new
    }


@app.patch("/images/toggle-favorite/{image_id}")
async def toggle_favorite(image_id: str):
    async with db_lock:
        db = read_db()
        updated = None

        for img in db:
            if img["id"] == image_id:
                # 🗑️ Çöpteyse favori yapılamaz
                if img.get("isDeleted"):
                    raise HTTPException(400, "Silinmiş görsel favori yapılamaz")

                img["isFavorite"] = not img.get("isFavorite", False)
                updated = img
                break

        if not updated:
            raise HTTPException(404, "Görsel bulunamadı")

        write_db(db)

        # 🔔 Frontend’e haber ver
        await manager.broadcast({
            "type": "FAVORITE_TOGGLED",
            "payload": {
                "id": image_id,
                "isFavorite": updated["isFavorite"]
            }
        })

        return {
            "status": "success",
            "id": image_id,
            "isFavorite": updated["isFavorite"]
        }

@app.patch("/images/change-category")
async def change_category(payload: dict):
    img_id = payload["id"]
    category = payload["category"]
    restore = payload.get("restore", False)

    async with db_lock:
        db = read_db()

        for img in db:
            if img["id"] == img_id:
                img["category"] = category
                if restore:
                    img["isDeleted"] = False
                break
        else:
            raise HTTPException(404, "Görsel bulunamadı")

        write_db(db)

    await manager.broadcast({
        "type": "IMAGE_UPDATED",
        "payload": {
            "id": img_id,
            "category": category,
            "isDeleted": False if restore else None
        }
    })

    return {"status": "ok"}



@app.delete("/empty-trash")
async def empty_trash():
    async with db_lock:
        data = read_db()
        
        # 1. Silinecek olanları (isDeleted=True olanları) ayıkla
        trash_items = [img for img in data if img.get("isDeleted", False)]
        
        # 2. Bu silinecekler arasında 'isSafe' olanların dosyalarını diskten sil
        for img in trash_items:
            if img.get("isSafe") and img.get("SafePath"):
                safe_path = os.path.normpath(img["SafePath"])
                try:
                    if os.path.exists(safe_path):
                        os.remove(safe_path)
                        print(f"🗑️ Diskten silindi: {safe_path}")
                except Exception as e:
                    print(f"⚠️ Dosya silinirken hata ( {safe_path} ): {e}")

        # 3. Veritabanını temizle (isDeleted olmayanları tut)
        new_data = [img for img in data if not img.get("isDeleted", False)]
        write_db(new_data)

        # 📡 Sinyali gönder
        await manager.broadcast({
            "type": "TRASH_EMPTIED"
        })

    return {"message": "Geri dönüşüm kutusu ve fiziksel dosyalar temizlendi"}

@app.delete("/images/permanent-delete/{img_id}")
async def permanent_delete(img_id: str):
    data = read_db()
    img = next((i for i in data if i["id"] == img_id), None)
    
    if not img:
        raise HTTPException(status_code=404, detail="Görsel bulunamadı")

    # 🔥 KRİTİK NOKTA: Eğer görsel kalkandaysa dosyayı diskten sil
    if img.get("isSafe") and img.get("SafePath"):
        safe_path = os.path.normpath(img["SafePath"])
        try:
            if os.path.exists(safe_path):
                os.remove(safe_path)
                print(f"🗑️ Dosya diskten silindi: {safe_path}")
        except Exception as e:
            print(f"⚠️ Dosya silinirken hata oluştu: {e}")

    # Veritabanından (JSON) görseli kaldır
    new_data = [i for i in data if i["id"] != img_id]
    write_db(new_data)
    
    return {"status": "success", "message": "Görsel ve yerel dosya silindi"}

@app.patch("/images/{image_id}/trash")
async def move_image_to_trash(image_id: str):
    async with db_lock:
        db = read_db()
        updated = False

        for img in db:
            if img["id"] == image_id:
                if img.get("isFavorite"):
                    raise HTTPException(400, "Favoriler silinemez")

                img["isDeleted"] = True
                updated = True
                break

        if not updated:
            raise HTTPException(404, "Görsel bulunamadı")

        write_db(db)

        await manager.broadcast({
            "type": "IMAGE_TRASHED",
            "payload": { "id": image_id }
        })

        return { "status": "trashed" }



@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # ping için
    except:
        manager.disconnect(websocket)

@app.get("/safe-file")
async def get_safe_file(path: str):
    # Gelen yolu Windows formatına uygun hale getir
    safe_path = os.path.normpath(path)
    if os.path.exists(safe_path):
        return FileResponse(safe_path)
    return {"error": "Dosya yok"}


@app.post("/images/{img_id}/proxy-enable")
async def enable_proxy(img_id: str):
    data = read_db()
    updated_img = None

    for img in data:
        if img["id"] == img_id:
            img["isCORS"] = True
            # URL'i tam olarak güvenli hale getiriyoruz
            original_url = img['originalUrl']
            encoded_url = urllib.parse.quote(original_url, safe='') # safe='' tüm karakterleri kodlar
            
            # weserv.nl bazen çok uzun URL'lerde sorun yaşayabilir, 
            # alternatif olarak doğrudan orijinali de saklayabiliriz.
            img["ProxyUrl"] = f"https://images.weserv.nl/?url={encoded_url}&default={encoded_url}"
            updated_img = img
            break

    if updated_img:
        write_db(data)
        return updated_img
    
    raise HTTPException(status_code=404, detail="Görsel bulunamadı")

@app.get("/proxy/image")
async def proxy_image(url: str):
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/121.0.0.0 Safari/537.36"
        ),
        "Referer": "https://www.instagram.com/",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    }

    try:
        async with AsyncClient(
            follow_redirects=True,
            timeout=20
        ) as client:
            resp = await client.get(url, headers=headers)

        if resp.status_code != 200:
            raise HTTPException(
                status_code=resp.status_code,
                detail="Image fetch failed"
            )

        content_type = resp.headers.get("content-type", "image/jpeg")

        return Response(
            content=resp.content,
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=86400"
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =====================
# DEV ENTRY
# =====================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

