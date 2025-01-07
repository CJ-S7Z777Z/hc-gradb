
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
// Используйте процесс.env.PORT, установленный Railway
const port = process.env.PORT || 5000;

// Middleware для обработки JSON
app.use(bodyParser.json());

// Логирование всех запросов
app.use((req, res, next) => {
    console.log(`\nПолучен запрос: ${req.method} ${req.url}`);
    console.log('Заголовки:', JSON.stringify(req.headers, null, 2));
    console.log('Тело запроса:', JSON.stringify(req.body, null, 2));
    next();
});

// Проверка API ключа
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const trimmedApiKey = process.env.API_KEY ? process.env.API_KEY.trim() : '';
    if (apiKey && apiKey === trimmedApiKey) {
        next();
    } else {
        console.log('Несовпадение API ключа');
        res.status(403).send({ message: 'Forbidden' });
    }
};

// Настройка почтового транспортера с обработкой ошибок
let transporter;
try {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST ? process.env.SMTP_HOST.trim() : '',
        port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
        secure: process.env.SMTP_PORT === '465', // true для 465 порта, false для других
        auth: {
            user: process.env.SMTP_USER ? process.env.SMTP_USER.trim() : '',
            pass: process.env.SMTP_PASS ? process.env.SMTP_PASS.trim() : ''
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    // Проверка соединения с почтовым сервером
    transporter.verify(function(error, success) {
        if (error) {
            console.error('Ошибка почтового транспортера:', error);
        } else {
            console.log('Почтовый транспортер готов к отправке писем');
        }
    });
} catch (error) {
    console.error('Ошибка при настройке почтового транспортера:', error);
}

// Обработка webhook от YooKassa
app.post('/webhook', authenticate, async (req, res) => {
    try {
        const event = req.body;

        console.log('Получено событие:', event.event);

        // Проверка события
        if (event.event && event.event === 'payment.succeeded') {
            const payment = event.object;
            const amount = payment.amount.value;
            const description = payment.description;
            let metadata = {};

            // Попытка извлечения данных из description
            if (description) {
                try {
                    metadata = JSON.parse(description);
                    console.log('Извлечены metadata:', metadata);
                } catch (error) {
                    console.error('Ошибка парсинга description:', error);
                }
            }

            const email = metadata.email;

            if (!email) {
                console.error('Email не найден в metadata');
                return res.status(400).send({ message: 'Email not found in metadata' });
            }

            // Генерация QR-кода с информацией о билете
            const qrData = `
                Имя: ${metadata.name} ${metadata.surname}
                День: ${metadata.day}
                Время: ${metadata.time}
                Тип билета: ${metadata.ticketType === 'regular' ? 'Билет на каток' : 'Льготный'}
                Количество: ${metadata.quantity}
                Цена: ${amount} руб.
            `;
            let qrCodeImage;
            try {
                qrCodeImage = await QRCode.toDataURL(qrData);
                console.log('QR-код сгенерирован');
            } catch (err) {
                console.error('Ошибка при генерации QR-кода:', err);
                return res.status(500).send({ message: 'Error generating QR code' });
            }

            // Отправка письма пользователю
            const mailOptions = {
                from: `"Ваше Название" <${process.env.SMTP_USER.trim()}>`,
                to: email,
                subject: 'Ваши билеты на каток',
                html: `
                    <h3>Спасибо за покупку билетов!</h3>
                    <p>Вот ваши билеты:</p>
                    <p><img src="${qrCodeImage}" alt="QR Code" /></p>
                    <p>Детали покупки:</p>
                    <ul>
                        <li>Имя: ${metadata.name} ${metadata.surname}</li>
                        <li>День: ${metadata.day}</li>
                        <li>Время: ${metadata.time}</li>
                        <li>Тип билета: ${metadata.ticketType === 'regular' ? 'Билет на каток' : 'Льготный'}</li>
                        <li>Количество: ${metadata.quantity}</li>
                        <li>Цена: ${amount} руб.</li>
                    </ul>
                `
            };

            try {
                await transporter.sendMail(mailOptions);
                console.log(`Письмо отправлено на ${email}`);
            } catch (err) {
                console.error('Ошибка при отправке письма:', err);
                return res.status(500).send({ message: 'Error sending email' });
            }

            res.status(200).send({ message: 'Webhook processed' });
        } else {
            console.log('Получено неподдерживаемое событие:', event.event);
            res.status(400).send({ message: 'Unsupported event' });
        }
    } catch (error) {
        console.error('Ошибка при обработке webhook:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});

// Обработчик корневого пути для предотвращения ошибок 499
app.get('/', (req, res) => {
    res.send('Сервер работает.');
});

// Обработка неопределенных маршрутов
app.use((req, res) => {
    res.status(404).send({ message: 'Not Found' });
});

// Обработка непредвиденных исключений
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception thrown:', err);
    process.exit(1); // Завершение процесса в случае непойманной ошибки
});

// Запуск сервера
app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
});
