const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
require('dotenv').config();
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

// Middleware для обработки JSON
app.use(bodyParser.json());

// Настройка почтового транспортера
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_PORT === '465', // true для 465 порта, false для других
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    // Дополнительные настройки для улучшения надежности соединения
    tls: {
        rejectUnauthorized: false // Используйте с осторожностью
    }
});

// Функция для верификации подписи вебхука (если YooKassa поддерживает)
const verifyYooKassaSignature = (req) => {
    const signature = req.headers['x-api-signature-sha256'];
    const secret = process.env.YKASSA_SECRET_KEY;
    const hmac = crypto.createHmac('sha256', secret);
    const body = JSON.stringify(req.body);
    hmac.update(body);
    const digest = hmac.digest('hex');
    return digest === signature;
};

// Обработка webhook от YooKassa
app.post('/webhook', async (req, res) => {
    const apiKey = req.query.api_key;
    console.log('Received webhook with API key:', apiKey);

    // Проверка наличия и валидности API-ключа
    if (!apiKey || apiKey !== process.env.WEBHOOK_YOOKASSA_API_KEY) {
        console.warn('Неверный или отсутствующий API-ключ при получении вебхука.');
        return res.status(403).send('Forbidden');
    }

    console.log('API key valid. Processing webhook.');

    // Временно отключаем проверку подписи для тестирования
    /*
    if (process.env.YKASSA_SECRET_KEY) { // Проверьте, задан ли секретный ключ
        if (!verifyYooKassaSignature(req)) {
            console.warn('Не удалось верифицировать вебхук от YooKassa.');
            return res.status(400).send('Invalid signature');
        }
    }
    */

    const event = req.body;
    console.log('Event received:', JSON.stringify(event, null, 2));

    // Проверка события: обрабатываем только успешные платежи
    if (event.event && event.event === 'payment.succeeded') {
        const payment = event.object;
        const amount = payment.amount.value;
        const description = payment.description;
        const email = (payment.metadata && payment.metadata.email) || null; // Проверка наличия email

        if (!email) {
            console.error('Email отсутствует в metadata.');
            return res.status(400).send({ message: 'Email missing in metadata' });
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
            console.log('QR-код сгенерирован.');
        } catch (err) {
            console.error('Ошибка при генерации QR-кода:', err);
            return res.status(500).send({ message: 'Error generating QR code' });
        }

        // Отправка письма пользователю
        const mailOptions = {
            from: `HC-GRAD (Билеты) <${process.env.SMTP_USER}>`,
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
        console.warn('Unsupported event:', event.event);
        res.status(400).send({ message: 'Unsupported event' });
    }
});

// Маршрут для проверки работоспособности сервера
app.get('/', (req, res) => {
    res.send('YooKassa Webhook Server is running.');
});

// Запуск сервера
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
