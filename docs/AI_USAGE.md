# ATLAS — süni intellektdən istifadə bəyannaməsi

**Layihə:** ATLAS
**Vasitə:** OpenAI ChatGPT
**Tarix:** 31 oktyabr 2026

## İstifadə məqsədi və iş bölgüsü

Layihə sahibi sərnişin və operator ekranları üçün funksional tələbləri, dizayn istinadlarını, ATLAS loqo və ikon fayllarını, açıq məlumat mənbəyi təklifini, nümayiş üçün marşrut cədvəlini və düzəliş göstərişlərini təqdim edib. ChatGPT/Codex mövcud repozitoriyanı araşdırmaq, kod və interfeys dəyişiklikləri hazırlamaq, xətaları araşdırmaq, testləri icra etmək və texniki sənədləri yazmaq üçün istifadə olunub. Tətbiqin GPS, ETA, sıxlıq və xəbərdarlıq hesablamaları öyrədilmiş AI modeli deyil, proqram kodunda müəyyən edilmiş qaydalardır.

## Test məqsədli prompt nümunələri

Aşağıdakı altı sorğu layihənin yoxlanması üçün **nümunə formulalardır**. Onlar sözbəsöz yazışma arxivi kimi təqdim edilmir.

1. **Əsas iş axınları:** “Sərnişin xəritəsi, marşrut və dayanacaq seçimi, avtobusun hərəkəti, ETA, sıxlıq bildirimi və operator panelini yoxla. Mövcud funksiyalarda pozuntu varsa səbəbi tap, düzəlt və backend testlərini yenidən işə sal.”
2. **GPS və ETA:** “Avtobusun GPS qeydi 30 saniyədən köhnə olduqda və ya yol geometriyası çatışmadıqda ETA-nın etibarlı canlı məlumat kimi göstərilmədiyini sına. Xəbərdarlıq mətninin Azərbaycan dilində və aydın olduğuna bax.”
3. **Sərnişin bildirişlərinin etibarı:** “Tək istifadəçidən təkrar bildirişləri müstəqil sərnişin sayı kimi hesablama. Son hesabat vaxtını, müstəqil hesabat sayını və kifayət qədər sübut olmayan vəziyyəti test et.”
4. **Anomaliya və operator hərəkətləri:** “Yüksək sıxlıq yalnız tələb olunan müddət davam etdikdə xəbərdarlıq yaratdığını, eyni hadisə üçün təkrar xəbərdarlıq yaranmadığını və operatorun planlaşdırdığı cavabın vaxtı ilə tarixçəyə yazıldığını yoxla.”
5. **Alternativ avtobus təklifi:** “Eyni marşrut üzrə daha az sıx olan sonrakı avtobusu yalnız hər iki avtobus üçün təzə GPS, etibarlı sıxlıq və ETA məlumatı varsa təklif et. Məlumat çatışmırsa təklif göstərmə.”
6. **Mobil interfeys və son yoxlama:** “Alt panel və bildirişlər üçün yuxarı-aşağı sürüşdürmə, qatların sırası, loqo hizası, demo giriş və yüklənmə vəziyyətlərini mobil ölçüdə yoxla. Ağ ekran xətası olmadığını təsdiqlə və frontend production build-i işə sal.”

## AI dəstəyinin əhatəsi

- **Kod və arxitektura:** React/TypeScript sərnişin ekranı və operator paneli, FastAPI/SQLite məlumat axını, GPS simulyasiyası, ETA, sərnişin bildirişləri, etibar hesabı, anomaliya qaydaları və demo replay üzərində iş.
- **İnterfeys və resurslar:** xəritə, alt panel, bildirişlər, giriş ekranı, mobil davranış və istifadəçinin verdiyi ATLAS loqo/ikon fayllarının tətbiqə uyğunlaşdırılması.
- **Araşdırma və düzəliş:** ağ ekran, qatların üst-üstə düşməsi, panel jestləri, avtobus nişanı, məlumat mənbəyi və route/stop uyğunluğu kimi məsələlərin təhlili.
- **Yoxlama və sənədləşmə:** backend testləri, frontend production build, README, arxitektura qeydi, texniki izah sənədi və təhvil siyahısı.

## Nəticənin yoxlanması və sərhədləri

Son yoxlamada backend üzrə **23 avtomatlaşdırılmış test keçib**, frontend production build uğurla tamamlanıb. Docker Compose bu iş mühitində ayrıca işə salınmayıb. D1/D2/D3 nümunə marşrutlardır; tətbiq real avtobus GPS axınına və dövlət identifikasiya xidmətinə qoşulmur. Rəsmi dayanacaq koordinatları demo marşrutlarının təsdiqlənmiş dayanacaq ardıcıllığı kimi göstərilmir. Operatorun əlavə avtobus barədə qeydi faktiki avtobus göndərilməsi anlamına gəlmir.

**Bəyanat:** Bu sənəd ChatGPT/Codex istifadəsinin görünən iş sahələrini və layihənin yoxlanması üçün hazırlanmış nümunə test sorğularını açıqlayır. Komanda təqdimatdan əvvəl tətbiqi və sənədi son dəfə nəzərdən keçirməlidir.