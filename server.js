const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware для обработки JSON
app.use(bodyParser.json());

// Проверка API ключа
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey && apiKey === process.env.API_KEY) {
        next();
    } else {
        res.status(403).send({ message: 'Forbidden' });
    }
};

// Настройка почтового транспортера
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // true для 465 порта, false для других
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// Обработка webhook от YooKassa
app.post('/webhook', authenticate, async (req, res) => {
    const event = req.body;

    // Проверка события. Здесь предполагается, что вы хотите обрабатывать успешные оплаты
    if (event.event && event.event === 'payment.succeeded') {
        const payment = event.object;
        const amount = payment.amount.value;
        const description = payment.description;
        const receipt = payment.receipt; // Информация о чеке
        const email = payment.metadata.email; // Предполагается, что email передается в metadata

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
        res.status(400).send({ message: 'Unsupported event' });
    }
});

// Запуск сервера
app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
});
