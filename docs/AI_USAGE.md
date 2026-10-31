# ATLAS — süni intellektdən istifadə bəyannaməsi

**Layihə:** ATLAS (BakuTransit AI)
**Vasitə:** OpenAI ChatGPT mühitində Codex
**Tarix:** 31 oktyabr 2026

## İstifadə məqsədi və iş bölgüsü

Layihə sahibi sərnişin və operator ekranları üçün funksional tələbləri, dizayn istinadlarını, ATLAS loqo və ikon fayllarını, açıq məlumat mənbəyi təklifini, nümayiş üçün marşrut cədvəlini və düzəliş göstərişlərini təqdim edib. ChatGPT/Codex mövcud repozitoriyanı araşdırmaq, kod və interfeys dəyişiklikləri hazırlamaq, xətaları araşdırmaq, testləri icra etmək və texniki sənədləri yazmaq üçün istifadə olunub. Tətbiqin GPS, ETA, sıxlıq və xəbərdarlıq hesablamaları öyrədilmiş AI modeli deyil, proqram kodunda müəyyən edilmiş qaydalardır.

## Yazışmadan tapşırıq nümunələri

Aşağıdakılar layihə sahibinin bu söhbətdə verdiyi göstərişlərdən **sözbəsöz qısa parçalar**dır. Yazılış saxlanılıb; uzun mesajlar ixtisar edilib. Bu siyahı bütün yazışmanın tam arxivi deyil.

| № | Verilmiş göstərişdən parça | İş sahəsi |
|---|---|---|
| 1 | “Enhance the existing BakuTransit AI application without rebuilding or breaking any working functionality.” | Mövcud funksiyaların yoxlanması və prioritetli təkmilləşdirmə |
| 2 | “Smart Alternative Bus Suggestions” və “Crowdsourcing Confidence Indicator” | Eyni marşrut üzrə etibarlı alternativ təklifi və bildiriş etibarı |
| 3 | “Operator Action History” və “GPS Freshness Detection” | Planlaşdırılmış operator cavabı və köhnəlmiş GPS-in göstərilməsi |
| 4 | “bu gorduyun dizayni a-ze 1-e-1 eynisini edessen premium olmagi sertdir” | Sərnişin və operator UI dizaynı |
| 5 | “bu popup i swipe up down ile acib baglamaq veya kiciltmen olsun” | Sərnişin ekranında alt panelin jestlə idarəsi |
| 6 | “real datadan real heyat uygun dayancaqlari elave etmeyide unutma” | Rəsmi dayanacaq koordinatlarının araşdırılması və ayrıca məlumat qatı |
| 7 | “avtobuslarin rotate deyismesin donen anda” | Avtobus işarəsi və dönmə nişanının davranışı |
| 8 | “ciahzin anonim kodunu kopyalamaq olsun butona basandaq” | Anonim cihaz kodunu kopyalama düyməsi |
| 9 | “birde avtomatik bir login qurmalisaan ... demo olsun yeni api ile filan yox” | Xarici identifikasiya API-si olmadan demo giriş ekranı |
| 10 | “brauzerde ag ekran gosterir onu duzelt” | Ağ ekran xətasının araşdırılması |
| 11 | “bildirislerde bunu swipe up le islemir onu duzelt smooth olsun” | Bildiriş panelinin jesti və keçid animasiyası |
| 12 | “son defe yoxlanis et” | Son funksional yoxlama və build |
| 13 | “menim ucun ubunu githubda yeni repo kimi elave et” | Mənbə kodunun GitHub-a yerləşdirilməsi |

Bundan əlavə, layihə sahibi mygov ID giriş ekranı şəkillərini, ATLAS vizual fayllarını, BakuBus marşrut cədvəli şəklini və `admin.opendata.az` dataset sorğusunu göndərib. Bunlar AI tərəfindən uydurulmuş prompt və ya məlumat mənbələri kimi təqdim edilmir.

## AI dəstəyinin əhatəsi

- **Kod və arxitektura:** React/TypeScript sərnişin ekranı və operator paneli, FastAPI/SQLite məlumat axını, GPS simulyasiyası, ETA, sərnişin bildirişləri, etibar hesabı, anomaliya qaydaları və demo replay üzərində iş.
- **İnterfeys və resurslar:** xəritə, alt panel, bildirişlər, giriş ekranı, mobil davranış və istifadəçinin verdiyi ATLAS loqo/ikon fayllarının tətbiqə uyğunlaşdırılması.
- **Araşdırma və düzəliş:** ağ ekran, qatların üst-üstə düşməsi, panel jestləri, avtobus nişanı, məlumat mənbəyi və route/stop uyğunluğu kimi məsələlərin təhlili.
- **Yoxlama və sənədləşmə:** backend testləri, frontend production build, README, arxitektura qeydi, texniki izah sənədi və təhvil siyahısı.

## Nəticənin yoxlanması və sərhədləri

Son yoxlamada backend üzrə **23 avtomatlaşdırılmış test keçib**, frontend production build uğurla tamamlanıb. Docker Compose bu iş mühitində ayrıca işə salınmayıb. D1/D2/D3 nümunə marşrutlardır; tətbiq real avtobus GPS axınına və dövlət identifikasiya xidmətinə qoşulmur. Rəsmi dayanacaq koordinatları demo marşrutlarının təsdiqlənmiş dayanacaq ardıcıllığı kimi göstərilmir. Operatorun əlavə avtobus barədə qeydi faktiki avtobus göndərilməsi anlamına gəlmir.

**Bəyanat:** Bu sənəd ChatGPT/Codex istifadəsinin görünən iş sahələrini və layihə sahibinin həqiqətən verdiyi tapşırıq nümunələrini açıqlayır. Komanda təqdimatdan əvvəl tətbiqi və sənədi son dəfə nəzərdən keçirməlidir.