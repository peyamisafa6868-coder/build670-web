# BIST–VİOP Web — Android çekirdeği

[Uygulama](https://bist-viop-web-production.up.railway.app/). Mevcut CSV/grafik çalışması korunarak geniş tarama eklendi. **Tam APK eşdeğerliği onaylanmadı.** [Ekran matrisi](docs/APK_WEB_MATRIX.csv).

## Çalıştırma

Python 3.12 + Java 17:

    python -m pip install -r requirements.txt
    python scripts/build_core.py --test
    python -u server.py

Railway, railway.toml içindeki Dockerfile seçimiyle Python/JRE çalıştırır. Maven bağımlılıkları SHA-256 ile sabittir; ilk derleme indirir. Kullanıcının cihazında Java/Python gerekmez.

## Yeni işlevler ve sınırları

- Android'den değişmeden alınan 67 kaynak dosyası; 73 Kotlin dosyası içinde platform adaptörleriyle çalışır. Derlemede kaynak/test SHA manifestleri kontrol edilir. Android WorkManager emüle edilmez.
- Ham OHLCV → özgün BistScanner/TechnicalAnalyzer/OpportunityEngine/V531 bileşen-risk-güven/MTF/V540 final-RR-yayın/filtre-sıralama sınıfları. Yahoo gecikmeli modda Android gibi işlem onayı ve MTF kapalıdır; teknik gözlem/risk/güven ayrıdır. Signed REMOTE canlı doğrulama yoktur.
- Aynı Android deneysel keşif kaynağından 632 sembol; 630 KAP kimliği. Kaynak/tarih gösterilir; resmî borsa geneli eksiksizlik iddiası yoktur. İki işçi, ilerleme/iptal/sayfalama ve ayrı yetersiz geçmiş/hata. 220 kapanmış mum gerekir.
- 1–239 DK + 1d tarama. 1/5/15/30/60 DK doğrudan; diğer dakikalar özgün Kotlin ile gerçek 1 DK'dan. Yahoo tarih sınırında 220 mum bulunamayabilir; uydurulmaz. 240 DK günlük değildir. Grafikler önceki ayrı 12 dönem kurallarını korur.
- Cihaz içi VİOP gerçekleşme defteri; referans/maliyet/çarpan/teminat; Android V6 risk sınırları; kısmi kapama/net P&L/açık risk/teminat. Emir göndermez. Gerçekleşen limit ihlali gizlenmez; bozuk defter sıfır risk değildir.
- Özgün Android dayanak/vade referans kataloğu ve araması. Gerçek kontrat/fiyat/teminat teyidi değildir.
- Özgün finansal değerleme/kalite/borç/emsal motoru. Finansal JSON yalnız açık düğmeyle sunucuya gönderilir; KAP_CONTENT_UNVERIFIED referans hesabıdır. Doğrulanmış otomatik mali tablo/analist kaynağı bağlı değil.
- Google News RSS kaynak/tarihli başlıklar; şirket/sektör/KAP araması/piyasa. KAP araması içerik teyidi değildir.
- Geniş hisse dizini/favoriler; ayar arama; yerel tarama/bildirim geçmişi; düğmeyle gecikmeli eşik kontrolü. Bildirim izni otomatik istenmez; arka plan/push yoktur.
- Gerçek gecikmeli BIST100/BIST30/USDTRY/EURTRY günlük kart ve detayları. Spot altın yanıt vermezse vadeli altın kullanılmaz.
- Tam manuel yedek yeni modülleri kapsar. Otomatik IndexedDB fiyat oturumu, güncel localStorage defterini eski snapshot ile değiştirmez. Bozuk uzantı oturum değişmeden reddedilir. Yeni web oturumuna sentetik veri otomatik eklenmez; önceki kullanıcı verileri/test düğmesi korunur.

## Ek API

GET /api/core/metadata, /api/universe, /api/scans/{id}, /api/scans/{id}/results?filter=ALL&page=1&size=25, /api/viop/catalog?query=garanti&category=ALL, /api/news?category=company&symbol=ASELS, /api/instruments, /api/instruments/USDTRY.

POST /api/scans gövdesi scope=discovered veya symbols dizisi ve interval=1d/7m vb. POST /api/scans/{id}/cancel. POST /api/valuation en çok 700 finansal snapshot kabul eder. /health sürüm/kaynak commit/JAR varlığını gösterir; Yahoo erişiminin kanıtı değildir.

Tarama oturumları bellekle sınırlı, iki saat geçerlidir; Railway diski geçicidir. Kalıcı raporu indirin. Defter/favoriler cihazdan sunucuya gönderilmez.

## Yeni doğrulama

    python scripts/build_core.py --test
    python -m unittest discover -s tests -v
    node tests/test_ledger.cjs
    node tests/browser_terminal.cjs

125 özgün Android JUnit, 28 Python ve 418 VİOP Kotlin/JS senaryosu/2360 alan karşılaştırması geçti. Önceki 11975 gösterge, 580 karar/4640 alan ve 8 provenance kontrolü korunur. Chromium gerçek Yahoo/tarama/kısmi kapama/reload/yedek ve 10 ekran genişliğini denetler. Sonuçlar gerçek komut çıktılarıyla raporlanır.

Lisanslı canlı BIST/VİOP, resmî kontrat/teminat/son işlem zamanı, signed REMOTE, doğrulanmış mali tablo/analist ve sürekli arka plan hizmeti tamamlandı olarak sunulmaz. APK hash eşleşir; eski 702 dosya manifestindeki 46 fark sebebiyle bütün güncel kaynağın aynı APK'yı ürettiği bağımsız kanıtlanmadı. Emülatör/fiziksel cihaz karşılaştırması yoktur.

## Korunan v1.3.0 altyapısının önceki doğrulama kaydı

[Uygulama](https://bist-viop-web-production.up.railway.app/) · GitHub `main` → Railway `bist-viop-web / production`.

## Çalıştırma

```bash
python -m pip install -r requirements.txt
python -u server.py
# http://localhost:8000/
```

Python standart HTTP sunucusu; Yahoo istekleri aynı kökenden sunucu üzerinden gider. Cihazda ayrı Yahoo köprüsü gerekmez.

## Doğrulanan işlevler — 7 Kasım 2026

- 1/3/5/10/15/30 dakika, 1/4 saat, günlük, haftalık, aylık ve tüm zamanlar grafikleri.
- 3 dakika, 1 dakikadan; 10/15/30 dakika, tam 5 dakikalık gruplardan; 4 saat, seansa sabitlenmiş 1 saatlik gruplardan üretilir. Eksik veya açık gruplar tamamlanmış mum yapılmaz.
- Haftalık/aylık gruplar İstanbul takvimine göre oluşturulur. Devam eden dönem kapanmış sayılmaz.
- Yahoo `range=max` isteğinde günlük yerine aylık veri döndürebiliyor. Tam geçmiş için açık epoch sınırları kullanılır; yanıtın gerçek periyodu denetlenir.
- Stokastik14, CCI20, ADX14, Momentum10 ve rol değişimini izleyen pivot merdiveni; grafik altı sade açıklamalar.
- Eski doğrudan Yahoo serisi, yeni türetilmiş periyoda geçerken sağlayıcıya ait seri olarak yenilenir; eski ve yeni mumlar karıştırılmaz. Kullanıcı CSV dosyaları bu geçişte değiştirilmez. 8 kaynak koruma kontrolü ve Chromium yeniden açılış testi geçti.
- Sentetik günlük kapanış, Yahoo fiyatının yüzde değişimine katılmaz. Uyumlu kaynak ve önceki seansın günlük kapanışı yoksa yüzde gösterilmez. Haftalık/aylık mumlar günlük fiyat yerine kullanılmaz.
- 400/429/502/504 hata yolları, sınırlı önbellek, aynı isteği paylaşma ve SRI + sıkı CSP koruması.
- Kaynağı doğrulanmayan KAP finansalları engellenir; analist hedefi uydurulmaz. Kaynak etiketleri korunur.

## API

- `/health`: uygulama sunucusunun sağlığı; Yahoo erişiminin kanıtı değildir.
- `/history?symbol=ASELS&interval=15m&range=1mo`: resmî olmayan, gecikmeli Yahoo geçmişi.
- 1m/3m için `7d`; diğer gün içi periyotlar için `1mo`; günlük/haftalık/aylık için `1mo,3mo,6mo,1y,2y,5y,max`; `all` için `max`.
- Mumlar `time` (UTC ms), OHLCV ve `closed` bilgisi içerir; `sourceInterval` türetmenin girdi periyodunu belirtir.

## Testler

```bash
python -m unittest discover -s tests -v
node tests/test_android_parity.cjs
node tests/test_signal_parity.cjs
node tests/test_provenance.cjs
# Playwright kuruluyken gerçek sağlayıcı + Chromium kabul testi:
node tests/browser_smoke.cjs
```

17 Python testi, 6 OHLCV senaryosunda 11.975 Kotlin/web karşılaştırması ve 580 hazır puan senaryosunda 4.640 karar alanı karşılaştırması geçti. Kotlin golden çıktıları gerçek JVM çalıştırmasından üretildi; kaynaklar ve parmak izleri `tests/android_reference` ve `tests/fixtures/reference_identity.json` içindedir. Hazır bileşen puanlarının eşleşmesi, OHLCV'den tüm Android sinyal zincirinin aktarılmış olduğu anlamına gelmez.

Chromium 153 ile 320/360/390/420/480/768/980/1280 px, 10 sayfanın gezinmesi, 12 gerçek Yahoo periyodu, grafik seçimi, ASELS/THYAO günlük tarama ve sağlayıcı hatasında sentetik veri göstermeme test edildi. 68 yerleşik kontrol geçti; CSP ihlali ve beklenmeyen JavaScript hatası oluşmadı. Testte ayrıca bilinçli 502 hatası enjekte edildi.

## Kalan kapsam

Bu sürüm **APK'nın eksiksiz eşdeğeri olarak onaylanmadı**. [20 ekranın fark matrisi](docs/APK_WEB_MATRIX.csv) her satırdaki durumu ve açık işi gösterir. Lisanslı canlı BIST/VİOP, doğrulanmış KAP/analist/haber kaynakları, Android tam borsa evreni ve OHLCV→bileşen puanları, pozisyon defteri/arka plan bildirimleri ve bütün ayar ekranları tamamlanmış değildir. 2027 sonrası BIST tatil takvimi doğrulanmış değildir. Fiziksel Android/iOS cihaz karşılaştırması yapılmadı.

APK SHA-256, kaynak paketinin kimlik kaydındaki APK ile eşleşir. Ancak eski kaynak manifestindeki 702 dosyanın 46'sı mevcut kaynakla farklıdır; `ExtendedStockEvidence.kt` bu eski manifestte listelenmez. Bu kayıt, tüm güncel kaynakların APK'yı birebir ürettiğinin bağımsız kanıtı sayılmadı. [Kaynak farkları](docs/source_manifest_differences.json).

Mevcut Android/APK projesi ve ayrı `BIST-VIOP-API-v1` Railway projesi değiştirilmedi.
