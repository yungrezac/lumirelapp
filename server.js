const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
// Railway автоматически выдает порт через переменную окружения PORT
const PORT = process.env.PORT || 3000;

// Ваш токен Wildberries
const WB_TOKEN = process.env.WB_TOKEN || "eyJhbGciOiJFUzI1NiIsImtpZCI6IjIwMjYwMzAydjEiLCJ0eXAiOiJKV1QifQ.eyJhY2MiOjMsImVudCI6MSwiZXhwIjoxNzg4NDg1MzUxLCJmb3IiOiJzZWxmIiwiaWQiOiIwMTljYmUzMC0yMzZiLTc4Y2EtOGFjMC02MzcwMDk5YzY4Y2IiLCJpaWQiOjcxNzQ0MzMwLCJvaWQiOjI1MDA1NzY2NiwicyI6MTgsInNpZCI6IjgwNzFlOWUyLTExZTUtNDk5Yi1hZWRjLTg3NWE4NzU2MjFiNCIsInQiOmZhbHNlLCJ1aWQiOjcxNzQ0MzMwfQ.Br-4Dj3af3LwB5ldvZJ6Vrj9KenlXs817F91q8MsQ468l9RAmkxLAXiSRgDRsUqk5B372PEzJXI29bN7XQneSw";

app.use(cors());
app.use(express.json());

// Раздаем статические файлы фронтенда из папки public
app.use(express.static(path.join(__dirname, 'public')));

// Моковые данные на случай, если по API пока ничего не придет (новый кабинет без карточек)
const MOCK_PRODUCTS = [
    {
        id: 15682910, nmId: 15682910, brand: "lumirex",
        name: "Сыворотка для лица увлажняющая с гиалуроновой кислотой",
        rating: 4.8, reviewsCount: 1245,
        subcategory: "Сыворотки",
        description: "Профессиональная сыворотка lumirex обеспечивает глубокое увлажнение...",
        images: ["https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=800"]
    },
    {
        id: 29471622, nmId: 29471622, brand: "lumirex",
        name: "Крем для лица ночной питательный",
        rating: 4.9, reviewsCount: 890,
        subcategory: "Кремы",
        description: "Ночной крем интенсивно питает кожу во время сна...",
        images: ["https://images.unsplash.com/photo-1611074585206-9032e2195f00?auto=format&fit=crop&q=80&w=800"]
    }
];

// Кэш для товаров, чтобы не делать десятки запросов к ВБ при каждом открытии приложения
let productsCache = {
    data: null,
    lastFetch: 0
};
const CACHE_TTL = 5 * 60 * 1000; // Кэшируем товары на 5 минут

// Наш API для связи с фронтендом
app.get('/api/products', async (req, res) => {
    try {
        // Если товары скачивались меньше 5 минут назад, отдаем из кэша (мгновенно)
        if (productsCache.data && (Date.now() - productsCache.lastFetch < CACHE_TTL)) {
            return res.json({ products: productsCache.data });
        }

        let allCards = [];
        let currentCursor = { limit: 100 };
        let hasMore = true;

        // Вытягиваем ВСЕ товары через пагинацию (по 100 штук за раз)
        while (hasMore) {
            const response = await fetch('https://content-api.wildberries.ru/content/v2/get/cards/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': WB_TOKEN
                },
                body: JSON.stringify({
                    settings: { cursor: currentCursor, filter: { withPhoto: 1 } }
                })
            });

            if (!response.ok) {
                throw new Error(`WB API error: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data && data.cards && data.cards.length > 0) {
                allCards = allCards.concat(data.cards);
                
                // Надежная логика пагинации ВБ: передаем их же курсор дальше
                if (data.cursor && data.cards.length === 100) {
                    currentCursor = data.cursor;
            if (data.cursor && data.cursor.updatedAt && data.cursor.nmID && data.cards && data.cards.length === 100) {
                currentCursor = { 
                    limit: 100, 
                    updatedAt: data.cursor.updatedAt, 
                    nmID: data.cursor.nmID 
                };
            } else {
                hasMore = false; // Товары закончились
            }
        }
        
        // Преобразуем формат WB в наш удобный формат для фронтенда
        let products = [];
        if (allCards.length > 0) {
            // ФИЛЬТР: Проверяем именно массив тегов (ярлыков), заданных в кабинете продавца WB
            const targetTags = ['беликам', 'интерфармакс'];
            
            const taggedCards = allCards.filter(card => {
                // Если у товара нет ярлыков, пропускаем его
                if (!card.tags || !Array.isArray(card.tags)) return false;
                
                // Проверяем, есть ли среди ярлыков нужные нам
                return card.tags.some(tag => {
                    // API WB может отдавать теги как объекты {id: 1, name: "тег"} или строки
                    const tagName = typeof tag === 'string' ? tag : (tag.name || '');
                    return targetTags.includes(tagName.toLowerCase().trim());
                });
            });

            products = taggedCards.map(card => {
                return {
                    id: card.nmID,
                    nmId: card.nmID,
                    brand: card.brand || "lumirex",
                    name: card.title || "Без названия",
                    subcategory: card.subjectName || "Красота",
                    description: card.description || "Описание товара",
                    // Достаем картинки из ответа WB
                    images: card.photos && card.photos.length > 0 
                        ? card.photos.map(p => p.big || p["516x774"]) 
                        : ["https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=800"]
                };
            });
        } else {
            // Если карточек на аккаунте пока нет, отдаем заглушки
            products = MOCK_PRODUCTS;
        }

        // Сохраняем в кэш
        productsCache.data = products;
        productsCache.lastFetch = Date.now();

        res.json({ products });
    } catch (error) {
        console.error("Ошибка при получении данных от WB:", error);
        // В случае ошибки отдаем то, что есть в кэше, либо заглушки
        res.json({ products: productsCache.data || MOCK_PRODUCTS });
    }
});

// Все неизвестные маршруты отдают фронтенд
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
