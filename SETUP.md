# GymCoach - Guía de instalación y deploy

## Stack tecnológico (100% gratuito)
- **Frontend:** React + Vite + Tailwind CSS
- **Base de datos + Auth:** Supabase (plan gratuito)
- **Hosting:** Vercel (gratuito)

---

## Paso 1 – Crear cuenta en Supabase

1. Ir a [supabase.com](https://supabase.com) y crear una cuenta gratis
2. Crear un nuevo proyecto (elegir región más cercana, ej: South America)
3. Anotar la contraseña del proyecto (la vas a necesitar)
4. Esperar a que el proyecto se inicialice (~2 minutos)

---

## Paso 2 – Configurar la base de datos

1. En el panel de Supabase, ir a **SQL Editor**
2. Copiar y ejecutar todo el contenido de `supabase/schema.sql`
3. Copiar y ejecutar el contenido de `supabase/seed.sql`
   - ⚠️ Primero creá el usuario coach (Paso 3), luego ejecutá el seed

---

## Paso 3 – Crear el usuario coach

1. En Supabase, ir a **Authentication → Users**
2. Hacer click en **Add user → Create new user**
3. Ingresar el email y contraseña del coach
4. En **SQL Editor**, actualizar el perfil con rol coach:

```sql
UPDATE profiles
SET role = 'coach', name = 'Tu Nombre'
WHERE email = 'tu-email@gmail.com';
```

---

## Paso 4 – Obtener las credenciales de Supabase

1. Ir a **Settings → API** en el panel de Supabase
2. Copiar:
   - **Project URL** (ej: `https://abcdefgh.supabase.co`)
   - **anon public key** (la clave pública)

---

## Paso 5 – Configurar y correr localmente

```bash
# 1. Entrar a la carpeta del proyecto
cd gym-app

# 2. Instalar dependencias
npm install

# 3. Crear archivo de variables de entorno
cp .env.example .env

# 4. Editar .env con tus credenciales de Supabase
# VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
# VITE_SUPABASE_ANON_KEY=tu-anon-key-aqui

# 5. Correr en modo desarrollo
npm run dev
```

La app estará disponible en `http://localhost:5173`

---

## Paso 6 – Deploy en Vercel (gratis)

1. Subir el proyecto a GitHub
2. Ir a [vercel.com](https://vercel.com) y crear cuenta gratis
3. Importar el repositorio de GitHub
4. Configurar las variables de entorno en Vercel:
   - `VITE_SUPABASE_URL` = tu URL de Supabase
   - `VITE_SUPABASE_ANON_KEY` = tu anon key
5. Hacer click en **Deploy**

Vercel genera una URL pública como `gymcoach-xxx.vercel.app` — esa URL se comparte con los alumnos.

---

## Cómo agregar alumnos

### Opción A: Desde el coach (recomendado)
1. Ingresar como coach
2. Ir a **Alumnos → Nuevo alumno**
3. Completar los datos y crear
4. Compartir el email/contraseña con el alumno

### Opción B: Manual en Supabase
1. Ir a **Authentication → Users → Add user**
2. Crear el usuario
3. En SQL Editor, asignarle rol student:
```sql
UPDATE profiles SET role = 'student', name = 'Nombre Alumno'
WHERE email = 'alumno@email.com';
```

---

## Cómo cargar los planes del Excel

Los 9 planes de tu Excel ya están incluidos como datos iniciales en `supabase/seed.sql`. Solo necesitás ejecutar ese SQL después de configurar la base de datos.

Para cargar los ejercicios de los planes restantes (3-9) con todos sus detalles, podés:
1. Ingresar como coach
2. Ir a **Planes** y seleccionar el plan
3. Agregar los ejercicios manualmente desde la biblioteca

---

## Estructura de la app

```
/login          → Pantalla de inicio de sesión

/coach          → Dashboard del coach
/coach/students → Lista de alumnos
/coach/students/new → Crear alumno
/coach/students/:id → Detalle del alumno (planes, progreso, logs)
/coach/plans    → Lista de planes
/coach/plans/new → Crear plan
/coach/plans/:id → Ver/editar plan
/coach/exercises → Biblioteca de ejercicios

/student        → Dashboard del alumno
/student/workout → Entrenamiento de hoy (registrar ejercicios)
/student/progress → Gráficos de progreso
/student/history → Historial de todos los entrenamientos
/student/profile → Perfil y configuración
```

---

## Dudas frecuentes

**¿Cuánto cuesta?**
Nada. Supabase tiene plan gratuito con 500MB de base de datos y 50,000 auth users. Vercel es gratis para proyectos personales.

**¿Funciona en celular?**
Sí, está diseñada mobile-first. También funciona en computadora.

**¿Se puede instalar como app en el celular?**
Sí, es una PWA. En el navegador del celular, hay una opción "Agregar a pantalla de inicio".

**¿Los alumnos ven las notas privadas del coach?**
No. Las notas privadas del coach están protegidas por Row Level Security en la base de datos.
