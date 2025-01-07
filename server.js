// server.js

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 5000;

// Middleware для парсинга JSON
app.use(bodyParser.json());

// Проверка, что все необходимые переменные окружения установлены
if (!process.env.YKASSA_SECRET_KEY || !process.env.EMAIL_SERVICE || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('Ошибка: Не все переменные окружения установлены.');
    process.exit(1);
}

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
    console.log(Получен вебхук: ${JSON.stringify(req.body)});

    const signature = req.headers['x-api-signature-sha256'];
    const body = JSON.stringify(req.body);

    // Верификация подписи вебхука
    const hmac = crypto.createHmac('sha256', process.env.YKASSA_SECRET_KEY);
    hmac.update(body);
    const digest = hmac.digest('hex');

    if (digest !== signature) {
        console.warn(Не удалось верифицировать вебхук. Ожидалось: ${digest}, Получено: ${signature});
        return res.status(400).send('Invalid signature');
    }

    const event = req.body.event;
    const object = req.body.object;

    console.log(Обработка события: ${event});

    if (event === 'payment.succeeded') {
        const payment = object;
        const email = payment.email || payment.account.id; // Получение email пользователя
        const description = payment.description; // Описание платежа
        const sum = payment.amount.value / 100; // Сумма платежа

        console.log(Платеж на сумму: ${sum} руб. от: ${email});
        console.log(Описание платежа: ${description});

        // Здесь вы можете парсить описание платежа, чтобы получить информацию о билетах
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
            html: 
                <p>Спасибо за покупку билетов!</p>
                <p>Ваши билеты:</p>
                <ul>
                    ${ticketInfo.tickets.map(ticket => <li>${ticket}</li>).join('')}
                </ul>
                <p>Ваш QR-код:</p>
                <img src="${qrCodeImage}" alt="QR Code" />
            ,
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(Письмо отправлено на ${email});
            res.status(200).send('OK');
        } catch (e) {
            console.error('Ошибка отправки письма:', e);
            res.status(500).send('Email sending failed');
        }
    } else {
        // Обработка других событий, если необходимо
        console.log(Событие не требуется обработки: ${event});
        res.status(200).send('Event ignored');
    }
});

// Маршрут для проверки работоспособности сервера
app.get('/', (req, res) => {
    res.send('Yookassa Webhook Server is running.');
});

// Запуск сервера
app.listen(port, () => {
    console.log(Server is running on port ${port});
});
