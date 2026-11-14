# BUILD670 V6.3.44 — Plan Ekranı ve Genel Durum Düzeltme Raporu

**Tarih:** 13 Kasım 2026  
**Kapsam:** Grafik / Teknik / Plan akışındaki **Plan → GENEL DURUM** açıklamalarının okunabilirliği ve denetim izlerinin doğru sunumu.  
**Kaynak:** V6.3.43 çalışma sürümü; font dosyaları korunan V6.3.42 arşivinden tamamlandı.  
**Yayın durumu:** Kaynak paket hazır; GitHub/Railway/Render canlı dağıtımı yapılmadı.

## 1. Kodda doğrulanan kök nedenler

1. `android-app.js` → `paintStock` işlevi, Kotlin analiz çıktısındaki `opportunity.scoreBreakdown` dizisini `join('\n')` ile doğrudan Plan ekranındaki `overview` alanına yazıyordu. Bu sebeple `V531_AUDIT`, `RISK_NOTE`, `WHY`, skor ve iç mantık alanları tek bir büyük metin bloğunda görünüyordu.
2. `OpportunityEngine.kt`, `V531_REASON` ve `V531_AUDIT` satırlarını hesaplama/denetim amacıyla üretmektedir. Özgün izler silinmemeli; özet kullanıcı açıklaması için ayrı sunum katmanı gerekmektedir.
3. `SignalDecisionEngine.kt` kararın `DIRECTION_CONFLICT` nedenini LONG ile SHORT puan farkı `MIN_DIRECTION_MARGIN=6` eşiğinin altındaysa üretiyor. Görselde `RAW_LONG=8`, `RAW_SHORT=5`; fark **3**. `V531_CONFLICT_PENALTY=0` ise **ayrı çoklu zaman dilimi cezası** hesaplamasıdır. Bu ikisinin bir arada görülmesi hesaplama çelişkisi değildir.
4. `BreakoutVolumeEngine.kt` hacim anomalisi için `(volumeRatio-1)*100` kullanmaktadır. `volumeRatio=0` ise `-100%` çıkar. `ConfidenceEngine.kt` ise son kapanmış mumda **pozitif hacim** yoksa `MISSING_VOLUME` üretir. Bu iki rapor alanının birlikteliği tek başına gerçek piyasa hacminin %100 düştüğünü kanıtlamaz. Zaten mevcut Kotlin formülleri/parite testleri değiştirilmemiştir.
5. `score`, `riskScore`, `dataConfidenceScore` ayrı kavramlardır. Kaynakta skorun yüksek olması tek başına onaylı işlem sinyali anlamına gelmez.

## 2. Gerçekleştirilen değişiklikler

- **Okunabilir Plan özeti:** `İZLE — Onaylı AL/SAT yok` kararı ve teknik/risk/güven puanları üç ayrı alan halinde gösterilir. Puan bulunmazsa sıfır değil `—` görünür.
- **Ayrı engel açıklamaları:** `STALE_DATA`, `MISSING_VOLUME`, `DIRECTION_CONFLICT`, `LOW_SCORE` ve diğer bilinen sebepler için kısa Türkçe açıklamalar gösterilir. Aynı neden iki kez listelenmez.
- **Hacim ayrımı:** Grafik mumunda gerçekten sıfır/pozitif/eksik hacim gözlemi ayrı belirtilir; tarama planına eşzamanlılık isnat edilmez. Hacim teyidi yoksa `VOLUME_ANOMALY_PCT=-100` gerçek hacim değişimi diye sunulmaz.
- **Yön ve ceza ayrımı:** Yön uyuşmazlığı ile çoklu periyot cezasının farklı kontroller olduğu gösterilir.
- **Tekrarlayan notları birleştirme:** Kullanıcı özetinde aynı risk notu bir kez görünür.
- **Tam denetim izi:** Özgün `scoreBreakdown` girdilerinin tamamı `Teknik ayrıntılar` açılır bölümündeki salt metin `pre` içinde saklanır. Kaynak metin HTML olarak yorumlanmaz.
- **Sembol güvenliği:** Seçili sembol ile eşleşmeyen tarama fırsatı Plan'a uygulanmaz. Tarama kaydı yoksa veri veya puan uydurulmaz.
- **Sürüm:** UI üretim sürümü `V6.3.43` → `V6.3.44` olarak bir kez artırıldı.
- **Orijinal kaynak ve kullanıcı kayıtları:** localStorage, IndexedDB, favoriler, geçmiş ve VİOP defteri üzerinde işlem yapılmadı.

## 3. Değişen dosyalar

- `android-app.js` — `paintPlan` görünümü ve `paintStock` bağlantısı.
- `android-plan.js` — yeni, yalnız sunum amaçlı denetim/özet çözücüsü.
- `android-ui.css` — Plan kartları, responsive boşluklar, açılır teknik kayıt stili.
- `server.py` — `android-plan.js` aynı kökenli, SHA-256 SRI ve CSP kontrollü yükleme sırasına eklendi.
- `build-version.json` — `6.3.44`.
- `tests/test_plan_summary.cjs` — 9 yeni bağımsız doğrulama.

## 4. Çalıştırılan testler

| Test | Sonuç |
|---|---|
| Python regresyon testleri | **131 geçti + 60 alt test geçti** |
| JavaScript `tests/test_*.cjs` | **17/17 test dosyası geçti** |
| Yeni Plan sunum testleri | **9/9 geçti** |
| `node --check android-app.js` ve `android-plan.js` | **Geçti** |
| `scripts/bump_release.py --check` | **V6.3.44 tutarlı** |
| Yerel sunucu `/health` | **HTTP 200** |
| Yerel sunucu `/ready` | **HTTP 200, coreReady=true** |
| Yeni `android-plan.js` servis yanıtı | **HTTP 200** |
| HTML'de SHA-256 SRI/CSP ve JS yükleme sırası | **Doğrulandı** |
| Gerçek Chromium ekran ve etkileşim testi | **DOĞRULANAMADI — net::ERR_BLOCKED_BY_ADMINISTRATOR** |
| Gerçek canlı BIST/VİOP fiyat veya AL/SAT kanıtı | **TEST EDİLMEDİ** |
| GitHub/Render/Railway yayın | **YAPILMADI** |

## 5. Kalan açık sınırlar

1. Kaynak düzeyinde **sıfır hacim**, **eksik hacim** ve sağlayıcının yolladığı `null`/yanlış veri ayrımı uçtan uca ayrıca incelenmeli. Bu teslimde Kotlin karar motoru/hesaplama referansı değiştirilmedi; `0` ya da `-100%` otomatik olarak gerçek piyasa teyidi sayılmaz.
2. Canlı tarama ve Chart Focus'un gerçek tarayıcı görsel/etkileşim kabulü gerekiyor. Uçtan uca üretim sonuçları bu testlerden otomatik olarak çıkmaz.
3. `V531` açıklamalarındaki anlamı korumak için AL/SAT sinyal eşikleri, Kotlin JAR ve veri kaynakları aynen bırakıldı.
4. Mevcut çalışan internet yayını V6.3.44 değildir; bu teslim kaynak ZIP olarak hazırdır.

**Geri dönüş:** V6.3.43 kaynak sürümü. Yeni dosyaları önce ayrı test dalında doğrulayın, sonra üretime onayla alın.
