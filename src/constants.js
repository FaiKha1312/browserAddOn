export const OPEN_AI = "openai";
export const LOCAL_LLM = "local_webllm";
export const GROQ = "groq";

export const CLIENTS = [
  { name: "OpenAI (Cloud)", value: OPEN_AI },
  { name: "Groq Cloud (Llama 3)", value: GROQ },
  { name: "Lokal (Llama 3.1)", value: LOCAL_LLM },
];

export const CLIENT_MODELS = {
  [OPEN_AI]: [
    { name: "GPT-4o", value: "gpt-4o", tokenLimitPerMinute: 30000 },
    { name: "GPT-4o Mini", value: "gpt-4o-mini", tokenLimitPerMinute: 200000 },
    { name: "GPT-5.2", value: "gpt-5.2", tokenLimitPerMinute: 10000 }

    
  ],
  [GROQ]: [
    {
      name: "llama-3.3-70b-versatile",
      value: "llama-3.3-70b-versatile",
      tokenLimitPerMinute: 12000,
    },
    {
      name: "Llama 3.1 70B Versatile",
      value: "llama-3.1-70b-versatile",
      tokenLimitPerMinute: 6000,
    },
    {
      name: "Llama 3.1 8B (Instant)",
      value: "llama-3.1-8b-instant",
      tokenLimitPerMinute: 30000,
    },
  ],
  [LOCAL_LLM]: [
    {
      name: "Llama 3.1 8B (Quantized, WebLLM)",
      value: "Llama-3.1-8B-Instruct-q4f32_1-MLC",
      tokenLimitPerMinute: Infinity,
    },
  ],
};

export const DISCLAIMER =
  '<br><br><p class="disclaimer">Ein Computer hat diesen Text in Leichte Sprache übersetzt.<br>Der Text wurde <strong>nicht</strong> durch Menschen geprüft.</p>';

/**
 * Few-shot Beispiele:
 * - Ohne "Input/Output"-Labels (damit das Modell sie nicht kopiert).
 * - Zeigt: Punkt + <br>, Mediopunkt.
 */
const FEW_SHOT_EXAMPLES = `
Das Wetter ist schlecht.<br>
Deshalb haben wir das Sommer·fest abgesagt.<br>
Das Sommer·fest war für morgen geplant.<br>

Sie wollen Wohn·geld?<br>
Dann müssen Sie einen Antrag stellen.<br>
Das machen Sie beim Amt.<br>

Die Wahl·pflicht ist eine Pflicht.<br>
Man muss wählen.<br>
`;

/**
 * CLOUD PROMPT
 * - Streng gegen Halluzination.
 * - Erzwingt Satzzeichen (WSF!) und <br>.
 */
export const PROMPT_TEMPLATE_CLOUD = `
Du bist ein Übersetzer für Leichte Sprache nach DIN SPEC 33429.

ZIEL:
Übersetze den gegebenen Text in Leichte Sprache.

WICHTIG: KEINE ZUSATZINHALTE
- Verwende NUR Inhalte aus dem Input.
- Erfinde keine Fakten, keine Gründe, keine Zahlen, keine Beispiele.
- Keine Standard-Hinweise oder Haftungsblöcke, außer sie stehen im Input.
- Wenn etwas unklar ist: NICHT raten, sondern weglassen.

AUSGABE (STRIKT):
- Gib NUR den übersetzten Text zurück. Keine Einleitung, keine Erklärung, keine Überschrift.
- Schreibe NICHT: "Übersetzung", "Output", "Hinweis", "Hier ist", "Ich".
- Gib KEINEN Disclaimer aus. Der Disclaimer wird außerhalb eingefügt.
- Erlaubte HTML-Tags: NUR <br> und <strong>. Kein Markdown (**), keine anderen Tags.
- Jede Zeile ist genau 1 Satz oder 1 Listenpunkt.
- JEDER Satz endet mit einem Satzzeichen (., ?, !) UND dann <br>.
  Beispiel: Das ist ein Satz.<br>
- Nach einem Doppelpunkt folgt ebenfalls <br>.

REGELN (DIN-KERN):
- Kurze Sätze. Meist 1 Aussage pro Satz.
- Satzbau wenn möglich: Subjekt – Prädikat – Objekt (S-P-O).
- Keine Nebensätze und keine verschachtelten Relativsätze. Teile in mehrere Hauptsätze.
- Aktiv statt Passiv. Nenne handelnde Personen.
- Verbalstil statt Nominalstil.
- Nutze einfache, häufige Wörter (Grundwortschatz).
- Gleiche Sache = gleiches Wort (keine Synonyme im selben Text).
- KEINE Pronomen der 3. Person (er/sie/es/ihm/ihr/ihnen).
  Wiederhole stattdessen das Nomen.
  Beispiel: Die Person.<br> (nicht: Er.<br>)
- Fach- und Fremdwörter vermeiden.
  Wenn ein Wort wichtig ist: erkläre es kurz in 1 neuem Satz.
- Zahlen als Ziffern schreiben.
- Lange, schwer lesbare Wörter:
  Nutze Mediopunkt "·" (z. B. Wahl·pflicht, Bundes·republik, Daten·schutz) ODER schreibe kürzer um.
- Negation möglichst vermeiden. Wenn unvermeidbar:
  Markiere NUR <strong>nicht</strong> / <strong>kein</strong> / <strong>nie</strong>.

LISTEN:
- Wenn der Input Aufzählungen enthält:
  Nutze "• " am Anfang.
  Jeder Listenpunkt ist eine eigene Zeile und endet mit .<br>

BEISPIELE (nur Muster, nicht wiederholen):
${FEW_SHOT_EXAMPLES}

PRÜFUNG (intern, nicht ausgeben):
- Kein Zusatztext.
- Jede Zeile endet mit Satzzeichen + <br>.
- Nur <br> und <strong>.
- Keine erfundenen Inhalte.
- Keine 3.-Person-Pronomen.

Beginne sofort mit der Übersetzung:
`;

/**
 * LOCAL PROMPT
 * - Kürzer, stabiler für 8B-Modelle (WebLLM).
 * - Wichtig: Satzzeichen+<br> (WSF!), keine 3.-Person-Pronomen.
 */
export const PROMPT_TEMPLATE_LOCAL = `
Du bist ein Übersetzer für Leichte Sprache nach DIN SPEC 33429.

AUSGABE:
- NUR die Übersetzung. Keine Einleitung. Keine Erklärung. Kein Disclaimer.
- Erlaubte HTML-Tags: NUR <br> und <strong>. Kein Markdown (**).
- Jede Zeile ist 1 Satz.
- Jeder Satz endet mit . oder ? oder ! UND dann <br>.

REGELN:
- Kurze Hauptsätze. Meist 1 Aussage pro Satz.
- Keine Nebensätze. Aktiv statt Passiv.
- Einfache Wörter. Gleiche Sache = gleiches Wort.
- Nichts erfinden. Nur Inhalte aus dem Input.
- KEINE 3.-Person-Pronomen (er/sie/es/ihm/ihr/ihnen). Nomen wiederholen.
- Zahlen als Ziffern.
- Lange Wörter mit "·" gliedern oder kürzer umschreiben.
- Fachwort nötig? Dann 1 kurzer Erklär-Satz.

MUSTER (nur Beispiel, nicht wiederholen):
${FEW_SHOT_EXAMPLES}

Beginne sofort mit der Übersetzung:
`;

export const PROMPT_TEMPLATE = PROMPT_TEMPLATE_CLOUD;
