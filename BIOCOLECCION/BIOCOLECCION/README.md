# Biodiversidad — registro y colección

Plataforma para registrar los animales que cada participante ha observado
personalmente, compararlos en una clasificación general y usarla sin cuentas.

**Sin login ni contraseñas.** Cada navegador genera una clave propia (guardada
en el dispositivo) y un nombre visible. La colección identifica a su titular por
esa clave.

## Arranque

```powershell
node server/server.js        # → http://localhost:8091
```

Luego abre **http://localhost:8091** y escribe tu nombre cuando te lo pida
(o «Seguir como Anónimo»).

## Funcionalidades

### 0. Nombre visible (sin cuentas)
- Al abrir la app por primera vez se pide un **nombre o apodo**. Se guarda en
  el navegador; se puede cambiar cuando quieras con «Cambiar nombre».
- Con **«Seguir como Anónimo»** la colección y la clasificación muestran
  «Anónimo».
- Sin correos ni contraseñas: nada que perder ni restablecer.

### 1. Mi colección
- Cada participante ve **solo los animales que él mismo ha registrado**
  (aislados por la clave del navegador).
- Solo se permite registrar animales observados **personalmente** (casilla
  obligatoria de confirmación, también validada por el servidor).
- Cada registro incluye **nombre del animal** y **especie**, más la fecha.

### 2. Tabla de clasificación
- Clasificación general con el **nombre visible de cada participante** y la
  **cantidad de animales registrados**.
- De mayor a menor, con barra visual, medallas para los tres primeros y la
  marca «Tú» en tu fila.

### 3. Pruebas automatizadas (hasta 1.000 participantes)

```powershell
node scripts/test.js                  # 1000 participantes (por defecto)
node scripts/test.js --n 100          # corrida rápida
node scripts/test.js --n 1000 --concurrency 40
```

El bot levanta **su propio servidor aislado** (puerto 8199, base
`storage/test.db`) y no toca la base real. Comprueba:

| # | Fase | Qué verifica |
|---|------|--------------|
| 1 | Identidad | nombre visible, clave, validaciones, colección vacía |
| 2 | N participantes | cada uno crea su identidad y arma su colección (1–5 animales) |
| 3 | Simultáneo | 100 participantes registran animales **a la vez** |
| 4 | Clasificación | orden de mayor a menor y cantidad exacta por nombre |
| 5 | Perfil | el nombre se actualiza por clave (renombrar) |
| 6 | Frontend | páginas y recursos se sirven correctamente |

Además verifica que **ningún participante ve la colección de otro** y que la
suma de la clasificación coincide con los registros creados. Código de salida `0`
si todo pasa, `1` si hay fallos.

### 4. Diseño
Interfaz moderna y responsiva (verde natural, tarjetas, barras de progreso,
medallas, avisos). Navegación de dos pestañas: **Mi colección** →
**Clasificación**.

## API

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| POST | `/api/profile` | público | crear/actualizar el nombre visible (`key`, `name`) |
| GET | `/api/collection?key=` | clave propia | colección del participante (vacía si la clave es desconocida) |
| POST | `/api/collection` | público | registrar animal (`key`, `name`, `animalName`, `species`, `observed`) |
| GET | `/api/leaderboard?key=` | público | clasificación de mayor a menor (marca `isMe` si se envía la clave) |

La clave del navegador (`key`, 8–80 caracteres) la genera y guarda el propio
navegador; nunca se muestra ni se pide como dato personal.

## Estructura

```
BIOCOLECCION/
├── server/          db.js, api.js, server.js  (Node + SQLite, sin dependencias)
├── public/          index.html, css/styles.css, js/app.js
├── scripts/test.js  bot de pruebas (1000 participantes)
└── storage/         biocol.db (se crea al arrancar)
```

## Notas
- Sin dependencias externas: usa solo Node (>= 22) y `node:sqlite`.
- Migración automática: si viene de la versión con cuentas, la base anterior
  se respalda como `storage/biocol.db.bak-<fecha>` y los registros se
  conservan (reasignados a claves «legacy-<id>»).
- El servidor escucha en todas las interfaces: se abre en esta PC
  (`http://localhost:8091`) y desde otros equipos de la red local
  (`http://<IP-de-esta-PC>:8091`).
- La identidad vive en el navegador: si se borran los datos del sitio, la
  colección se «pierde» (los registros siguen contando en la clasificación).
  Es el precio de no usar cuentas.

## Despliegue en Vercel

El repo incluye `api/[...path].js` y `vercel.json`. En Vercel, crea un proyecto
con **Root Directory = `BIOCOLECCION/BIOCOLECCION`**. Vercel sirve `public/`
como estáticos y la función `api/[...path].js` atiende todas las rutas `/api/*`.
No hace falta configurar contraseñas ni variables secretas: `vercel.json` ya
define `BIOCOL_DB=/tmp/biocol.db`.

> **Importante:** en el plan gratuito `/tmp` es efímero: las colecciones y la
> clasificación se reinician en cada arranque en frío y no se comparten entre
> instancias. Para conservar los registros de forma permanente hay que
> sustituir SQLite por una base administrada (Vercel Postgres/Neon o Supabase).
