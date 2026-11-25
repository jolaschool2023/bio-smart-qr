# steam-bio

Dos aplicaciones web sin dependencias externas (Node ≥ 22 + `node:sqlite`):

| App | Carpeta | Local | Vercel (Root Directory) |
|---|---|---|---|
| BIOSMART QR | `BIOSMART-QR/BIOSMART-QR` | http://localhost:8090 | `BIOSMART-QR/BIOSMART-QR` |
| BIOCOLECCION | `BIOCOLECCION/BIOCOLECCION` | http://localhost:8091 | `BIOCOLECCION/BIOCOLECCION` |

Cada carpeta es un proyecto Vercel independiente dentro del mismo repo de
GitHub: `https://github.com/jolaschool2023/bio-smart-qr.git`.

## Despliegue

1. Sube este contenido al repo (o usa `git push` si ya está configurado).
2. En Vercel → **Add New → Project**, importa el repo dos veces:
   - Proyecto 1: Root Directory `BIOSMART-QR/BIOSMART-QR`.
   - Proyecto 2: Root Directory `BIOCOLECCION/BIOCOLECCION`.
3. En el proyecto de BIOSMART QR añade la variable de entorno
   `BIOSMART_ADMIN_PASSWORD` con la contraseña del panel ⚙.
4. Deploy. Cada proyecto entrega su propia URL `https://…vercel.app`.

Vercel sirve `public/` como estáticos y `api/[...path].js` atiende `/api/*`.

> **Aviso:** en el plan gratuito las bases SQLite viven en `/tmp` y son
> efímeras: los datos se reinician al arrancar y no se comparten entre
> instancias. Para una web permanente con datos compartidos hay que migrar a
> una base administrada (Vercel Postgres/Neon o Supabase) y, para fotos, a
> Vercel Blob/S3.

## Arrancar en local

```powershell
cd BIOSMART-QR\BIOSMART-QR; node server/server.js
cd BIOCOLECCION\BIOCOLECCION; node server/server.js
```

Cada README de app contiene el detalle de módulos, API y pruebas.
