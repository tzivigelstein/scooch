# हिन्दी (`src/copy/hi.ts`)

Hindi in Devanagari, in the plain, friendly register of everyday Indian apps,
with the English loanwords those apps use (PDF, ज़ूम, प्रोजेक्ट, शीट, फ़ाइल,
क्रॉप). Same rules as the Spanish guide ([../copy.md](../copy.md)) where they
apply. **Needs a review by a native speaker**, more than any other language
here.

## Conventions

- Polite imperative (आप form): जोड़ें, हटाएं, चुनें, घुमाएं. Results in the
  past passive: «{n} आइटम हटाए गए», «{name} हटाया गया».
- A sentence ends with । (`meta.period`); a single sentence has none. Commas
  and colons as in English; curly quotes “ ” for names.
- Plurals: `one` is 0 and 1, so its form says {n}, never a written 1, and
  the verb agrees: «{n} आइटम जोड़ा गया» / «{n} आइटम जोड़े गए». आइटम and शीट
  don't change in the plural after a number; फ़ाइल → फ़ाइलें, कॉपी → कॉपियां.
- Numbers in Latin digits, decimal point («2.5 cm»), no space before %, a
  no-break space between a number and its unit («10 mm»).
- Nukta letters (ज़, फ़, ड़) as Unicode normalizes them (NFC: letter + ़).
- Keys as printed (Ctrl, Shift, Enter, Space, Delete, Esc, Page Up); mouse
  actions क्लिक, डबल क्लिक, खींचें, व्हील.
- Photo sizes in inches («4 × 6 इंच»), as Indian photo studios name them.
- Compact fields: X and Y stay; चौ (चौड़ाई) and ऊं (ऊंचाई) for width and
  height.

## Glossary

| Spanish | हिन्दी | Avoid |
| --- | --- | --- |
| pieza | आइटम | तत्व, वस्तु |
| hoja | शीट (plural शीटें) | पेज (only a PDF's page: पेज 3), पन्ना |
| papel | कागज़ | — |
| proyecto | प्रोजेक्ट | परियोजना, दस्तावेज़ |
| acomodar | व्यवस्थित करें | सजाएं, जमाएं |
| distribución (section) | लेआउट | व्यवस्था |
| separación | अंतराल | गैप |
| margen | मार्जिन | हाशिया |
| área útil | प्रिंट होने वाला हिस्सा | सुरक्षित क्षेत्र |
| rotar / rotación automática | घुमाएं / अपने-आप घुमाएं | मोड़ें |
| recortar | क्रॉप करें | काटें (that is cut to the clipboard) |
| líneas de corte | कटिंग लाइनें | गाइड |
| esquinas / contorno / silueta | कोने / आउटलाइन / कंटूर | — |
| margen de corte | कटिंग मार्जिन | ब्लीड |
| grilla / imán | ग्रिड / ग्रिड पर स्नैप करें | चुंबक |
| duplicar / copias | डुप्लिकेट करें / कॉपियां | — |
| copiar / cortar / pegar | कॉपी करें / काटें / चिपकाएं | — |
| quitar | हटाएं | मिटाएं (that is for projects) |
| eliminar (proyecto) | मिटाएं | हटाएं |
| agregar | जोड़ें | अपलोड करें |
| agrandar / reducir | बड़ा करें / छोटा करें | — |
| escala / zoom | स्केल / ज़ूम | — |
| alinear / distribuir | संरेखित करें / वितरित करें | — |
| horizontal / vertical | क्षैतिज / लंबवत | आड़ा, खड़ा (only as search words) |
| repartir parejo | बराबर दूरी पर रखें | — |
| ajustar a la hoja | शीट में फ़िट करें | — |
| deshacer / rehacer | पहले जैसा करें / फिर से करें | पूर्ववत करें |
| aviso | सूचना | नोटिफ़िकेशन |
| consejo | सलाह («इस्तेमाल की सलाह»; before printing: «सलाह») | टिप, सुझाव |
| barra de acciones | कार्रवाई बार | टूलबार |
| propiedades | गुण | प्रॉपर्टी |
| preferencias | प्राथमिकताएं | सेटिंग (a search word) |
| tema | थीम: अपने-आप, हल्की, गहरी | — |
| aportar | सहयोग करें | दान करें |
| personalizado | कस्टम | — |
| código QR | QR कोड | बारकोड |
| contenido / texto debajo | सामग्री / नीचे का टेक्स्ट | — |
| puntos / ojos (de un código QR) | बिंदु / आंखें | मॉड्यूल |
| logo | लोगो | — |
