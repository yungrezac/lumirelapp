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

// Наш API для связи с фронтендом
app.get('/api/products', async (req, res) => {
    try {
        // Делаем реальный запрос к актуальному WB API от лица сервера 
        const response = await fetch('https://content-api.wildberries.ru/content/v2/get/cards/list', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': WB_TOKEN
            },
            body: JSON.stringify({
                // filter: { withPhoto: 1 } запрашивает только товары с фото, 
                // что помогает отсеять неактивные черновики ("не в продаже")
                settings: { cursor: { limit: 100 }, filter: { withPhoto: 1 } }
            })
        });

        if (!response.ok) {
            throw new Error(`WB API error: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Базовые ключевые слова для определения категории "Красота" 
        // (WB API отдает только узкие подкатегории, поэтому мы проверяем их по словам)
        const BEAUTY_KEYWORDS = ["крем", "сыворотк", "маск", "пенк", "гель", "лосьон", "тоник", "пилинг", "скраб", "умывани", "патчи", "шампунь", "бальзам", "косметик", "красот", "макияж"];

        // Преобразуем формат WB в наш удобный формат для фронтенда
        let products = [];
        if (data && data.cards && data.cards.length > 0) {
            products = data.cards
                .filter(card => {
                    // Фильтр: Оставляем только товары из раздела Красота
                    const subject = (card.subjectName || "").toLowerCase();
                    // Проверяет вхождение ключевых слов бьюти-сферы в название подкатегории WB
                    return BEAUTY_KEYWORDS.some(kw => subject.includes(kw));
                })
                .map(card => {
                    return {
                        id: card.nmID,
                        nmId: card.nmID,
                        brand: card.brand || "lumirex",
                        name: card.title || "Без названия",
                        // Цены полностью удалены
                        rating: 4.8,
                        reviewsCount: 150,
                        subcategory: card.subjectName || "Красота",
                        description: card.description || "Описание товара",
                        images: card.photos && card.photos.length > 0 
                            ? card.photos.map(p => p.big || p["516x774"]) 
                            : ["https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=800"]
                    };
                });
        } else {
            // Если карточек пока нет, отдаем заглушки без цен
            products = MOCK_PRODUCTS;
        }

        res.json({ products });
    } catch (error) {
        console.error("Ошибка при получении данных от WB:", error);
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
