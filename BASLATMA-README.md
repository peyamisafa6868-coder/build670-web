# BUILD670 — Tek tık web başlatma

## En kolay yol: internetten aç

**[BUILD670 web uygulamasını aç](https://bist-viop-web-production.up.railway.app/)**

Bu seçenek Android/iOS/Windows/Mac üzerinde kurulum veya APK gerektirmez.

## Bilgisayarda indirip çalıştır

1. GitHub Actions'tan **BIST-VIOP-WEB-PROGRAM.zip** dosyasını indirin ve klasöre çıkartın.
2. **Python 3.12+** ve **Java 17** yüklü olmalı. İlk Python paket kurulumu için internet gerekir.
3. Windows: `BASLAT_WINDOWS.bat` dosyasına çift tıklayın.
4. macOS/Linux: terminalde `sh BASLAT_LINUX_MAC.sh` çalıştırın (macOS güvenlik izinleri uygulanır).
5. Başarılı başlatmada yerel tarayıcı otomatik `http://127.0.0.1:8000` sayfasını açar.

Program ZIP'i GitHub Actions içinde derlenmiş Android Kotlin JAR'ını da içerir.
Tam kaynak kod ZIP'i ise kaynakları içerir; gerekirse ilk çalışmada Kotlin çekirdeği
otomatik derlenir. Android APK değil, Python + Kotlin çekirdeği kullanan web
uygulamasıdır.

**Gerçek canlı veri değildir.** Yahoo Finance veri kaynağı resmî değil ve
gecikmeli olabilir. Lisanslı BIST/VİOP bağlantısı ve tam APK eşdeğerliği
doğrulanmadı. Sunucu kapandığında yerel web çalışmaz.

### Güvenli kullanım

- ZIP arşivinin kaynağının projeye ait GitHub Actions olduğunu doğrulayın.
- Dosyaları silmeden önce favorilerinizi, defterinizi ve geçmişinizi uygulamanın
  yedekleme/export işleviyle yedekleyin; bazı kayıtlar tarayıcıda yerel tutulur.
- Tarayıcı ayarlarını, yerel depolamayı ve kullanıcı kayıtlarını paket kendiliğinden
  temizlemez.
- Standart port 8000'i başka bir servis kullanıyorsa onu kapatın.
