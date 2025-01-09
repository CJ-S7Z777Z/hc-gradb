
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
    console.log('Получен вебхук с API ключом:', apiKey);

    // Проверка наличия и валидности API-ключа
    if (!apiKey || apiKey !== process.env.WEBHOOK_API_KEY) {
        console.warn('Неверный или отсутствующий API-ключ при получении вебхука.');
        return res.status(403).send('Forbidden');
    }

    console.log('API ключ валиден. Обработка вебхука.');

    // Опционально: Верификация подписи вебхука
    if (process.env.YKASSA_SECRET_KEY) { // Проверьте, задан ли секретный ключ
        if (!verifyYooKassaSignature(req)) {
            console.warn('Не удалось верифицировать вебхук от YooKassa.');
            return res.status(400).send('Invalid signature');
        }
    }

    const event = req.body;
    console.log('Получено событие:', JSON.stringify(event, null, 2));

    // Проверка события: обрабатываем только успешные платежи
    if (event.event && event.event === 'payment.succeeded') {
        const payment = event.object;
        const amount = payment.amount.value;
        const description = payment.description;
        const metadata = payment.metadata || {};

        const email = metadata.email || null;
        const name = metadata.name || '';
        const surname = metadata.surname || '';
        const patronymic = metadata.patronymic || '';
        const day = metadata.day || '';
        const time = metadata.time || '';
        const ticketType = metadata.ticketType || 'regular';
        const quantity = metadata.quantity || '1';

        if (!email) {
            console.error('Email отсутствует в metadata.');
            return res.status(400).send({ message: 'Email missing in metadata' });
        }

        // Генерация QR-кода с информацией о билете
        const qrData = `
Имя: ${name} ${surname} ${patronymic}
День: ${day}
Время: ${time}
Тип билета: ${ticketType === 'regular' ? 'Билет на каток' : 'Льготный'}
Количество: ${quantity}
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

        // Получение информации о сеансе (пример)
        // Предполагается, что у вас есть какая-то логика для получения sessionTime по day и time
        // Ниже представлен простой пример. Вам нужно адаптировать его к вашей логике.

        // Пример расписания (заполните реальными данными)
        const schedule = {
            "воскресенье 05.01.2025": [{
                    "start": "09:00",
                    "end": "10:00",
                    "duration": 60
                },
                {
                    "start": "10:05",
                    "end": "11:05",
                    "duration": 60
                },
                {
                    "start": "11:20",
                    "end": "12:20",
                    "duration": 60
                },
                {
                    "start": "12:25",
                    "end": "13:25",
                    "duration": 60
                },
                {
                    "start": "13:40",
                    "end": "14:40",
                    "duration": 60
                },
                {
                    "start": "14:45",
                    "end": "15:45",
                    "duration": 60
                },
                {
                    "start": "16:00",
                    "end": "17:00",
                    "duration": 60
                },
                {
                    "start": "17:05",
                    "end": "18:05",
                    "duration": 60
                },
                {
                    "start": "18:20",
                    "end": "19:20",
                    "duration": 60
                },
                {
                    "start": "19:25",
                    "end": "20:25",
                    "duration": 60
                },
                {
                    "start": "20:30",
                    "end": "21:30",
                    "duration": 60
                }
            ],
      "понедельник 06.01.2025": [
        {
          "start": "10:00",
          "end": "11:00",
          "duration": 60
        },
        {
          "start": "11:05",
          "end": "12:05",
          "duration": 60
        },
        {
          "start": "12:20",
          "end": "13:20",
          "duration": 60
        },
        {
          "start": "13:25",
          "end": "14:25",
          "duration": 60
        },
        {
          "start": "14:40",
          "end": "15:40",
          "duration": 60
        },
        {
          "start": "15:45",
          "end": "16:45",
          "duration": 60
        },
        {
          "start": "17:00",
          "end": "18:00",
          "duration": 60
        },
        {
          "start": "18:05",
          "end": "19:05",
          "duration": 60
        },
        {
          "start": "19:20",
          "end": "20:20",
          "duration": 60
        },
        {
          "start": "20:25",
          "end": "21:25",
          "duration": 60
        }
      ],
      "вторник 07.01.2025": [
        {
          "start": "09:00",
          "end": "10:00",
          "duration": 60
        },
        {
          "start": "10:05",
          "end": "11:05",
          "duration": 60
        },
        {
          "start": "11:20",
          "end": "12:20",
          "duration": 60
        },
        {
          "start": "12:25",
          "end": "13:25",
          "duration": 60
        },
        {
          "start": "13:40",
          "end": "14:40",
          "duration": 60
        },
        {
          "start": "14:45",
          "end": "15:45",
          "duration": 60
        },
        {
          "start": "16:00",
          "end": "17:00",
          "duration": 60
        },
        {
          "start": "17:05",
          "end": "18:05",
          "duration": 60
        },
        {
          "start": "18:20",
          "end": "19:20",
          "duration": 60
        },
        {
          "start": "19:25",
          "end": "20:25",
          "duration": 60
        },
        {
          "start": "20:30",
          "end": "21:30",
          "duration": 60
        }
      ],
      "среда 08.01.2025": [
        {
          "start": "10:00",
          "end": "11:00",
          "duration": 60
        },
        {
          "start": "11:05",
          "end": "12:05",
          "duration": 60
        },
        {
          "start": "12:20",
          "end": "13:20",
          "duration": 60
        },
        {
          "start": "13:25",
          "end": "14:25",
          "duration": 60
        },
        {
          "start": "14:40",
          "end": "15:40",
          "duration": 60
        },
        {
          "start": "15:45",
          "end": "16:45",
          "duration": 60
        },
        {
          "start": "17:00",
          "end": "18:00",
          "duration": 60
        },
        {
          "start": "18:00",
          "end": "19:00",
          "duration": 60
        },
        {
          "start": "19:15",
          "end": "20:15",
          "duration": 60
        },
        {
          "start": "20:15",
          "end": "20:45",
          "duration": 30
        }
      ],
      "четверг 09.01.2025": [
        {
          "start": "09:00",
          "end": "10:00",
          "duration": 60
        },
        {
          "start": "10:00",
          "end": "11:00",
          "duration": 60
        },
        {
          "start": "11:15",
          "end": "12:15",
          "duration": 60
        },
        {
          "start": "12:15",
          "end": "13:15",
          "duration": 60
        },
        {
          "start": "13:30",
          "end": "14:30",
          "duration": 60
        },
        {
          "start": "14:30",
          "end": "15:30",
          "duration": 60
        },
        {
          "start": "15:45",
          "end": "16:45",
          "duration": 60
        },
        {
          "start": "16:45",
          "end": "17:45",
          "duration": 60
        },
        {
          "start": "18:00",
          "end": "18:45",
          "duration": 45
        },
        {
          "start": "18:45",
          "end": "19:15",
          "duration": 30
        }
      ],
      "пятница 10.01.2025": [
        {
          "start": "10:00",
          "end": "11:00",
          "duration": 60
        },
        {
          "start": "11:00",
          "end": "12:00",
          "duration": 60
        },
        {
          "start": "12:15",
          "end": "13:15",
          "duration": 60
        },
        {
          "start": "13:15",
          "end": "14:15",
          "duration": 60
        },
        {
          "start": "14:30",
          "end": "15:30",
          "duration": 60
        },
        {
          "start": "15:30",
          "end": "16:30",
          "duration": 60
        },
        {
          "start": "16:45",
          "end": "17:45",
          "duration": 60
        },
        {
          "start": "17:45",
          "end": "18:45",
          "duration": 60
        },
        {
          "start": "18:45",
          "end": "19:30",
          "duration": 45
        }
      ],
      "суббота 11.01.2025": [
        {
          "start": "10:00",
          "end": "11:00",
          "duration": 60
        },
        {
          "start": "11:00",
          "end": "12:00",
          "duration": 60
        },
        {
          "start": "12:00",
          "end": "12:45",
          "duration": 45
        },
        {
          "start": "14:45",
          "end": "15:45",
          "duration": 60
        },
        {
          "start": "15:45",
          "end": "16:45",
          "duration": 60
        },
        {
          "start": "17:00",
          "end": "18:00",
          "duration": 60
        },
        {
          "start": "18:00",
          "end": "19:00",
          "duration": 60
        },
        {
          "start": "19:15",
          "end": "20:15",
          "duration": 60
        },
        {
          "start": "20:15",
          "end": "21:00",
          "duration": 45
        },
        {
          "start": "21:00",
          "end": "22:00",
          "duration": 60
        }
      ]
        }
    

        const sessionTimes = schedule[day] || [];
        const sessionTime = sessionTimes.find(s => s.start === time);

        if (!sessionTime) {
            console.error('Выбран недоступный сеанс.');
            return res.status(400).send({ message: 'Invalid session time' });
        }

        // Получаем полное название типа билета
        const ticketFullName = ticketType === 'regular' ? 'Билет на каток' : 'Льготный';

        // Формируем день недели с заглавной буквы (если требуется)
        // Если day уже содержит полное название, можно пропустить
        const dayFullName = day.charAt(0).toUpperCase() + day.slice(1);

        // Формируем строку для ym_merchant_receipt с адресом и форматированием
        const ymMerchantReceipt = JSON.stringify({
            customer: {
                email: email
            },
            items: [{
                text: `Адрес: Шоссе Энтузиастов д. 12 к. 2, ТЦ ГОРОД ЛЕФОРТОВО;\n${ticketFullName};\n${dayFullName}: ${sessionTime.start} - ${sessionTime.end}`,
                quantity: quantity,
                price: {
                    amount: amount,
                    currency: "RUB"
                },
                paymentSubjectType: "commodity",
                paymentMethodType: "full_prepayment",
                tax: "1"
            }]
        });

        console.log('YM Merchant Receipt:', ymMerchantReceipt);

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
                    <li>Имя: ${name} ${surname} ${patronymic}</li>
                    <li>День: ${day}</li>
                    <li>Время: ${sessionTime.start} - ${sessionTime.end}</li>
                    <li>Тип билета: ${ticketFullName}</li>
                    <li>Количество: ${quantity}</li>
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
