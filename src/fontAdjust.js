// Diese Funktion wird die Schriftgröße und Zeilenhöhe anpassen
export const adjustFontSize = () => {
  const body = document.querySelector("body");
  if (!body) return;

  // Fallback per Inline-Styles mit hoher Priorität
  body.style.setProperty("font-size", "20px", "important");
  body.style.setProperty("line-height", "1.6", "important");

  const textElements = document.querySelectorAll("p, li, a, span, div");
  textElements.forEach((el) => {
    el.style.setProperty("font-size", "20px", "important");
    el.style.setProperty("line-height", "1.6", "important");
  });
};
  
