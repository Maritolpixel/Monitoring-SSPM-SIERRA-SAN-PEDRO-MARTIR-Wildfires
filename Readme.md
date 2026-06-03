# Automated Wildfire Burn Severity Monitoring System: Sierra de San Pedro Martir

An automated, cloud-computed workflow developed in **Google Earth Engine (GEE)** using the JavaScript API. This system integrates real-time thermal anomaly detection with high-resolution satellite imagery to assess post-fire burn severity within the official boundaries of the **Sierra de San Pedro Martir National Park (Baja California, Mexico)**.

---

##  Project Overview

Wildfires represent an escalating ecological threat to the endemic conifer forests of Baja California. While national platforms like **SATIF (CONABIO)** provide excellent active fire monitoring via coarse thermal sensors, they lack automated, localized tools to quantify post-fire ecosystem damage.

This project bridges that gap by deploying a fully automated pipeline that:
1. Detects live fire clusters using thermal anomalies.
2. Composes cloud-free pre- and post-fire imagery using a dynamic temporal baseline.
3. Quantifies total canopy and understory displacement in hectares using standardized ecological indices.

---

##  Methodology & Analytical Framework

The script operates dynamically, capturing the current execution date and automatically generating a 30-day monitoring window. To eliminate seasonal phenological bias (distinguishing drought or natural deciduous transitions from actual fire damage), the system automatically builds a baseline from the exact same calendar window of the previous year.

### 1. Pre-Processing & Cloud Masking
Data is sourced from **Copernicus Sentinel-2 (L2A) Surface Reflectance**. A QA60-band bitwise mask is applied to remove clouds and cirrus interference before generating median mosaics clipped to the park's official polygon (sourced from the *World Database on Protected Areas - WDPA*).

### 2. Spectral Indices & Burn Severity
The **Normalized Burn Ratio (NBR)** is computed for both periods, leveraging the Near-Infrared (NIR - Band 8) to capture healthy canopy structure, and the Shortwave Infrared (SWIR2 - Band 12) to detect water loss and bare soil:

$$NBR = \frac{NIR - SWIR}{NIR + SWIR}$$

The definitive environmental degradation is calculated through the **Delta NBR (dNBR)**:

$$dNBR = NBR_{prefire} - NBR_{postfire}$$

---

##  Quantitative Results (Real Script Execution)

The system automatically groups pixel dimensions using a spatial reducer (`ee.Reducer.sum()`) at a native 20-meter resolution. The latest evaluation computed a total affected footprint of **1,971.96 hectares** distributed across the following USGS severity tiers:

| USGS Severity Class | Color Code | Calculated Area ($m^2$) | Hectares (ha) | Ecological Interpretation |
| :--- | :--- | :--- | :--- | :--- |
| **1 - Low Severity** | Green | 13,842,668.82 | **1,384.27 ha** | Surface fire; understory and leaf litter consumption. |
| **2 - Moderate-Low** | Yellow | 4,088,408.41 | **408.84 ha** | Shrubland displacement; low canopy scorch. |
| **3 - Moderate-High** | Red | 1,611,728.51 | **161.17 ha** | Significant charring and foliage loss in conifer crowns. |
| **4 - High Severity** | Brown | 176,807.48 | **17.68 ha** | Severe canopy consumption; stand-replacing damage. |
| **TOTAL AFFECTED AREA** | :/ | **19,719,613.22** | **1,971.96 ha** | **Total forest matrix under fire-induced stress.** |

>  **Technical Distinction vs. SATIF:** While hotspot platforms flagged active thermal points in the periphery of the park, this workflow successfully isolated and mapped the physical scar, validating that **17.68 hectares suffered catastrophic canopy loss**, requiring targeted restoration strategies.

---

##  Tech Stack & Data Sources

* **Platform:** Google Earth Engine (GEE) API
* **Language:** JavaScript
* **Constellations:** Copernicus Sentinel-2 (MSI) & Suomi NPP / VIIRS (FIRMS)
* **Vector Baseline:** UNEP-WCMC World Database on Protected Areas (WDPA)

---

##  How to Use

1. Navigate to the `src/` directory and copy the contents of `sspm_fire_monitor.js`.
2. Paste the code into the [Google Earth Engine Code Editor](https://code.earthengine.google.com/).
3. Click **Run**.
4. Inspect the interactive layers (`Clasificacion de Severidad dNBR`) and read the automatically formatted area statistics directly from the **Console** tab.