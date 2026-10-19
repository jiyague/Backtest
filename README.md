# Backtest

Plataforma web de backtesting con replay de velas, basada en [Lightweight Charts](https://github.com/tradingview/lightweight-charts) (TradingView, Apache 2.0), TypeScript y Vite. Interfaz en español, alojada en GitHub Pages (`/Backtest/`).

**Fase 1:** gráfico de velas, datos M1 de HistData, timeframes (M1, M3, M5, M15, H1, H4, D, W, M, 12M), carga bajo demanda por mes y modo replay. Las herramientas de dibujo y la operativa simulada llegarán en fases posteriores.

## Horarios

- **La hora de HistData es EST fija (UTC-5), sin cambio horario.** Los JSON mensuales la conservan tal cual (`tz: "EST-fixed(UTC-5)"`).
- La web la convierte internamente a UTC (hora + 5 h) y **muestra por defecto America/New_York** (EST/EDT automático) en el eje, el crosshair y los tooltips. El selector **Zona** de la barra superior permite cambiar a UTC, Madrid o Londres; la zona activa y su desfase vigente (p. ej. `Hora: NY (EDT, UTC-4)`) se indican arriba a la derecha, según la vela bajo el cursor.
- Las velas se agrupan con el **cierre de NY a las 17:00** (zona real, respetando EST/EDT): D de 17:00 a 17:00; H4 ancladas a 17, 21, 01, 05, 09 y 13; W abre el domingo a las 17:00; M abre con la primera sesión del mes; 12M por año.
- **Auditoría del posible desfase de 4 h:** no hay error. Lightweight Charts recibe `time` en UTC real y los formateadores (`tickMarkFormatter`, `timeFormatter`) usan `Intl` con la zona activa, sin desplazamientos adicionales. Una H4 que abre a las 13:00 NY en verano (EDT) es 17:00 UTC; en invierno (EST) es 18:00 UTC. Hay tests con casos de verano, invierno y los dos cambios horarios (`tests/timezone.test.ts`).
- **Cómo comparar con TradingView (OANDA:EURUSD):** pon la misma zona en ambos. TradingView en UTC-4 equivale a NY en verano (EDT), pero en invierno NY es UTC-5; en ese caso compara con la zona `UTC` o con "Nueva York" en TradingView. Si TradingView está en UTC, elige `UTC` en la web: la vela de las 13:00 NY (EDT) aparecerá a las 17:00.
- Los huecos (minutos sin ticks) son normales y **no se rellenan** con velas inventadas.

## Replay

- **Seleccionar barra** (estilo Bar Replay de TradingView): pulsa el botón, haz clic en una vela y el replay arranca en pausa **al cierre** de esa vela en el timeframe actual (M1: su minuto; H4/D…: último minuto del periodo). Las velas posteriores se ocultan (los datos siguen en memoria, puedes elegir otro punto). `Esc` cancela la selección; durante la misma se resalta la vela bajo el cursor con una línea vertical. En replay no se puede elegir un instante posterior al ya revelado.
- El campo **Inicio (hora NY)** + «Iniciar replay» sigue disponible como alternativa.
- **Velocidades** (minutos de mercado por segundo): 1×, 2×, 5×, 10×, 30×, 60×, 120×, 300×, 600×, 1800× y 3600×. El avance se agrupa por fotograma (`requestAnimationFrame`): varias velas M1 por tick con un único redibujado, y el mes siguiente se precarga con margen según la velocidad. Nunca se revelan datos futuros.

## Tema

Interfaz y gráfico en tema claro (lienzo blanco, texto negro, cuadrícula gris clara). Velas verdes (`#089981`) y rojas (`#F23645`). Los colores están en variables CSS (`src/ui/style.css`) y en `THEME` (`src/chart/chart.ts`).

## Cómo subir datos

1. Descarga de HistData los CSV en formato NT, M1: **mensuales** (`DAT_NT_EURUSD_M1_202601.csv`) o **anuales** (`DAT_NT_EURUSD_M1_2025.csv`).
2. Súbelos con su nombre original a `data/raw/EURUSD/` (Add file → Upload files). El par y el periodo se extraen del nombre. No subas el `.txt` de status report (se ignora; solo se procesan `.csv`, y los nombres no reconocidos generan un aviso).
3. Al hacer push a `main`, GitHub Actions ejecuta la conversión, commitea los JSON generados (si cambian) y despliega.

Cómo se combinan: los CSV anuales se dividen en meses según la fecha de HistData (EST fija, sin convertir) y generan `data/json/<PAR>/2025-01.json` … `2025-12.json` (solo los meses con datos). Si hay un anual y un mensual del mismo mes, se fusionan por timestamp sin duplicados (**prevalece el mensual**). `index.json` lista todos los meses, y los H1/D precalculados se calculan con todos los datos combinados, por lo que las velas que cruzan meses o años no se parten.

Nota de tamaño: el workflow commitea `data/json` al repo; un año de M1 son unos pocos MB de JSON por mes, muy por debajo del límite de 100 MB por fichero de GitHub. Si en el futuro se acercara a ese límite, habría que dejar de versionar `data/json` o dividir más los ficheros.

Formato de cada línea: `YYYYMMDD HHMMSS;open;high;low;close;volume`.

## Estructura

```
data/raw/<PAR>/        CSV originales de HistData
data/json/<PAR>/       JSON generados (YYYY-MM.json en M1, H1-YYYY.json, D-YYYY.json, index.json)
data/json/pairs.json   pares disponibles
scripts/convert.ts     conversión CSV -> JSON (también copia a public/data, ignorado por git)
src/data/              parseo y carga de datos (caché en memoria)
src/timeframes/        zona NY, agregación y formato de fechas
src/replay/            motor de replay (nunca expone velas futuras)
src/chart/             envoltorio de Lightweight Charts
src/ui/                barra de herramientas y estilos
tests/                 tests Vitest (fixture sintético en tests/fixtures/)
```

Los JSON mensuales son compactos (`[t, o, h, l, c]`). Los H1/D precalculados usan tiempo UTC. Cualquier dibujo futuro debe anclarse a (tiempo UTC, precio), nunca a índices de vela.

## Desarrollo local

```bash
npm install
npm run convert   # genera data/json y public/data a partir de data/raw
npm run dev
npm test
npm run build
```

## Despliegue

`.github/workflows/deploy.yml` ejecuta los tests, la conversión, hace build y despliega en GitHub Pages. En Settings → Pages, selecciona **GitHub Actions** como fuente. `vite.config.ts` usa `base: '/Backtest/'`.
