# BUILD670 — Otomatik üretim seri numarası

Görünen sürüm etiketi her **yeni üretim paketi hazırlanırken** bir artırılır: V6.3.40 → V6.3.41 → V6.3.42.

## Yeni üretim sırası

1. Yeni dağıtım paketi için `python scripts/package_release.py` komutunu çalıştırın. Bu işlem sürümü **otomatik olarak bir kez** artırır ve ZIP üretir. Alternatif olarak yalnız numarayı artırmak için `python scripts/bump_release.py` kullanın.
2. `python scripts/bump_release.py --check` ile etiketlerin manifestle uyuştuğunu doğrulayın.
3. Testleri çalıştırın, ardından kaynak kodu veya dağıtım paketini oluşturun.
4. `build-version.json` ve değişen JS dosyalarını aynı commit'e kaydedin.

**Önemli:** Bu script site her yenilendiğinde veya sunucu açıldığında çalışmaz; öyle yapılırsa aynı dağıtım farklı seri numarası gösterir. Aynı paketin tekrar dağıtımı aynı numarayı korur. Bir sonraki yeni üretimde bir artar.

`androidReferenceVersion` ayrı bir referanstır; Android hesaplama motoru değiştirilmedikçe artırılmaz. Sunucu API sürümü de bağımsızdır. Bu script sadece görünür UI üretim etiketlerini günceller; `index.html` içindeki Android referans açıklaması aynı kalır.
