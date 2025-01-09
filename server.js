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

// Обработка webhook от YooKassa с проверкой API-ключа из URL
app.post('/webhook', async (req, res) => {
    const apiKey = req.query.api_key;

    // Проверка наличия и валидности API-ключа
    if (!apiKey || apiKey !== process.env.WEBHOOK_API_KEY) {
        console.warn('Неверный или отсутствующий API-ключ при получении вебхука.');
        return res.status(403).send('Forbidden');
    }

    // Опционально: Верификация подписи вебхука
    if (process.env.YKASSA_SECRET_KEY) { // Проверьте, задан ли секретный ключ
        if (!verifyYooKassaSignature(req)) {
            console.warn('Не удалось верифицировать вебхук от YooKassa.');
            return res.status(400).send('Invalid signature');
        }
    }

    const event = req.body;

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
                    <li>Имя: ${formData.name} ${formData.surname}</li>
                    <li>День: ${formData.day}</li>
                    <li>Время: ${sessionTime.start} - ${sessionTime.end}</li>
                    <li>Тип билета: ${ticketFullName === 'regular' ? 'Билет на каток' : 'Льготный'}</li>
                    <li>Количество: ${formData.quantity}</li>
                    <li>Цена: ${formData.totalPrice} руб.</li>
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
        res.status(400).send({ message: 'Unsupported event' });
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
