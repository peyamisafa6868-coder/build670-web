# BUILD670 V6.3.45 source archive upload

**Yalnızca bu tam paket yüklenir:** `BUILD670_V6.3.45_CALISIR_WEB_PROGRAMI.zip`.

1. GitHub deposunda `main` dalındaki `incoming` klasörüne girin.
2. `Add file` → `Upload files` seçin; 9,4 MB ZIP dosyasını aynı adla yükleyip commit edin.
3. GitHub Actions otomatik olarak ZIP'in tam SHA-256 değerini doğrular, Python/JavaScript testlerini çalıştırır ve tam kaynağı `deploy/v6.3.45` dalına çıkarır.
4. Railway'de `build670-v6-3-45` projesine `peyamisafa6868-coder/build670-web` deposunun `deploy/v6.3.45` dalını kaynak olarak bağlayın; `BUILD670_PUBLIC_SERVER` ve gerçek token hash ayarlarını güvenli ortam değişkeni olarak girin.
5. Yayın sonrası `/ready` ve `/build-version.json` doğrulanmadan V6.3.45 yayında ilan edilmemelidir.

Bu dosyayı oluşturmak veya ZIP dosyasını bilgisayarınıza indirmek **siteyi güncellemez**. Eski Railway yayınına dokunulmaz.
