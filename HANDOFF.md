# SMTBROKER — Handoff Técnico
**Fecha:** 2026-05-13  
**Versión:** 1.1 — Branding Navy+Gold + Responsive Mobile  
**URL producción:** https://smtbroker.vercel.app  
**Repositorio local:** `C:\Users\Administrator\smtbroker`

---

## 1. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16.2.4 (App Router, Turbopack) |
| UI | React 19 + Tailwind CSS v4 |
| Lenguaje | TypeScript |
| Backend / DB | Supabase (PostgreSQL + Auth + RLS) |
| Mapas | Google Maps JavaScript API + Geocoding API |
| Charts | SVG custom (sin librerías externas) |
| Deploy | Vercel (proyecto: `smtbroker`) |

---

## 2. Variables de entorno

Archivo: `.env.local` en la raíz del proyecto.

```env
NEXT_PUBLIC_SUPABASE_URL=https://vdxadjaptothfgjrakij.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_IfKihs16rZWLJQRdjhDjWA_gNtAGZ5f
NEXT_PUBLIC_GOOGLE_MAPS_KEY=AIzaSyCEAkB9OsIAnGG6Lt9rzBy4geqieD1DIeM
```

> ⚠️ Estas keys son públicas (anon/publishable). Nunca exponer service_role keys en el frontend.

---

## 3. Estructura de archivos relevantes

```
app/
├── globals.css                  # Variables de color (CSS custom properties)
├── layout.tsx                   # Root layout
├── page.tsx                     # Redirect a /login
├── login/page.tsx               # Autenticación Supabase
├── dashboard/page.tsx           # Lista de activos del usuario
├── registro/page.tsx            # Alias de /bienvenida (redirect)
├── bienvenida/page.tsx          # Onboarding público (selección de rol + formulario)
├── panel/page.tsx               # Panel Maestro (Broker Maestro)
├── activo/
│   ├── nuevo/page.tsx           # Formulario de registro de activo
│   └── [id]/
│       ├── page.tsx             # Fase 1 — Diagnóstico y valoración
│       ├── marketing/page.tsx   # Fase 2 — Marketing y captación
│       └── leads/page.tsx       # Fase 3 — Lead scoring y cierre
└── components/
    ├── Topbar.tsx               # Header global con nav y logout
    └── MapPicker.tsx            # Componentes MapPicker (editable) y MapView (lectura)
```

---

## 4. Base de datos — Tablas Supabase

### `activos`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | Auto |
| usuario_id | uuid | FK → auth.users, RLS por este campo |
| nombre | text | |
| tipo | text | Terreno, Casa, Depto, etc. |
| direccion | text | Calle + número |
| colonia, municipio, cp, estado | text | |
| superficie | numeric | m² |
| precio_total | numeric | MXN |
| descripcion | text | |
| lat, lng | float8 | Coordenadas del mapa |
| status | text | ingresado / valoracion / marketing / leads / cerrado |
| created_at | timestamptz | Auto |

### `solicitudes`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | Auto |
| nombre, email, telefono | text | |
| rol | text | propietario / inversionista / broker |
| empresa | text | Opcional |
| datos | jsonb | Campos adicionales según rol |
| status | text | pendiente / aprobada / rechazada |
| created_at | timestamptz | Auto |

> RLS: authenticated puede SELECT y UPDATE en solicitudes.

### `usuarios`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | Mismo id que auth.users |
| nombre | text | Nombre de perfil |

---

## 5. Paleta de colores — Navy + Gold

Definida en `app/globals.css` como CSS custom properties bajo `@theme inline`:

```css
--color-smt:           #0F1F3D   /* Navy — color principal de marca */
--color-smt-dark:      #0A1628   /* Navy oscuro — hover/estado activo */
--color-smt-light:     #1A3460   /* Navy claro */
--color-smt-muted:     #EEF1F7   /* Fondo navy muy claro */
--color-smt-gold:      #C9A84C   /* Gold — acento principal (CTAs, badges) */
--color-smt-gold-dark: #A8893A   /* Gold oscuro */
--color-smt-gold-muted:#FBF5E6   /* Fondo gold muy claro */
```

> Los colores están hardcodeados como clases Tailwind arbitrarias `bg-[#C9A84C]` en los componentes. Si se quiere migrar a variables CSS, buscar y reemplazar los hex directamente.

### Colores de estado (no modificar — tienen semántica propia)

| Estado | Color | Uso |
|---|---|---|
| Éxito / Score alto | `#C9A84C` (gold) | Leads serios, items completados |
| Indigo | `#3730A3` / `#4F46E5` | Marketing, inversionistas |
| Amber | `#D97706` / `#92600A` | Valoración, programado |
| Gris | `#6B7280` | Cerrado, inactivo |
| Rojo | `#DC2626` | Errores de formulario |

---

## 6. Responsive — Cambios aplicados en esta versión

Todos los breakpoints son los de Tailwind:
- `sm` = 640px
- `md` = 768px  
- `lg` = 1024px

### Componente `Topbar`
- Mobile: logo + nombre marca + avatar + ícono salir
- sm+: aparece nombre de usuario
- md+: aparece separador y subtítulo completo

### `/bienvenida` (Registro público)
- Tarjetas de rol: `grid-cols-1` → `sm:grid-cols-2` → `lg:grid-cols-4`
- Formularios: `grid-cols-1` en mobile, `sm:grid-cols-2` en desktop
- **Scroll automático al formulario** al seleccionar rol (usando `useRef` + `scrollIntoView`)

### `/dashboard`
- Header: apilado en mobile, en fila en sm+
- Tarjetas de fases: `grid-cols-1` → `sm:grid-cols-3`
- Botones: texto corto en mobile ("Panel" / "Registrar")

### `/activo/nuevo`
- Todos los `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`
- Calle/Número: `grid-cols-1 sm:grid-cols-3`

### `/activo/[id]` (Fase 1)
- Hero banner: números más pequeños en mobile
- Due Diligence y Mercado: `grid-cols-1 md:grid-cols-2`
- Score Gauge: centrado arriba en mobile
- CTA: apilado en mobile

### `/activo/[id]/marketing` (Fase 2)
- Stats: `grid-cols-2 md:grid-cols-4`
- BarChart + DonutChart: stacked en mobile, `grid-cols-3` en md+
- Media Kit y Canales: `grid-cols-1 sm:grid-cols-2`

### `/activo/[id]/leads` (Fase 3)
- Filtros: `flex-wrap` para que no desborden
- ScoreBar oculta en mobile (`hidden sm:flex`)
- Detalles del top lead: apilados en mobile

### `/panel` (Panel Maestro)
- Métricas: `grid-cols-2 sm:grid-cols-3 md:grid-cols-5`
- Tabla de activos: scroll horizontal (`overflow-x-auto` + `min-w-[580px]`)
- Solicitudes: info y botones apilados en mobile

---

## 7. Flujo de la aplicación

```
/bienvenida  →  Usuario llena solicitud → guardada en `solicitudes` (status: pendiente)
                    ↓
/panel       →  Broker Maestro aprueba/rechaza solicitud
                    ↓
             →  (pendiente implementar) Envío de invitación por email al usuario aprobado
                    ↓
/login       →  Usuario autenticado entra al sistema
                    ↓
/dashboard   →  Ve sus activos, registra uno nuevo
                    ↓
/activo/nuevo →  Formulario → guarda en `activos`
                    ↓
/activo/[id]       →  Fase 1: Diagnóstico (datos simulados + mapa)
/activo/[id]/marketing  →  Fase 2: Campaña y métricas (simulado)
/activo/[id]/leads      →  Fase 3: Lead scoring y cierre (simulado)
```

---

## 8. Datos simulados vs. reales

| Dato | Estado actual | Para producción |
|---|---|---|
| Activos del usuario | **Real** (Supabase) | ✅ Listo |
| Solicitudes de registro | **Real** (Supabase) | ✅ Listo |
| Valoración / Due Diligence | **Simulado** (derivado del precio) | Conectar agente IA |
| Vistas y métricas de marketing | **Simulado** | Integrar portales / Meta Ads API |
| Leads | **Simulado** (9 leads hardcoded) | Crear tabla `leads` en Supabase |
| Brokers aliados | **Simulado** | Leer de tabla `usuarios` con rol broker |
| Inversionistas | **Simulado** | Leer de `solicitudes` aprobadas con rol inversionista |

---

## 9. Próximos pasos recomendados

1. **Activación de usuarios aprobados** — Cuando el Broker Maestro aprueba una solicitud, enviar email de invitación (Supabase `inviteUserByEmail` o Resend/Sendgrid).
2. **Tabla `leads`** — Crear en Supabase para almacenar leads reales captados por canal.
3. **Agente IA Fase 1** — Conectar Claude API para generar el reporte de valoración real a partir de datos del activo.
4. **Notificaciones** — Push o email al Broker Maestro cuando llegue una nueva solicitud de registro.
5. **Autenticación por rol** — Middleware que restrinja `/panel` solo a usuarios con rol `broker_maestro`.

---

## 10. Comandos útiles

```bash
# Desarrollo local
npm run dev           # Levanta en http://localhost:3000

# Deploy a producción
npx vercel --prod     # Requiere Vercel CLI instalado y sesión activa

# Ver deployments
npx vercel ls
```

---

*Generado el 2026-05-13. Contacto técnico: jcalvarez@mindbridge.com.mx*
