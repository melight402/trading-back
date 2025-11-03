# Быстрый старт

## 1. Настройка бэкенда

1. Создайте файл `.env` из `.env.example`:
```bash
cp .env.example .env
```

2. Сгенерируйте ключ шифрования:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

3. Заполните `.env`:
- `ENCRYPTION_KEY` - вставьте сгенерированный ключ
- `BINANCE_API_KEY` и `BINANCE_SECRET_KEY` - опционально (можно добавить позже через API)

4. Запустите сервер:
```bash
npm start
```

Сервер запустится на `http://localhost:3001`

## 2. Настройка фронтенда

1. Убедитесь, что зависимости установлены (уже установлены)

2. Запустите фронтенд:
```bash
cd ../trading-charts-with-tools
npm run dev
```

## 3. Тестирование

1. Откройте фронтенд в браузере
2. Создайте позицию на графике (LongShortPosition)
3. Нажмите кнопку "Экспорт позиций в консоль"
4. Проверьте консоль браузера и терминал бэкенда для логов
5. Проверьте базу данных в `./data/trading.db`
6. Проверьте скриншоты в `./data/screenshots/`

## 4. Проверка сохраненных данных

### Через API:
```bash
# Получить все сделки
curl http://localhost:3001/api/trades

# Получить статистику
curl http://localhost:3001/api/trades/stats

# Получить сделки по символу
curl http://localhost:3001/api/trades?symbol=BTCUSDT
```

### Через SQLite:
```bash
sqlite3 ./data/trading.db "SELECT * FROM trades ORDER BY created_at DESC LIMIT 5;"
```

