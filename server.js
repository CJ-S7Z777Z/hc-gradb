const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware для обработки JSON
app.use(bodyParser.json());

// Логирование всех запросов
app.use((req, res, next) => {
    console.log(`Получен запрос: ${req.method} ${req.url}`);
    console.log('Заголовки:', req.headers);
    console.log('Тело запроса:', req.body);
    next();
});

// Проверка API ключа
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey && apiKey === process.env.API_KEY) {
        next();
    } else {
        console.log('Несовпадение API ключа');
        res.status(403).send({ message: 'Forbidden' });
    }
};

// Настройка почтового транспортера
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: false, // true для 465 порта, false для других
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
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
            const email = payment.metadata && payment.metadata.email;

            if (!email) {
                console.error('Email не найден в metadata');
                return res.status(400).send({ message: 'Email not found in metadata' });
            }

            // Генерация QR-кода с информацией о билете
            const qrData = `
                Имя: ${payment.metadata.name} ${payment.metadata.surname}
                День: ${payment.metadata.day}
                Время: ${payment.metadata.time}
                Тип билета: ${payment.metadata.ticketType}
                Количество: ${payment.metadata.quantity}
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
                from: `"Ваше Название" <${process.env.SMTP_USER}>`,
                to: email,
                subject: 'Ваши билеты на каток',
                html: `
                    <h3>Спасибо за покупку билетов!</h3>
                    <p>Вот ваши билеты:</p>
                    <p><img src="${qrCodeImage}" alt="QR Code" /></p>
                    <p>Детали покупки:</p>
                    <ul>
                        <li>Имя: ${payment.metadata.name} ${payment.metadata.surname}</li>
                        <li>День: ${payment.metadata.day}</li>
                        <li>Время: ${payment.metadata.time}</li>
                        <li>Тип билета: ${payment.metadata.ticketType === 'regular' ? 'Билет на каток' : 'Льготный'}</li>
                        <li>Количество: ${payment.metadata.quantity}</li>
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

// Запуск сервера
app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
});
