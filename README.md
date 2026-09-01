# 🔥 Post-Fire Burn Severity Mapping in Sierra de San Pedro Mártir

**Reproducible dNBR / RdNBR burn-severity assessment for Mexican protected areas, built on Google Earth Engine.**
Case study: the **23 March 2026 wildfire** in Sierra de San Pedro Mártir National Park (Baja California, Mexico).

![Google Earth Engine](https://img.shields.io/badge/Google%20Earth%20Engine-JavaScript%20API-4285F4?logo=google-earth&logoColor=white)
![Sentinel-2](https://img.shields.io/badge/Sentinel--2-L2A%20Harmonized-2E7D32)
![Cloud Score+](https://img.shields.io/badge/Cloud%20Score%2B-cs__cdf%20%E2%89%A5%200.60-0288D1)
![FIRMS](https://img.shields.io/badge/NASA%20FIRMS-MODIS%20hotspots-E65100)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

<!-- Add the exported map here (see assets/README.md) -->
<!-- ![Burn severity map, Mesa El Berreal scar](assets/hero_severity_map.png) -->

---

## Why this matters

Sierra de San Pedro Mártir holds the last large conifer forest of the Baja California peninsula and endemic species found nowhere else. Mexico's national fire platforms (SATIF / CONABIO, CONAFOR daily reports) are excellent at **detecting** active fires, but they do not publish a pixel-level, reproducible estimate of **how badly** each hectare burned once the fire is out.

This repository fills that gap with a single script that any analyst can run in the free GEE Code Editor to obtain:

- a **burn perimeter** derived from satellite data, not hand-drawn;
- **severity classes** (low → high) for every 20 m pixel inside that perimeter;
- **area per class in hectares** and a direct comparison with the official figure;
- GeoTIFF, GeoJSON and CSV **exports** ready for QGIS, ArcGIS or a report.

## The 2026 fire in numbers

| Item | Value | Source |
| --- | --- | --- |
| Ignition | 23 March 2026, Mesa El Berreal (Ensenada / San Quintín boundary) | CONAFOR via [El Imparcial](https://www.elimparcial.com/tij/ensenada/2026/03/26/incendio-forestal-consume-900-hectareas-en-la-sierra-de-san-pedro-martir/) |
| Control | 95 % on 27 March 2026 | [El Imparcial](https://www.elimparcial.com/tij/ensenada/2026/03/27/incendio-en-la-sierra-de-san-pedro-martir-alcanza-95-de-control/) |
| Official affected area | ~900 ha total, **~300 ha inside the National Park** | CONAFOR / CONANP |
| Satellite estimate (this script) | *fill in after running: perimeter ha and % difference are printed in the Console* | `src/sspm_fire_monitor.js` |

> A second event, the **Cañón El Copal fire (29 June – 10 July 2026, ~80 ha)**, is preconfigured as a commented example inside the script. Switch the CONFIG block and re-run to map it.

## How it works

```
WDPA polygon ──► Sentinel-2 L2A + Cloud Score+ ──► NBR pre / NBR post
                                                      │
FIRMS hotspots (event window) ──► search buffer ──► dNBR & RdNBR
                                                      │
                                   candidate pixels ──► min. mapping unit ──► PERIMETER
                                                      │
                                     severity classes ──► ha per class ──► exports
```

1. **Area of interest.** The park boundary is pulled from the World Database on Protected Areas (WDPA), by name or by `WDPAID`, so the same script works for any Mexican ANP.
2. **Cloud-free composites.** Sentinel-2 Surface Reflectance is masked with **Cloud Score+** (`cs_cdf ≥ 0.60`) instead of the coarse QA60 bits, plus an NDSI snow mask for the high-elevation plateau. Medians are built for a **fixed pre-fire window** (10 Feb – 22 Mar 2026) and a **fixed post-fire window** (5 Apr – 10 May 2026), so results are identical every time the script runs.
3. **Indices.**
   `NBR = (NIR − SWIR2) / (NIR + SWIR2)` using bands B8 and B12
   `dNBR = NBR_pre − NBR_post`
   `RdNBR = dNBR / √|NBR_pre|` (×1000), which corrects for sparse pre-fire vegetation typical of chaparral.
4. **Perimeter from data, not from thresholds alone.** MODIS **FIRMS** detections during the event define a 1.5 km search zone; inside it, pixels with dNBR ≥ 0.10 are smoothed and filtered by a **1 ha minimum mapping unit** (25 px) before being vectorised. This removes phenology noise and isolated false positives that inflated earlier estimates.
5. **Severity classes.** dNBR breaks 0.10 / 0.27 / 0.44 / 0.66 (Key & Benson 2006) and RdNBR breaks 69 / 316 / 641 (Miller & Thode 2007). Both are reported so the reader can see how sensitive the result is to the chosen index.
6. **Validation.** The script prints the mapped perimeter in hectares and its percentage difference against the official figure stored in `CONFIG.officialHa`.

## Results table (v2)

Run the script and paste the Console output here.

| Severity class | dNBR range | dNBR (ha) | RdNBR (ha) |
| --- | --- | --- | --- |
| 1 · Low | 0.10 – 0.27 | | |
| 2 · Moderate-low | 0.27 – 0.44 | | |
| 3 · Moderate-high | 0.44 – 0.66 | | |
| 4 · High | ≥ 0.66 | | |
| **Perimeter total** | | | |
| Official (CONAFOR / CONANP) | | **300** | **300** |

<!-- ![Pre vs post SWIR composites](assets/pre_post_swir.png) -->
<!-- ![Derived perimeter vs FIRMS hotspots](assets/perimeter_vs_firms.png) -->

## What changed from v1

The first version (`src/legacy/sspm_fire_monitor_v1.js`) used a rolling 30-day window compared with the same window one year earlier, QA60 cloud masking and no perimeter logic. On the 2026 fire it reported **1,972 ha** of burned area against **~300 ha** official, because it counted every pixel in the park whose NBR dropped year over year, including drought and shadow effects.

| | v1 | v2 (current) |
| --- | --- | --- |
| Time windows | Rolling, changes daily | Fixed dates in `CONFIG`, fully reproducible |
| Cloud mask | QA60 bits | Cloud Score+ `cs_cdf` + NDSI snow mask |
| Indices | dNBR | dNBR **and** RdNBR |
| Burned area | Every pixel above threshold | FIRMS-guided perimeter + 1 ha minimum mapping unit |
| Validation | None | % difference vs official figure |
| Outputs | Console only | GeoTIFF, GeoJSON perimeter, CSV per class |
| Reusability | Hard-coded to SSPM | Any WDPA polygon, any event, by editing `CONFIG` |

## Quick start

1. Open the [Google Earth Engine Code Editor](https://code.earthengine.google.com/) (free account required).
2. Copy the contents of [`src/sspm_fire_monitor.js`](src/sspm_fire_monitor.js) into a new script.
3. Adjust the `CONFIG` block if needed (ANP name or `WDPAID`, event dates, thresholds, official figure).
4. Click **Run**. Layers appear on the map; hectares per class and the validation line appear in the **Console**.
5. Open the **Tasks** tab to launch the four exports to Google Drive.

### Adapting to another fire or protected area

```js
var CONFIG = {
  anpName:   'Sierra de San Pedro Mártir',   // or set wdpaId
  fireStart: '2026-06-28', fireEnd: '2026-07-15',
  preStart:  '2026-05-20', preEnd:  '2026-06-27',
  postStart: '2026-07-20', postEnd: '2026-08-25',
  officialHa: 80,
  exportPrefix: 'SSPM_ElCopal_2026'
  // ...
};
```

Guidelines: keep the pre-fire window in the same season and immediately before ignition; start the post-fire window a week or more after containment so smoke has cleared; for an *extended assessment* (Key & Benson) use the same calendar window one year later.

## Known limitations

- dNBR and RdNBR class breaks were calibrated in US conifer forests. Field plots (Composite Burn Index) are needed to calibrate them for Baja California chaparral and pine–fir stands.
- MODIS FIRMS has a 1 km footprint; small or short fires may leave no hotspot and therefore no search zone. Increase `firmsBufferM` or set the perimeter manually in that case.
- Steep terrain on the eastern escarpment produces shadow artefacts; a topographic correction is on the roadmap.

## Roadmap

- [ ] Publish v2 results and figures for the March 2026 fire
- [ ] Map the Cañón El Copal fire (July 2026)
- [ ] Add VIIRS 375 m hotspots as an alternative to MODIS
- [ ] Topographic correction (SCS+C) for the escarpment
- [ ] GEE App with date pickers for non-technical users

## Data sources

| Dataset | GEE ID | Use |
| --- | --- | --- |
| Sentinel-2 L2A Harmonized | `COPERNICUS/S2_SR_HARMONIZED` | Surface reflectance |
| Cloud Score+ | `GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED` | Cloud / shadow mask |
| FIRMS (MODIS) | `FIRMS` | Active-fire hotspots |
| WDPA polygons | `WCMC/WDPA/current/polygons` | Protected-area boundary |

## References

- Key, C. H., & Benson, N. C. (2006). *Landscape Assessment: Ground measure of severity, the Composite Burn Index; and remote sensing of severity, the Normalized Burn Ratio.* USDA Forest Service, RMRS-GTR-164-CD.
- Miller, J. D., & Thode, A. E. (2007). Quantifying burn severity in a heterogeneous landscape with a relative version of the delta Normalized Burn Ratio (dNBR). *Remote Sensing of Environment*, 109(1), 66–80.
- Pasquarella, V. J., et al. (2023). Comprehensive quality assessment of optical satellite imagery using weakly supervised video learning. *CVPR Workshops* (Cloud Score+).

## Author

**Mario Gómez** · Universidad Autónoma de Baja California
GitHub [@Maritolpixel](https://github.com/Maritolpixel) · related project: [quien-tiene-el-agua](https://github.com/Maritolpixel/quien-tiene-el-agua)

Licensed under the [MIT License](LICENSE).
