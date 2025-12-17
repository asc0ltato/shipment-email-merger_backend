import axios from 'axios';
import { IEmail } from '@/models/email';
import { ShipmentRequest } from '@/models/summary';
import { logger } from '@/utils';
import { EmailGroupId } from '@/utils/email-group-id';

export class GeminiService {
    private static instance: GeminiService;
    private modelName: string = 'gemini-2.5-flash';
    private apiKey: string = '';
    private isEnabled: boolean = false;
    private emailGroupIdService: EmailGroupId;

    private constructor() {
        this.emailGroupIdService = new EmailGroupId();
    }

    public static getInstance(): GeminiService {
        if (!GeminiService.instance) {
            GeminiService.instance = new GeminiService();
            GeminiService.instance.initialize().catch(err => {
                logger.error('Failed to initialize Gemini service:', err);
            });
        }
        return GeminiService.instance;
    }

    private async initialize(): Promise<void> {
        try {
            // API ключ Gemini (обязательный)
            this.apiKey = process.env.GEMINI_API_KEY || '';
            if (!this.apiKey) {
                logger.error('GEMINI_API_KEY environment variable is not set');
                this.isEnabled = false;
                return;
            }
            
            logger.info('Gemini API service initialization');
            logger.info(`Gemini Model: ${this.modelName}`);
            logger.info('Using direct HTTP requests with API key in headers');

            this.isEnabled = true;
            logger.info('Gemini API service initialized successfully');
        } catch (error) {
            logger.error('Error initializing Gemini API service:', error);
            this.isEnabled = false;
        }
    }

    private formatEmailContext(emails: IEmail[]): string {
        return emails
            .map((email, index) => {
                const date = new Date(email.date);
                const emailText = (email as any).text || '';
                return `
            Email ${index + 1}:
            Date: ${date.toLocaleDateString('ru-RU')}
            Subject: ${email.subject}
            From: ${email.from}
            To: ${email.to}
            Text: ${emailText.substring(0, 800)}${emailText.length > 800 ? '...' : ''}
                    `.trim();
            })
            .join('\n\n');
    }

    public isMeaningfulAnalysis(structuredData: ShipmentRequest): boolean {
        if (!structuredData.shipment_details || structuredData.shipment_details.length === 0) {
            return false;
        }

        const shipment = structuredData.shipment_details[0];

        const hasValidStringValue = (value: any, invalidPatterns: string[]): boolean => {
            return value !== null && 
                value !== undefined && 
                typeof value === 'string' &&
                value.length > 0 &&
                !invalidPatterns.some(pattern => value.includes(pattern));
        };

        const hasAnyRealData = 
            hasValidStringValue(shipment.shipping_date_from, ['дата', 'date in format', 'date']) ||
            hasValidStringValue(shipment.shipping_date_to, ['дата', 'date in format', 'date']) ||
            hasValidStringValue(shipment.arrival_date_from, ['дата', 'date in format', 'date']) ||
            hasValidStringValue(shipment.arrival_date_to, ['дата', 'date in format', 'date']) ||

            hasValidStringValue(shipment.address_from?.city, ['город', 'city', 'select city']) ||
            hasValidStringValue(shipment.address_from?.country, ['страна', 'country', 'select country']) ||
            hasValidStringValue(shipment.address_from?.address, ['адрес', 'address', 'enter address']) ||
            hasValidStringValue(shipment.address_dest?.city, ['город', 'city', 'select city']) ||
            hasValidStringValue(shipment.address_dest?.country, ['страна', 'country', 'select country']) ||
            hasValidStringValue(shipment.address_dest?.address, ['адрес', 'address', 'enter address']) ||

            (shipment.contents.length > 0 && 
            hasValidStringValue(shipment.contents[0]?.name, ['Unknown', 'тип груза', 'Unknown type', 'груз', 'cargo type'])) ||

            (structuredData.modes.length > 0 &&
            hasValidStringValue(structuredData.modes[0]?.name, ['Unknown', 'вид перевозки', 'Unknown mode', 'transport mode'])) ||

            hasValidStringValue(structuredData.for_carriers, ['информация для перевозчиков', 'information for carriers', 'carrier info']) ||
            
            (structuredData.name !== null && 
            structuredData.name !== undefined &&
            hasValidStringValue(structuredData.name, ['название груза', 'Shipment name', 'груз', 'cargo', 'test']) && 
            structuredData.name.length > 5);

        logger.debug('Meaningful analysis check result:', { 
            hasAnyRealData,
            name: structuredData.name,
            nameLength: structuredData.name?.length,
            dates: {
                shipping_from: shipment.shipping_date_from,
                shipping_to: shipment.shipping_date_to,
                arrival_from: shipment.arrival_date_from,
                arrival_to: shipment.arrival_date_to
            },
            addresses: {
                from_city: shipment.address_from?.city,
                from_country: shipment.address_from?.country,
                dest_city: shipment.address_dest?.city,
                dest_country: shipment.address_dest?.country
            },
            contents: shipment.contents.length,
            modes: structuredData.modes.length
        });
        
        return hasAnyRealData;
    }

    async generateStructuredEmailGroupData(emails: IEmail[]): Promise<ShipmentRequest> {
        if (!this.isEnabled) {
            throw new Error('AI service disabled: Gemini API service not available');
        }

        if (!emails || emails.length === 0) {
            throw new Error('No emails for analysis');
        }

        let response;
        const prompt = this.createAnalysisPrompt(emails);
        
        try {
            logger.info(`Starting structured AI analysis for ${emails.length} emails`);
            
            emails.forEach((email, index) => {
                const searchText = `${email.subject} ${email.text || ''}`;
                const emailGroupId = this.emailGroupIdService.extractEmailGroupIdFromText(searchText);
                logger.debug(`Email ${index + 1}:`, {
                    subject: email.subject,
                    text_preview: email.text?.substring(0, 200) + '...',
                    has_order_number: emailGroupId !== null,
                    email_group_id: emailGroupId
                });
            });

            const responseText = await this.makeAIRequest(prompt);
            const structuredData = this.parseAIResponse(responseText);

            logger.debug('AI analysis raw result:', {
                name: structuredData.name,
                shipment_details_count: structuredData.shipment_details?.length,
                modes_count: structuredData.modes?.length,
                has_for_carriers: !!structuredData.for_carriers,
                raw_data: JSON.stringify(structuredData, null, 2)
            });

            const hasUsefulData = this.isMeaningfulAnalysis(structuredData);

            if (!hasUsefulData) {
                logger.warn('AI analysis completed but no structured information was found in the emails');
                logger.warn('Email subjects:', emails.map(e => e.subject));
            } else {
                logger.info('Structured AI analysis completed successfully with useful data');
            }

            return structuredData;
        } catch (error: any) {
            logger.error('Structured AI analysis error:', error);
            
            if (error.response?.data) {
                logger.error('Gemini API error details:', JSON.stringify(error.response.data, null, 2));
            }

            if (error.response?.status === 400 || error.response?.status === 401) {
                const errorData = error.response?.data?.error;
                const errorMessage = errorData?.message || error.response?.data?.message || error.message;
                
                if (errorMessage.includes('API key') || errorMessage.includes('authentication') || errorMessage.includes('API_KEY')) {
                    throw new Error(`Gemini API authentication failed. Please check GEMINI_API_KEY environment variable.`);
                }
                
                if (errorMessage.includes('location is not supported') || errorMessage.includes('not available in your location')) {
                    throw new Error(`Gemini API is not available in your location. Please use a VPN or check API availability in your region. Error: ${errorMessage}`);
                }
                
                if (errorMessage.includes('model') || errorMessage.includes('not found')) {
                    throw new Error(`Gemini model "${this.modelName}" not found or not available. Error: ${errorMessage}`);
                }
                
                throw new Error(`Gemini API error: ${errorMessage}`);
            }
            
            if (error.message?.includes('not found') || error.message?.includes('404')) {
                logger.error(`Model "${this.modelName}" not found. Please check if the model name is correct.`);
            }

            if (error.message?.includes('JSON') || error.message?.includes('network') || error.message?.includes('timeout')) {
                throw new Error(`Structured AI analysis failed: ${error.message}`);
            }

            throw new Error(`Structured AI analysis failed: ${error.message}`);
        }
    }

    private createAnalysisPrompt(emails: IEmail[]): string {
        const emailContext = this.formatEmailContext(emails);

        return `
            Ты - эксперт по анализу электронных писем о грузоперевозках. Твоя задача - извлечь ВСЮ доступную информацию из писем.

            ИНСТРУКЦИИ ПО ПОИСКУ ИНФОРМАЦИИ:

            1. ID ЗАКАЗА (поле "name"):
            ГДЕ ИСКАТЬ: ТОЛЬКО тема письма (Subject), НЕ ищи в теле письма
            ПАТТЕРНЫ: 
            - Shipment #123456, Shipment #784512, Shipment #987123 (формат: "Shipment" + "#" + 6-8 цифр)
            - "Заказ Shipment #123", "Order: Shipment #456", "Номер: Shipment #789"
            ПРИМЕРЫ: "Заказ Shipment #987123" -> name: "987123", "Order Shipment #784512" -> name: "784512", "Shipment #123456 отменен" -> name: "123456"
            ВАЖНО: 
            - Извлекай ТОЛЬКО ЦИФРЫ из ID заказа (без "Shipment", без "#", без пробелов)
            - Если найден "Shipment #123456", то name должен быть "123456" (только цифры)
            - Если ID не найден в теме письма, используй пустую строку ""
            - НЕ ищи ID в теле письма, только в теме (Subject)

            2. ДАТЫ ОТПРАВКИ ГРУЗА (shipping_date_from/to):
            ГДЕ ИСКАТЬ: тело письма 
            КЛЮЧЕВЫЕ СЛОВА: "дата отправки", "дата загрузки", "дата отгрузки", "отправка", "загрузка", "отгрузка", "shipment date", "shipping date"
            ФОРМАТЫ: "15.12.2024", "15-12-2024", "15/12/2024", "2024-12-15", "15 декабря 2024", "15 дек 2024", "2025-12-03T10:30:00Z", "2025-12-03T10:30:00+05:00"
            ПРИМЕРЫ: "Отправка 15.12.2024", "Дата загрузки: 15-12-2024", "Shipping: 2024-12-15", "UTC time: 2025-12-03T10:30:00Z", "10:30:00+05:00"
            ВАЖНО: 
            - Конвертируй ISO 8601 форматы (2025-12-03T10:30:00Z, 2025-12-03T10:30:00+05:00) в формат DD-MM-YYYY для даты
            - Для времени извлекай только время (HH:MM) из ISO форматов
            - Финальный формат даты: DD-MM-YYYY, времени: HH:MM

            3. ВРЕМЯ ОТПРАВКИ ГРУЗА (shipping_time_from/to):
            ГДЕ ИСКАТЬ: рядом с датой отправки или в ISO формате
            ФОРМАТЫ: "09:00", "9:00", "9 утра", "09:30", "14:00", "2 часа дня", "10:30:00", "10:30:00Z", "10:30:00+05:00", "T10:30:00Z"
            ПРИМЕРЫ: "в 09:00", "с 9:00 до 13:00", "время: 09:30", "UTC time: 2025-12-03T10:30:00Z", "10:30:00+05:00"
            ВАЖНО: Из ISO формата (2025-12-03T10:30:00Z) извлекай только время: "10:30"

            4. ДАТЫ ПРИБЫТИЯ ГРУЗА (arrival_date_from/to):
            ГДЕ ИСКАТЬ: тело письма
            КЛЮЧЕВЫЕ СЛОВА: "дата доставки", "дата прибытия", "дата получения", "доставка", "прибытие", "arrival", "delivery date"
            ФОРМАТЫ: те же, что и для отправки, включая ISO 8601
            ПРИМЕРЫ: "Доставка 17.12.2024", "Прибытие: 17-12-2024", "Arrival: 2024-12-17", "UTC time: 2025-12-03T10:30:00Z"

            5. ВРЕМЯ ПРИБЫТИЯ ГРУЗА (arrival_time_from/to):
            ГДЕ ИСКАТЬ: рядом с датой прибытия или в ISO формате
            ФОРМАТЫ: те же, что и для времени отправки

            6. АДРЕС ОТПРАВЛЕНИЯ (address_from):
            ГДЕ ИСКАТЬ: тело письма
            КЛЮЧЕВЫЕ СЛОВА: "откуда", "отправка из", "адрес отправки", "склад отправки", "отправитель", "from", "origin"
            ЧТО ИСКАТЬ:
            - Страна: "Беларусь", "Россия", "Украина", "Belarus", "Russia"
            - Город: "Минск", "Москва", "Гродно", "Минске", "г. Минск"
            - Адрес: "ул. Тимирязева, 65", "улица Ожешко, д. 15", "проспект Победителей, 65А"
            - Индекс: "220000"
            - date_from/date_to: когда можно ЗАБРАТЬ груз с этого адреса (пример: "можно забрать 15-17 декабря")
            - time_from/time_to: в какое время можно ЗАБРАТЬ груз (пример: "с 8:00 до 12:00")
            ПРИМЕРЫ: 
            - "Забрать груз: Минск, ул. Тимирязева, д. 65А, можно 15-17 декабря с 8:00 до 12:00"
            - "Склад: г. Минск, ул. Тимирязева, 65, работает 15-17.12 с 8 до 18"

            7. АДРЕС НАЗНАЧЕНИЯ (address_dest):
            ГДЕ ИСКАТЬ: тело письма, подпись
            КЛЮЧЕВЫЕ СЛОВА: "куда", "доставка в", "адрес доставки", "получатель", "destination", "to", "delivery address"
            ЧТО ИСКАТЬ: те же компоненты что и для address_from, включая:
            - date_from/date_to: когда можно ДОСТАВИТЬ груз на этот адрес
            - time_from/time_to: в какое время можно ДОСТАВИТЬ груз
            ПРИМЕРЫ: 
            - "Доставить: Гродно, ул. Ожешко, 15, можно 18-20 декабря с 9:00 до 18:00"
            - "Адрес получения: г. Гродно, ул. Ожешко, д. 15, принимаем 18-20.12 с 9 до 18"

           8. ГРУЗ (contents[].name и contents[].quantity):
            ГДЕ ИСКАТЬ: тело письма, тема
            КЛЮЧЕВЫЕ СЛОВА: "груз", "товар", "наименование", "описание груза", "cargo", "goods", "shipment"
            ЧТО ИСКАТЬ:
            - name: ЛЮБОЕ описание груза из письма. Может быть:
            * Общее: "готовая текстильная продукция", "одежда весенней коллекции"
            * Конкретное: "Пальто женские", "Платья", "Блузки", "Брюки"
            * Даже если несколько видов - создай отдельные элементы массива
            - quantity: ИЗВЛЕКАЙ ЧИСЛО из текста, даже если есть "шт":
            * "50 шт" -> quantity: 50
            * "количество: 100" -> quantity: 100  
            * "200 единиц" -> quantity: 200
            * Если количество не указано, но есть название груза - используй quantity: 1
            
            ПРИМЕР ИЗ ПИСЬМА:
            "Состав груза:
            Пальто женские: 50 шт
            Платья: 100 шт  
            Блузки: 200 шт
            Брюки: 150 шт"
            
            ДОЛЖНО БЫТЬ В JSON:
            "contents": [
                { "name": "Пальто женские", "quantity": 50 },
                { "name": "Платья", "quantity": 100 },
                { "name": "Блузки", "quantity": 200 },
                { "name": "Брюки", "quantity": 150 }
            ]

            9. ВИД ПЕРЕВОЗКИ/ТРАНСПОРТА (modes[].name):
            ГДЕ ИСКАТЬ: тело письма, тема
            КЛЮЧЕВЫЕ СЛОВА: "вид перевозки", "тип доставки", "способ доставки", "транспорт", "машина", "фура", "корабль", "самолет", "transport mode", "delivery type"
            ЧТО ИСКАТЬ:
            - "фура", "мишина", "грузовик", "автоперевозка", "автотранспорт"
            - "корабль", "судно", "морская перевозка", "контейнеровоз"
            - "самолет", "авиаперевозка", "авиатранспорт"
            - "поезд", "железнодорожная перевозка", "вагон"
            ПРИМЕРЫ: "фурой", "мишиной", "кораблем", "автоперевозка", "авиаперевозка", "морская перевозка", "железнодорожная перевозка"

            10. ИНФОРМАЦИЯ ДЛЯ ПЕРЕВОЗЧИКОВ (for_carriers):
            ГДЕ ИСКАТЬ: конец письма, отдельные строки, комментарии
            ЧТО ИСКАТЬ: ЛЮБАЯ дополнительная информация для водителя/перевозчика:
            - "хрупкое", "осторожно", "не кантовать", "не бросать"
            - "кузовы должны быть чистыми", "требуется растяжка", "крепление цепями"
            - "температурный режим", "холодная цепь", "избегать влаги"
            - "груз тяжелый", "негабаритный", "опасный груз"
            - "требуется сопровождение", "специальные условия"
            - контакты для связи на точке: телефоны, имена
            ПРИМЕРЫ: 
            - "Для перевозчиков: груз хрупкий, осторожно! Не кантовать, не бросать."
            - "Кузовы должны быть чистыми. Требуется растяжка."
            - "Температурный режим: +2...+8°C. Холодная цепь обязательна."
            - "Контакты на точке: Сергей, +375 29 123-45-67"

            ОБЩИЕ ПРАВИЛА:

            1. Анализируй ВСЕ письма последовательно - информация может быть распределена
            2. Ищи в теме письма ПЕРВЫМ - там часто ключевая информация
            3. Даже если заказ ОТМЕНЕН - извлекай всю информацию (даты, адреса, груз и т.д.)
            4. Если информация отсутствует - используй null (без кавычек в JSON)
            5. НИКОГДА не используй дефолтные значения типа "00:00", "0000-00-00", "Unknown" - если информации нет, используй null
            6. ОБЯЗАТЕЛЬНЫЕ ПОЛЯ (не могут быть null):
               - name (может быть пустой строкой если не найден)
               - shipment_details (массив, может быть пустым, но должен присутствовать)
               - shipment_details[0].address_from (объект обязателен, но поля внутри могут быть null)
               - shipment_details[0].address_dest (объект обязателен, но поля внутри могут быть null)
               - shipment_details[0].contents (массив обязателен, может быть пустым)
               - shipment_details[0].contents[0].name (обязательно, если contents не пустой)
               - shipment_details[0].contents[0].quantity (обязательно, минимум 1, если contents не пустой)
               - modes (массив обязателен, может быть пустым)
               - modes[0].name (обязательно, если modes не пустой)
            7. ОБРАБОТКА ВРЕМЕНИ:
               - ISO 8601 форматы (2025-12-03T10:30:00Z, 2025-12-03T10:30:00+05:00) должны быть конвертированы:
                 * Дата: извлекай дату и конвертируй в DD-MM-YYYY (2025-12-03 -> 03-12-2025)
                 * Время: извлекай только время в формате HH:MM (10:30:00 -> 10:30)
               - Примеры конвертации:
                 * "2025-12-03T10:30:00Z" -> дата: "03-12-2025", время: "10:30"
                 * "10:30:00+05:00" -> время: "10:30"
            8. Не придумывай информацию - используй только то, что есть в письмах
            9. Если информации мало - верни JSON с тем, что нашел (null для остального, но обязательные поля должны присутствовать)
            
            Требуемый формат JSON:
            ${this.getJsonSchema()}
            
            Письма для анализа:
            ${emailContext}
            
            Верни ТОЛЬКО JSON без дополнительного текста, комментариев и объяснений.
            Даже если информации мало - верни JSON с тем, что нашел.
        `.trim();
    }

    private getJsonSchema(): string {
        return `{
            "name": "ID заказа ТОЛЬКО ЦИФРЫ (ОБЯЗАТЕЛЬНОЕ ПОЛЕ, строка с цифрами, например: '123456' из 'Shipment #123456', может быть пустой строкой если не найден)",
            "shipment_details": [
                {
                    "shipping_date_from": "дата начала отправки груза в формате DD-MM-YYYY (null если не указана). Конвертируй ISO форматы (2025-12-03T10:30:00Z -> 03-12-2025)",
                    "shipping_date_to": "дата окончания отправки груза в формате DD-MM-YYYY (null если не указана)",
                    "shipping_time_from": "время начала отправки груза в формате HH:MM (null если не указано, НЕ использовать '00:00'). Из ISO формата (2025-12-03T10:30:00Z) извлекай '10:30'",
                    "shipping_time_to": "время окончания отправки груза в формате HH:MM (null если не указано, НЕ использовать '00:00')",
                    "arrival_date_from": "дата начала прибытия груза в формате DD-MM-YYYY (null если не указана)",
                    "arrival_date_to": "дата окончания прибытия груза в формате DD-MM-YYYY (null если не указана)",
                    "arrival_time_from": "время начала прибытия груза в формате HH:MM (null если не указано, НЕ использовать '00:00')",
                    "arrival_time_to": "время окончания прибытия груза в формате HH:MM (null если не указано, НЕ использовать '00:00')",
                    "address_from": {
                        "country": "страна отправления (null если не указана, например: Беларусь)",
                        "city": "город отправления (null если не указан, например: Минск)",
                        "zipcode": "почтовый индекс места отправления (null если не указан)",
                        "address": "полный адрес отправления (null если не указан, например: ул. Тимирязева, д. 65А, склад №2)",
                        "date_from": "дата начала для адреса - когда можно забрать груз с этой точки (null если не указана, например: '15-12-2024')",
                        "date_to": "дата окончания для адреса - до какого числа можно забрать груз (null если не указана, например: '17-12-2024')",
                        "time_from": "время начала для адреса - с какого часа можно забрать груз (null если не указано, например: '08:00')",
                        "time_to": "время окончания для адреса - до какого часа можно забрать груз (null если не указано, например: '18:00')"
                    },
                    "address_dest": {
                        "country": "страна назначения (null если не указана, например: Беларусь)",
                        "city": "город назначения (null если не указан, например: Гродно)",
                        "zipcode": "почтовый индекс места назначения (null если не указан)",
                        "address": "полный адрес назначения (null если не указан, например: ул. Ожешко, 15)",
                        "date_from": "дата начала для адреса - когда можно доставить груз на эту точку (null если не указана)",
                        "date_to": "дата окончания для адреса - до какого числа можно доставить груз (null если не указана)",
                        "time_from": "время начала для адреса - с какого часа можно доставить груз (null если не указано)",
                        "time_to": "время окончания для адреса - до какого часа можно доставить груз (null если не указано)"
                    },
                   "contents": [
                        {
                            "name": "название груза (МОЖЕТ БЫТЬ строкой или null, если не найден, например: 'Электронные компоненты', 'Промышленное оборудование')",
                            "quantity": "количество груза (МОЖЕТ БЫТЬ строкой или числом или null, если не указано, например: '50 шт', 50, 'количество: 5')"
                        }
                    ]
                }
            ],
            "modes": [
                {
                    "name": "вид перевозки/транспорта (ОБЯЗАТЕЛЬНОЕ ПОЛЕ, строка, например: Фура, Мишина, Корабль, Автоперевозка, Авиаперевозка, Морская перевозка, Железнодорожная перевозка)"
                }
            ],
            "for_carriers": "любая дополнительная информация для перевозчика (ОПЦИОНАЛЬНОЕ ПОЛЕ, может отсутствовать или быть null). Например: 'хрупкое', 'кузовы должны быть чистыми', 'осторожно', 'не кантовать', 'температурный режим', 'требуется растяжка', 'груз тяжелый' и т.д."
        }`;
    }

    private async makeAIRequest(prompt: string): Promise<string> {
        if (!this.apiKey) {
            throw new Error('API key is not set');
        }

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent`;

        try {
            const response = await axios.post(
                apiUrl,
                {
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 8192,
                        topP: 0.95,
                        topK: 40
                    }
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': this.apiKey
                    },
                    timeout: 120000
                }
            );

            if (!response.data.candidates || 
                !response.data.candidates[0] || 
                !response.data.candidates[0].content || 
                !response.data.candidates[0].content.parts || 
                !response.data.candidates[0].content.parts[0] || 
                !response.data.candidates[0].content.parts[0].text) {
                logger.error('Invalid response format from Gemini API');
                logger.error('Response data:', JSON.stringify(response.data, null, 2));
                throw new Error('Invalid Gemini API response format');
            }

            const responseText = response.data.candidates[0].content.parts[0].text;
            
            if (!responseText) {
                logger.error('Empty response from Gemini API');
                logger.error('Full response:', JSON.stringify(response.data, null, 2));
                throw new Error('Empty response from Gemini API');
            }

            return responseText;
        } catch (error: any) {
            logger.error('Gemini API request error:', error);
            
            if (error.response?.status === 404) {
                throw new Error(`Model ${this.modelName} not found or not available`);
            } else if (error.response?.status === 403 || error.response?.status === 401) {
                throw new Error('API key does not have access to Gemini API or is invalid');
            } else if (error.response?.status === 400) {
                const errorMessage = error.response?.data?.error?.message || error.message;
                throw new Error(`Invalid request: ${errorMessage}`);
            }
            
            throw error;
        }
    }

    private parseAIResponse(responseText: string): ShipmentRequest {
        const cleanJson = this.cleanJsonResponse(responseText);

        try {
            return JSON.parse(cleanJson);
        } catch (parseError) {
            logger.error('JSON parsing error from AI response:', parseError);
            logger.error('Raw response content:', responseText.substring(0, 500));
            throw new Error('Failed to parse AI response as JSON');
        }
    }

    private cleanJsonResponse(jsonText: string): string {
        return jsonText.replace(/```json\n?|\n?```/g, '').trim();
    }

    formatStructuredDataToText(structuredData: ShipmentRequest): string {
        if (!structuredData.shipment_details || structuredData.shipment_details.length === 0) {
            return `СТРУКТУРИРОВАННАЯ ИНФОРМАЦИЯ О ГРУЗЕ\n\nНазвание: ${structuredData.name || 'Не указано'}\n`;
        }

        const shipment = structuredData.shipment_details[0];
        let text = `СТРУКТУРИРОВАННАЯ ИНФОРМАЦИЯ О ГРУЗЕ\n\n`;
        
        if (structuredData.name) {
            text += `Название: ${structuredData.name}\n`;
        }
        
        text += `\n`;

        if (shipment.address_from) {
            const fromParts: string[] = [];
            if (shipment.address_from.address) fromParts.push(shipment.address_from.address);
            if (shipment.address_from.city) fromParts.push(shipment.address_from.city);
            if (shipment.address_from.zipcode) fromParts.push(shipment.address_from.zipcode);
            if (shipment.address_from.country) fromParts.push(shipment.address_from.country);
            
            if (fromParts.length > 0) {
                text += `Отправление: ${fromParts.join(', ')}\n`;
            }
        }

        if (shipment.address_dest) {
            const destParts: string[] = [];
            if (shipment.address_dest.address) destParts.push(shipment.address_dest.address);
            if (shipment.address_dest.city) destParts.push(shipment.address_dest.city);
            if (shipment.address_dest.zipcode) destParts.push(shipment.address_dest.zipcode);
            if (shipment.address_dest.country) destParts.push(shipment.address_dest.country);
            
            if (destParts.length > 0) {
                text += `Назначение: ${destParts.join(', ')}\n`;
            }
        }

        if (shipment.shipping_date_from || shipment.shipping_date_to) {
            const shippingDates: string[] = [];
            if (shipment.shipping_date_from) {
                let dateStr = shipment.shipping_date_from;
                if (shipment.shipping_time_from) {
                    dateStr += ` ${shipment.shipping_time_from}`;
                }
                if (shipment.shipping_date_to && shipment.shipping_date_to !== shipment.shipping_date_from) {
                    dateStr += ` - ${shipment.shipping_date_to}`;
                    if (shipment.shipping_time_to) {
                        dateStr += ` ${shipment.shipping_time_to}`;
                    }
                }
                shippingDates.push(dateStr);
            } else if (shipment.shipping_date_to) {
                let dateStr = shipment.shipping_date_to;
                if (shipment.shipping_time_to) {
                    dateStr += ` ${shipment.shipping_time_to}`;
                }
                shippingDates.push(dateStr);
            }
            
            if (shippingDates.length > 0) {
                text += `Дата отправки: ${shippingDates.join(' - ')}\n`;
            }
        }

        if (shipment.arrival_date_from || shipment.arrival_date_to) {
            const arrivalDates: string[] = [];
            if (shipment.arrival_date_from) {
                let dateStr = shipment.arrival_date_from;
                if (shipment.arrival_time_from) {
                    dateStr += ` ${shipment.arrival_time_from}`;
                }
                if (shipment.arrival_date_to && shipment.arrival_date_to !== shipment.arrival_date_from) {
                    dateStr += ` - ${shipment.arrival_date_to}`;
                    if (shipment.arrival_time_to) {
                        dateStr += ` ${shipment.arrival_time_to}`;
                    }
                }
                arrivalDates.push(dateStr);
            } else if (shipment.arrival_date_to) {
                let dateStr = shipment.arrival_date_to;
                if (shipment.arrival_time_to) {
                    dateStr += ` ${shipment.arrival_time_to}`;
                }
                arrivalDates.push(dateStr);
            }
            
            if (arrivalDates.length > 0) {
                text += `Дата прибытия: ${arrivalDates.join(' - ')}\n`;
            }
        }

        if (shipment.contents && shipment.contents.length > 0) {
            const contentsList: string[] = [];
            shipment.contents.forEach((content, index) => {
                if (content.name && content.name !== 'Unknown') {
                    let contentStr = `${content.name}`;
                    if (content.quantity && content.quantity > 0) {
                        contentStr += ` x${content.quantity}`;
                    }
                    contentsList.push(contentStr);
                }
            });
            
            if (contentsList.length > 0) {
                text += `Груз: ${contentsList.join(', ')}\n`;
            }
        }

        if (structuredData.modes && structuredData.modes.length > 0) {
            const modesList: string[] = [];
            structuredData.modes.forEach((mode) => {
                if (mode.name && mode.name !== 'Unknown' && mode.name !== null) {
                    modesList.push(mode.name);
                }
            });
            
            if (modesList.length > 0) {
                text += `Тип перевозки: ${modesList.join(', ')}\n`;
            }
        }

        if (structuredData.for_carriers && 
            structuredData.for_carriers.trim() !== '' && 
            structuredData.for_carriers !== 'информация для перевозчиков' &&
            structuredData.for_carriers !== 'information for carriers') {
            text += `\nИнформация для перевозчиков: ${structuredData.for_carriers}\n`;
        }

        return text.trim();
    }
}