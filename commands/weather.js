// /commands/weather.js
const axios = require('axios');
const config = require('../config');

/**
 * Formato esperado del comando:
 * /weather:Ciudad
 * Ejemplo: /weather:Madrid
 *
 * Si no se especifica una ciudad, usa la ciudad por defecto del config.
 */

module.exports = {
    match: /^\/weather(?::(.+))?$/i,
    callback: async (client, message, context) => {
        try {
            // Extraer la ciudad del comando, si se proporciona
            const matches = message.body.trim().match(/^\/weather(?::(.+))?$/i);
            let city = matches && matches[1] ? matches[1].trim() : config.DEFAULT_CITY;

            if (!city) {
                await message.reply('Por favor, proporciona una ciudad. Ejemplo: /weather:Jaén');
                return;
            }

            // Paso 1: Obtener las coordenadas de la ciudad usando la API de Geocodificación de Open-Meteo
            const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=es&format=json`;
            const geoResponse = await axios.get(geoUrl);

            if (!geoResponse.data || !geoResponse.data.results || geoResponse.data.results.length === 0) {
                await message.reply(`No se encontró la ciudad "${city}". Por favor, verifica el nombre e intenta nuevamente.`);
                return;
            }

            const { latitude, longitude, name, country } = geoResponse.data.results[0];

            // Paso 2: Obtener el pronóstico del tiempo usando las coordenadas
            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max&timezone=Europe/Madrid&language=es`;
            const weatherResponse = await axios.get(weatherUrl);

            if (!weatherResponse.data || !weatherResponse.data.daily) {
                await message.reply('No se pudo obtener la información del clima. Por favor, intenta nuevamente más tarde.');
                return;
            }

            const daily = weatherResponse.data.daily;
            const today = {
                fecha: daily.time[0],
                temp_max: daily.temperature_2m_max[0],
                temp_min: daily.temperature_2m_min[0],
                weather_code: daily.weathercode[0],
                precipitation_probability: daily.precipitation_probability_max[0]
            };
            const tomorrow = {
                fecha: daily.time[1],
                temp_max: daily.temperature_2m_max[1],
                temp_min: daily.temperature_2m_min[1],
                weather_code: daily.weathercode[1],
                precipitation_probability: daily.precipitation_probability_max[1]
            };

            // Función para mapear códigos de clima a descripciones
            const weatherCodeMap = {
                0: 'Cielo despejado',
                1: 'Mayormente despejado',
                2: 'Parcialmente nublado',
                3: 'Nublado',
                45: 'Niebla ligera',
                48: 'Niebla densa',
                51: 'Llovizna ligera',
                53: 'Llovizna moderada',
                55: 'Llovizna densa',
                61: 'Lluvia ligera',
                63: 'Lluvia moderada',
                65: 'Lluvia densa',
                66: 'Llovizna helada ligera',
                67: 'Llovizna helada densa',
                71: 'Nevada ligera',
                73: 'Nevada moderada',
                75: 'Nevada densa',
                77: 'Granos de nieve',
                80: 'Lluvias puntuales',
                81: 'Lluvias moderadas',
                82: 'Lluvias fuertes',
                85: 'Nevadas ligeras',
                86: 'Nevadas fuertes',
                95: 'Tormenta',
                96: 'Tormenta con granizo pequeño',
                99: 'Tormenta con granizo'
            };

            const formatWeather = (dayData) => {
                const date = new Date(dayData.fecha);
                const options = { weekday: 'long', day: 'numeric', month: 'long' };
                const dateStr = date.toLocaleDateString('es-ES', options);

                const weatherDescription = weatherCodeMap[dayData.weather_code] || 'Descripción no disponible';
                const tempMax = dayData.temp_max;
                const tempMin = dayData.temp_min;
                const precipitation = dayData.precipitation_probability;

                return `*${dateStr}*\nTemperatura: Máx ${tempMax}°C / Mín ${tempMin}°C\nClima: ${weatherDescription}\nProbabilidad de precipitación: ${precipitation}%`;
            };

            const todayWeather = formatWeather(today);
            const tomorrowWeather = formatWeather(tomorrow);

            const reply = `*🌤️ Pronóstico del Tiempo para ${name}, ${country}:*\n\n*Hoy:*\n${todayWeather}\n\n*Mañana:*\n${tomorrowWeather}`;

            await message.reply(reply);
        } catch (error) {
            console.error('Error al obtener el clima:', error);
            await message.reply('Hubo un error al obtener la información del clima. Por favor, intenta nuevamente más tarde.');
        }
    }
};
