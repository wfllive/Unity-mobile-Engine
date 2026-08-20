# Быстрый старт / Troubleshooting

Подробная инструкция — в [ЗАПУСК.md](ЗАПУСК.md). Этот файл назван латиницей
специально: на некоторых Android-архиваторах кириллические имена бьются.

## Установка (рекомендуемый способ)

Нужен только **Node.js 18+**. JDK, Android SDK и Gradle не нужны, в том числе для APK.

```bash
git clone -b arena/01a01ed8-unity-mobile-engine \
  https://github.com/wfllive/Unity-mobile-Engine.git
cd Unity-mobile-Engine
npm install
npm run dev
```

Откройте <http://localhost:3000>.

> **Скачивать ZIP с GitHub не рекомендуется.** Архив часто распаковывается не
> полностью (особенно на Android/Termux), и Vite падает с ошибкой
> `Failed to resolve import`. Через `git clone` такого не бывает,
> плюс обновления забираются одной командой `git pull`.

---

## Ошибка `Failed to resolve import "../apk/builder.js"`

Это **не баг кода** — в вашей копии физически нет файла. Проверьте:

```bash
npm run doctor
```

Скрипт обойдёт все импорты и покажет, каких файлов не хватает.

**Починка.** Если проект склонирован через git:

```bash
git fetch origin arena/01a01ed8-unity-mobile-engine
git reset --hard FETCH_HEAD
npm install
```

Если распакован из ZIP — переustановите через `git clone` (команда выше).
Восстанавливать файлы поштучно не стоит: обычно потеряно больше одного.

---

## Обновиться до свежей версии

```bash
git pull origin arena/01a01ed8-unity-mobile-engine
npm install
npm run dev
```

Проверить, что взялась нужная ревизия:

```bash
git log --oneline -1
```

---

## Сборка APK

Из браузера — кнопка **«Собрать APK»** в редакторе.

Из консоли:

```bash
npm run apk -- --name "Моя игра" --package com.studio.game --out game.apk
```

Проверить готовый файл:

```bash
node tools/cli.mjs info game.apk
```

Установка на устройство: `adb install -r game.apk` (или открыть файл
на телефоне, разрешив установку из неизвестных источников).

---

## Проверка, что всё работает

```bash
npm run doctor   # целостность копии
npm test         # 12 наборов тестов
```
