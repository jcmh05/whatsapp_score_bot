# Bot de WhatsApp v2

Contadores mensuales, rankings, felicitaciones cada 50 puntos y estadísticas. Conserva las 21 entradas de comandos y los datos importados. Se conecta con **Baileys por WebSocket**, con sesión y colas en MongoDB.

## Migración desde la versión con Chrome

El log de Railway confirmó falta de memoria: el contenedor alcanzó 954 MiB, el kernel incrementó `oom_kill` y mató Chrome con señal 9. Esta versión elimina Chromium, Puppeteer, los parches de WhatsApp Web y las sesiones ZIP.

1. Despliega este commit con el Dockerfile. Para el primer cambio de arquitectura, termina la instancia antigua antes de vincular la nueva.
2. Conserva `MONGODB_URI`, `ADMIN`, `BOT_PHONE`, `SESSION_ID`, `PORT` y `TIMEZONE`. Las variables antiguas `AUTH_STRATEGY`, `REMOTE_BACKUP_MS`, `AUTH_DATA_PATH` y `PUPPETEER_*` se ignoran y pueden retirarse.
3. **Vincula una vez con el QR nuevo**, desde el WhatsApp del número del bot: Dispositivos vinculados > Vincular un dispositivo. La sesión de Chrome tiene otro formato; sus respaldos se conservan en MongoDB.
4. Espera `Bot listo. Conexión directa con WhatsApp; sesión en MongoDB.` y prueba `ping`, `/top`, `/mes`, `/year:2025`, `/progress` y un puntaje real.
5. Reinicia el servicio: debe restaurar la sesión sin otro QR. Solo la revocación de la sesión desde WhatsApp debería exigir otra vinculación.

Los puntajes y los archivos anuales no requieren reimportación. El bot no registra como nuevas cagadas los mensajes del historial sincronizado. La fecha del primer arranque de v2 queda como punto de corte para mensajes antiguos.

## Local

Node.js 22.12 o posterior de la rama 22, o Node.js 24. MongoDB Atlas o un replica set con transacciones. En PowerShell:

```powershell
npm.cmd ci
npm.cmd start
```

Para una instalación nueva, copia `.env.example` a `.env`. El `.env` de esta recuperación ya está preparado; consérvalo. `ADMIN` es el teléfono internacional seguido de `@c.us`; `BOT_PHONE` es el teléfono del bot con prefijo; `SESSION_ID` debe mantenerse en todos los despliegues. La sesión siempre se guarda en MongoDB, también en local.

Solo una instancia de v2 puede usar el mismo SESSION_ID. Si Railway ya está activo, el proceso local espera en `standby`; detén el servicio remoto para probar localmente. El HTTP se mantiene disponible durante esa espera. Ctrl+C realiza un cierre ordenado.

## Comandos

| Entrada | Comportamiento |
| --- | --- |
| `21` | Establece el mes en 21; recalcula el total anual |
| `+1`, `-1` | Suma o resta al mes; registra hora y día; nunca baja de cero |
| `hola`, `ping` | Responde hey, pong; ping sin barra |
| `/top`, `/mes` | Ranking anual y mensual |
| `/noreply`, `/reply` | Controla confirmaciones; mantiene felicitaciones. La preferencia sobrevive al reinicio |
| `/hours`, `/hourschart` | Horas en texto o imagen |
| `/week`, `/weekchart` | Días de la semana en texto o imagen |
| `/average` | Promedios global y mensual |
| `/progress` | Progreso de meses terminados; requiere dos meses concluidos |
| `/year:2025` | Ranking y gráficas de un año anterior |
| `/rewind`, `/rewindchart` | Resumen anual desde el 20 de diciembre, 00:00 de Madrid; antes muestran cuánto queda |
| `/weather`, `/weather:Jaen` | Tiempo de la ciudad por defecto o la indicada |
| `/fluky:a,b,c` | Elige una opción al azar |
| `/fact` | Envía un dato aleatorio y lo elimina |
| `/addfact:texto` | Añade un dato; requiere el administrador |
| `/status`, `/commands` | Estado y lista de comandos |

Los identificadores LID se relacionan con el teléfono para conservar las cuentas históricas `@c.us`. Si no se puede determinar el teléfono, el mensaje queda en la cola para reintentar; nunca se crea otro usuario bajo su LID.

## Persistencia y recuperación

- `bot_leases`: propiedad exclusiva de una sesión, renovada cada 10 segundos. Expira a los 45 segundos si un proceso muere. Una nueva instancia espera su turno; las escrituras comprueban la propiedad dentro de la transacción.
- `baileys_auth`: credenciales y claves Signal, con serialización binaria y escrituras confirmadas. Cada revocación crea una generación nueva y conserva el respaldo anterior.
- `bot_inbox`: comandos y puntajes aceptados, en orden, con deduplicación. Tras procesarlos se conserva el ID y se elimina el texto; los fallidos conservan su contenido para revisión.
- `bot_outbox`: respuestas, imágenes, citas y reacciones pendientes. Los puntos, la respuesta pendiente y la finalización del trabajo se confirman juntos en MongoDB.
- `bot_state`: punto de corte, secuencia, generación de autenticación y preferencia de confirmaciones.

Una desconexión temporal reconecta el socket con espera progresiva hasta 60 segundos. No reinicia Node ni pierde los trabajos aceptados. Un fallo interno, pérdida de MongoDB o bloqueo del proceso activa el supervisor y el reinicio. La espera del QR no expira; las conexiones, consultas, descargas y trabajos tienen límites de tiempo.

La salida conserva el mismo ID al reintentar y espera confirmación del servidor de WhatsApp. Tras ocho intentos, el envío queda como `failed` para revisión. Una entrada que falla tres veces también queda como `failed` y, si las confirmaciones están activas, avisa al remitente. Los fallidos no bloquean los trabajos siguientes. Los envíos confirmados se conservan siete días para las solicitudes de reenvío del SDK.

El log `Colas fallidas: entrada=N, salida=N` permite detectar trabajos que requieren revisión. Consulta las colecciones por `sessionId`, `state: "failed"` y `lastError`. No borres la deduplicación para corregir un error de entrega: el contador puede estar confirmado aunque no llegue la respuesta.

Baileys es una conexión no oficial y WhatsApp puede cambiar su protocolo. La deduplicación protege las escrituras aceptadas en MongoDB; la red externa no permite prometer disponibilidad absoluta ni entrega exactamente una vez. Los límites concretos están en [ARCHITECTURE.md](ARCHITECTURE.md).

## Datos y años

`test.users` contiene el año activo en `scoreYear`; `users2024`, `users2025`, etc., contienen archivos anuales. Al cambiar de año en Madrid se archiva y se reinicia en una transacción. Un archivo que ya existe, usuarios sin año o una fecha de servidor anterior a los datos requieren revisión; se evita sobrescribir el histórico.

Un mensaje de un año ya archivado se rechaza con una respuesta explícita. Los mensajes del año activo utilizan su fecha original para mes, hora y día. Se mantiene `MONTH_START_DAY=1`.

Los números solo establecen el mes y recalculan el total. No inventan horas o días que faltan en los datos importados. Sin datos temporales, horas/días y sus gráficas responden: «No tienes registrados datos sobre este año aún, prueba más adelante.»

QuickChart genera los PNG: Chart.js 2 para horas/días y 4 para progreso/año/resumen. Los errores temporales de descarga se reintentan antes de informar del fallo.

## Railway

La imagen usa Node 24 y dumb-init; no instala navegador. Instala con `npm ci --omit=dev` y ejecuta el supervisor. Mantén las variables actuales y el acceso a Atlas. No necesita disco persistente ni volumen para la sesión.

Si configuras un healthcheck de despliegue, usa **/healthz**: devuelve 200 incluso esperando QR o la lease. **/readyz** devuelve 200 solo con WhatsApp, MongoDB y lease válidos; en los demás casos, 503. **/** muestra el estado legible.

Los logs `Recursos (inicio/listo/periódico/reinicio por error)` informan de RSS de Node y memoria/límite/pico/OOM del contenedor cuando existe cgroup v2. El supervisor no impide que Railway suspenda un servicio por sus reglas o por agotar crédito.

## Verificación

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run check:transport
npm.cmd audit --omit=dev
# Optativa: permisos para crear y borrar únicamente una base temporal.
npm.cmd run test:integration
# Optativa: handshake real y QR anónimo; no vincula ninguna cuenta.
node scripts/check-pairing.js
```

Las pruebas de integración crean una base aleatoria `bot_check_...`, verifican transacciones, duplicados, claves binarias, exclusión, colas, comandos y recuperación del proceso con un socket simulado, y eliminan solo esa base. No utilizan la cuenta ni las colecciones de producción. La comprobación de pairing usa otra base temporal y no muestra ni vincula el QR.

GitHub Actions verifica Node 22/24, integración con MongoDB 8 en replica set y la imagen Linux. Las comprobaciones del transporte y las pruebas unitarias se ejecutan secuencialmente en un contenedor limitado a 256 MiB. Esto verifica dependencias y pruebas controladas, no el consumo de una cuenta real durante días.

## Código

`src/runtime.js` coordina proceso, HTTP y MongoDB. `connection.js` controla el socket; `auth-store.js` conserva las claves; `jobs.js` procesa la entrada; `outbox.js` entrega respuestas. `handler.js`, `score.js`, `year.js` y `commands/` mantienen las reglas del bot. `supervisor.js` recupera fallos del proceso. El diseño y sus límites se describen en [ARCHITECTURE.md](ARCHITECTURE.md).
