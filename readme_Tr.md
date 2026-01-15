# Morgifile (Beta)

[🇬🇧 English README](readme.md)

Morgifile, web üzerindeki görselleri hızlı ve verimli bir şekilde arşivlemek, kategorize etmek ve yönetmek için geliştirilmiş **Firefox eklentisi + web dashboard** tabanlı bir uygulamadır.

Proje; bir Firefox eklentisi, yerel olarak çalışan bir Python server ve bu verileri görselleştiren bir dashboard arayüzünden oluşur.

---

## 🚀 Özellikler

- Firefox üzerinden herhangi bir web sitesindeki görseli **sağ tıklayarak kaydetme**
- Görsellerin **yerel Python server** aracılığıyla işlenmesi
- Verilerin **JSON formatında** saklanması
- Dashboard özellikleri:
  - Görselleri kategoriler halinde görüntüleme
  - Kategori oluşturma / düzenleme / silme
  - Görsel silme
- Basit, merkezi ve kontrol edilebilir bir görsel arşivleme sistemi

---

## 🧩 Proje Yapısı

- **Firefox Extension**  
  Web sayfalarındaki görselleri algılar ve seçilen görseli backend’e gönderir.

- **Python Local Server**  
  Eklentiden gelen verileri alır, işler ve JSON tabanlı veri yapısına kaydeder.

- **Dashboard (Web UI)**  
  Kaydedilen görselleri kategoriler halinde gösterir ve yönetim imkânı sunar.

---

## 🛠 Kullanılan Teknolojiler

- JavaScript
- HTML
- CSS
- Python
- Firefox Extension API

---

## ⚙️ Kurulum (Özet)

> Detaylı kurulum adımları ilerleyen sürümlerde eklenecektir.

1. Python local server’ı çalıştırın
2. Firefox eklentisini tarayıcıya yükleyin
3. Dashboard arayüzünü tarayıcıdan açın
4. Web sitelerinde görsellere sağ tıklayarak arşivlemeye başlayın

---

## 📌 Proje Durumu

Bu proje şu anda **Beta** aşamasındadır.

- Temel özellikler çalışmaktadır
- Uygulama aktif olarak kullanılabilmektedir
- Ancak:
  - Bazı özellikler eksiktir
  - Kod yapısı geliştirmeye açıktır

Proje sürekli olarak geliştirilmektedir.

---

## 🤝 Katkıda Bulunma

Morifile, açık kaynaklı ve ticari olmayan bir projedir.  
Özellik geliştirme, UI/UX iyileştirmeleri ve kod kalitesini artırma konularında katkıda bulunmak isteyen gönüllüler memnuniyetle karşılanır.

Katkıda bulunmak için:
- Repoyu fork’layın
- `good first issue` etiketli bir issue seçin
- Pull request açın

---

## 🗺 Roadmap (Planlanan)

- Prompt üretici
- Renk paleti oluşturucu
- Performans optimizasyonları
- Veri yapısının iyileştirilmesi
- Farklı platformlar için destek
- UI/UX geliştirmeleri

---

## 🤖 Not

Bu proje şu ana kadar **tamamen yapay zeka yardımı ile geliştirilmiştir**.

---

## 📄 Lisans

Bu proje kişisel ve ticari olmayan kullanım amaçlıdır.
