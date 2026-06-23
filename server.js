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

// Моковые данные на случай, если сервер только-только проснулся и еще качает данные
const MOCK_PRODUCTS = [
    {
        id: 1, nmId: 1, brand: "lumirex",
        name: "Подождите пару секунд, товары загружаются...",
        subcategory: "Загрузка",
        description: "Сервер обновляет кэш товаров. Пожалуйста, закройте и откройте приложение снова через 5 секунд.",
        images: ["https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=800"]
    }
];

// Наше хранилище (Кэш) в оперативной памяти сервера
let productsCache = {
    data: null,
    isFetching: false,
    lastUpdate: null
};

// ⚡ ГЛАВНАЯ МАГИЯ: ФУНКЦИЯ ФОНОВОГО КЭШИРОВАНИЯ
async function updateCacheBackground() {
    // Если уже качаем прямо сейчас - не запускаем второй раз
    if (productsCache.isFetching) return;
    productsCache.isFetching = true;

    try {
        console.log("Начинаем фоновую загрузку всех товаров с WB...");
        let allCards = [];
        let currentCursor = { limit: 100 };
        let hasMore = true;

        // Вытягиваем ВСЕ товары через пагинацию
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

            if (!response.ok) throw new Error(`WB API error: ${response.statusText}`);

            const data = await response.json();
            
            if (data && data.cards && data.cards.length > 0) {
                allCards = allCards.concat(data.cards);
                if (data.cursor && data.cards.length === 100) {
                    currentCursor = data.cursor;
                    currentCursor.limit = 100;
                } else {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        }
        
        if (allCards.length > 0) {
            // ФИЛЬТР ПО ЯРЛЫКАМ (ТЕГАМ) ВБ
            const targetLabels = ['беликам', 'интерфармакс'];
            
            const filteredCards = allCards.filter(card => {
                if (!card.tags || !Array.isArray(card.tags)) return false;
                
                // Проверяем каждый тег товара
                return card.tags.some(tag => {
                    if (!tag || !tag.name) return false;
                    const tagLower = tag.name.toLowerCase().replace(/\s|-/g, '');
                    return targetLabels.some(label => tagLower.includes(label));
                });
            });

            const products = filteredCards.map(card => {
                return {
                    id: card.nmID,
                    nmId: card.nmID,
                    brand: card.brand || "lumirex",
                    name: card.title || "Без названия",
                    subcategory: card.subjectName || "Красота",
                    description: card.description || "Описание товара",
                    images: card.photos && card.photos.length > 0 
                        ? card.photos.map(p => p.big || p["516x774"]) 
                        : ["https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=800"]
                };
            });

            // Сохраняем в оперативную память
            productsCache.data = products;
            productsCache.lastUpdate = new Date().toLocaleString();
            console.log(`[УСПЕХ] Кэш обновлен. Всего карточек: ${allCards.length}. Под ярлыки попало: ${products.length} шт.`);
        }
    } catch (error) {
        console.error("[ОШИБКА] Фоновое обновление не удалось:", error);
    } finally {
        productsCache.isFetching = false;
    }
}

// 1. При старте сервера СРАЗУ запускаем фоновое скачивание данных
updateCacheBackground();

// 2. Повторяем загрузку каждые 10 минут (в фоне, покупатели этого не заметят!)
setInterval(updateCacheBackground, 10 * 60 * 1000);


// API ДЛЯ ФРОНТЕНДА: ОТДАЕТ ДАННЫЕ МГНОВЕННО ИЗ КЭША
app.get('/api/products', (req, res) => {
    if (productsCache.data) {
        // Данные готовы — отдаем моментально
        res.json({ products: productsCache.data });
    } else {
        // Если сервер проснулся от спячки и еще не успел скачать данные с ВБ
        // Отдаем заглушку, чтобы интерфейс приложения не ломался и не висел
        res.json({ products: MOCK_PRODUCTS });
    }
});

// Все неизвестные маршруты отдают фронтенд
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
