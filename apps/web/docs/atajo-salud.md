# Atajo "Coachy Salud" — pasos, sueño y frecuencia cardiaca desde el iPhone

Coachy no tiene app nativa, así que no puede leer HealthKit por su cuenta. Lo que sí puede es
recibir los datos: un **Atajo de iOS** lee la app Salud una vez al día y los manda a
`POST /api/health/ingest`.

Se arma una vez, en unos diez minutos, y ya no se vuelve a tocar. A partir de ahí:

- Con **dos semanas** de pasos, el motor corrige el gasto energético por banda de actividad
  (el PAL; la fórmula está en [`src/lib/health/activity.ts`](../src/lib/health/activity.ts)).
- Si el reloj registra **menos de 6 h** de sueño, el modo gimnasio lo dice esa mañana. Solo lo
  dice: las cargas no se cambian solas.

> **El token es una llave.** Con él se pueden escribir días en tu cuenta. No lo pegues en un
> chat ni en una captura de pantalla. Si se escapó, la tarjeta "Tu reloj" en `/app` tiene el
> botón **Estrenar token** — el atajo viejo deja de funcionar en ese instante.

---

## 1. Lo que necesitas antes de empezar

De la tarjeta **Tu reloj**, en la pantalla de inicio de la app:

| Dato | Ejemplo |
|---|---|
| Dirección | `https://<tu-dominio>/api/health/ingest` |
| Token | `Bearer 3f2b…` (el botón de copiar ya le pone el `Bearer`) |

Los dos se copian de un tap. Pégalos en Notas mientras armas el atajo y **borra la nota al
terminar**.

---

## 2. Armar el atajo

Abre **Atajos** → **+** (arriba a la derecha) → ponle de nombre `Coachy Salud`.

### 2.1 La fecha de ayer

El atajo corre en la mañana y sube **el día anterior**, que ya está completo.

1. **Fecha** → deja "Fecha actual".
2. **Ajustar fecha** → Restar **1 día** a la Fecha.
3. **Formatear fecha** → Formato personalizado: `yyyy-MM-dd`.
4. Toca el resultado → **Renombrar variable** → `Ayer`.

### 2.2 Las muestras de Salud

Para cada dato se repite la misma pareja de acciones: **Buscar muestras de Salud** y luego
**Obtener números del resultado** (o **Calcular estadísticas** si hay que sumar o promediar).

| Dato | Tipo de muestra | Cómo se resume | Variable |
|---|---|---|---|
| Pasos | Pasos | Suma | `Pasos` |
| Energía activa | Energía activa | Suma | `Kcal` |
| Minutos de ejercicio | Minutos de ejercicio | Suma | `Ejercicio` |
| Sueño | Análisis del sueño (dormido) | Suma, en minutos | `Sueño` |
| FC en reposo | Frecuencia cardiaca en reposo | Promedio | `FCReposo` |

En cada **Buscar muestras de Salud**:

- *Tipo de muestra*: el de la tabla.
- *Filtro*: `Fecha de inicio` **está en el rango** de **ayer** (Atajos ofrece "Ayer" como
  opción; si no, usa *Fecha de inicio es hoy* con la fecha ajustada del paso 2.1).
- *Ordenar por*: Fecha de inicio.
- *Límite*: desactivado.

Luego **Calcular estadísticas** → *Suma* (o *Promedio* para la frecuencia cardiaca) → sobre las
muestras encontradas. Renombra el resultado con el nombre de la última columna.

> Si algún dato no lo tienes (por ejemplo, no usas el reloj para dormir), **sáltate esa pareja de
> acciones**. El endpoint acepta días incompletos: lo que no viene no se inventa y tampoco borra
> lo que ya estaba guardado.

### 2.3 El envío

Agrega **Obtener contenido de la URL** y configúralo así:

- **URL**: la dirección de la tarjeta.
- **Método**: `POST`.
- **Encabezados**:
  - `Authorization` → `Bearer <tu token>`
  - `Content-Type` → `application/json`
- **Cuerpo de la solicitud**: `JSON`, con estos campos:

| Clave | Tipo | Valor |
|---|---|---|
| `date` | Texto | variable `Ayer` |
| `steps` | Número | variable `Pasos` |
| `activeKcal` | Número | variable `Kcal` |
| `exerciseMin` | Número | variable `Ejercicio` |
| `sleepMin` | Número | variable `Sueño` |
| `restingHr` | Número | variable `FCReposo` |

El cuerpo que se manda se ve así:

```json
{
  "date": "2026-08-24",
  "steps": 9120,
  "activeKcal": 430,
  "exerciseMin": 62,
  "sleepMin": 402,
  "restingHr": 58
}
```

Todos los campos menos `date` son opcionales. Los decimales se redondean.

### 2.3.1 Si los campos del JSON no dejan insertar variables

A veces el editor de campos JSON de Atajos no muestra la barra de variables (bug conocido).
La salida es mandar el cuerpo como texto:

1. En **Obtener contenido de la URL**, cambia *Cuerpo de la solicitud* de `JSON` a **Archivo**.
2. Antes de esa acción, agrega una acción **Texto** y escribe el JSON a mano, insertando las
   variables dentro (en el cuadro de Texto la barra de variables sí aparece; si no, mantén
   presionado → *Insertar variable*):

   ```json
   {
     "date": "[Ayer]",
     "steps": [Pasos],
     "activeKcal": [Kcal],
     "exerciseMin": [Ejercicio],
     "sleepMin": [Sueño],
     "restingHr": [FCReposo]
   }
   ```

   `date` va entre comillas; los números no. Los `[…]` son los chips de variable, no texto.
3. En *Cuerpo de la solicitud* → *Archivo*, selecciona el resultado de esa acción **Texto**.

Consejo relacionado: guarda cada resultado con **Fijar variable** (nombre explícito) en vez de
depender de los "resultados mágicos" — así siempre aparecen en el selector.

### 2.2.1 El sueño se suma distinto

"Análisis del sueño" guarda categorías (dormido/despierto/en cama), no números, así que
**Calcular estadísticas → Suma** directo truena con *"couldn't convert from Text to Number"*.
La duración sí es numérica:

1. En **Calcular estadísticas → Suma**, toca la variable de las muestras y en el menú de
   propiedades elige **Duración** (no el valor).
2. La duración viene en **segundos**: agrega **Calcular** → resultado ÷ 60, y opcionalmente
   **Redondear número**. Eso es `sleepMin`.
3. En el **Buscar muestras de Salud** de sueño, filtra fuera *Despierto* y *En cama* para no
   inflar el total.

### 2.4 La confirmación (opcional pero recomendable la primera vez)

Agrega al final **Mostrar notificación** con el resultado de la URL. Si todo salió bien
contesta:

```json
{ "ok": true, "guardados": 1, "fechas": ["2026-08-24"] }
```

Cuando ya sepas que funciona, quita la notificación para que corra en silencio.

---

## 3. Que corra solo cada mañana

**Atajos → Automatización → + → Automatización personal → Hora del día**:

- **9:00**, todos los días.
- Acción: **Ejecutar atajo** → `Coachy Salud`.
- **Desactiva "Preguntar antes de ejecutar"** (y confirma el aviso). Si queda activado, iOS
  pide permiso cada mañana y en la práctica el atajo deja de correr.

Las 9:00 no son casualidad: el sueño de la noche ya se cerró y el día de ayer está completo.

---

## 4. Comprobar que está llegando

Dos formas:

1. **En la app**: la tarjeta "Tu reloj" dice `Último dato recibido: …`.
2. **Desde el atajo o desde una terminal**, con un `GET` al mismo endpoint:

```bash
curl -s -H "Authorization: Bearer <token>" https://<tu-dominio>/api/health/ingest
```

Devuelve los últimos 7 días guardados.

---

## 5. Cuando algo no funciona

| Lo que responde | Qué pasó | Qué hacer |
|---|---|---|
| `401 token inválido` | El encabezado no llegó, o el token cambió | Revisa que el encabezado se llame exactamente `Authorization` y que el valor empiece con `Bearer ` |
| `422 datos fuera de rango` | La fecha no viene como `YYYY-MM-DD`, o un número es negativo o absurdo | Revisa el paso 2.1 y que los campos numéricos sean **Número**, no Texto |
| `429 demasiadas peticiones` | El atajo se ejecutó muchas veces seguidas | Espera unos minutos; con una corrida diaria no vuelve a pasar |
| `400 cuerpo inválido` | El cuerpo no se está mandando como JSON | En "Obtener contenido de la URL", *Cuerpo de la solicitud* debe decir `JSON` |

### Recuperar días perdidos

Si el teléfono estuvo apagado unos días, el mismo endpoint acepta varios de golpe:

```json
{
  "days": [
    { "date": "2026-08-21", "steps": 8100 },
    { "date": "2026-08-22", "steps": 11400, "sleepMin": 380 }
  ]
}
```

Reenviar un día que ya estaba **corrige**, no duplica: `(atleta, fecha)` es único.

---

## 6. Lo que Coachy hace con esto — y lo que no

**Sí:**

- Corrige el gasto energético estimado por banda de pasos, dentro de los límites del motor.
- Avisa en el gimnasio cuando dormiste poco.
- Muestra promedios de 7 días en tu pantalla de inicio y en el panel de tu coach.

**No:**

- No diagnostica nada. Ni sueño, ni corazón, ni recuperación.
- No cambia tus cargas ni tus calorías por su cuenta a partir de una noche mala.
- No guarda el detalle de tus noches para que alguien más lo lea: el panel del coach ve
  promedios de la semana, no la hora a la que te dormiste.
