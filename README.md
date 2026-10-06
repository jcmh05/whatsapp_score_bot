# Bot de WhatsApp

Contadores mensuales, ranking anual, felicitaciones cada 50 puntos y estadísticas. Los comandos conservan sus nombres y reglas anteriores.

## Probar en local

Necesitas Node.js 22.12 o posterior de la rama 22, o Node.js 24, y una cuenta de WhatsApp activa. MongoDB debe admitir transacciones: Atlas o un replica set local.

Desde PowerShell, en la carpeta del repo:

```powershell
npm.cmd ci
npm.cmd start
```

En una instalación nueva, copia `.env.example` a `.env` y configura `MONGODB_URI`, `ADMIN` (teléfono internacional seguido de `@c.us`) y `BOT_PHONE` (número del bot con prefijo). **El `.env` local de esta recuperación ya está preparado; consérvalo.** `BOT_PHONE` comprueba que la cuenta vinculada sea la correcta; admite espacios, guiones y paréntesis.

Escanea el QR desde **WhatsApp > Dispositivos vinculados > Vincular un dispositivo**, en el teléfono del bot. Al aparecer `Bot listo.`, añade esa cuenta al grupo si aún no está dentro. El número por sí solo no sustituye la vinculación.

Prueba `ping`, `/top`, `/mes`, `/year:2025` dos veces, `/hours`, `/week`, `/noreply` y `/reply`. Para probar una escritura, usa un `+1` real o anota el contador mensual, envía un número de prueba y vuelve a enviar el original. `+1` y `-1` también cambian estadísticas de hora/día; un número solo cambia el mes.

Detén el bot con **Ctrl+C** y vuelve a ejecutar `npm.cmd start`. Una sesión válida guardada debería reconectar sin otro QR.

## Comandos

| Entrada | Comportamiento |
| --- | --- |
| `21` | Establece el mes en 21; recalcula el total anual |
| `+1`, `-1` | Suma o resta al mes; registra hora y día; nunca baja de cero |
| `hola`, `ping` | Responde `hey`, `pong` (ping sin barra) |
| `/top`, `/mes` | Ranking anual y mensual |
| `/noreply`, `/reply` | Desactiva o activa confirmaciones; las felicitaciones siguen activas |
| `/hours`, `/hourschart` | Horas en texto o imagen |
| `/week`, `/weekchart` | Días de la semana en texto o imagen |
| `/average` | Promedio global y mensual |
| `/progress` | Progreso de meses terminados; requiere dos meses concluidos |
| `/year:2025` | Ranking y gráficas de un año anterior |
| `/rewind`, `/rewindchart` | Resumen anual desde el 20 de diciembre a las 00:00 de Madrid; antes muestran la cuenta atrás |
| `/weather`, `/weather:Jaen` | Tiempo de la ciudad por defecto o la indicada |
| `/fluky:a,b,c` | Elige una opción al azar |
| `/fact` | Envía un dato aleatorio y lo elimina, como antes |
| `/addfact:texto` | Añade un dato; requiere el administrador configurado |
| `/status`, `/commands` | Estado del sistema y lista de comandos |

Los nombres se actualizan con el contacto al registrar puntos, como antes. Los identificadores nuevos de WhatsApp `@lid` se resuelven a `@c.us` para seguir usando los datos importados.

## Recuperación y sesiones

`npm start` relanza el proceso al fallar, con esperas de 5, 10, 20, 40 y hasta 60 segundos. Tras un minuto conectado se restablece la espera inicial. Detecta también un proceso bloqueado que deja de emitir señales de vida. `npm run start:once` arranca sin supervisor para depurar.

Espera a MongoDB antes de iniciar WhatsApp. Una caída de Chromium, desconexión o error no controlado provoca cierre y reinicio. Comprueba WhatsApp/MongoDB cada 30 segundos y reinicia si el problema persiste 90 segundos. La espera del QR no expira; la inicialización después de autenticarse tiene un límite de tres minutos. Descargas y comandos tienen límites de tiempo.

- `AUTH_STRATEGY=local` (por defecto): sesión en `AUTH_DATA_PATH`; conserva esa carpeta.
- `AUTH_STRATEGY=remote`: usa `RemoteAuth` y GridFS en MongoDB, con un adaptador compatible con la ruta de ZIP de whatsapp-web.js 1.34. No usa la colección antigua `sessions`. El primer respaldo tarda aproximadamente un minuto después de quedar listo: espera al mensaje de respaldo antes de cerrar. Los siguientes se realizan cada `REMOTE_BACKUP_MS` (por defecto, cinco minutos).

Mantén el mismo `SESSION_ID`; si está vacío se deriva de `BOT_PHONE`. Cambiar de estrategia/identificador o revocar la sesión desde el teléfono puede requerir otro QR. No ejecutes dos instancias con la misma sesión al mismo tiempo.

Primero se confirma la escritura en MongoDB; después se envían felicitaciones y confirmaciones. Si falla la respuesta, el contador permanece guardado. Esas respuestas no se reenvían automáticamente. Los identificadores de mensajes se conservan 30 días para evitar duplicados. Se procesan mensajes en orden y se usa su fecha para asignar mes/hora/día.

- `/healthz`: 200 mientras el proceso vive, incluso esperando QR.
- `/readyz`: 200 solo con WhatsApp y MongoDB conectados; 503 en los demás casos.
- `/`: estado legible del bot.

## Datos y años

`test.users` contiene el año activo identificado por `scoreYear`; `users2024`, `users2025`, etc., los archivos anuales. Se conservan `monthlyScores`, `totalScore`, `lastCongratulated`, `hours` y `week`.

Al cambiar de año en Madrid, archiva y reinicia contadores en una transacción. Si ya hay un archivo del mismo usuario/año, falta `scoreYear` o la fecha del servidor retrocede, se detiene para revisar los datos. Un mensaje de un año ya archivado se rechaza; los históricos se corrigen aparte. Se conserva `MONTH_START_DAY=1`.

Los registros de Excel conservan metadatos de origen e incertidumbres. Las horas/días de 2026 quedan vacíos hasta registrar eventos con `+1`/`-1`. Los números no inventan ese detalle. Las estadísticas horarias solo describen eventos con horario registrado.

Cuando no hay horas o días registrados, `/hours`, `/hourschart`, `/week` y `/weekchart` responden «No tienes registrados datos sobre este año aún, prueba más adelante.» y no descargan ni envían una gráfica vacía.

## Comprobaciones

```powershell
npm.cmd run check
npm.cmd test
# Optativo: .env y permisos para crear/borrar una base temporal.
npm.cmd run test:integration
npm.cmd audit --omit=dev
```

Las pruebas unitarias no conectan con WhatsApp ni MongoDB. Las de integración crean una base `bot_check_...`, prueban concurrencia, duplicados, rollback, archivo anual, `/year`, GridFS y recuperación del proceso con WhatsApp simulado, y borran esa base al terminar. No escriben en `test.users`. GitHub Actions comprueba sintaxis y pruebas unitarias en Node 22 y 24.

Las pruebas de compatibilidad ejecutan las clases `Client` y `Message` y el código inyectado real de whatsapp-web.js, con servicios de WhatsApp simulados. Cubren el identificador nuevo `$1`, respuestas y reacciones, y medios con el campo interno `__x_id`, además de las rutas de comandos y transacciones. La confirmación con la cuenta y el grupo reales se realiza en local.

### Compatibilidad con WhatsApp Web de 2026

La versión publicada 1.34.7 necesita dos correcciones ya aceptadas en el proyecto original: [identificadores `_serialized`/`$1`](https://github.com/wwebjs/whatsapp-web.js/pull/201832) y [colisión del ID al enviar medios](https://github.com/wwebjs/whatsapp-web.js/pull/201923). La dependencia se fija en esa versión y `patch-package` aplica `patches/whatsapp-web.js+1.34.7.patch` al instalar. El parche conserva los campos de subida y elimina la colisión tanto si el ID interno del medio tiene valor como si es `undefined`. No se ocultan ni se reintentan a ciegas los errores de envío.

`npm ci` o `npm install` debe mostrar que el parche se aplicó. No omitas los scripts de instalación. Al actualizar la librería, revisa si ya incorpora las correcciones y retira o adapta el parche antes de cambiar la versión.

Revisión de octubre de 2026: dependencias directas actualizadas; Chart.js local eliminado porque las gráficas usan QuickChart. Puppeteer viene con whatsapp-web.js. Se fija `basic-ftp` 6.2.2 para corregir una alerta transitiva.

Las peticiones a QuickChart indican explícitamente la versión que corresponde a cada configuración (2 para horas/días, 4 para año/progreso/resumen) y el formato PNG; así se conservan títulos y ejes.

La auditoría informa de nueve avisos altos, propagados desde dos dependencias sin versión corregida publicada. Cinco proceden de `extract-zip` 2.0.1: [enlaces simbólicos](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) y [escritura fuera del destino](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3). Se usa para instalar Chromium; el bot no extrae ZIP de usuarios. Los otros cuatro proceden de [`braces`, por patrones anidados](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), a través de `patch-package`; se usa en la instalación con archivos del proyecto, no al procesar mensajes. Ambas limitaciones siguen pendientes de sus dependencias.

## Alojamiento

Instala con `npm ci` y arranca con `npm start`; `Procfile` está actualizado. El servidor debe ejecutar Node y Chromium, mantener el proceso activo y acceder a Atlas. Configura las variables en el proveedor. `PUPPETEER_EXECUTABLE_PATH` permite usar su Chromium; `PUPPETEER_NO_SANDBOX=true` solo cuando lo requiera ese entorno.

Para disco efímero usa sesión remota o volumen persistente. El supervisor recupera fallos mientras el servidor está funcionando; no evita que el proveedor suspenda la instancia o termine el contenedor. El alojamiento se elegirá después de la prueba local.

## Estructura

- `index.js`: entorno y entrada.
- `src/runtime.js`: MongoDB, WhatsApp, HTTP y cierre.
- `src/supervisor.js`: reinicios y detección de bloqueos.
- `src/handler.js`: cola, comandos y confirmaciones.
- `src/score.js`, `src/year.js`: escrituras y archivo anual.
- `src/contact.js`: identificación de usuarios.
- `src/session-store.js`: respaldo remoto.
- `commands/`: comandos existentes.
- `models/`: usuarios, datos curiosos y mensajes procesados.
