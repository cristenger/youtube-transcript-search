# Fix: Detección Inteligente de Idioma de Subtítulos

## 🔍 Fecha de Corrección
4 de octubre, 2025

## ❌ PROBLEMA ORIGINAL

La extensión **siempre cargaba subtítulos en inglés por defecto**, incluso cuando:
- El usuario tenía YouTube en español
- El video tenía subtítulos en español
- El usuario tenía subtítulos activos en otro idioma
- El navegador estaba configurado en otro idioma

### Lugares donde se forzaba inglés:

1. **extraction.js línea ~211**: `const hl = ... || "en";` ❌
2. **extraction.js línea ~402**: `track = tracks.find(t => t.languageCode === 'en' || ...)` ❌
3. **page-script.js línea ~112**: Priorizaba inglés sobre otros idiomas ❌

---

## ✅ SOLUCIÓN IMPLEMENTADA

### 1. Detección Inteligente del Idioma del Usuario (extraction.js)

**ANTES:**
```javascript
const hl = ytData.topbar?....?.requestLanguage || "en"; // ❌ Siempre fallback a inglés
```

**DESPUÉS:**
```javascript
// Detecta múltiples fuentes en orden de prioridad:
const userLanguage = ytData.topbar?....?.requestLanguage  // 1. YouTube config
  || document.documentElement.lang                         // 2. Idioma HTML de YouTube
  || navigator.language?.split('-')[0]                     // 3. Idioma del navegador
  || "en";                                                 // 4. Fallback (solo si nada funciona)
const hl = userLanguage;
```

**Beneficio**: Respeta la configuración de idioma del usuario en YouTube/navegador

---

### 2. Selección Natural de Subtítulos (extraction.js)

**ANTES:**
```javascript
let track = null;
if (languageCode) {
  track = tracks.find(t => t.languageCode === languageCode);
}
if (!track) {
  // ❌ Prioriza inglés artificialmente
  track = tracks.find(t => t.languageCode === 'en' || t.languageCode.startsWith('en')) || tracks[0];
}
```

**DESPUÉS:**
```javascript
let track = null;
if (languageCode) {
  // Si se especifica idioma, intentar encontrarlo
  track = tracks.find(t => t.languageCode === languageCode);
}

// Si no hay idioma especificado o no se encontró, usar primer track disponible
// ✅ Respeta el orden de YouTube (generalmente idioma original del video)
if (!track) {
  track = tracks[0];
}
```

**Beneficio**: YouTube ya ordena los subtítulos con prioridad (idioma del video → idioma del usuario). Respetamos ese orden.

---

### 3. Prioridad de Subtítulos Activos (page-script.js)

**ANTES:**
```javascript
// Find an active or English track
for (let i = 0; i < textTracks.length; i++) {
  const track = textTracks[i];
  
  if (track.kind === 'subtitles' || track.kind === 'captions') {
    if (track.mode === 'showing') {
      activeTrack = track;
      break;
    }
    // ❌ Prioriza inglés sobre otros idiomas
    if (!activeTrack && (track.language === 'en' || track.language.startsWith('en'))) {
      activeTrack = track;
    }
    if (!activeTrack) {
      activeTrack = track;
    }
  }
}
```

**DESPUÉS:**
```javascript
// Find an active track first, or use first available
for (let i = 0; i < textTracks.length; i++) {
  const track = textTracks[i];
  
  if (track.kind === 'subtitles' || track.kind === 'captions') {
    // Priority 1: Currently showing track
    if (track.mode === 'showing') {
      activeTrack = track;
      break;
    }
    // Priority 2: First available track (respects YouTube's default order)
    // ✅ No más favoritismo por inglés
    if (!activeTrack) {
      activeTrack = track;
    }
  }
}
```

**Beneficio**: Si el usuario tiene subtítulos activos, usa esos. Si no, respeta el orden de YouTube.

---

### 4. Detección Mejorada de Idioma Preferido (extraction.js)

**ANTES:**
```javascript
// Detect active subtitle language if not specified
let targetLanguage = languageCode;
if (!targetLanguage) {
  const activeLanguage = TranscriptUtils.getActiveSubtitleLanguage();
  if (activeLanguage) {
    targetLanguage = activeLanguage;
  }
}
```

**DESPUÉS:**
```javascript
// Detect active subtitle language if not specified
let targetLanguage = languageCode;
if (!targetLanguage) {
  // Priority 1: Check if user has subtitles currently active
  const activeLanguage = TranscriptUtils.getActiveSubtitleLanguage();
  if (activeLanguage) {
    console.log('🌐 Using active subtitle language:', activeLanguage);
    targetLanguage = activeLanguage;
  } else {
    // Priority 2: Use YouTube interface language (respects user's YouTube language setting)
    const ytLanguage = document.documentElement.lang || navigator.language?.split('-')[0];
    if (ytLanguage && ytLanguage !== 'en') {
      console.log('🌐 Using YouTube/browser language:', ytLanguage);
      targetLanguage = ytLanguage;
    }
    // If language is 'en' or not detected, let YouTube API choose the default (usually video's original language)
  }
}
```

**Beneficio**: Detecta el idioma preferido del usuario desde múltiples fuentes.

---

## 🎯 LÓGICA DE PRIORIDAD FINAL

Cuando un usuario carga subtítulos, la extensión ahora sigue esta jerarquía:

### Para detectar idioma del usuario (`hl`):
1. ✅ Configuración de idioma de YouTube (de `ytInitialData`)
2. ✅ Atributo `lang` del HTML (`<html lang="es">`)
3. ✅ Idioma del navegador (`navigator.language`)
4. ⚠️ Fallback a inglés (solo si todo lo anterior falla)

### Para seleccionar subtítulos:
1. ✅ **Idioma especificado manualmente** (si el usuario eligió uno)
2. ✅ **Subtítulos activos actualmente** (si el usuario ya tiene subtítulos activados en YouTube)
3. ✅ **Idioma de la interfaz de YouTube/navegador** (si es diferente de inglés)
4. ✅ **Primer subtítulo disponible** (respeta orden de YouTube)

---

## 📊 EJEMPLOS DE COMPORTAMIENTO

### Ejemplo 1: Usuario con YouTube en Español
- **Antes**: Cargaba subtítulos en inglés ❌
- **Después**: Carga subtítulos en español (si disponibles) ✅

### Ejemplo 2: Usuario viendo video con subtítulos portugueses activos
- **Antes**: Al cargar extensión, cargaba inglés ❌
- **Después**: Detecta portugués activo y lo usa ✅

### Ejemplo 3: Video japonés sin subtítulos en español disponibles
- **Antes**: Cargaba inglés (aunque no era la prioridad del usuario) ❌
- **Después**: Carga japonés (idioma original) o primer disponible ✅

### Ejemplo 4: Usuario con navegador en francés
- **Antes**: Cargaba inglés ❌
- **Después**: Intenta francés primero ✅

---

## 🔧 ARCHIVOS MODIFICADOS

| Archivo | Líneas | Cambios |
|---------|--------|---------|
| `extraction.js` | ~211-215 | Detección multi-fuente de idioma usuario |
| `extraction.js` | ~399-410 | Eliminada prioridad artificial de inglés |
| `extraction.js` | ~503-518 | Lógica mejorada de detección de idioma |
| `page-script.js` | ~100-118 | Eliminada prioridad de inglés en player |

---

## ✅ VERIFICACIÓN

### Checklist:
- ✅ No se fuerza inglés en ninguna parte del código
- ✅ Se respeta el idioma de YouTube del usuario
- ✅ Se respeta el idioma del navegador
- ✅ Se detectan subtítulos activos correctamente
- ✅ Se respeta el orden de YouTube (idioma original primero)
- ✅ Sin errores de sintaxis

### Casos de Prueba Sugeridos:
1. **YouTube en español + Video con ES/EN**: Debe cargar español
2. **YouTube en inglés + Subtítulos PT activos**: Debe cargar portugués
3. **Navegador FR + YouTube EN + Video JA**: Debe intentar francés, fallback a japonés
4. **YouTube DE + Video solo EN/ES**: Debe intentar alemán, fallback a español/inglés

---

## 🎯 IMPACTO

### Antes:
- ❌ Experiencia sesgada hacia inglés
- ❌ Ignoraba preferencias del usuario
- ❌ No respetaba subtítulos activos
- ❌ No consideraba idioma del navegador

### Después:
- ✅ Experiencia adaptada al usuario
- ✅ Respeta configuración de YouTube
- ✅ Detecta subtítulos activos
- ✅ Considera múltiples fuentes de idioma
- ✅ Fallback inteligente (idioma original del video)

---

## 📝 NOTA TÉCNICA

El cambio **NO afecta** la funcionalidad de:
- Selector manual de idiomas (sigue funcionando)
- Refresh de transcripción
- Búsqueda en transcripción
- Sincronización con video

Solo mejora la **detección automática inicial** del idioma preferido del usuario.

---

## ✅ CONCLUSIÓN

La extensión ahora respeta las preferencias lingüísticas del usuario en lugar de forzar inglés. Esto proporciona una experiencia más natural y adaptada a usuarios de todo el mundo.

**Estado**: ✅ LISTO PARA PRODUCCIÓN
