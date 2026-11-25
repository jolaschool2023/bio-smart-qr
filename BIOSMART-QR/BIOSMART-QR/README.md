# BIOSMART QR — Biodiversidad Participativa 🌿

Plataforma de ciencia ciudadana para el proyecto de restauración ecológica de la
**Avenida Ecológica de Chabám, Tiquipaya, Cochabamba (Bolivia)**.

Los visitantes leen un código QR, se registran y comparten avistamientos de flora
y fauna; los datos alimentan estadísticas en vivo, un croquis de biodiversidad y
un panel administrativo completo.

> **Proyecto privado.** No se publica ni se despliega en ningún servicio externo
> sin autorización explícita del equipo responsable.

---

## Requisitos

- **Node.js ≥ 22.5** (probado con Node 24). Se usa el módulo nativo `node:sqlite`.
- **Cero dependencias npm.** No hay que ejecutar `npm install`: todo el código es
  JavaScript estándar del navegador y de Node. (`npm.ps1` además puede estar
  bloqueado por la política de ejecución de Windows; no hace falta.)

## Arranque rápido

```powershell
cd BIOSMART-QR
node server/server.js
```

La plataforma queda en **http://localhost:8090**

- La base de datos se crea sola en `storage/biosmart.db` (modo WAL).
- **El público NO necesita cuenta ni contraseña**: catálogos, registrar
  avistamientos y estadísticas son de acceso directo.
- Para administrar: botón **⚙ Panel administrativo** en la barra superior.
  Pide **solo una contraseña** (sin correo ni usuario).
- Para reiniciar limpio: borra `storage/biosmart.db`, `storage/biosmart.db-wal`
  y `storage/biosmart.db-shm` (opcional: `storage/uploads/` y
  `storage/admin.json`).

### Acceso de administrador (solo contraseña)

El panel se abre con una contraseña; no hay correo, registro público ni
formulario de «crear cuenta». La contraseña se guarda como **hash scrypt con
sal** en `storage/admin.json` (nunca en texto plano ni en el código), y la
sesión queda en una cookie HttpOnly.

- La cuenta interna del administrador se crea automáticamente al arrancar.
- Para **cambiar o recuperar** la contraseña: borra `storage/admin.json` y
  arranca una vez con `$env:BIOSMART_ADMIN_PASSWORD="tu-nueva-clave"`; el
  servidor genera el nuevo hash y vuelve a funcionar sin la variable.
- Si se pierde la contraseña sin borrar el archivo: reinicia desde cero con
  los pasos anteriores (no hay recuperación por correo).
- Esa sesión habilita el panel ⚙ (gestión de contenidos y revisión).

---

## Módulos (menú principal — exactamente 4)

Cada módulo es una pantalla independiente, con scroll interno y botón
**«VOLVER AL MENÚ PRINCIPAL»** arriba y abajo. La navegación es solo por botones.

1. **Flora** — catálogo con fichas. Semilla exacta: **Molle**, **Chilijchi**
   (*Erythrina falcata*), **Tamar/tamarisco**. El administrador añade especies
   desde el panel sin tocar código.
2. **Fauna** — fichas por especie con categorías: Aves, Mamíferos, Reptiles,
   Anfibios, Mariposas, Insectos y Polinizadores. Distingue siempre entre
   **presencia confirmada por observación** y **presencia potencial**: no se
   afirma ninguna especie como confirmada en Chabám sin evidencia en la base.
3. **Registrar avistamiento** — formulario de 6 preguntas (tipo, nombre conocido
   —incluye «No lo conozco»—, número de individuos ≥ 1, zona con selección por
   croquis/mapa, comportamiento y foto opcional JPG/JPEG/PNG/WEBP ≤ 8 MB), fecha
   y hora automáticas, observador y notas opcionales, confirmación de no daño y
   de consentimiento. **No se guarda nada hasta que el servidor confirma el
   envío**; los errores conservan lo escrito; el reenvío con la misma clave no
   duplica registros; el estado inicial es **«Pendiente de revisión»**.
4. **Estadísticas** — 10 indicadores, gráficos de barras, tarta/dona, línea y
   top de especies, tabla de registros y croquis/biodiversidad (sin ubicaciones
   sensibles exactas). **Todo se calcula en vivo desde la base**: ninguna cifra
   está inventada. El administrador exporta CSV.

Además: **panel administrativo** (usuarios, flora, fauna, revisión de
avistamientos con fotos, zonas, traducciones y auditoría).

> El menú público muestra solo estos módulos, **sin login** (las opciones de
> códigos QR, **Clasificación** y **Recompensas** se retiraron). El
> administrador abre ⚙ con la contraseña para gestionar los contenidos.

---

## Idiomas

Selector visible en la barra superior con **español, English, quechua y aymara**.
La preferencia se guarda en el navegador.

- El nombre científico en latín **nunca se traduce**.
- **quechua (qu) y aymara (ay): marcados «en revisión».** Muestra un aviso
  visible y cualquier texto aún no verificado por hablantes vuelve a caer al
  español. Las correcciones se cargan desde el panel admin
  (pestaña «Traducciones») y se aplican al instante.

---

## Pruebas

Los tests **escriben datos** (un avistamiento): ejecútalos contra un servidor
**aislado**, no contra la base real.

```powershell
# Servidor aislado en :8198, base y contraseña propias, sin límites de tasa
$env:BIOSMART_DB="storage/test-api.db"; $env:BIOSMART_ADMIN_JSON="storage/test-api-admin.json"
$env:BIOSMART_ADMIN_PASSWORD="secreto12345"; $env:PORT="8198"; $env:RL_DISABLED="1"; node server/server.js
# En otra terminal:
$env:BASE="http://localhost:8198"; $env:BIOSMART_DB="storage/test-api.db"
$env:BIOSMART_ADMIN_PASSWORD="secreto12345"; node tests/api.test.js
#   94 aserciones: panel por contraseña, alta pública cerrada, público sin
#   sesión, roles, CRUD, fotos, idempotencia, estadísticas, CSV, 401…

node scripts/check-i18n.mjs   # verifica que no falte ninguna clave t()
node scripts/check-routes.js  # cruza las rutas del frontend con el backend
node scripts/smoke.js         # assets, API pública, anti-traversal
```

La contraseña nunca se guarda en texto plano (hash **scrypt** con sal).

### Bot de pruebas de uso (carga) — 1000 por cada parte del sitio

```powershell
node scripts/loadbot.js --n 1000            # 1000 pruebas × 10 secciones = 10.000
node scripts/loadbot.js --n 50              # corrida rápida
node scripts/loadbot.js --n 1000 --concurrency 40
node scripts/loadbot.js --keep              # conserva la base de carga
```

El bot levanta **su propio servidor aislado** (puerto 8099, base
`storage/loadbot.db`, subidas en `storage/loadbot-uploads/`, límites de tasa
desactivados) y **nunca toca la base real**. Se ejecuta en 10 secciones —una
por cada opción del sitio— con distintos tipos de uso:

| # | Sección | Tipos de uso |
|---|---------|--------------|
| 1 | Acceso (contraseña / sesión) | visitante público, anónimo, contraseña correcta e incorrecta, registro inválido, malicioso, recuperación |
| 2 | Flora (catálogo y fichas) | visitante, ficha, ficha inexistente, filtro, anónimo, malicioso |
| 3 | Fauna (catálogo y fichas) | visitante, ficha, categorías, filtro, anónimo, malicioso |
| 4 | Avistamientos (formulario) | visitante, usuario frecuente, malicioso, zona libre, anónimo, con foto, foto >8 MB |
| 5 | Estadísticas (10 indicadores) | coherencia, gráficos, tabla, anónimo, alcance de permisos |
| 6 | Pantallas y menú | visitante, recursos, sin opción QR, rutas, idiomas, malicioso |
| 7 | Panel administrativo | administrador, exportación CSV, visitante prohibido, anónimo, CRUD, revisión |
| 8 | Idiomas (es/en/qu/ay) | visitante, claves, edición admin, permisos, malicioso |
| 9 | Seguridad | traversal, cabeceras, métodos, malicioso, contraseñas, límites de tasa |
| 10 | Fotografías | JPEG/PNG/WEBP, formato inválido, acceso como admin, límite 8 MB |

Cada prueba mide su latencia y el informe final muestra **pruebas, OK,
fallos, p50 y p95 por sección** más el total. Código de salida `0` si todo
pasa, `1` si hay fallos (útil en integración continua).

---

## Variables de entorno

Todas opcionales. Se configuran antes de arrancar el servidor:

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `8090` | Puerto HTTP |
| `BIOSMART_DB` | `storage/biosmart.db` | Ruta de la base SQLite |
| `RL_DISABLED` | — | `1` desactiva los límites por IP (pruebas/aula) |
| `RL_REGISTER` | `30` | Registros máximos por IP cada 10 min |
| `RL_LOGIN` | `60` | Inicios de sesión por IP cada 5 min |
| `RL_PASSWORD` | `30` | Intentos de recuperación por IP cada 5 min |
| `RL_SIGHTING` | `120` | Envíos de avistamiento por usuario cada hora |
| `BIOSMART_ADMIN_PASSWORD` | — | Contraseña inicial del panel (solo si no existe `storage/admin.json`) |
| `BIOSMART_ADMIN_JSON` | `storage/admin.json` | Ruta del archivo con el hash scrypt de la contraseña |
| `BIOSMART_UPLOADS` | `storage/uploads` | Ruta de las fotos subidas |

> Los límites son por IP: en un aula con muchos equipos tras la misma IP,
> amplíalos con `RL_*` o usa `RL_DISABLED=1` en la red local controlada.

---

## Estructura

```
BIOSMART-QR/
├─ server/            Servidor Node sin dependencias
│  ├─ server.js       HTTP + estáticos + cabeceras de seguridad (puerto 8090)
│  ├─ db.js           Esquema SQLite (node:sqlite), WAL, auditoría
│  ├─ api.js          API REST: auth, especies, zonas, avistamientos,
│  │                  estadísticas, CSV, fotos, traducciones, admin
│  ├─ auth.js         Sesiones por cookie HttpOnly, scrypt, roles
│  ├─ admin.js        Contraseña del panel (hash en storage/admin.json)
│  └─ seed.js         Zonas, estados de verificación, 3 flora + 10 fauna
├─ public/
│  ├─ index.html      SPA (enrutado por hash, sin paso de compilación)
│  ├─ css/styles.css  Sistema de diseño completo
│  ├─ js/             i18n (309 claves ×4 idiomas), api, gráficos SVG
│  │                  propios, app.js, admin.js
│  └─ img/            14 fotos con credits.json
├─ tests/api.test.js  Suite de integración (94 aserciones)
├─ scripts/           loadbot.js (bot de carga, 1000 por sección),
│                     smoke.js, check-routes.js, check-i18n.mjs,
│                     clean-test-data.js, fetch-images.mjs
├─ supabase/schema.sql  Migración a PostgreSQL + RLS (ver abajo)
└─ storage/           Base de datos y subidas (no versionar datos reales)
```

### API principal

`GET /api/health` · `GET /api/auth/status` · `POST /api/auth/admin-unlock` (solo
contraseña, abre el panel) · `POST /api/auth/logout` ·
`GET /api/auth/me` · `GET /api/species?kind=` · `GET /api/species/by-slug/:slug` ·
`GET /api/zones` · `GET|POST /api/sightings` (público; `GET ?scope=all` solo admin) ·
`PATCH /api/sightings/:id` (admin) ·
`GET /api/stats` (público) · `GET /api/export/sightings.csv` (admin) ·
`GET /api/photos/:id` (admin) · `GET /api/translations` (público) · `PUT /api/translations/:k/:l` (admin) ·
`/api/admin/*` (usuarios, auditoría) — CRUD de especies/zonas para administrador.

---

## Migración a Supabase

El archivo local ya funciona completo con SQLite. Para pasarse a Supabase
(PostgreSQL):

1. Crea el proyecto en supabase.com **con tu propia cuenta** (no se incluyen
   claves en el repositorio).
2. Ejecuta `supabase/schema.sql` en el SQL Editor: crea las 9 tablas, los
   índices (incluido el anti-duplicados de `client_key`), la vista de exportación
   CSV y las políticas **RLS**.
3. Copia los datos: `users` (con su `password_hash` scrypt intacto), `sessions`,
   `species`, `zones`, `verification_states`, `translations`, `audit_log` y
   `sightings`. Las fotos viven en disco: súbelas a un *bucket* privado de
   Supabase Storage y guarda la ruta en `photos.filename`.
4. Apunta el servidor a `DATABASE_URL` (o usa el adaptador de Postgres de
   Node) y sustituye `node:sqlite` por consultas `pg`.

> **Nunca** subas contraseñas en texto plano ni expongas la clave de servicio
> en el navegador.

---

## Créditos de imágenes

Fotografías de **Wikimedia Commons** (14/14 con licencia registrada en
`public/img/credits.json`, mostrada en cada ficha):

| Archivo | Autor | Licencia |
|---|---|---|
| hero.jpg | Wikimedia Commons | CC BY-SA 2.5 |
| molle.jpg | Franz Xaver | CC BY-SA 3.0 |
| chilijchi.jpg | Penarc | CC BY 3.0 |
| tamar.jpg | Wikimedia Commons | CC BY-SA 3.0 |
| picaflor.jpg | The Lilac Breasted Roller… | CC BY 2.0 |
| tortola.jpg | Cláudio Dias Timm | CC BY-SA 2.0 |
| paloma.jpg | Derek Ramsey (Ram-Man) | GFDL 1.2 |
| mariposa.jpg | Luc Viatour | CC BY-SA 3.0 |
| zorro.jpg | Christian Mehlführer | CC BY-SA 3.0 |
| comadreja.jpg | Rhalah | CC BY-SA 3.0 |
| abeja-melifera.jpg | Luc Viatour | CC BY-SA 3.0 |
| abeja-nativa.jpg | DINUKAPRABHATH | CC BY-SA 4.0 |
| mosca-colibri.jpg | User:Fir0002 | GFDL 1.2 |
| lagartija.jpg | Peterwchen | CC BY-SA 4.0 |

Las fotos subidas por la ciudadanía pertenecen a sus autores y solo se usan
para esta plataforma con su consentimiento.

---

## Seguridad

- Contraseñas con **scrypt + sal**; jamás en texto plano (verificado en pruebas).
- Sesión por cookie **HttpOnly / SameSite**, token solo guardado con SHA-256.
- Roles `admin`/`user` y autorización 401/403 en cada endpoint sensible.
- Subidas validadas por bytes mágicos (JPEG/PNG/WEBP), ≤ 8 MB.
- Límites de tasa por IP configurables.
- Cabeceras de seguridad y sin path traversal hacia el servidor.

---

## Despliegue en Vercel

El repo incluye `api/[...path].js` y `vercel.json`. En Vercel, crea un proyecto
con **Root Directory = `BIOSMART-QR/BIOSMART-QR`**. Vercel sirve `public/` como
estáticos y la función `api/[...path].js` atiende todas las rutas `/api/*`.

**Variable de entorno obligatoria en Vercel** (Dashboard → Settings →
Environment Variables, sin comillas):

| Nombre | Valor |
|---|---|
| `BIOSMART_ADMIN_PASSWORD` | la contraseña del panel ⚙ |

`vercel.json` ya define `BIOSMART_DB=/tmp/biosmart.db`,
`BIOSMART_UPLOADS=/tmp/biosmart-uploads` y `BIOSMART_ADMIN_JSON=/tmp/admin.json`
porque el filesystem del proyecto es de solo lectura.

> **Importante:** en el plan gratuito `/tmp` es efímero: los avistamientos,
> fotos y el hash de la contraseña se reinician en cada arranque en frío y no
> se comparten entre instancias. La web funciona, pero para conservar datos
> de forma permanente hay que sustituir SQLite por una base administrada
> (Vercel Postgres/Neon o Supabase) y el almacenamiento de fotos por Blob/S3.
