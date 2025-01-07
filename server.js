// server.js

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');

const app = express();
const port = process.env.PORT || 5000;

// Middleware для парсинга JSON
app.use(bodyParser.json());

// Настройка транспорта для nodemailer
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE, // Например, 'Gmail'
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Маршрут для обработки вебхуков от ЮKассы
app.post('/webhook', async (req, res) => {
    const signature = req.headers['x-api-signature-sha256'];
    const body = JSON.stringify(req.body);

    // Верификация подписи вебхука
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', process.env.YKASSA_SECRET_KEY);
    hmac.update(body);
    const digest = hmac.digest('hex');

    if (digest !== signature) {
        console.log('Не удалось верифицировать вебхук');
        return res.status(400).send('Invalid signature');
    }

    const event = req.body.event;
    const object = req.body.object;

    if (event === 'payment.succeeded') {
        const payment = object;
        const email = payment.email || payment.account.id; // Получение email пользователя
        const description = payment.description; // Описание платежа, можно использовать для передачи информации о билетах
        const sum = payment.amount.value / 100; // Сумма платежа

        // Здесь вы можете парсить описание платежа, чтобы получить информацию о билетах
        // Предположим, что описание содержит JSON с информацией о билетах
        let ticketInfo;
        try {
            ticketInfo = JSON.parse(description);
        } catch (e) {
            console.error('Ошибка парсинга описания платежа:', e);
            return res.status(400).send('Invalid description format');
        }

        // Генерация QR-кода
        const qrData = JSON.stringify(ticketInfo);
        let qrCodeImage;
        try {
            qrCodeImage = await QRCode.toDataURL(qrData);
        } catch (e) {
            console.error('Ошибка генерации QR-кода:', e);
            return res.status(500).send('QR code generation failed');
        }

        // Отправка письма
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Ваши билеты',
            html: `
                <p>Спасибо за покупку билетов!</p>
                <p>Ваши билеты:</p>
                <ul>
                    ${ticketInfo.tickets.map(ticket => `<li>${ticket}</li>`).join('')}
                </ul>
                <p>Ваш QR-код:</p>
                <img src="${qrCodeImage}" alt="QR Code" />
            `,
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`Письмо отправлено на ${email}`);
            res.status(200).send('OK');
        } catch (e) {
            console.error('Ошибка отправки письма:', e);
            res.status(500).send('Email sending failed');
        }
    } else {
        // Обработка других событий, если необходимо
        res.status(200).send('Event ignored');
    }
});

// Маршрут для проверки работоспособности сервера
app.get('/', (req, res) => {
    res.send('Yookassa Webhook Server is running.');
});

// Запуск сервера
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
