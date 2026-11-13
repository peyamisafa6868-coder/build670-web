# BUILD670 — Render devri / güvenli yayın hazırlığı

Bu dal **yalnız dağıtım yapılandırmasını** içerir. Kaynak aktarımı tamamlanmadan bir dağıtım yapmayın.

## Kod kaynağı

Kaynak paketi: `BUILD670_V3_BIRLESIK_DUZELTME_TAM_KAYNAK.zip`.
Uygulama dosyaları arşivde `BUILD670-V3/_PROGRAM/` konumundadır ve depo kök dizinine yerleştirilmelidir. `index.html`, `server.py`, `Dockerfile`, `requirements.txt`, `android-core`, `assets` ve `data` aynı köke gelmelidir. Windows başlatıcı kaynakları web dağıtımı için gerekli değildir.

## Render

1. Kaynak dosyaların tümünü güvenli bir çalışma dalına yükleyin; eksik JAR/font/veri kaynakları olup olmadığını kontrol edin.
2. Render'da mevcut projeyi etkilemeden yeni bir staging web servisi oluşturun ve depoyu bağlayın.
3. Ortam değişkeni `BUILD670_USER_TOKEN_HASHES` için `{"kullanici":"<64 karakterlik SHA-256 token özeti>"}` biçiminde **gerçek** değer girin. En az 32 karakterlik güçlü token oluşturun; gerçek tokenı veya özeti depoya yazmayın.
4. `BUILD670_PUBLIC_SERVER=1`, `PYTHONUNBUFFERED=1` ayarlayın. Render `PORT` değerini otomatik verir.
5. Docker build'in Kotlin çekirdeğini ve testini üretebildiğini doğrulayın. `/ready` HTTP 200 ve `coreReady=true` sonucu alın.
6. Grafik, Teknik, Plan ve tarama hata ekranını yetkili oturumla tarayıcıda test edin; çalışan Railway sürümünü değiştirmeyin.
7. Kullanıcı onayı sonrası üretim geçişi planlayın; geri dönüş için önceki deploy kimliğini saklayın.

## Sınırlamalar

Gecikmeli Yahoo verisini resmi/canlı BIST-VİOP verisi diye sunmayın. Eksik mum veya gösterge üretmeyin. Kullanıcı localStorage/IndexedDB kayıtlarını temizlemeyin. Bu dalda herhangi bir üretim dağıtımı yapılmadı.
