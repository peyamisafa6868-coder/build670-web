# BUILD670 Web Programı — V6.3.45

Bu paket, **BUILD670 uygulamasının web sunucusu ve gerçek hesaplama çekirdeğini** içerir. Tek bir HTML dosyasını açarak sunucusuz çalışmaz. **Örnek mum/fiyat üretmez.** Sağlayıcı bağlantısı Yahoo üzerinden gecikmeli olabilir; lisanslı BIST/VİOP canlı veri iddiası yoktur.

## Yerel tarayıcıda açma

1. ZIP dosyasını tamamen açın. Python **3.12 veya daha yeni**, Java **17 veya daha yeni** yüklü olmalı.
2. Windows'ta **`BASLAT_WINDOWS.bat`**, macOS/Linux'ta `./BASLAT_LINUX_MAC.sh` çalıştırın.
3. Program `/ready` yanıtı 200 olduktan sonra tarayıcıyı otomatik açar. Varsayılan adres `http://127.0.0.1:8000/`; bu port doluysa otomatik boş port seçilir.
4. Sunucuyu kapatmak için açılan terminalde **Ctrl+C** kullanın.

Bu sürüm önceki `WEB-PROGRAMINI-AC.exe` dosyasından bağımsızdır. Tek başına çalışan Windows EXE **değildir** ve ilk açılışta tarayıcı haricinde Python/Java gerektirir. Kaynak kod ile birlikte Java Kotlin JAR'ı gelir. Normal açılışta Kotlin kaynaklarını tekrar indirmez.

## Sunucudan yayınlamak

`Dockerfile` ve `Procfile` hazırdır. Render/Railway gibi bir platformda uygulamanın HTTP erişimi için ilgili sunucu ortamını yapılandırın. **Doğrudan internete açık yayın için sunucuda kullanıcı erişim anahtarı zorunludur**. `BUILD670_PUBLIC_SERVER=1`, `BUILD670_USER_TOKEN_HASHES` ve platformun `PORT` değeri olmadan yayımlama yapmayın. Güçlü token özetlerini GitHub'a eklemeyin.

Dağıtım sonrası `/ready` yanında `/build-version.json` çıktısında `version: "6.3.45"` görülmeli. `coreReady=true` canlı veri sağlayıcısı bağlı demek değildir. Özellikle VİOP için `providerConfiguration.connected` ve `authenticated` alanları ayrı doğrulanmalıdır.

## Korumalar ve kapsam

- Grafik, Teknik, Plan, BIST tarama ve VİOP'un mevcut sürümdeki davranışları korunmuştur.
- Tarayıcının `localStorage` ve `IndexedDB` kayıtlarını program paketlemesi silmez. **Farklı alan adında kayıtlar otomatik taşınmaz**; yedek alın.
- Açık mumdan onaylı kapanış sinyali üretilmez. Sahte veri ya da onaylanmamış VİOP kontratları sunulmaz.
- V6.3.45 değişiklikleri: yerel tarayıcı başlatıcısında Java 17+ tanıma, meşgul port seçimi, hazır oluş kontrolü, güvenli yerel bind ve `/build-version.json` sürüm yolu.
- Yazılımın gerçek Windows, Chrome/Edge, fiziksel cihaz ve canlı piyasa kabul testleri ayrıca yapılmalıdır.

**Görünüm notu:** Paket, haricen dağıtılmaması gereken ikili font dosyalarını içermez; tarayıcı/işletim sisteminin standart sans-serif fontları kullanılır. Bazı metin ölçüleri önceki kaynak arşivinden az miktarda farklı olabilir.
