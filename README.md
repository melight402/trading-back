# Trading Backend

Backend сервер для торгового приложения с поддержкой Binance API и сохранения сделок.

## Функциональность

- **Управление позициями**: Сохранение позиций с фронтенда в базу данных
- **Binance API**: Интеграция с Binance для получения данных и выполнения ордеров
- **Безопасное хранение кредов**: Шифрование и безопасное хранение API ключей
- **Скриншоты**: Загрузка и сохранение скриншотов страниц с графиками
- **API для аналитики**: Получение данных о сделках для построения графиков

## Установка

1. Установите зависимости:
```bash
npm install
```

2. Создайте файл `.env` на основе `.env.example`:
```bash
cp .env.example .env
```

3. Заполните `.env` файл:
```
PORT=3001
NODE_ENV=development

BINANCE_API_KEY=your_api_key_here
BINANCE_SECRET_KEY=your_secret_key_here

ENCRYPTION_KEY=your_32_character_encryption_key_here

DB_PATH=./data/trading.db
SCREENSHOTS_PATH=./data/screenshots
```

**Важно**: Для генерации безопасного ключа шифрования:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

4. Инициализируйте базу данных:
```bash
npm run init-db
```

База данных создастся автоматически при первом запуске сервера.

## Запуск

```bash
npm start
```

Для разработки с автоперезагрузкой:
```bash
npm run dev
```

Сервер запустится на `http://localhost:3001`

## API Endpoints

### Позиции

- `POST /api/positions` - Сохранение позиций
  ```json
  {
    "positions": [...],
    "screenshot": "path/to/screenshot.png"
  }
  ```

- `GET /api/positions` - Получение списка позиций
  - Query params: `symbol`, `limit`, `offset`

### Binance

- `POST /api/binance/credentials` - Сохранение зашифрованных кредов
  ```json
  {
    "apiKey": "your_api_key",
    "secretKey": "your_secret_key",
    "platform": "binance"
  }
  ```

- `GET /api/binance/test` - Тест подключения к Binance
- `GET /api/binance/account` - Информация об аккаунте
- `GET /api/binance/exchange-info` - Информация о бирже
- `GET /api/binance/price/:symbol` - Текущая цена символа
- `POST /api/binance/order` - Размещение ордера

### Скриншоты

- `POST /api/screenshots/upload` - Загрузка скриншота (multipart/form-data)
- `GET /api/screenshots/:filename` - Получение скриншота

### Сделки (для аналитики)

- `GET /api/trades` - Список всех сделок
  - Query params: `symbol`, `direction`, `startDate`, `endDate`, `limit`, `offset`
- `GET /api/trades/stats` - Статистика по сделкам
- `GET /api/trades/:id` - Получение конкретной сделки

## Структура базы данных

### Таблица `trades`
- `id` - ID записи
- `position_id` - ID позиции с фронтенда
- `symbol` - Торговая пара
- `interval` - Таймфрейм
- `direction` - Направление (Long/Short)
- `entry_price` - Цена входа
- `stop_loss` - Стоп-лосс
- `take_profit` - Тейк-профит
- `entry_stop_loss_usdt` - Размер риска в USDT
- `entry_stop_loss_coins` - Размер риска в монетах
- `entry_pt_usdt` - Прибыль в USDT
- `entry_pt_coins` - Прибыль в монетах
- `screenshot_path` - Путь к скриншоту
- `created_at` - Дата создания
- `updated_at` - Дата обновления

### Таблица `binance_credentials`
- `id` - ID записи
- `platform` - Платформа (binance)
- `api_key_encrypted` - Зашифрованный API ключ
- `secret_key_encrypted` - Зашифрованный секретный ключ
- `created_at` - Дата создания
- `updated_at` - Дата обновления

## Безопасность

- API ключи шифруются перед сохранением в базу данных
- Используется AES-256-GCM шифрование
- Обязательно установите `ENCRYPTION_KEY` в `.env`
- Не коммитьте `.env` файл в репозиторий

## Просмотр данных

### Веб-интерфейс

После запуска сервера откройте в браузере:
```
http://localhost:3001
```

Вы увидите веб-интерфейс для просмотра всех сделок с:
- Фильтрацией по символу, направлению, датам
- Статистикой по сделкам
- Скриншотами (можно открыть в полном размере)
- Карточками сделок с полной информацией

### Графические инструменты для SQLite

Если хотите просматривать БД напрямую, используйте:

1. **DB Browser for SQLite** (бесплатный, кроссплатформенный)
   - Скачать: https://sqlitebrowser.org/
   - Просто откройте файл `./data/trading.db`

2. **DBeaver** (бесплатный, универсальный)
   - Скачать: https://dbeaver.io/
   - Поддерживает SQLite и множество других БД

3. **SQLite Studio** (бесплатный, легковесный)
   - Скачать: https://sqlitestudio.pl/

4. **VS Code расширение**
   - Установите расширение "SQLite Viewer" или "SQLite" в VS Code
   - Откройте файл `.db` прямо в редакторе

5. **Командная строка**
   ```bash
   sqlite3 ./data/trading.db
   .tables                    # показать таблицы
   SELECT * FROM trades;       # показать все сделки
   .quit                      # выйти
   ```

### Просмотр скриншотов

Скриншоты хранятся в папке `./data/screenshots/`

Также их можно посмотреть через веб-интерфейс на `http://localhost:3001` или напрямую по URL:
```
http://localhost:3001/api/screenshots/[имя_файла]
```

## Интеграция с фронтендом

На фронтенде нужно будет:

1. Отправлять позиции на `POST /api/positions`
2. Делать скриншот страницы (можно использовать библиотеку html2canvas)
3. Отправлять скриншот на `POST /api/screenshots/upload`
4. При сохранении позиции указывать путь к скриншоту

Пример отправки данных с фронтенда:
```javascript
// Сделать скриншот (используя html2canvas)
import html2canvas from 'html2canvas';

const takeScreenshot = async () => {
  const canvas = await html2canvas(document.body);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  return blob;
};

// Отправить данные
const savePosition = async (positions) => {
  const screenshot = await takeScreenshot();
  const formData = new FormData();
  formData.append('screenshot', screenshot, 'screenshot.png');
  
  // Сначала загружаем скриншот
  const screenshotResponse = await fetch('http://localhost:3001/api/screenshots/upload', {
    method: 'POST',
    body: formData
  });
  const screenshotData = await screenshotResponse.json();
  
  // Затем сохраняем позицию со ссылкой на скриншот
  const positionResponse = await fetch('http://localhost:3001/api/positions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      positions: positions,
      screenshot: screenshotData.path
    })
  });
  
  return await positionResponse.json();
};
```

