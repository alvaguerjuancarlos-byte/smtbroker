// Spike técnico — Prospección de Brokers (Etapa 1, ingesta AMPI)
// Ver SMTBROKER_Spike_AMPI_Monterrey_V1.docx, Sección 6 "Próximo Paso": el spike estático
// (fetch simple) confirmó que ampimty.com/socios NO sirve el listado de socios en el HTML
// inicial — es una SPA (Vuexy/Vue) que lo carga después vía JavaScript. Este script usa un
// navegador headless real para ver qué pide la página después de cargar: si hay un endpoint de
// datos (JSON) reutilizable → Go limpio/condicionado; si no aparece nada → scraping de DOM
// (peor caso) o No-go.
//
// Diagnóstico de UNA sola corrida — no es ingesta recurrente, no contacta a nadie, no guarda
// nada en prospectos_broker. Reusa la misma lógica para IRCNL (RPP) pasando otra URL como
// argumento (ver HANDOFF_Catastro_Input_Output.md, Sección 8):
//   node scripts/spike-ampi-headless-check.js https://visor.ircnl.gob.mx
//
// Antes de automatizar cualquier consulta REAL (más allá de este diagnóstico puntual): revisar
// a mano los términos de uso del sitio — ampimty.com no tiene robots.txt propio (confirmado:
// /robots.txt devuelve el mismo shell de la SPA, no un archivo de texto real).

const puppeteer = require('puppeteer')

const TARGET_URL = process.argv[2] || 'https://ampimty.com/socios'

async function main() {
  console.log(`Spike headless check — objetivo: ${TARGET_URL}\n`)

  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()
  await page.setUserAgent('Mozilla/5.0 (compatible; SMTBROKER-spike/1.0; diagnostico puntual, no recurrente)')

  const peticionesJson = []
  page.on('response', async (response) => {
    const contentType = response.headers()['content-type'] || ''
    if (!contentType.includes('json')) return
    let bodySnippet = null
    try {
      bodySnippet = (await response.text()).slice(0, 300)
    } catch {
      // respuesta no legible como texto (binaria/streaming) — se reporta sin cuerpo
    }
    peticionesJson.push({ url: response.url(), status: response.status(), contentType, bodySnippet })
  })

  console.log('Navegando y esperando a que la red se estabilice...')
  try {
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 30000 })
  } catch (e) {
    console.error(`Error al cargar la página: ${e.message}`)
    await browser.close()
    process.exit(1)
  }

  // Margen extra por si el listado carga con retraso tras networkidle2 (debounce, paginación
  // client-side disparada por scroll, etc.)
  await new Promise((r) => setTimeout(r, 3000))

  const diagnostico = await page.evaluate(() => {
    const html = document.documentElement.innerHTML.toLowerCase()
    return {
      captcha: html.includes('captcha') || html.includes('recaptcha') || html.includes('hcaptcha'),
      requiereLogin: html.includes('iniciar sesión') || html.includes('login') || html.includes('acceso restringido'),
      textoVisible: document.body.innerText.trim().slice(0, 500),
    }
  })

  await browser.close()

  console.log('\n=== RESULTADO ===')
  console.log(`Peticiones JSON detectadas tras cargar la página: ${peticionesJson.length}`)
  peticionesJson.forEach((p, i) => {
    console.log(`\n[${i + 1}] ${p.status} ${p.url}`)
    console.log(`    content-type: ${p.contentType}`)
    if (p.bodySnippet) console.log(`    body (primeros 300 chars): ${p.bodySnippet}`)
  })
  console.log(`\n¿Señal de captcha en el HTML final? ${diagnostico.captcha ? 'SÍ' : 'no'}`)
  console.log(`¿Señal de requerir login? ${diagnostico.requiereLogin ? 'SÍ' : 'no'}`)
  console.log(`\nTexto visible en la página tras cargar (primeros 500 chars):\n${diagnostico.textoVisible || '(vacío — nada renderizó como texto)'}`)

  console.log('\n=== CRITERIO DE DECISIÓN (ver spike doc, Sección 4) ===')
  if (peticionesJson.length > 0 && !diagnostico.captcha && !diagnostico.requiereLogin) {
    console.log('→ Candidato a "Go limpio/condicionado": hay endpoint(s) JSON, sin captcha ni login detectado.')
    console.log('  Falta confirmar a mano: términos de uso del sitio, estabilidad del endpoint, paginación.')
  } else if (diagnostico.requiereLogin) {
    console.log('→ Candidato a "No-go": señal de que el contenido requiere autenticación de socio.')
  } else if (peticionesJson.length === 0) {
    console.log('→ No se detectó ningún endpoint JSON — revisar manualmente si el dato carga por otra vía')
    console.log('  (WebSocket, HTML inyectado sin JSON, etc.) antes de descartar. Peor caso: scraping de DOM.')
  }
  console.log('\nEste script NO decide por sí solo — el resultado alimenta la decisión manual de la Sección 4')
  console.log('del spike doc. Revisar también robots.txt/términos de uso antes de automatizar consultas reales.')
}

main()
