# Bot v2

El log de Railway confirma OOM: límite 954 MiB, pico 954 MiB, `oomKillsSinceStart=1` y Chrome terminado con señal 9. La conexión se sustituye por Baileys 7.0.0-rc14, fijado en el lockfile. No hay navegador ni sesiones ZIP en el runtime nuevo.

## Componentes

- Transporte WebSocket: una conexión activa, reconexión con espera progresiva y caches limitadas. Se permite el bootstrap y los datos de contactos necesarios para relacionar LID con teléfono; los mensajes de esa sincronización se descartan. No se descarga el historial completo ni reciente.
- Sesión: credenciales y claves Signal en MongoDB, con serialización BufferJSON y escrituras confirmadas antes de retornar. Los respaldos antiguos de GridFS no se reutilizan ni se borran.
- Exclusión: lease por SESSION_ID, renovada periódicamente. Una instancia nueva espera a la anterior; las escrituras de sesión y de trabajos comprueban la propiedad de la lease.
- Entrada: solo comandos y puntajes se guardan en una bandeja persistente, con ID original y orden de llegada. Los pendientes sobreviven al reinicio.
- Negocio: mismas 21 entradas de comandos y mismas reglas de puntuación. Los puntos, la deduplicación, las respuestas pendientes y la finalización del trabajo se confirman juntos. Los comandos que modifican datos también usan esa transacción; las descargas de gráficas se preparan fuera de ella.
- Salida: texto, imágenes, citas y reacciones en una bandeja persistente. ID de envío estable, confirmación del servidor, reintentos limitados y conservación de mensajes fallidos para revisar.
- Recursos: el proceso mantiene solo el trabajo actual y caches limitadas. MongoDB guarda la cola y el material necesario para reenvíos.

## Migración y verificación

La primera vinculación exige un QR nuevo porque las sesiones de Chromium y Baileys son incompatibles. Se conservan el número, SESSION_ID, usuarios y archivos anuales. El punto de corte inicial impide importar el historial antiguo como nuevos puntajes.

Se verifican comandos, referencias LID/teléfono, claves binarias, imágenes, desconexiones, duplicados, reintentos con el mismo ID, exclusión de instancias, transacciones y recuperación después de reiniciar. Las pruebas de base de datos usan una base temporal; las pruebas del contenedor no acceden a la cuenta real.

Los puntajes aceptados en MongoDB tienen deduplicación transaccional. El SDK confirma la recepción a WhatsApp antes de emitir el evento a la aplicación: existe una ventana entre recepción y persistencia si el proceso muere en ese instante. Se cierra la conexión al fallar MongoDB para reducirla. Una confirmación de salida perdida puede exigir reenviar la respuesta con el mismo ID. No se promete disponibilidad absoluta ni entrega exactamente una vez a través de una red externa.
