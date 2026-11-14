# BUILD670 — Yerel kaynak düzeltmesi ve test raporu
Tarih: 10 Kasım 2026
Durum: **KISMEN TAMAMLANDI — canlı dağıtım ve tarayıcı regresyonu doğrulanmadı**

## Kaynak paketi
- Kullanıcı tarafından eklenen üç ZIP incelendi. Birleşik paketteki iki iç ZIP ile ayrı yüklenen program ve kaynak ZIP'lerinin SHA256 içeriği birebir aynıdır.
- Esas alınan kaynak: `BIST-VIOP-WEB-TAM-KAYNAK(3).zip`.
- Önceki raporda belirtilen `a193248ccf70` GitHub commit kimliği bu yerel ZIP içinden bağımsız olarak doğrulanamadı. Güncel GitHub main kontrolü, commit, PR, merge ve Railway dağıtımı gerçekleştirilmedi.

## Aşama 1 — Kök neden
**İncelenen:** android-app.js, android-technical.js, android-chart.js, chart-support-levels.js, stock-analysis.js, yahoo-auto.js, android-resources.json, index.html, engine_bridge.py, test dosyaları.
- `expTrendFive/Ten/Hour/Daily/Weekly/Monthly` butonlarının tümü tek `load(tf)` fonksiyonunu çağırıyor, yalnızca seçili grafiği değiştiriyordu. Altı bağımsız eğilim hücresi güncellenmiyordu.
- `expRsi`, `expMacd`, `expStochastic`, `expCci`, `expAdx`, `expMomentum`, `expRes1..3`, `expSup1..3`, `expLastPrice` arayüz kaynaklarında var ama `android-app.js` tarafından doldurulmuyordu.
- Önceki tarama nesnesi `android-technical.js` içindeki teknik gözlemler için kullanılıyor; bu akış halen seçili grafiğin doğrulanmış OHLCV modeliyle aynı veri serisi olduğunu kanıtlamıyor.

## Aşama 2 — Gerçekten uygulanan değişiklikler
**Dosyalar:** `android-app.js`, `android-chart.js`, `tests/test_build670_extended_bindings.cjs`.
1. Altı ayrı periyot için bağımsız kaynak isteği ve ayrı kart güncellemesi eklendi; grafiği değiştirmiyor.
2. Yanıtların sembol/periyot eşleşmesi kontrol edildi; kapanmış mumlar kullanıldı; 220 mumun altı 'x/220 kapanmış mum' olarak açıklandı.
3. Asenkron periyot istekleri için ekran sürümü ve periyot başına istek belirteci eklendi; önceki yanıt daha yeni periyodu boyayamıyor.
4. Her bağımsız kartın yükleniyor, yetersiz veri ve kaynak hatası durumları düzenlendi. Kartına tıklayarak yeniden deneme mümkün.
5. Seçili grafiğin `/api/chart-analysis` modelinden gösterge sonuçları altı genişletilmiş teknik karta aktarıldı. Kullanıcıya sembol, periyot, kaynak, kapanmış mum sayısı ve zaman gösterildi.
6. Destek/direnç genişletilmiş görünümü seçili grafiğin Kotlin referans seviyesi ve doğrulanmış pivotlarıyla dolduruldu. Geçerli üçüncü seviye bulunmazsa çizgi (`—`) bırakılır; fiyat uydurulmaz.
7. Grafik hesaplama API'si başarısız olduğunda kartların sonsuz beklemede kalmaması için hata bildirimi eklendi.
8. Mevcut indikatör matematiği, Android/Kotlin motoru, sinyal skorları, S/D anahtarı, neon tema, kullanıcı favorileri ve kayıtları değiştirilmedi.

## Aşama 3 — Testler ve dürüst sonuçlar
- `node --check android-app.js`, `node --check android-chart.js`: **BAŞARILI**.
- `node tests/test_build670_extended_bindings.cjs`: **BAŞARILI**, 19 kart kimliği + bağlantıların statik kontrolü. Bu bir canlı tarayıcı testi değildir.
- `node tests/test_chart_support_levels.cjs`: **BAŞARILI**, sentetik kapanmış mum/pivot regresyonu.
- `node tests/test_android_parity.cjs`: **BAŞARILI**, 6 vaka ve 11.975 karşılaştırmada en büyük fark 0. Bu var olan JavaScript/Android referans fixtures testidir; tam Android runtime parity değildir.
- `python -m py_compile`: **BAŞARILI** (ana Python modülleri).
- `python -m unittest discover -s tests -p 'test_*.py' -q`: **BAŞARISIZ**, 119 test çalıştırıldı; 4 fail, 16 error, 4 skip. Başarısızlıklar arasında Android çekirdeğinin JAR dosyasının mevcut olmaması ve `/ready`/işlem tahmini uç noktalarının HTTP 503 dönmesi var. Ayrıntı `TEST_LOGS/python_tests.log`.
- `python scripts/build_core.py`: **BAŞARISIZ**; harici bağımlılık indirmesi `Temporary failure in name resolution` nedeniyle tamamlanmadı.
- Gerçek Chromium/Playwright mobil regresyonu: **ÇALIŞTIRILMADI** (Playwright modülü bu ortamda yok).
- Gerçek provider OHLCV ve 5m/10m/1h/1d/1w/1mo end-to-end doğrulaması: **ÇALIŞTIRILMADI**.
- GitHub PR/CI ve Railway `/ready`/commit doğrulaması: **ÇALIŞTIRILMADI**.

## Sınırlar ve takip gerektirenler
- Altı periyot için sağlayıcının ne kadar tarih döndürdüğü ve özellikle 220 kapalı mum bulunabilirliği gerçek servis ortamında test edilmelidir. Yetersiz geçmiş için tahmin yapılmamaktadır.
- Seçili grafik `chart-analysis` backend'inin sonuçları, Kotlin motorunun derlenmesiyle ayrı doğrulanmalıdır.
- `android-technical.js` bağımsız ekranı eski tarama nesnesini kullanmaya devam eder; bu davranış tam entegrasyon olarak sunulamaz.
- `paintDisplayQuote` günlük gecikmeli fiyatı ayrıca boyayabilir; seçili grafik kapanış fiyatı ile güncel günlük gözlem fiyatının farklı olması geçerli olabilir. İki fiyat eşitlenmedi.
- Gerçek kullanıcı verisi ve OHLCV canlı testleri için sağlayıcı bağlantısı gereklidir. Bu paket canlı işlem onayı değildir.

## Çalıştırma
`BASLAT_WINDOWS.bat` veya `BASLAT_LINUX_MAC.sh` mevcut başlatıcıları kullanın. Backend için Android çekirdeği JAR bağımlılıkları yüklenip `python scripts/build_core.py` çalıştırılmalıdır. Bu ortamda çekirdek derlenemediği için eksiksiz çalışma garantisi verilemiyor.

## Geri alma
Önceki iki orijinal ZIP saklanmıştır. Bu yerel yamayı geri almak için orijinal `android-app.js` ve `android-chart.js` dosyalarını geri yükleyin; test ekini kaldırın. Bir canlı sunucuya değişiklik yapılmadı.
