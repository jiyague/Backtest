# Backtest

Plataforma web de backtesting con replay de velas, basada en [Lightweight Charts](https://github.com/tradingview/lightweight-charts) (TradingView, Apache 2.0), TypeScript y Vite. Interfaz en español, alojada en GitHub Pages (`/Backtest/`).

**Fase 1:** gráfico de velas, datos M1 de HistData, timeframes (M1, M3, M5, M15, H1, H4, D, W, M, 12M), carga bajo demanda por mes y modo replay. Las herramientas de dibujo y la operativa simulada llegarán en fases posteriores.

## Horarios

- **La hora de HistData es EST fija (UTC-5), sin cambio horario.** Los JSON mensuales la conservan tal cual (`tz: "EST-fixed(UTC-5)"`).
- La web la convierte internamente a UTC (hora + 5 h) y **muestra siempre America/New_York** (EST/EDT automático) en el eje, el crosshair y los tooltips.
- Las velas se agrupan con el **cierre de NY a las 17:00** (zona real, respetando EST/EDT): D de 17:00 a 17:00; H4 ancladas a 17, 21, 01, 05, 09 y 13; W abre el domingo a las 17:00; M abre con la primera sesión del mes; 12M por año.
- Los huecos (minutos sin ticks) son normales y **no se rellenan** con velas inventadas.

## Cómo subir datos

1. Descarga de HistData los CSV mensuales en formato NT, M1 (`DAT_NT_EURUSD_M1_202601.csv`).
2. Súbelos con su nombre original a `data/raw/EURUSD/` (Add file → Upload files). El par y el mes se extraen del nombre. No subas el `.txt` de status report.
3. Al hacer push a `main`, GitHub Actions ejecuta la conversión, commitea los JSON generados (si cambian) y despliega.

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
