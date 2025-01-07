
import os
import json
import hmac
import hashlib
import qrcode
import io
from flask import Flask, request, jsonify, redirect, url_for, render_template
from yookassa import Configuration, Payment
from flask_mail import Mail, Message
from dotenv import load_dotenv

# Загрузка переменных окружения из .env файла
load_dotenv()

app = Flask(__name__)

# Конфигурация ЮKassa
Configuration.account_id = os.getenv('SHOP_ID')
Configuration.secret_key = os.getenv('SECRET_KEY')

# Конфигурация Flask-Mail
app.config['MAIL_SERVER'] = os.getenv('MAIL_SERVER')
app.config['MAIL_PORT'] = int(os.getenv('MAIL_PORT'))
app.config['MAIL_USE_TLS'] = os.getenv('MAIL_USE_TLS') == 'True'
app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD')
app.config['MAIL_DEFAULT_SENDER'] = os.getenv('MAIL_DEFAULT_SENDER')

mail = Mail(app)

# Специальный ключ для аутентификации запросов от фронтенда
API_KEY = os.getenv('API_KEY', 'your_api_key')  # Установите свой ключ

# Максимум билетов на сеанс
MAX_TICKETS_PER_SESSION = 50
current_tickets_sold = {}  # Храним количество проданных билетов по сеансам

def generate_qr_code(data):
    """Генерация QR-кода из данных."""
    qr = qrcode.QRCode(
        version=1,
        box_size=10,
        border=5
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill='black', back_color='white')
    # Сохранение изображения в байтовый поток
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer.read()

@app.route('/create-payment', methods=['POST'])
def create_payment():
    # Аутентификация по API_KEY
    auth_header = request.headers.get('Authorization')
    if not auth_header or auth_header != f"Bearer {API_KEY}":
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    required_fields = ['name', 'surname', 'patronymic', 'phone', 'email', 'day', 'time', 'ticketType', 'quantity', 'totalPrice']
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing fields'}), 400

    # Проверка количества доступных билетов
    session_key = f"{data['day']}-{data['time']}"
    if session_key not in current_tickets_sold:
        current_tickets_sold[session_key] = 0

    quantity = int(data['quantity'])
    if current_tickets_sold[session_key] + quantity > MAX_TICKETS_PER_SESSION:
        return jsonify({'error': 'К сожалению, на этот сеанс уже нет свободных билетов.'}), 400

    current_tickets_sold[session_key] += quantity  # Увеличиваем количество проданных билетов

    # Создание платежа через ЮKassa
    try:
        payment = Payment.create({
            "amount": {
                "value": data['totalPrice'],
                "currency": "RUB"
            },
            "confirmation": {
                "type": "redirect",
                "return_url": "https://hc-grad/"  # Замените на вашу страницу успешной оплаты
            },
            "capture": True,
            "description": f"Покупка билетов: {quantity} шт.",
            "receipt": {
                "customer": {
                    "email": data['email']
                },
                "items": [
                    {
                        "description": f"Билет: {'На каток' if data['ticketType'] == 'regular' else 'Льготный'}\nДень: {data['day']}\nВремя: {data['time']}",
                        "quantity": quantity,
                        "amount": {
                            "value": data['totalPrice'],
                            "currency": "RUB"
                        },
                        "vat_code": "1",
                        "payment_subject": "commodity",
                        "payment_mode": "full_prepayment",
                        "type": "payment_item"
                    }
                ]
            },
            "metadata": {
                "name": data['name'],
                "surname": data['surname'],
                "patronymic": data['patronymic'],
                "phone": data['phone'],
                "email": data['email'],
                "day": data['day'],
                "time": data['time'],
                "ticketType": data['ticketType'],
                "quantity": data['quantity']
            }
        })

        return jsonify({
            'confirmation_url': payment.confirmation.confirmation_url
        })
    except Exception as e:
        print(e)
        return jsonify({'error': 'Ошибка при создании платежа'}), 500

@app.route('/webhook', methods=['POST'])
def webhook():
    # Получение заголовка подписи
    signature = request.headers.get('X-Yookassa-Signature')
    webhook_secret = os.getenv('WEBHOOK_SECRET')

    # Проверка подписи
    body = request.get_data(as_text=True)
    expected_signature = hmac.new(
        webhook_secret.encode(),
        body.encode(),
        hashlib.sha256
    ).hexdigest()

    if signature != expected_signature:
        return 'Invalid signature', 403

    event = json.loads(body)

    if event['event'] == 'payment.succeeded':
        payment = event['object']
        metadata = payment.get('metadata', {})
        email = metadata.get('email')

        if not email:
            print('Нет email в метаданных платежа.')
            return 'OK', 200

        # Генерация QR-кода
        tickets_info = {
            'name': metadata.get('name'),
            'surname': metadata.get('surname'),
            'patronymic': metadata.get('patronymic'),
            'day': metadata.get('day'),
            'time': metadata.get('time'),
            'ticketType': metadata.get('ticketType'),
            'quantity': metadata.get('quantity')
        }

        qr_data = json.dumps(tickets_info, ensure_ascii=False)
        qr_image = generate_qr_code(qr_data)

        # Отправка письма с QR-кодом
        try:
            msg = Message(
                subject='Ваши билеты',
                recipients=[email],
                html=render_template('payment_success.html', tickets=tickets_info)
            )
            # Вложение QR-кода
            msg.attach('qrcode.png', 'image/png', qr_image)
            mail.send(msg)
            print(f'Письмо отправлено на {email}')
        except Exception as e:
            print(f'Ошибка при отправке письма: {e}')

    return 'OK', 200

@app.route('/payment-success')
def payment_success():
    # Страница подтверждения успешной оплаты
    return render_template('payment_success.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
